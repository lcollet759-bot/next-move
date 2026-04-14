import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { haptic } from '../utils/haptic'
import { savePlanning } from '../services/db'
import { recalculerApresExtension } from '../services/planning'
import DossierSheet from '../components/DossierSheet'

const PLANNING_KEY = (date) => `nm-planning-${date}`

// ── Écran de félicitations ────────────────────────────────────────────────────
function EcranFelicitations({ totalFait, navigate, fromPlanning }) {
  return (
    <div className="focus-page">
      <div className="focus-done-wrap">
        <div className="focus-done-circle">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </div>
        <h2 className="focus-done-title">Journée accomplie !</h2>
        <p className="focus-done-sub">
          {totalFait > 0
            ? `${totalFait} tâche${totalFait > 1 ? 's' : ''} terminée${totalFait > 1 ? 's' : ''} aujourd'hui.`
            : 'Aucune tâche en cours pour aujourd\'hui.'}
        </p>
        <button
          className="btn btn-primary"
          style={{ marginTop: 32, width: '100%', padding: '15px' }}
          onClick={() => navigate(fromPlanning ? '/planning' : '/aujourdhui')}
        >
          {fromPlanning ? 'Retour au planning' : "Retour à l'accueil"}
        </button>
      </div>
      <style>{focusCSS}</style>
    </div>
  )
}

// ── Page principale Mode Focus ────────────────────────────────────────────────
export default function ModeFocus() {
  const { dossiersAujourdhui, toggleTache } = useApp()
  const navigate = useNavigate()
  const location = useLocation()

  // ── Mode planning (lancé depuis /planning) ───────────────────────────────
  const planningDate = location.state?.planningDate || null

  const [planningData, setPlanningData] = useState(() => {
    if (!planningDate) return null
    try { return JSON.parse(localStorage.getItem(PLANNING_KEY(planningDate))) } catch { return null }
  })

  // ── Liste de tâches gelée à l'ouverture ─────────────────────────────────
  const [tasks] = useState(() => {
    if (planningData) {
      return planningData.tachesPlanifiees
        .filter(tp => !tp.done)
        .map(tp => ({
          tache:   { id: tp.tacheId,   titre: tp.titreTache,   done: false },
          dossier: { id: tp.dossierId, titre: tp.titreDossier, organisme: tp.organisme, quadrant: tp.quadrant },
        }))
    }
    return dossiersAujourdhui.flatMap(dossier =>
      dossier.taches
        .filter(t => !t.done)
        .map(t => ({ tache: t, dossier }))
    )
  })

  const [index,      setIndex]      = useState(0)
  const [completing, setCompleting] = useState(false)
  const [fait,       setFait]       = useState(0)
  const [showPlus,   setShowPlus]   = useState(false)
  const [showSheet,  setShowSheet]  = useState(false)

  const total   = tasks.length
  const current = tasks[index]

  if (!current) {
    return <EcranFelicitations totalFait={fait} navigate={navigate} fromPlanning={!!planningDate} />
  }

  // ── Fait ✓ ───────────────────────────────────────────────────────────────
  const handleFait = async () => {
    if (completing) return
    haptic('success')
    setCompleting(true)
    await toggleTache(current.dossier.id, current.tache.id)
    setFait(n => n + 1)
    setCompleting(false)
    setIndex(i => i + 1)
  }

  const handlePasser = () => { haptic('light'); setIndex(i => i + 1) }

  // ── Temps supplémentaire ─────────────────────────────────────────────────
  const handlePlusTemps = async (dureeSupp) => {
    setShowPlus(false)
    if (!planningData || !current) return

    const updated     = recalculerApresExtension(planningData.tachesPlanifiees, current.tache.id, dureeSupp)
    const newPlanning = { ...planningData, tachesPlanifiees: updated }

    localStorage.setItem(PLANNING_KEY(planningDate), JSON.stringify(newPlanning))
    setPlanningData(newPlanning)

    try { await savePlanning(newPlanning) } catch (e) { console.error(e) }

    try {
      if (Notification.permission === 'granted') {
        new Notification('Planning ajusté', {
          body: 'Ton planning a été recalculé.',
          icon: '/favicon.svg',
          badge: '/favicon.svg',
        })
      }
    } catch {}
  }

  const progress = total > 0 ? (index / total) * 100 : 100

  // Créneau de la tâche courante (si mode planning)
  const creneau = planningData
    ? planningData.tachesPlanifiees.find(t => t.tacheId === current.tache.id)
    : null

  return (
    <div className="focus-page">
      {/* En-tête */}
      <div className="focus-header">
        <button className="focus-quit" onClick={() => navigate(planningDate ? '/planning' : '/aujourdhui')}>
          ← Quitter
        </button>
        <span className="focus-counter">
          {index + 1} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>/ {total}</span>
        </span>
      </div>

      {/* Barre de progression */}
      <div className="focus-track">
        <div className="focus-fill" style={{ width: `${progress}%` }} />
      </div>

      {/* Carte tâche */}
      <div className="focus-body">
        <div className="focus-card">
          <p className="focus-dossier-label">
            {current.dossier.titre}
            {current.dossier.organisme && (
              <span style={{ color: 'var(--border)', fontWeight: 400 }}> · {current.dossier.organisme}</span>
            )}
          </p>
          <p className="focus-tache-titre">{current.tache.titre}</p>

          {/* Lien dossier parent → ouvre le panneau */}
          <button className="focus-dossier-link" onClick={() => setShowSheet(true)}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
            </svg>
            {current.dossier.titre}
            {current.dossier.organisme && (
              <span style={{ opacity: 0.6 }}> · {current.dossier.organisme}</span>
            )}
          </button>

          {creneau && (
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 8 }}>
              {creneau.heureDebut} – {creneau.heureFin}
            </p>
          )}
        </div>
      </div>

      {/* Boutons Passer / Fait */}
      <div className="focus-footer">
        <button className="focus-btn focus-passer" onClick={handlePasser} disabled={completing}>
          Passer
        </button>
        <button className="focus-btn focus-fait" onClick={handleFait} disabled={completing}>
          {completing ? '…' : 'Fait ✓'}
        </button>
      </div>

      {/* "J'ai besoin de plus de temps" — mode planning uniquement */}
      {planningDate && (
        <div className="focus-plus-wrap">
          <button className="focus-plus-btn" onClick={() => setShowPlus(true)} disabled={completing}>
            J'ai besoin de plus de temps
          </button>
        </div>
      )}

      {/* Modal temps supplémentaire */}
      {showPlus && (
        <div className="overlay" onClick={() => setShowPlus(false)}>
          <div className="sheet" onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 6 }}>Temps supplémentaire</h3>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.4 }}>
              Les tâches suivantes seront décalées en conséquence.
            </p>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              {[15, 30, 45, 60].map(m => (
                <button
                  key={m}
                  className="btn btn-secondary"
                  style={{ flex: 1, padding: '12px 4px', fontSize: 15, fontWeight: 600 }}
                  onClick={() => handlePlusTemps(m)}
                >
                  +{m} min
                </button>
              ))}
            </div>
            <button className="btn btn-ghost btn-full btn-sm" onClick={() => setShowPlus(false)}>
              Annuler
            </button>
          </div>
        </div>
      )}

      {/* Panneau dossier contextuel */}
      {showSheet && (
        <DossierSheet
          dossierId={current.dossier.id}
          onClose={() => setShowSheet(false)}
        />
      )}

      <style>{focusCSS}</style>
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────
const focusCSS = `
  .focus-page {
    position: fixed; inset: 0;
    background: var(--bg, #F9F8F5);
    display: flex; flex-direction: column;
    z-index: 200;
  }
  .focus-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 16px 22px 12px; flex-shrink: 0;
  }
  .focus-quit {
    border: none; background: none;
    font-size: 14px; color: var(--text-muted); cursor: pointer;
    padding: 6px 0; font-family: inherit;
  }
  .focus-counter { font-size: 14px; font-weight: 600; color: var(--text); }
  .focus-track { height: 3px; background: var(--border); flex-shrink: 0; }
  .focus-fill {
    height: 100%; background: var(--green);
    transition: width 0.35s cubic-bezier(0.4, 0, 0.2, 1);
  }
  .focus-body {
    flex: 1; display: flex; align-items: center; justify-content: center;
    padding: 28px 22px;
  }
  .focus-card {
    width: 100%; max-width: 480px;
    background: var(--surface); border-radius: 22px;
    padding: 36px 28px; border: 1px solid var(--border);
    box-shadow: 0 8px 32px rgba(0,0,0,0.07);
    animation: focusIn 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  }
  @keyframes focusIn {
    from { opacity: 0; transform: translateY(10px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  .focus-dossier-label {
    font-size: 11px; font-weight: 700; color: var(--text-muted);
    text-transform: uppercase; letter-spacing: 2px;
    margin-bottom: 18px; line-height: 1.4;
  }
  .focus-tache-titre {
    font-size: 26px; font-weight: 600; color: var(--text);
    line-height: 1.25; letter-spacing: -0.6px;
  }
  .focus-dossier-link {
    display: inline-flex; align-items: center; gap: 5px;
    margin-top: 14px;
    border: none; background: none; padding: 0;
    font-size: 12px; font-weight: 500; color: var(--text-muted);
    cursor: pointer; font-family: inherit;
    text-decoration: underline; text-decoration-color: var(--border);
    text-underline-offset: 2px;
    transition: color 0.15s;
    max-width: 100%; text-align: left;
  }
  .focus-dossier-link:hover { color: var(--text); }
  .focus-footer {
    padding: 16px 22px 8px;
    display: flex; gap: 10px; flex-shrink: 0;
  }
  .focus-btn {
    flex: 1; padding: 17px 12px;
    border: none; border-radius: 16px;
    font-size: 16px; font-weight: 600;
    cursor: pointer; font-family: inherit;
    transition: transform 0.12s, opacity 0.15s;
  }
  .focus-btn:active { transform: scale(0.97); }
  .focus-btn:disabled { opacity: 0.45; pointer-events: none; }
  .focus-passer { background: var(--gray-light, #F2F1EE); color: var(--text-muted); flex: 0.55; }
  .focus-fait   { background: var(--green, #3D7A52); color: #fff; flex: 1; }
  .focus-plus-wrap {
    padding: 0 22px calc(env(safe-area-inset-bottom, 0px) + 16px);
    text-align: center; flex-shrink: 0;
  }
  .focus-plus-btn {
    border: none; background: none;
    font-size: 13px; color: var(--text-muted); cursor: pointer;
    font-family: inherit; padding: 6px 12px;
    text-decoration: underline; text-decoration-color: var(--border);
    transition: color 0.15s;
  }
  .focus-plus-btn:hover  { color: var(--text); }
  .focus-plus-btn:disabled { opacity: 0.4; pointer-events: none; }
  .focus-done-wrap {
    flex: 1; display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    padding: 40px 28px; text-align: center;
  }
  .focus-done-circle {
    width: 72px; height: 72px; border-radius: 50%;
    background: var(--green); display: flex;
    align-items: center; justify-content: center;
    margin-bottom: 24px;
    animation: popIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  @keyframes popIn {
    from { transform: scale(0); opacity: 0; }
    to   { transform: scale(1); opacity: 1; }
  }
  .focus-done-title {
    font-size: 30px; font-weight: 700; color: var(--text);
    letter-spacing: -1px; margin-bottom: 10px;
  }
  .focus-done-sub { font-size: 15px; color: var(--text-muted); line-height: 1.5; }
`
