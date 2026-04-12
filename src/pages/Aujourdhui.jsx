import { useState, useEffect } from 'react'
import { useApp } from '../context/AppContext'
import { genererMessageMatinal } from '../services/claude'
import DossierCard from '../components/DossierCard'

// Transforme **gras** et sauts de ligne en JSX
function renderMarkdown(text) {
  if (!text) return null
  // Insère un saut de ligne avant chaque nom de dossier entre guillemets (« » ou " ")
  const normalized = text
    .replace(/([^\n])(«|\u201c)/g, '$1\n$2')   // saut avant «  ou "
    .replace(/\. (?=[A-Z«\u201c])/g, '.\n')     // saut après un point suivi d'une majuscule ou guillemet

  return normalized.split('\n').map((line, i, arr) => {
    // Parse **gras** dans chaque ligne
    const parts = line.split(/(\*\*[^*]+\*\*)/g).map((part, j) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={j}>{part.slice(2, -2)}</strong>
      }
      return part
    })
    return (
      <span key={i}>
        {parts}
        {i < arr.length - 1 && <br />}
      </span>
    )
  })
}

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Bonjour'
  if (h < 18) return 'Bon après-midi'
  return 'Bonsoir'
}

function todayFR() {
  return new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
}

function SkeletonCard() {
  return (
    <div className="skeleton-card">
      <div className="skeleton-line sk-short" />
      <div className="skeleton-line sk-full"  />
      <div className="skeleton-line sk-med"   />
    </div>
  )
}

const MSG_KEY  = 'nm-morning-msg'
const DATE_KEY = 'nm-morning-date'
const HASH_KEY = 'nm-morning-hash'

function dossiersHash(dossiers) {
  return dossiers.map(d => d.id + '|' + d.updatedAt + '|' + d.etat).join(';')
}

export default function Aujourdhui() {
  const { dossiersAujourdhui, loading, apiKey } = useApp()
  const [message,    setMessage]    = useState(null)
  const [loadingMsg, setLoadingMsg] = useState(false)

  function generer(dossiers) {
    const today = new Date().toDateString()
    setLoadingMsg(true)
    genererMessageMatinal(dossiers)
      .then(msg => {
        if (msg) {
          setMessage(msg)
          localStorage.setItem(MSG_KEY,  msg)
          localStorage.setItem(DATE_KEY, today)
          localStorage.setItem(HASH_KEY, dossiersHash(dossiers))
        }
      })
      .catch(() => {})
      .finally(() => setLoadingMsg(false))
  }

  const rafraichirMessage = () => {
    if (!apiKey || dossiersAujourdhui.length === 0 || loadingMsg) return
    localStorage.removeItem(MSG_KEY)
    setMessage(null)
    generer(dossiersAujourdhui)
  }

  useEffect(() => {
    if (!apiKey || dossiersAujourdhui.length === 0) return
    const cached     = localStorage.getItem(MSG_KEY)
    const cachedDate = localStorage.getItem(DATE_KEY)
    const cachedHash = localStorage.getItem(HASH_KEY)
    const today      = new Date().toDateString()
    const hash       = dossiersHash(dossiersAujourdhui)

    // Utiliser le cache si : même jour ET dossiers inchangés
    if (cached && cachedDate === today && cachedHash === hash) {
      setMessage(cached)
      return
    }

    generer(dossiersAujourdhui)
  }, [apiKey, dossiersAujourdhui.length])

  if (loading) {
    return (
      <div className="page">
        <div className="page-header">
          <p className="page-subtitle skeleton-text" style={{ width: 140, height: 14, marginBottom: 6 }} />
          <p className="page-title skeleton-text" style={{ width: 100, height: 26 }} />
        </div>
        <div className="section">
          <div className="skeleton-card" style={{ height: 64, marginBottom: 12 }} />
          {[1, 2, 3].map(i => <SkeletonCard key={i} />)}
        </div>
        <style>{skeletonCSS}</style>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="page-header">
        <p className="page-subtitle" style={{ textTransform: 'capitalize' }}>{todayFR()}</p>
        <h1 className="page-title">{greeting()}</h1>
      </div>

      {/* Message matinal IA */}
      {(message || loadingMsg) && (
        <div className="section">
          <div className="morning-card">
            <div className="morning-icon">✦</div>
            {loadingMsg ? (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
                <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Préparation du résumé…</span>
              </div>
            ) : (
              <p className="morning-text" style={{ flex: 1 }}>{renderMarkdown(message)}</p>
            )}
            {!loadingMsg && apiKey && (
              <button
                className="refresh-btn"
                onClick={rafraichirMessage}
                aria-label="Rafraîchir le résumé"
                title="Rafraîchir"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="23 4 23 10 17 10"/>
                  <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                </svg>
              </button>
            )}
          </div>
        </div>
      )}

      {!apiKey && (
        <div className="section">
          <div className="morning-card" style={{ background: 'var(--amber-light)', borderColor: 'var(--amber)' }}>
            <p style={{ fontSize: 13, color: 'var(--amber)' }}>
              Configurez votre clé API dans <strong>Réglages</strong> pour activer l'IA.
            </p>
          </div>
        </div>
      )}

      {/* Dossiers du jour */}
      <div className="section">
        {dossiersAujourdhui.length === 0 ? (
          <div className="empty-state">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--border)" strokeWidth="1.5" strokeLinecap="round" style={{ marginBottom: 14 }}>
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
              <polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
            <p className="empty-title">Rien pour aujourd'hui</p>
            <p className="empty-text">Capturez un nouveau dossier pour commencer.</p>
          </div>
        ) : (
          <>
            <div className="section-label">
              {dossiersAujourdhui.length} dossier{dossiersAujourdhui.length > 1 ? 's' : ''} prioritaire{dossiersAujourdhui.length > 1 ? 's' : ''}
            </div>
            {dossiersAujourdhui.map(d => (
              <DossierCard key={d.id} dossier={d} showRaison />
            ))}
          </>
        )}
      </div>

      <style>{`
        .morning-card {
          background: var(--green-light);
          border: 1px solid #c5dfc9;
          border-radius: var(--radius);
          padding: 14px 16px;
          display: flex;
          gap: 10px;
          align-items: flex-start;
          margin-bottom: 4px;
        }
        .morning-icon { font-size: 18px; flex-shrink: 0; margin-top: 1px; color: var(--green); }
        .refresh-btn {
          flex-shrink: 0;
          margin-top: 2px;
          border: none;
          background: none;
          color: var(--text-muted);
          cursor: pointer;
          padding: 4px;
          border-radius: 6px;
          display: flex;
          align-items: center;
          transition: color 0.15s, background 0.15s;
        }
        .refresh-btn:hover { color: var(--green); background: rgba(0,0,0,0.05); }
        .morning-text { font-size: 14px; color: var(--text); line-height: 1.55; }
        .section-label {
          font-size: 12px;
          font-weight: 500;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin-bottom: 12px;
        }
        ${skeletonCSS}
      `}</style>
    </div>
  )
}

const skeletonCSS = `
  @keyframes shimmer {
    0%   { background-position: -200% 0; }
    100% { background-position:  200% 0; }
  }
  .skeleton-text,
  .skeleton-card,
  .skeleton-line {
    background: linear-gradient(90deg, var(--border) 25%, #f0f0ee 50%, var(--border) 75%);
    background-size: 200% 100%;
    animation: shimmer 1.4s infinite;
    border-radius: var(--radius-sm);
  }
  .skeleton-card {
    padding: 16px;
    margin-bottom: 10px;
    border-radius: var(--radius);
    height: 90px;
  }
  .skeleton-line { height: 12px; margin-bottom: 8px; }
  .sk-short { width: 40%; }
  .sk-full  { width: 100%; }
  .sk-med   { width: 65%; }
`
