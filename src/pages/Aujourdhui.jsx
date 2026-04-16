import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { genererMessageMatinal, analyserBrainDump } from '../services/claude'
import DossierCard from '../components/DossierCard'

function calcQuadrant(u, i) {
  if (u && i)  return 1
  if (!u && i) return 2
  if (u && !i) return 3
  return 4
}

// Transforme **gras** et sauts de ligne en JSX
function renderMarkdown(text) {
  if (!text) return null
  const normalized = text
    .replace(/([^\n])(«|\u201c)/g, '$1\n$2')
    .replace(/\. (?=[A-Z«\u201c])/g, '.\n')

  return normalized.split('\n').map((line, i, arr) => {
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
  const { dossiersAujourdhui, loading, apiKey, creerDossier } = useApp()
  const navigate = useNavigate()
  const [message,    setMessage]    = useState(null)
  const [loadingMsg, setLoadingMsg] = useState(false)
  const [msgError,   setMsgError]   = useState(null)

  // ── Modal "Mes tâches du moment" (brain dump) ──────────────────────────
  const [showBD,    setShowBD]    = useState(false)
  const [bdTexte,   setBdTexte]   = useState('')
  const [bdLoading, setBdLoading] = useState(false)
  const [bdError,   setBdError]   = useState('')

  const lancerBrainDump = async () => {
    if (!bdTexte.trim()) return
    if (!apiKey) { setBdError('Clé API requise — configurez-la dans Réglages.'); return }
    setBdLoading(true); setBdError('')
    try {
      const dossiers = await analyserBrainDump(bdTexte)
      const enrichis = dossiers.map(d => ({ ...d, origine: 'vocal', quadrant: calcQuadrant(d.urgence, d.importance) }))

      // creerDossier retourne le dossier complet avec ses taches (IDs générés)
      const created = await Promise.all(enrichis.map(d => creerDossier(d)))

      // Construire les tâches pour Mode Focus : tri Eisenhower, données complètes
      // On passe les objets directement pour éviter le race condition dossiersAujourdhui
      const brainDumpTaches = created
        .sort((a, b) => a.quadrant - b.quadrant)
        .flatMap(d =>
          d.taches
            .filter(t => !t.done)
            .map(t => ({
              tache:   { id: t.id, titre: t.titre, done: false },
              dossier: { id: d.id, titre: d.titre, organisme: d.organisme ?? null, quadrant: d.quadrant },
            }))
        )

      setShowBD(false); setBdTexte('')
      navigate('/focus', { state: { brainDumpTaches } })
    } catch (e) {
      setBdError(e.message || 'Erreur lors de l\'analyse.')
    } finally {
      setBdLoading(false)
    }
  }

  function generer(dossiers) {
    const today = new Date().toDateString()
    setLoadingMsg(true)
    setMsgError(null)
    genererMessageMatinal(dossiers)
      .then(msg => {
        if (msg) {
          setMessage(msg)
          localStorage.setItem(MSG_KEY,  msg)
          localStorage.setItem(DATE_KEY, today)
          localStorage.setItem(HASH_KEY, dossiersHash(dossiers))
        }
      })
      .catch(err => setMsgError(err?.message || 'Erreur lors de la génération du résumé.'))
      .finally(() => setLoadingMsg(false))
  }

  const rafraichirMessage = () => {
    if (!apiKey || dossiersAujourdhui.length === 0 || loadingMsg) return
    localStorage.removeItem(MSG_KEY)
    setMessage(null)
    setMsgError(null)
    generer(dossiersAujourdhui)
  }

  useEffect(() => {
    if (!apiKey || dossiersAujourdhui.length === 0) return
    const cached     = localStorage.getItem(MSG_KEY)
    const cachedDate = localStorage.getItem(DATE_KEY)
    const cachedHash = localStorage.getItem(HASH_KEY)
    const today      = new Date().toDateString()
    const hash       = dossiersHash(dossiersAujourdhui)

    if (cached && cachedDate === today && cachedHash === hash) {
      setMessage(cached)
      return
    }

    generer(dossiersAujourdhui)
  }, [apiKey, dossiersAujourdhui.length])

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
      {(message || loadingMsg || msgError) && (
        <div className="section">
          <div className="morning-card">
            <div className="morning-dot" />
            <div style={{ flex: 1 }}>
              {loadingMsg ? (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
                  <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Préparation du résumé…</span>
                </div>
              ) : msgError ? (
                <p style={{ fontSize: 13, color: 'var(--red)', lineHeight: 1.5 }}>{msgError}</p>
              ) : (
                <p className="morning-text">{renderMarkdown(message)}</p>
              )}
            </div>
            {!loadingMsg && apiKey && (
              <button
                className="refresh-btn"
                onClick={rafraichirMessage}
                aria-label="Rafraîchir le résumé"
                title="Rafraîchir"
                style={{ alignSelf: 'flex-start' }}
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

      {/* ── 3 boutons d'action ───────────────────────────────────────── */}
      <div className="section aj-actions">
        {/* 1. Démarrer */}
        <button className="aj-action-row" onClick={() => navigate('/focus')}>
          <div className="aj-action-icon aj-action-icon-primary">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5 3 19 12 5 21 5 3"/>
            </svg>
          </div>
          <div className="aj-action-text">
            <span className="aj-action-title">Démarrer</span>
            <span className="aj-action-sub">Une tâche à la fois, dans le bon ordre</span>
          </div>
          <span className="aj-action-chevron">›</span>
        </button>

        {/* 2. Planifier ma journée */}
        <button className="aj-action-row" onClick={() => navigate('/planning')}>
          <div className="aj-action-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2"/>
              <line x1="16" y1="2" x2="16" y2="6"/>
              <line x1="8" y1="2" x2="8" y2="6"/>
              <line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
          </div>
          <div className="aj-action-text">
            <span className="aj-action-title">Planifier ma journée</span>
            <span className="aj-action-sub">L'IA optimise tes heures disponibles</span>
          </div>
          <span className="aj-action-chevron">›</span>
        </button>

        {/* 3. Mes tâches du moment */}
        <button className="aj-action-row" onClick={() => setShowBD(true)}>
          <div className="aj-action-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
          </div>
          <div className="aj-action-text">
            <span className="aj-action-title">Mes tâches du moment</span>
            <span className="aj-action-sub">Dictez, l'IA trie et organise</span>
          </div>
          <span className="aj-action-chevron">›</span>
        </button>
      </div>

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
            <div style={{ marginBottom: 12 }}>
              <span className="section-label">
                {dossiersAujourdhui.length} dossier{dossiersAujourdhui.length > 1 ? 's' : ''} prioritaire{dossiersAujourdhui.length > 1 ? 's' : ''}
              </span>
            </div>
            {dossiersAujourdhui.map(d => (
              <DossierCard key={d.id} dossier={d} showRaison />
            ))}
          </>
        )}
      </div>

      {/* ── Modal "Par où commencer ?" ────────────────────────────────── */}
      {showBD && (
        <div className="overlay" onClick={() => { if (!bdLoading) { setShowBD(false); setBdTexte(''); setBdError('') } }}>
          <div className="sheet" onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>Par où commencer ?</h3>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 14, lineHeight: 1.5 }}>
              Décrivez tout ce qui vous préoccupe. L'IA crée les dossiers et lance le Mode Focus.
            </p>
            <textarea
              className="input"
              rows={5}
              placeholder="Ex : j'ai une facture CFF à payer avant vendredi, un appel à passer à la caisse maladie, et je dois rendre le rapport trimestriel…"
              value={bdTexte}
              onChange={e => setBdTexte(e.target.value)}
              disabled={bdLoading}
              style={{ resize: 'none', marginBottom: 10, lineHeight: 1.5 }}
              autoFocus
            />
            {bdError && <p style={{ fontSize: 13, color: 'var(--red)', marginBottom: 10 }}>{bdError}</p>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-ghost btn-sm" style={{ flex: 1 }}
                onClick={() => { setShowBD(false); setBdTexte(''); setBdError('') }}
                disabled={bdLoading}>
                Annuler
              </button>
              <button className="btn btn-primary" style={{ flex: 2 }}
                onClick={lancerBrainDump}
                disabled={bdLoading || !bdTexte.trim()}>
                {bdLoading
                  ? <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} />
                      Analyse en cours…
                    </span>
                  : <>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style={{ marginRight: 4 }}>
                        <polygon points="5 3 19 12 5 21 5 3"/>
                      </svg>
                      Analyser et lancer
                    </>
                }
              </button>
            </div>
          </div>
        </div>
      )}

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

        /* ── 3 boutons d'action ───────────────────────────────────────── */
        .aj-actions {
          display: flex; flex-direction: column; gap: 8px; padding-top: 0;
        }
        .aj-action-row {
          width: 100%; display: flex; align-items: center; gap: 12px;
          padding: 12px 14px;
          background: #fff; border: 1px solid #EEECE7;
          border-radius: 16px;
          cursor: pointer; font-family: inherit;
          transition: background 0.12s;
          text-align: left;
        }
        .aj-action-row:active { background: #F5F3EE; }
        .aj-action-icon {
          width: 36px; height: 36px; border-radius: 10px;
          background: #F5F3EE;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0; color: var(--text-muted);
        }
        .aj-action-icon-primary {
          background: #E8F0EA;
          color: var(--green);
        }
        .aj-action-text {
          flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0;
        }
        .aj-action-title {
          font-size: 14px; font-weight: 600; color: var(--text); line-height: 1.2;
        }
        .aj-action-sub {
          font-size: 12px; color: var(--text-muted); line-height: 1.3;
        }
        .aj-action-chevron {
          font-size: 20px; color: var(--border); flex-shrink: 0;
          line-height: 1; margin-top: -1px;
        }

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
