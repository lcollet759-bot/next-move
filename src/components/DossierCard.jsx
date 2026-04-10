import { memo } from 'react'
import { useNavigate } from 'react-router-dom'
import EtatBadge from './EtatBadge'
import QuadrantBadge from './QuadrantBadge'
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

export default memo(function DossierCard({ dossier, raison, showRaison = false }) {
  const navigate   = useNavigate()
  const ech        = formatEcheance(dossier.echeance)
  const tachesDone  = dossier.taches?.filter(t => t.done).length || 0
  const tachesTotal = dossier.taches?.length || 0

  const handleClick = () => {
    haptic('light')
    navigate(`/dossiers/${dossier.id}`)
  }

  return (
    <div className="dossier-card" onClick={handleClick}>
      <div className="dc-header">
        <div className="dc-badges">
          <QuadrantBadge quadrant={dossier.quadrant} />
          <EtatBadge etat={dossier.etat} />
        </div>
        {ech && (
          <span className={`dc-ech ${ech.urgent ? 'dc-ech-urgent' : ''}`}>
            {ech.label}
          </span>
        )}
      </div>

      <h3 className="dc-titre">{dossier.titre}</h3>

      {dossier.organisme && (
        <p className="dc-organisme">{dossier.organisme}</p>
      )}

      {showRaison && (raison || dossier.raisonAujourdhui) && (
        <p className="dc-raison">{raison || dossier.raisonAujourdhui}</p>
      )}

      {tachesTotal > 0 && (
        <div className="dc-progress">
          <div className="dc-progress-bar">
            <div
              className="dc-progress-fill"
              style={{ width: `${(tachesDone / tachesTotal) * 100}%` }}
            />
          </div>
          <span className="dc-progress-label">{tachesDone}/{tachesTotal} tâches</span>
        </div>
      )}

      <style>{`
        .dossier-card {
          background: var(--surface);
          border-radius: var(--radius);
          padding: 14px 16px;
          box-shadow: var(--shadow);
          border: 1px solid var(--border);
          cursor: pointer;
          transition: box-shadow 0.15s, transform 0.1s;
          margin-bottom: 10px;
        }
        .dossier-card:active { transform: scale(0.98); box-shadow: none; }
        .dc-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 8px;
          flex-wrap: wrap;
          gap: 6px;
        }
        .dc-badges { display: flex; gap: 6px; flex-wrap: wrap; }
        .dc-ech { font-size: 11px; color: var(--text-muted); }
        .dc-ech-urgent { color: var(--red); font-weight: 500; }
        .dc-titre {
          font-size: 16px;
          font-weight: 600;
          color: var(--text);
          line-height: 1.3;
          margin-bottom: 4px;
        }
        .dc-organisme { font-size: 13px; color: var(--text-muted); margin-bottom: 6px; }
        .dc-raison {
          font-size: 13px;
          color: var(--green);
          background: var(--green-light);
          border-radius: var(--radius-sm);
          padding: 8px 10px;
          margin-top: 8px;
          line-height: 1.4;
        }
        .dc-progress { display: flex; align-items: center; gap: 8px; margin-top: 10px; }
        .dc-progress-bar {
          flex: 1;
          height: 4px;
          background: var(--border);
          border-radius: 2px;
          overflow: hidden;
        }
        .dc-progress-fill {
          height: 100%;
          background: var(--green);
          border-radius: 2px;
          transition: width 0.3s ease;
        }
        .dc-progress-label { font-size: 11px; color: var(--text-muted); white-space: nowrap; }
      `}</style>
    </div>
  )
})
