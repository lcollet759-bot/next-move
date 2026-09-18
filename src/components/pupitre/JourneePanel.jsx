import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../../context/AppContext'
import { getRoutines } from '../../services/db'
import { todayISO, todayCalendarParts, isTaskInActionQueue } from '../../utils/date'
import { construirePlanJournee, delaiAvantChangement } from '../../utils/planJournee'

// Zone principale du Pupitre : ce qui mérite l'attention aujourd'hui.
// Toute la priorisation vient de utils/planJournee (construirePlanJournee) — aucun algorithme propre ici,
// aucun appel IA : le paragraphe rédigé par l'IA reste sur Aujourd'hui tant que son cache n'est pas porté.
// Cliquer sur une ligne ouvre le dossier (et sa tâche quand l'identifiant est réel) dans Travail actif.

// Une tâche sans id reçoit un identifiant de repli « dossier#rang » dans le plan : il ne désigne aucune
// tâche enregistrée, on ne le transmet jamais au Workspace.
const tacheReelle = (id) => (typeof id === 'string' && id && !id.includes('#') ? id : null)

const formatCourt = new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', day: 'numeric', month: 'short' })
function formatISO(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso ?? '')) return null
  const [year, month, day] = iso.split('-').map(Number)
  return formatCourt.format(new Date(Date.UTC(year, month - 1, day)))
}

// Routines du jour : même règle de récurrence que l'onglet Aujourd'hui
function routinesDuJour(routines) {
  const { dayOfWeek: dow, day: dom } = todayCalendarParts()
  return routines.filter(r => {
    if (r.recurrence === 'daily')   return true
    if (r.recurrence === 'weekly')  return r.jourSemaine === dow
    if (r.recurrence === 'monthly') return r.jourMois    === dom
    return false
  })
}

function Ligne({ item, selected, onOuvrir, complement }) {
  return (
    <button
      type="button"
      className={`jp-ligne${selected ? ' jp-ligne--on' : ''}`}
      onClick={() => onOuvrir(item.dossierId, tacheReelle(item.tacheId))}
    >
      <span className="jp-ligne-corps">
        <span className="jp-ligne-titre">{item.titre || item.dossierTitre}</span>
        <span className="jp-ligne-sous">
          {item.titre ? item.dossierTitre : 'Dossier'}
          {item.organisme && ` · ${item.organisme}`}
        </span>
      </span>
      {complement && <span className="jp-ligne-complement">{complement}</span>}
    </button>
  )
}

function Bloc({ titre, accent, masque, children }) {
  return (
    <section className="jp-bloc">
      <div className="jp-bloc-tete">
        <span className="jp-bloc-trait" style={accent ? { background: accent } : undefined} />
        <h3 className="pp-section-title">{titre}</h3>
      </div>
      <div className="jp-bloc-corps">{children}</div>
      {masque > 0 && <p className="jp-masque">+ {masque} autre{masque > 1 ? 's' : ''} non affiché{masque > 1 ? 's' : ''}</p>}
    </section>
  )
}

export default function JourneePanel({ onOuvrir, selectedId }) {
  const { dossiers, loading, authUser } = useApp()

  // L'heure ne change le plan qu'à des instants précis : un minuteur ciblé, jamais de polling (même règle qu'Aujourd'hui)
  const [tick, setTick] = useState(() => Date.now())
  const plan = useMemo(() => construirePlanJournee(dossiers || []), [dossiers, tick]) // eslint-disable-line
  useEffect(() => {
    const minuteur = setTimeout(() => setTick(Date.now()), delaiAvantChangement(plan))
    return () => clearTimeout(minuteur)
  }, [plan])

  // Routines du jour : coche « fait aujourd'hui » en localStorage daté, jamais en base (comme Aujourd'hui)
  const [routines, setRoutines] = useState([])
  const [routinesFaites, setRoutinesFaites] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`nm-routines-faites-${todayISO()}`)) || [] }
    catch { return [] }
  })
  useEffect(() => {
    if (!authUser) return
    getRoutines(authUser.id).then(r => setRoutines(routinesDuJour(r))).catch(() => {})
  }, [authUser])
  const toggleRoutine = (id) => {
    setRoutinesFaites(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
      try { localStorage.setItem(`nm-routines-faites-${todayISO()}`, JSON.stringify(next)) } catch { /* stockage indisponible */ }
      return next
    })
  }

  // File d'action « Maintenant / Ensuite » : même règle que l'onglet Aujourd'hui
  const fileAction = useMemo(() => {
    const today = todayISO()
    return (dossiers || [])
      .filter(d => d.etat === 'actionnable' && (d.taches || []).some(t => isTaskInActionQueue(t, today)))
      .sort((a, b) => a.quadrant - b.quadrant || (b.updatedAt || '').localeCompare(a.updatedAt || ''))
      .slice(0, 7)
      .flatMap(d => (d.taches || [])
        .filter(t => isTaskInActionQueue(t, today))
        .map(t => ({ dossierId: d.id, dossierTitre: d.titre, organisme: d.organisme || null, tacheId: t.id, titre: t.titre, dureeMin: t.dureeMin })))
  }, [dossiers])

  if (loading) {
    return (
      <div className="jp">
        <div className="jp-entete"><h2 className="jp-titre">Ta journée</h2></div>
        <p className="pp-empty">Chargement…</p>
        <style>{jpCSS}</style>
      </div>
    )
  }

  const { sections, relances, autresAttentes, bloques, masques, charge } = plan
  const maintenant = fileAction[0] || null
  const ensuite    = fileAction.slice(1, 4)
  const enRetard   = [...sections.echeancesDepassees, ...sections.retardsPlanification]
  const aujourdhui = [...sections.echeancesAujourdhui, ...sections.planifieAujourdhui]
  const masqueRetard = masques.echeancesDepassees + masques.retardsPlanification
  const masqueJour   = masques.echeancesAujourdhui + masques.planifieAujourdhui

  const riendAfficher =
    !maintenant && plan.vide && routines.length === 0 && bloques.length === 0 && sections.sansDate.length === 0

  return (
    <div className="jp">
      <div className="jp-entete">
        <h2 className="jp-titre">Ta journée</h2>
        {charge.engagementsDuJour > 0 && (
          <span className="jp-charge">
            {charge.engagementsDuJour} engagement{charge.engagementsDuJour > 1 ? 's' : ''} aujourd’hui
          </span>
        )}
      </div>

      {riendAfficher ? (
        <p className="pp-empty">Rien d’imposé aujourd’hui. Ouvre la Bibliothèque pour choisir un dossier.</p>
      ) : (
        <div className="jp-colonnes">
          <div className="jp-colonne">
            {maintenant && (
              <section className="jp-maintenant">
                <span className="pp-section-title jp-maintenant-label">Maintenant</span>
                <p className="jp-maintenant-titre">{maintenant.titre}</p>
                <p className="jp-maintenant-sous">
                  {maintenant.dossierTitre}{maintenant.organisme && ` · ${maintenant.organisme}`}
                </p>
                <button
                  type="button"
                  className="jp-maintenant-btn"
                  onClick={() => onOuvrir(maintenant.dossierId, tacheReelle(maintenant.tacheId))}
                >
                  Ouvrir dans Travail actif
                </button>
              </section>
            )}

            {ensuite.length > 0 && (
              <Bloc titre="Ensuite">
                {ensuite.map(item => (
                  <Ligne
                    key={`${item.dossierId}-${item.tacheId}`}
                    item={item}
                    selected={item.dossierId === selectedId}
                    onOuvrir={onOuvrir}
                    complement={item.dureeMin ? `${item.dureeMin} min` : null}
                  />
                ))}
              </Bloc>
            )}

            {sections.heuresFixes.length > 0 && (
              <Bloc titre="À l’heure dite" accent="var(--green)" masque={masques.heuresFixes}>
                {sections.heuresFixes.map(item => (
                  <Ligne
                    key={`${item.dossierId}-${item.tacheId}`}
                    item={item}
                    selected={item.dossierId === selectedId}
                    onOuvrir={onOuvrir}
                    complement={item.passee ? `${item.heurePlanifiee} · passée` : item.heurePlanifiee}
                  />
                ))}
              </Bloc>
            )}

            {enRetard.length > 0 && (
              <Bloc titre="En retard" accent="var(--color-accent)" masque={masqueRetard}>
                {enRetard.map(item => (
                  <Ligne
                    key={`${item.dossierId}-${item.tacheId}-r`}
                    item={item}
                    selected={item.dossierId === selectedId}
                    onOuvrir={onOuvrir}
                    complement={formatISO(item.echeance) || formatISO(item.datePlanifiee)}
                  />
                ))}
              </Bloc>
            )}

            {aujourdhui.length > 0 && (
              <Bloc titre="Aujourd’hui" accent="var(--green)" masque={masqueJour}>
                {aujourdhui.map(item => (
                  <Ligne
                    key={`${item.dossierId}-${item.tacheId}-j`}
                    item={item}
                    selected={item.dossierId === selectedId}
                    onOuvrir={onOuvrir}
                    complement={item.echeance ? 'échéance' : null}
                  />
                ))}
              </Bloc>
            )}
          </div>

          <div className="jp-colonne">
            {sections.echeancesProches.length > 0 && (
              <Bloc titre="Cette semaine" masque={masques.echeancesProches}>
                {sections.echeancesProches.map(item => (
                  <Ligne
                    key={`${item.dossierId}-${item.tacheId}-s`}
                    item={item}
                    selected={item.dossierId === selectedId}
                    onOuvrir={onOuvrir}
                    complement={formatISO(item.echeance)}
                  />
                ))}
              </Bloc>
            )}

            {routines.length > 0 && (
              <Bloc titre="Routines du jour">
                {routines.map(r => (
                  <button
                    key={r.id}
                    type="button"
                    className="jp-routine"
                    onClick={() => toggleRoutine(r.id)}
                  >
                    <span className={`jp-routine-case${routinesFaites.includes(r.id) ? ' jp-routine-case--on' : ''}`} />
                    <span className={`jp-routine-titre${routinesFaites.includes(r.id) ? ' jp-routine-faite' : ''}`}>{r.titre}</span>
                    <span className="jp-ligne-complement">{r.dureeMin} min</span>
                  </button>
                ))}
              </Bloc>
            )}

            {relances.length > 0 && (
              <Bloc titre="À relancer" accent="var(--color-accent)" masque={masques.relances}>
                {relances.map(item => (
                  <Ligne
                    key={`${item.dossierId}-relance`}
                    item={{ ...item, titre: null }}
                    selected={item.dossierId === selectedId}
                    onOuvrir={onOuvrir}
                    complement={item.jours !== null ? `${item.jours} j` : null}
                  />
                ))}
                {autresAttentes > 0 && (
                  <p className="jp-masque">{autresAttentes} autre{autresAttentes > 1 ? 's' : ''} en attente de retour</p>
                )}
              </Bloc>
            )}

            {relances.length === 0 && autresAttentes > 0 && (
              <Bloc titre="En attente de retour">
                <p className="jp-masque">{autresAttentes} dossier{autresAttentes > 1 ? 's' : ''} attendent une réponse.</p>
              </Bloc>
            )}

            {bloques.length > 0 && (
              <Bloc titre="Bloqués" accent="var(--red)" masque={masques.bloques}>
                {bloques.map(item => (
                  <Ligne
                    key={`${item.dossierId}-bloque`}
                    item={{ ...item, titre: null }}
                    selected={item.dossierId === selectedId}
                    onOuvrir={onOuvrir}
                    complement={item.tachesEnSuspens > 0 ? `${item.tachesEnSuspens} tâche${item.tachesEnSuspens > 1 ? 's' : ''}` : null}
                  />
                ))}
              </Bloc>
            )}
          </div>
        </div>
      )}

      <style>{jpCSS}</style>
    </div>
  )
}

const jpCSS = `
  .jp {
    min-height: 0;
    overflow-y: auto;
    padding: 26px 30px 34px;
  }
  .jp-entete {
    display: flex;
    align-items: baseline;
    gap: 14px;
    margin-bottom: 22px;
  }
  .jp-titre {
    font-size: 28px;
    font-weight: 300;
    color: var(--text);
    letter-spacing: -0.8px;
  }
  .jp-charge { font-size: 12px; color: var(--text-secondary); }

  .jp-colonnes {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 30px;
    align-items: start;
  }
  @media (max-width: 1250px) {
    .jp-colonnes { grid-template-columns: minmax(0, 1fr); gap: 22px; }
  }
  .jp-colonne { display: flex; flex-direction: column; gap: 24px; min-width: 0; }

  /* ── Maintenant ── */
  .jp-maintenant {
    background: var(--surface);
    border: 0.5px solid var(--border);
    border-left: 3px solid var(--green);
    border-radius: var(--radius);
    padding: 16px 18px;
  }
  .jp-maintenant-label { display: block; color: var(--green); margin-bottom: 8px; }
  .jp-maintenant-titre {
    font-size: 17px;
    font-weight: 700;
    color: var(--text);
    line-height: 1.3;
    letter-spacing: -0.3px;
  }
  .jp-maintenant-sous { font-size: 12px; color: var(--text-secondary); margin-top: 3px; }
  .jp-maintenant-btn {
    margin-top: 12px;
    padding: 8px 16px;
    font-size: 13px;
    font-weight: 700;
    font-family: inherit;
    color: #FFFFFF;
    background: var(--green);
    border: none;
    border-radius: var(--radius-sm);
  }
  .jp-maintenant-btn:hover { background: #152e1f; }

  /* ── Blocs ── */
  .jp-bloc-tete { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
  .jp-bloc-trait { width: 14px; height: 2px; border-radius: 1px; background: var(--border); }
  .jp-bloc-corps { display: flex; flex-direction: column; }
  .jp-masque { font-size: 11px; color: var(--text-muted); padding: 6px 2px 0; }

  .jp-ligne {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    padding: 9px 8px;
    text-align: left;
    background: none;
    border: none;
    border-bottom: 1px solid var(--border-light);
    border-radius: var(--radius-xs);
  }
  .jp-ligne:last-child { border-bottom: none; }
  .jp-ligne:hover { background: var(--border-light); }
  .jp-ligne--on { background: var(--green-light); }
  .jp-ligne-corps { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .jp-ligne-titre {
    font-size: 14px;
    color: var(--text);
    line-height: 1.35;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .jp-ligne-sous {
    font-size: 11px;
    color: var(--text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .jp-ligne-complement {
    flex-shrink: 0;
    font-size: 11px;
    color: var(--text-secondary);
    font-variant-numeric: tabular-nums;
  }

  /* ── Routines ── */
  .jp-routine {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 9px 8px;
    text-align: left;
    background: none;
    border: none;
    border-bottom: 1px solid var(--border-light);
    border-radius: var(--radius-xs);
  }
  .jp-routine:last-child { border-bottom: none; }
  .jp-routine:hover { background: var(--border-light); }
  .jp-routine-case {
    width: 17px;
    height: 17px;
    flex-shrink: 0;
    border: 1.5px solid var(--border);
    border-radius: 5px;
    background: var(--surface);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .jp-routine-case--on { background: var(--green); border-color: var(--green); }
  .jp-routine-case--on::after { content: '✓'; color: #FFFFFF; font-size: 11px; font-weight: 700; line-height: 1; }
  .jp-routine-titre { flex: 1; min-width: 0; font-size: 14px; color: var(--text); }
  .jp-routine-faite { text-decoration: line-through; color: var(--text-secondary); }
`
