import { useMemo, useState } from 'react'
import { useApp } from '../../context/AppContext'
import { FILTRES_TEMPS, normaliserTexte, tacheCorrespondTemps } from '../../utils/dossiersFiltres'
import { todayISO } from '../../utils/date'

// Vue Tâches de la Bibliothèque : toutes les tâches, tous dossiers confondus.
// Aucune notion métier nouvelle : les périodes réutilisent les règles de utils/dossiersFiltres
// (tacheCorrespondTemps) et le statut repose sur le seul champ `done`.
// Cliquer sur une tâche ferme la Bibliothèque et ouvre son dossier, tâche repérée, dans Travail actif.

const STATUTS = [
  { key: 'afaire',    label: 'À faire',   predicat: t => !t.done },
  { key: 'toutes',    label: 'Toutes',    predicat: () => true },
  { key: 'terminees', label: 'Terminées', predicat: t => t.done },
]

const formatCourt = new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', day: 'numeric', month: 'short' })
function formatISO(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso ?? '')) return null
  const [year, month, day] = iso.split('-').map(Number)
  return formatCourt.format(new Date(Date.UTC(year, month - 1, day)))
}

export default function BibliothequeTaches({ onOuvrir }) {
  const { dossiers, loading } = useApp()

  const [recherche, setRecherche] = useState('')
  const [statut,    setStatut]    = useState('afaire')
  const [periode,   setPeriode]   = useState('')          // '' = toutes les périodes

  const aujourdhui = todayISO()

  // Aplatissement des tâches existantes : aucune donnée n'est calculée, seulement rassemblée
  const toutes = useMemo(() => (dossiers || [])
    .filter(d => d.etat !== 'clos')
    .flatMap(d => (Array.isArray(d.taches) ? d.taches : []).map(t => ({
      id: t.id,
      titre: t.titre,
      done: Boolean(t.done),
      datePlanifiee: t.datePlanifiee ?? null,
      heurePlanifiee: t.heurePlanifiee ?? null,
      echeance: t.echeance ?? null,
      dossierId: d.id,
      dossierTitre: d.titre,
      organisme: d.organisme || null,
    }))), [dossiers])

  const { liste, comptesPeriode } = useMemo(() => {
    const predicat = STATUTS.find(s => s.key === statut)?.predicat ?? (() => true)
    const q = normaliserTexte(recherche)
    let list = toutes.filter(predicat).filter(t =>
      !q || normaliserTexte(t.titre).includes(q) || normaliserTexte(t.dossierTitre).includes(q)
    )
    const comptesPeriode = Object.fromEntries(
      FILTRES_TEMPS.map(f => [f.key, list.filter(t => tacheCorrespondTemps(t, f.key, aujourdhui)).length])
    )
    if (periode) list = list.filter(t => tacheCorrespondTemps(t, periode, aujourdhui))
    return { liste: list, comptesPeriode }
  }, [toutes, statut, recherche, periode, aujourdhui])

  const criteresActifs = Boolean(recherche) || statut !== 'afaire' || Boolean(periode)
  const reinitialiser = () => { setRecherche(''); setStatut('afaire'); setPeriode('') }

  return (
    <div className="bt">
      <div className="bib-barre">
        <input
          type="search"
          className="bib-recherche"
          placeholder="Rechercher une tâche ou un dossier…"
          value={recherche}
          onChange={e => setRecherche(e.target.value)}
        />

        <div className="bib-pills">
          {STATUTS.map(s => (
            <button
              key={s.key}
              type="button"
              className={`bib-pill${statut === s.key ? ' bib-pill--on' : ''}`}
              onClick={() => setStatut(s.key)}
            >
              {s.label}
            </button>
          ))}
        </div>

        <select className="bib-select" value={periode} onChange={e => setPeriode(e.target.value)} aria-label="Période">
          <option value="">Toutes les périodes</option>
          {FILTRES_TEMPS.map(f => (
            <option key={f.key} value={f.key}>{f.label} ({comptesPeriode[f.key]})</option>
          ))}
        </select>

        <span className="bib-compte">{liste.length} tâche{liste.length > 1 ? 's' : ''}</span>
        {criteresActifs && (
          <button type="button" className="bib-reset" onClick={reinitialiser}>Réinitialiser</button>
        )}
      </div>

      <div className="bib-defilement">
        {loading ? (
          <p className="pp-empty">Chargement…</p>
        ) : liste.length === 0 ? (
          <p className="pp-empty">{criteresActifs ? 'Aucune tâche pour ces critères.' : 'Aucune tâche.'}</p>
        ) : (
          <ul className="bt-liste">
            {liste.map(t => {
              const planifiee = formatISO(t.datePlanifiee)
              const echeance  = formatISO(t.echeance)
              const enRetard  = !t.done && (
                (t.echeance && t.echeance < aujourdhui) || (t.datePlanifiee && t.datePlanifiee < aujourdhui)
              )
              return (
                <li key={`${t.dossierId}-${t.id}`}>
                  <button type="button" className="bt-ligne" onClick={() => onOuvrir(t.dossierId, t.id || null)}>
                    <span className={`bt-case${t.done ? ' bt-case--on' : ''}`} />
                    <span className="bt-corps">
                      <span className={`bt-titre${t.done ? ' bt-titre--faite' : ''}`}>{t.titre}</span>
                      <span className="bt-dossier">
                        {t.dossierTitre}{t.organisme && ` · ${t.organisme}`}
                      </span>
                    </span>
                    <span className="bt-dates">
                      {planifiee && (
                        <span className={`bt-date${enRetard ? ' bt-date--retard' : ''}`}>
                          {planifiee}{t.heurePlanifiee ? ` · ${t.heurePlanifiee}` : ''}
                        </span>
                      )}
                      {echeance && (
                        <span className={`bt-date${enRetard ? ' bt-date--retard' : ''}`}>Échéance · {echeance}</span>
                      )}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <style>{`
        .bt { display: flex; flex-direction: column; min-height: 0; height: 100%; }
        .bt-liste { list-style: none; display: flex; flex-direction: column; }
        .bt-ligne {
          display: flex;
          align-items: center;
          gap: 12px;
          width: 100%;
          padding: 10px 10px;
          text-align: left;
          background: none;
          border: none;
          border-bottom: 1px solid var(--border-light);
          border-radius: var(--radius-xs);
        }
        .bt-ligne:hover { background: var(--surface); }
        .bt-case {
          width: 15px;
          height: 15px;
          flex-shrink: 0;
          border: 1.5px solid var(--border);
          border-radius: 4px;
          background: var(--surface);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .bt-case--on { background: var(--green); border-color: var(--green); }
        .bt-case--on::after { content: '✓'; color: #FFFFFF; font-size: 10px; font-weight: 700; line-height: 1; }
        .bt-corps { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
        .bt-titre {
          font-size: 14px;
          color: var(--text);
          line-height: 1.35;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .bt-titre--faite { text-decoration: line-through; color: var(--text-secondary); }
        .bt-dossier {
          font-size: 11px;
          color: var(--text-muted);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .bt-dates { display: flex; flex-shrink: 0; gap: 12px; }
        .bt-date { font-size: 11px; color: var(--text-secondary); white-space: nowrap; }
        .bt-date--retard { color: var(--color-accent); font-weight: 600; }
      `}</style>
    </div>
  )
}
