import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { analyserBrainDump, genererMessageMatinal } from '../services/claude'
import { getRoutines } from '../services/db'
import {
  APP_TIME_ZONE, todayISO, todayFR, todayCalendarParts,
  isTaskInActionQueue, isTaskTimedToday,
} from '../utils/date'

const RESUME_KEY = (d) => `nm-resume-${d}`

function calcQuadrant(u, i) {
  if (u && i)  return 1
  if (!u && i) return 2
  if (u && !i) return 3
  return 4
}

function routinesDuJour(routines) {
  const { dayOfWeek: dow, day: dom } = todayCalendarParts()
  return routines.filter(r => {
    if (r.recurrence === 'daily')   return true
    if (r.recurrence === 'weekly')  return r.jourSemaine === dow
    if (r.recurrence === 'monthly') return r.jourMois    === dom
    return false
  })
}

export default function Aujourdhui() {
  const { dossiersAujourdhui, dossiers, loading, apiKey, creerDossier, authUser } = useApp()
  const navigate = useNavigate()

  const [bdTexte,   setBdTexte]   = useState('')
  const [bdLoading, setBdLoading] = useState(false)
  const [bdError,   setBdError]   = useState('')
  const [showBD,    setShowBD]    = useState(false)
  const [indexTache, setIndexTache] = useState(0)

  // ── Routines du jour ───────────────────────────────────────────────────────
  // Coche "fait aujourd'hui" : localStorage uniquement (clé datée), jamais Supabase
  const [routinesJour, setRoutinesJour] = useState([])
  const [routinesFaites, setRoutinesFaites] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`nm-routines-faites-${todayISO()}`)) || [] }
    catch { return [] }
  })

  useEffect(() => {
    if (!authUser) return
    getRoutines(authUser.id).then(r => setRoutinesJour(routinesDuJour(r))).catch(() => {})
  }, [authUser])

  const toggleRoutineFaite = (id) => {
    setRoutinesFaites(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
      localStorage.setItem(`nm-routines-faites-${todayISO()}`, JSON.stringify(next))
      return next
    })
  }

  // ── Résumé IA matinal ──────────────────────────────────────────────────────
  const [resumeIA,      setResumeIA]      = useState(() => {
    try { return localStorage.getItem(RESUME_KEY(todayISO())) || null } catch { return null }
  })
  const [resumeLoading, setResumeLoading] = useState(false)
  const [resumeError,   setResumeError]   = useState(null)

  const genererResume = useCallback(async () => {
    if (!apiKey) return
    const actifs = (dossiers || []).filter(d => d.etat !== 'clos').slice(0, 8)
    if (actifs.length === 0) return
    setResumeLoading(true); setResumeError(null)
    try {
      const msg = await genererMessageMatinal(actifs)
      if (msg) {
        setResumeIA(msg)
        localStorage.setItem(RESUME_KEY(todayISO()), msg)
      }
    } catch (e) {
      setResumeError(e.message || 'Erreur de génération.')
    } finally {
      setResumeLoading(false)
    }
  }, [apiKey, dossiers])

  // Générer automatiquement au chargement si pas encore de résumé pour aujourd'hui
  // Dépend aussi de `dossiers` pour se déclencher quand l'utilisateur revient sur l'écran
  useEffect(() => {
    if (!loading && apiKey && !resumeIA) {
      genererResume()
    }
  }, [loading, dossiers]) // eslint-disable-line

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
      // Focus ne reçoit que la file d'action : ni tâche future, ni tâche d'aujourd'hui avec heure
      const referenceISO = todayISO()
      const brainDumpTaches = created
        .sort((a, b) => a.quadrant - b.quadrant)
        .flatMap(d =>
          d.taches.filter(t => isTaskInActionQueue(t, referenceISO)).map(t => ({
            tache:   { ...t, done: false },
            dossier: { id: d.id, titre: d.titre, organisme: d.organisme ?? null, quadrant: d.quadrant },
          }))
        )
      setBdTexte('')
      // Aucune tâche éligible : dossiers créés, on reste sur Aujourd'hui (comme « Créer » du Brain dump de Capturer)
      if (brainDumpTaches.length === 0) { setShowBD(false); return }
      navigate('/focus', { state: { brainDumpTaches } })
    } catch (e) {
      setBdError(e.message || 'Erreur lors de l\'analyse.')
    } finally {
      setBdLoading(false)
    }
  }

  const creerRapideAccueil = async () => {
    const lignes = bdTexte.split('\n').map(l => l.trim()).filter(Boolean)
    if (lignes.length === 0) return
    setBdLoading(true); setBdError('')
    try {
      const titre = lignes.length === 1
        ? (lignes[0].length > 100 ? lignes[0].slice(0, 100) + '…' : lignes[0])
        : `Notes rapides — ${new Date().toLocaleDateString('fr-FR', { timeZone: APP_TIME_ZONE, day: 'numeric', month: 'short' })}`
      const dossier = await creerDossier({ titre, taches: lignes, origine: 'vocal' })
      setBdTexte('')
      setShowBD(false)
      navigate(`/dossiers/${dossier.id}`)
    } catch (e) {
      setBdError(e.message || 'Erreur lors de la création.')
    } finally {
      setBdLoading(false)
    }
  }

  const closeBD = () => { if (!bdLoading) { setShowBD(false); setBdTexte(''); setBdError('') } }

  // ── Données état actif ────────────────────────────────────────────────────
  const today = todayISO()

  // File d'action : 7 premiers dossiers actionnables ayant au moins une tâche actionnable
  // (liste dédiée : un dossier en attente / bloqué / 100 % futur ne prend pas de place)
  const dossiersPourActions = (dossiers || [])
    .filter(d =>
      d.etat === 'actionnable' &&
      (d.taches || []).some(t => isTaskInActionQueue(t, today))
    )
    .sort((a, b) =>
      a.quadrant - b.quadrant ||
      (b.updatedAt || '').localeCompare(a.updatedAt || '')
    )
    .slice(0, 7)

  const toutesLesTaches = dossiersPourActions.flatMap(d =>
    (d.taches || [])
      .filter(t => isTaskInActionQueue(t, today))
      .map(t => ({ tache: t, dossier: d }))
  )

  // Planifié aujourd'hui : tous les dossiers actionnables, sans limite de 7, tri par heure
  const tachesPlanifieesAujourdhui = (dossiers || [])
    .filter(d => d.etat === 'actionnable')
    .flatMap(d =>
      (d.taches || [])
        .filter(t => isTaskTimedToday(t, today))
        .map(t => ({ tache: t, dossier: d }))
    )
    .sort((a, b) => a.tache.heurePlanifiee.localeCompare(b.tache.heurePlanifiee))

  const indexEffectif  = Math.min(indexTache, Math.max(0, toutesLesTaches.length - 1))
  const tacheNow       = toutesLesTaches[indexEffectif] || null
  const tachesNext     = toutesLesTaches.slice(indexEffectif + 1, indexEffectif + 4)

  const handleApres = () => {
    if (toutesLesTaches.length <= 1) return
    setIndexTache(i => Math.min(i + 1, toutesLesTaches.length - 1))
  }
  const allDossiers    = dossiers || dossiersAujourdhui
  const dossiersAttente = allDossiers
    .filter(d => d.etat === 'attente_externe')
    .sort((a, b) => new Date(a.lastActionAt ?? a.updatedAt) - new Date(b.lastActionAt ?? b.updatedAt))
  const joursAttentePremier = dossiersAttente[0]
    ? Math.floor((new Date() - new Date(dossiersAttente[0].lastActionAt ?? dossiersAttente[0].updatedAt)) / 86_400_000)
    : null

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

        {/* ── Résumé IA matinal ─────────────────────────────────────── */}
        {(resumeIA || resumeLoading || resumeError) && (
          <div className="aj-resume-card">
            <div className="aj-resume-top">
              <span className={`aj-resume-dot${resumeLoading ? ' aj-resume-dot-pulse' : ''}`} />
              <span className="aj-resume-label">Résumé du jour</span>
              <button
                className="aj-resume-refresh"
                onClick={genererResume}
                disabled={resumeLoading}
                title="Régénérer"
              >↺</button>
            </div>
            {resumeLoading ? (
              <div className="aj-resume-skeleton" />
            ) : resumeError ? (
              <p className="aj-resume-error">{resumeError}</p>
            ) : (
              <p className="aj-resume-text">{resumeIA}</p>
            )}
          </div>
        )}

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
              onTouchEnd={lancerBrainDump}
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
            {/* ── Planifié aujourd'hui ─────────────────────────────── */}
            {tachesPlanifieesAujourdhui.length > 0 && (
              <div className="aj-section">
                <div className="aj-vline aj-vline-planned" />
                <div className="aj-section-body">
                  <span className="aj-slabel aj-slabel-planned">Planifié aujourd’hui</span>
                  {tachesPlanifieesAujourdhui.map(({ tache, dossier }) => (
                    <div
                      key={`${dossier.id}-${tache.id}`}
                      className="aj-planned-row"
                      onClick={() => navigate(`/dossiers/${dossier.id}`)}
                    >
                      <span className="aj-planned-heure">{tache.heurePlanifiee}</span>
                      <div className="aj-planned-texte">
                        <span className="aj-planned-titre">{tache.titre}</span>
                        <span className="aj-planned-dossier">{dossier.titre}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Maintenant ───────────────────────────────────────── */}
            {tacheNow && (
              <div className="aj-section">
                <div className="aj-vline aj-vline-now" />
                <div className="aj-section-body">
                  <span className="aj-slabel aj-slabel-now">Maintenant</span>
                  <p className="aj-task-title">{tacheNow.tache.titre}</p>
                  <p className="aj-task-sub">{tacheNow.dossier.titre}</p>
                  <div className="aj-task-btns">
                    <button
                      className="aj-btn-start"
                      onClick={() => navigate('/focus', { state: { taches: toutesLesTaches, from: 'today' } })}
                      onTouchEnd={(e) => { e.preventDefault(); navigate('/focus', { state: { taches: toutesLesTaches, from: 'today' } }) }}
                    >
                      Commencer
                    </button>
                    <button
                      className="aj-btn-later"
                      onClick={handleApres}
                      onTouchEnd={(e) => { e.preventDefault(); handleApres() }}
                      disabled={toutesLesTaches.length <= 1}
                    >Après</button>
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

            {/* ── Routines du jour ─────────────────────────────────── */}
            {routinesJour.length > 0 && (
              <div className="aj-section">
                <div className="aj-vline aj-vline-routine" />
                <div className="aj-section-body">
                  <span className="aj-slabel aj-slabel-routine">Routines du jour</span>
                  {routinesJour.map(r => (
                    <div key={r.id} className="aj-routine-row" onClick={() => toggleRoutineFaite(r.id)}>
                      <span className={`aj-routine-check${routinesFaites.includes(r.id) ? ' aj-routine-checked' : ''}`} />
                      <span className={`aj-routine-titre${routinesFaites.includes(r.id) ? ' aj-routine-done' : ''}`}>
                        {r.titre}
                      </span>
                      <span className="aj-routine-duree">{r.dureeMin} min</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── En attente de retour ─────────────────────────────── */}
            {dossiersAttente.length > 0 && (
              <div className="aj-section">
                <div className="aj-vline aj-vline-wait" />
                <div className="aj-section-body">
                  <span className="aj-slabel aj-slabel-wait">En attente de retour</span>
                  <div
                    onClick={() => navigate(`/dossiers/${dossiersAttente[0].id}`)}
                    onTouchEnd={(e) => { e.preventDefault(); navigate(`/dossiers/${dossiersAttente[0].id}`) }}
                    style={{ cursor: 'pointer' }}
                  >
                    <p className="aj-wait-titre">{dossiersAttente[0].titre}</p>
                    {dossiersAttente[0].organisme && (
                      <p className="aj-wait-org">{dossiersAttente[0].organisme}</p>
                    )}
                  </div>
                  {joursAttentePremier !== null && joursAttentePremier >= 15 && (
                    <p className="aj-wait-relance">Aucun retour depuis {joursAttentePremier} jours — relancer ?</p>
                  )}
                  {dossiersAttente.length > 1 && (
                    <button className="aj-wait-more" onClick={() => navigate('/dossiers?filtre=attente')}>
                      et {dossiersAttente.length - 1} autre{dossiersAttente.length > 2 ? 's' : ''} →
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* ── Dicter discret ───────────────────────────────────── */}
            <button className="aj-dicter-ghost" onClick={() => setShowBD(true)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1C3829" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                <line x1="12" y1="19" x2="12" y2="23"/>
                <line x1="8" y1="23" x2="16" y2="23"/>
              </svg>
              Dicter autre chose
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
                onTouchEnd={lancerBrainDump}
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
            <button className="btn btn-ghost btn-full btn-sm" style={{ marginTop: 8 }}
              onClick={creerRapideAccueil}
              onTouchEnd={(e) => { e.preventDefault(); creerRapideAccueil() }}
              disabled={bdLoading || !bdTexte.trim()}>
              ⚡ Créer directement (sans IA)
            </button>
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

  /* ── Résumé IA matinal ───────────────────────────────────────────────────── */
  .aj-resume-card {
    background: #fff;
    border-radius: 14px;
    border: 1px solid #DDD8CE;
    padding: 14px 16px;
    margin-bottom: 6px;
    box-shadow: 0 1px 4px rgba(42,31,20,0.05);
  }
  .aj-resume-top {
    display: flex;
    align-items: center;
    gap: 7px;
    margin-bottom: 8px;
  }
  .aj-resume-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #1C3829;
    flex-shrink: 0;
  }
  .aj-resume-dot-pulse {
    animation: aj-dot-pulse 1.8s ease-in-out infinite;
  }
  @keyframes aj-dot-pulse {
    0%, 100% { opacity: 1; transform: scale(1);   }
    50%       { opacity: 0.3; transform: scale(0.6); }
  }
  .aj-resume-label {
    flex: 1;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 1.4px;
    text-transform: uppercase;
    color: #1C3829;
  }
  .aj-resume-refresh {
    background: none;
    border: none;
    color: #A09080;
    font-size: 16px;
    cursor: pointer;
    padding: 2px 4px;
    line-height: 1;
    transition: color 0.15s, transform 0.2s;
    font-family: inherit;
  }
  .aj-resume-refresh:hover:not(:disabled) { color: #1C3829; }
  .aj-resume-refresh:active:not(:disabled) { transform: rotate(-90deg); }
  .aj-resume-refresh:disabled { opacity: 0.3; cursor: default; }
  .aj-resume-text {
    font-size: 14px;
    color: #2A1F14;
    line-height: 1.6;
    margin: 0;
    letter-spacing: -0.1px;
  }
  .aj-resume-skeleton {
    height: 52px;
    background: linear-gradient(90deg, #DDD8CE 25%, #ede9e2 50%, #DDD8CE 75%);
    background-size: 200% 100%;
    animation: shimmer 1.4s infinite;
    border-radius: 8px;
  }
  .aj-resume-error {
    font-size: 12px;
    color: #C0392B;
    margin: 0;
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

  /* Routines du jour */
  .aj-vline-routine  { background: #DDD8CE; }
  .aj-slabel-routine { color: #8A7A6A; }
  .aj-routine-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 7px 0;
    border-bottom: 1px solid #F0EBE3;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }
  .aj-routine-row:last-child { border-bottom: none; }
  .aj-routine-check {
    width: 18px;
    height: 18px;
    border-radius: 5px;
    border: 1.5px solid #DDD8CE;
    background: #fff;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.15s, border-color 0.15s;
  }
  .aj-routine-check.aj-routine-checked {
    background: #1C3829;
    border-color: #1C3829;
  }
  .aj-routine-check.aj-routine-checked::after {
    content: '✓';
    color: #fff;
    font-size: 12px;
    font-weight: 700;
    line-height: 1;
  }
  .aj-routine-titre {
    flex: 1;
    font-size: 14px;
    color: #2A1F14;
    line-height: 1.4;
  }
  .aj-routine-titre.aj-routine-done {
    text-decoration: line-through;
    color: #A09080;
  }
  .aj-routine-duree {
    font-size: 11px;
    color: #A09080;
    flex-shrink: 0;
  }

  /* Planifié aujourd'hui */
  .aj-vline-planned  { background: rgba(28,56,41,0.45); }
  .aj-slabel-planned { color: #1C3829; }
  .aj-planned-row {
    display: flex;
    align-items: baseline;
    gap: 12px;
    padding: 6px 0;
    border-bottom: 1px solid #F0EBE3;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }
  .aj-planned-row:last-child { border-bottom: none; }
  .aj-planned-row:active { opacity: 0.6; }
  .aj-planned-heure {
    font-size: 13px;
    font-weight: 700;
    color: #1C3829;
    font-variant-numeric: tabular-nums;
    min-width: 40px;
    flex-shrink: 0;
  }
  .aj-planned-texte {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .aj-planned-titre {
    font-size: 14px;
    color: #2A1F14;
    line-height: 1.4;
  }
  .aj-planned-dossier {
    font-size: 12px;
    color: #A09080;
    line-height: 1.4;
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
  .aj-wait-relance {
    font-size: 12px;
    color: #C4623A;
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

  /* ── Bouton Dicter (plus visible) ───────────────────────────────────────── */
  .aj-dicter-ghost {
    width: 100%;
    margin-top: 4px;
    padding: 12px 16px;
    background: #E8F0EA;
    color: #1C3829;
    border: 1.5px solid rgba(28,56,41,0.2);
    border-radius: 10px;
    font-size: 13px;
    font-weight: 600;
    font-family: inherit;
    cursor: pointer;
    transition: background 0.15s, border-color 0.15s;
    letter-spacing: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
  }
  .aj-dicter-ghost:active { background: #d4e6d8; border-color: #1C3829; }

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
