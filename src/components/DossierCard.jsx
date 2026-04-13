import { memo } from 'react'
import { useNavigate } from 'react-router-dom'
import EtatBadge from './EtatBadge'
import { haptic } from '../utils/haptic'

function formatEcheance(echeance) {
  if (!echeance) return null
  const d    = new Date(echeance + 'T00:00:00')
  const now  = new Date()
  const diff = Math.ceil((d - now) / (1000 * 60 * 60 * 24))
  if (diff < 0)  return { label: `En retard de ${-diff}j`, urgent: true }
  if (diff === 0) return { label: "Aujourd'hui",            urgent: true }
  if (diff === 1) return { label: 'Demain',                 urgent: true }
  return { label: `Dans ${diff}j`, urgent: false }
}

function getStatusColor(etat, ech) {
  if (etat === 'bloqué' || (ech && ech.urgent)) return 'red'
  if (etat === 'actionnable') return 'green'
  return 'gray'
}

export default memo(function DossierCard({ dossier, raison, showRaison = false }) {
  const navigate    = useNavigate()
  const ech         = formatEcheance(dossier.echeance)
  const tachesDone  = dossier.taches?.filter(t => t.done).length || 0
  const tachesTotal = dossier.taches?.length || 0
  const statusColor = getStatusColor(dossier.etat, ech)
  const showFooter  = tachesTotal > 0 || ech

  const handleClick = () => {
    haptic('light')
    navigate(`/dossiers/${dossier.id}`)
  }

  return (
    <div
      className={`dossier-card${dossier.quadrant === 4 ? ' dc-planifier' : ''}`}
      onClick={handleClick}
    >
      {/* Body */}
      <div className="dc-body">
        <div className="dc-top-row">
          <span className={`status-dot status-dot-${statusColor}`} />
          <h3 className="dc-titre">{dossier.titre}</h3>
        </div>

        {dossier.organisme && (
          <p className="dc-organisme">{dossier.organisme}</p>
        )}

        <div className="dc-badges">
          <EtatBadge etat={dossier.etat} />
        </div>

        {showRaison && (raison || dossier.raisonAujourdhui) && (
          <p className="dc-raison">{raison || dossier.raisonAujourdhui}</p>
        )}
      </div>

      {/* Footer */}
      {showFooter && (
        <div className="dc-footer">
          {tachesTotal > 0 && (
            <div className="dc-progress-bar">
              <div
                className="dc-progress-fill"
                style={{ width: `${(tachesDone / tachesTotal) * 100}%` }}
              />
            </div>
          )}
          <div className="dc-footer-row">
            {tachesTotal > 0 && (
              <span className="dc-task-count">{tachesDone}/{tachesTotal} tâches</span>
            )}
            {ech && (
              <span className={`dc-ech${ech.urgent ? ' dc-ech-urgent' : ''}`}>
                {ech.label}
              </span>
            )}
          </div>
        </div>
      )}

      <style>{`
        .dossier-card {
          background: var(--surface);
          border-radius: var(--radius);
          border: 1px solid var(--border);
          box-shadow: var(--shadow);
          cursor: pointer;
          transition: box-shadow 0.15s, transform 0.1s;
          margin-bottom: 10px;
          overflow: hidden;
        }
        .dossier-card:active { transform: scale(0.98); box-shadow: none; }
        .dc-planifier { opacity: 0.5; }

        .dc-body { padding: 14px 16px; }

        .dc-top-row {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 6px;
        }
        .dc-titre {
          font-size: 16px;
          font-weight: 500;
          color: var(--text);
          line-height: 1.3;
        }
        .dc-organisme {
          font-size: 12px;
          color: var(--text-muted);
          margin-bottom: 8px;
        }
        .dc-badges { display: flex; gap: 6px; flex-wrap: wrap; }
        .dc-raison {
          font-size: 13px;
          color: var(--green);
          background: var(--green-light);
          border-radius: var(--radius-sm);
          padding: 8px 10px;
          margin-top: 8px;
          line-height: 1.4;
        }

        .dc-footer {
          background: #FDFCFA;
          border-top: 1px solid var(--border-light);
          padding: 8px 16px 10px;
        }
        .dc-progress-bar {
          height: 2px;
          background: var(--border);
          border-radius: 1px;
          overflow: hidden;
          margin-bottom: 7px;
        }
        .dc-progress-fill {
          height: 100%;
          background: var(--green);
          border-radius: 1px;
          transition: width 0.3s ease;
        }
        .dc-footer-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .dc-task-count { font-size: 11px; color: var(--text-muted); }
        .dc-ech        { font-size: 11px; color: var(--text-muted); }
        .dc-ech-urgent { color: var(--red); font-weight: 500; }
      `}</style>
    </div>
  )
})
