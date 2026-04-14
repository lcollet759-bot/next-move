import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { haptic } from '../utils/haptic'

// ── Écran de félicitations ────────────────────────────────────────────────────
function EcranFelicitations({ totalFait, navigate }) {
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
          onClick={() => navigate('/aujourdhui')}
        >
          Retour à l'accueil
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

  // Liste construite une seule fois à l'ouverture (initializer useState)
  const [tasks]      = useState(() =>
    dossiersAujourdhui.flatMap(dossier =>
      dossier.taches
        .filter(t => !t.done)
        .map(t => ({ tache: t, dossier }))
    )
  )
  const [index,      setIndex]      = useState(0)
  const [completing, setCompleting] = useState(false)
  const [fait,       setFait]       = useState(0)   // compteur de tâches cochées

  const total   = tasks.length
  const current = tasks[index]

  // Toutes les tâches traitées (faites ou passées)
  if (!current) {
    return <EcranFelicitations totalFait={fait} navigate={navigate} />
  }

  const handleFait = async () => {
    if (completing) return
    haptic('success')
    setCompleting(true)
    await toggleTache(current.dossier.id, current.tache.id)
    setFait(n => n + 1)
    setCompleting(false)
    setIndex(i => i + 1)
  }

  const handlePasser = () => {
    haptic('light')
    setIndex(i => i + 1)
  }

  const progress = total > 0 ? (index / total) * 100 : 100

  return (
    <div className="focus-page">
      {/* En-tête */}
      <div className="focus-header">
        <button className="focus-quit" onClick={() => navigate('/aujourdhui')}>
          ← Quitter
        </button>
        <span className="focus-counter">{index + 1} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>/ {total}</span></span>
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
        </div>
      </div>

      {/* Boutons d'action */}
      <div className="focus-footer">
        <button
          className="focus-btn focus-passer"
          onClick={handlePasser}
          disabled={completing}
        >
          Passer
        </button>
        <button
          className="focus-btn focus-fait"
          onClick={handleFait}
          disabled={completing}
        >
          {completing ? '…' : 'Fait ✓'}
        </button>
      </div>

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

  /* Header */
  .focus-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 16px 22px 12px;
    flex-shrink: 0;
  }
  .focus-quit {
    border: none; background: none;
    font-size: 14px; color: var(--text-muted); cursor: pointer;
    padding: 6px 0; font-family: inherit;
  }
  .focus-counter {
    font-size: 14px; font-weight: 600; color: var(--text);
  }

  /* Barre */
  .focus-track {
    height: 3px; background: var(--border); flex-shrink: 0;
  }
  .focus-fill {
    height: 100%; background: var(--green);
    transition: width 0.35s cubic-bezier(0.4, 0, 0.2, 1);
  }

  /* Corps */
  .focus-body {
    flex: 1; display: flex;
    align-items: center; justify-content: center;
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
    font-size: 11px; font-weight: 700;
    color: var(--text-muted);
    text-transform: uppercase; letter-spacing: 2px;
    margin-bottom: 18px; line-height: 1.4;
  }
  .focus-tache-titre {
    font-size: 26px; font-weight: 600;
    color: var(--text); line-height: 1.25;
    letter-spacing: -0.6px;
  }

  /* Footer */
  .focus-footer {
    padding: 16px 22px calc(env(safe-area-inset-bottom, 0px) + 22px);
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
  .focus-passer {
    background: var(--gray-light, #F2F1EE);
    color: var(--text-muted); flex: 0.55;
  }
  .focus-fait {
    background: var(--green, #3D7A52);
    color: #fff; flex: 1;
  }

  /* Félicitations */
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
    font-size: 30px; font-weight: 700;
    color: var(--text); letter-spacing: -1px;
    margin-bottom: 10px;
  }
  .focus-done-sub {
    font-size: 15px; color: var(--text-muted); line-height: 1.5;
  }
`
