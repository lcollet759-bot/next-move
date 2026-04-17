import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'

// ── Helpers ────────────────────────────────────────────────────────────────

function formatDate(iso) {
  const d = new Date(iso)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  if (d.toDateString() === today.toDateString()) return "Aujourd'hui"
  if (d.toDateString() === yesterday.toDateString()) return 'Hier'
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
}

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

function getCategory(action) {
  if (action === 'Création') return 'creations'
  if (action === 'Tâche complétée' || action === 'Clôture') return 'actions'
  if (action === "Changement d'état" || action === 'Escalade') return 'statuts'
  return 'actions'
}

function getDotColor(action) {
  if (action === 'Création') return '#1C3829'
  return '#C4623A'
}

function getActionLabel(action, detail) {
  if (action === 'Création')           return 'Nouveau dossier'
  if (action === 'Clôture')            return 'Dossier clôturé'
  if (action === "Changement d'état")  return detail ? `État → ${detail}` : "Changement d'état"
  if (action === 'Tâche complétée')    return detail ? `✓ ${detail}` : 'Tâche complétée'
  if (action === 'Escalade')           return detail || 'Escalade de priorité'
  return action
}

// Highlight matching substring in text
function Highlight({ text, query }) {
  if (!query || !text) return <>{text}</>
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return <>{text}</>
  return (
    <>
      {text.slice(0, idx)}
      <mark className="jnl-mark">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  )
}

// ── Filters config ─────────────────────────────────────────────────────────

const FILTERS = [
  { id: 'tout',      label: 'Tout' },
  { id: 'creations', label: 'Créations' },
  { id: 'actions',   label: 'Actions' },
  { id: 'statuts',   label: 'Statuts' },
]

// ── Component ──────────────────────────────────────────────────────────────

export default function Journal() {
  const { journal, dossiers, loading } = useApp()
  const navigate = useNavigate()
  const [query,        setQuery]        = useState('')
  const [activeFilter, setActiveFilter] = useState('tout')

  const getDossierTitre = (id) =>
    dossiers.find(d => d.id === id)?.titre || 'Dossier supprimé'

  const hasDossier = (id) => dossiers.some(d => d.id === id)

  // Apply category filter + text search
  const filtered = useMemo(() => {
    let list = journal
    if (activeFilter !== 'tout') {
      list = list.filter(e => getCategory(e.action) === activeFilter)
    }
    const q = query.trim().toLowerCase()
    if (q) {
      list = list.filter(e => {
        const titre  = getDossierTitre(e.dossierId).toLowerCase()
        const label  = getActionLabel(e.action, e.detail).toLowerCase()
        const detail = (e.detail || '').toLowerCase()
        return titre.includes(q) || label.includes(q) || detail.includes(q)
      })
    }
    return list
  }, [journal, query, activeFilter, dossiers]) // eslint-disable-line

  // Group filtered entries by calendar day
  const grouped = useMemo(() => {
    const groups = {}
    for (const entry of filtered) {
      const key = new Date(entry.timestamp).toDateString()
      if (!groups[key]) groups[key] = { label: formatDate(entry.timestamp), entries: [] }
      groups[key].entries.push(entry)
    }
    return Object.values(groups)
  }, [filtered])

  if (loading) {
    return <div className="page"><div className="loading-center"><div className="spinner" /></div></div>
  }

  const hasQuery  = query.trim().length > 0
  const q         = query.trim()

  return (
    <div className="page">

      {/* ── Header ── */}
      <header className="jnl-header">

        {/* Logo + title + total count */}
        <div className="jnl-header-top">
          <div className="jnl-brand">
            <span className="jnl-logo-mark">»</span>
            <span className="jnl-title">Journal</span>
          </div>
          <span className="jnl-total">{journal.length}</span>
        </div>

        {/* Search bar */}
        <div className="jnl-search-wrap">
          <svg className="jnl-search-ico" width="15" height="15" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            className="jnl-search-input"
            type="search"
            placeholder="Rechercher dans le journal…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            autoComplete="off"
          />
          {hasQuery && (
            <button className="jnl-search-clear" onClick={() => setQuery('')} aria-label="Effacer">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          )}
        </div>

        {/* Filter pills */}
        <div className="jnl-filters">
          {FILTERS.map(f => (
            <button
              key={f.id}
              className={`jnl-pill${activeFilter === f.id ? ' jnl-pill-active' : ''}`}
              onClick={() => setActiveFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>

      </header>

      {/* Search results banner */}
      {hasQuery && (
        <div className="section" style={{ paddingBottom: 0 }}>
          <p className="jnl-results-info">
            <strong>{filtered.length}</strong> résultat{filtered.length !== 1 ? 's' : ''} pour{' '}
            <em>« {q} »</em>
          </p>
        </div>
      )}

      {/* ── Body ── */}
      {grouped.length === 0 ? (
        <div className="empty-state">
          {hasQuery ? (
            <>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--border)"
                strokeWidth="1.5" strokeLinecap="round" style={{ marginBottom: 14 }}>
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <p className="empty-title">Aucun résultat</p>
              <p className="empty-text">Aucune entrée ne contient « {q} ».</p>
            </>
          ) : (
            <>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--border)"
                strokeWidth="1.5" strokeLinecap="round" style={{ marginBottom: 14 }}>
                <circle cx="12" cy="12" r="10"/>
                <polyline points="12 6 12 12 16 14"/>
              </svg>
              <p className="empty-title">Aucun historique</p>
              <p className="empty-text">Les actions sur vos dossiers apparaîtront ici.</p>
            </>
          )}
        </div>
      ) : (
        grouped.map((group, gi) => (
          <div key={gi} className="section">

            {/* Date label — small caps muted */}
            <div className="jnl-date-label">{group.label}</div>

            {/* Stacked group */}
            <div className="jnl-group">
              {group.entries.map((entry, ei) => {
                const id         = entry.dossierId
                const titre      = getDossierTitre(id)
                const canNav     = hasDossier(id)
                const dotColor   = getDotColor(entry.action)
                const label      = getActionLabel(entry.action, entry.detail)
                const isLast     = ei === group.entries.length - 1

                return (
                  <div
                    key={entry.id}
                    className={`jnl-entry${canNav ? ' jnl-entry-link' : ''}`}
                    onClick={() => canNav && navigate(`/dossiers/${id}`)}
                  >
                    {/* Coloured dot */}
                    <div className="jnl-dot" style={{ background: dotColor }} />

                    {/* Text */}
                    <div className="jnl-content">
                      <div className="jnl-action">
                        <Highlight text={label} query={hasQuery ? q : ''} />
                      </div>
                      <div className="jnl-dossier">
                        <Highlight text={titre} query={hasQuery ? q : ''} />
                      </div>
                    </div>

                    {/* Time */}
                    <div className="jnl-time">{formatTime(entry.timestamp)}</div>

                    {/* Separator (not after last item) */}
                    {!isLast && <div className="jnl-sep" />}
                  </div>
                )
              })}
            </div>

          </div>
        ))
      )}

      <style>{`
        /* ── Header ── */
        .jnl-header {
          position: sticky;
          top: 0;
          z-index: 10;
          background: #1C3829;
          color: #fff;
          padding: 14px 16px 0;
          flex-shrink: 0;
        }
        .jnl-header-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 12px;
        }
        .jnl-brand {
          display: flex;
          align-items: center;
          gap: 5px;
        }
        .jnl-logo-mark {
          font-size: 20px;
          font-weight: 700;
          color: #C4623A;
          letter-spacing: -1px;
          line-height: 1;
        }
        .jnl-title {
          font-size: 17px;
          font-weight: 600;
          color: #fff;
          letter-spacing: 0.2px;
        }
        .jnl-total {
          font-size: 13px;
          font-weight: 600;
          color: rgba(255,255,255,0.55);
          background: rgba(255,255,255,0.1);
          padding: 3px 10px;
          border-radius: 20px;
          min-width: 28px;
          text-align: center;
        }

        /* ── Search ── */
        .jnl-search-wrap {
          position: relative;
          display: flex;
          align-items: center;
          margin-bottom: 10px;
        }
        .jnl-search-ico {
          position: absolute;
          left: 11px;
          color: rgba(255,255,255,0.5);
          pointer-events: none;
        }
        .jnl-search-input {
          width: 100%;
          padding: 9px 36px 9px 34px;
          border: none;
          border-radius: 10px;
          background: rgba(255,255,255,0.13);
          font-size: 14px;
          font-family: inherit;
          color: #fff;
          outline: none;
          -webkit-appearance: none;
          transition: background 0.15s;
        }
        .jnl-search-input::placeholder { color: rgba(255,255,255,0.42); }
        .jnl-search-input:focus        { background: rgba(255,255,255,0.19); }
        .jnl-search-clear {
          position: absolute;
          right: 10px;
          border: none;
          background: transparent;
          cursor: pointer;
          color: rgba(255,255,255,0.6);
          display: flex;
          align-items: center;
          padding: 4px;
          border-radius: 4px;
          transition: color 0.1s;
        }
        .jnl-search-clear:active { color: #fff; }

        /* ── Filter pills ── */
        .jnl-filters {
          display: flex;
          gap: 6px;
          padding-bottom: 14px;
          overflow-x: auto;
          scrollbar-width: none;
        }
        .jnl-filters::-webkit-scrollbar { display: none; }
        .jnl-pill {
          padding: 5px 14px;
          border: none;
          border-radius: 20px;
          font-size: 12px;
          font-weight: 500;
          white-space: nowrap;
          cursor: pointer;
          flex-shrink: 0;
          background: rgba(255,255,255,0.12);
          color: rgba(255,255,255,0.6);
          transition: background 0.15s, color 0.15s;
        }
        .jnl-pill.jnl-pill-active {
          background: #fff;
          color: #1C3829;
        }

        /* ── Results info ── */
        .jnl-results-info {
          font-size: 13px;
          color: var(--text-muted);
          margin: 0;
        }
        .jnl-results-info em {
          font-style: normal;
          color: var(--text);
        }

        /* ── Date label ── */
        .jnl-date-label {
          font-size: 10px;
          font-weight: 600;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 1.3px;
          margin-bottom: 6px;
        }

        /* ── Group ── */
        .jnl-group {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 10px;
          overflow: hidden;
        }

        /* ── Entry ── */
        .jnl-entry {
          display: flex;
          align-items: center;
          gap: 11px;
          padding: 11px 14px;
          position: relative;
          transition: background 0.1s;
        }
        .jnl-entry-link { cursor: pointer; }
        .jnl-entry-link:active { background: #F5F2EC; }
        .jnl-dot {
          width: 9px;
          height: 9px;
          border-radius: 50%;
          flex-shrink: 0;
        }
        .jnl-content {
          flex: 1;
          min-width: 0;
        }
        .jnl-action {
          font-size: 13px;
          font-weight: 600;
          color: var(--text);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          line-height: 1.3;
        }
        .jnl-dossier {
          font-size: 12px;
          color: var(--text-muted);
          margin-top: 2px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          line-height: 1.3;
        }
        .jnl-time {
          font-size: 11px;
          color: var(--text-muted);
          flex-shrink: 0;
          opacity: 0.65;
        }
        .jnl-sep {
          position: absolute;
          bottom: 0;
          left: 34px;
          right: 0;
          height: 1px;
          background: var(--border);
        }

        /* ── Highlight mark ── */
        .jnl-mark {
          background: #E8F0EA;
          color: #1C3829;
          border-radius: 2px;
          padding: 0 1px;
          font-style: normal;
        }
      `}</style>
    </div>
  )
}
