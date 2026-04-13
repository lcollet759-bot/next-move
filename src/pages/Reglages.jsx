import { useState } from 'react'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import { requestPermission } from '../services/notifications'

function IconEye({ open }) {
  return open ? (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  ) : (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  )
}

export default function Reglages() {
  const { apiKey, setApiKey, openaiKey, setOpenaiKey, dossiers, journal } = useApp()
  const { logout } = useAuth()

  // Clé API Anthropic
  const [keyInput,    setKeyInput]    = useState(apiKey)
  const [keyVisible,  setKeyVisible]  = useState(false)
  const [saved,       setSaved]       = useState(false)

  // Clé API OpenAI
  const [oaiInput,   setOaiInput]   = useState(openaiKey)
  const [oaiVisible, setOaiVisible] = useState(false)
  const [oaiSaved,   setOaiSaved]   = useState(false)

  // Notifications
  const [notifStatus, setNotifStatus] = useState(
    'Notification' in window ? Notification.permission : 'unsupported'
  )

  const handleSaveKey = () => {
    setApiKey(keyInput.trim())
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleSaveOaiKey = () => {
    setOpenaiKey(oaiInput.trim())
    setOaiSaved(true)
    setTimeout(() => setOaiSaved(false), 2000)
  }

  const handleNotif = async () => {
    const perm = await requestPermission()
    setNotifStatus(perm)
  }

  const handleClearData = () => {
    indexedDB.deleteDatabase('next-move')
    localStorage.removeItem('anthropic_api_key')
    localStorage.removeItem('next-move-reminders')
    sessionStorage.clear()
    window.location.reload()
  }

  const handleLogout = () => {
    logout()
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Réglages</h1>
        <p className="page-subtitle">Configuration de l'application</p>
      </div>

      {/* Clé API */}
      <div className="section">
        <div className="settings-section-title">Intelligence artificielle</div>
        <div className="card">
          <label className="label">Clé API Anthropic</label>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 10, lineHeight: 1.5 }}>
            Obtenez votre clé sur{' '}
            <span style={{ color: 'var(--green)' }}>console.anthropic.com</span>.
            Elle est stockée localement et protégée par votre mot de passe.
          </p>
          <div style={{ position: 'relative', marginBottom: 10 }}>
            <input
              className="input"
              type={keyVisible ? 'text' : 'password'}
              placeholder="sk-ant-api03-…"
              value={keyInput}
              onChange={e => setKeyInput(e.target.value)}
              style={{ paddingRight: 44 }}
            />
            <button
              onClick={() => setKeyVisible(v => !v)}
              style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}
              aria-label={keyVisible ? 'Masquer' : 'Afficher'}
            >
              <IconEye open={keyVisible} />
            </button>
          </div>
          <button
            className={`btn btn-full ${saved ? 'btn-secondary' : 'btn-primary'}`}
            onClick={handleSaveKey}
            disabled={!keyInput.trim() || keyInput === apiKey}
          >
            {saved ? 'Sauvegardé' : 'Sauvegarder la clé'}
          </button>
          {apiKey && (
            <div style={{ marginTop: 10, padding: '8px 12px', background: 'var(--green-light)', borderRadius: 'var(--radius-sm)', fontSize: 13, color: 'var(--green)' }}>
              Clé configurée · Modèle : claude-sonnet-4-20250514
            </div>
          )}
        </div>
      </div>

      {/* Clé OpenAI — Whisper */}
      <div className="section">
        <div className="settings-section-title">Transcription vocale</div>
        <div className="card">
          <label className="label">Clé API OpenAI (Whisper)</label>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 10, lineHeight: 1.5 }}>
            Nécessaire pour la dictée vocale. Obtenez votre clé sur{' '}
            <span style={{ color: 'var(--green)' }}>platform.openai.com</span>.
          </p>
          <div style={{ position: 'relative', marginBottom: 10 }}>
            <input
              className="input"
              type={oaiVisible ? 'text' : 'password'}
              placeholder="sk-…"
              value={oaiInput}
              onChange={e => setOaiInput(e.target.value)}
              style={{ paddingRight: 44 }}
            />
            <button
              onClick={() => setOaiVisible(v => !v)}
              style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}
              aria-label={oaiVisible ? 'Masquer' : 'Afficher'}
            >
              <IconEye open={oaiVisible} />
            </button>
          </div>
          <button
            className={`btn btn-full ${oaiSaved ? 'btn-secondary' : 'btn-primary'}`}
            onClick={handleSaveOaiKey}
            disabled={!oaiInput.trim() || oaiInput === openaiKey}
          >
            {oaiSaved ? 'Sauvegardé' : 'Sauvegarder la clé'}
          </button>
          {openaiKey && (
            <div style={{ marginTop: 10, padding: '8px 12px', background: 'var(--green-light)', borderRadius: 'var(--radius-sm)', fontSize: 13, color: 'var(--green)' }}>
              Clé configurée · Modèle : whisper-1
            </div>
          )}
        </div>
      </div>

      {/* Notifications */}
      <div className="section">
        <div className="settings-section-title">Notifications</div>
        <div className="card">
          <div className="row-between" style={{ marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 500 }}>Rappels d'échéances</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                {notifStatus === 'granted'     ? 'Activées' :
                 notifStatus === 'denied'      ? 'Bloquées dans les paramètres' :
                 notifStatus === 'unsupported' ? 'Non supportées' :
                 'Non activées'}
              </div>
            </div>
            <span className={`badge ${notifStatus === 'granted' ? 'badge-actionnable' : 'badge-surveille'}`}>
              {notifStatus === 'granted' ? '● Actif' : '○ Inactif'}
            </span>
          </div>
          {notifStatus !== 'granted' && notifStatus !== 'denied' && notifStatus !== 'unsupported' && (
            <button className="btn btn-secondary btn-full" onClick={handleNotif}>
              Activer les notifications
            </button>
          )}
          {notifStatus === 'denied' && (
            <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Autorisez les notifications dans les paramètres de votre navigateur.
            </p>
          )}
        </div>
      </div>

      {/* Sécurité */}
      <div className="section">
        <div className="settings-section-title">Sécurité</div>
        <div className="card">
          <button className="btn btn-ghost btn-full btn-sm" onClick={logout}>
            Se déconnecter
          </button>
        </div>
      </div>

      {/* Données */}
      <div className="section">
        <div className="settings-section-title">Données</div>
        <div className="card">
          <div className="stats-grid">
            <div className="stat-item">
              <div className="stat-value">{dossiers.filter(d => d.etat !== 'clos').length}</div>
              <div className="stat-label">Actifs</div>
            </div>
            <div className="stat-item">
              <div className="stat-value">{dossiers.filter(d => d.etat === 'clos').length}</div>
              <div className="stat-label">Clôturés</div>
            </div>
            <div className="stat-item">
              <div className="stat-value">{dossiers.reduce((acc, d) => acc + (d.taches?.length || 0), 0)}</div>
              <div className="stat-label">Tâches</div>
            </div>
            <div className="stat-item">
              <div className="stat-value">{journal.length}</div>
              <div className="stat-label">Événements</div>
            </div>
          </div>
          <div className="divider" />
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
            Toutes les données sont stockées localement sur votre appareil (IndexedDB).
          </p>
          <button className="btn btn-danger btn-full btn-sm" onClick={handleClearData}>
            Effacer toutes les données
          </button>
        </div>
      </div>

      {/* À propos */}
      <div className="section">
        <div className="settings-section-title">À propos</div>
        <div className="card" style={{ textAlign: 'center', padding: '24px 16px' }}>
          <div style={{ fontSize: 36, color: 'var(--green)', marginBottom: 10 }}>✦</div>
          <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 4 }}>Next Move</h2>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Version 1.0 · Mars 2026 · Suisse</p>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
            L'IA propose, vous décidez.
          </p>
        </div>
      </div>

      <style>{`
        .settings-section-title {
          font-size: 12px;
          font-weight: 600;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.06em;
          margin-bottom: 8px;
        }
        .stats-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 8px;
          margin-bottom: 12px;
        }
        .stat-item { text-align: center; }
        .stat-value {
          font-size: 24px;
          font-weight: 700;
          color: var(--green);
        }
        .stat-label { font-size: 11px; color: var(--text-muted); margin-top: 2px; }
      `}</style>
    </div>
  )
}
