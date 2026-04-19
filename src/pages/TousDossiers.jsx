import { useState, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useApp } from '../context/AppContext'

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
      {dossier.echeance && (
        <span className="td-ech">
          {new Date(dossier.echeance + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
        </span>
      )}
    </button>
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

  const dossiersFiltres = useMemo(() => {
    let list = [...dossiers]

    // Filtre principal
    if      (filtre === 'tous')    list = list.filter(d => d.etat !== 'clos')
    else if (filtre === 'urgent')  list = list.filter(d => d.quadrant === 1 || d.quadrant === 3)
    else if (filtre === 'attente') list = list.filter(d => d.etat === 'attente_externe')
    else if (filtre === 'bloque')  list = list.filter(d => d.etat === 'bloque')

    // Recherche
    if (recherche.trim()) {
      const q = recherche.toLowerCase()
      list = list.filter(d =>
        d.titre.toLowerCase().includes(q) ||
        (d.organisme || '').toLowerCase().includes(q) ||
        (d.description || '').toLowerCase().includes(q)
      )
    }

    return list.sort((a, b) => a.quadrant - b.quadrant || b.updatedAt.localeCompare(a.updatedAt))
  }, [dossiers, filtre, recherche])

  const counts = useMemo(() => ({
    tous:    dossiers.filter(d => d.etat !== 'clos').length,
    urgent:  dossiers.filter(d => d.quadrant === 1 || d.quadrant === 3).length,
    attente: dossiers.filter(d => d.etat === 'attente_externe').length,
    bloque:  dossiers.filter(d => d.etat === 'bloque').length,
  }), [dossiers])

  const handleFiltreChange    = (key) => { setFiltre(key); setLimit(PAGE_SIZE) }
  const handleRechercheChange = (e)   => { setRecherche(e.target.value); setLimit(PAGE_SIZE) }

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
          <div className="td-search-wrap">
            <svg className="td-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2" strokeLinecap="round">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input className="td-search" placeholder="Rechercher…" disabled />
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

        {/* Recherche */}
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
              {recherche ? 'Aucun résultat pour cette recherche.' : 'Capturez votre premier dossier.'}
            </p>
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
