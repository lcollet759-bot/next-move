import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { v4 as uuid } from 'uuid'
import { useApp } from '../context/AppContext'
import { getPlanningForDate, savePlanning } from '../services/db'
import { estimerDureesIA } from '../services/claude'
import {
  estimerDureeFallback,
  genererCreneaux,
  recalculerHoraires,
  formatDuree,
  hhmmToMinutes,
  minutesToHHMM,
} from '../services/planning'

const PLANNING_KEY = (date) => `nm-planning-${date}`

function todayISO() { return new Date().toISOString().split('T')[0] }
function todayLabel() {
  return new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
}

// ── Couleurs Eisenhower ───────────────────────────────────────────────────────
const Q_STYLE = {
  1: { bg: 'var(--red-light, #fef2f2)',    accent: 'var(--red, #c0392b)',      label: 'Urgent · Important' },
  2: { bg: 'var(--green-light)',            accent: 'var(--green)',              label: 'Important' },
  3: { bg: 'var(--amber-light, #fffbeb)',  accent: 'var(--amber, #d97706)',     label: 'Urgent' },
  4: { bg: 'var(--gray-light)',             accent: 'var(--text-muted)',         label: 'À planifier' },
}

// ── Modal : heures disponibles ────────────────────────────────────────────────
function ModalHeures({ onConfirm }) {
  const [custom, setCustom] = useState(false)
  const [val, setVal]       = useState('')

  return (
    <div className="overlay">
      <div className="sheet" onClick={e => e.stopPropagation()}>
        <div style={{ marginBottom: 20 }}>
          <h3 style={{ fontSize: 20, fontWeight: 700, marginBottom: 6 }}>
            Combien d'heures as-tu aujourd'hui ?
          </h3>
          <p style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.5 }}>
            Je vais construire ton planning en conséquence.
          </p>
        </div>

        {!custom ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { h: 2, sub: 'Courte session' },
              { h: 4, sub: 'Demi-journée' },
              { h: 6, sub: 'Journée complète' },
            ].map(({ h, sub }) => (
              <button
                key={h}
                className="heures-option"
                onClick={() => onConfirm(h)}
              >
                <span className="heures-val">{h}h</span>
                <span className="heures-sub">{sub}</span>
              </button>
            ))}
            <button
              className="btn btn-ghost"
              style={{ marginTop: 4, padding: '13px' }}
              onClick={() => setCustom(true)}
            >
              Autre durée…
            </button>
          </div>
        ) : (
          <div>
            <p style={{ fontSize: 14, marginBottom: 8 }}>Durée disponible (heures) :</p>
            <input
              type="number" min="0.5" max="12" step="0.5"
              className="input"
              value={val}
              onChange={e => setVal(e.target.value)}
              placeholder="ex : 3"
              autoFocus
              style={{ marginBottom: 12 }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-ghost btn-sm" style={{ flex: 1 }} onClick={() => setCustom(false)}>
                ← Retour
              </button>
              <button
                className="btn btn-primary"
                style={{ flex: 2 }}
                onClick={() => onConfirm(parseFloat(val) || 4)}
                disabled={!val || parseFloat(val) <= 0}
              >
                Générer le planning
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Bloc tâche ────────────────────────────────────────────────────────────────
function BlocTache({ tp, isFirst, editingId, dureeDraft, onEditStart, onDraftChange, onEditSave, onDemarrer }) {
  const style  = Q_STYLE[tp.quadrant] || Q_STYLE[4]
  const isDone = tp.done
  const editing = editingId === tp.tacheId

  return (
    <div
      className={`bloc-tache${isDone ? ' bloc-done' : ''}${tp.horsPlanning ? ' bloc-hors' : ''}`}
      style={{ background: isDone ? 'var(--gray-light)' : style.bg, borderColor: isDone ? 'var(--border)' : style.accent }}
    >
      {/* En-tête : horaire + durée + badge */}
      <div className="bloc-header">
        <span className="bloc-horaire" style={{ color: isDone ? 'var(--text-muted)' : style.accent }}>
          {tp.heureDebut} – {tp.heureFin}
        </span>

        {/* Durée éditable */}
        {editing ? (
          <input
            type="number"
            className="bloc-duree-input"
            value={dureeDraft}
            min={5}
            max={480}
            onChange={e => onDraftChange(e.target.value)}
            onBlur={() => onEditSave(tp.tacheId, dureeDraft)}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); onEditSave(tp.tacheId, dureeDraft) }
              if (e.key === 'Escape') onEditSave(null)
            }}
            autoFocus
            style={{ color: style.accent }}
          />
        ) : (
          <button
            className="bloc-duree-btn"
            style={{ color: isDone ? 'var(--text-muted)' : style.accent }}
            onClick={() => !isDone && onEditStart(tp.tacheId, tp.dureeMin)}
            title={isDone ? undefined : 'Toucher pour ajuster'}
          >
            {formatDuree(tp.dureeMin)}
            {!isDone && <span style={{ fontSize: 10, marginLeft: 2 }}>✎</span>}
          </button>
        )}

        <span
          className="bloc-badge"
          style={{
            background: isDone ? 'var(--border)' : style.accent,
            color: isDone ? 'var(--text-muted)' : '#fff',
            opacity: tp.horsPlanning ? 0.5 : 1,
          }}
        >
          {isDone ? 'Fait ✓' : tp.horsPlanning ? 'Hors planning' : `Q${tp.quadrant}`}
        </span>
      </div>

      {/* Titre tâche */}
      <p className="bloc-titre" style={{ textDecoration: isDone ? 'line-through' : 'none', color: isDone ? 'var(--text-muted)' : 'var(--text)' }}>
        {tp.titreTache}
      </p>

      {/* Dossier parent */}
      <p className="bloc-dossier">
        {tp.titreDossier}
        {tp.organisme && <span style={{ color: 'var(--border)' }}> · {tp.organisme}</span>}
      </p>

      {/* Bouton Démarrer — uniquement sur le premier bloc non-fait */}
      {isFirst && !isDone && (
        <button className="btn-demarrer" onClick={onDemarrer}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="5 3 19 12 5 21 5 3"/>
          </svg>
          Démarrer
        </button>
      )}
    </div>
  )
}

// ── Page principale ───────────────────────────────────────────────────────────
export default function Planning() {
  const { dossiersAujourdhui, apiKey } = useApp()
  const navigate = useNavigate()

  const [planning,    setPlanning]    = useState(null)
  const [loading,     setLoading]     = useState(true)
  const [generating,  setGenerating]  = useState(false)
  const [showModal,   setShowModal]   = useState(false)
  const [editingId,   setEditingId]   = useState(null)
  const [dureeDraft,  setDureeDraft]  = useState('')
  const prevDoneRef = useRef(null)

  // ── Chargement initial ──────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      const today   = todayISO()
      const cached  = localStorage.getItem(PLANNING_KEY(today))
      if (cached) {
        try { setPlanning(JSON.parse(cached)); setLoading(false); return } catch {}
      }
      try {
        const p = await getPlanningForDate(today)
        if (p) {
          setPlanning(p)
          localStorage.setItem(PLANNING_KEY(today), JSON.stringify(p))
        } else {
          setShowModal(true)
        }
      } catch {
        setShowModal(true)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  // ── Auto-sync des tâches cochées → recalcul ──────────────────────────────
  useEffect(() => {
    if (!planning || loading || generating || showModal) return

    const doneMap = new Map()
    dossiersAujourdhui.forEach(d => d.taches.forEach(t => doneMap.set(t.id, t.done)))

    const doneKey = [...doneMap.entries()].map(([k, v]) => `${k}:${v ? '1' : '0'}`).join(',')
    if (prevDoneRef.current === doneKey) return
    prevDoneRef.current = doneKey

    const anyChanged = planning.tachesPlanifiees.some(
      tp => doneMap.has(tp.tacheId) && doneMap.get(tp.tacheId) !== tp.done
    )
    if (!anyChanged) return

    // Mettre à jour les états done
    const synced = planning.tachesPlanifiees.map(tp => ({
      ...tp, done: doneMap.get(tp.tacheId) ?? tp.done,
    }))

    // Recalculer les créneaux des tâches restantes
    const active  = synced.filter(t => !t.done)
    const done    = synced.filter(t =>  t.done)
    const reschedActive = genererCreneaux(active, planning.heuresDisponibles)
    const newPlanning   = { ...planning, tachesPlanifiees: [...reschedActive, ...done] }

    setPlanning(newPlanning)
    const today = todayISO()
    localStorage.setItem(PLANNING_KEY(today), JSON.stringify(newPlanning))
    savePlanning(newPlanning).catch(() => {})
  }, [dossiersAujourdhui]) // eslint-disable-line

  // ── Génération du planning ───────────────────────────────────────────────
  async function generer(heuresTotales) {
    setShowModal(false)
    setGenerating(true)
    try {
      const taches = dossiersAujourdhui.flatMap(dossier =>
        dossier.taches
          .filter(t => !t.done)
          .map(t => ({
            tacheId:       t.id,
            dossierId:     dossier.id,
            titreTache:    t.titre,
            titreDossier:  dossier.titre,
            organisme:     dossier.organisme ?? null,
            quadrant:      dossier.quadrant,
            done:          false,
          }))
      )

      if (taches.length === 0) { setGenerating(false); return }

      // Estimation des durées
      const durees = {}
      if (apiKey) {
        try {
          const res = await estimerDureesIA(
            taches.map(t => ({ id: t.tacheId, titre: t.titreTache, dossierTitre: t.titreDossier, organisme: t.organisme }))
          )
          res.forEach(d => { if (d.tacheId && d.dureeMin > 0) durees[d.tacheId] = d.dureeMin })
        } catch { /* fallback silencieux */ }
      }
      taches.forEach(t => { if (!durees[t.tacheId]) durees[t.tacheId] = estimerDureeFallback(t.titreTache) })

      const tachesAvecDurees   = taches.map(t => ({ ...t, dureeMin: durees[t.tacheId] }))
      const tachesPlanifiees   = genererCreneaux(tachesAvecDurees, heuresTotales)
      const today              = todayISO()

      const newPlanning = {
        id:               planning?.id || uuid(),
        date:             today,
        heuresDisponibles: heuresTotales,
        tachesPlanifiees,
        createdAt:        planning?.createdAt || new Date().toISOString(),
      }

      await savePlanning(newPlanning)
      localStorage.setItem(PLANNING_KEY(today), JSON.stringify(newPlanning))
      setPlanning(newPlanning)
    } catch (e) {
      console.error('[Planning] Erreur génération:', e)
    } finally {
      setGenerating(false)
    }
  }

  // ── Édition inline de durée ──────────────────────────────────────────────
  const handleEditStart = (tacheId, dureeMin) => {
    setEditingId(tacheId)
    setDureeDraft(String(dureeMin))
  }

  const handleEditSave = async (tacheId, draft) => {
    setEditingId(null)
    if (!tacheId || !planning) return
    const duree = parseInt(draft)
    if (!duree || duree < 5) return

    const updated  = planning.tachesPlanifiees.map(t =>
      t.tacheId === tacheId ? { ...t, dureeMin: duree } : t
    )
    const recalc   = recalculerHoraires(updated)
    const newPlan  = { ...planning, tachesPlanifiees: recalc }

    setPlanning(newPlan)
    const today = todayISO()
    localStorage.setItem(PLANNING_KEY(today), JSON.stringify(newPlan))
    savePlanning(newPlan).catch(() => {})
  }

  const handleDemarrer = () => {
    navigate('/focus', { state: { planningDate: todayISO() } })
  }

  // ── Affichage ────────────────────────────────────────────────────────────

  const today = todayISO()

  if (loading) {
    return (
      <div className="page">
        <div className="page-header">
          <p className="skeleton-text" style={{ width: 100, height: 10, marginBottom: 8 }} />
          <p className="skeleton-text" style={{ width: 200, height: 26 }} />
        </div>
        {[1, 2, 3].map(i => (
          <div key={i} className="section">
            <div className="skeleton-text" style={{ height: 90, borderRadius: 'var(--radius)' }} />
          </div>
        ))}
        <style>{skeletonCSS}</style>
      </div>
    )
  }

  // Tâches actives (non faites) pour déterminer la 1ère
  const tachesActives = planning?.tachesPlanifiees.filter(t => !t.done) ?? []
  const premiereId    = tachesActives[0]?.tacheId

  return (
    <div className="page">
      {/* Header */}
      <div className="page-header plan-header">
        <div>
          <p className="aj-date">{todayLabel()}</p>
          <h1 className="plan-title">Planning du jour</h1>
          {planning && (
            <p className="plan-sub">{planning.heuresDisponibles}h disponibles · {tachesActives.length} tâche{tachesActives.length !== 1 ? 's' : ''} restante{tachesActives.length !== 1 ? 's' : ''}</p>
          )}
        </div>
        <button
          className="plan-refresh-btn"
          onClick={() => planning ? generer(planning.heuresDisponibles) : setShowModal(true)}
          disabled={generating}
          title="Recalculer le planning"
        >
          <svg
            width="18" height="18" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
            style={{ animation: generating ? 'spin 1s linear infinite' : 'none' }}
          >
            <polyline points="23 4 23 10 17 10"/>
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
          </svg>
        </button>
      </div>

      {/* État : génération en cours */}
      {generating && (
        <div className="section">
          <div className="morning-card">
            <div className="spinner" style={{ width: 14, height: 14, borderWidth: 2, flexShrink: 0 }} />
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              {apiKey ? "L'IA estime les durées…" : 'Génération du planning…'}
            </span>
          </div>
        </div>
      )}

      {/* Pas de tâches */}
      {!generating && planning && tachesActives.length === 0 && (
        <div className="section">
          <div className="empty-state">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--border)" strokeWidth="1.5" strokeLinecap="round" style={{ marginBottom: 14 }}>
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
            <p className="empty-title">Toutes les tâches sont faites !</p>
            <p className="empty-text">Beau travail pour aujourd'hui.</p>
          </div>
        </div>
      )}

      {/* Pas encore de planning */}
      {!generating && !planning && !showModal && (
        <div className="section">
          <div className="morning-card" style={{ flexDirection: 'column', gap: 12, alignItems: 'flex-start' }}>
            <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>Aucun planning pour aujourd'hui.</p>
            <button className="btn btn-primary btn-sm" onClick={() => setShowModal(true)}>
              Créer mon planning
            </button>
          </div>
        </div>
      )}

      {/* Timeline des blocs */}
      {!generating && planning && planning.tachesPlanifiees.length > 0 && (
        <div className="section plan-timeline">
          {planning.tachesPlanifiees.map(tp => (
            <BlocTache
              key={tp.tacheId}
              tp={tp}
              isFirst={tp.tacheId === premiereId}
              editingId={editingId}
              dureeDraft={dureeDraft}
              onEditStart={handleEditStart}
              onDraftChange={setDureeDraft}
              onEditSave={handleEditSave}
              onDemarrer={handleDemarrer}
            />
          ))}
        </div>
      )}

      {/* Modal heures */}
      {showModal && <ModalHeures onConfirm={generer} />}

      <style>{`
        /* Header */
        .plan-header {
          display: flex; align-items: flex-start; justify-content: space-between;
          padding-bottom: 16px;
        }
        .plan-title { font-size: 28px; font-weight: 700; color: var(--text); letter-spacing: -0.8px; }
        .plan-sub   { font-size: 13px; color: var(--text-muted); margin-top: 4px; }
        .plan-refresh-btn {
          margin-top: 8px; flex-shrink: 0;
          border: none; background: var(--gray-light); color: var(--text-muted);
          width: 38px; height: 38px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; transition: background 0.15s, color 0.15s;
        }
        .plan-refresh-btn:hover:not(:disabled) { background: var(--border); color: var(--text); }
        .plan-refresh-btn:disabled { opacity: 0.4; cursor: default; }
        @keyframes spin { to { transform: rotate(360deg); } }

        /* Modal heures */
        .heures-option {
          width: 100%; display: flex; align-items: center; justify-content: space-between;
          padding: 14px 16px; border: 1.5px solid var(--border); border-radius: var(--radius-sm);
          background: transparent; cursor: pointer; font-family: inherit;
          transition: border-color 0.15s, background 0.15s;
        }
        .heures-option:hover { border-color: var(--green); background: var(--green-light); }
        .heures-val  { font-size: 18px; font-weight: 700; color: var(--green); }
        .heures-sub  { font-size: 14px; color: var(--text-muted); }

        /* Timeline */
        .plan-timeline { display: flex; flex-direction: column; gap: 10px; }

        /* Bloc tâche */
        .bloc-tache {
          border: 1.5px solid; border-radius: var(--radius);
          padding: 14px 14px 12px;
          transition: opacity 0.2s;
        }
        .bloc-done { opacity: 0.55; }
        .bloc-hors { opacity: 0.7; }
        .bloc-header {
          display: flex; align-items: center; gap: 6px;
          margin-bottom: 8px; flex-wrap: wrap;
        }
        .bloc-horaire {
          font-size: 13px; font-weight: 700; letter-spacing: 0.03em; flex-shrink: 0;
        }
        .bloc-duree-btn {
          font-size: 12px; font-weight: 500; border: none; background: none;
          cursor: pointer; padding: 2px 6px; border-radius: 4px; font-family: inherit;
          transition: background 0.15s;
        }
        .bloc-duree-btn:hover { background: rgba(0,0,0,0.06); }
        .bloc-duree-input {
          width: 70px; font-size: 12px; border: 1px solid var(--border);
          border-radius: 4px; padding: 2px 6px; font-family: inherit;
          outline: none;
        }
        .bloc-badge {
          margin-left: auto; flex-shrink: 0;
          font-size: 10px; font-weight: 700; padding: 3px 8px;
          border-radius: 20px; text-transform: uppercase; letter-spacing: 0.05em;
        }
        .bloc-titre {
          font-size: 15px; font-weight: 600; color: var(--text);
          line-height: 1.3; margin-bottom: 4px;
        }
        .bloc-dossier {
          font-size: 12px; color: var(--text-muted); line-height: 1.3; margin-bottom: 10px;
        }
        .btn-demarrer {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 8px 14px;
          background: var(--green); color: #fff;
          border: none; border-radius: 20px;
          font-size: 13px; font-weight: 600;
          cursor: pointer; font-family: inherit;
          transition: opacity 0.15s;
        }
        .btn-demarrer:active { opacity: 0.8; }

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
  .skeleton-text {
    background: linear-gradient(90deg, var(--border) 25%, #f0f0ee 50%, var(--border) 75%);
    background-size: 200% 100%;
    animation: shimmer 1.4s infinite;
    border-radius: var(--radius-sm);
    display: block;
  }
`
