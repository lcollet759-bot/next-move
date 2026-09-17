import { useMemo, useState } from 'react'
import { useApp } from '../../context/AppContext'
import { FILTRES_TEMPS, TRIS, dossierCorrespond, dossierCorrespondTemps, trierDossiers } from '../../utils/dossiersFiltres'

// Colonne droite du Pupitre : recherche, filtres, tris et liste compacte des dossiers.
// Lecture seule : réutilise la logique de utils/dossiersFiltres, aucun calcul métier propre.
// La sélection appartient au Pupitre (selectedId / onSelectDossier) ; les critères restent locaux à ce panneau.
// Les classes partagées (.pp-col, .pp-section-title, .pp-empty) sont définies par Pupitre.jsx.

// Mêmes prédicats que la page Dossiers mobile
const FILTRES = [
  { key: 'tous',    label: 'Tous',    predicat: d => d.etat !== 'clos' },
  { key: 'urgent',  label: 'Urgent',  predicat: d => d.quadrant === 1 || d.quadrant === 3 },
  { key: 'attente', label: 'Attente', predicat: d => d.etat === 'attente_externe' },
  { key: 'bloque',  label: 'Bloqué',  predicat: d => d.etat === 'bloque' },
]

function quadrantColor(q) {
  if (q === 1) return '#C0392B'
  if (q === 2) return '#1C3829'
  if (q === 3) return '#B45309'
  return '#B5A898'
}

// Échéance du dossier → « 30 sept. » ; date civile formatée en UTC pour ne jamais décaler d'un jour.
const echeanceFormatter = new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', day: 'numeric', month: 'short' })
function formatEcheance(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso ?? '')) return null
  const [year, month, day] = iso.split('-').map(Number)
  return echeanceFormatter.format(new Date(Date.UTC(year, month - 1, day)))
}

export default function DossiersPanel({ selectedId, onSelectDossier }) {
  const { dossiers, loading } = useApp()

  const [recherche,   setRecherche]   = useState('')
  const [filtre,      setFiltre]      = useState('tous')
  const [filtreTemps, setFiltreTemps] = useState('')       // '' = toutes les périodes
  const [tri,         setTri]         = useState('actuel')

  const { liste, comptesTemps } = useMemo(() => {
    const predicat = FILTRES.find(f => f.key === filtre)?.predicat ?? (() => true)
    let list = dossiers.filter(predicat).filter(d => dossierCorrespond(d, recherche))
    const comptesTemps = Object.fromEntries(
      FILTRES_TEMPS.map(f => [f.key, list.filter(d => dossierCorrespondTemps(d, f.key)).length])
    )
    if (filtreTemps) list = list.filter(d => dossierCorrespondTemps(d, filtreTemps))
    return { liste: trierDossiers(list, tri), comptesTemps }
  }, [dossiers, filtre, recherche, filtreTemps, tri])

  const comptesStatut = useMemo(
    () => Object.fromEntries(FILTRES.map(f => [f.key, dossiers.filter(f.predicat).length])),
    [dossiers]
  )

  const criteresActifs = Boolean(recherche) || filtre !== 'tous' || Boolean(filtreTemps) || tri !== 'actuel'
  // Les critères seuls sont remis à zéro : le dossier sélectionné reste ouvert au centre
  const reinitialiser = () => { setRecherche(''); setFiltre('tous'); setFiltreTemps(''); setTri('actuel') }

  return (
    <section className="pp-col pp-dossiers">
      <div className="pp-col-head">
        <div className="pp-head-row">
          <h2 className="pp-section-title">Dossiers</h2>
          <span className="pp-count">{liste.length}</span>
        </div>

        <input
          type="search"
          className="pp-search"
          placeholder="Rechercher…"
          value={recherche}
          onChange={e => setRecherche(e.target.value)}
        />

        <div className="pp-pills">
          {FILTRES.map(f => (
            <button
              key={f.key}
              type="button"
              className={`pp-pill${filtre === f.key ? ' pp-pill--on' : ''}`}
              onClick={() => setFiltre(f.key)}
            >
              {f.label}
              {comptesStatut[f.key] > 0 && <span className="pp-pill-count">{comptesStatut[f.key]}</span>}
            </button>
          ))}
        </div>

        <div className="pp-selects">
          <select
            className="pp-select"
            value={filtreTemps}
            onChange={e => setFiltreTemps(e.target.value)}
            aria-label="Période"
          >
            <option value="">Toutes les périodes</option>
            {FILTRES_TEMPS.map(f => (
              <option key={f.key} value={f.key}>{f.label} ({comptesTemps[f.key]})</option>
            ))}
          </select>

          <select
            className="pp-select"
            value={tri}
            onChange={e => setTri(e.target.value)}
            aria-label="Trier par"
          >
            {TRIS.map(t => (
              <option key={t.key} value={t.key}>{t.label}</option>
            ))}
          </select>
        </div>

        {criteresActifs && (
          <button type="button" className="pp-reset" onClick={reinitialiser}>Réinitialiser les critères</button>
        )}
      </div>

      <div className="pp-list-wrap">
        {loading ? (
          <p className="pp-empty">Chargement…</p>
        ) : liste.length === 0 ? (
          <p className="pp-empty">{criteresActifs ? 'Aucun résultat pour ces critères.' : 'Aucun dossier.'}</p>
        ) : (
          <ul className="pp-list">
            {liste.map(d => {
              const taches = Array.isArray(d.taches) ? d.taches : []
              const faites = taches.filter(t => t.done).length
              const echeance = formatEcheance(d.echeance)
              return (
                <li key={d.id}>
                  <button
                    type="button"
                    className={`pp-item${d.id === selectedId ? ' pp-item--active' : ''}`}
                    onClick={() => onSelectDossier(d.id)}
                    aria-current={d.id === selectedId ? 'true' : undefined}
                  >
                    <span className="pp-item-dot" style={{ background: quadrantColor(d.quadrant) }} />
                    <span className="pp-item-main">
                      <span className="pp-item-titre">{d.titre}</span>
                      <span className="pp-item-meta">
                        {d.etat === 'attente_externe' && <span className="pp-tag pp-tag--attente">Retour</span>}
                        {d.etat === 'bloque'          && <span className="pp-tag pp-tag--bloque">Bloqué</span>}
                        {d.organisme && <span className="pp-item-org">{d.organisme}</span>}
                      </span>
                    </span>
                    <span className="pp-item-right">
                      {echeance && <span className="pp-item-ech">{echeance}</span>}
                      {taches.length > 0 && <span className="pp-item-prog">{faites}/{taches.length}</span>}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <style>{`
        /* ── En-tête fixe ── */
        .pp-dossiers { padding: 16px 0 0; }
        .pp-col-head {
          flex-shrink: 0;
          display: flex;
          flex-direction: column;
          gap: 8px;
          padding: 0 16px 12px;
          border-bottom: 0.5px solid var(--border);
        }
        .pp-head-row {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
        }
        .pp-head-row .pp-section-title { margin-bottom: 0; }
        .pp-count {
          font-size: 11px;
          font-weight: 600;
          color: var(--text-muted);
        }
        .pp-search {
          width: 100%;
          padding: 7px 10px;
          font-size: 13px;
          color: var(--text);
          background: var(--border-light);
          border: 0.5px solid var(--border);
          border-radius: var(--radius-sm);
          outline: none;
        }
        .pp-search::placeholder { color: var(--text-muted); }
        .pp-search:focus { border-color: var(--green); }

        .pp-pills { display: flex; flex-wrap: wrap; gap: 5px; }
        .pp-pill {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 4px 10px;
          font-size: 12px;
          font-weight: 600;
          color: var(--text-secondary);
          background: var(--border-light);
          border: 0.5px solid var(--border);
          border-radius: 20px;
        }
        .pp-pill:hover { color: var(--text); }
        .pp-pill--on {
          background: var(--green);
          border-color: var(--green);
          color: #FFFFFF;
        }
        .pp-pill--on:hover { color: #FFFFFF; }
        .pp-pill-count { font-size: 10px; opacity: 0.7; }

        .pp-selects { display: flex; gap: 6px; }
        .pp-select {
          flex: 1;
          min-width: 0;
          padding: 6px 8px;
          font-size: 12px;
          color: var(--text);
          background: var(--surface);
          border: 0.5px solid var(--border);
          border-radius: var(--radius-sm);
          outline: none;
          cursor: pointer;
        }
        .pp-select:focus { border-color: var(--green); }

        .pp-reset {
          align-self: flex-start;
          padding: 0;
          font-size: 12px;
          color: var(--color-accent);
          background: none;
          border: none;
          text-decoration: underline;
          text-decoration-color: var(--border);
        }

        /* ── Liste compacte ── */
        .pp-list-wrap {
          flex: 1;
          min-height: 0;
          overflow-y: auto;
          padding: 10px 16px 16px;
        }
        .pp-list {
          list-style: none;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .pp-item {
          display: flex;
          align-items: center;
          gap: 9px;
          width: 100%;
          padding: 7px 9px;
          text-align: left;
          background: none;
          border: none;
          border-radius: var(--radius-sm);
        }
        .pp-item:hover { background: var(--border-light); }
        .pp-item--active { background: var(--green); }
        .pp-item--active:hover { background: var(--green); }
        .pp-item-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          flex-shrink: 0;
        }
        .pp-item--active .pp-item-dot { box-shadow: 0 0 0 2px rgba(255,255,255,0.35); }
        .pp-item-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
        .pp-item-titre {
          font-size: 13px;
          color: var(--text);
          line-height: 1.35;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .pp-item--active .pp-item-titre { color: #FFFFFF; font-weight: 700; }
        .pp-item-meta {
          display: flex;
          align-items: center;
          gap: 5px;
          min-width: 0;
        }
        .pp-item-org {
          font-size: 11px;
          color: var(--text-muted);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .pp-item--active .pp-item-org { color: rgba(255,255,255,0.7); }
        .pp-tag {
          font-size: 9px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          padding: 1px 5px;
          border-radius: 4px;
          flex-shrink: 0;
        }
        .pp-tag--attente { background: var(--amber-light); color: var(--amber); }
        .pp-tag--bloque  { background: var(--red-light);   color: var(--red); }
        .pp-item-right {
          display: flex;
          align-items: baseline;
          gap: 8px;
          flex-shrink: 0;
          font-size: 10px;
          color: var(--text-muted);
        }
        .pp-item--active .pp-item-right { color: rgba(255,255,255,0.7); }
        .pp-item-ech  { white-space: nowrap; }
        .pp-item-prog { font-variant-numeric: tabular-nums; }
      `}</style>
    </section>
  )
}
