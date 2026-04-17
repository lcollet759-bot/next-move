import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { analyserBrainDump } from '../services/claude'

function calcQuadrant(u, i) {
  if (u && i)  return 1
  if (!u && i) return 2
  if (u && !i) return 3
  return 4
}

function todayFR() {
  return new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
}

export default function Aujourdhui() {
  const { dossiersAujourdhui, dossiers, loading, apiKey, creerDossier } = useApp()
  const navigate = useNavigate()

  const [bdTexte,   setBdTexte]   = useState('')
  const [bdLoading, setBdLoading] = useState(false)
  const [bdError,   setBdError]   = useState('')
  const [showBD,    setShowBD]    = useState(false)

  const lancerBrainDump = async () => {
    if (!bdTexte.trim()) return
    if (!apiKey) { setBdError('Clé API requise — configurez-la dans Réglages.'); return }
    setBdLoading(true); setBdError('')
    try {
      const analysed = await analyserBrainDump(bdTexte)
      const enrichis = analysed.map(d => ({
        ...d, origine: 'vocal', quadrant: calcQuadrant(d.urgence, d.importance),
      }))
      const created = await Promise.all(enrichis.map(d => creerDossier(d)))
      const brainDumpTaches = created
        .sort((a, b) => a.quadrant - b.quadrant)
        .flatMap(d =>
          d.taches.filter(t => !t.done).map(t => ({
            tache:   { id: t.id, titre: t.titre, done: false },
            dossier: { id: d.id, titre: d.titre, organisme: d.organisme ?? null, quadrant: d.quadrant },
          }))
        )
      setBdTexte('')
      navigate('/focus', { state: { brainDumpTaches } })
    } catch (e) {
      setBdError(e.message || 'Erreur lors de l\'analyse.')
    } finally {
      setBdLoading(false)
    }
  }

  const closeBD = () => { if (!bdLoading) { setShowBD(false); setBdTexte(''); setBdError('') } }

  // ── Données état actif ────────────────────────────────────────────────────
  const toutesLesTaches = dossiersAujourdhui.flatMap(d =>
    d.taches.filter(t => !t.done).map(t => ({ tache: t, dossier: d }))
  )
  const tacheNow       = toutesLesTaches[0] || null
  const tachesNext     = toutesLesTaches.slice(1, 4)
  const allDossiers    = dossiers || dossiersAujourdhui
  const dossiersAttente = allDossiers.filter(d => d.etat === 'attente_externe')

  const isEmpty = dossiersAujourdhui.length === 0

  // ── Header commun ─────────────────────────────────────────────────────────
  const AjHeader = () => (
    <header className="aj-header">
      <div className="aj-logo">
        <div className="aj-logo-circle">
          <span className="aj-logo-mark">»</span>
        </div>
        <span className="aj-logo-name">Next Move</span>
      </div>
      <button className="aj-avatar" onClick={() => navigate('/reglages')} aria-label="Réglages">L</button>
    </header>
  )

  if (loading) {
    return (
      <div className="aj-page">
        <AjHeader />
        <div className="aj-date-bar"><span className="aj-date">{todayFR()}</span></div>
        <div className="aj-body">
          <div className="aj-greeting">
            <span className="aj-greet-light">Bonjour,</span>
            <span className="aj-greet-bold">Ludovic.</span>
          </div>
          <div className="aj-sk-block" />
          <div className="aj-sk-block" style={{ height: 80, opacity: 0.5 }} />
        </div>
        <style>{ajCSS}</style>
      </div>
    )
  }

  return (
    <div className="aj-page">
      <AjHeader />
      <div className="aj-date-bar"><span className="aj-date">{todayFR()}</span></div>

      <div className="aj-body">

        {/* ── Greeting ─────────────────────────────────────────────── */}
        <div className="aj-greeting">
          <span className="aj-greet-light">Bonjour,</span>
          <span className="aj-greet-bold">Ludovic.</span>
        </div>

        {isEmpty ? (

          /* ══ ÉTAT VIDE ══════════════════════════════════════════════ */
          <div className="aj-capture-card">
            <p className="aj-capture-prompt">Qu'est-ce qui te passe par la tête&nbsp;?</p>
            <textarea
              className="aj-capture-area"
              placeholder="Décris tout ce qui t'occupe : dossiers, tâches, idées…"
              value={bdTexte}
              onChange={e => setBdTexte(e.target.value)}
              disabled={bdLoading}
              rows={4}
            />
            {bdError && <p className="aj-bd-error">{bdError}</p>}
            <button
              className="aj-dicter-btn"
              onClick={lancerBrainDump}
              disabled={bdLoading || !bdTexte.trim()}
            >
              {bdLoading
                ? <><span className="aj-spinner" /> Analyse…</>
                : 'Dicter'
              }
            </button>
          </div>

        ) : (

          /* ══ ÉTAT ACTIF ═════════════════════════════════════════════ */
          <>
            {/* ── Maintenant ───────────────────────────────────────── */}
            {tacheNow && (
              <div className="aj-section">
                <div className="aj-vline aj-vline-now" />
                <div className="aj-section-body">
                  <span className="aj-slabel aj-slabel-now">Maintenant</span>
                  <p className="aj-task-title">{tacheNow.tache.titre}</p>
                  <p className="aj-task-sub">{tacheNow.dossier.titre}</p>
                  <div className="aj-task-btns">
                    <button className="aj-btn-start" onClick={() => navigate('/focus')}>
                      Commencer
                    </button>
                    <button className="aj-btn-later">Après</button>
                  </div>
                </div>
              </div>
            )}

            {/* ── Ensuite ──────────────────────────────────────────── */}
            {tachesNext.length > 0 && (
              <div className="aj-section">
                <div className="aj-vline aj-vline-next" />
                <div className="aj-section-body">
                  <span className="aj-slabel aj-slabel-next">Ensuite</span>
                  {tachesNext.map(({ tache, dossier }) => {
                    const dotColor =
                      dossier.quadrant === 1 ? '#C0392B' :
                      dossier.quadrant === 2 ? '#1C3829' :
                      dossier.quadrant === 3 ? '#B45309' : '#C0B8A8'
                    return (
                      <div key={tache.id} className="aj-next-row">
                        <span className="aj-dot" style={{ background: dotColor }} />
                        <span className="aj-next-titre">{tache.titre}</span>
                        {tache.dureeMin && (
                          <span className="aj-next-duree">{tache.dureeMin} min</span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* ── En attente de retour ─────────────────────────────── */}
            {dossiersAttente.length > 0 && (
              <div className="aj-section">
                <div className="aj-vline aj-vline-wait" />
                <div className="aj-section-body">
                  <span className="aj-slabel aj-slabel-wait">En attente de retour</span>
                  <p className="aj-wait-titre">{dossiersAttente[0].titre}</p>
                  {dossiersAttente[0].organisme && (
                    <p className="aj-wait-org">{dossiersAttente[0].organisme}</p>
                  )}
                  {dossiersAttente.length > 1 && (
                    <button className="aj-wait-more" onClick={() => navigate('/dossiers')}>
                      et {dossiersAttente.length - 1} autre{dossiersAttente.length > 2 ? 's' : ''} →
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* ── Dicter discret ───────────────────────────────────── */}
            <button className="aj-dicter-ghost" onClick={() => setShowBD(true)}>
              + Dicter autre chose
            </button>
          </>
        )}
      </div>

      {/* ── Modal Dicter (état actif) ─────────────────────────────────────── */}
      {showBD && (
        <div className="overlay" onClick={closeBD}>
          <div className="sheet" onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>Dicter autre chose</h3>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 14, lineHeight: 1.5 }}>
              Décrivez ce qui vous préoccupe. L'IA crée les dossiers et lance le Mode Focus.
            </p>
            <textarea
              className="input"
              rows={5}
              placeholder="Ex : j'ai une facture CFF à payer avant vendredi…"
              value={bdTexte}
              onChange={e => setBdTexte(e.target.value)}
              disabled={bdLoading}
              style={{ resize: 'none', marginBottom: 10, lineHeight: 1.5 }}
              autoFocus
            />
            {bdError && (
              <p style={{ fontSize: 13, color: 'var(--red)', marginBottom: 10 }}>{bdError}</p>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-ghost btn-sm" style={{ flex: 1 }}
                onClick={closeBD} disabled={bdLoading}>
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
                  : 'Analyser et lancer'
                }
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{ajCSS}</style>
    </div>
  )
}

/* ══ CSS ══════════════════════════════════════════════════════════════════════ */
const ajCSS = `
  /* ── Page ──────────────────────────────────────────────────────────────── */
  .aj-page {
    flex: 1;
    overflow-y: auto;
    overscroll-behavior-y: contain;
    padding-bottom: calc(68px + env(safe-area-inset-bottom, 0px) + 28px);
    background: #F7F5F0;
  }

  /* ── Header ─────────────────────────────────────────────────────────────── */
  .aj-header {
    background: #1C3829;
    padding: 48px 20px 18px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    position: sticky;
    top: 0;
    z-index: 10;
  }
  .aj-logo {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .aj-logo-circle {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: #C4623A;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .aj-logo-mark {
    color: #fff;
    font-size: 13px;
    font-weight: 800;
    letter-spacing: -1.5px;
    line-height: 1;
  }
  .aj-logo-name {
    color: rgba(255,255,255,0.92);
    font-size: 15px;
    font-weight: 600;
    letter-spacing: -0.2px;
  }
  .aj-avatar {
    width: 34px;
    height: 34px;
    border-radius: 50%;
    background: #C4623A;
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    font-weight: 700;
    flex-shrink: 0;
    letter-spacing: 0;
    border: none;
    cursor: pointer;
    font-family: inherit;
    transition: background 0.15s, transform 0.12s;
  }
  .aj-avatar:active { background: #a84e2d; transform: scale(0.93); }

  /* ── Date bar ────────────────────────────────────────────────────────────── */
  .aj-date-bar {
    padding: 14px 20px 0;
  }
  .aj-date {
    font-size: 11px;
    font-weight: 500;
    color: #A09080;
    text-transform: capitalize;
    letter-spacing: 0.02em;
  }

  /* ── Body ────────────────────────────────────────────────────────────────── */
  .aj-body {
    padding: 0 20px;
  }

  /* ── Greeting ────────────────────────────────────────────────────────────── */
  .aj-greeting {
    display: flex;
    flex-direction: column;
    margin: 18px 0 22px;
    line-height: 1.12;
  }
  .aj-greet-light {
    font-size: 33px;
    font-weight: 300;
    color: #2A1F14;
    letter-spacing: -1px;
  }
  .aj-greet-bold {
    font-size: 33px;
    font-weight: 700;
    color: #2A1F14;
    letter-spacing: -1px;
  }

  /* ── Capture card (état vide) ────────────────────────────────────────────── */
  .aj-capture-card {
    background: #fff;
    border-radius: 16px;
    border: 1px solid #DDD8CE;
    padding: 20px;
    box-shadow: 0 1px 4px rgba(42,31,20,0.06);
  }
  .aj-capture-prompt {
    font-size: 16px;
    font-weight: 600;
    color: #2A1F14;
    margin-bottom: 12px;
    letter-spacing: -0.3px;
  }
  .aj-capture-area {
    width: 100%;
    border: 1.5px solid #DDD8CE;
    border-radius: 10px;
    padding: 12px 14px;
    font-size: 14px;
    font-family: inherit;
    color: #2A1F14;
    background: #F7F5F0;
    resize: none;
    outline: none;
    line-height: 1.5;
    transition: border-color 0.15s;
    margin-bottom: 12px;
    display: block;
  }
  .aj-capture-area:focus { border-color: #1C3829; }
  .aj-capture-area::placeholder { color: #C0B8A8; }
  .aj-bd-error {
    font-size: 13px;
    color: #C0392B;
    margin-bottom: 10px;
  }
  .aj-dicter-btn {
    width: 100%;
    padding: 13px;
    background: #1C3829;
    color: #fff;
    border: none;
    border-radius: 10px;
    font-size: 15px;
    font-weight: 600;
    font-family: inherit;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    transition: background 0.15s, opacity 0.15s;
    letter-spacing: -0.2px;
  }
  .aj-dicter-btn:disabled { opacity: 0.38; cursor: not-allowed; }
  .aj-dicter-btn:active:not(:disabled) { background: #152e1f; }

  /* ── Sections (état actif) ───────────────────────────────────────────────── */
  .aj-section {
    display: flex;
    gap: 14px;
    margin-bottom: 18px;
    align-items: stretch;
  }
  .aj-vline {
    width: 3px;
    border-radius: 2px;
    flex-shrink: 0;
    align-self: stretch;
    min-height: 60px;
  }
  .aj-vline-now  { background: #1C3829; }
  .aj-vline-next { background: #B5A898; }
  .aj-vline-wait { background: #C4623A; }

  .aj-section-body {
    flex: 1;
    padding: 2px 0 8px;
  }
  .aj-slabel {
    display: block;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 1.5px;
    text-transform: uppercase;
    margin-bottom: 7px;
    line-height: 1;
  }
  .aj-slabel-now  { color: #1C3829; }
  .aj-slabel-next { color: #8A7A6A; }
  .aj-slabel-wait { color: #C4623A; }

  /* Maintenant */
  .aj-task-title {
    font-size: 17px;
    font-weight: 700;
    color: #2A1F14;
    line-height: 1.3;
    letter-spacing: -0.4px;
    margin-bottom: 3px;
  }
  .aj-task-sub {
    font-size: 12px;
    color: #A09080;
    margin-bottom: 11px;
    line-height: 1.4;
  }
  .aj-task-btns {
    display: flex;
    gap: 8px;
  }
  .aj-btn-start {
    padding: 8px 18px;
    background: #1C3829;
    color: #fff;
    border: none;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 600;
    font-family: inherit;
    cursor: pointer;
    transition: background 0.15s;
  }
  .aj-btn-start:active { background: #152e1f; }
  .aj-btn-later {
    padding: 8px 16px;
    background: transparent;
    color: #A09080;
    border: 1.5px solid #DDD8CE;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 500;
    font-family: inherit;
    cursor: pointer;
    transition: background 0.15s;
  }
  .aj-btn-later:active { background: #F0EBE3; }

  /* Ensuite */
  .aj-next-row {
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 5px 0;
    border-bottom: 1px solid #F0EBE3;
  }
  .aj-next-row:last-child { border-bottom: none; }
  .aj-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .aj-next-titre {
    flex: 1;
    font-size: 14px;
    color: #2A1F14;
    line-height: 1.4;
  }
  .aj-next-duree {
    font-size: 11px;
    color: #A09080;
    flex-shrink: 0;
  }

  /* En attente */
  .aj-wait-titre {
    font-size: 15px;
    font-weight: 600;
    color: #2A1F14;
    letter-spacing: -0.3px;
    margin-bottom: 2px;
  }
  .aj-wait-org {
    font-size: 12px;
    color: #A09080;
    margin-bottom: 7px;
  }
  .aj-wait-more {
    background: none;
    border: none;
    color: #C4623A;
    font-size: 13px;
    font-weight: 600;
    font-family: inherit;
    cursor: pointer;
    padding: 0;
    transition: opacity 0.15s;
  }
  .aj-wait-more:active { opacity: 0.6; }

  /* ── Bouton Dicter discret ───────────────────────────────────────────────── */
  .aj-dicter-ghost {
    width: 100%;
    margin-top: 4px;
    padding: 13px;
    background: transparent;
    color: #A09080;
    border: 1.5px dashed #DDD8CE;
    border-radius: 10px;
    font-size: 13px;
    font-weight: 500;
    font-family: inherit;
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
    letter-spacing: 0;
  }
  .aj-dicter-ghost:active { background: #F0EBE3; color: #2A1F14; }

  /* ── Spinner inline ──────────────────────────────────────────────────────── */
  .aj-spinner {
    width: 14px;
    height: 14px;
    border: 2px solid rgba(255,255,255,0.3);
    border-top-color: #fff;
    border-radius: 50%;
    animation: spin 0.75s linear infinite;
    display: inline-block;
    vertical-align: middle;
  }

  /* ── Skeleton ────────────────────────────────────────────────────────────── */
  .aj-sk-block {
    background: linear-gradient(90deg, #DDD8CE 25%, #ede9e2 50%, #DDD8CE 75%);
    background-size: 200% 100%;
    animation: shimmer 1.4s infinite;
    border-radius: 10px;
    height: 120px;
    margin-bottom: 12px;
  }
  @keyframes shimmer {
    0%   { background-position: -200% 0; }
    100% { background-position:  200% 0; }
  }
`
