import { useState, useEffect, useMemo } from 'react'
import { genererRecommandationHebdo } from '../services/claude'
import { getEtapesForDossier } from '../services/db'

// ── Helpers ──────────────────────────────────────────────────────────────────
function todayISO() { return new Date().toISOString().split('T')[0] }

function joursDepuis(dateISO) {
  if (!dateISO) return 0
  const d = new Date(dateISO)
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / 86_400_000))
}

function prochainLundiISO() {
  const d = new Date()
  const day = d.getDay()                  // 0 = dim, 1 = lun, ...
  const diff = ((8 - day) % 7) || 7       // si lundi → +7 jours
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d.toISOString().split('T')[0]
}

function joursAvant(dateISO) {
  if (!dateISO) return null
  const due  = new Date(dateISO + 'T00:00:00')
  const now  = new Date(); now.setHours(0, 0, 0, 0)
  return Math.ceil((due - now) / 86_400_000)
}

// ── Composant ────────────────────────────────────────────────────────────────
export default function WeeklyReviewModal({
  dossiers,
  prenom,
  authUser,
  onClose,
  mettreAJourDossier,
  supprimerDossier,
}) {
  const [step,          setStep]          = useState('intro')   // intro | review | done
  const [currentIndex,  setCurrentIndex]  = useState(0)
  const [items]                           = useState(dossiers)
  const [planifOpen,    setPlanifOpen]    = useState(false)
  const [planifDate,    setPlanifDate]    = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [stats,         setStats]         = useState({ promus: 0, planifies: 0, snoozes: 0, supprimes: 0 })
  // Map { [dossierId]: { loading: bool, text: string|null, error: string|null } }
  const [analyses,      setAnalyses]      = useState({})

  const total   = items.length
  const current = items[currentIndex]

  // ── Lancement des analyses IA en parallèle quand on passe à "review" ───
  useEffect(() => {
    if (step !== 'review' || Object.keys(analyses).length > 0) return

    // Init : toutes en loading
    const init = {}
    items.forEach(d => { init[d.id] = { loading: true, text: null, error: null } })
    setAnalyses(init)

    // Lancer tous les appels en parallèle
    items.forEach(async (d) => {
      try {
        const historique = await getEtapesForDossier(d.id, authUser?.id).catch(() => [])
        const txt = await genererRecommandationHebdo({
          dossier: d,
          joursSansAction: joursDepuis(d.updatedAt),
          historique: (historique || []).slice(-3).reverse(),
        })
        setAnalyses(prev => ({ ...prev, [d.id]: { loading: false, text: (txt || '').trim(), error: null } }))
      } catch (e) {
        setAnalyses(prev => ({ ...prev, [d.id]: { loading: false, text: null, error: e.message || 'Erreur' } }))
      }
    })
  }, [step])  // eslint-disable-line

  // ── Navigation entre dossiers ────────────────────────────────────────────
  const advance = (statKey) => {
    if (statKey) setStats(s => ({ ...s, [statKey]: s[statKey] + 1 }))
    setPlanifOpen(false); setPlanifDate(''); setConfirmDelete(false)
    if (currentIndex < total - 1) setCurrentIndex(i => i + 1)
    else setStep('done')
  }

  // ── Handlers actions ─────────────────────────────────────────────────────
  const handlePrioriser = async () => {
    try { await mettreAJourDossier(current.id, { importance: true, urgence: false }) } catch {}
    advance('promus')
  }

  const handlePlanifierToggle = () => {
    setPlanifOpen(o => !o)
    setConfirmDelete(false)
  }

  const handlePlanifierConfirm = async () => {
    if (!planifDate) return
    try { await mettreAJourDossier(current.id, { echeance: planifDate, importance: true, urgence: false }) } catch {}
    advance('planifies')
  }

  const handleSnooze = () => {
    try { localStorage.setItem(`nm-snooze-${current.id}`, prochainLundiISO()) } catch {}
    advance('snoozes')
  }

  const handleSupprimerToggle = () => {
    setConfirmDelete(o => !o)
    setPlanifOpen(false)
  }

  const handleSupprimerConfirm = async () => {
    try { await supprimerDossier(current.id) } catch {}
    advance('supprimes')
  }

  // ── Données dérivées dossier courant ─────────────────────────────────────
  const joursSansAction = current ? joursDepuis(current.updatedAt) : 0
  const joursEch        = current ? joursAvant(current.echeance) : null
  const echProche       = joursEch !== null && joursEch < 30
  const analyse         = current ? analyses[current.id] : null

  const totalTraite = stats.promus + stats.planifies + stats.snoozes + stats.supprimes
  const progressPct = total > 0 ? Math.round((currentIndex / total) * 100) : 0

  // ── Logo header (réutilisable) ───────────────────────────────────────────
  const Logo = () => (
    <div className="wrm-logo">
      <span className="wrm-logo-mark">»</span>
    </div>
  )

  // ── Rendu ────────────────────────────────────────────────────────────────
  return (
    <div className="wrm-overlay">
      <div className="wrm-sheet">

        {/* ═══ ÉCRAN 1 — Intro ═════════════════════════════════════════════ */}
        {step === 'intro' && (
          <>
            <header className="wrm-header">
              <div className="wrm-header-brand">
                <Logo />
                <span className="wrm-header-label">Revue hebdomadaire</span>
              </div>
              <h1 className="wrm-greeting">
                <span className="wrm-greet-light">Bon lundi,</span>
                <span className="wrm-greet-bold">{prenom || 'Ludovic'}.</span>
              </h1>
              <p className="wrm-header-sub">Ta secrétaire IA a préparé ta revue.</p>
            </header>

            <div className="wrm-body">
              <div className="wrm-card">
                <p className="wrm-card-label">Dossiers en attente de décision</p>
                <p className="wrm-big-number">
                  <span className="wrm-big-num">{total}</span>
                  <span className="wrm-big-suffix"> dossier{total > 1 ? 's' : ''} "Plus tard"</span>
                </p>
                <p className="wrm-card-text">sans action récente</p>
                <div className="wrm-divider" />
                <p className="wrm-card-text">
                  J'ai analysé chacun et préparé une recommandation personnalisée.
                </p>
              </div>

              <button
                className="wrm-btn-primary"
                onClick={() => setStep('review')}
                onTouchEnd={(e) => { e.preventDefault(); setStep('review') }}
              >
                On y va →
              </button>
              <button
                className="wrm-btn-secondary"
                onClick={onClose}
                onTouchEnd={(e) => { e.preventDefault(); onClose() }}
              >
                Plus tard
              </button>
            </div>
          </>
        )}

        {/* ═══ ÉCRAN 2 — Revue ═════════════════════════════════════════════ */}
        {step === 'review' && current && (
          <>
            <header className="wrm-header wrm-header-review">
              <div className="wrm-header-brand">
                <Logo />
                <span className="wrm-header-label">
                  Revue · <strong>{currentIndex + 1}</strong> / {total}
                </span>
              </div>
              <div className="wrm-progress">
                <div className="wrm-progress-fill" style={{ width: `${progressPct}%` }} />
              </div>
            </header>

            <div className="wrm-body">
              <div className="wrm-card wrm-card-dossier">
                <span className="wrm-tag">
                  Plus tard · {joursSansAction} jour{joursSansAction > 1 ? 's' : ''} sans action
                </span>
                <h2 className="wrm-dossier-titre">{current.titre}</h2>
                <div className="wrm-dossier-meta">
                  {current.organisme && <span className="wrm-meta-org">{current.organisme}</span>}
                  {current.echeance && (
                    <span className={`wrm-meta-ech${echProche ? ' wrm-meta-ech-close' : ''}`}>
                      Échéance {new Date(current.echeance + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                  )}
                </div>

                {/* Bloc analyse IA */}
                <div className="wrm-ia">
                  <div className="wrm-ia-head">
                    <span className={`wrm-ia-dot${analyse?.loading ? ' wrm-ia-dot-pulse' : ''}`} />
                    <span className="wrm-ia-label">Analyse IA</span>
                  </div>
                  {analyse?.loading && (
                    <p className="wrm-ia-text wrm-ia-loading">Analyse en cours...</p>
                  )}
                  {analyse?.error && !analyse.loading && (
                    <p className="wrm-ia-text wrm-ia-err">Analyse non disponible.</p>
                  )}
                  {analyse?.text && !analyse.loading && (
                    <p className="wrm-ia-text">{analyse.text}</p>
                  )}
                </div>
              </div>

              <p className="wrm-actions-label">Que veux-tu faire ?</p>

              {/* Action 1 — Prioriser */}
              <button
                className="wrm-action"
                onClick={handlePrioriser}
                onTouchEnd={(e) => { e.preventDefault(); handlePrioriser() }}
              >
                <span className="wrm-act-dot" style={{ background: '#639922' }} />
                <span className="wrm-act-text">
                  <span className="wrm-act-title">C'est important → le traiter</span>
                  <span className="wrm-act-sub">Passe en Important</span>
                </span>
                <span className="wrm-act-chev">›</span>
              </button>

              {/* Action 2 — Planifier */}
              <button
                className={`wrm-action${planifOpen ? ' wrm-action-open' : ''}`}
                onClick={handlePlanifierToggle}
                onTouchEnd={(e) => { e.preventDefault(); handlePlanifierToggle() }}
              >
                <span className="wrm-act-dot" style={{ background: '#EF9F27' }} />
                <span className="wrm-act-text">
                  <span className="wrm-act-title">Planifier à une date précise</span>
                  <span className="wrm-act-sub">Choisir une date →</span>
                </span>
                <span className="wrm-act-chev">›</span>
              </button>
              {planifOpen && (
                <div className="wrm-inline-row">
                  <input
                    type="date"
                    className="wrm-date-input"
                    value={planifDate}
                    onChange={e => setPlanifDate(e.target.value)}
                    min={todayISO()}
                    autoFocus
                  />
                  <button
                    className="wrm-btn-mini wrm-btn-mini-primary"
                    disabled={!planifDate}
                    onClick={handlePlanifierConfirm}
                    onTouchEnd={(e) => { e.preventDefault(); handlePlanifierConfirm() }}
                  >OK</button>
                  <button
                    className="wrm-btn-mini"
                    onClick={() => setPlanifOpen(false)}
                    onTouchEnd={(e) => { e.preventDefault(); setPlanifOpen(false) }}
                  >✕</button>
                </div>
              )}

              {/* Action 3 — Snooze */}
              <button
                className="wrm-action"
                onClick={handleSnooze}
                onTouchEnd={(e) => { e.preventDefault(); handleSnooze() }}
              >
                <span className="wrm-act-dot" style={{ background: '#DDD8CE' }} />
                <span className="wrm-act-text">
                  <span className="wrm-act-title">Revient lundi prochain</span>
                  <span className="wrm-act-sub">Reste en Plus tard</span>
                </span>
                <span className="wrm-act-chev">›</span>
              </button>

              {/* Action 4 — Supprimer */}
              <button
                className={`wrm-action${confirmDelete ? ' wrm-action-open' : ''}`}
                onClick={handleSupprimerToggle}
                onTouchEnd={(e) => { e.preventDefault(); handleSupprimerToggle() }}
              >
                <span className="wrm-act-dot" style={{ background: '#C4623A' }} />
                <span className="wrm-act-text">
                  <span className="wrm-act-title wrm-act-title-danger">Ce n'est plus pertinent</span>
                  <span className="wrm-act-sub">Supprimer le dossier</span>
                </span>
                <span className="wrm-act-chev">›</span>
              </button>
              {confirmDelete && (
                <div className="wrm-confirm">
                  <p className="wrm-confirm-text">
                    Tu es sûr ? Ce dossier sera supprimé définitivement.
                  </p>
                  <div className="wrm-confirm-btns">
                    <button
                      className="wrm-btn-mini"
                      onClick={() => setConfirmDelete(false)}
                      onTouchEnd={(e) => { e.preventDefault(); setConfirmDelete(false) }}
                    >Annuler</button>
                    <button
                      className="wrm-btn-mini wrm-btn-mini-danger"
                      onClick={handleSupprimerConfirm}
                      onTouchEnd={(e) => { e.preventDefault(); handleSupprimerConfirm() }}
                    >Supprimer</button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* ═══ ÉCRAN 3 — Fin ═══════════════════════════════════════════════ */}
        {step === 'done' && (
          <>
            <header className="wrm-header">
              <div className="wrm-header-brand">
                <Logo />
                <span className="wrm-header-label">Revue terminée</span>
              </div>
              <h1 className="wrm-greeting">
                <span className="wrm-greet-light">Bien joué,</span>
                <span className="wrm-greet-bold">{prenom || 'Ludovic'}.</span>
              </h1>
            </header>

            <div className="wrm-body wrm-body-done">
              <div className="wrm-done-check">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              </div>

              <p className="wrm-done-count">{totalTraite} dossier{totalTraite > 1 ? 's' : ''} traité{totalTraite > 1 ? 's' : ''}</p>
              <p className="wrm-done-text">
                Tu as libéré ta tête. Ta semaine démarre sur une base claire.
              </p>

              {totalTraite > 0 && (
                <div className="wrm-card wrm-recap">
                  {stats.promus > 0 && (
                    <div className="wrm-recap-row">
                      <span className="wrm-act-dot" style={{ background: '#639922' }} />
                      <span>{stats.promus} promu{stats.promus > 1 ? 's' : ''} en Important</span>
                    </div>
                  )}
                  {stats.planifies > 0 && (
                    <div className="wrm-recap-row">
                      <span className="wrm-act-dot" style={{ background: '#EF9F27' }} />
                      <span>{stats.planifies} planifié{stats.planifies > 1 ? 's' : ''} à une date</span>
                    </div>
                  )}
                  {stats.snoozes > 0 && (
                    <div className="wrm-recap-row">
                      <span className="wrm-act-dot" style={{ background: '#DDD8CE' }} />
                      <span>{stats.snoozes} reporté{stats.snoozes > 1 ? 's' : ''} à lundi prochain</span>
                    </div>
                  )}
                  {stats.supprimes > 0 && (
                    <div className="wrm-recap-row">
                      <span className="wrm-act-dot" style={{ background: '#C4623A' }} />
                      <span>{stats.supprimes} supprimé{stats.supprimes > 1 ? 's' : ''}</span>
                    </div>
                  )}
                </div>
              )}

              <button
                className="wrm-btn-primary"
                onClick={onClose}
                onTouchEnd={(e) => { e.preventDefault(); onClose() }}
              >
                Démarrer la semaine →
              </button>
            </div>
          </>
        )}

      </div>
      <style>{CSS}</style>
    </div>
  )
}

/* ══ CSS ════════════════════════════════════════════════════════════════════ */
const CSS = `
  @keyframes wrm-pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50%       { opacity: 0.3; transform: scale(0.55); }
  }
  @keyframes wrm-fade {
    from { opacity: 0; transform: translateY(8px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  .wrm-overlay {
    position: fixed; inset: 0;
    background: rgba(28, 56, 41, 0.42);
    z-index: 200;
    display: flex;
    align-items: stretch;
    justify-content: center;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    animation: wrm-fade 0.25s ease;
  }
  .wrm-sheet {
    width: 100%;
    max-width: 520px;
    background: #F7F5F0;
    display: flex;
    flex-direction: column;
    min-height: 100%;
  }

  /* ── Header ──────────────────────────────────────────────────────────── */
  .wrm-header {
    background: #1C3829;
    color: #fff;
    padding: 48px 22px 28px;
    flex-shrink: 0;
  }
  .wrm-header-review {
    padding-bottom: 18px;
  }
  .wrm-header-brand {
    display: flex; align-items: center; gap: 10px;
    margin-bottom: 18px;
  }
  .wrm-logo {
    width: 28px; height: 28px; border-radius: 50%;
    background: #C4623A;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
  }
  .wrm-logo-mark {
    color: #fff; font-size: 12px; font-weight: 800;
    letter-spacing: -1.5px; line-height: 1;
  }
  .wrm-header-label {
    font-size: 12px; font-weight: 600;
    color: rgba(255,255,255,0.7);
    letter-spacing: 0.04em;
  }
  .wrm-greeting {
    display: flex; flex-direction: column;
    line-height: 1.12;
    margin-bottom: 8px;
  }
  .wrm-greet-light { font-size: 28px; font-weight: 300; color: #fff; letter-spacing: -0.6px; }
  .wrm-greet-bold  { font-size: 28px; font-weight: 700; color: #fff; letter-spacing: -0.6px; }
  .wrm-header-sub {
    font-size: 14px; color: rgba(255,255,255,0.75);
    margin: 4px 0 0; line-height: 1.5;
  }

  /* Barre de progression (écran review) */
  .wrm-progress {
    height: 3px; background: rgba(255,255,255,0.15);
    border-radius: 2px; overflow: hidden; margin-top: 4px;
  }
  .wrm-progress-fill {
    height: 100%; background: #C4623A; border-radius: 2px;
    transition: width 0.35s ease;
  }

  /* ── Body ────────────────────────────────────────────────────────────── */
  .wrm-body {
    padding: 22px 22px calc(env(safe-area-inset-bottom, 0px) + 28px);
    display: flex; flex-direction: column; gap: 12px;
    flex: 1;
  }
  .wrm-body-done {
    align-items: center; text-align: center;
    padding-top: 36px;
  }

  /* ── Cartes ──────────────────────────────────────────────────────────── */
  .wrm-card {
    background: #fff;
    border: 0.5px solid #DDD8CE;
    border-radius: 12px;
    padding: 18px;
    box-shadow: 0 1px 3px rgba(42,31,20,0.04);
  }
  .wrm-card-dossier {
    padding: 18px 18px 16px;
  }
  .wrm-card-label {
    font-size: 10px; font-weight: 700;
    letter-spacing: 1.4px; text-transform: uppercase;
    color: #A09080;
    margin: 0 0 10px;
  }
  .wrm-big-number {
    display: flex; align-items: baseline; gap: 8px;
    margin: 0 0 4px;
  }
  .wrm-big-num    { font-size: 32px; font-weight: 700; color: #2A1F14; letter-spacing: -1px; line-height: 1; }
  .wrm-big-suffix { font-size: 14px; font-weight: 500; color: #2A1F14; }
  .wrm-card-text {
    font-size: 13px; color: #5A4A3A;
    line-height: 1.55; margin: 6px 0 0;
  }
  .wrm-divider {
    height: 1px; background: #F0EBE3;
    margin: 14px 0 12px;
  }

  /* Tag "Plus tard · X jours" */
  .wrm-tag {
    display: inline-block;
    background: #FAEEDA; color: #854F0B;
    font-size: 10px; font-weight: 700;
    letter-spacing: 0.05em; text-transform: uppercase;
    padding: 4px 10px; border-radius: 12px;
    margin-bottom: 12px;
  }
  .wrm-dossier-titre {
    font-size: 16px; font-weight: 700; color: #2A1F14;
    letter-spacing: -0.3px; line-height: 1.3;
    margin: 0 0 6px;
  }
  .wrm-dossier-meta {
    display: flex; gap: 6px; flex-wrap: wrap;
    margin-bottom: 14px;
  }
  .wrm-meta-org {
    font-size: 11px; color: #A09080;
    text-transform: uppercase; letter-spacing: 0.08em; font-weight: 600;
  }
  .wrm-meta-ech {
    font-size: 11px; color: #A09080;
  }
  .wrm-meta-ech::before { content: '·'; margin: 0 4px; color: #C0B8A8; }
  .wrm-meta-ech-close { color: #C4623A; font-weight: 600; }

  /* Bloc analyse IA */
  .wrm-ia {
    background: #F7F5F0;
    border-left: 3px solid #1C3829;
    border-radius: 0 8px 8px 0;
    padding: 12px 14px;
  }
  .wrm-ia-head {
    display: flex; align-items: center; gap: 7px;
    margin-bottom: 6px;
  }
  .wrm-ia-dot {
    width: 7px; height: 7px; border-radius: 50%;
    background: #639922; flex-shrink: 0;
  }
  .wrm-ia-dot-pulse {
    animation: wrm-pulse 1.6s ease-in-out infinite;
  }
  .wrm-ia-label {
    font-size: 10px; font-weight: 700;
    letter-spacing: 1.4px; text-transform: uppercase;
    color: #1C3829;
  }
  .wrm-ia-text {
    font-size: 13px; color: #2A1F14;
    line-height: 1.5; margin: 0;
  }
  .wrm-ia-loading { color: #A09080; font-style: italic; }
  .wrm-ia-err     { color: #A09080; font-style: italic; }

  /* ── Actions ─────────────────────────────────────────────────────────── */
  .wrm-actions-label {
    font-size: 10px; font-weight: 700;
    letter-spacing: 1.4px; text-transform: uppercase;
    color: #A09080;
    margin: 8px 2px 4px;
  }
  .wrm-action {
    display: flex; align-items: center; gap: 14px;
    width: 100%;
    background: #fff;
    border: 0.5px solid #DDD8CE;
    border-radius: 12px;
    padding: 14px 16px;
    cursor: pointer;
    font-family: inherit;
    text-align: left;
    transition: background 0.12s, border-color 0.12s, transform 0.1s;
    box-shadow: 0 1px 3px rgba(42,31,20,0.04);
  }
  .wrm-action:active { transform: scale(0.985); background: #F7F5F0; }
  .wrm-action-open   { background: #F7F5F0; border-color: #1C3829; }
  .wrm-act-dot {
    width: 10px; height: 10px; border-radius: 50%;
    flex-shrink: 0;
  }
  .wrm-act-text {
    flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0;
  }
  .wrm-act-title {
    font-size: 14px; font-weight: 700; color: #2A1F14;
    line-height: 1.3; letter-spacing: -0.2px;
  }
  .wrm-act-title-danger { color: #C4623A; }
  .wrm-act-sub {
    font-size: 12px; color: #A09080; line-height: 1.4;
  }
  .wrm-act-chev {
    font-size: 22px; color: #C0B8A8;
    flex-shrink: 0; line-height: 1;
  }

  /* Inline date row */
  .wrm-inline-row {
    display: flex; gap: 8px; align-items: center;
    margin: -4px 0 4px;
    padding: 10px 12px;
    background: #fff;
    border: 0.5px solid #DDD8CE;
    border-radius: 12px;
  }
  .wrm-date-input {
    flex: 1;
    border: 1px solid #DDD8CE;
    border-radius: 8px;
    padding: 8px 10px;
    font-size: 13px;
    font-family: inherit;
    color: #2A1F14;
    background: #fff;
    outline: none;
  }
  .wrm-date-input:focus { border-color: #1C3829; }

  /* Confirmation suppression */
  .wrm-confirm {
    background: #fff;
    border: 0.5px solid #C4623A;
    border-radius: 12px;
    padding: 14px;
    margin-top: -4px;
  }
  .wrm-confirm-text {
    font-size: 13px; color: #2A1F14;
    margin: 0 0 12px; line-height: 1.5;
  }
  .wrm-confirm-btns {
    display: flex; gap: 8px; justify-content: flex-end;
  }

  /* ── Boutons ─────────────────────────────────────────────────────────── */
  .wrm-btn-primary {
    width: 100%;
    background: #1C3829; color: #fff;
    border: none; border-radius: 10px;
    padding: 14px;
    font-size: 15px; font-weight: 700;
    font-family: inherit;
    cursor: pointer;
    transition: background 0.15s, transform 0.1s;
    letter-spacing: -0.2px;
    margin-top: 6px;
  }
  .wrm-btn-primary:active { background: #152e1f; transform: scale(0.98); }

  .wrm-btn-secondary {
    width: 100%;
    background: #F0EBE3; color: #A09080;
    border: 0.5px solid #DDD8CE;
    border-radius: 10px;
    padding: 14px;
    font-size: 15px; font-weight: 500;
    font-family: inherit;
    cursor: pointer;
    transition: background 0.15s;
  }
  .wrm-btn-secondary:active { background: #e5dfd3; }

  .wrm-btn-mini {
    background: #F0EBE3; color: #A09080;
    border: 0.5px solid #DDD8CE;
    border-radius: 8px;
    padding: 8px 14px;
    font-size: 13px; font-weight: 600;
    font-family: inherit;
    cursor: pointer;
    transition: background 0.15s;
  }
  .wrm-btn-mini:active { background: #e5dfd3; }
  .wrm-btn-mini-primary { background: #1C3829; color: #fff; border-color: #1C3829; }
  .wrm-btn-mini-primary:active { background: #152e1f; }
  .wrm-btn-mini-primary:disabled { opacity: 0.4; cursor: not-allowed; }
  .wrm-btn-mini-danger { background: #C4623A; color: #fff; border-color: #C4623A; }
  .wrm-btn-mini-danger:active { background: #a84e2d; }

  /* ── Écran fin ───────────────────────────────────────────────────────── */
  .wrm-done-check {
    width: 56px; height: 56px; border-radius: 50%;
    background: #C4623A;
    display: flex; align-items: center; justify-content: center;
    margin: 8px 0 20px;
    box-shadow: 0 4px 16px rgba(196,98,58,0.3);
  }
  .wrm-done-count {
    font-size: 15px; font-weight: 700; color: #2A1F14;
    margin: 0 0 8px; letter-spacing: -0.2px;
  }
  .wrm-done-text {
    font-size: 14px; color: #5A4A3A;
    line-height: 1.55; margin: 0 0 22px;
    max-width: 320px;
  }
  .wrm-recap {
    width: 100%;
    display: flex; flex-direction: column; gap: 10px;
    text-align: left;
    margin-bottom: 18px;
  }
  .wrm-recap-row {
    display: flex; align-items: center; gap: 10px;
    font-size: 13px; color: #2A1F14;
  }
`
