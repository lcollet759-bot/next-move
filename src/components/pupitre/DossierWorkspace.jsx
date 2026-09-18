import { useEffect, useRef } from 'react'
import { useDossier } from '../../hooks/useDossier'
import { todayISO, isValidISODate, isValidISOTime } from '../../utils/date'

// Travail actif : le dossier ouvert, en lecture, avec sa tâche repérée quand l'appelant en désigne une.
// Une seule écriture autorisée à ce stade — cocher / décocher une tâche via AppContext (toggleTache).
// Édition des tâches, planification, états, clôture et « Noter » arrivent en D4.
// Les classes partagées (.pp-section-title, .pp-empty) sont définies par Pupitre.jsx.

// Libellés UX (mêmes valeurs que DossierDetail : jamais de statut technique à l'écran)
const ETAT_LABELS = {
  actionnable:     'À traiter',
  attente_externe: "J'attends un retour",
  bloque:          'Bloqué',
  surveille:       "À l'œil",
  clos:            'Terminé',
}
const Q_LABELS = { 1: 'Urgent', 2: 'Important', 3: 'À expédier', 4: 'Plus tard' }
const Q_COLORS = { 1: '#C0392B', 2: '#1C3829', 3: '#B45309', 4: '#B5A898' }
const STATUT_LABELS = { fait: 'Fait', en_attente: 'En attente', bloque: 'Bloqué' }
const STATUT_COLORS = { fait: '#1C3829', en_attente: '#D97706', bloque: '#C4623A' }

// Dates civiles formatées en UTC pour ne jamais décaler d'un jour (même règle que DossierDetail)
const formatLong  = new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' })
const formatCourt = new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' })

function formatISO(iso, formatter) {
  if (!isValidISODate(iso)) return null
  const [year, month, day] = iso.split('-').map(Number)
  return formatter.format(new Date(Date.UTC(year, month - 1, day)))
}

// « 11 sept. 2026 » ou « 11 sept. 2026 · 14:00 » ; null si la tâche n'est pas planifiée
function formatPlanification(tache) {
  const date = formatISO(tache?.datePlanifiee, formatCourt)
  if (!date) return null
  return isValidISOTime(tache.heurePlanifiee) ? `${date} · ${tache.heurePlanifiee}` : date
}

// Jours civils avant l'échéance du dossier (négatif = dépassée)
function joursAvant(iso, referenceISO) {
  if (!isValidISODate(iso)) return null
  const jour = (v) => { const [y, m, d] = v.split('-').map(Number); return Date.UTC(y, m - 1, d) }
  return Math.round((jour(iso) - jour(referenceISO)) / 86_400_000)
}

export default function DossierWorkspace({ dossierId, tacheId }) {
  const { dossier, etapes, isClos, tachesDone, total, pct, toggleTache } = useDossier(dossierId)
  const tacheRef = useRef(null)

  // La tâche désignée n'est mise en avant que si elle existe vraiment dans ce dossier
  const tacheVisee = dossier && tacheId
    ? (Array.isArray(dossier.taches) ? dossier.taches : []).find(t => t.id === tacheId)?.id ?? null
    : null

  useEffect(() => {
    if (tacheVisee) tacheRef.current?.scrollIntoView({ block: 'nearest' })
  }, [tacheVisee, dossierId])

  if (!dossierId) {
    return (
      <section className="dw dw--vide">
        <h2 className="pp-section-title">Travail actif</h2>
        <p className="pp-empty">Sélectionne un dossier pour l'ouvrir ici.</p>
      </section>
    )
  }

  if (!dossier) {
    return (
      <section className="dw dw--vide">
        <h2 className="pp-section-title">Travail actif</h2>
        <p className="pp-empty">Ce dossier n'est plus disponible.</p>
      </section>
    )
  }

  const aujourdhui = todayISO()
  const taches     = Array.isArray(dossier.taches) ? dossier.taches : []
  const echeance   = formatISO(dossier.echeance, formatLong)
  const jours      = joursAvant(dossier.echeance, aujourdhui)
  const enRetard   = jours !== null && jours < 0 && !isClos
  const description = (dossier.description || '').trim()
  const raison      = (dossier.raisonAujourdhui || '').trim()

  return (
    <section className="dw">
      <header className="dw-head">
        <div className="dw-head-top">
          <span className="pp-section-title dw-eyebrow">Travail actif</span>
          <span className={`dw-etat dw-etat--${dossier.etat}`}>{ETAT_LABELS[dossier.etat] || dossier.etat}</span>
        </div>

        <h1 className="dw-titre">{dossier.titre}</h1>
        {dossier.organisme && <p className="dw-org">{dossier.organisme}</p>}

        <div className="dw-meta">
          <span className="dw-meta-item" style={{ color: Q_COLORS[dossier.quadrant] }}>
            ● {Q_LABELS[dossier.quadrant] || `Q${dossier.quadrant}`}
          </span>
          {echeance && (
            <span className={`dw-meta-item${enRetard ? ' dw-meta-retard' : ''}`}>
              Échéance · {echeance}
              {!isClos && jours === 0 && ' · aujourd’hui'}
              {!isClos && jours > 0 && jours <= 7 && ` · J−${jours}`}
              {enRetard && ` · en retard de ${Math.abs(jours)} j`}
            </span>
          )}
          {total > 0 && (
            <span className="dw-meta-item">{tachesDone} / {total} tâche{total > 1 ? 's' : ''}</span>
          )}
        </div>

        {total > 0 && (
          <div className="dw-prog">
            <div className="dw-prog-fill" style={{ width: `${pct}%` }} />
          </div>
        )}
      </header>

      <div className="dw-body">
        <div className="dw-main">
          {(description || raison) && (
            <section className="dw-bloc">
              <h3 className="dw-bloc-titre">Description</h3>
              {description && <p className="dw-texte">{description}</p>}
              {raison && <p className="dw-raison">{raison}</p>}
            </section>
          )}

          <section className="dw-bloc">
            <h3 className="dw-bloc-titre">Tâches</h3>
            {taches.length === 0 ? (
              <p className="pp-empty">Aucune tâche dans ce dossier.</p>
            ) : (
              <ul className="dw-taches">
                {taches.map(tache => {
                  const planification = formatPlanification(tache)
                  const echeanceTache = formatISO(tache.echeance, formatCourt)
                  const tacheEnRetard = Boolean(echeanceTache) && !tache.done && !isClos && tache.echeance < aujourdhui
                  return (
                    <li
                      key={tache.id}
                      ref={tache.id === tacheVisee ? tacheRef : null}
                      className={`dw-tache${tache.id === tacheVisee ? ' dw-tache--visee' : ''}`}
                    >
                      <button
                        type="button"
                        className={`dw-check${tache.done ? ' dw-check--done' : ''}`}
                        onClick={() => { if (!isClos) toggleTache(dossier.id, tache.id) }}
                        disabled={isClos}
                        aria-pressed={tache.done}
                        aria-label={tache.done ? 'Décocher' : 'Cocher'}
                      >
                        {tache.done && (
                          <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="2 6 5 9 10 3" />
                          </svg>
                        )}
                      </button>
                      <div className="dw-tache-corps">
                        <span className={`dw-tache-titre${tache.done ? ' dw-tache-faite' : ''}`}>{tache.titre}</span>
                        {(planification || echeanceTache) && (
                          <span className="dw-tache-dates">
                            {planification && <span className="dw-date">{planification}</span>}
                            {echeanceTache && (
                              <span className={`dw-date${tacheEnRetard ? ' dw-date--retard' : ''}`}>
                                Échéance · {echeanceTache}
                              </span>
                            )}
                          </span>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        </div>

        <aside className="dw-aside">
          <h3 className="dw-bloc-titre">Ce qui s'est passé</h3>
          {etapes.length === 0 ? (
            <p className="pp-empty">Aucune étape enregistrée.</p>
          ) : (
            <ol className="dw-etapes">
              {etapes.map(etape => (
                <li key={etape.id} className="dw-etape">
                  <span className="dw-etape-dot" style={{ background: STATUT_COLORS[etape.statut] || '#B5A898' }} />
                  <div className="dw-etape-corps">
                    <span className="dw-etape-meta">
                      {formatISO(etape.date, formatCourt) || etape.date}
                      <span className="dw-etape-statut" style={{ color: STATUT_COLORS[etape.statut] || '#B5A898' }}>
                        {STATUT_LABELS[etape.statut] || etape.statut}
                      </span>
                      {etape.source === 'auto' && <span className="dw-etape-auto">auto</span>}
                    </span>
                    <p className="dw-etape-texte">{etape.texte}</p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </aside>
      </div>

      <style>{`
        .dw {
          display: flex;
          flex-direction: column;
          min-height: 0;
          background: var(--surface);
          border-left: 0.5px solid var(--border);
          overflow: hidden;
        }
        .dw--vide { padding: 26px 24px; gap: 10px; }

        /* ── En-tête ── */
        .dw-head {
          flex-shrink: 0;
          padding: 20px 24px 16px;
          border-bottom: 0.5px solid var(--border);
        }
        .dw-head-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 10px;
        }
        .dw-eyebrow { margin-bottom: 0; }
        .dw-etat {
          flex-shrink: 0;
          padding: 3px 11px;
          border-radius: 20px;
          font-size: 12px;
          font-weight: 600;
        }
        .dw-etat--actionnable     { background: var(--green-light); color: var(--green); }
        .dw-etat--attente_externe { background: #FFF8EC;            color: var(--amber); }
        .dw-etat--bloque          { background: #FEF2F2;            color: var(--red); }
        .dw-etat--surveille       { background: var(--gray-light);  color: #7A6A5A; }
        .dw-etat--clos            { background: var(--gray-light);  color: var(--text-secondary); }

        .dw-titre {
          font-size: 22px;
          font-weight: 700;
          color: var(--text);
          line-height: 1.2;
          letter-spacing: -0.6px;
        }
        .dw-org {
          font-size: 14px;
          color: var(--text-secondary);
          margin-top: 4px;
        }
        .dw-meta {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 18px;
          margin-top: 14px;
          font-size: 12px;
          color: var(--text-secondary);
        }
        .dw-meta-item { white-space: nowrap; }
        .dw-meta-retard { color: var(--color-accent); font-weight: 600; }
        .dw-prog {
          height: 3px;
          margin-top: 14px;
          background: var(--border);
          border-radius: 2px;
          overflow: hidden;
        }
        .dw-prog-fill {
          height: 100%;
          background: var(--green);
          border-radius: 2px;
          transition: width 0.3s ease;
        }

        /* ── Corps : colonne principale + historique ── */
        .dw-body {
          flex: 1;
          min-height: 0;
          display: flex;
          flex-direction: column;
          gap: 26px;
          overflow-y: auto;
          padding: 20px 24px 28px;
        }
        .dw-main { display: flex; flex-direction: column; gap: 26px; min-width: 0; }
        .dw-aside { min-width: 0; }
        .dw-bloc-titre {
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 1px;
          color: var(--text-secondary);
          margin-bottom: 12px;
        }
        .dw-texte {
          font-size: 14px;
          line-height: 1.65;
          color: var(--text);
          max-width: 68ch;
        }
        .dw-raison {
          font-size: 13px;
          line-height: 1.6;
          color: var(--green);
          background: var(--green-light);
          border-radius: var(--radius-sm);
          padding: 10px 12px;
          margin-top: 10px;
          max-width: 68ch;
        }

        /* ── Tâches ── */
        .dw-taches { list-style: none; display: flex; flex-direction: column; }
        .dw-tache {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          padding: 11px 0;
          border-bottom: 1px solid var(--border-light);
        }
        .dw-tache:last-child { border-bottom: none; }
        .dw-tache--visee {
          background: var(--green-light);
          border-radius: var(--radius-sm);
          box-shadow: inset 3px 0 0 var(--green);
          padding-left: 10px;
          padding-right: 8px;
        }
        .dw-check {
          flex-shrink: 0;
          width: 20px;
          height: 20px;
          margin-top: 1px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--surface);
          border: 1.5px solid var(--border);
          border-radius: 5px;
        }
        .dw-check:hover:not(:disabled) { border-color: var(--green); }
        .dw-check--done { background: var(--green); border-color: var(--green); }
        .dw-check:disabled { opacity: 0.5; cursor: default; }
        .dw-tache-corps { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
        .dw-tache-titre { font-size: 14px; line-height: 1.45; color: var(--text); }
        .dw-tache-faite { text-decoration: line-through; color: var(--text-secondary); }
        .dw-tache-dates { display: flex; flex-wrap: wrap; gap: 10px; }
        .dw-date { font-size: 11px; color: var(--text-muted); }
        .dw-date--retard { color: var(--color-accent); font-weight: 600; }

        /* ── Historique ── */
        .dw-etapes { list-style: none; display: flex; flex-direction: column; gap: 14px; }
        .dw-etape { display: flex; gap: 10px; }
        .dw-etape-dot {
          flex-shrink: 0;
          width: 8px;
          height: 8px;
          margin-top: 5px;
          border-radius: 50%;
        }
        .dw-etape-corps { min-width: 0; }
        .dw-etape-meta {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 6px;
          font-size: 11px;
          color: var(--text-muted);
        }
        .dw-etape-statut { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; }
        .dw-etape-auto {
          font-size: 10px;
          font-style: italic;
          color: var(--text-muted);
          background: var(--border-light);
          border-radius: 20px;
          padding: 0 6px;
        }
        .dw-etape-texte { font-size: 13px; line-height: 1.5; color: var(--text); margin-top: 2px; }
      `}</style>
    </section>
  )
}
