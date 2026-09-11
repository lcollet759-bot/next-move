import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { haptic } from '../utils/haptic'
import { isTaskInActionQueue } from '../utils/date'
import DossierSheet from '../components/DossierSheet'

// ── Utilitaires ───────────────────────────────────────────────────────────────
function fmtDuree(min) {
  if (!min || min <= 0) return null
  if (min < 60) return `${min} min`
  const h = Math.round((min / 60) * 10) / 10
  return `${h}h`
}

function fmtLibere(doneIds) {
  return fmtDuree(doneIds.length * 45)
}

// ── Écran de fin ──────────────────────────────────────────────────────────────
function EcranFin({ fait, doneIds, navigate, retourPath }) {
  const libere = fmtLibere(doneIds)
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
          onClick={() => navigate(retourPath)}
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

  const brainDumpTaches = location.state?.brainDumpTaches || null
  // Liste explicite transmise par l'appelant (ex. Aujourd'hui) — [] est une liste valide
  const passedTaches = Array.isArray(location.state?.taches) ? location.state.taches : null

  // Quitter le Mode Focus ramène toujours à Aujourd'hui
  const retourPath = '/'

  const [tasks] = useState(() => {
    if (brainDumpTaches) return brainDumpTaches
    if (passedTaches) return passedTaches
    // Fallback sans liste explicite : dossiers actionnables, tâches de la file d'action uniquement
    return dossiersAujourdhui
      .filter(d => d.etat === 'actionnable')
      .flatMap(d =>
        (d.taches || [])
          .filter(t => isTaskInActionQueue(t))
          .map(t => ({ tache: t, dossier: d, dureeMin: null }))
      )
  })

  const [index,     setIndex]     = useState(0)
  const [fait,      setFait]      = useState(0)
  const [doneIds,   setDoneIds]   = useState([])
  // animPhase pilote les transitions CSS inline (pas de keyframes)
  // 'idle' | 'exiting' | 'snap' | 'entering'
  const [animPhase, setAnimPhase] = useState('idle')
  const [bumpKey,   setBumpKey]   = useState(0)
  const [showSheet, setShowSheet] = useState(false)

  const total   = tasks.length
  const current = tasks[index]

  // ── Fin de session ───────────────────────────────────────────────────────
  if (!current) {
    return (
      <EcranFin
        fait={fait}
        doneIds={doneIds}
        navigate={navigate}
        retourPath={retourPath}
      />
    )
  }

  const dureeMin = current.dureeMin ?? null

  // ── Fait ✓ ───────────────────────────────────────────────────────────────
  const handleFait = () => {
    if (animPhase !== 'idle') return
    haptic('success')

    // 1. Marquer la tâche comme faite dans le dossier Supabase
    if (current.dossier.id) {
      toggleTache(current.dossier.id, current.tache.id).catch(console.error)
    }

    // 3. Carte sort vers le haut (transition 300ms)
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
            onClick={() => navigate(retourPath)}
            onTouchEnd={(e) => { e.preventDefault(); navigate(retourPath) }}
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
        </div>
      </div>

      {/* ── Boutons action ─────────────────────────────────────────── */}
      <div className="focus-footer">
        <button
          className="focus-btn-passer"
          onClick={handlePasser}
          onTouchEnd={(e) => { e.preventDefault(); handlePasser() }}
          disabled={animating}
        >
          Passer
        </button>
        <button
          className="focus-btn-fait"
          onClick={handleFait}
          onTouchEnd={(e) => { e.preventDefault(); handleFait() }}
          disabled={animating}
        >
          Fait ✓
        </button>
      </div>

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
