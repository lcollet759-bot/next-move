import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { v4 as uuid } from 'uuid'
import { useApp } from '../context/AppContext'
import DossierSheet from '../components/DossierSheet'
import {
  getPlanningForDate, savePlanning,
  getRoutines, saveRoutine, deleteRoutine,
} from '../services/db'
import { planifierAvecDurees } from '../services/claude'
import {
  estimerDureeFallback,
  genererCreneaux,
  recalculerHoraires,
  formatDuree,
  heureDeDepart,
  minutesToHHMM,
} from '../services/planning'

// ── Constantes ────────────────────────────────────────────────────────────────
const PLANNING_KEY = (d) => `nm-planning-${d}`
const ROUTINES_KEY = 'nm-routines-cache'
const JOURS        = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi']

function todayISO()   { return new Date().toISOString().split('T')[0] }
function todayLabel() { return new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }) }

const Q_STYLE = {
  1: { bg: 'var(--red-light, #fef2f2)',   accent: 'var(--red, #c0392b)',     label: 'Urgent · Important' },
  2: { bg: 'var(--green-light)',           accent: 'var(--green)',             label: 'Important' },
  3: { bg: 'var(--amber-light, #fffbeb)', accent: 'var(--amber, #d97706)',    label: 'Urgent' },
  4: { bg: 'var(--gray-light)',            accent: 'var(--text-muted)',        label: 'À planifier' },
}
const ROUTINE_STYLE = { bg: '#eef2ff', accent: '#6366f1', label: 'Routine' }

// ── Helpers ───────────────────────────────────────────────────────────────────
function routinesDuJour(routines) {
  const now  = new Date()
  const dow  = now.getDay()   // 0=dim
  const dom  = now.getDate()  // 1-31
  return routines.filter(r => {
    if (r.recurrence === 'daily')   return true
    if (r.recurrence === 'weekly')  return r.jourSemaine === dow
    if (r.recurrence === 'monthly') return r.jourMois    === dom
    return false
  })
}

// Enrichit les taches proposées par l'IA avec les données complètes
function enrichProposal(proposalTaches, tachesBase) {
  const map = new Map(tachesBase.map(t => [t.tacheId, t]))
  return proposalTaches.map(pt => {
    const base = map.get(pt.tacheId)
    if (!base) return null  // tacheId halluciné → ignoré
    return { ...base, dureeMin: pt.dureeMin || base.dureeMin || 45,
              heureDebut: pt.heureDebut || '09:00', heureFin: pt.heureFin || '09:00',
              done: false, horsPlanning: false }
  }).filter(Boolean)
}

// Construit la liste des tâches prête pour l'IA (dossiers + routines)
function buildTachesBase(dossiersAujourdhui, routinesSelected) {
  const tachesActives = dossiersAujourdhui.flatMap(dossier =>
    dossier.taches.filter(t => !t.done).map(t => ({
      tacheId:      t.id,
      dossierId:    dossier.id,
      titreTache:   t.titre,
      titreDossier: dossier.titre,
      organisme:    dossier.organisme ?? null,
      quadrant:     dossier.quadrant,
      echeance:     dossier.echeance ?? null,
      dureeMin:     estimerDureeFallback(t.titre),
      done:         false,
    }))
  )
  const tachesRoutines = routinesSelected.map(r => ({
    tacheId:      `routine-${r.id}`,
    routineId:    r.id,
    isRoutine:    true,
    dossierId:    null,
    titreTache:   r.titre,
    titreDossier: 'Routine',
    organisme:    null,
    quadrant:     null,
    echeance:     null,
    dureeMin:     r.dureeMin,
    done:         false,
  }))
  return [...tachesActives, ...tachesRoutines]
}

// ── Modal : ajouter une routine ───────────────────────────────────────────────
function ModalAddRoutine({ onSave, onClose }) {
  const [titre,       setTitre]       = useState('')
  const [duree,       setDuree]       = useState('30')
  const [recurrence,  setRecurrence]  = useState('daily')
  const [jourSemaine, setJourSemaine] = useState(1)
  const [jourMois,    setJourMois]    = useState(1)

  const handleSave = () => {
    if (!titre.trim()) return
    onSave({
      id:          uuid(),
      titre:       titre.trim(),
      dureeMin:    parseInt(duree) || 30,
      recurrence,
      jourSemaine: recurrence === 'weekly'  ? jourSemaine : null,
      jourMois:    recurrence === 'monthly' ? jourMois    : null,
      actif:       true,
      createdAt:   new Date().toISOString(),
    })
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={e => e.stopPropagation()}>
        <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Nouvelle routine</h3>

        <label className="label">Titre</label>
        <input className="input" placeholder="ex : Lecture emails" value={titre}
          onChange={e => setTitre(e.target.value)} autoFocus style={{ marginBottom: 12 }} />

        <label className="label">Durée (minutes)</label>
        <input className="input" type="number" min="5" max="480" value={duree}
          onChange={e => setDuree(e.target.value)} style={{ marginBottom: 12 }} />

        <label className="label">Récurrence</label>
        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
          {[['daily', 'Quotidienne'], ['weekly', 'Hebdomadaire'], ['monthly', 'Mensuelle']].map(([k, l]) => (
            <button key={k}
              className={`btn btn-sm ${recurrence === k ? 'btn-primary' : 'btn-ghost'}`}
              style={{ flex: 1, padding: '8px 4px' }}
              onClick={() => setRecurrence(k)}>{l}</button>
          ))}
        </div>

        {recurrence === 'weekly' && (
          <>
            <label className="label">Jour de la semaine</label>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 12 }}>
              {JOURS.map((j, i) => (
                <button key={i}
                  className={`btn btn-sm ${jourSemaine === i ? 'btn-primary' : 'btn-ghost'}`}
                  style={{ padding: '6px 10px', fontSize: 12 }}
                  onClick={() => setJourSemaine(i)}>
                  {j.slice(0, 3)}
                </button>
              ))}
            </div>
          </>
        )}

        {recurrence === 'monthly' && (
          <>
            <label className="label">Jour du mois</label>
            <input className="input" type="number" min="1" max="31" value={jourMois}
              onChange={e => setJourMois(parseInt(e.target.value) || 1)} style={{ marginBottom: 12 }} />
          </>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button className="btn btn-ghost btn-sm" style={{ flex: 1 }} onClick={onClose}>Annuler</button>
          <button className="btn btn-primary" style={{ flex: 2 }} onClick={handleSave} disabled={!titre.trim()}>
            Ajouter la routine
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Bloc tâche ────────────────────────────────────────────────────────────────
function BlocTache({ tp, isFirst, editingId, dureeDraft, onEditStart, onDraftChange, onEditSave, onDemarrer, onCheck, onOpenSheet }) {
  const style    = tp.isRoutine ? ROUTINE_STYLE : (Q_STYLE[tp.quadrant] || Q_STYLE[4])
  const isDone   = tp.done
  const canSheet = !!onOpenSheet && !tp.isRoutine && !!tp.dossierId

  const handleBlocClick = () => {
    if (canSheet) onOpenSheet(tp.dossierId)
  }

  return (
    <div
      className={`bloc-tache${isDone ? ' bloc-done' : ''}${tp.horsPlanning ? ' bloc-hors' : ''}${canSheet ? ' bloc-tappable' : ''}`}
      style={{ background: isDone ? 'var(--gray-light)' : style.bg, borderColor: isDone ? 'var(--border)' : style.accent }}
      onClick={handleBlocClick}
    >
      <div className="bloc-header">
        {/* Case à cocher */}
        {onCheck && (
          <button
            className={`bloc-check${isDone ? ' bloc-check-on' : ''}`}
            style={{ borderColor: isDone ? 'var(--green)' : style.accent }}
            onClick={e => { e.stopPropagation(); onCheck(tp.tacheId, tp.dossierId, tp.isRoutine) }}
            aria-label={isDone ? 'Marquer comme non fait' : 'Marquer comme fait'}
          >
            {isDone && (
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            )}
          </button>
        )}

        <span className="bloc-horaire" style={{ color: isDone ? 'var(--text-muted)' : style.accent }}>
          {tp.heureDebut} – {tp.heureFin}
        </span>

        {editingId === tp.tacheId ? (
          <input type="number" className="bloc-duree-input" value={dureeDraft} min={5} max={480}
            onChange={e => onDraftChange(e.target.value)}
            onBlur={() => onEditSave(tp.tacheId, dureeDraft)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onEditSave(tp.tacheId, dureeDraft) } if (e.key === 'Escape') onEditSave(null) }}
            onClick={e => e.stopPropagation()}
            autoFocus style={{ color: style.accent }} />
        ) : (
          <button className="bloc-duree-btn" style={{ color: isDone ? 'var(--text-muted)' : style.accent }}
            onClick={e => { e.stopPropagation(); !isDone && onEditStart(tp.tacheId, tp.dureeMin) }}
            title={isDone ? undefined : 'Toucher pour ajuster'}>
            {formatDuree(tp.dureeMin)}{!isDone && <span style={{ fontSize: 10, marginLeft: 2 }}>✎</span>}
          </button>
        )}

        <span className="bloc-badge" style={{
          background: isDone ? 'var(--border)' : style.accent, color: isDone ? 'var(--text-muted)' : '#fff',
          opacity: tp.horsPlanning ? 0.5 : 1 }}>
          {isDone ? 'Fait ✓' : tp.horsPlanning ? 'Hors planning' : (tp.isRoutine ? 'Routine' : `Q${tp.quadrant}`)}
        </span>
      </div>

      <p className="bloc-titre" style={{ textDecoration: isDone ? 'line-through' : 'none', color: isDone ? 'var(--text-muted)' : 'var(--text)' }}>
        {tp.titreTache}
      </p>
      <p className="bloc-dossier">
        {tp.titreDossier}{tp.organisme && <span style={{ color: 'var(--border)' }}> · {tp.organisme}</span>}
        {canSheet && !isDone && <span style={{ color: 'var(--border)', fontSize: 11 }}> · voir dossier →</span>}
      </p>

      {isFirst && !isDone && (
        <button className="btn-demarrer" onClick={e => { e.stopPropagation(); onDemarrer() }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          Démarrer
        </button>
      )}
    </div>
  )
}

// ── Page principale ───────────────────────────────────────────────────────────
export default function Planning({ forceStep }) {
  const { dossiersAujourdhui, apiKey, toggleTache } = useApp()
  const navigate = useNavigate()
  const location = useLocation()

  // ── Données planning ────────────────────────────────────────────────────
  const [planning,     setPlanning]     = useState(null)
  // Si forceStep fourni, on sait déjà qu'on affiche un modal — pas besoin du loader
  const [loading,      setLoading]      = useState(!forceStep)
  const [generating,   setGenerating]   = useState(false)
  const [genError,     setGenError]     = useState(null)

  // ── Flux multi-étapes : null | 'heures' | 'routines' | 'validation' ────
  const [step,          setStep]         = useState(null)
  const [heuresPick,    setHeuresPick]   = useState(4)
  const [selectedRIds,  setSelectedRIds] = useState([])

  // ── Proposition IA ──────────────────────────────────────────────────────
  const [proposal,      setProposal]     = useState(null)   // { raisonnement, taches[] }
  const [propDraft,     setPropDraft]    = useState([])     // taches enrichies, éditables
  const [planCtx,       setPlanCtx]      = useState(null)   // contexte pour recalculer

  // ── Routines ────────────────────────────────────────────────────────────
  const [routines,      setRoutines]     = useState([])
  const [showAddR,      setShowAddR]     = useState(false)

  // ── Ajout rapide inline (écran routines) ─────────────────────────────────
  const [newRoutineTitre, setNewRoutineTitre] = useState('')
  const [newRoutineDuree, setNewRoutineDuree] = useState('30')
  const [newRoutineRec,   setNewRoutineRec]   = useState('daily')

  // ── Panneau dossier contextuel ─────────────────────────────────────────
  const [sheetDossierId, setSheetDossierId] = useState(null)

  // ── Édition inline durée ───────────────────────────────────────────────
  const [editingId,     setEditingId]    = useState(null)
  const [dureeDraft,    setDureeDraft]   = useState('')

  const prevDoneRef = useRef(null)

  // ── Chargement initial ──────────────────────────────────────────────────
  useEffect(() => {
    // Routines depuis cache (sync, toujours)
    try {
      const cached = localStorage.getItem(ROUTINES_KEY)
      if (cached) setRoutines(JSON.parse(cached))
    } catch {}

    const h = location.state?.heures
    if (forceStep === 'heures' || h) {
      // Entrée directe depuis Aujourd'hui avec heures déjà choisies
      getRoutines()
        .then(fresh => {
          const hrs = h || 4
          setRoutines(fresh)
          localStorage.setItem(ROUTINES_KEY, JSON.stringify(fresh))
          setHeuresPick(hrs)
          const todayR = routinesDuJour(fresh)
          if (todayR.length > 0) {
            setSelectedRIds(todayR.map(r => r.id))
            setStep('routines')
          } else {
            lancerGeneration(hrs, [])
          }
        })
        .catch(() => {
          const hrs = h || 4
          setHeuresPick(hrs)
          lancerGeneration(hrs, [])
        })
      return
    }

    // Chargement normal (accès via route /planning)
    async function load() {
      let freshRoutines = []
      try {
        freshRoutines = await getRoutines()
        setRoutines(freshRoutines)
        localStorage.setItem(ROUTINES_KEY, JSON.stringify(freshRoutines))
      } catch {}

      const today  = todayISO()
      const cached = localStorage.getItem(PLANNING_KEY(today))
      // Si navigué depuis l'app (location.key !== 'default'), ignorer le cache
      // et forcer l'affichage du choix des heures, même si un planning existe déjà.
      // Un chargement direct d'URL (refresh) conserve le planning en cache.
      if (cached && location.key === 'default') {
        try { setPlanning(JSON.parse(cached)); setLoading(false); return } catch {}
      }
      try {
        const p = await getPlanningForDate(today)
        if (p) {
          setPlanning(p)
          localStorage.setItem(PLANNING_KEY(today), JSON.stringify(p))
        } else {
          const hrs = location.state?.heures
          if (hrs) {
            setHeuresPick(hrs)
            const todayR = routinesDuJour(freshRoutines)
            if (todayR.length > 0) {
              setSelectedRIds(todayR.map(r => r.id))
              setStep('routines')
            } else {
              lancerGeneration(hrs, [])
            }
          } else {
            setStep('heures')
          }
        }
      } catch {
        const hrs = location.state?.heures
        if (hrs) {
          setHeuresPick(hrs)
          lancerGeneration(hrs, [])
        } else {
          setStep('heures')
        }
      }
      finally { setLoading(false) }
    }
    load()
  }, []) // eslint-disable-line

  // ── Auto-sync tâches cochées ─────────────────────────────────────────────
  useEffect(() => {
    if (!planning || loading || generating || step) return
    const doneMap = new Map()
    dossiersAujourdhui.forEach(d => d.taches.forEach(t => doneMap.set(t.id, t.done)))
    const doneKey = [...doneMap.entries()].map(([k, v]) => `${k}:${v ? 1 : 0}`).join(',')
    if (prevDoneRef.current === doneKey) return
    prevDoneRef.current = doneKey

    const anyChanged = planning.tachesPlanifiees.some(
      tp => !tp.isRoutine && doneMap.has(tp.tacheId) && doneMap.get(tp.tacheId) !== tp.done
    )
    if (!anyChanged) return

    const synced = planning.tachesPlanifiees.map(tp =>
      !tp.isRoutine && doneMap.has(tp.tacheId) ? { ...tp, done: doneMap.get(tp.tacheId) } : tp
    )
    const active  = synced.filter(t => !t.done)
    const done    = synced.filter(t =>  t.done)
    const resched = genererCreneaux(active, planning.heuresDisponibles)
    const np      = { ...planning, tachesPlanifiees: [...resched, ...done] }
    setPlanning(np)
    const today = todayISO()
    localStorage.setItem(PLANNING_KEY(today), JSON.stringify(np))
    savePlanning(np).catch(() => {})
  }, [dossiersAujourdhui]) // eslint-disable-line

  // ── Étape 1 : l'utilisateur a choisi ses heures ─────────────────────────
  const handleHeures = (h) => {
    setHeuresPick(h)
    const todayRoutines = routinesDuJour(routines)
    if (todayRoutines.length > 0) {
      setSelectedRIds(todayRoutines.map(r => r.id)) // toutes cochées par défaut
      setStep('routines')
    } else {
      setStep(null)
      lancerGeneration(h, [])
    }
  }

  // ── Étape 2 : l'utilisateur a choisi ses routines ───────────────────────
  const handleRoutinesConfirm = (selectedIds) => {
    const selected = routines.filter(r => selectedIds.includes(r.id))
    setStep(null)
    lancerGeneration(heuresPick, selected)
  }

  // ── Génération IA + validation ───────────────────────────────────────────
  const lancerGeneration = async (heuresTotales, routinesSelected) => {
    setGenerating(true)
    setGenError(null)

    const startMin   = heureDeDepart()
    const startTime  = minutesToHHMM(startMin)
    const tachesBase = buildTachesBase(dossiersAujourdhui, routinesSelected)

    // Un seul appel IA : estime les durées manquantes ET construit le planning
    if (apiKey && tachesBase.length > 0) {
      try {
        const ctx = { tachesActives: tachesBase, routinesSelectionnees: routinesSelected, heuresTotales, heureDepart: startTime }
        setPlanCtx(ctx)
        const result  = await planifierAvecDurees(ctx)
        const enriched = enrichProposal(result.taches, tachesBase)
        setProposal(result)
        setPropDraft(enriched)
        setStep('validation')
        setGenerating(false)
        return
      } catch (e) {
        console.warn('[Planning] IA indisponible, fallback:', e.message)
      }
    }

    // Fallback : tri Eisenhower + genererCreneaux
    const tachesPlanifiees = genererCreneaux(tachesBase, heuresTotales)
    await sauvegarderPlanning(heuresTotales, tachesPlanifiees)
    setGenerating(false)
  }

  // ── Recalculer (depuis l'écran de validation) ────────────────────────────
  const handleRecalculer = async () => {
    if (!planCtx) return
    setGenerating(true)
    setGenError(null)
    try {
      const result   = await planifierAvecDurees(planCtx)
      const enriched = enrichProposal(result.taches, buildTachesBase(dossiersAujourdhui, planCtx.routinesSelectionnees))
      setProposal(result)
      setPropDraft(enriched)
    } catch (e) {
      setGenError(e.message)
    } finally {
      setGenerating(false)
    }
  }

  // ── Confirmer la proposition ─────────────────────────────────────────────
  const handleConfirmer = async () => {
    await sauvegarderPlanning(heuresPick, propDraft)
    setStep(null)
    setProposal(null)
    setPropDraft([])
  }

  // ── Sauvegarde ───────────────────────────────────────────────────────────
  const sauvegarderPlanning = async (heuresTotales, tachesPlanifiees) => {
    const today = todayISO()
    const np = {
      id:               planning?.id || uuid(),
      date:             today,
      heuresDisponibles: heuresTotales,
      tachesPlanifiees,
      createdAt:        planning?.createdAt || new Date().toISOString(),
    }
    await savePlanning(np)
    localStorage.setItem(PLANNING_KEY(today), JSON.stringify(np))
    setPlanning(np)
    setHeuresPick(heuresTotales)
  }

  // ── Édition inline durée (timeline principale) ──────────────────────────
  const handleEditStart = (tacheId, duree) => { setEditingId(tacheId); setDureeDraft(String(duree)) }
  const handleEditSave  = async (tacheId, draft) => {
    setEditingId(null)
    if (!tacheId || !planning) return
    const d = parseInt(draft)
    if (!d || d < 5) return
    const updated = planning.tachesPlanifiees.map(t => t.tacheId === tacheId ? { ...t, dureeMin: d } : t)
    const recalc  = recalculerHoraires(updated)
    const np      = { ...planning, tachesPlanifiees: recalc }
    setPlanning(np)
    const today = todayISO()
    localStorage.setItem(PLANNING_KEY(today), JSON.stringify(np))
    savePlanning(np).catch(() => {})
  }

  // ── Édition inline durée (validation) ────────────────────────────────────
  const handlePropEditSave = (tacheId, draft) => {
    setEditingId(null)
    if (!tacheId) return
    const d = parseInt(draft)
    if (!d || d < 5) return
    const updated = propDraft.map(t => t.tacheId === tacheId ? { ...t, dureeMin: d } : t)
    setPropDraft(recalculerHoraires(updated))
  }

  // ── Cocher une tâche directement depuis le planning ─────────────────────
  const handleCheckTache = async (tacheId, dossierId, isRoutine) => {
    const today = todayISO()
    if (isRoutine) {
      // Les routines n'ont pas de dossier AppContext — on bascule done directement
      const updated = planning.tachesPlanifiees.map(t =>
        t.tacheId === tacheId ? { ...t, done: !t.done } : t
      )
      const active  = updated.filter(t => !t.done)
      const done    = updated.filter(t =>  t.done)
      const resched = genererCreneaux(active, planning.heuresDisponibles)
      const np      = { ...planning, tachesPlanifiees: [...resched, ...done] }
      setPlanning(np)
      localStorage.setItem(PLANNING_KEY(today), JSON.stringify(np))
      savePlanning(np).catch(() => {})
    } else {
      // Déléguer à AppContext → l'auto-sync useEffect s'occupe de la mise à jour planning
      await toggleTache(dossierId, tacheId)
    }
  }

  // ── Routines CRUD ───────────────────────────────────────────────────────
  const handleAddRoutine = async (routine) => {
    setShowAddR(false)
    const newList = [...routines, routine]
    setRoutines(newList)
    localStorage.setItem(ROUTINES_KEY, JSON.stringify(newList))
    await saveRoutine(routine)
  }
  const handleDeleteRoutine = async (id) => {
    const newList = routines.filter(r => r.id !== id)
    setRoutines(newList)
    localStorage.setItem(ROUTINES_KEY, JSON.stringify(newList))
    await deleteRoutine(id)
  }

  const handleAddRoutineInline = async () => {
    if (!newRoutineTitre.trim()) return
    const routine = {
      id:          uuid(),
      titre:       newRoutineTitre.trim(),
      dureeMin:    parseInt(newRoutineDuree) || 30,
      recurrence:  newRoutineRec,
      jourSemaine: newRoutineRec === 'weekly'  ? new Date().getDay() : null,
      jourMois:    newRoutineRec === 'monthly' ? new Date().getDate() : null,
      actif:       true,
      createdAt:   new Date().toISOString(),
    }
    await handleAddRoutine(routine)
    setNewRoutineTitre('')
    setNewRoutineDuree('30')
    setNewRoutineRec('daily')
    setSelectedRIds(prev => [...prev, routine.id])
  }

  // ── Rendu ────────────────────────────────────────────────────────────────
  const today       = todayISO()
  const tachesActiv = planning?.tachesPlanifiees.filter(t => !t.done) ?? []
  const premiereId  = tachesActiv[0]?.tacheId

  const routineGroups = {
    daily:   routines.filter(r => r.recurrence === 'daily'),
    weekly:  routines.filter(r => r.recurrence === 'weekly'),
    monthly: routines.filter(r => r.recurrence === 'monthly'),
  }

  if (loading) return (
    <div className="page">
      <div className="page-header">
        <p className="skeleton-text" style={{ width: 100, height: 10, marginBottom: 8 }} />
        <p className="skeleton-text" style={{ width: 200, height: 26 }} />
      </div>
      {[1, 2, 3].map(i => <div key={i} className="section"><div className="skeleton-text" style={{ height: 90, borderRadius: 'var(--radius)' }} /></div>)}
      <style>{skeletonCSS}</style>
    </div>
  )

  const showBack = location.key !== 'default' || document.referrer.includes('aujourdhui')

  return (
    <div className="page">
      {/* Bouton retour — visible si navigué depuis une autre page */}
      {showBack && (
        <button className="plan-back-btn" onClick={() => navigate(-1)}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
          Retour
        </button>
      )}
      {/* Header */}
      <div className="page-header plan-header">
        <div>
          <p className="aj-date">{todayLabel()}</p>
          <h1 className="plan-title">Planning du jour</h1>
          {planning && step !== 'validation' && (
            <p className="plan-sub">{planning.heuresDisponibles}h · {tachesActiv.length} tâche{tachesActiv.length !== 1 ? 's' : ''} restante{tachesActiv.length !== 1 ? 's' : ''}</p>
          )}
        </div>
        <button className="plan-refresh-btn"
          onClick={() => planning ? lancerGeneration(planning.heuresDisponibles, []) : setStep('heures')}
          disabled={generating || step === 'validation'} title="Recalculer le planning">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
            style={{ animation: generating ? 'spin 1s linear infinite' : 'none' }}>
            <polyline points="23 4 23 10 17 10"/>
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
          </svg>
        </button>
      </div>

      {/* Spinner génération */}
      {generating && (
        <div className="section">
          <div className="morning-card">
            <div className="spinner" style={{ width: 14, height: 14, borderWidth: 2, flexShrink: 0 }} />
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              {apiKey ? "L'IA construit ton planning optimal…" : 'Génération du planning…'}
            </span>
          </div>
        </div>
      )}

      {/* Erreur génération */}
      {genError && (
        <div className="section">
          <div className="morning-card" style={{ borderColor: 'var(--red)', background: 'var(--red-light, #fef2f2)' }}>
            <p style={{ fontSize: 13, color: 'var(--red)' }}>{genError}</p>
          </div>
        </div>
      )}

      {/* État vide */}
      {!generating && !planning && step === null && (
        <div className="section">
          <div className="morning-card" style={{ flexDirection: 'column', gap: 12, alignItems: 'flex-start' }}>
            <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>Aucun planning pour aujourd'hui.</p>
            <button className="btn btn-primary btn-sm" onClick={() => setStep('heures')}>Créer mon planning</button>
          </div>
        </div>
      )}

      {/* Timeline principale */}
      {!generating && planning && step !== 'validation' && (
        <>
          {tachesActiv.length === 0 ? (
            <div className="section">
              <div className="empty-state">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--border)" strokeWidth="1.5" strokeLinecap="round" style={{ marginBottom: 14 }}>
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
                </svg>
                <p className="empty-title">Toutes les tâches sont faites !</p>
                <p className="empty-text">Beau travail pour aujourd'hui.</p>
              </div>
            </div>
          ) : (
            <div className="section plan-timeline">
              {planning.tachesPlanifiees.map(tp => (
                <BlocTache key={tp.tacheId} tp={tp} isFirst={tp.tacheId === premiereId}
                  editingId={editingId} dureeDraft={dureeDraft}
                  onEditStart={handleEditStart} onDraftChange={setDureeDraft} onEditSave={handleEditSave}
                  onDemarrer={() => navigate('/focus', { state: { planningDate: today } })}
                  onCheck={handleCheckTache}
                  onOpenSheet={(id) => setSheetDossierId(id)} />
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Section Routines ──────────────────────────────────────────── */}
      {step !== 'validation' && (
        <div className="section">
          <div className="section-header">
            <span className="label" style={{ marginBottom: 0 }}>Mes routines</span>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowAddR(true)}>+ Ajouter</button>
          </div>

          {routines.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
              Aucune routine. Ajoutez des tâches récurrentes pour les intégrer automatiquement dans votre planning.
            </p>
          ) : (
            <div className="card" style={{ padding: '4px 12px' }}>
              {[
                { list: routineGroups.daily,   label: 'Quotidiennes' },
                ...JOURS.map((j, i) => ({ list: routineGroups.weekly.filter(r => r.jourSemaine === i), label: j })),
                { list: routineGroups.monthly,  label: 'Mensuelles' },
              ].filter(g => g.list.length > 0).map(({ list, label }) => (
                <div key={label}>
                  <p className="routine-group-label">{label}</p>
                  {list.map(r => (
                    <div key={r.id} className="routine-row">
                      <div className="routine-dot" />
                      <span className="routine-titre">{r.titre}</span>
                      <span className="routine-duree">{formatDuree(r.dureeMin)}</span>
                      <button className="tache-del" onClick={() => handleDeleteRoutine(r.id)} aria-label="Supprimer">×</button>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Modaux ─────────────────────────────────────────────────────── */}
      {step === 'heures' && (
        <div className="section" style={{ marginTop: 8 }}>
          <div className="morning-card" style={{ flexDirection: 'column', gap: 12, alignItems: 'flex-start' }}>
            <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>Combien d'heures as-tu aujourd'hui ?</p>
            <div style={{ display: 'flex', gap: 8, width: '100%' }}>
              {[{ h: 2, sub: '2h' }, { h: 4, sub: '4h' }, { h: 6, sub: '6h' }].map(({ h, sub }) => (
                <button key={h} className="heures-option" onClick={() => handleHeures(h)}
                  style={{ flex: 1, padding: '10px 8px', textAlign: 'center' }}>
                  <span className="heures-val">{sub}</span>
                </button>
              ))}
            </div>
            <button className="btn btn-ghost btn-sm btn-full" onClick={() => handleHeures(4)}>
              Autre durée (4h par défaut) →
            </button>
          </div>
        </div>
      )}
      {step === 'routines' && (
        <div className="routines-screen">
          <div className="validation-header">
            <button className="validation-back" onClick={() => setStep(null)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6"/>
              </svg>
              Retour
            </button>
            <span className="validation-title">Routines d'aujourd'hui</span>
          </div>

          <div className="section">
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.5 }}>
              Coche les routines à intégrer dans ton planning.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
              {routinesDuJour(routines).map(r => (
                <div key={r.id} className="routine-check-row"
                  onClick={() => setSelectedRIds(prev => prev.includes(r.id) ? prev.filter(x => x !== r.id) : [...prev, r.id])}>
                  <div className={`routine-checkbox${selectedRIds.includes(r.id) ? ' routine-checkbox-on' : ''}`}>
                    {selectedRIds.includes(r.id) && '✓'}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>{r.titre}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{formatDuree(r.dureeMin)}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Ajout rapide d'une routine */}
            <div className="add-routine-inline">
              <p className="label">+ Nouvelle routine</p>
              <input className="input" placeholder="Titre (ex : Méditation)" value={newRoutineTitre}
                onChange={e => setNewRoutineTitre(e.target.value)} style={{ marginBottom: 8 }} />
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <input className="input" type="number" min="5" max="480" placeholder="Durée (min)"
                  value={newRoutineDuree} onChange={e => setNewRoutineDuree(e.target.value)} style={{ flex: 1 }} />
                <select className="input" value={newRoutineRec}
                  onChange={e => setNewRoutineRec(e.target.value)} style={{ flex: 1 }}>
                  <option value="daily">Quotidienne</option>
                  <option value="weekly">Hebdomadaire</option>
                  <option value="monthly">Mensuelle</option>
                </select>
              </div>
              <button className="btn btn-ghost btn-sm btn-full"
                disabled={!newRoutineTitre.trim()}
                onClick={handleAddRoutineInline}>
                Ajouter cette routine
              </button>
            </div>
          </div>

          <div className="validation-actions">
            <button className="btn btn-primary btn-full" onClick={() => handleRoutinesConfirm(selectedRIds)}>
              Générer le planning
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style={{ marginLeft: 6 }}>
                <polygon points="5 3 19 12 5 21 5 3"/>
              </svg>
            </button>
          </div>
        </div>
      )}
      {showAddR && <ModalAddRoutine onSave={handleAddRoutine} onClose={() => setShowAddR(false)} />}

      {/* Panneau dossier contextuel */}
      {sheetDossierId && (
        <DossierSheet dossierId={sheetDossierId} onClose={() => setSheetDossierId(null)} />
      )}

      {/* ── Écran de validation IA (overlay plein écran) ─────────────── */}
      {step === 'validation' && proposal && (
        <div className="validation-screen">
          {/* En-tête avec bouton retour */}
          <div className="validation-header">
            <button className="validation-back" onClick={() => setStep(null)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6"/>
              </svg>
              Annuler
            </button>
            <span className="validation-title">Proposition IA</span>
          </div>

          {/* Bannière raisonnement */}
          <div className="validation-banner">
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
              <div className="val-dot" />
              <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--green)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>
                Planning proposé par l'IA
              </p>
            </div>
            <p style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6, margin: 0 }}>
              {proposal.raisonnement || 'Planning optimal calculé selon vos priorités du jour.'}
            </p>
          </div>

          {/* Liste des blocs proposés */}
          <div className="plan-timeline" style={{ padding: '0 16px' }}>
            {propDraft.map(tp => (
              <BlocTache key={tp.tacheId} tp={tp} isFirst={false}
                editingId={editingId} dureeDraft={dureeDraft}
                onEditStart={handleEditStart} onDraftChange={setDureeDraft} onEditSave={handlePropEditSave}
                onDemarrer={() => {}} />
            ))}
          </div>

          {/* Barre d'actions — dans le flux normal, en dernier élément scrollable */}
          <div className="validation-actions">
            <button className="btn btn-ghost" style={{ flex: 1 }}
              onClick={handleRecalculer} disabled={generating}>
              {generating
                ? <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><div className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} />…</span>
                : '↺ Recalculer'
              }
            </button>
            <button className="btn btn-primary" style={{ flex: 2 }}
              onClick={() => { console.log('[Planning] Confirmer tappé'); handleConfirmer() }}
              disabled={generating}>
              Confirmer ce planning
            </button>
          </div>
        </div>
      )}

      <style>{`
        .plan-back-btn {
          display: inline-flex; align-items: center; gap: 5px;
          position: sticky; top: 0; z-index: 20;
          padding: 10px 16px 6px;
          border: none; background: none; cursor: pointer;
          font-size: 13px; color: var(--text-muted); font-family: inherit;
          transition: color 0.15s;
        }
        .plan-back-btn:hover { color: var(--text); }
        .plan-header { display: flex; align-items: flex-start; justify-content: space-between; padding-bottom: 16px; }
        .plan-title  { font-size: 28px; font-weight: 700; color: var(--text); letter-spacing: -0.8px; }
        .plan-sub    { font-size: 13px; color: var(--text-muted); margin-top: 4px; }
        .plan-refresh-btn {
          margin-top: 8px; flex-shrink: 0; border: none;
          background: var(--gray-light); color: var(--text-muted);
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
          background: transparent; cursor: pointer; font-family: inherit; transition: border-color 0.15s, background 0.15s;
        }
        .heures-option:hover { border-color: var(--green); background: var(--green-light); }
        .heures-val { font-size: 18px; font-weight: 700; color: var(--green); }
        .heures-sub { font-size: 14px; color: var(--text-muted); }

        /* Modal routines */
        .routine-check-row {
          display: flex; align-items: center; gap: 12px; padding: 10px 12px;
          border: 1.5px solid var(--border); border-radius: var(--radius-sm);
          cursor: pointer; transition: border-color 0.15s, background 0.15s;
        }
        .routine-check-row:hover { border-color: #6366f1; background: #eef2ff; }
        .routine-checkbox {
          width: 22px; height: 22px; border-radius: 6px; border: 2px solid var(--border);
          display: flex; align-items: center; justify-content: center; font-size: 12px;
          color: white; flex-shrink: 0; transition: all 0.15s;
        }
        .routine-checkbox-on { background: #6366f1; border-color: #6366f1; }

        /* Timeline */
        .plan-timeline { display: flex; flex-direction: column; gap: 10px; }

        /* Blocs */
        .bloc-tache {
          border: 1.5px solid; border-radius: var(--radius); padding: 14px 14px 12px; transition: opacity 0.2s;
        }
        .bloc-tappable { cursor: pointer; }
        .bloc-tappable:active { opacity: 0.85; transform: scale(0.99); }
        .bloc-done { opacity: 0.55; }
        .bloc-hors { opacity: 0.7; }
        .bloc-header { display: flex; align-items: center; gap: 6px; margin-bottom: 8px; flex-wrap: wrap; }
        .bloc-check {
          width: 22px; height: 22px; border-radius: 50%;
          border: 2px solid; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          background: transparent; cursor: pointer;
          transition: background 0.15s, border-color 0.15s;
        }
        .bloc-check-on { background: var(--green) !important; border-color: var(--green) !important; }
        .bloc-horaire { font-size: 13px; font-weight: 700; letter-spacing: 0.03em; flex-shrink: 0; }
        .bloc-duree-btn {
          font-size: 12px; font-weight: 500; border: none; background: none;
          cursor: pointer; padding: 2px 6px; border-radius: 4px; font-family: inherit; transition: background 0.15s;
        }
        .bloc-duree-btn:hover { background: rgba(0,0,0,0.06); }
        .bloc-duree-input { width: 70px; font-size: 12px; border: 1px solid var(--border); border-radius: 4px; padding: 2px 6px; font-family: inherit; outline: none; }
        .bloc-badge {
          margin-left: auto; flex-shrink: 0;
          font-size: 10px; font-weight: 700; padding: 3px 8px;
          border-radius: 20px; text-transform: uppercase; letter-spacing: 0.05em;
        }
        .bloc-titre  { font-size: 15px; font-weight: 600; color: var(--text); line-height: 1.3; margin-bottom: 4px; }
        .bloc-dossier { font-size: 12px; color: var(--text-muted); line-height: 1.3; margin-bottom: 10px; }
        .btn-demarrer {
          display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px;
          background: var(--green); color: #fff; border: none; border-radius: 20px;
          font-size: 13px; font-weight: 600; cursor: pointer; font-family: inherit; transition: opacity 0.15s;
        }
        .btn-demarrer:active { opacity: 0.8; }

        /* Routines section */
        .routine-group-label { font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.08em; padding: 10px 4px 4px; }
        .routine-row { display: flex; align-items: center; gap: 8px; padding: 8px 4px; border-bottom: 1px solid var(--border); }
        .routine-row:last-child { border-bottom: none; }
        .routine-dot { width: 8px; height: 8px; border-radius: 50%; background: #6366f1; flex-shrink: 0; }
        .routine-titre { flex: 1; font-size: 14px; color: var(--text); }
        .routine-duree { font-size: 12px; color: var(--text-muted); flex-shrink: 0; }

        /* ── Écran validation ──────────────────────────────────────────── */
        /*
         * PAS de transform sur cet élément : un transform crée un containing block
         * pour les position:fixed enfants et casse leur positionnement.
         * On utilise une animation opacity-only pour éviter ce piège CSS.
         */
        .validation-screen {
          position: fixed; inset: 0;
          background: var(--bg, #F9F8F5);
          z-index: 100; overflow-y: auto;
          display: flex; flex-direction: column;
          animation: valFadeIn 0.2s ease forwards;
        }
        @keyframes valFadeIn { from { opacity: 0; } to { opacity: 1; } }
        .validation-header {
          display: flex; align-items: center; gap: 10px;
          padding: 16px 16px 4px; flex-shrink: 0;
        }
        .validation-back {
          display: inline-flex; align-items: center; gap: 4px;
          border: none; background: none;
          font-size: 14px; color: var(--text-muted); cursor: pointer;
          padding: 6px 0; font-family: inherit; transition: color 0.15s;
        }
        .validation-back:hover { color: var(--text); }
        .validation-title {
          font-size: 15px; font-weight: 600; color: var(--text);
        }
        .validation-banner {
          margin: 12px 16px; padding: 14px 16px; flex-shrink: 0;
          background: var(--green-light); border: 1px solid var(--green);
          border-radius: var(--radius);
        }
        .val-dot {
          width: 7px; height: 7px; border-radius: 50%;
          background: var(--green); flex-shrink: 0;
          animation: pulse-dot 2s ease-in-out infinite;
        }
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.4; transform: scale(0.7); }
        }
        /* Barre d'actions dans le flux normal — jamais position:fixed */
        .validation-actions {
          margin-top: 16px; flex-shrink: 0;
          padding: 12px 16px calc(env(safe-area-inset-bottom, 0px) + 20px);
          background: var(--surface); border-top: 1px solid var(--border);
          display: flex; gap: 10px;
        }

        /* Écran routines inline */
        .routines-screen {
          position: fixed; inset: 0;
          background: var(--bg, #F9F8F5);
          z-index: 100; overflow-y: auto;
          display: flex; flex-direction: column;
          animation: valFadeIn 0.2s ease forwards;
          pointer-events: auto;
        }
        .add-routine-inline {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          padding: 14px;
          margin-top: 8px;
        }

        ${skeletonCSS}
      `}</style>
    </div>
  )
}

const skeletonCSS = `
  @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
  .skeleton-text {
    background: linear-gradient(90deg, var(--border) 25%, #f0f0ee 50%, var(--border) 75%);
    background-size: 200% 100%; animation: shimmer 1.4s infinite;
    border-radius: var(--radius-sm); display: block;
  }
`
