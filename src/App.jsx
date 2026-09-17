import { useState } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useApp } from './context/AppContext'
import Navigation from './components/Navigation'
import ScrollToTop from './components/ScrollToTop'
import Login from './pages/Login'
import Inscription from './pages/Inscription'
import Aujourdhui from './pages/Aujourdhui'
import Capturer from './pages/Capturer'
import TousDossiers from './pages/TousDossiers'
import DossierDetail from './pages/DossierDetail'
import Journal from './pages/Journal'
import Reglages from './pages/Reglages'
import ModeFocus from './pages/ModeFocus'
import Routines from './pages/Routines'
import Admin from './pages/Admin'
import Pupitre from './pages/Pupitre'


// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const { authUser, authLoading, userProfile, logout, authErrorMessage } = useApp()
  const [showInscription, setShowInscription] = useState(false)

  // Pendant la vérification de session
  if (authLoading) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100vh', background: '#F7F5F0',
      }}>
        <div style={{
          width: 48, height: 48, borderRadius: '50%',
          background: '#C4623A',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          animation: 'pulse 1s ease-in-out infinite',
        }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <polyline points="5 12 12 5 19 12" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            <polyline points="5 17 12 10 19 17" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <style>{`@keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.7;transform:scale(.92)} }`}</style>
      </div>
    )
  }

  // Compte désactivé
  if (authUser && userProfile && !userProfile.actif) {
    logout()
    return null
  }

  // Non authentifié
  if (!authUser) {
    if (showInscription) {
      return <Inscription onNavigateToLogin={() => setShowInscription(false)} />
    }
    return <Login onNavigateToInscription={() => setShowInscription(true)} authErrorMessage={authErrorMessage} />
  }

  return <AuthenticatedApp />
}

function AuthenticatedApp() {
  const { pathname } = useLocation()

  // Pupitre desktop : rendu hors du shell mobile (pas de largeur max ni de barre du bas)
  if (pathname === '/pupitre') return <Pupitre />

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
          <Route path="/routines"     element={<Routines />} />
          <Route path="/focus"        element={<ModeFocus />} />
          <Route path="/admin"        element={<Admin />} />
        </Routes>
      </main>
      <Navigation />
    </div>
  )
}
