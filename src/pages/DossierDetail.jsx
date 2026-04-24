import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { getEtapesForDossier } from '../services/db'
import EtatBadge from '../components/EtatBadge'
import { haptic } from '../utils/haptic'

// ── Constantes ────────────────────────────────────────────────────────────────
const ETATS = [
  { key: 'actionnable',     label: "À traiter",           desc: 'À traiter maintenant' },
  { key: 'attente_externe', label: "J'attends un retour", desc: "Attente d'un retour tiers" },
  { key: 'bloque',          label: "Bloqué",              desc: 'Obstacle identifié' },
  { key: 'surveille',       label: "À l'œil",             desc: 'À suivre sans urgence' },
]

const ETATS_LABELS = {
  actionnable:     "À traiter",
  attente_externe: "J'attends un retour",
  bloque:          "Bloqué",
  surveille:       "À l'œil",
  clos:            "Terminé",
}

const Q_LABELS = {
  1: 'Urgent',
  2: 'Important',
  3: 'À expédier',
  4: 'Plus tard',
}
const Q_COLORS = { 1: '#C0392B', 2: '#1C3829', 3: '#B45309', 4: '#B5A898' }

const STATUTS_NOTER = [
  { key: 'fait',      label: 'Fait',       color: '#1C3829' },
  { key: 'en_attente', label: 'En attente', color: '#D97706' },
  { key: 'bloque',    label: 'Bloqué',     color: '#C4623A' },
]
const STATUT_LABELS = { fait: 'Fait', en_attente: 'En attente', bloque: 'Bloqué' }

// ── Helpers ───────────────────────────────────────────────────────────────────
function todayISO() { return new Date().toISOString().split('T')[0] }

function formatDate(iso) {
  if (!iso) return null
  return new Date(iso + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}
function formatDateShort(iso) {
  if (!iso) return ''
  return new Date(iso + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}

function daysUntil(iso) {
  if (!iso) return null
  const due   = new Date(iso + 'T00:00:00')
  const today = new Date(); today.setHours(0, 0, 0, 0)
  return Math.ceil((due - today) / 86_400_000)
}

function analyserCauseBlocage(dossier) {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  if (dossier.echeance) {
    const due = new Date(dossier.echeance + 'T00:00:00')
    if (due < today) {
      return { phrase: `Échéance du ${formatDateShort(dossier.echeance)} dépassée — reporter ou clore ?`, action: 'Reporter l\'échéance', actionType: 'echeance' }
    }
  }
  if (dossier.organisme) {
    const days = Math.floor((today - new Date(dossier.updatedAt)) / 86_400_000)
    if (days >= 15) return { phrase: `Aucun retour de ${dossier.organisme} depuis ${days} jours — relancer ?`, action: 'Marquer comme relancé', actionType: 'relancer' }
  }
  const days = Math.floor((today - new Date(dossier.updatedAt)) / 86_400_000)
  if (days >= 14) return { phrase: `Ce dossier n'avance plus depuis ${days} jours — identifier l'obstacle ?`, action: 'Débloquer', actionType: 'debloquer' }
  return { phrase: 'Vous avez signalé un blocage — quelle est la prochaine action possible ?', action: 'Passer en actionnable', actionType: 'manuel' }
}

// ── Champ inline ──────────────────────────────────────────────────────────────
function InlineField({ value, onSave, multiline = false, placeholder = '', style = {}, className = '' }) {
  const [editing, setEditing] = useState(false)
  const [draft,   setDraft]   = useState(value)
  const ref = useRef(null)
  useEffect(() => { setDraft(value) }, [value])
  useEffect(() => { if (editing) ref.current?.focus() }, [editing])
  const commit = () => { setEditing(false); if (draft !== value) onSave(draft) }
  const commonProps = {
    ref, value: draft, onChange: e => setDraft(e.target.value), onBlur: commit,
    onKeyDown: e => { if (!multiline && e.key === 'Enter') { e.preventDefault(); commit() } if (e.key === 'Escape') { setDraft(value); setEditing(false) } },
    style: { ...style, width: '100%' }, className: `inline-input ${className}`, autoComplete: 'off',
  }
  if (!editing) return (
    <div className={`inline-display ${className}`} style={style} onClick={() => setEditing(true)} title="Toucher pour modifier">
      {value || <span style={{ color: '#A09080', fontStyle: 'italic' }}>{placeholder}</span>}
      <span className="inline-edit-icon">✎</span>
    </div>
  )
  return multiline
    ? <textarea {...commonProps} rows={3} className={`input textarea inline-input ${className}`} />
    : <input    {...commonProps} type="text" className={`input inline-input ${className}`} />
}

// ── Page principale ───────────────────────────────────────────────────────────
export default function DossierDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { dossiers, mettreAJourDossier, toggleTache, ajouterTache, supprimerTache,
          supprimerDossier, ajouterEtapeManuelle, supprimerEtape } = useApp()

  const dossier = dossiers.find(d => d.id === id)

  const [etapes,           setEtapes]           = useState([])
  const [activeTab,        setActiveTab]         = useState('taches')
  const [showMenu,         setShowMenu]          = useState(false)
  const [showEtatSheet,    setShowEtatSheet]     = useState(false)
  const [showConfirmClose, setShowConfirmClose]  = useState(false)
  const [showConfirmDel,   setShowConfirmDel]    = useState(false)
  const [showEcheance,     setShowEcheance]      = useState(false)
  const [echeance,         setEcheance]          = useState('')

  // Tâches
  const [showAddTache,   setShowAddTache]   = useState(false)
  const [newTache,       setNewTache]       = useState('')
  const [editingTacheId, setEditingTacheId] = useState(null)
  const [tacheDraft,     setTacheDraft]     = useState('')
  const newTacheRef   = useRef(null)
  const tacheInputRef = useRef(null)

  // Étapes
  const [showAddEtape,   setShowAddEtape]   = useState(false)
  const [newEtapeDate,   setNewEtapeDate]   = useState('')
  const [newEtapeTexte,  setNewEtapeTexte]  = useState('')
  const [newEtapeStatut, setNewEtapeStatut] = useState('fait')

  const reloadEtapes = () => getEtapesForDossier(id).then(setEtapes)

  useEffect(() => {
    if (dossier) {
      setEcheance(dossier.echeance || '')
      reloadEtapes()
    }
  }, [dossier, id]) // eslint-disable-line

  useEffect(() => {
    if (showAddTache) newTacheRef.current?.focus()
  }, [showAddTache])

  useEffect(() => {
    if (editingTacheId) tacheInputRef.current?.focus()
  }, [editingTacheId])

  // ── Dossier introuvable ───────────────────────────────────────────────────
  if (!dossier) return (
    <div className="page">
      <div className="empty-state">
        <p className="empty-title">Dossier introuvable</p>
        <button className="btn btn-ghost" style={{ marginTop: 12 }} onClick={() => navigate(-1)}>← Retour</button>
      </div>
    </div>
  )

  const isClos      = dossier.etat === 'clos'
  const tachesDone  = dossier.taches.filter(t => t.done).length
  const total       = dossier.taches.length
  const pct         = total > 0 ? (tachesDone / total) * 100 : 0
  const blocageCause = dossier.etat === 'bloque' && !isClos ? analyserCauseBlocage(dossier) : null
  const joursEch    = daysUntil(dossier.echeance)
  const echProche   = joursEch !== null && joursEch <= 7

  const save = (updates) => mettreAJourDossier(id, updates).then(() => reloadEtapes())

  const handleEtatChange = async (etat) => { haptic('light'); await save({ etat }); setShowEtatSheet(false) }
  const handleClose      = async ()      => { haptic('success'); await save({ etat: 'clos' }); setShowConfirmClose(false); navigate('/dossiers') }
  const handleDelete     = async ()      => { haptic('medium'); await supprimerDossier(id); navigate('/dossiers') }
  const handleEcheanceSave = async ()    => { await save({ echeance: echeance || null }); setShowEcheance(false) }

  const handleBlocageAction = () => {
    if (!blocageCause) return
    if (blocageCause.actionType === 'echeance') setShowEcheance(true)
    else if (blocageCause.actionType === 'relancer') save({ etat: 'attente_externe' })
    else save({ etat: 'actionnable' })
  }

  const handleAddTache = async (e) => {
    if (e) e.preventDefault()
    if (!newTache.trim()) { setShowAddTache(false); return }
    await ajouterTache(id, newTache.trim())
    setNewTache('')
    newTacheRef.current?.focus()
  }

  const handleTacheEditSave = async () => {
    if (!editingTacheId) return
    const tache = dossier.taches.find(t => t.id === editingTacheId)
    if (tache && tacheDraft.trim() && tacheDraft.trim() !== tache.titre) {
      await mettreAJourDossier(id, { taches: dossier.taches.map(t => t.id === editingTacheId ? { ...t, titre: tacheDraft.trim() } : t) })
    }
    setEditingTacheId(null); setTacheDraft('')
  }

  const handleAddEtape = async () => {
    if (!newEtapeTexte.trim()) return
    haptic('light')
    await ajouterEtapeManuelle(id, {
      date:   newEtapeDate || todayISO(),
      texte:  newEtapeTexte.trim(),
      statut: newEtapeStatut,
    })
    setShowAddEtape(false); setNewEtapeTexte(''); setNewEtapeDate(''); setNewEtapeStatut('fait')
    await reloadEtapes()
  }

  const handleDeleteEtape = async (etapeId) => {
    haptic('medium'); await supprimerEtape(etapeId); await reloadEtapes()
  }

  // ── Rendu ─────────────────────────────────────────────────────────────────
  return (
    <div className="page dd-page">

      {/* ── Header vert ──────────────────────────────────────────────── */}
      <header className="dd-header">
        <div className="dd-header-row1">
          <button className="dd-back" onClick={() => navigate(-1)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
            Retour
          </button>

          {/* Menu ··· */}
          {!isClos && (
            <div className="dd-menu-wrap">
              <button className="dd-menu-btn" onClick={() => setShowMenu(v => !v)}>···</button>
              {showMenu && (
                <>
                  <div className="dd-menu-backdrop" onClick={() => setShowMenu(false)} />
                  <div className="dd-menu-card">
                    <button className="dd-menu-item" onClick={() => { setShowMenu(false); setShowConfirmClose(true) }} onTouchEnd={() => { setShowMenu(false); setShowConfirmClose(true) }}>
                      Clôturer ce dossier
                    </button>
                    <div className="dd-menu-divider" />
                    <button className="dd-menu-item dd-menu-item-danger" onClick={() => { setShowMenu(false); setShowConfirmDel(true) }} onTouchEnd={() => { setShowMenu(false); setShowConfirmDel(true) }}>
                      Supprimer définitivement
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        <h1 className="dd-titre">{dossier.titre}</h1>
        {dossier.organisme && <p className="dd-org">{dossier.organisme}</p>}

        {/* Pills onglets */}
        <div className="dd-tabs">
          <button className={`dd-tab${activeTab === 'taches' ? ' dd-tab-active' : ''}`} onClick={() => setActiveTab('taches')}>
            Tâches {total > 0 && <span className="dd-tab-badge">{tachesDone}/{total}</span>}
          </button>
          <button className={`dd-tab${activeTab === 'detail' ? ' dd-tab-active' : ''}`} onClick={() => setActiveTab('detail')}>
            Détail
          </button>
        </div>
      </header>

      {/* ══ ONGLET TÂCHES ════════════════════════════════════════════════ */}
      {activeTab === 'taches' && (
        <div className="dd-body">

          {/* Barre de progression 3px */}
          {total > 0 && (
            <div className="dd-prog-section">
              <div className="dd-prog-track">
                <div className="dd-prog-fill" style={{ width: `${pct}%` }} />
              </div>
              <div className="dd-prog-counter">
                <span className="dd-prog-done">{tachesDone}</span>
                <span className="dd-prog-sep"> / </span>
                <span className="dd-prog-total">{total}</span>
              </div>
            </div>
          )}

          {/* Bannière blocage */}
          {blocageCause && (
            <div className="dd-blocage">
              <p className="dd-blocage-phrase">{blocageCause.phrase}</p>
              <button className="dd-blocage-btn" onClick={handleBlocageAction} onTouchEnd={handleBlocageAction}>{blocageCause.action}</button>
            </div>
          )}

          {/* Suggestion clôture */}
          {!isClos && total > 0 && tachesDone === total && (
            <div className="dd-cloture-hint">
              <span>Toutes les tâches sont faites !</span>
              <button className="dd-cloture-hint-btn" onClick={() => setShowConfirmClose(true)} onTouchEnd={() => setShowConfirmClose(true)}>Clôturer →</button>
            </div>
          )}

          {/* Liste des tâches */}
          <div className="dd-taches-list">
            {dossier.taches.length === 0 && !showAddTache && (
              <p className="dd-empty-taches">Aucune tâche — commencez par en ajouter une.</p>
            )}
            {dossier.taches.map(tache => (
              <div key={tache.id} className="dd-tache-row">
                {/* Case à cocher carrée arrondie */}
                <button
                  className={`dd-check${tache.done ? ' dd-check-done' : ''}`}
                  onClick={() => { if (!isClos) { haptic('light'); toggleTache(id, tache.id) } }}
                  aria-label={tache.done ? 'Décocher' : 'Cocher'}
                >
                  {tache.done && (
                    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="2 6 5 9 10 3"/>
                    </svg>
                  )}
                </button>

                {/* Titre éditable inline */}
                {editingTacheId === tache.id ? (
                  <input
                    ref={tacheInputRef}
                    className="dd-tache-edit"
                    value={tacheDraft}
                    onChange={e => setTacheDraft(e.target.value)}
                    onBlur={handleTacheEditSave}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleTacheEditSave() } if (e.key === 'Escape') setEditingTacheId(null) }}
                  />
                ) : (
                  <span
                    className={`dd-tache-titre${tache.done ? ' dd-tache-done' : ''}`}
                    onClick={() => !isClos && !tache.done && (setEditingTacheId(tache.id), setTacheDraft(tache.titre))}
                    style={{ cursor: !isClos && !tache.done ? 'text' : 'default' }}
                  >
                    {tache.titre}
                  </span>
                )}

                {!isClos && (
                  <button className="dd-tache-del" onClick={() => supprimerTache(id, tache.id)} aria-label="Supprimer">×</button>
                )}
              </div>
            ))}

            {/* Input ajout inline */}
            {!isClos && showAddTache && (
              <form onSubmit={handleAddTache} className="dd-tache-row">
                <div className="dd-check" style={{ opacity: 0.25 }} />
                <input
                  ref={newTacheRef}
                  className="dd-add-input"
                  placeholder="Nouvelle tâche…"
                  value={newTache}
                  onChange={e => setNewTache(e.target.value)}
                  onBlur={() => { handleAddTache(); setShowAddTache(false) }}
                  onKeyDown={e => { if (e.key === 'Escape') { setShowAddTache(false); setNewTache('') } }}
                />
              </form>
            )}
          </div>

          {/* Bouton Ajouter en pointillés */}
          {!isClos && !showAddTache && (
            <button className="dd-add-btn" onClick={() => setShowAddTache(true)} onTouchEnd={() => setShowAddTache(true)}>
              + Ajouter une tâche
            </button>
          )}
        </div>
      )}

      {/* ══ ONGLET DÉTAIL ════════════════════════════════════════════════ */}
      {activeTab === 'detail' && (
        <div className="dd-body">

          {/* Section Description */}
          <div className="dd-section">
            <div className="dd-vline dd-vline-green" />
            <div className="dd-section-body">
              <span className="dd-section-label">Description</span>
              {isClos ? (
                <p className="dd-description-text">
                  {dossier.description || <em style={{ color: '#A09080' }}>Aucune description</em>}
                </p>
              ) : (
                <InlineField
                  value={dossier.description || ''}
                  onSave={v => save({ description: v })}
                  multiline
                  placeholder="Ajouter une description…"
                  style={{ fontSize: 14, color: '#5A4A3A', lineHeight: 1.6 }}
                />
              )}
            </div>
          </div>

          {/* Section Infos */}
          <div className="dd-section">
            <div className="dd-vline dd-vline-sand" />
            <div className="dd-section-body">
              <span className="dd-section-label">Infos</span>

              {/* Titre éditable */}
              <div className="dd-info-row">
                <span className="dd-info-key">Titre</span>
                {isClos ? (
                  <span className="dd-info-val">{dossier.titre}</span>
                ) : (
                  <InlineField
                    value={dossier.titre}
                    onSave={v => save({ titre: v })}
                    placeholder="Titre du dossier"
                    style={{ fontSize: 14, color: '#2A1F14', fontWeight: 600, flex: 1 }}
                  />
                )}
              </div>

              {/* Organisme éditable */}
              <div className="dd-info-row">
                <span className="dd-info-key">Organisme</span>
                {isClos ? (
                  <span className="dd-info-val">{dossier.organisme || '—'}</span>
                ) : (
                  <InlineField
                    value={dossier.organisme || ''}
                    onSave={v => save({ organisme: v || null })}
                    placeholder="Ajouter un organisme…"
                    style={{ fontSize: 14, color: '#5A4A3A', flex: 1 }}
                  />
                )}
              </div>

              {/* Échéance */}
              <div className="dd-info-row">
                <span className="dd-info-key">Échéance</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                  <span className="dd-info-val" style={{ color: echProche ? '#C4623A' : undefined, fontWeight: echProche ? 600 : undefined }}>
                    {dossier.echeance
                      ? <>
                          {formatDate(dossier.echeance)}
                          {echProche && joursEch === 0 && <span className="dd-ech-badge">Aujourd'hui !</span>}
                          {echProche && joursEch > 0  && <span className="dd-ech-badge">J−{joursEch}</span>}
                        </>
                      : <span style={{ color: '#A09080' }}>Aucune</span>
                    }
                  </span>
                  {!isClos && (
                    <button className="dd-info-edit-btn" onClick={() => setShowEcheance(true)}>
                      {dossier.echeance ? 'Modifier' : 'Ajouter'}
                    </button>
                  )}
                </div>
              </div>

              {/* Priorité */}
              <div className="dd-info-row">
                <span className="dd-info-key">Priorité</span>
                <span className="dd-info-val dd-quadrant-badge" style={{ color: Q_COLORS[dossier.quadrant] }}>
                  ● {Q_LABELS[dossier.quadrant] || `Q${dossier.quadrant}`}
                </span>
              </div>

              {/* État */}
              <div className="dd-info-row">
                <span className="dd-info-key">État</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className={`dd-etat-pill dd-etat-${dossier.etat}`}>{ETATS_LABELS[dossier.etat] || dossier.etat}</span>
                  {!isClos && (
                    <button className="dd-info-edit-btn" onClick={() => setShowEtatSheet(true)} onTouchEnd={() => setShowEtatSheet(true)}>Changer</button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Section Ce qui s'est passé */}
          <div className="dd-section">
            <div className="dd-vline dd-vline-sand" />
            <div className="dd-section-body">
              <div className="dd-section-header-row">
                <span className="dd-section-label">Ce qui s'est passé</span>
              </div>

              {/* Timeline */}
              {etapes.length > 0 && (
                <div className="dd-timeline">
                  {etapes.map((etape, idx) => {
                    const sc = STATUTS_NOTER.find(s => s.key === etape.statut)
                    return (
                      <div key={etape.id} className="dd-etape-row">
                        <div className="dd-etape-track">
                          <span className="dd-etape-dot" style={{ background: sc?.color ?? '#B5A898' }} />
                          {idx < etapes.length - 1 && <div className="dd-etape-line" />}
                        </div>
                        <div className="dd-etape-body">
                          <div className="dd-etape-meta">
                            <span className="dd-etape-date">{formatDateShort(etape.date)}</span>
                            <span className="dd-etape-statut" style={{ color: sc?.color ?? '#B5A898' }}>{STATUT_LABELS[etape.statut]}</span>
                            {etape.source === 'auto' && <span className="dd-etape-auto">auto</span>}
                          </div>
                          <p className="dd-etape-texte">{etape.texte}</p>
                        </div>
                        {!isClos && etape.source === 'manuel' && (
                          <button className="dd-tache-del" onClick={() => handleDeleteEtape(etape.id)} aria-label="Supprimer">×</button>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Formulaire inline Noter */}
              {!isClos && showAddEtape && (
                <div className="dd-noter-form">
                  <textarea
                    className="dd-noter-textarea"
                    placeholder="Décrivez ce qui s'est passé… (lettre envoyée, réponse reçue…)"
                    value={newEtapeTexte}
                    onChange={e => setNewEtapeTexte(e.target.value)}
                    rows={3}
                    autoFocus
                  />
                  <div className="dd-statut-row">
                    {STATUTS_NOTER.map(s => (
                      <button
                        key={s.key}
                        className={`dd-statut-pill${newEtapeStatut === s.key ? ' dd-statut-active' : ''}`}
                        onClick={() => setNewEtapeStatut(s.key)}
                        type="button"
                      >
                        <span className="dd-statut-dot" style={{ background: s.color }} />
                        {s.label}
                      </button>
                    ))}
                  </div>
                  <div className="dd-noter-actions">
                    <button className="dd-noter-cancel" onClick={() => { setShowAddEtape(false); setNewEtapeTexte('') }}>Annuler</button>
                    <button className="dd-noter-save" disabled={!newEtapeTexte.trim()} onClick={handleAddEtape}>Enregistrer</button>
                  </div>
                </div>
              )}

              {/* Bouton Noter en pointillés */}
              {!isClos && !showAddEtape && (
                <button
                  className="dd-add-btn"
                  style={{ marginTop: etapes.length > 0 ? 10 : 4 }}
                  onClick={() => { setNewEtapeDate(todayISO()); setShowAddEtape(true) }}
                >
                  + Noter ce qui s'est passé
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Overlays ─────────────────────────────────────────────────────── */}

      {/* Sheet : changement état */}
      {showEtatSheet && (
        <div className="overlay" onClick={() => setShowEtatSheet(false)}>
          <div className="sheet" onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>Changer l'état</h3>
            {ETATS.map(e => (
              <button key={e.key} className={`etat-option ${dossier.etat === e.key ? 'etat-option-active' : ''}`} onClick={() => handleEtatChange(e.key)}>
                <EtatBadge etat={e.key} />
                <span style={{ fontSize: 13, color: '#A09080' }}>{e.desc}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Sheet : confirmer clôture */}
      {showConfirmClose && (
        <div className="overlay" onClick={() => setShowConfirmClose(false)}>
          <div className="sheet" onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Clôturer ce dossier ?</h3>
            <p style={{ fontSize: 14, color: '#A09080', marginBottom: 20, lineHeight: 1.5 }}>
              Le dossier sera archivé. Vous pourrez le consulter dans les dossiers clôturés.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setShowConfirmClose(false)}>Annuler</button>
              <button className="btn btn-primary" style={{ flex: 2 }} onClick={handleClose} onTouchEnd={handleClose}>Confirmer</button>
            </div>
          </div>
        </div>
      )}

      {/* Sheet : confirmer suppression */}
      {showConfirmDel && (
        <div className="overlay" onClick={() => setShowConfirmDel(false)}>
          <div className="sheet" onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Supprimer ce dossier ?</h3>
            <p style={{ fontSize: 14, color: '#A09080', marginBottom: 20, lineHeight: 1.5 }}>
              Action irréversible. Toutes les données seront effacées définitivement.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setShowConfirmDel(false)}>Annuler</button>
              <button className="btn" style={{ flex: 2, background: '#C4623A', color: '#fff', borderRadius: 'var(--radius)', padding: '12px', fontWeight: 600, border: 'none', cursor: 'pointer' }} onClick={handleDelete} onTouchEnd={handleDelete}>
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sheet : échéance */}
      {showEcheance && (
        <div className="overlay" onClick={() => setShowEcheance(false)}>
          <div className="sheet" onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>Définir une échéance</h3>
            <input type="date" className="input" value={echeance} onChange={e => setEcheance(e.target.value)} style={{ marginBottom: 16 }} />
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => { setEcheance(''); handleEcheanceSave() }}>Supprimer</button>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleEcheanceSave}>Confirmer</button>
            </div>
          </div>
        </div>
      )}

      <style>{CSS}</style>
    </div>
  )
}

/* ══ CSS ══════════════════════════════════════════════════════════════════════ */
const CSS = `
  /* ── Page ────────────────────────────────────────────────────────────────── */
  .dd-page { background: #F7F5F0; }

  /* ── Header vert ─────────────────────────────────────────────────────────── */
  .dd-header {
    background: #1C3829;
    padding: 48px 20px 0;
    position: sticky; top: 0; z-index: 10;
    flex-shrink: 0;
  }
  .dd-header-row1 {
    display: flex; align-items: center; justify-content: space-between;
    margin-bottom: 12px;
  }
  .dd-back {
    display: inline-flex; align-items: center; gap: 5px;
    border: none; background: none; padding: 4px 0;
    font-size: 14px; font-weight: 500; color: rgba(255,255,255,0.75);
    cursor: pointer; font-family: inherit; transition: color 0.15s;
  }
  .dd-back:active { color: #fff; }

  .dd-titre {
    font-size: 20px; font-weight: 700; color: #fff;
    line-height: 1.25; letter-spacing: -0.4px; margin-bottom: 3px;
  }
  .dd-org {
    font-size: 13px; color: rgba(255,255,255,0.55);
    margin-bottom: 14px; line-height: 1.4;
  }

  /* Pills tabs */
  .dd-tabs {
    display: flex; gap: 6px; padding-bottom: 0;
  }
  .dd-tab {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 7px 16px; border-radius: 20px 20px 0 0;
    border: none; background: rgba(255,255,255,0.12);
    color: rgba(255,255,255,0.55); font-size: 13px; font-weight: 600;
    font-family: inherit; cursor: pointer; transition: all 0.15s;
    letter-spacing: 0.01em;
  }
  .dd-tab:active { opacity: 0.8; }
  .dd-tab-active { background: #F7F5F0; color: #1C3829; }
  .dd-tab-badge {
    font-size: 10px; font-weight: 700;
    background: rgba(255,255,255,0.2); color: rgba(255,255,255,0.8);
    border-radius: 10px; padding: 1px 6px; line-height: 1.5;
  }
  .dd-tab-active .dd-tab-badge { background: #1C3829; color: #fff; }

  /* ── Menu ··· ────────────────────────────────────────────────────────────── */
  .dd-menu-wrap { position: relative; }
  .dd-menu-btn {
    border: none; background: rgba(255,255,255,0.12); color: rgba(255,255,255,0.8);
    border-radius: 8px; padding: 4px 10px; font-size: 18px; cursor: pointer;
    font-family: inherit; letter-spacing: 1px; line-height: 1;
    transition: background 0.15s;
  }
  .dd-menu-btn:active { background: rgba(255,255,255,0.22); }
  .dd-menu-backdrop {
    position: fixed; inset: 0; z-index: 49;
  }
  .dd-menu-card {
    position: absolute; top: calc(100% + 8px); right: 0; z-index: 50;
    background: #fff; border-radius: 12px;
    box-shadow: 0 6px 28px rgba(0,0,0,0.15);
    min-width: 220px; overflow: hidden;
    border: 1px solid #DDD8CE;
  }
  .dd-menu-item {
    display: block; width: 100%; padding: 14px 18px;
    text-align: left; border: none; background: none;
    font-size: 15px; font-family: inherit; cursor: pointer; color: #2A1F14;
    transition: background 0.12s;
  }
  .dd-menu-item:active { background: #F7F5F0; }
  .dd-menu-item-danger { color: #C4623A; }
  .dd-menu-divider { height: 1px; background: #F0EBE3; margin: 0 12px; }

  /* ── Body commun ─────────────────────────────────────────────────────────── */
  .dd-body {
    padding: 20px 20px 32px;
    display: flex; flex-direction: column; gap: 0;
  }

  /* ── Onglet Tâches ───────────────────────────────────────────────────────── */

  /* Barre de progression */
  .dd-prog-section { margin-bottom: 16px; }
  .dd-prog-track {
    height: 3px; background: #DDD8CE; border-radius: 2px; overflow: hidden; margin-bottom: 8px;
  }
  .dd-prog-fill {
    height: 100%; background: #1C3829; border-radius: 2px;
    transition: width 0.4s ease;
  }
  .dd-prog-counter {
    font-size: 12px; text-align: right;
  }
  .dd-prog-done  { font-weight: 700; color: #1C3829; }
  .dd-prog-sep   { color: #C0B8A8; }
  .dd-prog-total { color: #A09080; }

  /* Bannière blocage */
  .dd-blocage {
    background: #FEF2F2; border: 1px solid #C0392B; border-radius: 12px;
    padding: 12px 14px; margin-bottom: 14px;
    display: flex; align-items: flex-start; flex-direction: column; gap: 8px;
  }
  .dd-blocage-phrase { font-size: 13px; color: #2A1F14; line-height: 1.5; margin: 0; }
  .dd-blocage-btn {
    background: #C0392B; color: #fff; border: none; border-radius: 8px;
    padding: 6px 14px; font-size: 12px; font-weight: 600; font-family: inherit;
    cursor: pointer; align-self: flex-start;
  }

  /* Suggestion clôture */
  .dd-cloture-hint {
    display: flex; align-items: center; justify-content: space-between;
    background: #E8F0EA; border-radius: 10px; padding: 10px 14px;
    margin-bottom: 14px; font-size: 13px; color: #1C3829; font-weight: 500;
  }
  .dd-cloture-hint-btn {
    background: #1C3829; color: #fff; border: none; border-radius: 7px;
    padding: 5px 12px; font-size: 12px; font-weight: 600; font-family: inherit;
    cursor: pointer;
  }

  /* Liste des tâches */
  .dd-taches-list { display: flex; flex-direction: column; }
  .dd-tache-row {
    display: flex; align-items: center; gap: 12px;
    padding: 12px 0; border-bottom: 1px solid #F0EBE3; min-height: 44px;
  }
  .dd-tache-row:last-child { border-bottom: none; }

  /* Case à cocher carrée arrondie 5px */
  .dd-check {
    width: 22px; height: 22px; border-radius: 5px;
    border: 2px solid #DDD8CE; background: transparent;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0; cursor: pointer; transition: all 0.15s;
    min-width: 22px;
  }
  .dd-check-done { background: #1C3829; border-color: #1C3829; }
  .dd-check:active { transform: scale(0.9); }

  .dd-tache-titre {
    flex: 1; font-size: 14px; color: #2A1F14; line-height: 1.4;
  }
  .dd-tache-done {
    text-decoration: line-through; color: #A09080;
  }
  .dd-tache-edit {
    flex: 1; border: none; border-bottom: 1.5px solid #1C3829; outline: none;
    font-size: 14px; color: #2A1F14; background: transparent;
    font-family: inherit; padding: 2px 4px;
  }
  .dd-tache-del {
    border: none; background: none; color: #A09080; font-size: 20px;
    padding: 0 4px; cursor: pointer; opacity: 0.4; transition: opacity 0.15s;
    min-width: 28px; min-height: 28px; display: flex; align-items: center; justify-content: center;
  }
  .dd-tache-del:active { opacity: 1; }

  .dd-add-input {
    flex: 1; border: none; outline: none; font-size: 14px;
    color: #2A1F14; background: transparent; font-family: inherit;
  }
  .dd-add-input::placeholder { color: #C0B8A8; }
  .dd-empty-taches { font-size: 14px; color: #A09080; padding: 16px 0; text-align: center; }

  /* Bouton Ajouter en pointillés */
  .dd-add-btn {
    width: 100%; margin-top: 12px;
    padding: 13px; background: transparent;
    border: 1.5px dashed #DDD8CE; border-radius: 10px;
    color: #A09080; font-size: 13px; font-weight: 500;
    font-family: inherit; cursor: pointer; text-align: center;
    transition: background 0.15s, color 0.15s;
  }
  .dd-add-btn:active { background: #F0EBE3; color: #2A1F14; }

  /* ── Onglet Détail ───────────────────────────────────────────────────────── */
  .dd-section {
    display: flex; gap: 14px; padding: 0 0 24px;
  }
  .dd-vline {
    width: 3px; border-radius: 2px; flex-shrink: 0;
    align-self: stretch; min-height: 24px; margin-top: 3px;
  }
  .dd-vline-green { background: #1C3829; }
  .dd-vline-sand  { background: #B5A898; }
  .dd-section-body { flex: 1; min-width: 0; }
  .dd-section-header-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
  .dd-section-label {
    display: block; font-size: 10px; font-weight: 700;
    text-transform: uppercase; letter-spacing: 2px; color: #A09080;
    margin-bottom: 10px; line-height: 1;
  }
  .dd-description-text { font-size: 14px; color: #5A4A3A; line-height: 1.6; margin: 0; }

  /* Infos rows */
  .dd-info-row {
    display: flex; align-items: baseline; gap: 12px;
    padding: 8px 0; border-bottom: 1px solid #F0EBE3;
  }
  .dd-info-row:last-child { border-bottom: none; }
  .dd-info-key {
    font-size: 11px; font-weight: 600; color: #A09080;
    text-transform: uppercase; letter-spacing: 0.08em;
    flex-shrink: 0; width: 80px;
  }
  .dd-info-val { font-size: 14px; color: #2A1F14; flex: 1; }
  .dd-info-edit-btn {
    border: none; background: none; color: #A09080; font-size: 12px;
    font-family: inherit; cursor: pointer; padding: 0;
    text-decoration: underline; text-decoration-color: #DDD8CE;
    flex-shrink: 0; transition: color 0.15s;
  }
  .dd-info-edit-btn:active { color: #2A1F14; }
  .dd-ech-badge {
    display: inline-block; margin-left: 8px;
    background: #FFF0E8; color: #C4623A; font-size: 10px;
    font-weight: 700; padding: 2px 7px; border-radius: 20px; letter-spacing: 0.03em;
  }
  .dd-quadrant-badge { font-size: 13px; font-weight: 500; }
  .dd-etat-pill {
    display: inline-block; font-size: 12px; font-weight: 600;
    padding: 3px 10px; border-radius: 20px;
  }
  .dd-etat-actionnable     { background: #E8F0EA; color: #1C3829; }
  .dd-etat-attente_externe { background: #FFF8EC; color: #B45309; }
  .dd-etat-bloque          { background: #FEF2F2; color: #C0392B; }
  .dd-etat-surveille       { background: #F5F3EE; color: #7A6A5A; }
  .dd-etat-clos            { background: #F5F3EE; color: #A09080; }

  /* Timeline */
  .dd-timeline { margin-bottom: 4px; }
  .dd-etape-row {
    display: flex; align-items: flex-start; gap: 10px; min-height: 44px;
  }
  .dd-etape-track {
    display: flex; flex-direction: column; align-items: center;
    flex-shrink: 0; width: 16px; padding-top: 4px;
  }
  .dd-etape-dot {
    width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0;
  }
  .dd-etape-line {
    flex: 1; width: 2px; background: #DDD8CE; margin-top: 4px; min-height: 16px;
  }
  .dd-etape-body { flex: 1; padding-bottom: 12px; }
  .dd-etape-meta { display: flex; align-items: center; gap: 6px; margin-bottom: 2px; flex-wrap: wrap; }
  .dd-etape-date { font-size: 11px; color: #A09080; font-weight: 500; }
  .dd-etape-statut { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; }
  .dd-etape-auto {
    font-size: 10px; color: #A09080; background: #F0EBE3;
    padding: 1px 6px; border-radius: 20px; font-style: italic;
  }
  .dd-etape-texte { font-size: 14px; color: #2A1F14; line-height: 1.45; margin: 0; }

  /* Formulaire Noter */
  .dd-noter-form {
    background: #fff; border: 1px solid #DDD8CE; border-radius: 12px;
    padding: 14px; margin-top: 4px; margin-bottom: 4px;
    display: flex; flex-direction: column; gap: 10px;
  }
  .dd-noter-textarea {
    width: 100%; border: 1.5px solid #DDD8CE; border-radius: 8px;
    padding: 10px 12px; font-size: 14px; font-family: inherit;
    color: #2A1F14; background: #F7F5F0; resize: none; outline: none;
    line-height: 1.5; transition: border-color 0.15s;
  }
  .dd-noter-textarea:focus { border-color: #1C3829; }
  .dd-noter-textarea::placeholder { color: #C0B8A8; }
  .dd-statut-row { display: flex; gap: 6px; flex-wrap: wrap; }
  .dd-statut-pill {
    display: inline-flex; align-items: center; gap: 5px;
    padding: 5px 12px; border-radius: 20px;
    border: 1.5px solid #DDD8CE; background: transparent;
    font-size: 12px; font-weight: 500; color: #A09080;
    cursor: pointer; font-family: inherit; transition: all 0.15s;
    flex-shrink: 0;
  }
  .dd-statut-pill:active { opacity: 0.8; }
  .dd-statut-active { border-color: #2A1F14; color: #2A1F14; background: #F7F5F0; }
  .dd-statut-dot {
    width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0;
  }
  .dd-noter-actions { display: flex; gap: 8px; justify-content: flex-end; }
  .dd-noter-cancel {
    border: none; background: none; font-size: 13px; color: #A09080;
    cursor: pointer; font-family: inherit; padding: 6px 10px;
    transition: color 0.15s;
  }
  .dd-noter-cancel:active { color: #2A1F14; }
  .dd-noter-save {
    background: #1C3829; color: #fff; border: none; border-radius: 8px;
    padding: 8px 18px; font-size: 13px; font-weight: 600; font-family: inherit;
    cursor: pointer; transition: background 0.15s;
  }
  .dd-noter-save:disabled { opacity: 0.4; cursor: default; }
  .dd-noter-save:not(:disabled):active { background: #152e1f; }

  /* ── inline-display (InlineField) ────────────────────────────────────────── */
  .inline-display {
    position: relative; cursor: text; padding: 2px 22px 2px 0;
    border-radius: 4px; transition: background 0.12s; min-height: 22px;
  }
  .inline-display:hover { background: #F0EBE3; }
  .inline-edit-icon {
    position: absolute; right: 4px; top: 50%; transform: translateY(-50%);
    font-size: 10px; color: #A09080; opacity: 0; transition: opacity 0.12s;
  }
  .inline-display:hover .inline-edit-icon { opacity: 1; }

  /* Etat option (sheet) */
  .etat-option {
    width: 100%; display: flex; align-items: center; gap: 12px; padding: 12px;
    border: 1.5px solid #DDD8CE; border-radius: 10px; background: transparent;
    cursor: pointer; margin-bottom: 8px; transition: border-color 0.15s; font-family: inherit;
  }
  .etat-option:active { background: #F7F5F0; }
  .etat-option-active { border-color: #1C3829; background: #E8F0EA; }
`
