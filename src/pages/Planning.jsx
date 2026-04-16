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

function getWeekDays() {
  const today   = new Date()
  const dow     = today.getDay()
  const monday  = new Date(today)
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

function taskAccent(tp) {
  if (tp.isRoutine) return '#6366f1'
  return tp.quadrant === 1 ? '#C4623A' :
         tp.quadrant === 2 ? '#1C3829' :
         tp.quadrant === 3 ? '#B45309' : '#B5A898'
}

const Q_STYLE = {
  1: { bg: '#fef2f2', accent: '#C0392B' },
  2: { bg: '#E8F0EA', accent: '#1C3829' },
  3: { bg: '#fffbeb', accent: '#B45309' },
  4: { bg: '#F5F3EE', accent: '#B5A898' },
}
const ROUTINE_STYLE = { bg: '#eef2ff', accent: '#6366f1' }

// ── Helpers ───────────────────────────────────────────────────────────────────
function routinesDuJour(routines) {
  const now = new Date(); const dow = now.getDay(); const dom = now.getDate()
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
      tacheId: t.id, dossierId: dossier.id, titreTache: t.titre,
      titreDossier: dossier.titre, organisme: dossier.organisme ?? null,
      quadrant: dossier.quadrant, echeance: dossier.echeance ?? null,
      dureeMin: estimerDureeFallback(t.titre), done: false,
    }))
  )
  const tachesRoutines = routinesSelected.map(r => ({
    tacheId: `routine-${r.id}`, routineId: r.id, isRoutine: true,
    dossierId: null, titreTache: r.titre, titreDossier: 'Routine',
    organisme: null, quadrant: null, echeance: null, dureeMin: r.dureeMin, done: false,
  }))
  return [...tachesActives, ...tachesRoutines]
}

// ── Modal ajouter une routine ─────────────────────────────────────────────────
function ModalAddRoutine({ onSave, onClose }) {
  const [titre, setTitre] = useState('')
  const [duree, setDuree] = useState('30')
  const [rec,   setRec]   = useState('daily')
  const [dow,   setDow]   = useState(1)
  const [dom,   setDom]   = useState(1)

  const save = () => {
    if (!titre.trim()) return
    onSave({ id: uuid(), titre: titre.trim(), dureeMin: parseInt(duree) || 30,
      recurrence: rec, jourSemaine: rec === 'weekly' ? dow : null,
      jourMois: rec === 'monthly' ? dom : null, actif: true, createdAt: new Date().toISOString() })
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
          {[['daily','Quotidienne'],['weekly','Hebdomadaire'],['monthly','Mensuelle']].map(([k,l]) => (
            <button key={k} className={`btn btn-sm ${rec===k?'btn-primary':'btn-ghost'}`}
              style={{ flex:1, padding:'8px 4px' }} onClick={() => setRec(k)}>{l}</button>
          ))}
        </div>
        {rec === 'weekly' && (
          <div style={{ display:'flex', gap:4, flexWrap:'wrap', marginBottom:12 }}>
            {JOURS.map((j,i) => (
              <button key={i} className={`btn btn-sm ${dow===i?'btn-primary':'btn-ghost'}`}
                style={{ padding:'6px 10px', fontSize:12 }} onClick={() => setDow(i)}>{j.slice(0,3)}</button>
            ))}
          </div>
        )}
        {rec === 'monthly' && (
          <input className="input" type="number" min="1" max="31" value={dom}
            onChange={e => setDom(parseInt(e.target.value)||1)} style={{ marginBottom:12 }} />
        )}
        <div style={{ display:'flex', gap:8, marginTop:4 }}>
          <button className="btn btn-ghost btn-sm" style={{ flex:1 }} onClick={onClose}>Annuler</button>
          <button className="btn btn-primary" style={{ flex:2 }} onClick={save} disabled={!titre.trim()}>
            Ajouter
          </button>
        </div>
      </div>
    </div>
  )
}

// ── BlocTache (validation uniquement) ─────────────────────────────────────────
function BlocTache({ tp, editingId, dureeDraft, onEditStart, onDraftChange, onEditSave }) {
  const style = tp.isRoutine ? ROUTINE_STYLE : (Q_STYLE[tp.quadrant] || Q_STYLE[4])
  return (
    <div className="bloc-tache" style={{ background: style.bg, borderColor: style.accent }}>
      <div className="bloc-header">
        <span className="bloc-horaire" style={{ color: style.accent }}>{tp.heureDebut} – {tp.heureFin}</span>
        {editingId === tp.tacheId ? (
          <input type="number" className="bloc-duree-input" value={dureeDraft} min={5} max={480}
            onChange={e => onDraftChange(e.target.value)}
            onBlur={() => onEditSave(tp.tacheId, dureeDraft)}
            onKeyDown={e => { if (e.key==='Enter') onEditSave(tp.tacheId, dureeDraft); if(e.key==='Escape') onEditSave(null) }}
            autoFocus style={{ color: style.accent }} />
        ) : (
          <button className="bloc-duree-btn" style={{ color: style.accent }}
            onClick={() => onEditStart(tp.tacheId, tp.dureeMin)}>
            {formatDuree(tp.dureeMin)} <span style={{ fontSize:10 }}>✎</span>
          </button>
        )}
        <span className="bloc-badge" style={{ background: style.accent, color:'#fff' }}>
          {tp.isRoutine ? 'Routine' : `Q${tp.quadrant}`}
        </span>
      </div>
      <p className="bloc-titre">{tp.titreTache}</p>
      <p className="bloc-dossier">{tp.titreDossier}</p>
    </div>
  )
}

// ── Page principale ───────────────────────────────────────────────────────────
export default function Planning({ forceStep }) {
  const { dossiersAujourdhui, apiKey, toggleTache } = useApp()
  const navigate = useNavigate()
  const location = useLocation()

  const [planning,    setPlanning]    = useState(null)
  const [loading,     setLoading]     = useState(!forceStep)
  const [generating,  setGenerating]  = useState(false)
  const [genError,    setGenError]    = useState(null)

  const [step,         setStep]        = useState(null)
  const [heuresPick,   setHeuresPick]  = useState(null)
  const [selectedRIds, setSelectedRIds]= useState([])

  const [proposal,  setProposal]  = useState(null)
  const [propDraft, setPropDraft] = useState([])
  const [planCtx,   setPlanCtx]   = useState(null)

  const [routines,   setRoutines]   = useState([])
  const [showAddR,   setShowAddR]   = useState(false)
  const [newRTitre,  setNewRTitre]  = useState('')
  const [newRDuree,  setNewRDuree]  = useState('30')
  const [newRRec,    setNewRRec]    = useState('daily')

  const [sheetDossierId, setSheetDossierId] = useState(null)
  const [editingId,      setEditingId]      = useState(null)
  const [dureeDraft,     setDureeDraft]     = useState('')

  // Vue : 'maintenant' | 'calendrier'
  const [viewMode, setViewMode] = useState('maintenant')

  const prevDoneRef = useRef(null)

  // ── Chargement initial ──────────────────────────────────────────────────
  useEffect(() => {
    try {
      const c = localStorage.getItem(ROUTINES_KEY)
      if (c) setRoutines(JSON.parse(c))
    } catch {}

    const h = location.state?.heures
    if (forceStep === 'heures' || h) {
      getRoutines().then(fresh => {
        const hrs = h || 4
        setRoutines(fresh); localStorage.setItem(ROUTINES_KEY, JSON.stringify(fresh))
        setHeuresPick(hrs)
        const tr = routinesDuJour(fresh)
        if (tr.length > 0) { setSelectedRIds(tr.map(r => r.id)); setStep('routines') }
        else lancerGeneration(hrs, [])
      }).catch(() => { const hrs = h||4; setHeuresPick(hrs); lancerGeneration(hrs, []) })
      return
    }

    async function load() {
      let freshRoutines = []
      try {
        freshRoutines = await getRoutines()
        setRoutines(freshRoutines); localStorage.setItem(ROUTINES_KEY, JSON.stringify(freshRoutines))
      } catch {}

      const today     = todayISO()
      const cached    = localStorage.getItem(PLANNING_KEY(today))
      const dejaPasse = sessionStorage.getItem('nm-planning-visite') === today

      if (cached && (location.key === 'default' || dejaPasse)) {
        try {
          setPlanning(JSON.parse(cached))
          sessionStorage.setItem('nm-planning-visite', today)
          setLoading(false); return
        } catch {}
      }
      sessionStorage.removeItem('nm-planning-visite')
      try {
        const p = await getPlanningForDate(today)
        if (p) {
          setPlanning(p); localStorage.setItem(PLANNING_KEY(today), JSON.stringify(p))
        } else {
          const hrs = location.state?.heures
          if (hrs) {
            setHeuresPick(hrs)
            const tr = routinesDuJour(freshRoutines)
            if (tr.length > 0) { setSelectedRIds(tr.map(r => r.id)); setStep('routines') }
            else lancerGeneration(hrs, [])
          } else { setStep('heures') }
        }
      } catch {
        const hrs = location.state?.heures
        if (hrs) { setHeuresPick(hrs); lancerGeneration(hrs, []) }
        else setStep('heures')
      } finally { setLoading(false) }
    }
    load()
  }, []) // eslint-disable-line

  // ── Auto-sync tâches ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!planning || loading || generating || step) return
    const doneMap = new Map()
    dossiersAujourdhui.forEach(d => d.taches.forEach(t => doneMap.set(t.id, t.done)))
    const doneKey = [...doneMap.entries()].map(([k,v]) => `${k}:${v?1:0}`).join(',')
    if (prevDoneRef.current === doneKey) return
    prevDoneRef.current = doneKey
    const anyChanged = planning.tachesPlanifiees.some(
      tp => !tp.isRoutine && doneMap.has(tp.tacheId) && doneMap.get(tp.tacheId) !== tp.done
    )
    if (!anyChanged) return
    const synced  = planning.tachesPlanifiees.map(tp =>
      !tp.isRoutine && doneMap.has(tp.tacheId) ? { ...tp, done: doneMap.get(tp.tacheId) } : tp
    )
    const active  = synced.filter(t => !t.done)
    const done    = synced.filter(t =>  t.done)
    const resched = genererCreneaux(active, planning.heuresDisponibles)
    const np      = { ...planning, tachesPlanifiees: [...resched, ...done] }
    setPlanning(np)
    localStorage.setItem(PLANNING_KEY(todayISO()), JSON.stringify(np))
    savePlanning(np).catch(() => {})
  }, [dossiersAujourdhui]) // eslint-disable-line

  // ── Handlers étapes ──────────────────────────────────────────────────────
  const handleHeures = (h) => {
    setHeuresPick(h)
    const tr = routinesDuJour(routines)
    if (tr.length > 0) { setSelectedRIds(tr.map(r => r.id)); setStep('routines') }
    else { setStep(null); lancerGeneration(h, []) }
  }

  const handleRoutinesConfirm = (ids) => {
    const selected = routines.filter(r => ids.includes(r.id))
    setStep(null); lancerGeneration(heuresPick, selected)
  }

  const lancerGeneration = async (heuresTotales, routinesSelected) => {
    setGenerating(true); setGenError(null)
    const startTime  = minutesToHHMM(heureDeDepart())
    const tachesBase = buildTachesBase(dossiersAujourdhui, routinesSelected)

    if (apiKey && tachesBase.length > 0) {
      try {
        const ctx     = { tachesActives: tachesBase, routinesSelectionnees: routinesSelected, heuresTotales, heureDepart: startTime }
        setPlanCtx(ctx)
        const result  = await planifierAvecDurees(ctx)
        const enriched = enrichProposal(result.taches, tachesBase)
        setProposal(result); setPropDraft(enriched); setStep('validation')
        setGenerating(false); return
      } catch (e) { console.warn('[Planning] IA fallback:', e.message) }
    }
    const tachesPlanifiees = genererCreneaux(tachesBase, heuresTotales)
    await sauvegarderPlanning(heuresTotales, tachesPlanifiees)
    setGenerating(false)
  }

  const handleRecalculer = async () => {
    if (!planCtx) return
    setGenerating(true); setGenError(null)
    try {
      const result   = await planifierAvecDurees(planCtx)
      const enriched = enrichProposal(result.taches, buildTachesBase(dossiersAujourdhui, planCtx.routinesSelectionnees))
      setProposal(result); setPropDraft(enriched)
    } catch (e) { setGenError(e.message) }
    finally { setGenerating(false) }
  }

  const handleConfirmer = async () => {
    try {
      await sauvegarderPlanning(heuresPick, propDraft)
      setStep(null); setProposal(null); setPropDraft([])
    } catch (e) { console.error('[Confirmer]', e) }
  }

  const sauvegarderPlanning = async (heuresTotales, tachesPlanifiees) => {
    const today = todayISO()
    const np = { id: planning?.id || uuid(), date: today, heuresDisponibles: heuresTotales,
      tachesPlanifiees, createdAt: planning?.createdAt || new Date().toISOString() }
    await savePlanning(np)
    localStorage.setItem(PLANNING_KEY(today), JSON.stringify(np))
    sessionStorage.setItem('nm-planning-visite', today)
    setPlanning(np); setHeuresPick(heuresTotales)
  }

  const handleEditSave = async (tacheId, draft) => {
    setEditingId(null)
    if (!tacheId || !planning) return
    const d = parseInt(draft); if (!d || d < 5) return
    const updated = planning.tachesPlanifiees.map(t => t.tacheId === tacheId ? { ...t, dureeMin: d } : t)
    const np      = { ...planning, tachesPlanifiees: recalculerHoraires(updated) }
    setPlanning(np)
    localStorage.setItem(PLANNING_KEY(todayISO()), JSON.stringify(np))
    savePlanning(np).catch(() => {})
  }

  const handlePropEditSave = (tacheId, draft) => {
    setEditingId(null)
    if (!tacheId) return
    const d = parseInt(draft); if (!d || d < 5) return
    setPropDraft(recalculerHoraires(propDraft.map(t => t.tacheId === tacheId ? { ...t, dureeMin: d } : t)))
  }

  const handleCheckTache = async (tacheId, dossierId, isRoutine) => {
    const today = todayISO()
    if (isRoutine) {
      const updated = planning.tachesPlanifiees.map(t => t.tacheId === tacheId ? { ...t, done: !t.done } : t)
      const active  = updated.filter(t => !t.done); const done = updated.filter(t => t.done)
      const np      = { ...planning, tachesPlanifiees: [...genererCreneaux(active, planning.heuresDisponibles), ...done] }
      setPlanning(np); localStorage.setItem(PLANNING_KEY(today), JSON.stringify(np)); savePlanning(np).catch(() => {})
    } else { await toggleTache(dossierId, tacheId) }
  }

  const handleApres = async () => {
    if (!planning) return
    const actives = planning.tachesPlanifiees.filter(t => !t.done)
    if (actives.length < 2) return
    const [first, ...rest] = actives; const done = planning.tachesPlanifiees.filter(t => t.done)
    const np = { ...planning, tachesPlanifiees: [...recalculerHoraires([...rest, first]), ...done] }
    setPlanning(np); localStorage.setItem(PLANNING_KEY(todayISO()), JSON.stringify(np)); savePlanning(np).catch(() => {})
  }

  const handleAddRoutine = async (routine) => {
    setShowAddR(false); const nl = [...routines, routine]
    setRoutines(nl); localStorage.setItem(ROUTINES_KEY, JSON.stringify(nl)); await saveRoutine(routine)
  }
  const handleDeleteRoutine = async (id) => {
    const nl = routines.filter(r => r.id !== id)
    setRoutines(nl); localStorage.setItem(ROUTINES_KEY, JSON.stringify(nl)); await deleteRoutine(id)
  }
  const handleAddRoutineInline = async () => {
    if (!newRTitre.trim()) return
    const routine = { id: uuid(), titre: newRTitre.trim(), dureeMin: parseInt(newRDuree)||30,
      recurrence: newRRec, jourSemaine: newRRec==='weekly'?new Date().getDay():null,
      jourMois: newRRec==='monthly'?new Date().getDate():null, actif:true, createdAt:new Date().toISOString() }
    await handleAddRoutine(routine); setNewRTitre(''); setNewRDuree('30'); setNewRRec('daily')
    setSelectedRIds(prev => [...prev, routine.id])
  }

  // ── Données dérivées ─────────────────────────────────────────────────────
  const today       = todayISO()
  const tachesActiv = planning?.tachesPlanifiees.filter(t => !t.done) ?? []
  const tachesTermin= planning?.tachesPlanifiees.filter(t =>  t.done) ?? []
  const tacheNow    = tachesActiv[0] || null
  const tachesNext  = tachesActiv.slice(1)
  const weekDays    = getWeekDays()
  const showBack    = location.key !== 'default' || document.referrer.includes('aujourdhui')

  const minutesRestantes = (() => {
    if (!planning) return null
    const totalMin  = (planning.heuresDisponibles || 0) * 60
    const faitesMin = planning.tachesPlanifiees.filter(t => t.done).reduce((a,t) => a+(t.dureeMin||0), 0)
    return Math.max(0, totalMin - faitesMin)
  })()

  const fmtRest = (min) => {
    const h = Math.floor(min/60), m = min%60
    if (h===0) return `${m}min`
    if (m===0) return `${h}h`
    return `${h}h${String(m).padStart(2,'0')}`
  }

  const routineGroups = {
    daily:   routines.filter(r => r.recurrence === 'daily'),
    weekly:  routines.filter(r => r.recurrence === 'weekly'),
    monthly: routines.filter(r => r.recurrence === 'monthly'),
  }

  // ── Header commun (toujours visible) ─────────────────────────────────────
  const Header = () => (
    <header className="pla-header">
      <div className="pla-hl">
        {showBack && (
          <button className="pla-back" onClick={() => navigate(-1)}>
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
      <div className="pla-hr">
        {planning && minutesRestantes !== null && step !== 'validation' && (
          <span className="pla-rest">
            {tachesActiv.length === 0 ? 'Tout fait 🎉' : `${fmtRest(minutesRestantes)} restantes`}
          </span>
        )}
        <button className="pla-refresh"
          onClick={() => {
            localStorage.removeItem(PLANNING_KEY(today))
            sessionStorage.removeItem('nm-planning-visite')
            setPlanning(null); setProposal(null); setPropDraft([])
            setStep('heures'); setViewMode('maintenant')
          }}
          disabled={generating || step === 'validation'}
          title="Recréer le planning">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
            style={{ animation: generating ? 'pla-spin 1s linear infinite' : 'none' }}>
            <polyline points="23 4 23 10 17 10"/>
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
          </svg>
        </button>
      </div>
    </header>
  )

  // ── Loading ──────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="page pla-page">
      <Header />
      <div className="pla-body">
        <div className="pla-sk" />
        <div className="pla-sk" style={{ height:80, opacity:0.5 }} />
      </div>
      <style>{CSS}</style>
    </div>
  )

  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <div className="page pla-page">
      <Header />

      {/* ── ÉTAPE : sélection des heures (inline, sous le header) ─────── */}
      {step === 'heures' && (
        <div className="pla-body">
          <div className="pla-step-card">
            <p className="pla-step-title">Combien de temps as-tu&nbsp;?</p>

            <div className="pla-heures-grid">
              {[
                { h: 0.5, label: '30min' },
                { h: 1,   label: '1h'    },
                { h: 2,   label: '2h'    },
                { h: 8,   label: 'Journée' },
              ].map(({ h, label }) => (
                <button key={h} className="pla-heure-btn" onClick={() => handleHeures(h)}>
                  <span className="pla-heure-val">{label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── ÉTAPE : routines (inline) ──────────────────────────────────── */}
      {step === 'routines' && (
        <div className="pla-body">
          <div className="pla-step-card">
            <p className="pla-step-title">Routines d'aujourd'hui</p>
            <p className="pla-step-sub">Coche celles à intégrer dans ton planning.</p>
            <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:16 }}>
              {routinesDuJour(routines).map(r => (
                <div key={r.id} className="pla-routine-check"
                  onClick={() => setSelectedRIds(p => p.includes(r.id) ? p.filter(x=>x!==r.id) : [...p,r.id])}>
                  <div className={`pla-checkbox${selectedRIds.includes(r.id)?' pla-checkbox-on':''}`}>
                    {selectedRIds.includes(r.id) && '✓'}
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:14, fontWeight:500, color:'#2A1F14' }}>{r.titre}</div>
                    <div style={{ fontSize:12, color:'#A09080' }}>{formatDuree(r.dureeMin)}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="pla-add-routine-inline">
              <p className="label">+ Nouvelle routine</p>
              <input className="input" placeholder="Titre" value={newRTitre}
                onChange={e => setNewRTitre(e.target.value)} style={{ marginBottom:8 }} />
              <div style={{ display:'flex', gap:8, marginBottom:8 }}>
                <input className="input" type="number" min="5" max="480" placeholder="Durée (min)"
                  value={newRDuree} onChange={e => setNewRDuree(e.target.value)} style={{ flex:1 }} />
                <select className="input" value={newRRec} onChange={e => setNewRRec(e.target.value)} style={{ flex:1 }}>
                  <option value="daily">Quotidienne</option>
                  <option value="weekly">Hebdomadaire</option>
                  <option value="monthly">Mensuelle</option>
                </select>
              </div>
              <button className="btn btn-ghost btn-sm btn-full"
                disabled={!newRTitre.trim()} onClick={handleAddRoutineInline}>
                Ajouter cette routine
              </button>
            </div>
            <button className="btn btn-primary btn-full" style={{ marginTop:12 }}
              onClick={() => handleRoutinesConfirm(selectedRIds)}>
              Générer le planning →
            </button>
          </div>
        </div>
      )}

      {/* ── Génération en cours ────────────────────────────────────────── */}
      {generating && (
        <div className="pla-body">
          <div className="pla-gen-card">
            <div className="spinner" style={{ width:14, height:14, borderWidth:2, flexShrink:0 }} />
            <span style={{ fontSize:13, color:'#A09080' }}>
              {apiKey ? "L'IA construit ton planning optimal…" : 'Génération du planning…'}
            </span>
          </div>
        </div>
      )}

      {/* ── Erreur ─────────────────────────────────────────────────────── */}
      {genError && (
        <div className="pla-body">
          <div className="pla-gen-card" style={{ borderColor:'var(--red)', background:'#fef2f2' }}>
            <p style={{ fontSize:13, color:'var(--red)' }}>{genError}</p>
          </div>
        </div>
      )}

      {/* ── État vide ──────────────────────────────────────────────────── */}
      {!generating && !planning && step === null && (
        <div className="pla-body">
          <div className="pla-gen-card" style={{ flexDirection:'column', gap:12, alignItems:'flex-start' }}>
            <p style={{ fontSize:14, color:'#A09080' }}>Aucun planning pour aujourd'hui.</p>
            <button className="btn btn-primary btn-sm" onClick={() => setStep('heures')}>Créer mon planning</button>
          </div>
        </div>
      )}

      {/* ══ VUE MAINTENANT ═════════════════════════════════════════════════ */}
      {!generating && planning && !step && viewMode === 'maintenant' && (
        <div className="pla-body">

          {tacheNow ? (
            <>
              {/* ── Grande carte tâche principale ─────────────────────── */}
              <div className="pla-now-card">
                <span className="pla-now-dossier">{tacheNow.titreDossier}</span>
                <h2 className="pla-now-titre">{tacheNow.titreTache}</h2>
                <div className="pla-pills-row">
                  <span className="pla-pill">{formatDuree(tacheNow.dureeMin)}</span>
                  {tacheNow.heureDebut && <span className="pla-pill">{tacheNow.heureDebut}</span>}
                  {tacheNow.echeance && (
                    <span className="pla-pill pla-pill-ech">
                      {new Date(tacheNow.echeance+'T00:00:00').toLocaleDateString('fr-FR',{day:'numeric',month:'short'})}
                    </span>
                  )}
                </div>
                <div className="pla-now-btns">
                  <button className="pla-btn-go"
                    onClick={() => navigate('/focus', { state: { planningDate: today, taches: tachesActiv } })}>
                    Commencer
                  </button>
                  <button className="pla-btn-skip" onClick={handleApres} disabled={tachesActiv.length < 2}>
                    Après
                  </button>
                </div>
              </div>

              {/* ── Section Ensuite ───────────────────────────────────── */}
              {tachesNext.length > 0 && (
                <div className="pla-ensuite">
                  <span className="pla-ensuite-label">Ensuite</span>
                  {tachesNext.map(tp => {
                    const accent = taskAccent(tp)
                    return (
                      <div key={tp.tacheId} className="pla-ensuite-row"
                        onClick={() => tp.dossierId && setSheetDossierId(tp.dossierId)}>
                        <div className="pla-vline" style={{ background: accent }} />
                        <div style={{ flex:1, minWidth:0 }}>
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
                <p className="pla-done-txt">
                  {tachesTermin.length} tâche{tachesTermin.length>1?'s':''} terminée{tachesTermin.length>1?'s':''} ✓
                </p>
              )}
            </>
          ) : (
            <div className="empty-state">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--border)" strokeWidth="1.5" strokeLinecap="round" style={{ marginBottom:14 }}>
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

      {/* ══ VUE CALENDRIER ════════════════════════════════════════════════ */}
      {!generating && planning && !step && viewMode === 'calendrier' && (
        <div className="pla-body">

          {/* Sélecteur de jours */}
          <div className="pla-days">
            {weekDays.map((d,i) => {
              const isToday = isSameDay(d, new Date())
              return (
                <div key={i} className={`pla-day${isToday?' pla-day-today':''}`}
                  onClick={() => isToday && setViewMode('maintenant')}>
                  <span className="pla-day-dow">{JOURS_SHORT[d.getDay()]}</span>
                  <span className="pla-day-num">{d.getDate()}</span>
                </div>
              )
            })}
          </div>

          {/* Timeline */}
          <div className="pla-cal-list">
            {planning.tachesPlanifiees
              .slice().sort((a,b) => (a.heureDebut||'').localeCompare(b.heureDebut||''))
              .map(tp => {
                const accent = taskAccent(tp)
                return (
                  <div key={tp.tacheId} className="pla-cal-row"
                    onClick={() => tp.dossierId && setSheetDossierId(tp.dossierId)}>
                    <div className="pla-cal-times">
                      <span className="pla-cal-t1">{tp.heureDebut}</span>
                      <span className="pla-cal-t2">{tp.heureFin}</span>
                    </div>
                    <div className="pla-cal-block" style={{ borderLeftColor: accent, opacity: tp.done ? 0.45 : 1 }}>
                      <div className="pla-cal-head">
                        <p className="pla-cal-titre" style={{ textDecoration: tp.done?'line-through':'none' }}>
                          {tp.titreTache}
                        </p>
                        <span className="pla-cal-dur">{formatDuree(tp.dureeMin)}</span>
                      </div>
                      <p className="pla-cal-dos">{tp.titreDossier}</p>
                      {tp.done && <span className="pla-cal-done">Fait ✓</span>}
                    </div>
                  </div>
                )
              })}
          </div>

          <button className="pla-cal-back" onClick={() => setViewMode('maintenant')}>
            ← Vue Maintenant
          </button>
        </div>
      )}

      {/* ── Section routines (vue maintenant uniquement) ──────────────── */}
      {!step && viewMode === 'maintenant' && (
        <div className="pla-body pla-routines-bottom">
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
            <span className="label" style={{ marginBottom:0 }}>Mes routines</span>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowAddR(true)}>+ Ajouter</button>
          </div>
          {routines.length === 0 ? (
            <p style={{ fontSize:13, color:'#A09080' }}>
              Aucune routine. Ajoutez des tâches récurrentes pour les intégrer automatiquement.
            </p>
          ) : (
            <div className="card" style={{ padding:'4px 12px' }}>
              {[
                { list: routineGroups.daily,  label: 'Quotidiennes' },
                ...JOURS.map((j,i) => ({ list: routineGroups.weekly.filter(r => r.jourSemaine===i), label: j })),
                { list: routineGroups.monthly, label: 'Mensuelles' },
              ].filter(g => g.list.length > 0).map(({ list, label }) => (
                <div key={label}>
                  <p style={{ fontSize:11, fontWeight:700, color:'#A09080', textTransform:'uppercase', letterSpacing:'0.08em', padding:'10px 4px 4px' }}>{label}</p>
                  {list.map(r => (
                    <div key={r.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 4px', borderBottom:'1px solid var(--border)' }}>
                      <div style={{ width:8, height:8, borderRadius:'50%', background:'#6366f1', flexShrink:0 }} />
                      <span style={{ flex:1, fontSize:14, color:'var(--text)' }}>{r.titre}</span>
                      <span style={{ fontSize:12, color:'#A09080', flexShrink:0 }}>{formatDuree(r.dureeMin)}</span>
                      <button className="tache-del" onClick={() => handleDeleteRoutine(r.id)}>×</button>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {showAddR && <ModalAddRoutine onSave={handleAddRoutine} onClose={() => setShowAddR(false)} />}
      {sheetDossierId && <DossierSheet dossierId={sheetDossierId} onClose={() => setSheetDossierId(null)} />}

      {/* ── Validation IA (position:fixed — seul écran superposé) ─────── */}
      {step === 'validation' && proposal && (
        <div className="pla-validation">
          <div className="pla-val-header">
            <button className="pla-val-back" onClick={() => setStep(null)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6"/>
              </svg>
              Annuler
            </button>
            <span style={{ fontSize:15, fontWeight:600, color:'var(--text)' }}>Proposition IA</span>
          </div>
          <div style={{ margin:'12px 16px', padding:'14px 16px', background:'var(--green-light)', border:'1px solid var(--green)', borderRadius:'var(--radius)' }}>
            <div style={{ display:'flex', alignItems:'center', gap:7, marginBottom:8 }}>
              <div style={{ width:7, height:7, borderRadius:'50%', background:'var(--green)', animation:'pla-pulse 2s ease-in-out infinite' }} />
              <p style={{ fontSize:12, fontWeight:700, color:'var(--green)', textTransform:'uppercase', letterSpacing:'0.08em', margin:0 }}>Planning proposé par l'IA</p>
            </div>
            <p style={{ fontSize:13, color:'var(--text)', lineHeight:1.6, margin:0 }}>
              {proposal.raisonnement || 'Planning optimal calculé selon vos priorités du jour.'}
            </p>
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:10, padding:'0 16px', flex:1, overflowY:'auto' }}>
            {propDraft.map(tp => (
              <BlocTache key={tp.tacheId} tp={tp}
                editingId={editingId} dureeDraft={dureeDraft}
                onEditStart={(id, d) => { setEditingId(id); setDureeDraft(String(d)) }}
                onDraftChange={setDureeDraft} onEditSave={handlePropEditSave} />
            ))}
          </div>
          <div style={{ padding:'12px 16px calc(env(safe-area-inset-bottom,0px)+20px)', background:'var(--surface)', borderTop:'1px solid var(--border)', display:'flex', gap:10, flexShrink:0 }}>
            <button className="btn btn-ghost" style={{ flex:1 }} onClick={handleRecalculer} disabled={generating}>
              {generating ? '…' : '↺ Recalculer'}
            </button>
            <button className="btn btn-primary" style={{ flex:2 }} onClick={handleConfirmer} disabled={generating}>
              Confirmer ce planning
            </button>
          </div>
        </div>
      )}

      <style>{CSS}</style>
    </div>
  )
}

/* ══ CSS ══════════════════════════════════════════════════════════════════════ */
const CSS = `
  @keyframes pla-spin  { to { transform: rotate(360deg); } }
  @keyframes pla-pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.4;transform:scale(0.7)} }
  @keyframes pla-shim  { 0%{background-position:-200% 0} 100%{background-position:200% 0} }
  @keyframes pla-fade  { from{opacity:0} to{opacity:1} }

  /* ── Page ────────────────────────────────────────────────────────────── */
  .pla-page { background: #F7F5F0; }

  /* ── Header (toujours visible) ───────────────────────────────────────── */
  .pla-header {
    background: #1C3829;
    padding: 48px 20px 16px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    position: sticky;
    top: 0;
    z-index: 10;
    flex-shrink: 0;
  }
  .pla-hl { display:flex; align-items:center; gap:8px; }
  .pla-hr { display:flex; align-items:center; gap:10px; }
  .pla-back {
    border:none; background:rgba(255,255,255,0.12); color:rgba(255,255,255,0.7);
    width:30px; height:30px; border-radius:50%;
    display:flex; align-items:center; justify-content:center;
    cursor:pointer; flex-shrink:0;
  }
  .pla-logo { display:flex; align-items:center; gap:10px; }
  .pla-logo-circle {
    width:32px; height:32px; border-radius:50%; background:#C4623A;
    display:flex; align-items:center; justify-content:center; flex-shrink:0;
  }
  .pla-logo-mark { color:#fff; font-size:13px; font-weight:800; letter-spacing:-1.5px; line-height:1; }
  .pla-logo-name { color:rgba(255,255,255,0.92); font-size:15px; font-weight:600; }
  .pla-rest { font-size:12px; font-weight:600; color:rgba(255,255,255,0.7); }
  .pla-refresh {
    border:none; background:rgba(255,255,255,0.12); color:rgba(255,255,255,0.7);
    width:32px; height:32px; border-radius:50%;
    display:flex; align-items:center; justify-content:center;
    cursor:pointer; transition:background 0.15s;
  }
  .pla-refresh:hover:not(:disabled) { background:rgba(255,255,255,0.2); }
  .pla-refresh:disabled { opacity:0.35; cursor:default; }

  /* ── Body ────────────────────────────────────────────────────────────── */
  .pla-body {
    padding: 16px 20px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .pla-routines-bottom {
    border-top: 1px solid var(--border);
    padding-top: 20px;
    margin-top: 4px;
  }

  /* ── Étape heures / routines ─────────────────────────────────────────── */
  .pla-step-card {
    background: #fff;
    border-radius: 16px;
    border: 1px solid #DDD8CE;
    padding: 24px 20px;
    box-shadow: 0 1px 4px rgba(42,31,20,0.06);
  }
  .pla-step-title {
    font-size: 20px;
    font-weight: 700;
    color: #2A1F14;
    letter-spacing: -0.4px;
    margin-bottom: 6px;
  }
  .pla-step-sub {
    font-size: 13px;
    color: #A09080;
    margin-bottom: 20px;
    line-height: 1.5;
  }
  .pla-heures-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    margin-top: 4px;
  }
  .pla-heure-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 22px 12px;
    border: 1.5px solid #DDD8CE;
    border-radius: 14px;
    background: #F7F5F0;
    cursor: pointer;
    font-family: inherit;
    transition: border-color 0.15s, background 0.15s, transform 0.12s;
  }
  .pla-heure-btn:hover  { border-color: #1C3829; background: #E8F0EA; }
  .pla-heure-btn:active { transform: scale(0.96); opacity: 0.9; }
  .pla-heure-val { font-size: 22px; font-weight: 700; color: #1C3829; }

  /* Routines step */
  .pla-routine-check {
    display:flex; align-items:center; gap:12px; padding:10px 12px;
    border:1.5px solid #DDD8CE; border-radius:10px; cursor:pointer; transition:border-color 0.15s;
  }
  .pla-routine-check:hover { border-color:#6366f1; background:#eef2ff; }
  .pla-checkbox {
    width:22px; height:22px; border-radius:6px; border:2px solid #DDD8CE;
    display:flex; align-items:center; justify-content:center;
    font-size:12px; color:#fff; flex-shrink:0; transition:all 0.15s;
  }
  .pla-checkbox-on { background:#6366f1; border-color:#6366f1; }
  .pla-add-routine-inline {
    background:#F7F5F0; border:1px solid #DDD8CE; border-radius:10px; padding:12px; margin-top:8px;
  }

  /* ── Spinner / gen card ──────────────────────────────────────────────── */
  .pla-gen-card {
    background:#fff; border:1px solid #DDD8CE; border-radius:14px;
    padding:14px 16px; display:flex; gap:10px; align-items:center;
  }

  /* ══ VUE MAINTENANT ══════════════════════════════════════════════════════ */

  /* Grande carte tâche principale */
  .pla-now-card {
    background: #1C3829;
    border-radius: 16px;
    padding: 22px 20px 20px;
    box-shadow: 0 4px 20px rgba(28,56,41,0.25);
  }
  .pla-now-dossier {
    display:block; font-size:10px; font-weight:700; letter-spacing:2px;
    text-transform:uppercase; color:rgba(255,255,255,0.4); margin-bottom:8px;
  }
  .pla-now-titre {
    font-size:22px; font-weight:700; color:#fff;
    line-height:1.25; letter-spacing:-0.5px; margin-bottom:14px;
  }
  .pla-pills-row { display:flex; gap:6px; flex-wrap:wrap; margin-bottom:18px; }
  .pla-pill {
    padding:4px 10px; background:rgba(255,255,255,0.12); color:rgba(255,255,255,0.8);
    border-radius:20px; font-size:12px; font-weight:500;
  }
  .pla-pill-ech { background:rgba(196,98,58,0.35); color:#FFCCB0; }
  .pla-now-btns { display:flex; gap:8px; }
  .pla-btn-go {
    padding:10px 22px; background:#fff; color:#1C3829; border:none;
    border-radius:8px; font-size:14px; font-weight:700; font-family:inherit;
    cursor:pointer; transition:opacity 0.15s;
  }
  .pla-btn-go:active { opacity:0.85; }
  .pla-btn-skip {
    padding:10px 18px; background:transparent; color:rgba(255,255,255,0.6);
    border:1.5px solid rgba(255,255,255,0.2); border-radius:8px;
    font-size:14px; font-weight:500; font-family:inherit; cursor:pointer;
  }
  .pla-btn-skip:disabled { opacity:0.3; cursor:default; }
  .pla-btn-skip:not(:disabled):active { background:rgba(255,255,255,0.1); }

  /* Section Ensuite */
  .pla-ensuite {
    background:#fff; border-radius:14px; border:1px solid #DDD8CE; overflow:hidden;
  }
  .pla-ensuite-label {
    display:block; font-size:10px; font-weight:700; letter-spacing:1.5px;
    text-transform:uppercase; color:#A09080; padding:12px 14px 8px;
  }
  .pla-ensuite-row {
    display:flex; align-items:center; gap:12px; padding:10px 14px;
    border-top:1px solid #F0EBE3; cursor:pointer; transition:background 0.12s;
  }
  .pla-ensuite-row:active { background:#F7F5F0; }
  .pla-vline { width:3px; height:36px; border-radius:2px; flex-shrink:0; }
  .pla-ensuite-titre {
    display:block; font-size:14px; font-weight:600; color:#2A1F14;
    white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
  }
  .pla-ensuite-meta { font-size:11px; color:#A09080; }
  .pla-ensuite-time { font-size:12px; color:#C0B8A8; flex-shrink:0; font-weight:500; }
  .pla-done-txt { font-size:12px; color:#A09080; text-align:center; }
  .pla-cal-link {
    background:none; border:none; color:#A09080; font-size:13px; font-weight:500;
    font-family:inherit; cursor:pointer; padding:8px 0; text-align:center; width:100%;
  }
  .pla-cal-link:active { color:#2A1F14; }

  /* ══ VUE CALENDRIER ══════════════════════════════════════════════════════ */
  .pla-days {
    display:flex; gap:6px; overflow-x:auto; scrollbar-width:none;
    -webkit-overflow-scrolling:touch; padding-bottom:4px;
  }
  .pla-days::-webkit-scrollbar { display:none; }
  .pla-day {
    display:flex; flex-direction:column; align-items:center; gap:4px;
    padding:8px 12px; border-radius:10px; background:#fff; border:1px solid #DDD8CE;
    cursor:pointer; flex-shrink:0; opacity:0.45;
  }
  .pla-day-today { background:#1C3829; border-color:#1C3829; opacity:1; }
  .pla-day-dow { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:1px; color:#A09080; }
  .pla-day-today .pla-day-dow { color:rgba(255,255,255,0.7); }
  .pla-day-num { font-size:17px; font-weight:700; color:#2A1F14; line-height:1; }
  .pla-day-today .pla-day-num { color:#fff; }

  .pla-cal-list { display:flex; flex-direction:column; gap:8px; }
  .pla-cal-row { display:flex; gap:12px; align-items:stretch; cursor:pointer; }
  .pla-cal-times { display:flex; flex-direction:column; align-items:flex-end; justify-content:space-between; width:42px; flex-shrink:0; padding:4px 0; }
  .pla-cal-t1 { font-size:11px; font-weight:600; color:#2A1F14; line-height:1; }
  .pla-cal-t2 { font-size:10px; color:#C0B8A8; line-height:1; }
  .pla-cal-block {
    flex:1; background:#fff; border-left:3px solid #B5A898; border-radius:0 10px 10px 0;
    padding:10px 12px; box-shadow:0 1px 3px rgba(42,31,20,0.05);
  }
  .pla-cal-head { display:flex; justify-content:space-between; align-items:flex-start; gap:8px; margin-bottom:2px; }
  .pla-cal-titre { font-size:14px; font-weight:600; color:#2A1F14; flex:1; line-height:1.3; margin:0; }
  .pla-cal-dur { font-size:11px; color:#A09080; flex-shrink:0; font-weight:500; }
  .pla-cal-dos { font-size:11px; color:#A09080; margin:0; }
  .pla-cal-done { display:inline-block; margin-top:4px; font-size:10px; font-weight:700; color:#1C3829; background:#E8F0EA; padding:2px 7px; border-radius:10px; }
  .pla-cal-back {
    background:none; border:1.5px dashed #DDD8CE; color:#A09080; border-radius:10px;
    padding:12px; font-size:13px; font-weight:500; font-family:inherit;
    cursor:pointer; width:100%; transition:background 0.15s;
  }
  .pla-cal-back:active { background:#F0EBE3; }

  /* ══ VALIDATION ══════════════════════════════════════════════════════════ */
  .pla-validation {
    position:fixed; inset:0; background:#F7F5F0; z-index:100;
    overflow-y:auto; display:flex; flex-direction:column;
    animation:pla-fade 0.2s ease forwards;
  }
  .pla-val-header {
    display:flex; align-items:center; gap:10px; padding:52px 16px 8px; flex-shrink:0;
  }
  .pla-val-back {
    display:inline-flex; align-items:center; gap:4px; border:none; background:none;
    font-size:14px; color:var(--text-muted); cursor:pointer; padding:6px 0; font-family:inherit;
  }

  /* Blocs validation */
  .bloc-tache { border:1.5px solid; border-radius:var(--radius); padding:14px; margin-bottom:0; }
  .bloc-header { display:flex; align-items:center; gap:6px; margin-bottom:8px; flex-wrap:wrap; }
  .bloc-horaire { font-size:13px; font-weight:700; letter-spacing:0.03em; flex-shrink:0; }
  .bloc-duree-btn { font-size:12px; border:none; background:none; cursor:pointer; padding:2px 6px; border-radius:4px; font-family:inherit; }
  .bloc-duree-input { width:70px; font-size:12px; border:1px solid var(--border); border-radius:4px; padding:2px 6px; font-family:inherit; outline:none; }
  .bloc-badge { margin-left:auto; font-size:10px; font-weight:700; padding:3px 8px; border-radius:20px; text-transform:uppercase; letter-spacing:0.05em; }
  .bloc-titre  { font-size:15px; font-weight:600; color:var(--text); line-height:1.3; margin-bottom:4px; }
  .bloc-dossier { font-size:12px; color:var(--text-muted); margin-bottom:0; }

  /* ── Skeleton ────────────────────────────────────────────────────────── */
  .pla-sk {
    background:linear-gradient(90deg,#DDD8CE 25%,#ede9e2 50%,#DDD8CE 75%);
    background-size:200% 100%; animation:pla-shim 1.4s infinite;
    border-radius:14px; height:140px;
  }
`
