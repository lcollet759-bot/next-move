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
const JOURS_SHORT  = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam']

function todayISO()   { return new Date().toISOString().split('T')[0] }
function todayLabel() { return new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }) }

function getWeekDays() {
  const today = new Date()
  const dow   = today.getDay()
  const monday = new Date(today)
  monday.setDate(today.getDate() - ((dow + 6) % 7))
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday); d.setDate(monday.getDate() + i); return d
  })
}

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() &&
         a.getMonth()    === b.getMonth()    &&
         a.getDate()     === b.getDate()
}

const Q_STYLE = {
  1: { bg: '#fef2f2', accent: '#C0392B', label: 'Urgent · Important' },
  2: { bg: '#E8F0EA', accent: '#1C3829', label: 'Important' },
  3: { bg: '#fffbeb', accent: '#B45309', label: 'Urgent' },
  4: { bg: '#F5F3EE', accent: '#B5A898', label: 'À planifier' },
}
const ROUTINE_STYLE = { bg: '#eef2ff', accent: '#6366f1', label: 'Routine' }

function taskAccent(tp) {
  if (tp.isRoutine) return '#6366f1'
  return tp.quadrant === 1 ? '#C4623A' :
         tp.quadrant === 2 ? '#1C3829' :
         tp.quadrant === 3 ? '#B45309' : '#B5A898'
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function routinesDuJour(routines) {
  const now = new Date()
  const dow = now.getDay()
  const dom = now.getDate()
  return routines.filter(r => {
    if (r.recurrence === 'daily')   return true
    if (r.recurrence === 'weekly')  return r.jourSemaine === dow
    if (r.recurrence === 'monthly') return r.jourMois    === dom
    return false
  })
}

function enrichProposal(proposalTaches, tachesBase) {
  const map = new Map(tachesBase.map(t => [t.tacheId, t]))
  return proposalTaches.map(pt => {
    const base = map.get(pt.tacheId)
    if (!base) return null
    return { ...base, dureeMin: pt.dureeMin || base.dureeMin || 45,
              heureDebut: pt.heureDebut || '09:00', heureFin: pt.heureFin || '09:00',
              done: false, horsPlanning: false }
  }).filter(Boolean)
}

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

// ── BlocTache (utilisé dans l'écran de validation uniquement) ─────────────────
function BlocTache({ tp, isFirst, editingId, dureeDraft, onEditStart, onDraftChange, onEditSave, onDemarrer, onCheck, onOpenSheet }) {
  const style    = tp.isRoutine ? ROUTINE_STYLE : (Q_STYLE[tp.quadrant] || Q_STYLE[4])
  const isDone   = tp.done
  const canSheet = !!onOpenSheet && !tp.isRoutine && !!tp.dossierId

  return (
    <div
      className={`bloc-tache${isDone ? ' bloc-done' : ''}${tp.horsPlanning ? ' bloc-hors' : ''}${canSheet ? ' bloc-tappable' : ''}`}
      style={{ background: isDone ? 'var(--gray-light)' : style.bg, borderColor: isDone ? 'var(--border)' : style.accent }}
      onClick={() => canSheet && onOpenSheet(tp.dossierId)}
    >
      <div className="bloc-header">
        {onCheck && (
          <button
            className={`bloc-check${isDone ? ' bloc-check-on' : ''}`}
            style={{ borderColor: isDone ? 'var(--green)' : style.accent }}
            onClick={e => { e.stopPropagation(); onCheck(tp.tacheId, tp.dossierId, tp.isRoutine) }}
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
            onClick={e => { e.stopPropagation(); !isDone && onEditStart(tp.tacheId, tp.dureeMin) }}>
            {formatDuree(tp.dureeMin)}{!isDone && <span style={{ fontSize: 10, marginLeft: 2 }}>✎</span>}
          </button>
        )}
        <span className="bloc-badge" style={{
          background: isDone ? 'var(--border)' : style.accent,
          color: isDone ? 'var(--text-muted)' : '#fff',
          opacity: tp.horsPlanning ? 0.5 : 1 }}>
          {isDone ? 'Fait ✓' : tp.horsPlanning ? 'Hors planning' : (tp.isRoutine ? 'Routine' : `Q${tp.quadrant}`)}
        </span>
      </div>
      <p className="bloc-titre" style={{ textDecoration: isDone ? 'line-through' : 'none', color: isDone ? 'var(--text-muted)' : 'var(--text)' }}>
        {tp.titreTache}
      </p>
      <p className="bloc-dossier">
        {tp.titreDossier}{tp.organisme && <span style={{ color: 'var(--border)' }}> · {tp.organisme}</span>}
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

  const [planning,     setPlanning]     = useState(null)
  const [loading,      setLoading]      = useState(!forceStep)
  const [generating,   setGenerating]   = useState(false)
  const [genError,     setGenError]     = useState(null)

  const [step,          setStep]         = useState(null)
  const [heuresPick,    setHeuresPick]   = useState(4)
  const [selectedRIds,  setSelectedRIds] = useState([])

  const [proposal,      setProposal]     = useState(null)
  const [propDraft,     setPropDraft]    = useState([])
  const [planCtx,       setPlanCtx]      = useState(null)

  const [routines,      setRoutines]     = useState([])
  const [showAddR,      setShowAddR]     = useState(false)

  const [heuresCustom, setHeuresCustom] = useState(false)
  const [heuresVal,    setHeuresVal]    = useState('')

  const [newRoutineTitre, setNewRoutineTitre] = useState('')
  const [newRoutineDuree, setNewRoutineDuree] = useState('30')
  const [newRoutineRec,   setNewRoutineRec]   = useState('daily')

  const [sheetDossierId, setSheetDossierId] = useState(null)

  const [editingId,     setEditingId]    = useState(null)
  const [dureeDraft,    setDureeDraft]   = useState('')

  // ── Vue : 'maintenant' | 'calendrier' ───────────────────────────────────
  const [viewMode, setViewMode] = useState('maintenant')

  const prevDoneRef = useRef(null)

  // ── Chargement initial ──────────────────────────────────────────────────
  useEffect(() => {
    try {
      const cached = localStorage.getItem(ROUTINES_KEY)
      if (cached) setRoutines(JSON.parse(cached))
    } catch {}

    const h = location.state?.heures
    if (forceStep === 'heures' || h) {
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

    async function load() {
      let freshRoutines = []
      try {
        freshRoutines = await getRoutines()
        setRoutines(freshRoutines)
        localStorage.setItem(ROUTINES_KEY, JSON.stringify(freshRoutines))
      } catch {}

      const today  = todayISO()
      const cached = localStorage.getItem(PLANNING_KEY(today))
      const dejaPasse = sessionStorage.getItem('nm-planning-visite') === today
      if (cached && (location.key === 'default' || dejaPasse)) {
        try {
          setPlanning(JSON.parse(cached))
          sessionStorage.setItem('nm-planning-visite', today)
          setLoading(false)
          return
        } catch {}
      }
      sessionStorage.removeItem('nm-planning-visite')
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
        if (hrs) { setHeuresPick(hrs); lancerGeneration(hrs, []) }
        else setStep('heures')
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

  const handleHeures = (h) => {
    setHeuresPick(h)
    const todayRoutines = routinesDuJour(routines)
    if (todayRoutines.length > 0) {
      setSelectedRIds(todayRoutines.map(r => r.id))
      setStep('routines')
    } else {
      setStep(null)
      lancerGeneration(h, [])
    }
  }

  const handleRoutinesConfirm = (selectedIds) => {
    const selected = routines.filter(r => selectedIds.includes(r.id))
    setStep(null)
    lancerGeneration(heuresPick, selected)
  }

  const lancerGeneration = async (heuresTotales, routinesSelected) => {
    setGenerating(true)
    setGenError(null)

    const startMin   = heureDeDepart()
    const startTime  = minutesToHHMM(startMin)
    const tachesBase = buildTachesBase(dossiersAujourdhui, routinesSelected)

    if (apiKey && tachesBase.length > 0) {
      try {
        const ctx = { tachesActives: tachesBase, routinesSelectionnees: routinesSelected, heuresTotales, heureDepart: startTime }
        setPlanCtx(ctx)
        const result   = await planifierAvecDurees(ctx)
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

    const tachesPlanifiees = genererCreneaux(tachesBase, heuresTotales)
    await sauvegarderPlanning(heuresTotales, tachesPlanifiees)
    setGenerating(false)
  }

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

  const handleConfirmer = async () => {
    console.log('[Confirmer] heuresPick:', heuresPick, 'propDraft:', propDraft, 'length:', propDraft?.length)
    try {
      await sauvegarderPlanning(heuresPick, propDraft)
      setStep(null)
      setProposal(null)
      setPropDraft([])
    } catch (e) {
      console.error('[Confirmer] erreur:', e)
    }
  }

  const sauvegarderPlanning = async (heuresTotales, tachesPlanifiees) => {
    const today = todayISO()
    const np = {
      id:                planning?.id || uuid(),
      date:              today,
      heuresDisponibles: heuresTotales,
      tachesPlanifiees,
      createdAt:         planning?.createdAt || new Date().toISOString(),
    }
    await savePlanning(np)
    localStorage.setItem(PLANNING_KEY(today), JSON.stringify(np))
    sessionStorage.setItem('nm-planning-visite', today)
    setPlanning(np)
    setHeuresPick(heuresTotales)
  }

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

  const handlePropEditSave = (tacheId, draft) => {
    setEditingId(null)
    if (!tacheId) return
    const d = parseInt(draft)
    if (!d || d < 5) return
    const updated = propDraft.map(t => t.tacheId === tacheId ? { ...t, dureeMin: d } : t)
    setPropDraft(recalculerHoraires(updated))
  }

  const handleCheckTache = async (tacheId, dossierId, isRoutine) => {
    const today = todayISO()
    if (isRoutine) {
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
      await toggleTache(dossierId, tacheId)
    }
  }

  // ── "Après" : déplace la première tâche en fin de liste ─────────────────
  const handleApres = async () => {
    if (!planning) return
    const actives = planning.tachesPlanifiees.filter(t => !t.done)
    if (actives.length < 2) return
    const [first, ...rest] = actives
    const done    = planning.tachesPlanifiees.filter(t => t.done)
    const recalc  = recalculerHoraires([...rest, first])
    const np      = { ...planning, tachesPlanifiees: [...recalc, ...done] }
    setPlanning(np)
    const today = todayISO()
    localStorage.setItem(PLANNING_KEY(today), JSON.stringify(np))
    savePlanning(np).catch(() => {})
  }

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
      jourSemaine: newRoutineRec === 'weekly'  ? new Date().getDay()  : null,
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

  // ── Données dérivées ─────────────────────────────────────────────────────
  const today        = todayISO()
  const tachesActiv  = planning?.tachesPlanifiees.filter(t => !t.done)  ?? []
  const tachesTermin = planning?.tachesPlanifiees.filter(t =>  t.done)  ?? []
  const premiereId   = tachesActiv[0]?.tacheId
  const tacheNow     = tachesActiv[0] || null
  const tachesNext   = tachesActiv.slice(1)

  const minutesRestantes = (() => {
    if (!planning) return null
    const totalMin  = (planning.heuresDisponibles || 0) * 60
    const faitesMin = planning.tachesPlanifiees.filter(t => t.done).reduce((acc, t) => acc + (t.dureeMin || 0), 0)
    return Math.max(0, totalMin - faitesMin)
  })()

  const formatHeuresRestantes = (min) => {
    const h = Math.floor(min / 60)
    const m = min % 60
    if (h === 0) return `${m}min`
    if (m === 0) return `${h}h`
    return `${h}h${String(m).padStart(2, '0')}`
  }

  const routineGroups = {
    daily:   routines.filter(r => r.recurrence === 'daily'),
    weekly:  routines.filter(r => r.recurrence === 'weekly'),
    monthly: routines.filter(r => r.recurrence === 'monthly'),
  }

  const weekDays = getWeekDays()
  const showBack = location.key !== 'default' || document.referrer.includes('aujourdhui')

  // ── Loading ──────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="page pla-page">
      <header className="pla-header">
        <div className="pla-header-left">
          <div className="pla-logo"><div className="pla-logo-circle"><span className="pla-logo-mark">»</span></div><span className="pla-logo-name">Planning</span></div>
        </div>
      </header>
      <div className="pla-body">
        <div className="pla-sk-block" />
        <div className="pla-sk-block" style={{ height: 80, opacity: 0.5 }} />
      </div>
      <style>{plaCSS}</style>
    </div>
  )

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="page pla-page">

      {/* ── Header vert ─────────────────────────────────────────────────── */}
      <header className="pla-header">
        <div className="pla-header-left">
          {showBack && (
            <button className="pla-back" onClick={() => navigate(-1)} aria-label="Retour">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6"/>
              </svg>
            </button>
          )}
          <div className="pla-logo">
            <div className="pla-logo-circle"><span className="pla-logo-mark">»</span></div>
            <span className="pla-logo-name">Planning</span>
          </div>
        </div>
        <div className="pla-header-right">
          {planning && minutesRestantes !== null && step !== 'validation' && (
            <span className="pla-rest">
              {tachesActiv.length === 0 ? 'Tout fait 🎉' : `${formatHeuresRestantes(minutesRestantes)} restantes`}
            </span>
          )}
          <button className="pla-refresh-btn"
            onClick={() => {
              const today = todayISO()
              localStorage.removeItem(PLANNING_KEY(today))
              sessionStorage.removeItem('nm-planning-visite')
              setPlanning(null); setProposal(null); setPropDraft([])
              setStep('heures'); setViewMode('maintenant')
            }}
            disabled={generating || step === 'validation'}
            title="Recréer le planning">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
              style={{ animation: generating ? 'spin 1s linear infinite' : 'none' }}>
              <polyline points="23 4 23 10 17 10"/>
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
            </svg>
          </button>
        </div>
      </header>

      {/* ── Spinner génération ──────────────────────────────────────────── */}
      {generating && (
        <div className="pla-body">
          <div className="morning-card">
            <div className="spinner" style={{ width: 14, height: 14, borderWidth: 2, flexShrink: 0 }} />
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              {apiKey ? "L'IA construit ton planning optimal…" : 'Génération du planning…'}
            </span>
          </div>
        </div>
      )}

      {/* ── Erreur génération ───────────────────────────────────────────── */}
      {genError && (
        <div className="pla-body">
          <div className="morning-card" style={{ borderColor: 'var(--red)', background: 'var(--red-light)' }}>
            <p style={{ fontSize: 13, color: 'var(--red)' }}>{genError}</p>
          </div>
        </div>
      )}

      {/* ── État vide (pas de planning, pas en génération) ──────────────── */}
      {!generating && !planning && step === null && (
        <div className="pla-body">
          <div className="morning-card" style={{ flexDirection: 'column', gap: 12, alignItems: 'flex-start' }}>
            <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>Aucun planning pour aujourd'hui.</p>
            <button className="btn btn-primary btn-sm" onClick={() => setStep('heures')}>Créer mon planning</button>
          </div>
        </div>
      )}

      {/* ══ VUE MAINTENANT ══════════════════════════════════════════════════ */}
      {!generating && planning && step !== 'validation' && step !== 'heures' && step !== 'routines' && viewMode === 'maintenant' && (
        <div className="pla-body">
          {tacheNow ? (
            <>
              {/* Grande carte tâche principale */}
              <div className="pla-now-card">
                <span className="pla-now-dossier">{tacheNow.titreDossier}</span>
                <h2 className="pla-now-titre">{tacheNow.titreTache}</h2>
                <div className="pla-now-pills">
                  <span className="pla-pill">{formatDuree(tacheNow.dureeMin)}</span>
                  {tacheNow.heureDebut && <span className="pla-pill">{tacheNow.heureDebut}</span>}
                  {tacheNow.echeance && (
                    <span className="pla-pill pla-pill-ech">
                      {new Date(tacheNow.echeance + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                    </span>
                  )}
                </div>
                <div className="pla-now-btns">
                  <button className="pla-btn-start"
                    onClick={() => navigate('/focus', { state: { planningDate: today, taches: tachesActiv } })}>
                    Commencer
                  </button>
                  <button className="pla-btn-apres" onClick={handleApres}
                    disabled={tachesActiv.length < 2}>
                    Après
                  </button>
                </div>
              </div>

              {/* Ensuite */}
              {tachesNext.length > 0 && (
                <div className="pla-ensuite-wrap">
                  <span className="pla-ensuite-label">Ensuite</span>
                  {tachesNext.map(tp => {
                    const accent = taskAccent(tp)
                    return (
                      <div key={tp.tacheId} className="pla-ensuite-row"
                        onClick={() => tp.dossierId && setSheetDossierId(tp.dossierId)}>
                        <div className="pla-ensuite-line" style={{ background: accent }} />
                        <div className="pla-ensuite-body">
                          <span className="pla-ensuite-titre">{tp.titreTache}</span>
                          <span className="pla-ensuite-meta">{tp.titreDossier} · {formatDuree(tp.dureeMin)}</span>
                        </div>
                        <span className="pla-ensuite-time">{tp.heureDebut}</span>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Tâches terminées */}
              {tachesTermin.length > 0 && (
                <p className="pla-done-count">
                  {tachesTermin.length} tâche{tachesTermin.length > 1 ? 's' : ''} terminée{tachesTermin.length > 1 ? 's' : ''} ✓
                </p>
              )}
            </>
          ) : (
            <div className="empty-state">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--border)" strokeWidth="1.5" strokeLinecap="round" style={{ marginBottom: 14 }}>
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
              </svg>
              <p className="empty-title">Toutes les tâches sont faites !</p>
              <p className="empty-text">Beau travail pour aujourd'hui.</p>
            </div>
          )}

          {/* Lien vue calendrier */}
          <button className="pla-cal-link" onClick={() => setViewMode('calendrier')}>
            Voir la vue calendrier ↓
          </button>
        </div>
      )}

      {/* ══ VUE CALENDRIER ══════════════════════════════════════════════════ */}
      {!generating && planning && step !== 'validation' && step !== 'heures' && step !== 'routines' && viewMode === 'calendrier' && (
        <div className="pla-body">

          {/* Sélecteur de jours */}
          <div className="pla-day-scroll">
            {weekDays.map((d, i) => {
              const isToday = isSameDay(d, new Date())
              return (
                <div key={i}
                  className={`pla-day-btn${isToday ? ' pla-day-today' : ''}`}
                  onClick={() => isToday && setViewMode('maintenant')}>
                  <span className="pla-day-dow">{JOURS_SHORT[d.getDay()]}</span>
                  <span className="pla-day-num">{d.getDate()}</span>
                </div>
              )
            })}
          </div>

          {/* Timeline calendrier */}
          <div className="pla-cal-timeline">
            {planning.tachesPlanifiees
              .slice()
              .sort((a, b) => (a.heureDebut || '').localeCompare(b.heureDebut || ''))
              .map(tp => {
                const accent = taskAccent(tp)
                return (
                  <div key={tp.tacheId} className="pla-cal-row"
                    onClick={() => tp.dossierId && setSheetDossierId(tp.dossierId)}>
                    <div className="pla-cal-times">
                      <span className="pla-cal-start">{tp.heureDebut}</span>
                      <span className="pla-cal-end">{tp.heureFin}</span>
                    </div>
                    <div className="pla-cal-block" style={{ borderLeftColor: accent, opacity: tp.done ? 0.45 : 1 }}>
                      <div className="pla-cal-block-head">
                        <p className="pla-cal-titre" style={{ textDecoration: tp.done ? 'line-through' : 'none' }}>
                          {tp.titreTache}
                        </p>
                        <span className="pla-cal-duree">{formatDuree(tp.dureeMin)}</span>
                      </div>
                      <p className="pla-cal-dossier">{tp.titreDossier}</p>
                      {tp.done && <span className="pla-cal-done-badge">Fait ✓</span>}
                    </div>
                  </div>
                )
              })}
          </div>

          <button className="pla-cal-back-btn" onClick={() => setViewMode('maintenant')}>
            ← Vue Maintenant
          </button>
        </div>
      )}

      {/* ── Section Routines (vue maintenant uniquement) ─────────────────── */}
      {step !== 'validation' && step !== 'heures' && step !== 'routines' && viewMode === 'maintenant' && (
        <div className="pla-body pla-routines-section">
          <div className="section-header">
            <span className="label" style={{ marginBottom: 0 }}>Mes routines</span>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowAddR(true)}>+ Ajouter</button>
          </div>

          {routines.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
              Aucune routine. Ajoutez des tâches récurrentes pour les intégrer automatiquement.
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

      {/* ── Écran sélection heures ───────────────────────────────────────── */}
      {step === 'heures' && (
        <div className="heures-screen">
          <div className="heures-screen-body">
            <p className="heures-screen-title">Combien d'heures as-tu aujourd'hui ?</p>
            <p className="heures-screen-sub">Je construirai le planning optimal avec l'IA.</p>

            {!heuresCustom ? (
              <div className="heures-grid">
                {[
                  { h: 2, label: '2h',  sub: 'Courte session'  },
                  { h: 4, label: '4h',  sub: 'Demi-journée'    },
                  { h: 6, label: '6h',  sub: 'Journée complète'},
                ].map(({ h, label, sub }) => (
                  <button key={h} className="heures-option" onClick={() => handleHeures(h)}>
                    <span className="heures-val">{label}</span>
                    <span className="heures-sub">{sub}</span>
                  </button>
                ))}
                <button className="heures-option heures-autre" onClick={() => setHeuresCustom(true)}>
                  <span className="heures-val">Autre</span>
                  <span className="heures-sub">Durée libre</span>
                </button>
              </div>
            ) : (
              <div className="heures-custom-wrap">
                <p style={{ fontSize: 14, marginBottom: 10, color: 'var(--text-muted)' }}>Durée disponible (heures) :</p>
                <input type="number" min="0.5" max="12" step="0.5"
                  className="input" placeholder="ex : 3" value={heuresVal}
                  onChange={e => setHeuresVal(e.target.value)} autoFocus style={{ marginBottom: 12 }} />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-ghost btn-sm" style={{ flex: 1 }}
                    onClick={() => { setHeuresCustom(false); setHeuresVal('') }}>← Retour</button>
                  <button className="btn btn-primary" style={{ flex: 2 }}
                    disabled={!heuresVal || parseFloat(heuresVal) <= 0}
                    onClick={() => { handleHeures(parseFloat(heuresVal)); setHeuresCustom(false); setHeuresVal('') }}>
                    Continuer →
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Écran routines ───────────────────────────────────────────────── */}
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
                disabled={!newRoutineTitre.trim()} onClick={handleAddRoutineInline}>
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

      {sheetDossierId && (
        <DossierSheet dossierId={sheetDossierId} onClose={() => setSheetDossierId(null)} />
      )}

      {/* ── Écran validation IA ─────────────────────────────────────────── */}
      {step === 'validation' && proposal && (
        <div className="validation-screen">
          <div className="validation-header">
            <button className="validation-back" onClick={() => setStep(null)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6"/>
              </svg>
              Annuler
            </button>
            <span className="validation-title">Proposition IA</span>
          </div>
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
          <div className="plan-timeline" style={{ padding: '0 16px' }}>
            {propDraft.map(tp => (
              <BlocTache key={tp.tacheId} tp={tp} isFirst={false}
                editingId={editingId} dureeDraft={dureeDraft}
                onEditStart={handleEditStart} onDraftChange={setDureeDraft} onEditSave={handlePropEditSave}
                onDemarrer={() => {}} />
            ))}
          </div>
          <div className="validation-actions">
            <button className="btn btn-ghost" style={{ flex: 1 }}
              onClick={handleRecalculer} disabled={generating}>
              {generating
                ? <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} />…
                  </span>
                : '↺ Recalculer'
              }
            </button>
            <button className="btn btn-primary" style={{ flex: 2 }}
              onClick={handleConfirmer} disabled={generating}>
              Confirmer ce planning
            </button>
          </div>
        </div>
      )}

      <style>{plaCSS}</style>
    </div>
  )
}

/* ══ CSS ══════════════════════════════════════════════════════════════════════ */
const plaCSS = `
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
  @keyframes valFadeIn { from { opacity: 0; } to { opacity: 1; } }
  @keyframes pulse-dot { 0%,100% { opacity:1; transform:scale(1); } 50% { opacity:0.4; transform:scale(0.7); } }

  /* ── Page ────────────────────────────────────────────────────────────── */
  .pla-page {
    background: #F7F5F0;
  }

  /* ── Header ──────────────────────────────────────────────────────────── */
  .pla-header {
    background: #1C3829;
    padding: 48px 20px 18px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    position: sticky;
    top: 0;
    z-index: 10;
    flex-shrink: 0;
  }
  .pla-header-left  { display: flex; align-items: center; gap: 8px; }
  .pla-header-right { display: flex; align-items: center; gap: 10px; }
  .pla-back {
    border: none; background: rgba(255,255,255,0.12); color: rgba(255,255,255,0.7);
    width: 30px; height: 30px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    cursor: pointer; flex-shrink: 0; transition: background 0.15s;
  }
  .pla-back:active { background: rgba(255,255,255,0.2); }
  .pla-logo { display: flex; align-items: center; gap: 10px; }
  .pla-logo-circle {
    width: 32px; height: 32px; border-radius: 50%; background: #C4623A;
    display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  }
  .pla-logo-mark { color: #fff; font-size: 13px; font-weight: 800; letter-spacing: -1.5px; line-height: 1; }
  .pla-logo-name { color: rgba(255,255,255,0.92); font-size: 15px; font-weight: 600; letter-spacing: -0.2px; }
  .pla-rest {
    font-size: 12px; font-weight: 600; color: rgba(255,255,255,0.7);
    letter-spacing: 0.01em;
  }
  .pla-refresh-btn {
    border: none; background: rgba(255,255,255,0.12); color: rgba(255,255,255,0.7);
    width: 32px; height: 32px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    cursor: pointer; transition: background 0.15s;
  }
  .pla-refresh-btn:hover:not(:disabled) { background: rgba(255,255,255,0.2); }
  .pla-refresh-btn:disabled { opacity: 0.35; cursor: default; }

  /* ── Body ────────────────────────────────────────────────────────────── */
  .pla-body {
    padding: 16px 20px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .pla-routines-section {
    border-top: 1px solid var(--border);
    padding-top: 20px;
  }

  /* ── Grande carte Maintenant ─────────────────────────────────────────── */
  .pla-now-card {
    background: #1C3829;
    border-radius: 16px;
    padding: 22px 20px 20px;
    box-shadow: 0 4px 20px rgba(28,56,41,0.25);
  }
  .pla-now-dossier {
    display: block;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 2px;
    text-transform: uppercase;
    color: rgba(255,255,255,0.45);
    margin-bottom: 8px;
  }
  .pla-now-titre {
    font-size: 22px;
    font-weight: 700;
    color: #fff;
    line-height: 1.25;
    letter-spacing: -0.5px;
    margin-bottom: 14px;
  }
  .pla-now-pills {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    margin-bottom: 18px;
  }
  .pla-pill {
    padding: 4px 10px;
    background: rgba(255,255,255,0.12);
    color: rgba(255,255,255,0.8);
    border-radius: 20px;
    font-size: 12px;
    font-weight: 500;
    letter-spacing: 0.02em;
  }
  .pla-pill-ech { background: rgba(196,98,58,0.35); color: #FFCCB0; }
  .pla-now-btns { display: flex; gap: 8px; }
  .pla-btn-start {
    padding: 10px 22px;
    background: #fff;
    color: #1C3829;
    border: none;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 700;
    font-family: inherit;
    cursor: pointer;
    transition: opacity 0.15s;
    letter-spacing: -0.2px;
  }
  .pla-btn-start:active { opacity: 0.85; }
  .pla-btn-apres {
    padding: 10px 18px;
    background: transparent;
    color: rgba(255,255,255,0.6);
    border: 1.5px solid rgba(255,255,255,0.2);
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    font-family: inherit;
    cursor: pointer;
    transition: background 0.15s;
  }
  .pla-btn-apres:disabled { opacity: 0.3; cursor: default; }
  .pla-btn-apres:not(:disabled):active { background: rgba(255,255,255,0.1); }

  /* ── Section Ensuite ─────────────────────────────────────────────────── */
  .pla-ensuite-wrap {
    background: #fff;
    border-radius: 14px;
    border: 1px solid #DDD8CE;
    overflow: hidden;
  }
  .pla-ensuite-label {
    display: block;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 1.5px;
    text-transform: uppercase;
    color: #A09080;
    padding: 12px 14px 8px;
  }
  .pla-ensuite-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 14px;
    border-top: 1px solid #F0EBE3;
    cursor: pointer;
    transition: background 0.12s;
  }
  .pla-ensuite-row:active { background: #F7F5F0; }
  .pla-ensuite-line {
    width: 3px;
    height: 36px;
    border-radius: 2px;
    flex-shrink: 0;
  }
  .pla-ensuite-body { flex: 1; min-width: 0; }
  .pla-ensuite-titre {
    display: block;
    font-size: 14px;
    font-weight: 600;
    color: #2A1F14;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .pla-ensuite-meta { font-size: 11px; color: #A09080; }
  .pla-ensuite-time { font-size: 12px; color: #C0B8A8; flex-shrink: 0; font-weight: 500; }

  /* ── Tâches terminées ────────────────────────────────────────────────── */
  .pla-done-count {
    font-size: 12px;
    color: #A09080;
    text-align: center;
    padding: 4px 0;
  }

  /* ── Lien vue calendrier ─────────────────────────────────────────────── */
  .pla-cal-link {
    background: none;
    border: none;
    color: #A09080;
    font-size: 13px;
    font-weight: 500;
    font-family: inherit;
    cursor: pointer;
    padding: 8px 0;
    text-align: center;
    width: 100%;
    transition: color 0.15s;
  }
  .pla-cal-link:active { color: #2A1F14; }

  /* ── Vue Calendrier ──────────────────────────────────────────────────── */
  .pla-day-scroll {
    display: flex;
    gap: 6px;
    overflow-x: auto;
    scrollbar-width: none;
    padding-bottom: 4px;
    -webkit-overflow-scrolling: touch;
  }
  .pla-day-scroll::-webkit-scrollbar { display: none; }
  .pla-day-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 8px 12px;
    border-radius: 10px;
    background: #fff;
    border: 1px solid #DDD8CE;
    cursor: pointer;
    flex-shrink: 0;
    transition: all 0.15s;
    opacity: 0.5;
  }
  .pla-day-today {
    background: #1C3829;
    border-color: #1C3829;
    opacity: 1;
  }
  .pla-day-dow {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: #A09080;
  }
  .pla-day-today .pla-day-dow { color: rgba(255,255,255,0.7); }
  .pla-day-num {
    font-size: 17px;
    font-weight: 700;
    color: #2A1F14;
    line-height: 1;
  }
  .pla-day-today .pla-day-num { color: #fff; }

  .pla-cal-timeline {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .pla-cal-row {
    display: flex;
    gap: 12px;
    align-items: stretch;
    cursor: pointer;
  }
  .pla-cal-times {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    justify-content: space-between;
    width: 42px;
    flex-shrink: 0;
    padding: 4px 0;
  }
  .pla-cal-start {
    font-size: 11px;
    font-weight: 600;
    color: #2A1F14;
    line-height: 1;
  }
  .pla-cal-end {
    font-size: 10px;
    color: #C0B8A8;
    line-height: 1;
  }
  .pla-cal-block {
    flex: 1;
    background: #fff;
    border-left: 3px solid #B5A898;
    border-radius: 0 10px 10px 0;
    padding: 10px 12px;
    box-shadow: 0 1px 3px rgba(42,31,20,0.05);
    transition: opacity 0.2s;
  }
  .pla-cal-block:active { opacity: 0.8; }
  .pla-cal-block-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; margin-bottom: 2px; }
  .pla-cal-titre { font-size: 14px; font-weight: 600; color: #2A1F14; flex: 1; line-height: 1.3; margin: 0; }
  .pla-cal-duree { font-size: 11px; color: #A09080; flex-shrink: 0; font-weight: 500; }
  .pla-cal-dossier { font-size: 11px; color: #A09080; margin: 0; }
  .pla-cal-done-badge {
    display: inline-block;
    margin-top: 4px;
    font-size: 10px;
    font-weight: 700;
    color: #1C3829;
    background: #E8F0EA;
    padding: 2px 7px;
    border-radius: 10px;
  }
  .pla-cal-back-btn {
    background: none;
    border: 1.5px dashed #DDD8CE;
    color: #A09080;
    border-radius: 10px;
    padding: 12px;
    font-size: 13px;
    font-weight: 500;
    font-family: inherit;
    cursor: pointer;
    width: 100%;
    transition: background 0.15s;
  }
  .pla-cal-back-btn:active { background: #F0EBE3; }

  /* ── Skeleton ────────────────────────────────────────────────────────── */
  .pla-sk-block {
    background: linear-gradient(90deg, #DDD8CE 25%, #ede9e2 50%, #DDD8CE 75%);
    background-size: 200% 100%;
    animation: shimmer 1.4s infinite;
    border-radius: 14px;
    height: 140px;
  }

  /* ── Écran sélection heures ──────────────────────────────────────────── */
  .heures-screen {
    position: fixed; inset: 0; z-index: 100;
    background: #F7F5F0;
    display: flex; align-items: center; justify-content: center;
    padding: 24px; pointer-events: auto;
  }
  .heures-screen-body { width: 100%; max-width: 420px; }
  .heures-screen-title { font-size: 22px; font-weight: 700; color: var(--text); letter-spacing: -0.5px; margin-bottom: 8px; }
  .heures-screen-sub   { font-size: 14px; color: var(--text-muted); margin-bottom: 28px; line-height: 1.5; }
  .heures-grid { display: flex; flex-direction: column; gap: 10px; }
  .heures-option {
    width: 100%; display: flex; align-items: center; justify-content: space-between;
    padding: 16px 18px; border: 1.5px solid var(--border); border-radius: var(--radius-sm);
    background: var(--surface); cursor: pointer; font-family: inherit;
    transition: border-color 0.15s, background 0.15s; text-align: left;
  }
  .heures-option:hover  { border-color: var(--green); background: var(--green-light); }
  .heures-option:active { opacity: 0.85; }
  .heures-autre { opacity: 0.7; }
  .heures-val   { font-size: 18px; font-weight: 700; color: var(--green); }
  .heures-sub   { font-size: 13px; color: var(--text-muted); }
  .heures-custom-wrap { display: flex; flex-direction: column; }

  /* ── Routines screen ─────────────────────────────────────────────────── */
  .routines-screen {
    position: fixed; inset: 0; background: #F7F5F0; z-index: 100;
    overflow-y: auto; display: flex; flex-direction: column;
    animation: valFadeIn 0.2s ease forwards; pointer-events: auto;
  }
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
  .add-routine-inline {
    background: var(--surface); border: 1px solid var(--border);
    border-radius: var(--radius); padding: 14px; margin-top: 8px;
  }

  /* ── Validation screen ───────────────────────────────────────────────── */
  .validation-screen {
    position: fixed; inset: 0; background: #F7F5F0; z-index: 100;
    overflow-y: auto; display: flex; flex-direction: column;
    animation: valFadeIn 0.2s ease forwards;
  }
  .validation-header { display: flex; align-items: center; gap: 10px; padding: 16px 16px 4px; flex-shrink: 0; }
  .validation-back {
    display: inline-flex; align-items: center; gap: 4px; border: none; background: none;
    font-size: 14px; color: var(--text-muted); cursor: pointer; padding: 6px 0; font-family: inherit; transition: color 0.15s;
  }
  .validation-back:hover { color: var(--text); }
  .validation-title { font-size: 15px; font-weight: 600; color: var(--text); }
  .validation-banner {
    margin: 12px 16px; padding: 14px 16px; flex-shrink: 0;
    background: var(--green-light); border: 1px solid var(--green); border-radius: var(--radius);
  }
  .val-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--green); flex-shrink: 0; animation: pulse-dot 2s ease-in-out infinite; }
  .validation-actions {
    margin-top: 16px; flex-shrink: 0;
    padding: 12px 16px calc(env(safe-area-inset-bottom, 0px) + 20px);
    background: var(--surface); border-top: 1px solid var(--border);
    display: flex; gap: 10px;
  }

  /* ── Blocs validation ────────────────────────────────────────────────── */
  .plan-timeline { display: flex; flex-direction: column; gap: 10px; }
  .bloc-tache { border: 1.5px solid; border-radius: var(--radius); padding: 14px 14px 12px; transition: opacity 0.2s; }
  .bloc-tappable { cursor: pointer; }
  .bloc-tappable:active { opacity: 0.85; }
  .bloc-done { opacity: 0.55; }
  .bloc-header { display: flex; align-items: center; gap: 6px; margin-bottom: 8px; flex-wrap: wrap; }
  .bloc-check { width: 22px; height: 22px; border-radius: 50%; border: 2px solid; flex-shrink: 0; display: flex; align-items: center; justify-content: center; background: transparent; cursor: pointer; transition: background 0.15s; }
  .bloc-check-on { background: var(--green) !important; border-color: var(--green) !important; }
  .bloc-horaire { font-size: 13px; font-weight: 700; letter-spacing: 0.03em; flex-shrink: 0; }
  .bloc-duree-btn { font-size: 12px; font-weight: 500; border: none; background: none; cursor: pointer; padding: 2px 6px; border-radius: 4px; font-family: inherit; transition: background 0.15s; }
  .bloc-duree-btn:hover { background: rgba(0,0,0,0.06); }
  .bloc-duree-input { width: 70px; font-size: 12px; border: 1px solid var(--border); border-radius: 4px; padding: 2px 6px; font-family: inherit; outline: none; }
  .bloc-badge { margin-left: auto; flex-shrink: 0; font-size: 10px; font-weight: 700; padding: 3px 8px; border-radius: 20px; text-transform: uppercase; letter-spacing: 0.05em; }
  .bloc-titre  { font-size: 15px; font-weight: 600; color: var(--text); line-height: 1.3; margin-bottom: 4px; }
  .bloc-dossier { font-size: 12px; color: var(--text-muted); line-height: 1.3; margin-bottom: 10px; }
  .btn-demarrer { display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; background: var(--green); color: #fff; border: none; border-radius: 20px; font-size: 13px; font-weight: 600; cursor: pointer; font-family: inherit; transition: opacity 0.15s; }
  .btn-demarrer:active { opacity: 0.8; }

  /* ── Routines section ────────────────────────────────────────────────── */
  .section-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
  .routine-group-label { font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.08em; padding: 10px 4px 4px; }
  .routine-row { display: flex; align-items: center; gap: 8px; padding: 8px 4px; border-bottom: 1px solid var(--border); }
  .routine-row:last-child { border-bottom: none; }
  .routine-dot { width: 8px; height: 8px; border-radius: 50%; background: #6366f1; flex-shrink: 0; }
  .routine-titre { flex: 1; font-size: 14px; color: var(--text); }
  .routine-duree { font-size: 12px; color: var(--text-muted); flex-shrink: 0; }

  /* ── Skeleton global ─────────────────────────────────────────────────── */
  .skeleton-text {
    background: linear-gradient(90deg, var(--border) 25%, #f0f0ee 50%, var(--border) 75%);
    background-size: 200% 100%; animation: shimmer 1.4s infinite;
    border-radius: var(--radius-sm); display: block;
  }
`
