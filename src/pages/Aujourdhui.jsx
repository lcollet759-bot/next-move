import { useState, useEffect, useRef } from 'react'
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
  const generatingRef = useRef(false)

  async function generer(dossiers) {
    if (generatingRef.current) {
      console.log('[Morning] already generating, skipped')
      return
    }
    generatingRef.current = true
    const today = new Date().toDateString()
    console.log('[Morning] 1. start — dossiers:', dossiers.length, 'apiKey set:', !!localStorage.getItem('anthropic_api_key'))
    setLoadingMsg(true)
    try {
      const msg = await genererMessageMatinal(dossiers)
      console.log('[Morning] 2. API response — msg type:', typeof msg, 'length:', msg?.length, 'preview:', msg?.slice(0, 60))
      if (msg) {
        setMessage(msg)
        console.log('[Morning] 3. setMessage called — msg length:', msg.length)
        localStorage.setItem(MSG_KEY,  msg)
        localStorage.setItem(DATE_KEY, today)
        localStorage.setItem(HASH_KEY, dossiersHash(dossiers))
        console.log('[Morning] 4. localStorage saved')
      } else {
        console.warn('[Morning] 2b. msg is falsy — not setting state:', msg)
      }
    } catch (err) {
      console.error('[Morning] ERROR:', err?.message, err)
    } finally {
      setLoadingMsg(false)
      generatingRef.current = false
      console.log('[Morning] 5. finally — loadingMsg set to false')
    }
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

  console.log('[Morning render] message:', message ? `"${message.slice(0,40)}..."` : message, '| loadingMsg:', loadingMsg)

  if (loading) {
    return (
      <div className="page">
        <div className="page-header aj-header">
          <div className="aj-header-left">
            <p className="skeleton-text" style={{ width: 120, height: 10, marginBottom: 8 }} />
            <p className="skeleton-text" style={{ width: 180, height: 32 }} />
          </div>
          <div className="skeleton-text" style={{ width: 42, height: 42, borderRadius: '50%', flexShrink: 0 }} />
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
      <div className="page-header aj-header">
        <div className="aj-header-left">
          <p className="aj-date">{todayFR()}</p>
          <h1 className="aj-title">
            <span className="aj-greet">{greeting()} </span>
            <span className="aj-name">Ludovic.</span>
          </h1>
        </div>
        <div className="aj-avatar">L</div>
      </div>

      {/* Message matinal IA */}
      {(message || loadingMsg) && (
        <div className="section">
          <div className="morning-card">
            <div className="morning-dot" />
            {loadingMsg ? (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flex: 1 }}>
                <div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
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
          <div className="morning-card" style={{ borderColor: 'var(--amber)', background: 'var(--amber-light)' }}>
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
        /* Header */
        .aj-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 40px 28px 20px;
          border-bottom: none;
        }
        .aj-header-left { display: flex; flex-direction: column; gap: 4px; }
        .aj-date {
          font-size: 10px;
          font-weight: 600;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 2.5px;
          line-height: 1;
        }
        .aj-title {
          font-size: 32px;
          line-height: 1.1;
          letter-spacing: -1.2px;
          color: var(--text);
        }
        .aj-greet { font-weight: 200; }
        .aj-name  { font-weight: 500; }
        .aj-avatar {
          width: 42px;
          height: 42px;
          border-radius: 50%;
          background: var(--text);
          color: #fff;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 16px;
          font-weight: 500;
          flex-shrink: 0;
          letter-spacing: 0;
        }

        /* Morning card */
        .morning-card {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 14px;
          padding: 14px 16px;
          display: flex;
          gap: 10px;
          align-items: flex-start;
          margin-bottom: 4px;
        }
        .morning-dot {
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: var(--green);
          flex-shrink: 0;
          margin-top: 5px;
          animation: pulse-dot 2s ease-in-out infinite;
        }
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.4; transform: scale(0.7); }
        }
        .refresh-btn {
          flex-shrink: 0;
          margin-top: 1px;
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
        .morning-text { font-size: 13px; color: var(--text-secondary); line-height: 1.55; }

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
