import { useState, useMemo, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { FILTRES_TEMPS, TRIS, dossierCorrespond, dossierCorrespondTemps, trierDossiers } from '../utils/dossiersFiltres'

// ── Filtres ───────────────────────────────────────────────────────────────────
const FILTRES = [
  { key: 'tous',    label: 'Tous'    },
  { key: 'urgent',  label: 'Urgent'  },
  { key: 'attente', label: 'Attente' },
  { key: 'bloque',  label: 'Bloqué'  },
]

const PAGE_SIZE = 40

// ── Couleur par quadrant ──────────────────────────────────────────────────────
function quadrantColor(q) {
  if (q === 1) return '#C0392B'
  if (q === 2) return '#1C3829'
  if (q === 3) return '#B45309'
  return '#B5A898'
}

// ── Carte grille ──────────────────────────────────────────────────────────────
function DossierGridCard({ dossier, onClick }) {
  const done  = dossier.taches.filter(t => t.done).length
  const total = dossier.taches.length
  const pct   = total > 0 ? done / total : 0
  const color = quadrantColor(dossier.quadrant)

  // Échéance dépassée — affichage calculé à la volée, rien n'est sauvegardé
  const today    = new Date(); today.setHours(0, 0, 0, 0)
  const echDate  = dossier.echeance ? new Date(dossier.echeance + 'T00:00:00') : null
  const enRetard = echDate !== null && echDate < today && dossier.etat !== 'clos'

  return (
    <button className="td-card" onClick={onClick}>
      <div className="td-card-top">
        <span className="td-dot" style={{ background: color }} />
        {dossier.etat === 'attente_externe' && <span className="td-badge td-badge-attente">Retour</span>}
        {dossier.etat === 'bloque'          && <span className="td-badge td-badge-bloque">Bloqué</span>}
      </div>
      <p className="td-titre">{dossier.titre}</p>
      {dossier.organisme && <p className="td-org">{dossier.organisme}</p>}
      {total > 0 && (
        <div className="td-footer">
          <div className="td-bar-wrap">
            <div className="td-bar-fill" style={{ width: `${pct * 100}%`, background: color }} />
          </div>
          <span className="td-count">{done}/{total}</span>
        </div>
      )}
      {echDate && (
        <span className="td-ech" style={enRetard ? { color: '#C4623A', fontWeight: 700 } : undefined}>
          {echDate.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
        </span>
      )}
    </button>
  )
}

// ── Icône filtres / tris (curseurs) ──────────────────────────────────────────
function IconeFiltres() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/>
      <circle cx="9" cy="6" r="2.2" fill="#1C3829"/><circle cx="15" cy="12" r="2.2" fill="#1C3829"/><circle cx="8" cy="18" r="2.2" fill="#1C3829"/>
    </svg>
  )
}

// ── Skeleton ──────────────────────────────────────────────────────────────────
function SkeletonGrid() {
  return (
    <div className="td-grid">
      {[1,2,3,4,5,6].map(i => (
        <div key={i} className="td-sk-card" />
      ))}
    </div>
  )
}

// ── Page principale ───────────────────────────────────────────────────────────
export default function TousDossiers() {
  const { dossiers, loading } = useApp()
  const navigate     = useNavigate()
  const [searchParams] = useSearchParams()

  // Initialiser le filtre depuis l'URL (?filtre=attente depuis Aujourd'hui)
  const [filtre,    setFiltre]    = useState(() => {
    const fromUrl = searchParams.get('filtre')
    return FILTRES.some(f => f.key === fromUrl) ? fromUrl : 'tous'
  })
  const [recherche, setRecherche] = useState('')
  const [limit,     setLimit]     = useState(PAGE_SIZE)
  const [filtreTemps, setFiltreTemps] = useState(null)      // période (FILTRES_TEMPS) ou null
  const [tri,         setTri]         = useState('actuel')  // TRIS
  const [showFiltres, setShowFiltres] = useState(false)

  // Réagir aux changements de searchParams (navigation client-side sans remontage)
  useEffect(() => {
    const f = searchParams.get('filtre')
    if (FILTRES.some(x => x.key === f)) setFiltre(f)
  }, [searchParams])

  const { dossiersFiltres, comptesTemps } = useMemo(() => {
    let list = [...dossiers]

    // Filtre principal
    if      (filtre === 'tous')    list = list.filter(d => d.etat !== 'clos')
    else if (filtre === 'urgent')  list = list.filter(d => d.quadrant === 1 || d.quadrant === 3)
    else if (filtre === 'attente') list = list.filter(d => d.etat === 'attente_externe')
    else if (filtre === 'bloque')  list = list.filter(d => d.etat === 'bloque')

    // Recherche : titre, organisme, description, raison et titres des tâches — sans casse ni accents
    list = list.filter(d => dossierCorrespond(d, recherche))

    // Période (tâches actives uniquement) ; compteurs affichés dans le panneau
    const comptesTemps = Object.fromEntries(FILTRES_TEMPS.map(f => [f.key, list.filter(d => dossierCorrespondTemps(d, f.key)).length]))
    if (filtreTemps) list = list.filter(d => dossierCorrespondTemps(d, filtreTemps))

    return { dossiersFiltres: trierDossiers(list, tri), comptesTemps }
  }, [dossiers, filtre, recherche, filtreTemps, tri])

  const counts = useMemo(() => ({
    tous:    dossiers.filter(d => d.etat !== 'clos').length,
    urgent:  dossiers.filter(d => d.quadrant === 1 || d.quadrant === 3).length,
    attente: dossiers.filter(d => d.etat === 'attente_externe').length,
    bloque:  dossiers.filter(d => d.etat === 'bloque').length,
  }), [dossiers])

  const handleFiltreChange    = (key) => { setFiltre(key); setLimit(PAGE_SIZE) }
  const handleRechercheChange = (e)   => { setRecherche(e.target.value); setLimit(PAGE_SIZE) }
  const choisirTemps = (key) => { setFiltreTemps(key); setLimit(PAGE_SIZE) }
  const choisirTri   = (key) => { setTri(key); setLimit(PAGE_SIZE) }
  // Réinitialiser : statut Tous, aucune période, recherche vide, ordre actuel
  const reinitialiser = () => { setFiltre('tous'); setFiltreTemps(null); setRecherche(''); setTri('actuel'); setLimit(PAGE_SIZE); setShowFiltres(false) }
  const criteresActifs = filtreTemps !== null || tri !== 'actuel'

  const visible = dossiersFiltres.slice(0, limit)
  const hasMore = dossiersFiltres.length > limit

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="page td-page">
        <header className="td-header">
          <div className="td-header-top">
            <h1 className="td-header-title">Dossiers</h1>
            <div className="td-header-actions">
              <span className="td-header-count">…</span>
              <button className="td-btn-new" onClick={() => navigate('/capturer')} aria-label="Nouveau dossier">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
              </button>
            </div>
          </div>
          <div className="td-search-row">
            <div className="td-search-wrap">
              <svg className="td-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2" strokeLinecap="round">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input className="td-search" placeholder="Rechercher…" disabled />
            </div>
            <button className="td-btn-filtres" disabled aria-label="Filtrer et trier"><IconeFiltres /></button>
          </div>
          <div className="td-pills">
            {FILTRES.map(f => (
              <div key={f.key} className={`td-pill ${f.key === 'tous' ? 'td-pill-active' : ''}`}>{f.label}</div>
            ))}
          </div>
        </header>
        <div style={{ padding: '16px 16px 0' }}>
          <SkeletonGrid />
        </div>
        <style>{tdCSS}</style>
      </div>
    )
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="page td-page">

      {/* ── Header vert ───────────────────────────────────────────────── */}
      <header className="td-header">
        <div className="td-header-top">
          <h1 className="td-header-title">Dossiers</h1>
          <div className="td-header-actions">
            <span className="td-header-count">{counts.tous}</span>
            <button className="td-btn-new" onClick={() => navigate('/capturer')} aria-label="Nouveau dossier">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Recherche + bouton filtres / tris */}
        <div className="td-search-row">
          <div className="td-search-wrap">
            <svg className="td-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2" strokeLinecap="round">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              className="td-search"
              placeholder="Rechercher…"
              value={recherche}
              onChange={handleRechercheChange}
            />
            {recherche && (
              <button className="td-search-clear" onClick={() => { setRecherche(''); setLimit(PAGE_SIZE) }}>✕</button>
            )}
          </div>
          <button
            className={`td-btn-filtres${criteresActifs ? ' td-btn-filtres-on' : ''}`}
            onClick={() => setShowFiltres(true)}
            aria-label="Filtrer et trier"
          >
            <IconeFiltres />
            {criteresActifs && <span className="td-btn-filtres-dot" />}
          </button>
        </div>

        {/* Filtres pills */}
        <div className="td-pills">
          {FILTRES.map(f => (
            <button
              key={f.key}
              className={`td-pill ${filtre === f.key ? 'td-pill-active' : ''}`}
              onClick={() => handleFiltreChange(f.key)}
            >
              {f.label}
              {counts[f.key] > 0 && (
                <span className="td-pill-count">{counts[f.key]}</span>
              )}
            </button>
          ))}
        </div>
      </header>

      {/* ── Grille ────────────────────────────────────────────────────── */}
      <div className="td-body">
        {visible.length === 0 ? (
          <div className="empty-state" style={{ paddingTop: 48 }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--border)" strokeWidth="1.5" strokeLinecap="round" style={{ marginBottom: 14 }}>
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
            </svg>
            <p className="empty-title">Aucun dossier</p>
            <p className="empty-text">
              {recherche || filtreTemps ? 'Aucun résultat pour ces critères.' : 'Capturez votre premier dossier.'}
            </p>
            {(recherche || filtreTemps) && (
              <button className="btn btn-ghost btn-sm td-empty-reset" onClick={reinitialiser}>Réinitialiser</button>
            )}
          </div>
        ) : (
          <>
            <div className="td-grid">
              {visible.map(d => (
                <DossierGridCard
                  key={d.id}
                  dossier={d}
                  onClick={() => navigate(`/dossiers/${d.id}`)}
                />
              ))}
            </div>

            {hasMore && (
              <button
                className="td-more-btn"
                onClick={() => setLimit(l => l + PAGE_SIZE)}
              >
                Afficher {Math.min(PAGE_SIZE, dossiersFiltres.length - limit)} de plus
              </button>
            )}
            {dossiersFiltres.length > PAGE_SIZE && !hasMore && (
              <p className="td-total-label">{dossiersFiltres.length} dossiers</p>
            )}
          </>
        )}
      </div>

      {/* ── Panneau filtres / tris (niveau page, hors du header sticky) ───── */}
      {showFiltres && (
        <div className="overlay" onClick={() => setShowFiltres(false)}>
          <div className="sheet td-sheet" onClick={e => e.stopPropagation()}>
            <div className="td-sheet-head">
              <h3 className="td-sheet-title">Filtrer et trier</h3>
              <button className="td-sheet-close" onClick={() => setShowFiltres(false)} aria-label="Fermer">✕</button>
            </div>

            <p className="td-sheet-label">Période</p>
            <div className="td-sheet-options">
              <button className={`td-opt${filtreTemps === null ? ' td-opt-on' : ''}`} onClick={() => choisirTemps(null)}>Toutes</button>
              {FILTRES_TEMPS.map(f => (
                <button key={f.key} className={`td-opt${filtreTemps === f.key ? ' td-opt-on' : ''}`} onClick={() => choisirTemps(f.key)}>
                  {f.label}
                  <span className="td-opt-count">{comptesTemps[f.key]}</span>
                </button>
              ))}
            </div>

            <p className="td-sheet-label">Trier par</p>
            <div className="td-sheet-tris" role="radiogroup" aria-label="Trier par">
              {TRIS.map(t => (
                <button key={t.key} role="radio" aria-checked={tri === t.key} className={`td-tri${tri === t.key ? ' td-tri-on' : ''}`} onClick={() => choisirTri(t.key)}>
                  <span className="td-tri-radio" />
                  {t.label}
                </button>
              ))}
            </div>

            <div className="td-sheet-actions">
              <button className="btn btn-ghost" onClick={reinitialiser}>Réinitialiser</button>
              <button className="btn btn-primary" onClick={() => setShowFiltres(false)}>
                Voir {dossiersFiltres.length} dossier{dossiersFiltres.length > 1 ? 's' : ''}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{tdCSS}</style>
    </div>
  )
}

/* ══ CSS ══════════════════════════════════════════════════════════════════════ */
const tdCSS = `
  @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }

  /* ── Page ────────────────────────────────────────────────────────────── */
  .td-page { background: #F7F5F0; }

  /* ── Header ──────────────────────────────────────────────────────────── */
  .td-header {
    background: #1C3829;
    padding: 44px 20px 16px;
    position: sticky;
    top: 0;
    z-index: 10;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .td-header-top {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
  }
  .td-header-title {
    font-size: 22px;
    font-weight: 700;
    color: #fff;
    letter-spacing: -0.5px;
  }
  .td-header-actions {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .td-header-count {
    font-size: 13px;
    font-weight: 600;
    color: rgba(255,255,255,0.45);
  }
  .td-btn-new {
    width: 34px;
    height: 34px;
    border-radius: 50%;
    background: #C4623A;
    border: none;
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    flex-shrink: 0;
    transition: background 0.15s, transform 0.12s;
    box-shadow: 0 2px 8px rgba(196,98,58,0.4);
  }
  .td-btn-new:active { background: #a84e2d; transform: scale(0.93); }

  /* ── Recherche ───────────────────────────────────────────────────────── */
  .td-search-wrap {
    position: relative;
    display: flex;
    align-items: center;
  }
  .td-search-icon {
    position: absolute;
    left: 10px;
    pointer-events: none;
    flex-shrink: 0;
  }
  .td-search {
    width: 100%;
    padding: 9px 32px 9px 32px;
    background: rgba(255,255,255,0.1);
    border: 1px solid rgba(255,255,255,0.15);
    border-radius: 10px;
    font-size: 14px;
    font-family: inherit;
    color: #fff;
    outline: none;
    transition: background 0.15s;
  }
  .td-search::placeholder { color: rgba(255,255,255,0.4); }
  .td-search:focus { background: rgba(255,255,255,0.15); }
  .td-search:disabled { opacity: 0.4; }
  .td-search-clear {
    position: absolute;
    right: 10px;
    border: none;
    background: none;
    color: rgba(255,255,255,0.5);
    cursor: pointer;
    font-size: 12px;
    padding: 4px;
    line-height: 1;
  }

  /* ── Bouton filtres / tris ───────────────────────────────────────────── */
  .td-search-row { display: flex; align-items: center; gap: 8px; }
  .td-search-row .td-search-wrap { flex: 1; min-width: 0; }
  .td-btn-filtres {
    position: relative;
    width: 38px;
    height: 38px;
    flex-shrink: 0;
    border-radius: 10px;
    border: 1px solid rgba(255,255,255,0.15);
    background: rgba(255,255,255,0.1);
    color: rgba(255,255,255,0.75);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: background 0.15s;
  }
  .td-btn-filtres:active { background: rgba(255,255,255,0.2); }
  .td-btn-filtres:disabled { opacity: 0.4; }
  .td-btn-filtres-on { background: rgba(255,255,255,0.22); border-color: rgba(255,255,255,0.5); color: #fff; }
  .td-btn-filtres-dot {
    position: absolute; top: 6px; right: 6px;
    width: 7px; height: 7px; border-radius: 50%; background: #fff;
  }

  /* ── Panneau filtres / tris ──────────────────────────────────────────── */
  .td-sheet { max-height: 85vh; overflow-y: auto; }
  .td-sheet-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
  .td-sheet-title { font-size: 18px; font-weight: 600; color: #2A1F14; }
  .td-sheet-close { border: none; background: none; color: #A09080; font-size: 14px; padding: 6px; cursor: pointer; }
  .td-sheet-label {
    font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px;
    color: #A09080; margin: 4px 0 8px;
  }
  .td-sheet-options { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 18px; }
  .td-opt {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 7px 12px; border-radius: 20px;
    border: 0.5px solid #DDD8CE; background: #F0EBE3; color: #2A1F14;
    font-size: 13px; font-weight: 500; font-family: inherit; cursor: pointer;
  }
  .td-opt-on { background: #1C3829; border-color: #1C3829; color: #fff; }
  .td-opt-count { font-size: 11px; color: #A09080; }
  .td-opt-on .td-opt-count { color: rgba(255,255,255,0.7); }
  .td-sheet-tris { display: flex; flex-direction: column; margin-bottom: 20px; }
  .td-tri {
    display: flex; align-items: center; gap: 10px;
    padding: 11px 2px; border: none; border-bottom: 1px solid #F0EBE3; background: none;
    text-align: left; font-size: 14px; font-family: inherit; color: #2A1F14; cursor: pointer;
  }
  .td-tri:last-child { border-bottom: none; }
  .td-tri-radio { width: 16px; height: 16px; border-radius: 50%; border: 1.5px solid #DDD8CE; flex-shrink: 0; box-sizing: border-box; }
  .td-tri-on { font-weight: 600; }
  .td-tri-on .td-tri-radio { border: 5px solid #1C3829; }
  .td-sheet-actions { display: flex; gap: 10px; }
  .td-sheet-actions .btn-ghost { flex: 1; }
  .td-sheet-actions .btn-primary { flex: 2; }
  .td-empty-reset { margin-top: 14px; }

  /* ── Filtres pills ───────────────────────────────────────────────────── */
  .td-pills {
    display: flex;
    gap: 6px;
    overflow-x: auto;
    scrollbar-width: none;
    -webkit-overflow-scrolling: touch;
  }
  .td-pills::-webkit-scrollbar { display: none; }
  .td-pill {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 5px 13px;
    border-radius: 20px;
    border: 1.5px solid rgba(255,255,255,0.2);
    background: transparent;
    color: rgba(255,255,255,0.6);
    font-size: 12px;
    font-weight: 600;
    font-family: inherit;
    white-space: nowrap;
    cursor: pointer;
    flex-shrink: 0;
    transition: all 0.15s;
    letter-spacing: 0.01em;
  }
  .td-pill:active { opacity: 0.8; }
  .td-pill-active {
    background: rgba(255,255,255,0.15);
    border-color: rgba(255,255,255,0.5);
    color: #fff;
  }
  .td-pill-count {
    background: rgba(255,255,255,0.2);
    border-radius: 8px;
    padding: 0 5px;
    font-size: 10px;
    line-height: 1.6;
  }
  .td-pill-active .td-pill-count { background: rgba(255,255,255,0.3); }

  /* ── Body ────────────────────────────────────────────────────────────── */
  .td-body { padding: 16px 16px 0; }

  /* ── Grille 2 colonnes ───────────────────────────────────────────────── */
  .td-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }

  /* ── Carte ───────────────────────────────────────────────────────────── */
  .td-card {
    background: #fff;
    border-radius: 10px;
    border: 1px solid #DDD8CE;
    padding: 12px 12px 10px;
    text-align: left;
    cursor: pointer;
    font-family: inherit;
    display: flex;
    flex-direction: column;
    gap: 4px;
    transition: box-shadow 0.15s, transform 0.12s;
    box-shadow: 0 1px 3px rgba(42,31,20,0.05);
  }
  .td-card:active { transform: scale(0.97); box-shadow: none; }
  .td-card-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 2px;
  }
  .td-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .td-badge {
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.04em;
    padding: 2px 5px;
    border-radius: 4px;
    text-transform: uppercase;
  }
  .td-badge-attente { background: #FFF0E8; color: #B45309; }
  .td-badge-bloque  { background: #FDECEA; color: #C0392B; }
  .td-titre {
    font-size: 13px;
    font-weight: 700;
    color: #2A1F14;
    line-height: 1.3;
    letter-spacing: -0.2px;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .td-org {
    font-size: 10px;
    color: #A09080;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin: 0;
  }
  .td-footer {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 4px;
  }
  .td-bar-wrap {
    flex: 1;
    height: 2px;
    background: #F0EBE3;
    border-radius: 1px;
    overflow: hidden;
  }
  .td-bar-fill {
    height: 100%;
    border-radius: 1px;
    transition: width 0.3s ease;
  }
  .td-count {
    font-size: 9px;
    color: #C0B8A8;
    font-weight: 600;
    flex-shrink: 0;
    letter-spacing: 0.02em;
  }
  .td-ech {
    font-size: 9px;
    color: #C0B8A8;
    font-weight: 500;
    margin-top: 1px;
  }

  /* ── Plus / Total ────────────────────────────────────────────────────── */
  .td-more-btn {
    display: block;
    width: 100%;
    margin-top: 12px;
    padding: 12px;
    background: transparent;
    border: 1.5px dashed #DDD8CE;
    border-radius: 10px;
    color: #A09080;
    font-size: 13px;
    font-weight: 500;
    font-family: inherit;
    cursor: pointer;
    transition: background 0.15s;
  }
  .td-more-btn:active { background: #F0EBE3; }
  .td-total-label {
    text-align: center;
    font-size: 12px;
    color: #C0B8A8;
    margin-top: 12px;
    padding-bottom: 4px;
  }

  /* ── Skeleton ────────────────────────────────────────────────────────── */
  .td-sk-card {
    background: linear-gradient(90deg, #DDD8CE 25%, #ede9e2 50%, #DDD8CE 75%);
    background-size: 200% 100%;
    animation: shimmer 1.4s infinite;
    border-radius: 10px;
    height: 110px;
  }
`
