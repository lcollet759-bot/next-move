import { useMemo } from 'react'
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

  const grouped = useMemo(() => {
    const groups = {}
    for (const entry of journal) {
      const key = new Date(entry.timestamp).toDateString()
      if (!groups[key]) groups[key] = { label: formatDate(entry.timestamp), entries: [] }
      groups[key].entries.push(entry)
    }
    return Object.values(groups)
  }, [journal])

  const getDossierTitre = (dossierId) => {
    return dossiers.find(d => d.id === dossierId)?.titre || 'Dossier supprimé'
  }

  if (loading) return <div className="page"><div className="loading-center"><div className="spinner" /></div></div>

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Journal</h1>
        <p className="page-subtitle">{journal.length} événement{journal.length > 1 ? 's' : ''}</p>
      </div>

      {grouped.length === 0 ? (
        <div className="empty-state">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--border)" strokeWidth="1.5" strokeLinecap="round" style={{ marginBottom: 14 }}>
            <circle cx="12" cy="12" r="10"/>
            <polyline points="12 6 12 12 16 14"/>
          </svg>
          <p className="empty-title">Aucun historique</p>
          <p className="empty-text">Les actions sur vos dossiers apparaîtront ici.</p>
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
