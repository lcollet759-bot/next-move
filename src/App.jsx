import { useState, useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import { useApp } from './context/AppContext'
import { shouldShowWeeklyReview, markWeeklyReviewShown } from './services/notifications'
import Navigation from './components/Navigation'
import ScrollToTop from './components/ScrollToTop'
import Login from './pages/Login'
import Aujourdhui from './pages/Aujourdhui'
import Capturer from './pages/Capturer'
import TousDossiers from './pages/TousDossiers'
import DossierDetail from './pages/DossierDetail'
import Journal from './pages/Journal'
import Reglages from './pages/Reglages'
import ModeFocus from './pages/ModeFocus'
import Planning from './pages/Planning'

// ── Revue hebdomadaire Q4 ─────────────────────────────────────────────────────
function weeksSince(dateStr) {
  if (!dateStr) return null
  const diff = Date.now() - new Date(dateStr).getTime()
  return Math.max(0, Math.floor(diff / (7 * 24 * 60 * 60 * 1000)))
}

function WeeklyReviewModal({ dossiers, onClose, mettreAJourDossier, supprimerDossier }) {
  const [step,          setStep]          = useState('intro')
  const [currentIndex,  setCurrentIndex]  = useState(0)
  const [items]                           = useState(dossiers)
  const [planifOpen,    setPlanifOpen]    = useState(false)
  const [planifDate,    setPlanifDate]    = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [stats,         setStats]         = useState({ promus: 0, supprimes: 0, reportes: 0 })

  const total   = items.length
  const current = items[currentIndex]

  const advance = (stat) => {
    if (stat) setStats(s => ({ ...s, [stat]: s[stat] + 1 }))
    setPlanifOpen(false); setPlanifDate(''); setConfirmDelete(false)
    if (currentIndex < total - 1) setCurrentIndex(i => i + 1)
    else setStep('done')
  }

  const handlePrioriser = async () => {
    try { await mettreAJourDossier(current.id, { importance: true }) } catch {}
    advance('promus')
  }
  const handlePlanifierConfirm = async () => {
    if (!planifDate) return
    try { await mettreAJourDossier(current.id, { echeance: planifDate, importance: true }) } catch {}
    advance('reportes')
  }
  const handleReporter = () => advance(null)
  const handleSupprimerConfirm = async () => {
    try { await supprimerDossier(current.id) } catch {}
    advance('supprimes')
  }

  const weeks = current ? weeksSince(current.updated_at || current.created_at) : null

  const statLine = [
    stats.promus    > 0 && `${stats.promus} promu${stats.promus > 1 ? 's' : ''}`,
    stats.supprimes > 0 && `${stats.supprimes} supprimé${stats.supprimes > 1 ? 's' : ''}`,
    stats.reportes  > 0 && `${stats.reportes} reporté${stats.reportes > 1 ? 's' : ''}`,
  ].filter(Boolean).join(' · ') || 'Aucun changement.'

  return (
    <div className="weekly-overlay">
      <div className="weekly-sheet">

        {/* ── ÉCRAN 1 — Intro ───────────────────────────────────────── */}
        {step === 'intro' && (
          <>
            <div className="weekly-header">
              <div className="weekly-header-brand">
                <span className="weekly-logo-mark">»</span>
                <span className="weekly-header-title">Revue de la semaine</span>
              </div>
            </div>
            <div className="weekly-body">
              <p className="weekly-intro-title">Bon lundi.</p>
              <p className="weekly-intro-sub">
                Tu as <strong>{total}</strong> dossier{total > 1 ? 's' : ''} "Plus tard"
                {' '}qui {total > 1 ? 'attendent' : 'attend'} une décision. Ça prend 2 minutes.
              </p>
              <div className="weekly-intro-actions">
                <button className="weekly-btn-secondary" onClick={onClose}>Plus tard</button>
                <button className="weekly-btn-primary" onClick={() => setStep('review')}>On y va →</button>
              </div>
            </div>
          </>
        )}

        {/* ── ÉCRAN 2 — Revue dossier par dossier ──────────────────── */}
        {step === 'review' && current && (
          <>
            <div className="weekly-header">
              <div className="weekly-header-brand">
                <span className="weekly-logo-mark">»</span>
                <span className="weekly-header-title">Revue de la semaine</span>
              </div>
              <span className="weekly-counter">{currentIndex + 1} / {total}</span>
            </div>

            <div className="weekly-progress">
              {items.map((_, i) => (
                <div key={i} className={`weekly-progress-seg${i < currentIndex ? ' weekly-progress-seg-done' : ''}`} />
              ))}
            </div>

            <div className="weekly-body">
              <div className="weekly-dossier-card">
                <p className="weekly-card-label">
                  PLUS TARD
                  {weeks !== null && ` · SANS ACTION DEPUIS ${weeks < 1 ? 'MOINS D\'1 SEMAINE' : `${weeks} SEMAINE${weeks > 1 ? 'S' : ''}`}`}
                </p>
                <p className="weekly-card-title">{current.titre}</p>
                {current.organisme && <p className="weekly-card-org">{current.organisme}</p>}
              </div>

              <p className="weekly-actions-label">QUE FAIRE DE CE DOSSIER ?</p>

              {/* Action 1 — Prioriser */}
              <button className="weekly-action" onClick={handlePrioriser}>
                <span className="weekly-action-dot weekly-dot-green" />
                <div className="weekly-action-text">
                  <p className="weekly-action-title">C'est important → le traiter</p>
                  <p className="weekly-action-sub">Passe en "Important"</p>
                </div>
              </button>

              {/* Action 2 — Planifier */}
              <button
                className={`weekly-action${planifOpen ? ' weekly-action-open' : ''}`}
                onClick={() => { setPlanifOpen(o => !o); setConfirmDelete(false) }}
              >
                <span className="weekly-action-dot weekly-dot-amber" />
                <div className="weekly-action-text">
                  <p className="weekly-action-title">Planifier à une date précise</p>
                  <p className="weekly-action-sub">Je te rappelle à cette date</p>
                </div>
              </button>
              {planifOpen && (
                <div className="weekly-date-row">
                  <input
                    type="date"
                    className="input weekly-date-input"
                    value={planifDate}
                    onChange={e => setPlanifDate(e.target.value)}
                    autoFocus
                  />
                  <button className="weekly-btn-primary weekly-btn-sm" onClick={handlePlanifierConfirm} disabled={!planifDate}>OK</button>
                  <button className="weekly-btn-secondary weekly-btn-sm" onClick={() => setPlanifOpen(false)}>✕</button>
                </div>
              )}

              {/* Action 3 — Reporter */}
              <button className="weekly-action" onClick={handleReporter}>
                <span className="weekly-action-dot weekly-dot-sand" />
                <div className="weekly-action-text">
                  <p className="weekly-action-title">Revient lundi prochain</p>
                  <p className="weekly-action-sub">Reporter à la prochaine revue</p>
                </div>
              </button>

              {/* Action 4 — Supprimer */}
              <button
                className={`weekly-action weekly-action-delete${confirmDelete ? ' weekly-action-open' : ''}`}
                onClick={() => { setConfirmDelete(o => !o); setPlanifOpen(false) }}
              >
                <span className="weekly-action-dot weekly-dot-terra" />
                <div className="weekly-action-text">
                  <p className="weekly-action-title weekly-action-title-delete">Ce n'est plus pertinent</p>
                  <p className="weekly-action-sub">Supprimer le dossier</p>
                </div>
              </button>
              {confirmDelete && (
                <div className="weekly-confirm-row">
                  <p className="weekly-confirm-text">Supprimer définitivement ?</p>
                  <button className="weekly-btn-danger weekly-btn-sm" onClick={handleSupprimerConfirm}>Supprimer</button>
                  <button className="weekly-btn-secondary weekly-btn-sm" onClick={() => setConfirmDelete(false)}>Annuler</button>
                </div>
              )}
            </div>
          </>
        )}

        {/* ── ÉCRAN 3 — Fin ────────────────────────────────────────── */}
        {step === 'done' && (
          <>
            <div className="weekly-header weekly-header-done">
              <div className="weekly-done-check-circle">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              </div>
              <p className="weekly-done-title">Revue terminée.</p>
              <p className="weekly-done-sub">{statLine} Ta tête est plus légère.</p>
            </div>
            <div className="weekly-body">
              <button className="weekly-btn-primary weekly-btn-full" onClick={onClose}>
                Démarrer la semaine →
              </button>
            </div>
          </>
        )}

      </div>
    </div>
  )
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const { isAuthenticated } = useAuth()

  if (!isAuthenticated) {
    return (
      <Routes>
        <Route path="*" element={<Login />} />
      </Routes>
    )
  }

  return <AuthenticatedApp />
}

function AuthenticatedApp() {
  const { dossiers, loading, mettreAJourDossier, supprimerDossier } = useApp()
  const [reviewDossiers, setReviewDossiers] = useState(null)  // null = pas encore vérifié

  useEffect(() => {
    if (loading) return
    const debug = window.location.search.includes('debug=weekly')
    if (!debug && !shouldShowWeeklyReview()) return

    const q4 = dossiers.filter(d => d.quadrant === 4 && d.etat !== 'clos')
    if (!debug) markWeeklyReviewShown()   // marquer immédiatement pour éviter les doublons
    if (q4.length === 0) return

    setReviewDossiers(q4)
  }, [loading])  // se déclenche une seule fois quand les dossiers sont chargés

  return (
    <div className="app-shell">
      <ScrollToTop />
      <main className="main-content">
        <Routes>
          <Route path="/"             element={<Aujourdhui />} />
          <Route path="/login"        element={<Navigate to="/" replace />} />
          <Route path="/aujourdhui"   element={<Navigate to="/" replace />} />
          <Route path="/capturer"     element={<Capturer />} />
          <Route path="/dossiers"     element={<TousDossiers />} />
          <Route path="/dossiers/:id" element={<DossierDetail />} />
          <Route path="/journal"      element={<Journal />} />
          <Route path="/reglages"     element={<Reglages />} />
          <Route path="/planning"     element={<Planning />} />
          <Route path="/focus"        element={<ModeFocus />} />
        </Routes>
      </main>
      <Navigation />

      {reviewDossiers && (
        <WeeklyReviewModal
          dossiers={reviewDossiers}
          onClose={() => setReviewDossiers(null)}
          mettreAJourDossier={mettreAJourDossier}
          supprimerDossier={supprimerDossier}
        />
      )}
    </div>
  )
}
