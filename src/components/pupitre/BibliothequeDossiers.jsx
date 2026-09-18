import { useMemo, useState } from 'react'
import { useApp } from '../../context/AppContext'
import { FILTRES_TEMPS, TRIS, dossierCorrespond, dossierCorrespondTemps, trierDossiers } from '../../utils/dossiersFiltres'

// Vue Dossiers de la Bibliothèque : recherche, filtres, tris et cartes compactes.
// Logique inchangée depuis D2 (utils/dossiersFiltres) ; seul le rendu est passé en grille de cartes.
// Cliquer sur une carte remonte l'id : la Bibliothèque se ferme et le dossier s'ouvre dans Travail actif.

// Mêmes prédicats que la page Dossiers mobile
const FILTRES = [
  { key: 'tous',    label: 'Tous',    predicat: d => d.etat !== 'clos' },
  { key: 'urgent',  label: 'Urgent',  predicat: d => d.quadrant === 1 || d.quadrant === 3 },
  { key: 'attente', label: 'Attente', predicat: d => d.etat === 'attente_externe' },
  { key: 'bloque',  label: 'Bloqué',  predicat: d => d.etat === 'bloque' },
]

const Q_LABELS = { 1: 'Urgent', 2: 'Important', 3: 'À expédier', 4: 'Plus tard' }
const Q_COLORS = { 1: '#C0392B', 2: '#1C3829', 3: '#B45309', 4: '#B5A898' }

// Échéance du dossier → « 30 sept. » ; date civile formatée en UTC pour ne jamais décaler d'un jour.
const echeanceFormatter = new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', day: 'numeric', month: 'short' })
function formatEcheance(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso ?? '')) return null
  const [year, month, day] = iso.split('-').map(Number)
  return echeanceFormatter.format(new Date(Date.UTC(year, month - 1, day)))
}

export default function BibliothequeDossiers({ selectedId, onOuvrir }) {
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
  const reinitialiser = () => { setRecherche(''); setFiltre('tous'); setFiltreTemps(''); setTri('actuel') }

  return (
    <div className="bd">
      <div className="bib-barre">
        <input
          type="search"
          className="bib-recherche"
          placeholder="Rechercher un dossier…"
          value={recherche}
          onChange={e => setRecherche(e.target.value)}
        />

        <div className="bib-pills">
          {FILTRES.map(f => (
            <button
              key={f.key}
              type="button"
              className={`bib-pill${filtre === f.key ? ' bib-pill--on' : ''}`}
              onClick={() => setFiltre(f.key)}
            >
              {f.label}
              {comptesStatut[f.key] > 0 && <span className="bib-pill-count">{comptesStatut[f.key]}</span>}
            </button>
          ))}
        </div>

        <select className="bib-select" value={filtreTemps} onChange={e => setFiltreTemps(e.target.value)} aria-label="Période">
          <option value="">Toutes les périodes</option>
          {FILTRES_TEMPS.map(f => (
            <option key={f.key} value={f.key}>{f.label} ({comptesTemps[f.key]})</option>
          ))}
        </select>

        <select className="bib-select" value={tri} onChange={e => setTri(e.target.value)} aria-label="Trier par">
          {TRIS.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
        </select>

        <span className="bib-compte">{liste.length} dossier{liste.length > 1 ? 's' : ''}</span>
        {criteresActifs && (
          <button type="button" className="bib-reset" onClick={reinitialiser}>Réinitialiser</button>
        )}
      </div>

      <div className="bib-defilement">
        {loading ? (
          <p className="pp-empty">Chargement…</p>
        ) : liste.length === 0 ? (
          <p className="pp-empty">{criteresActifs ? 'Aucun résultat pour ces critères.' : 'Aucun dossier.'}</p>
        ) : (
          <div className="bd-grille">
            {liste.map(d => {
              const taches = Array.isArray(d.taches) ? d.taches : []
              const faites = taches.filter(t => t.done).length
              const echeance = formatEcheance(d.echeance)
              const pct = taches.length > 0 ? (faites / taches.length) * 100 : 0
              return (
                <button
                  key={d.id}
                  type="button"
                  className={`bd-carte${d.id === selectedId ? ' bd-carte--on' : ''}`}
                  onClick={() => onOuvrir(d.id)}
                  aria-current={d.id === selectedId ? 'true' : undefined}
                >
                  <span className="bd-carte-tete">
                    <span className="bd-priorite" style={{ color: Q_COLORS[d.quadrant] }}>
                      ● {Q_LABELS[d.quadrant] || `Q${d.quadrant}`}
                    </span>
                    {d.etat === 'attente_externe' && <span className="bd-tag bd-tag--attente">Retour</span>}
                    {d.etat === 'bloque'          && <span className="bd-tag bd-tag--bloque">Bloqué</span>}
                    {d.etat === 'clos'            && <span className="bd-tag bd-tag--clos">Terminé</span>}
                  </span>

                  <span className="bd-carte-titre">{d.titre}</span>
                  {d.organisme && <span className="bd-carte-org">{d.organisme}</span>}

                  <span className="bd-carte-pied">
                    {taches.length > 0 && (
                      <>
                        <span className="bd-barre"><span className="bd-barre-fill" style={{ width: `${pct}%` }} /></span>
                        <span className="bd-compte">{faites}/{taches.length}</span>
                      </>
                    )}
                    {echeance && <span className="bd-ech">{echeance}</span>}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      <style>{`
        .bd { display: flex; flex-direction: column; min-height: 0; height: 100%; }
        .bd-grille {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(480px, 1fr));
          gap: 12px;
        }
        .bd-carte {
          display: flex;
          flex-direction: column;
          gap: 5px;
          padding: 14px 16px;
          text-align: left;
          background: var(--surface);
          border: 0.5px solid var(--border);
          border-radius: var(--radius);
        }
        .bd-carte:hover { border-color: var(--green); }
        .bd-carte--on { border-color: var(--green); box-shadow: inset 3px 0 0 var(--green); }
        .bd-carte-tete { display: flex; align-items: center; gap: 8px; }
        .bd-priorite { font-size: 11px; font-weight: 600; }
        .bd-tag {
          font-size: 9px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          padding: 1px 6px;
          border-radius: 4px;
        }
        .bd-tag--attente { background: var(--amber-light); color: var(--amber); }
        .bd-tag--bloque  { background: var(--red-light);   color: var(--red); }
        .bd-tag--clos    { background: var(--gray-light);  color: var(--text-secondary); }
        .bd-carte-titre {
          font-size: 14px;
          font-weight: 700;
          color: var(--text);
          line-height: 1.35;
          letter-spacing: -0.2px;
        }
        .bd-carte-org { font-size: 11px; color: var(--text-muted); }
        .bd-carte-pied {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-top: 4px;
          font-size: 10px;
          color: var(--text-muted);
        }
        .bd-barre {
          flex: 1;
          height: 2px;
          background: var(--border-light);
          border-radius: 1px;
          overflow: hidden;
        }
        .bd-barre-fill { display: block; height: 100%; background: var(--green); border-radius: 1px; }
        .bd-compte { font-variant-numeric: tabular-nums; }
        .bd-ech { white-space: nowrap; }
      `}</style>
    </div>
  )
}
