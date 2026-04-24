import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { updateCleApi } from '../services/db'
import { requestPermission } from '../services/notifications'

// ── Icons ──────────────────────────────────────────────────────────────────

const IconChevron = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 18 15 12 9 6"/>
  </svg>
)

const IconLogout = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
    <polyline points="16 17 21 12 16 7"/>
    <line x1="21" y1="12" x2="9" y2="12"/>
  </svg>
)

const IconKey = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>
  </svg>
)

const IconBell = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
    <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
  </svg>
)

const IconBook = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14 2 14 8 20 8"/>
    <line x1="16" y1="13" x2="8" y2="13"/>
    <line x1="16" y1="17" x2="8" y2="17"/>
  </svg>
)

const IconRepeat = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="17 1 21 5 17 9"/>
    <path d="M3 11V9a4 4 0 0 1 4-4h14"/>
    <polyline points="7 23 3 19 7 15"/>
    <path d="M21 13v2a4 4 0 0 1-4 4H3"/>
  </svg>
)

const IconTrash = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6"/>
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
    <path d="M10 11v6"/><path d="M14 11v6"/>
    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
  </svg>
)

const IconEyeOff = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
    <line x1="1" y1="1" x2="23" y2="23"/>
  </svg>
)

const IconEyeOn = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
    <circle cx="12" cy="12" r="3"/>
  </svg>
)

// ── Row components ─────────────────────────────────────────────────────────

function SettingsRow({ icon, label, sublabel, right, onClick, danger, first, last, noBorder }) {
  return (
    <button
      className={`rgl-row${onClick ? ' rgl-row-tap' : ''}${danger ? ' rgl-row-danger' : ''}${first ? ' rgl-row-first' : ''}${last ? ' rgl-row-last' : ''}`}
      onClick={onClick}
      disabled={!onClick}
      style={!onClick ? { cursor: 'default' } : undefined}
    >
      {icon && <span className="rgl-row-icon">{icon}</span>}
      <span className="rgl-row-body">
        <span className="rgl-row-label">{label}</span>
        {sublabel && <span className="rgl-row-sub">{sublabel}</span>}
      </span>
      {right !== undefined ? <span className="rgl-row-right">{right}</span> : null}
      {!noBorder && !last && <span className="rgl-row-sep" />}
    </button>
  )
}

// iOS-style toggle
function Toggle({ on, onToggle }) {
  return (
    <button
      className={`rgl-toggle${on ? ' rgl-toggle-on' : ''}`}
      onClick={e => { e.stopPropagation(); onToggle() }}
      aria-label="Activer/Désactiver"
    >
      <span className="rgl-toggle-thumb" />
    </button>
  )
}

// ── Main component ─────────────────────────────────────────────────────────

export default function Reglages() {
  const { apiKey, setApiKey, dossiers, journal, authUser, userProfile, setUserProfile, logout } = useApp()
  const navigate = useNavigate()

  // Clé API — source : userProfile (Supabase) en priorité, sinon localStorage
  const cleActuelle = userProfile?.cle_api_anthropic || apiKey

  const [editingKey, setEditingKey] = useState(false)
  const [keyInput,   setKeyInput]   = useState(cleActuelle)
  const [keyVisible, setKeyVisible] = useState(false)
  const [keySaved,   setKeySaved]   = useState(false)

  // Notifications
  const [notifStatus, setNotifStatus] = useState(
    'Notification' in window ? Notification.permission : 'unsupported'
  )

  // Confirmation modals
  const [showConfirmLogout, setShowConfirmLogout]   = useState(false)
  const [showConfirmDelete, setShowConfirmDelete]   = useState(false)
  const [deleteInput,       setDeleteInput]         = useState('')

  const handleSaveKey = async () => {
    const trimmed = keyInput.trim()
    setApiKey(trimmed)  // sync localStorage
    if (authUser?.id) {
      await updateCleApi(authUser.id, trimmed)
      setUserProfile({ ...userProfile, cle_api_anthropic: trimmed })
    }
    setKeySaved(true)
    setTimeout(() => { setKeySaved(false); setEditingKey(false) }, 1200)
  }

  const handleNotifToggle = async () => {
    if (notifStatus === 'granted') return // can't revoke programmatically
    const perm = await requestPermission()
    setNotifStatus(perm)
  }

  const handleLogout = () => {
    logout()
  }

  const handleDeleteAccount = () => {
    // Clear all local data + session
    try { indexedDB.deleteDatabase('next-move') } catch (_) {}
    localStorage.removeItem('anthropic_api_key')
    localStorage.removeItem('next-move-reminders')
    sessionStorage.clear()
    logout()
  }

  // Derived stats
  const nbDossiers = dossiers.filter(d => d.etat !== 'clos').length
  const nbActions  = journal.filter(e => e.action === 'Tâche complétée').length

  // Masked key display
  const maskedKey = cleActuelle
    ? cleActuelle.slice(0, 10) + '••••••••••'
    : null

  const notifOn = notifStatus === 'granted'

  return (
    <div className="page">

      {/* ── Header ── */}
      <header className="rgl-header">
        <div className="rgl-avatar-row">
          <div className="rgl-avatar">
            {userProfile?.prenom?.[0]?.toUpperCase() || 'U'}
          </div>
          <div className="rgl-avatar-info">
            <span className="rgl-avatar-name">{userProfile?.prenom || 'Mon compte'}</span>
            <span className="rgl-avatar-stats">
              {userProfile?.email && <>{userProfile.email} · </>}
              {nbDossiers} dossier{nbDossiers !== 1 ? 's' : ''} · {nbActions} action{nbActions !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
      </header>

      <div className="rgl-body">

        {/* ── Groupe 1 : IA & Notifications ── */}
        <div className="rgl-group">

          {/* Clé API Anthropic */}
          <SettingsRow
            icon={<IconKey />}
            label="Clé API Anthropic"
            sublabel={maskedKey || 'Non configurée'}
            right={<IconChevron />}
            onClick={() => { setEditingKey(v => !v); setKeyInput(cleActuelle) }}
            first
            last={!editingKey}
          />

          {editingKey && (
            <div className="rgl-inline-edit">
              <div className="rgl-key-input-wrap">
                <input
                  className="input rgl-key-input"
                  type={keyVisible ? 'text' : 'password'}
                  placeholder="sk-ant-api03-…"
                  value={keyInput}
                  onChange={e => setKeyInput(e.target.value)}
                  autoFocus
                />
                <button
                  className="rgl-eye-btn"
                  onClick={() => setKeyVisible(v => !v)}
                  aria-label={keyVisible ? 'Masquer' : 'Afficher'}
                >
                  {keyVisible ? <IconEyeOn /> : <IconEyeOff />}
                </button>
              </div>
              <div className="rgl-key-actions">
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => { setEditingKey(false); setKeyInput(cleActuelle) }}
                >
                  Annuler
                </button>
                <button
                  className={`btn btn-sm ${keySaved ? 'btn-secondary' : 'btn-primary'}`}
                  onClick={handleSaveKey}
                  disabled={!keyInput.trim() || keyInput === apiKey}
                  style={{ flex: 1 }}
                >
                  {keySaved ? '✓ Sauvegardé' : 'Sauvegarder'}
                </button>
              </div>
              {apiKey && (
                <p className="rgl-key-hint">Modèle : claude-sonnet-4-20250514</p>
              )}
              <span className="rgl-row-sep rgl-sep-bottom" />
            </div>
          )}

          {/* Notifications */}
          <SettingsRow
            icon={<IconBell />}
            label="Notifications"
            sublabel={
              notifStatus === 'granted'     ? 'Activées' :
              notifStatus === 'denied'      ? 'Bloquées — modifiez dans les réglages' :
              notifStatus === 'unsupported' ? 'Non supportées' :
              'Non activées'
            }
            right={
              notifStatus === 'unsupported' ? null :
              notifStatus === 'denied'      ? null :
              <Toggle on={notifOn} onToggle={handleNotifToggle} />
            }
            onClick={notifStatus === 'default' ? handleNotifToggle : undefined}
            first={false}
            last
            noBorder
          />
        </div>

        {/* ── Groupe 2 : Raccourcis ── */}
        <div className="rgl-group">
          <SettingsRow
            icon={<IconBook />}
            label="Journal d'activité"
            sublabel={`${journal.length} événement${journal.length !== 1 ? 's' : ''}`}
            right={<IconChevron />}
            onClick={() => navigate('/journal')}
            first
          />
          <SettingsRow
            icon={<IconRepeat />}
            label="Routines"
            sublabel="Gérer les tâches récurrentes"
            right={<IconChevron />}
            onClick={() => navigate('/routines')}
            last
            noBorder
          />
        </div>

        {/* ── Groupe Admin (visible uniquement pour les admins) ── */}
        {userProfile?.role === 'admin' && (
          <div className="rgl-group">
            <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: '#A09080', margin: '0', padding: '12px 16px 4px' }}>
              Administration
            </p>
            <SettingsRow
              label="Gérer les utilisateurs"
              right={<IconChevron />}
              onClick={() => navigate('/admin')}
              first
              last
              noBorder
            />
          </div>
        )}

        {/* ── Groupe 3 : Déconnexion ── */}
        <div className="rgl-group">
          <SettingsRow
            icon={<span style={{ color: 'var(--text-muted)' }}><IconLogout /></span>}
            label="Se déconnecter"
            right={null}
            onClick={() => setShowConfirmLogout(true)}
            first
            last
            noBorder
          />
        </div>

        {/* ── Groupe 4 : Suppression compte ── */}
        <div className="rgl-group rgl-group-danger">
          <SettingsRow
            icon={<span style={{ color: '#C4623A' }}><IconTrash /></span>}
            label="Supprimer mon compte"
            right={null}
            onClick={() => { setShowConfirmDelete(true); setDeleteInput('') }}
            danger
            first
            last
            noBorder
          />
        </div>

        {/* Version */}
        <p className="rgl-version">Next Move · v0.1.0</p>

      </div>

      {/* ── Modal : Déconnexion ── */}
      {showConfirmLogout && (
        <div className="rgl-modal-overlay" onClick={() => setShowConfirmLogout(false)}>
          <div className="rgl-modal" onClick={e => e.stopPropagation()}>
            <p className="rgl-modal-title">Se déconnecter ?</p>
            <p className="rgl-modal-text">Vos données restent enregistrées.</p>
            <div className="rgl-modal-actions">
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setShowConfirmLogout(false)}>
                Annuler
              </button>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleLogout}>
                Déconnecter
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal : Suppression compte ── */}
      {showConfirmDelete && (
        <div className="rgl-modal-overlay" onClick={() => setShowConfirmDelete(false)}>
          <div className="rgl-modal" onClick={e => e.stopPropagation()}>
            <p className="rgl-modal-title" style={{ color: '#C4623A' }}>Supprimer mon compte</p>
            <p className="rgl-modal-text">
              Cette action est <strong>irréversible</strong>. Toutes vos données seront supprimées définitivement.
            </p>
            <p className="rgl-modal-text" style={{ marginTop: 8 }}>
              Tapez <strong>SUPPRIMER</strong> pour confirmer.
            </p>
            <input
              className="input"
              style={{ marginTop: 10, marginBottom: 12 }}
              placeholder="SUPPRIMER"
              value={deleteInput}
              onChange={e => setDeleteInput(e.target.value)}
              autoFocus
            />
            <div className="rgl-modal-actions">
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setShowConfirmDelete(false)}>
                Annuler
              </button>
              <button
                className="btn"
                style={{ flex: 1, background: '#C4623A', color: '#fff', opacity: deleteInput === 'SUPPRIMER' ? 1 : 0.4 }}
                onClick={handleDeleteAccount}
                disabled={deleteInput !== 'SUPPRIMER'}
              >
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        /* ── Header ── */
        .rgl-header {
          background: #1C3829;
          padding: 20px 20px 24px;
          flex-shrink: 0;
        }
        .rgl-avatar-row {
          display: flex;
          align-items: center;
          gap: 14px;
        }
        .rgl-avatar {
          width: 52px;
          height: 52px;
          border-radius: 50%;
          background: #C4623A;
          color: #fff;
          font-size: 22px;
          font-weight: 700;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          letter-spacing: -0.5px;
        }
        .rgl-avatar-info {
          display: flex;
          flex-direction: column;
          gap: 3px;
        }
        .rgl-avatar-name {
          font-size: 17px;
          font-weight: 600;
          color: #fff;
          letter-spacing: 0.1px;
        }
        .rgl-avatar-stats {
          font-size: 13px;
          color: rgba(255,255,255,0.52);
        }

        /* ── Body ── */
        .rgl-body {
          padding: 20px 16px 32px;
          display: flex;
          flex-direction: column;
          gap: 24px;
        }

        /* ── Groups ── */
        .rgl-group {
          background: #fff;
          border-radius: 12px;
          border: 1px solid var(--border);
          overflow: hidden;
        }
        .rgl-group-danger {
          border-color: rgba(196,98,58,0.2);
        }

        /* ── Row ── */
        .rgl-row {
          width: 100%;
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 13px 16px;
          background: transparent;
          border: none;
          text-align: left;
          position: relative;
          transition: background 0.1s;
        }
        .rgl-row-tap { cursor: pointer; }
        .rgl-row-tap:active { background: #F5F2EC; }
        .rgl-row-icon {
          color: var(--text-muted);
          display: flex;
          align-items: center;
          flex-shrink: 0;
          width: 20px;
        }
        .rgl-row-body {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .rgl-row-label {
          font-size: 14px;
          font-weight: 500;
          color: var(--text);
          line-height: 1.2;
        }
        .rgl-row-sub {
          font-size: 12px;
          color: var(--text-muted);
          line-height: 1.3;
        }
        .rgl-row-right {
          color: var(--text-muted);
          display: flex;
          align-items: center;
          flex-shrink: 0;
        }
        .rgl-row-danger .rgl-row-label { color: #C4623A; }
        .rgl-row-sep {
          position: absolute;
          bottom: 0;
          left: 48px;
          right: 0;
          height: 1px;
          background: var(--border);
        }
        .rgl-sep-bottom {
          position: static;
          display: block;
          height: 1px;
          background: var(--border);
          margin: 0 0 0 48px;
        }

        /* ── Inline key edit ── */
        .rgl-inline-edit {
          padding: 4px 16px 12px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .rgl-key-input-wrap {
          position: relative;
          display: flex;
          align-items: center;
        }
        .rgl-key-input { width: 100%; padding-right: 40px; }
        .rgl-eye-btn {
          position: absolute;
          right: 12px;
          border: none;
          background: none;
          cursor: pointer;
          color: var(--text-muted);
          display: flex;
          align-items: center;
          padding: 2px;
        }
        .rgl-key-actions {
          display: flex;
          gap: 8px;
          align-items: center;
        }
        .rgl-key-hint {
          font-size: 12px;
          color: var(--green);
          margin: 0;
          padding: 6px 10px;
          background: var(--green-light);
          border-radius: 6px;
        }

        /* ── Toggle ── */
        .rgl-toggle {
          width: 44px;
          height: 26px;
          border-radius: 13px;
          border: none;
          background: #DDD8CE;
          cursor: pointer;
          padding: 0;
          position: relative;
          transition: background 0.2s;
          flex-shrink: 0;
        }
        .rgl-toggle.rgl-toggle-on { background: #1C3829; }
        .rgl-toggle-thumb {
          position: absolute;
          top: 3px;
          left: 3px;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: #fff;
          box-shadow: 0 1px 4px rgba(0,0,0,0.2);
          transition: transform 0.2s;
        }
        .rgl-toggle-on .rgl-toggle-thumb { transform: translateX(18px); }

        /* ── Version ── */
        .rgl-version {
          text-align: center;
          font-size: 11px;
          color: var(--text-muted);
          opacity: 0.55;
          margin: 0;
          letter-spacing: 0.3px;
        }

        /* ── Modals ── */
        .rgl-modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.45);
          z-index: 100;
          display: flex;
          align-items: flex-end;
          padding-bottom: env(safe-area-inset-bottom, 0px);
        }
        .rgl-modal {
          background: var(--surface);
          border-radius: 16px 16px 0 0;
          padding: 24px 20px 28px;
          width: 100%;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .rgl-modal-title {
          font-size: 16px;
          font-weight: 700;
          color: var(--text);
          margin: 0 0 4px;
        }
        .rgl-modal-text {
          font-size: 14px;
          color: var(--text-muted);
          line-height: 1.5;
          margin: 0;
        }
        .rgl-modal-actions {
          display: flex;
          gap: 10px;
          margin-top: 16px;
        }
      `}</style>
    </div>
  )
}
