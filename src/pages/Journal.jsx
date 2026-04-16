import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'

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

const ACTION_ICONS = {
  'Création': '✦',
  'Clôture': '✓',
  'Changement d\'état': '→',
  'Tâche complétée': '☑',
}

export default function Journal() {
  const { journal, dossiers, loading } = useApp()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')

  const getDossierTitre = (dossierId) =>
    dossiers.find(d => d.id === dossierId)?.titre || 'Dossier supprimé'

  // Filtrage temps réel : cherche dans action, detail et titre du dossier
  const filteredJournal = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return journal
    return journal.filter(entry => {
      const titre = getDossierTitre(entry.dossierId).toLowerCase()
      return (
        entry.action.toLowerCase().includes(q) ||
        (entry.detail || '').toLowerCase().includes(q) ||
        titre.includes(q)
      )
    })
  }, [journal, query, dossiers]) // eslint-disable-line

  const grouped = useMemo(() => {
    const groups = {}
    for (const entry of filteredJournal) {
      const key = new Date(entry.timestamp).toDateString()
      if (!groups[key]) groups[key] = { label: formatDate(entry.timestamp), entries: [] }
      groups[key].entries.push(entry)
    }
    return Object.values(groups)
  }, [filteredJournal])

  if (loading) return <div className="page"><div className="loading-center"><div className="spinner" /></div></div>

  const totalFiltre = filteredJournal.length
  const hasQuery    = query.trim().length > 0

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Journal</h1>
        <p className="page-subtitle">
          {hasQuery
            ? `${totalFiltre} résultat${totalFiltre !== 1 ? 's' : ''} pour « ${query.trim()} »`
            : `${journal.length} événement${journal.length !== 1 ? 's' : ''}`
          }
        </p>
      </div>

      {/* Barre de recherche */}
      <div className="section" style={{ paddingTop: 0 }}>
        <div className="journal-search-wrap">
          <svg className="journal-search-icon" width="15" height="15" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            className="journal-search-input"
            type="search"
            placeholder="Rechercher dans le journal…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            autoComplete="off"
          />
          {hasQuery && (
            <button className="journal-search-clear" onClick={() => setQuery('')} aria-label="Effacer">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          )}
        </div>
      </div>

      {grouped.length === 0 ? (
        <div className="empty-state">
          {hasQuery ? (
            <>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--border)" strokeWidth="1.5"
                strokeLinecap="round" style={{ marginBottom: 14 }}>
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <p className="empty-title">Aucun résultat</p>
              <p className="empty-text">Aucune entrée ne contient « {query.trim()} ».</p>
            </>
          ) : (
            <>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--border)" strokeWidth="1.5"
                strokeLinecap="round" style={{ marginBottom: 14 }}>
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
            <div className="journal-date-label">{group.label}</div>
            <div className="card" style={{ padding: '4px 0' }}>
              {group.entries.map((entry, ei) => {
                const dossierId = entry.dossierId
                const titre = getDossierTitre(dossierId)
                const icon = ACTION_ICONS[entry.action] || '·'
                const hasDossier = dossiers.some(d => d.id === dossierId)

                return (
                  <div
                    key={entry.id}
                    className={`journal-entry ${hasDossier ? 'journal-entry-link' : ''}`}
                    onClick={() => hasDossier && navigate(`/dossiers/${dossierId}`)}
                  >
                    <div className="je-icon">{icon}</div>
                    <div className="je-content">
                      <div className="je-action">{entry.action}</div>
                      <div className="je-titre">{titre}</div>
                      {entry.detail && <div className="je-detail">{entry.detail}</div>}
                    </div>
                    <div className="je-time">{formatTime(entry.timestamp)}</div>
                    {ei < group.entries.length - 1 && (
                      <div style={{ position: 'absolute', bottom: 0, left: 44, right: 16, height: 1, background: 'var(--border)' }} />
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))
      )}

      <style>{`
        .journal-date-label {
          font-size: 13px;
          font-weight: 600;
          color: var(--text-muted);
          margin-bottom: 8px;
          text-transform: capitalize;
        }

        /* Barre de recherche */
        .journal-search-wrap {
          position: relative;
          display: flex;
          align-items: center;
        }
        .journal-search-icon {
          position: absolute;
          left: 12px;
          color: var(--text-muted);
          pointer-events: none;
          flex-shrink: 0;
        }
        .journal-search-input {
          width: 100%;
          padding: 10px 36px 10px 36px;
          border: 1.5px solid var(--border);
          border-radius: var(--radius-sm);
          background: var(--surface);
          font-size: 14px;
          font-family: inherit;
          color: var(--text);
          outline: none;
          transition: border-color 0.15s;
          -webkit-appearance: none;
        }
        .journal-search-input::placeholder { color: var(--text-muted); }
        .journal-search-input:focus { border-color: var(--green); }
        .journal-search-clear {
          position: absolute;
          right: 10px;
          border: none;
          background: none;
          cursor: pointer;
          color: var(--text-muted);
          display: flex;
          align-items: center;
          padding: 4px;
          border-radius: 4px;
          transition: color 0.15s;
        }
        .journal-search-clear:hover { color: var(--text); }

        .journal-entry {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          padding: 12px 16px;
          position: relative;
          transition: background 0.1s;
        }
        .journal-entry-link { cursor: pointer; }
        .journal-entry-link:active { background: var(--gray-light); }
        .je-icon {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          background: var(--green-light);
          color: var(--green);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 13px;
          flex-shrink: 0;
          margin-top: 1px;
        }
        .je-content { flex: 1; min-width: 0; }
        .je-action { font-size: 12px; font-weight: 500; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.04em; }
        .je-titre { font-size: 14px; font-weight: 500; color: var(--text); margin-top: 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .je-detail { font-size: 12px; color: var(--text-muted); margin-top: 2px; }
        .je-time { font-size: 11px; color: var(--border); flex-shrink: 0; margin-top: 3px; }
      `}</style>
    </div>
  )
}
