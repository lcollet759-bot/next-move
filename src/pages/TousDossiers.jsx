import { useState, useMemo } from 'react'
import { useApp } from '../context/AppContext'
import DossierCard from '../components/DossierCard'

const FILTRES = [
  { key: 'actifs',          label: 'Actifs' },
  { key: 'actionnable',     label: 'À traiter' },
  { key: 'attente_externe', label: 'En attente' },
  { key: 'bloque',          label: 'Bloqués' },
  { key: 'surveille',       label: 'Surveillés' },
  { key: 'clos',            label: 'Clôturés' },
]

const PAGE_SIZE = 20

function SkeletonCard() {
  return (
    <div style={{ background: 'linear-gradient(90deg, var(--border) 25%, #f0f0ee 50%, var(--border) 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.4s infinite', borderRadius: 'var(--radius)', height: 90, marginBottom: 10 }} />
  )
}

export default function TousDossiers() {
  const { dossiers, loading } = useApp()
  const [filtre,    setFiltre]    = useState('actifs')
  const [recherche, setRecherche] = useState('')
  const [limit,     setLimit]     = useState(PAGE_SIZE)

  const dossiersFiltres = useMemo(() => {
    let list = [...dossiers]
    if (filtre === 'actifs') list = list.filter(d => d.etat !== 'clos')
    else list = list.filter(d => d.etat === filtre)

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

  // Reset pagination when filter/search changes
  const handleFiltreChange = (key) => { setFiltre(key); setLimit(PAGE_SIZE) }
  const handleRechercheChange = (e) => { setRecherche(e.target.value); setLimit(PAGE_SIZE) }

  const counts = useMemo(() => ({
    actifs:          dossiers.filter(d => d.etat !== 'clos').length,
    actionnable:     dossiers.filter(d => d.etat === 'actionnable').length,
    attente_externe: dossiers.filter(d => d.etat === 'attente_externe').length,
    bloque:          dossiers.filter(d => d.etat === 'bloque').length,
    surveille:       dossiers.filter(d => d.etat === 'surveille').length,
    clos:            dossiers.filter(d => d.etat === 'clos').length,
  }), [dossiers])

  const visible    = dossiersFiltres.slice(0, limit)
  const hasMore    = dossiersFiltres.length > limit

  if (loading) {
    return (
      <div className="page">
        <div className="page-header">
          <h1 className="page-title">Dossiers</h1>
        </div>
        <div className="section">
          {[1,2,3,4].map(i => <SkeletonCard key={i} />)}
        </div>
        <style>{`@keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }`}</style>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Dossiers</h1>
        <p className="page-subtitle">{dossiers.length} dossier{dossiers.length > 1 ? 's' : ''} au total</p>
      </div>

      {/* Recherche */}
      <div className="section">
        <div className="search-wrapper">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            className="input"
            style={{ paddingLeft: 36 }}
            placeholder="Rechercher…"
            value={recherche}
            onChange={handleRechercheChange}
          />
        </div>
      </div>

      {/* Filtres */}
      <div className="filtres-scroll">
        {FILTRES.map(f => (
          <button
            key={f.key}
            className={`filtre-btn ${filtre === f.key ? 'filtre-active' : ''}`}
            onClick={() => handleFiltreChange(f.key)}
          >
            {f.label}
            {counts[f.key] > 0 && <span className="filtre-count">{counts[f.key]}</span>}
          </button>
        ))}
      </div>

      {/* Liste */}
      <div className="section">
        {visible.length === 0 ? (
          <div className="empty-state">
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
            {visible.map(d => <DossierCard key={d.id} dossier={d} />)}
            {hasMore && (
              <button
                className="btn btn-ghost btn-full"
                style={{ marginTop: 4 }}
                onClick={() => setLimit(l => l + PAGE_SIZE)}
              >
                Afficher {Math.min(PAGE_SIZE, dossiersFiltres.length - limit)} dossiers de plus
              </button>
            )}
            {dossiersFiltres.length > PAGE_SIZE && !hasMore && (
              <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
                {dossiersFiltres.length} dossiers affichés
              </p>
            )}
          </>
        )}
      </div>

      <style>{`
        .search-wrapper { position: relative; margin-bottom: 4px; }
        .filtres-scroll {
          display: flex;
          gap: 6px;
          padding: 12px 16px;
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
          scrollbar-width: none;
        }
        .filtres-scroll::-webkit-scrollbar { display: none; }
        .filtre-btn {
          display: flex;
          align-items: center;
          gap: 5px;
          padding: 6px 14px;
          border-radius: 20px;
          border: 1.5px solid var(--border);
          background: var(--surface);
          font-size: 13px;
          font-weight: 500;
          color: var(--text-muted);
          white-space: nowrap;
          transition: all 0.15s;
          cursor: pointer;
        }
        .filtre-active { background: var(--green); border-color: var(--green); color: #fff; }
        .filtre-count {
          background: rgba(255,255,255,0.3);
          border-radius: 10px;
          padding: 1px 6px;
          font-size: 11px;
        }
        .filtre-active .filtre-count { background: rgba(255,255,255,0.25); }
      `}</style>
    </div>
  )
}
