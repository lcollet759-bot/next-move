import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Navigation from './components/Navigation'
import ScrollToTop from './components/ScrollToTop'
import Login from './pages/Login'
import Aujourdhui from './pages/Aujourdhui'
import Capturer from './pages/Capturer'
import TousDossiers from './pages/TousDossiers'
import DossierDetail from './pages/DossierDetail'
import Journal from './pages/Journal'
import Reglages from './pages/Reglages'

export default function App() {
  const { isAuthenticated } = useAuth()

  if (!isAuthenticated) {
    return (
      <Routes>
        <Route path="*" element={<Login />} />
      </Routes>
    )
  }

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
    </div>
  )
}
