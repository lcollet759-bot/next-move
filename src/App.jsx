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

// ── Revue hebdomadaire Q4 ─────────────────────────────────────────────────────
function WeeklyReviewModal({ dossiers, onClose, mettreAJourDossier, supprimerDossier }) {
  const [items,      setItems]      = useState(dossiers)
  const [planifId,   setPlanifId]   = useState(null)
  const [planifDate, setPlanifDate] = useState('')

  const remove = (id) => setItems(prev => prev.filter(d => d.id !== id))

  const handleTraiter = async (dossier) => {
    await mettreAJourDossier(dossier.id, { importance: true })
    remove(dossier.id)
  }

  const handlePlanifier = (dossier) => {
    setPlanifId(dossier.id)
    setPlanifDate('')
  }

  const handlePlanifierConfirm = async (dossier) => {
    if (!planifDate) return
    await mettreAJourDossier(dossier.id, { echeance: planifDate })
    setPlanifId(null)
    remove(dossier.id)
  }

  const handleSupprimer = async (dossier) => {
    await supprimerDossier(dossier.id)
    remove(dossier.id)
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet wr-sheet" onClick={e => e.stopPropagation()}>

        {/* En-tête */}
        <div className="wr-header">
          <div>
            <h3 className="wr-title">Revue du lundi</h3>
            <p className="wr-sub">
              {items.length > 0
                ? `${items.length} dossier${items.length > 1 ? 's' : ''} sans priorité — que voulez-vous en faire ?`
                : 'Tous les dossiers ont été traités.'}
            </p>
          </div>
          <button className="wr-close" onClick={onClose} aria-label="Fermer">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* État vide */}
        {items.length === 0 ? (
          <div className="wr-done">
            <div className="wr-done-check">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </div>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 20 }}>
              Beau travail — liste Q4 traitée.
            </p>
            <button className="btn btn-primary btn-full" onClick={onClose}>Fermer</button>
          </div>
        ) : (
          <div className="wr-list">
            {items.map(d => (
              <div key={d.id} className="wr-item">
                <div className="wr-item-info">
                  <span className="wr-item-titre">{d.titre}</span>
                  {d.organisme && <span className="wr-item-org">{d.organisme}</span>}
                </div>

                {/* Sélecteur de date inline pour Planifier */}
                {planifId === d.id ? (
                  <div className="wr-planif">
                    <input
                      type="date"
                      className="input"
                      style={{ flex: 1, fontSize: 13, padding: '8px 10px' }}
                      value={planifDate}
                      onChange={e => setPlanifDate(e.target.value)}
                      autoFocus
                    />
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => handlePlanifierConfirm(d)}
                      disabled={!planifDate}
                    >OK</button>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => setPlanifId(null)}
                    >✕</button>
                  </div>
                ) : (
                  <div className="wr-actions">
                    <button className="wr-btn wr-traiter"  onClick={() => handleTraiter(d)}>Traiter</button>
                    <button className="wr-btn wr-planif"   onClick={() => handlePlanifier(d)}>Planifier</button>
                    <button className="wr-btn wr-supprimer" onClick={() => handleSupprimer(d)}>Supprimer</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <style>{`
        .wr-sheet { max-height: 85vh; display: flex; flex-direction: column; }
        .wr-header {
          display: flex; justify-content: space-between; align-items: flex-start;
          margin-bottom: 18px; gap: 12px; flex-shrink: 0;
        }
        .wr-title { font-size: 18px; font-weight: 700; color: var(--text); margin-bottom: 4px; }
        .wr-sub   { font-size: 13px; color: var(--text-muted); line-height: 1.4; }
        .wr-close {
          flex-shrink: 0; width: 32px; height: 32px; border-radius: 50%;
          border: none; background: var(--gray-light); color: var(--text-muted);
          display: flex; align-items: center; justify-content: center; cursor: pointer;
          transition: background 0.15s;
        }
        .wr-close:hover { background: var(--border); }
        .wr-list { overflow-y: auto; flex: 1; }
        .wr-item {
          padding: 12px 0;
          border-bottom: 1px solid var(--border);
          display: flex; flex-direction: column; gap: 8px;
        }
        .wr-item:last-child { border-bottom: none; }
        .wr-item-info { display: flex; flex-direction: column; gap: 2px; }
        .wr-item-titre { font-size: 14px; font-weight: 500; color: var(--text); line-height: 1.3; }
        .wr-item-org   { font-size: 12px; color: var(--text-muted); }
        .wr-actions    { display: flex; gap: 6px; }
        .wr-planif     { display: flex; gap: 6px; align-items: center; }
        .wr-btn {
          flex: 1; padding: 8px 4px; border: none; border-radius: var(--radius-sm);
          font-size: 12px; font-weight: 600; cursor: pointer; transition: opacity 0.15s;
        }
        .wr-btn:active { opacity: 0.75; }
        .wr-traiter   { background: var(--green-light); color: var(--green); }
        .wr-planif    { background: var(--surface); color: var(--text); border: 1px solid var(--border) !important; }
        .wr-supprimer { background: var(--red-light,  #fef2f2); color: var(--red); }
        .wr-done {
          display: flex; flex-direction: column; align-items: center;
          padding: 20px 0 4px; text-align: center;
        }
        .wr-done-check {
          width: 52px; height: 52px; border-radius: 50%; background: var(--green);
          display: flex; align-items: center; justify-content: center; margin-bottom: 14px;
        }
      `}</style>
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
    if (!shouldShowWeeklyReview()) return

    const q4 = dossiers.filter(d => d.quadrant === 4 && d.etat !== 'clos')
    markWeeklyReviewShown()   // marquer immédiatement pour éviter les doublons
    if (q4.length === 0) return

    setReviewDossiers(q4)
  }, [loading])  // se déclenche une seule fois quand les dossiers sont chargés

  return (
    <div className="app-shell">
      <ScrollToTop />
      <main className="main-content">
        <Routes>
          <Route path="/"             element={<Navigate to="/aujourdhui" replace />} />
          <Route path="/login"        element={<Navigate to="/aujourdhui" replace />} />
          <Route path="/aujourdhui"   element={<Aujourdhui />} />
          <Route path="/capturer"     element={<Capturer />} />
          <Route path="/dossiers"     element={<TousDossiers />} />
          <Route path="/dossiers/:id" element={<DossierDetail />} />
          <Route path="/journal"      element={<Journal />} />
          <Route path="/reglages"     element={<Reglages />} />
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
