import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { haptic } from '../utils/haptic'
import { savePlanning } from '../services/db'
import { recalculerApresExtension } from '../services/planning'
import DossierSheet from '../components/DossierSheet'

const PLANNING_KEY = (date) => `nm-planning-${date}`

// ── Utilitaires ───────────────────────────────────────────────────────────────
function fmtDuree(min) {
  if (!min || min <= 0) return null
  if (min < 60) return `${min} min`
  const h = Math.round((min / 60) * 10) / 10
  return `${h}h`
}

function fmtLibere(doneIds, planningData) {
  const total = doneIds.reduce((s, id) => {
    const tp = planningData?.tachesPlanifiees.find(p => p.tacheId === id)
    return s + (tp?.dureeMin ?? 45)
  }, 0)
  return fmtDuree(total)
}

// ── Écran de fin ──────────────────────────────────────────────────────────────
function EcranFin({ fait, doneIds, planningData, navigate, fromPlanning }) {
  const libere = fmtLibere(doneIds, planningData)
  return (
    <div className="focus-page">
      <div className="focus-fin-wrap">
        <div className="focus-fin-logo">
          <span className="focus-fin-logo-mark">»</span>
        </div>
        <p className="focus-fin-stat">
          Tu as traité <strong>{fait}&nbsp;tâche{fait > 1 ? 's' : ''}</strong>.
        </p>
        {libere && (
          <p className="focus-fin-libere">
            Tu as libéré <strong>{libere}</strong><br />de ta tête aujourd'hui.
          </p>
        )}
        <button
          className="focus-fin-btn"
          onClick={() => navigate(fromPlanning ? '/planning' : '/')}
        >
          Retour
        </button>
      </div>
      <style>{CSS}</style>
    </div>
  )
}

// ── Page principale ───────────────────────────────────────────────────────────
export default function ModeFocus() {
  const { dossiersAujourdhui, toggleTache } = useApp()
  const navigate = useNavigate()
  const location = useLocation()

  const planningDate    = location.state?.planningDate    || null
  const brainDumpTaches = location.state?.brainDumpTaches || null

  const [planningData, setPlanningData] = useState(() => {
    if (!planningDate) return null
    try { return JSON.parse(localStorage.getItem(PLANNING_KEY(planningDate))) } catch { return null }
  })

  const [tasks] = useState(() => {
    if (planningData) {
      return planningData.tachesPlanifiees
        .filter(tp => !tp.done)
        .map(tp => ({
          tache:   { id: tp.tacheId,   titre: tp.titreTache,  done: false },
          dossier: { id: tp.dossierId, titre: tp.titreDossier,
                     organisme: tp.organisme ?? null, quadrant: tp.quadrant },
          dureeMin: tp.dureeMin ?? null,
        }))
    }
    if (brainDumpTaches) return brainDumpTaches
    return dossiersAujourdhui.flatMap(d =>
      d.taches.filter(t => !t.done).map(t => ({ tache: t, dossier: d, dureeMin: null }))
    )
  })

  const [index,     setIndex]     = useState(0)
  const [fait,      setFait]      = useState(0)
  const [doneIds,   setDoneIds]   = useState([])
  // animPhase pilote les transitions CSS inline (pas de keyframes)
  // 'idle' | 'exiting' | 'snap' | 'entering'
  const [animPhase, setAnimPhase] = useState('idle')
  const [bumpKey,   setBumpKey]   = useState(0)
  const [showPlus,  setShowPlus]  = useState(false)
  const [showSheet, setShowSheet] = useState(false)

  const total   = tasks.length
  const current = tasks[index]

  // ── Fin de session ───────────────────────────────────────────────────────
  if (!current) {
    return (
      <EcranFin
        fait={fait}
        doneIds={doneIds}
        planningData={planningData}
        navigate={navigate}
        fromPlanning={!!planningDate}
      />
    )
  }

  const creneau  = planningData?.tachesPlanifiees.find(t => t.tacheId === current.tache.id) ?? null
  const dureeMin = current.dureeMin ?? creneau?.dureeMin ?? null

  // ── Fait ✓ ───────────────────────────────────────────────────────────────
  const handleFait = () => {
    if (animPhase !== 'idle') return
    haptic('success')
    if (current.dossier.id) {
      toggleTache(current.dossier.id, current.tache.id).catch(console.error)
    }
    // 1. Carte sort vers le haut (transition 300ms)
    setAnimPhase('exiting')
    setTimeout(() => {
      // 2. Contenu mis à jour, carte snappée en bas (pas de transition)
      setFait(n => n + 1)
      setDoneIds(ids => [...ids, current.tache.id])
      setBumpKey(k => k + 1)
      setIndex(i => i + 1)
      setAnimPhase('snap')
      // 3. Double rAF pour laisser le navigateur peindre le snap avant la transition
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setAnimPhase('entering')
          setTimeout(() => setAnimPhase('idle'), 320)
        })
      })
    }, 310)
  }

  // ── Passer ───────────────────────────────────────────────────────────────
  const handlePasser = () => {
    if (animPhase !== 'idle') return
    haptic('light')
    setIndex(i => i + 1)
    setAnimPhase('snap')
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setAnimPhase('entering')
        setTimeout(() => setAnimPhase('idle'), 320)
      })
    })
  }

  // ── Plus de temps ────────────────────────────────────────────────────────
  const handlePlusTemps = async (dureeSupp) => {
    setShowPlus(false)
    if (!planningData || !current) return
    const updated = recalculerApresExtension(planningData.tachesPlanifiees, current.tache.id, dureeSupp)
    const np      = { ...planningData, tachesPlanifiees: updated }
    localStorage.setItem(PLANNING_KEY(planningDate), JSON.stringify(np))
    setPlanningData(np)
    try { await savePlanning(np) } catch {}
    try {
      if (Notification.permission === 'granted')
        new Notification('Planning ajusté', { body: 'Ton planning a été recalculé.', icon: '/favicon.svg' })
    } catch {}
  }

  // Styles inline pilotant les transitions CSS — pas de keyframes
  const TR = 'transform 0.3s ease, opacity 0.3s ease'
  const cardStyle =
    animPhase === 'exiting'  ? { transform: 'translateY(-72px)', opacity: 0, transition: TR }
    : animPhase === 'snap'   ? { transform: 'translateY(72px)',  opacity: 0, transition: 'none' }
    : animPhase === 'entering' ? { transform: 'translateY(0)',   opacity: 1, transition: TR }
    :                            { transform: 'translateY(0)',   opacity: 1 }

  const animating = animPhase !== 'idle'

  return (
    <div className="focus-page">

      {/* ── Header vert ────────────────────────────────────────────── */}
      <header className="focus-header">
        <div className="focus-header-row">
          <button
            className="focus-quit"
            onClick={() => navigate(planningDate ? '/planning' : '/')}
          >
            ← Quitter
          </button>
          <span className="focus-counter" key={bumpKey}>
            {index + 1}
            <span className="focus-counter-sep"> / </span>
            <span className="focus-counter-total">{total}</span>
          </span>
        </div>

        {/* Barre segmentée */}
        <div className="focus-segments">
          {tasks.map((_, i) => (
            <div key={i} className={`focus-seg${i < index ? ' focus-seg--done' : ''}`} />
          ))}
        </div>
      </header>

      {/* ── Corps crème ────────────────────────────────────────────── */}
      <div className="focus-body">
        <div className="focus-card" style={cardStyle}>

          {/* Dossier parent small caps muted centré */}
          <p className="focus-dossier-label">
            {current.dossier.titre}
            {current.dossier.organisme && (
              <span className="focus-dossier-org"> · {current.dossier.organisme}</span>
            )}
          </p>

          {/* Titre de la tâche */}
          <p className="focus-tache-titre">{current.tache.titre}</p>

          {/* Lien dossier discret */}
          {current.dossier.id && (
            <button className="focus-dossier-link" onClick={() => setShowSheet(true)}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
              </svg>
              Voir le dossier
            </button>
          )}

          {/* Durée estimée */}
          {dureeMin && (
            <div className="focus-duree-bloc">
              <span className="focus-duree-val">{fmtDuree(dureeMin)}</span>
              <span className="focus-duree-lbl">estimé</span>
            </div>
          )}

          {/* Créneau planning */}
          {creneau && !dureeMin && (
            <p className="focus-creneau">{creneau.heureDebut} – {creneau.heureFin}</p>
          )}
        </div>
      </div>

      {/* ── Boutons action ─────────────────────────────────────────── */}
      <div className="focus-footer">
        <button
          className="focus-btn-passer"
          onClick={handlePasser}
          disabled={animating}
        >
          Passer
        </button>
        <button
          className="focus-btn-fait"
          onClick={handleFait}
          disabled={animating}
        >
          Fait ✓
        </button>
      </div>

      {planningDate && (
        <div className="focus-plus-wrap">
          <button
            className="focus-plus-btn"
            onClick={() => setShowPlus(true)}
            disabled={animating}
          >
            J'ai besoin de plus de temps
          </button>
        </div>
      )}

      {/* Modal plus de temps */}
      {showPlus && (
        <div className="overlay" onClick={() => setShowPlus(false)}>
          <div className="sheet" onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 6 }}>Temps supplémentaire</h3>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.4 }}>
              Les tâches suivantes seront décalées en conséquence.
            </p>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              {[15, 30, 45, 60].map(m => (
                <button key={m} className="btn btn-secondary"
                  style={{ flex: 1, padding: '12px 4px', fontSize: 15, fontWeight: 600 }}
                  onClick={() => handlePlusTemps(m)}>
                  +{m} min
                </button>
              ))}
            </div>
            <button className="btn btn-ghost btn-full btn-sm" onClick={() => setShowPlus(false)}>
              Annuler
            </button>
          </div>
        </div>
      )}

      {/* DossierSheet */}
      {showSheet && (
        <DossierSheet dossierId={current.dossier.id} onClose={() => setShowSheet(false)} />
      )}

      <style>{CSS}</style>
    </div>
  )
}

/* ══ CSS ══════════════════════════════════════════════════════════════════════ */
const CSS = `
  /* ── Keyframes (compteur + logo fin) ────────────────────────────────────── */
  @keyframes focus-bump {
    0%   { transform: scale(1);    }
    45%  { transform: scale(1.42); }
    100% { transform: scale(1);    }
  }
  @keyframes focus-pop {
    from { transform: scale(0); opacity: 0; }
    to   { transform: scale(1); opacity: 1; }
  }

  /* ── Page ────────────────────────────────────────────────────────────────── */
  .focus-page {
    position: fixed; inset: 0;
    background: #F7F5F0;
    display: flex; flex-direction: column;
    z-index: 200;
  }

  /* ── Header vert ─────────────────────────────────────────────────────────── */
  .focus-header {
    background: #1C3829;
    padding: 52px 22px 16px;
    flex-shrink: 0;
  }
  .focus-header-row {
    display: flex; align-items: center; justify-content: space-between;
    margin-bottom: 16px;
  }
  .focus-quit {
    border: none; background: none;
    font-size: 14px; font-weight: 500;
    color: rgba(255,255,255,0.7); cursor: pointer;
    padding: 4px 0; font-family: inherit;
    transition: color 0.15s;
  }
  .focus-quit:active { color: #fff; }

  .focus-counter {
    font-size: 16px; font-weight: 700; color: #fff;
    animation: focus-bump 0.38s cubic-bezier(0.34, 1.56, 0.64, 1);
    display: inline-flex; align-items: baseline; gap: 1px;
  }
  .focus-counter-sep   { color: rgba(255,255,255,0.35); font-weight: 400; }
  .focus-counter-total { font-size: 13px; font-weight: 400; color: rgba(255,255,255,0.45); }

  /* Barre segmentée */
  .focus-segments {
    display: flex; gap: 4px; height: 4px;
  }
  .focus-seg {
    flex: 1; border-radius: 2px;
    background: rgba(255,255,255,0.2);
    transition: background 0.35s ease;
  }
  .focus-seg--done { background: #C4623A; }

  /* ── Corps ───────────────────────────────────────────────────────────────── */
  .focus-body {
    flex: 1; display: flex; align-items: center; justify-content: center;
    padding: 24px 22px; overflow: hidden;
  }
  .focus-card {
    width: 100%; max-width: 480px;
    background: #fff; border-radius: 14px;
    padding: 32px 26px;
    border: 1px solid #DDD8CE;
    box-shadow: 0 2px 16px rgba(28,56,41,0.07);
    display: flex; flex-direction: column; align-items: center;
    text-align: center;
    /* Les transitions sont appliquées en inline style via animPhase */
  }

  .focus-dossier-label {
    font-size: 10px; font-weight: 700;
    text-transform: uppercase; letter-spacing: 2px;
    color: #A09080; margin-bottom: 14px; line-height: 1.4;
  }
  .focus-dossier-org { font-weight: 400; opacity: 0.7; }

  .focus-tache-titre {
    font-size: 20px; font-weight: 700; color: #2A1F14;
    line-height: 1.3; letter-spacing: -0.4px; margin-bottom: 12px;
  }

  .focus-dossier-link {
    display: inline-flex; align-items: center; gap: 5px;
    background: #F7F5F0; border: none; border-radius: 20px;
    padding: 5px 12px; margin-bottom: 20px;
    font-size: 11px; font-weight: 500; color: #A09080;
    cursor: pointer; font-family: inherit;
    transition: background 0.15s, color 0.15s;
  }
  .focus-dossier-link:active { background: #EDE9E2; color: #2A1F14; }

  .focus-duree-bloc {
    display: flex; flex-direction: column; align-items: center; gap: 3px;
    background: #F0EBE3; border-radius: 10px;
    padding: 12px 32px; margin-top: 2px;
    min-width: 110px;
  }
  .focus-duree-val {
    font-size: 24px; font-weight: 700; color: #2A1F14; line-height: 1;
  }
  .focus-duree-lbl {
    font-size: 9px; font-weight: 600; color: #A09080;
    text-transform: uppercase; letter-spacing: 1.2px;
  }
  .focus-creneau { font-size: 12px; color: #A09080; margin-top: 12px; }

  /* ── Boutons ─────────────────────────────────────────────────────────────── */
  .focus-footer {
    padding: 0 22px 10px;
    display: flex; gap: 10px; flex-shrink: 0;
  }
  .focus-btn-passer {
    flex: 0.55; padding: 16px 12px;
    background: #F0EBE3; color: #7A6A5A;
    border: none; border-radius: 14px;
    font-size: 15px; font-weight: 600; font-family: inherit;
    cursor: pointer; transition: background 0.15s, transform 0.12s;
  }
  .focus-btn-passer:active:not(:disabled) { background: #DDD8CE; transform: scale(0.97); }
  .focus-btn-passer:disabled { opacity: 0.4; pointer-events: none; }

  .focus-btn-fait {
    flex: 1; padding: 16px 12px;
    background: #1C3829; color: #fff;
    border: none; border-radius: 14px;
    font-size: 15px; font-weight: 700; font-family: inherit;
    cursor: pointer; transition: background 0.15s, transform 0.12s;
  }
  .focus-btn-fait:active:not(:disabled) { background: #152e1f; transform: scale(0.97); }
  .focus-btn-fait:disabled { opacity: 0.4; pointer-events: none; }

  .focus-plus-wrap {
    padding: 0 22px calc(env(safe-area-inset-bottom, 0px) + 14px);
    text-align: center; flex-shrink: 0;
  }
  .focus-plus-btn {
    border: none; background: none; font-size: 13px; color: #A09080;
    cursor: pointer; font-family: inherit; padding: 5px 12px;
    text-decoration: underline; text-decoration-color: #DDD8CE;
    transition: color 0.15s;
  }
  .focus-plus-btn:disabled { opacity: 0.4; pointer-events: none; }
  .focus-plus-btn:active { color: #2A1F14; }

  /* ── Écran de fin ────────────────────────────────────────────────────────── */
  .focus-fin-wrap {
    flex: 1; display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    padding: 40px 32px; text-align: center;
  }
  .focus-fin-logo {
    width: 64px; height: 64px; border-radius: 50%;
    background: #C4623A;
    display: flex; align-items: center; justify-content: center;
    margin-bottom: 36px;
    animation: focus-pop 0.45s cubic-bezier(0.34, 1.56, 0.64, 1);
    flex-shrink: 0;
  }
  .focus-fin-logo-mark {
    color: #fff; font-size: 22px; font-weight: 800;
    letter-spacing: -2.5px; line-height: 1;
    margin-left: -2px;
  }
  .focus-fin-stat {
    font-size: 28px; font-weight: 400; color: #2A1F14;
    line-height: 1.3; letter-spacing: -0.6px;
    margin-bottom: 12px;
  }
  .focus-fin-stat strong { font-weight: 700; }
  .focus-fin-libere {
    font-size: 20px; font-weight: 400; color: #A09080;
    line-height: 1.5; margin-bottom: 52px;
    max-width: 300px;
  }
  .focus-fin-libere strong { color: #2A1F14; font-weight: 600; }
  .focus-fin-btn {
    padding: 15px 60px;
    background: #1C3829; color: #fff;
    border: none; border-radius: 12px;
    font-size: 16px; font-weight: 600; font-family: inherit;
    cursor: pointer; transition: background 0.15s, transform 0.12s;
  }
  .focus-fin-btn:active { background: #152e1f; transform: scale(0.97); }
`
