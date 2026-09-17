import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AppProvider } from './context/AppContext'
import App from './App'
import './index.css'
import { registerSW } from 'virtual:pwa-register'

// Mise à jour PWA (registerType 'autoUpdate') : le nouveau service worker s'active (skipWaiting + clientsClaim)
// et la page se recharge une seule fois. Recherche d'une nouvelle version au lancement et à chaque retour
// au premier plan (PWA installée sur Android). Aucune donnée locale n'est effacée.
registerSW({
  immediate: true,
  onRegisteredSW(_swUrl, registration) {
    if (!registration) return

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        registration.update().catch(() => {})
      }
    })
  },
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AppProvider>
        <App />
      </AppProvider>
    </BrowserRouter>
  </StrictMode>
)
