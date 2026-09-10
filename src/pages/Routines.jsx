import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { v4 as uuid } from 'uuid'
import { useApp } from '../context/AppContext'
import { getToutesRoutines, saveRoutine, deleteRoutine } from '../services/db'

// ── Constantes ────────────────────────────────────────────────────────────────
const JOURS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi']

function recurrenceLabel(r) {
  if (r.recurrence === 'daily')   return 'Quotidienne'
  if (r.recurrence === 'weekly')  return r.jourSemaine != null ? `Hebdomadaire · ${JOURS[r.jourSemaine]}` : 'Hebdomadaire'
  if (r.recurrence === 'monthly') return r.jourMois    != null ? `Mensuelle · le ${r.jourMois}`          : 'Mensuelle'
  return ''
}

// ── Icônes ────────────────────────────────────────────────────────────────────
const IconTrash = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6"/>
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
    <path d="M10 11v6M14 11v6"/>
    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
  </svg>
)

// ── Toggle (même rendu que celui de Réglages) ─────────────────────────────────
function Toggle({ on, onToggle, disabled }) {
  return (
    <button
      className={`rtn-toggle${on ? ' rtn-toggle-on' : ''}`}
      onClick={onToggle}
      disabled={disabled}
      aria-label={on ? 'Désactiver la routine' : 'Activer la routine'}
    >
      <span className="rtn-toggle-thumb" />
    </button>
  )
}

// ── Modal ajouter une routine (repris de ModalAddRoutine, Planning.jsx) ───────
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
          <button className="btn btn-primary" style={{ flex:2 }} onClick={save}
            onTouchEnd={(e) => { e.preventDefault(); save() }} disabled={!titre.trim()}>
            Ajouter
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Page Routines ─────────────────────────────────────────────────────────────
export default function Routines() {
  const { authUser } = useApp()
  const navigate = useNavigate()

  const [routines,   setRoutines]   = useState([])
  const [loading,    setLoading]    = useState(true)
  const [erreur,     setErreur]     = useState(null)
  const [showAdd,    setShowAdd]    = useState(false)
  const [aSupprimer, setASupprimer] = useState(null)   // routine en attente de confirmation
  const [busyId,     setBusyId]     = useState(null)   // toggle en cours d'enregistrement

  // Supabase = seule source de vérité : pas de cache localStorage ici
  const charger = useCallback(async () => {
    try {
      setRoutines(await getToutesRoutines(authUser.id))
      setErreur(null)
    } catch {
      setErreur('Impossible de charger les routines. Vérifie ta connexion.')
    } finally {
      setLoading(false)
    }
  }, [authUser])

  useEffect(() => { charger() }, [charger])

  const handleToggle = async (routine) => {
    setBusyId(routine.id)
    try {
      await saveRoutine({ ...routine, actif: !routine.actif }, authUser.id)
      await charger()
    } catch {
      setErreur("La modification n'a pas pu être enregistrée.")
    } finally {
      setBusyId(null)
    }
  }

  const handleDelete = async () => {
    const routine = aSupprimer
    if (!routine) return
    setASupprimer(null)
    try {
      await deleteRoutine(routine.id, authUser.id)
      setRoutines(prev => prev.filter(r => r.id !== routine.id))
    } catch {
      setErreur("La suppression n'a pas pu être effectuée.")
    }
  }

  const handleAdd = async (routine) => {
    setShowAdd(false)
    try {
      await saveRoutine(routine, authUser.id)
      await charger()
    } catch {
      setErreur("La routine n'a pas pu être enregistrée.")
    }
  }

  return (
    <div className="page">
      <style>{rtnCSS}</style>

      <header className="rtn-header">
        <button className="rtn-back" onClick={() => navigate('/reglages')}>← Retour</button>
        <h1 className="rtn-title">Routines</h1>
      </header>

      <div className="section rtn-body">
        {erreur && <p className="rtn-erreur">{erreur}</p>}

        {loading ? (
          <p className="rtn-vide">Chargement…</p>
        ) : routines.length === 0 ? (
          <p className="rtn-vide">Aucune routine pour l'instant.</p>
        ) : (
          <div className="rtn-liste">
            {routines.map(r => (
              <div key={r.id} className={`rtn-card${r.actif ? '' : ' rtn-card-inactive'}`}>
                <div className="rtn-card-body">
                  <p className="rtn-card-titre">{r.titre}</p>
                  <p className="rtn-card-meta">{recurrenceLabel(r)} · {r.dureeMin} min</p>
                </div>
                <Toggle on={r.actif} onToggle={() => handleToggle(r)} disabled={busyId === r.id} />
                <button className="rtn-del" onClick={() => setASupprimer(r)} aria-label="Supprimer la routine">
                  <IconTrash />
                </button>
              </div>
            ))}
          </div>
        )}

        {!loading && (
          <button className="rtn-add" onClick={() => setShowAdd(true)}>+ Nouvelle routine</button>
        )}
      </div>

      {showAdd && (
        <ModalAddRoutine onSave={handleAdd} onClose={() => setShowAdd(false)} />
      )}

      {/* Sheet : confirmer suppression */}
      {aSupprimer && (
        <div className="overlay" onClick={() => setASupprimer(null)}>
          <div className="sheet" onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Supprimer cette routine ?</h3>
            <p style={{ fontSize: 14, color: '#A09080', marginBottom: 20, lineHeight: 1.5 }}>
              « {aSupprimer.titre} » ne sera plus proposée dans ton planning. Cette action est définitive.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setASupprimer(null)}>Annuler</button>
              <button className="btn btn-danger" style={{ flex: 2 }} onClick={handleDelete}
                onTouchEnd={(e) => { e.preventDefault(); handleDelete() }}>Supprimer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────
const rtnCSS = `
  .rtn-header {
    background: #1C3829;
    padding: 16px 20px 22px;
    flex-shrink: 0;
  }
  .rtn-back {
    background: none;
    border: none;
    color: rgba(255,255,255,0.75);
    font-size: 13px;
    font-weight: 600;
    font-family: inherit;
    padding: 4px 0;
    cursor: pointer;
  }
  .rtn-back:active { opacity: 0.6; }
  .rtn-title {
    color: #fff;
    font-size: 22px;
    font-weight: 700;
    letter-spacing: -0.5px;
    margin: 8px 0 0;
  }

  .rtn-body { padding-bottom: 32px; }
  .rtn-liste {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 14px;
  }
  .rtn-card {
    background: #fff;
    border: 0.5px solid #DDD8CE;
    border-radius: 12px;
    padding: 12px 8px 12px 14px;
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .rtn-card-body { flex: 1; min-width: 0; }
  .rtn-card-titre {
    font-size: 14px;
    font-weight: 700;
    color: #2A1F14;
    margin: 0 0 2px;
    overflow-wrap: anywhere;
  }
  .rtn-card-meta {
    font-size: 12px;
    color: #A09080;
    margin: 0;
  }
  .rtn-card-inactive .rtn-card-body { opacity: 0.5; }

  /* Toggle — même rendu que .rgl-toggle (Réglages) */
  .rtn-toggle {
    width: 44px;
    height: 26px;
    border-radius: 13px;
    border: none;
    background: #DDD8CE;
    cursor: pointer;
    padding: 0;
    position: relative;
    transition: background 0.2s;
    flex-shrink: 0;
  }
  .rtn-toggle.rtn-toggle-on { background: #1C3829; }
  .rtn-toggle:disabled { opacity: 0.5; cursor: default; }
  .rtn-toggle-thumb {
    position: absolute;
    top: 3px;
    left: 3px;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 1px 4px rgba(0,0,0,0.2);
    transition: transform 0.2s;
  }
  .rtn-toggle-on .rtn-toggle-thumb { transform: translateX(18px); }

  .rtn-del {
    width: 36px;
    height: 36px;
    border: none;
    background: none;
    color: #A09080;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
    cursor: pointer;
    flex-shrink: 0;
    padding: 0;
  }
  .rtn-del:active { background: #F0EBE3; }

  .rtn-vide {
    font-size: 13px;
    color: #A09080;
    text-align: center;
    margin: 24px 0 16px;
  }
  .rtn-erreur {
    font-size: 13px;
    color: #C4623A;
    margin: 0 0 12px;
  }
  .rtn-add {
    width: 100%;
    background: #1C3829;
    color: #fff;
    border: none;
    border-radius: 10px;
    padding: 14px;
    font-size: 14px;
    font-weight: 700;
    font-family: inherit;
    cursor: pointer;
  }
  .rtn-add:active { transform: scale(0.98); }
`
