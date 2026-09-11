import { useState, useEffect, useRef, useCallback } from 'react'
import { useDossier } from '../hooks/useDossier'
import { haptic } from '../utils/haptic'
import { todayISO } from '../utils/date'

// ── Constantes (miroir de DossierDetail) ──────────────────────────────────────
const ETATS = [
  { key: 'actionnable',     label: "À traiter",           cls: 'badge-actionnable' },
  { key: 'attente_externe', label: "J'attends un retour", cls: 'badge-attente'     },
  { key: 'bloque',          label: "Bloqué",              cls: 'badge-bloque'      },
  { key: 'surveille',       label: "À l'œil",             cls: 'badge-surveille'   },
]
const ETAT_LABELS = {
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
  { key: 'fait',       label: 'Fait',       color: '#1C3829' },
  { key: 'en_attente', label: 'En attente', color: '#D97706' },
  { key: 'bloque',     label: 'Bloqué',     color: '#C4623A' },
]

function formatDate(iso) {
  if (!iso) return null
  return new Date(iso + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}
function formatDateShort(iso) {
  if (!iso) return ''
  return new Date(iso + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}

// ── Champ inline éditable ─────────────────────────────────────────────────────
function InlineField({ value, onSave, multiline = false, placeholder = '', style = {} }) {
  const [editing, setEditing] = useState(false)
  const [draft,   setDraft]   = useState(value ?? '')
  const ref = useRef(null)
  useEffect(() => { setDraft(value ?? '') }, [value])
  useEffect(() => { if (editing) ref.current?.focus() }, [editing])
  const commit = () => {
    setEditing(false)
    const t = draft.trim()
    if (t !== (value ?? '').trim()) onSave(t)
  }
  if (!editing) return (
    <div style={{ ...style, cursor: 'text', padding: '2px 0', minHeight: 22 }} onClick={() => setEditing(true)}>
      {value
        ? value
        : <span style={{ color: '#A09080', fontStyle: 'italic', fontSize: 'inherit' }}>{placeholder}</span>
      }
    </div>
  )
  const common = {
    ref, value: draft,
    onChange:  e => setDraft(e.target.value),
    onBlur:    commit,
    onKeyDown: e => {
      if (!multiline && e.key === 'Enter') { e.preventDefault(); commit() }
      if (e.key === 'Escape') { setDraft(value ?? ''); setEditing(false) }
    },
    className: 'input',
    style:     { ...style, width: '100%' },
    autoFocus: true,
  }
  return multiline
    ? <textarea {...common} rows={3} className="input textarea" />
    : <input    {...common} type="text" />
}

// ── DossierSheet ──────────────────────────────────────────────────────────────
export default function DossierSheet({ dossierId, onClose }) {
  const { dossier, etapes, isClos, tachesDone, total, pct,
          toggleTache, ajouterTache, supprimerTache, supprimerDossier,
          ajouterEtapeManuelle, supprimerEtape, reloadEtapes, save } = useDossier(dossierId)

  const [activeTab,    setActiveTab]    = useState('taches')
  const [showEtatMenu, setShowEtatMenu] = useState(false)
  const [showMenu,     setShowMenu]     = useState(false)
  const [confirmType,  setConfirmType]  = useState(null) // null | 'cloturer' | 'supprimer'

  // Ajout tâche inline
  const [showAddTache, setShowAddTache] = useState(false)
  const [newTache,     setNewTache]     = useState('')
  const newTacheRef = useRef(null)

  // Échéance inline
  const [showEcheanceEdit, setShowEcheanceEdit] = useState(false)
  const [echeance,         setEcheance]         = useState('')

  // Noter ce qui s'est passé
  const [showAddEtape,   setShowAddEtape]   = useState(false)
  const [newEtapeDate,   setNewEtapeDate]   = useState('')
  const [newEtapeTexte,  setNewEtapeTexte]  = useState('')
  const [newEtapeStatut, setNewEtapeStatut] = useState('fait')

  // Swipe-to-dismiss
  const sheetRef  = useRef(null)
  const startY    = useRef(0)
  const dragDelta = useRef(0)
  const contentRef = useRef(null)

  useEffect(() => {
    if (showAddTache) newTacheRef.current?.focus()
  }, [showAddTache])

  useEffect(() => {
    if (dossier) setEcheance(dossier.echeance || '')
  }, [dossier])

  useEffect(() => {
    if (confirmType && contentRef.current) contentRef.current.scrollTop = 0
  }, [confirmType])

  // ── Fermeture animée ───────────────────────────────────────────────────────
  const handleClose = useCallback(() => {
    const el = sheetRef.current
    if (el) {
      el.style.transition = 'transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)'
      el.style.transform  = 'translateY(100%)'
      setTimeout(onClose, 290)
    } else {
      onClose()
    }
  }, [onClose])

  // ── Swipe sur le handle ───────────────────────────────────────────────────
  const onTouchStart = (e) => {
    startY.current    = e.touches[0].clientY
    dragDelta.current = 0
    if (sheetRef.current) sheetRef.current.style.transition = 'none'
  }
  const onTouchMove = (e) => {
    const dy = e.touches[0].clientY - startY.current
    dragDelta.current = dy
    if (dy > 0 && sheetRef.current) sheetRef.current.style.transform = `translateY(${dy}px)`
  }
  const onTouchEnd = () => {
    if (dragDelta.current > 90) {
      haptic('light'); handleClose()
    } else if (sheetRef.current) {
      sheetRef.current.style.transition = 'transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)'
      sheetRef.current.style.transform  = 'translateY(0)'
    }
  }

  if (!dossier) { handleClose(); return null }

  const handleAddTache = async (e) => {
    if (e) e.preventDefault()
    if (!newTache.trim()) { setShowAddTache(false); return }
    await ajouterTache(dossierId, newTache.trim())
    setNewTache('')
    newTacheRef.current?.focus()
  }

  const handleCloturer = async () => {
    haptic('success'); await save({ etat: 'clos' }); setConfirmType(null)
  }
  const handleSupprimer = async () => {
    haptic('medium')
    const el = sheetRef.current
    if (el) {
      el.style.transition = 'transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)'
      el.style.transform  = 'translateY(100%)'
      setTimeout(async () => {
        await supprimerDossier(dossierId)
        onClose()
      }, 290)
    } else {
      await supprimerDossier(dossierId)
      onClose()
    }
  }
  const handleEcheanceSave = async () => {
    await save({ echeance: echeance || null }); setShowEcheanceEdit(false)
  }
  const handleAddEtape = async () => {
    if (!newEtapeTexte.trim()) return
    haptic('light')
    await ajouterEtapeManuelle(dossierId, {
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

  return (
    <>
      {/* Backdrop */}
      <div className="dss-backdrop" onClick={handleClose} />

      {/* Panneau */}
      <div ref={sheetRef} className="dss-sheet">

        {/* Poignée de glissement */}
        <div
          className="dss-handle-area"
          style={{ touchAction: 'none', userSelect: 'none' }}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          <div className="dss-handle-pill" />
        </div>

        {/* ── Header vert ── */}
        <div className="dss-header">

          {/* Ligne 1 : badge statut + menu ··· + bouton ✕ */}
          <div className="dss-header-top">
            <div className="dss-badge-wrap">
              <button
                className={`badge ${ETATS.find(e => e.key === dossier.etat)?.cls || 'badge-surveille'}`}
                style={{ cursor: isClos ? 'default' : 'pointer', border: 'none', fontSize: 11 }}
                onClick={() => !isClos && setShowEtatMenu(v => !v)}
              >
                {ETAT_LABELS[dossier.etat] ?? dossier.etat}
                {!isClos && ' ↓'}
              </button>
              {showEtatMenu && (
                <>
                  <div className="dss-menu-backdrop" onClick={() => setShowEtatMenu(false)} />
                  <div className="dss-etat-menu">
                    {ETATS.map(e => (
                      <button
                        key={e.key}
                        className={`dss-etat-opt${dossier.etat === e.key ? ' dss-etat-active' : ''}`}
                        onClick={() => { haptic('light'); save({ etat: e.key }); setShowEtatMenu(false) }}
                      >
                        {e.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            <div className="dss-right-actions">
              <div className="dss-menu-wrap">
                <button className="dss-menu-btn" onClick={() => setShowMenu(v => !v)}>···</button>
                {showMenu && (
                  <>
                    <div className="dss-menu-backdrop" onClick={() => setShowMenu(false)} />
                    <div className="dss-menu-card">
                      {!isClos && (
                        <>
                          <button
                            className="dss-menu-item"
                            onClick={() => { setShowMenu(false); setConfirmType('cloturer') }}
                            onTouchEnd={(e) => { e.preventDefault(); setShowMenu(false); setConfirmType('cloturer') }}
                          >
                            Clôturer ce dossier
                          </button>
                          <div className="dss-menu-divider" />
                        </>
                      )}
                      <button
                        className="dss-menu-item dss-menu-item-danger"
                        onClick={() => { setShowMenu(false); setConfirmType('supprimer') }}
                        onTouchEnd={(e) => { e.preventDefault(); setShowMenu(false); setConfirmType('supprimer') }}
                      >
                        Supprimer définitivement
                      </button>
                    </div>
                  </>
                )}
              </div>

              <button className="dss-close-btn" onClick={handleClose} aria-label="Fermer">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="2.5" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
          </div>

          {/* Titre + organisme */}
          <h2 className="dss-titre">{dossier.titre}</h2>
          {dossier.organisme && <p className="dss-org">{dossier.organisme}</p>}

          {/* Pills Tâches / Détail */}
          <div className="dss-tabs">
            <button
              className={`dss-tab${activeTab === 'taches' ? ' dss-tab-active' : ''}`}
              onClick={() => setActiveTab('taches')}
            >
              Tâches
              {total > 0 && (
                <span className="dss-tab-badge">{tachesDone}/{total}</span>
              )}
            </button>
            <button
              className={`dss-tab${activeTab === 'detail' ? ' dss-tab-active' : ''}`}
              onClick={() => setActiveTab('detail')}
            >
              Détail
            </button>
          </div>
        </div>

        {/* ── Contenu défilable ── */}
        <div className="dss-content" ref={contentRef}>

          {/* Confirmations inline (clôturer / supprimer) */}
          {confirmType === 'cloturer' && (
            <div className="dss-body" style={{ paddingBottom: 0 }}>
              <div className="dss-confirm-inline">
                <p>Clôturer ce dossier ? Il sera archivé.</p>
                <div className="dss-confirm-btns">
                  <button className="btn btn-ghost btn-sm" onClick={() => setConfirmType(null)}>Annuler</button>
                  <button className="btn btn-primary btn-sm" onClick={handleCloturer} onTouchEnd={(e) => { e.preventDefault(); handleCloturer() }}>Confirmer</button>
                </div>
              </div>
            </div>
          )}
          {confirmType === 'supprimer' && (
            <div className="dss-body" style={{ paddingBottom: 0 }}>
              <div className="dss-confirm-inline dss-confirm-danger">
                <p>Supprimer définitivement ? Action irréversible.</p>
                <div className="dss-confirm-btns">
                  <button className="btn btn-ghost btn-sm" onClick={() => setConfirmType(null)}>Annuler</button>
                  <button
                    className="btn btn-sm"
                    style={{ background: '#C4623A', color: '#fff' }}
                    onClick={handleSupprimer}
                    onTouchEnd={(e) => { e.preventDefault(); handleSupprimer() }}
                  >
                    Supprimer
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ══ ONGLET TÂCHES ══ */}
          {activeTab === 'taches' && (
            <div className="dss-body">

              {/* Barre de progression 3px */}
              {total > 0 && (
                <div className="dss-prog-section">
                  <div className="dss-prog-track">
                    <div className="dss-prog-fill" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="dss-prog-counter">
                    <span className="dss-prog-done">{tachesDone}</span>
                    <span className="dss-prog-sep"> / </span>
                    <span className="dss-prog-total">{total}</span>
                  </div>
                </div>
              )}

              {/* Liste des tâches */}
              <div className="dss-taches-list">
                {dossier.taches.length === 0 && !showAddTache && (
                  <p className="dss-empty">Aucune tâche — commencez par en ajouter une.</p>
                )}

                {dossier.taches.map(tache => (
                  <div key={tache.id} className="dss-tache-row">
                    {/* Case à cocher carrée arrondie */}
                    <button
                      className={`dss-check${tache.done ? ' dss-check-done' : ''}`}
                      onClick={() => { if (!isClos) { haptic('light'); toggleTache(dossierId, tache.id) } }}
                      aria-label={tache.done ? 'Décocher' : 'Cocher'}
                    >
                      {tache.done && (
                        <svg width="11" height="11" viewBox="0 0 12 12" fill="none"
                          stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="2 6 5 9 10 3"/>
                        </svg>
                      )}
                    </button>

                    <span className={`dss-tache-titre${tache.done ? ' dss-tache-done' : ''}`}>
                      {tache.titre}
                    </span>

                    {!isClos && (
                      <button
                        className="dss-tache-del"
                        onClick={() => supprimerTache(dossierId, tache.id)}
                        aria-label="Supprimer"
                      >×</button>
                    )}
                  </div>
                ))}

                {/* Input ajout inline */}
                {!isClos && showAddTache && (
                  <form onSubmit={handleAddTache} className="dss-tache-row">
                    <div className="dss-check" style={{ opacity: 0.25 }} />
                    <input
                      ref={newTacheRef}
                      className="dss-add-input"
                      placeholder="Nouvelle tâche…"
                      value={newTache}
                      onChange={e => setNewTache(e.target.value)}
                      onBlur={() => { handleAddTache(); setShowAddTache(false) }}
                      onKeyDown={e => {
                        if (e.key === 'Escape') { setShowAddTache(false); setNewTache('') }
                      }}
                    />
                  </form>
                )}
              </div>

              {/* Bouton Ajouter en pointillés */}
              {!isClos && !showAddTache && (
                <button className="dss-add-btn" onClick={() => setShowAddTache(true)}>
                  + Ajouter une tâche
                </button>
              )}
            </div>
          )}

          {/* ══ ONGLET DÉTAIL ══ */}
          {activeTab === 'detail' && (
            <div className="dss-body">

              {/* Description */}
              <div className="dss-section">
                <div className="dss-vline dss-vline-green" />
                <div className="dss-section-body">
                  <span className="dss-section-label">Description</span>
                  {isClos ? (
                    <p className="dss-desc-text">
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

              {/* Infos */}
              <div className="dss-section">
                <div className="dss-vline dss-vline-sand" />
                <div className="dss-section-body">
                  <span className="dss-section-label">Infos</span>

                  {dossier.organisme && (
                    <div className="dss-info-row">
                      <span className="dss-info-key">Organisme</span>
                      <span className="dss-info-val">{dossier.organisme}</span>
                    </div>
                  )}

                  <div className="dss-info-row">
                    <span className="dss-info-key">Échéance</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                      <span className="dss-info-val">
                        {dossier.echeance
                          ? formatDate(dossier.echeance)
                          : <span style={{ color: '#A09080' }}>Aucune</span>
                        }
                      </span>
                      {!isClos && (
                        <button className="dss-info-edit-btn" onClick={() => setShowEcheanceEdit(v => !v)}>
                          {dossier.echeance ? 'Modifier' : 'Ajouter'}
                        </button>
                      )}
                    </div>
                  </div>

                  {showEcheanceEdit && (
                    <div className="dss-ech-edit">
                      <input
                        type="date"
                        className="input"
                        value={echeance}
                        onChange={e => setEcheance(e.target.value)}
                      />
                      <button className="btn btn-primary btn-sm" onClick={handleEcheanceSave}>OK</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => { setEcheance(dossier.echeance || ''); setShowEcheanceEdit(false) }}>Annuler</button>
                    </div>
                  )}

                  <div className="dss-info-row">
                    <span className="dss-info-key">Priorité</span>
                    <span className="dss-info-val" style={{ color: Q_COLORS[dossier.quadrant], fontWeight: 500 }}>
                      ● {Q_LABELS[dossier.quadrant] || `Q${dossier.quadrant}`}
                    </span>
                  </div>

                  <div className="dss-info-row dss-info-row-last">
                    <span className="dss-info-key">État</span>
                    <span className={`dss-etat-pill dss-etat-${dossier.etat}`}>
                      {ETAT_LABELS[dossier.etat] || dossier.etat}
                    </span>
                  </div>
                </div>
              </div>

              {/* Ce qui s'est passé */}
              <div className="dss-section">
                <div className="dss-vline dss-vline-sand" />
                <div className="dss-section-body">
                  <span className="dss-section-label">Ce qui s'est passé</span>

                  {etapes.length > 0 && (
                    <div className="dss-timeline">
                      {etapes.map((etape, idx) => {
                        const sc = STATUTS_NOTER.find(s => s.key === etape.statut)
                        return (
                          <div key={etape.id} className="dss-etape-row">
                            <div className="dss-etape-track">
                              <span className="dss-etape-dot" style={{ background: sc?.color ?? '#B5A898' }} />
                              {idx < etapes.length - 1 && <div className="dss-etape-line" />}
                            </div>
                            <div className="dss-etape-body">
                              <div className="dss-etape-meta">
                                <span className="dss-etape-date">{formatDateShort(etape.date)}</span>
                                <span className="dss-etape-statut" style={{ color: sc?.color ?? '#B5A898' }}>
                                  {sc?.label ?? etape.statut}
                                </span>
                                {etape.source === 'auto' && (
                                  <span className="dss-etape-auto">auto</span>
                                )}
                              </div>
                              <p className="dss-etape-texte">{etape.texte}</p>
                            </div>
                            {!isClos && etape.source === 'manuel' && (
                              <button className="dss-tache-del" onClick={() => handleDeleteEtape(etape.id)} aria-label="Supprimer">×</button>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/* Formulaire inline Noter */}
                  {!isClos && showAddEtape && (
                    <div className="dss-noter-form">
                      <textarea
                        className="dss-noter-textarea"
                        placeholder="Décrivez ce qui s'est passé… (lettre envoyée, réponse reçue…)"
                        value={newEtapeTexte}
                        onChange={e => setNewEtapeTexte(e.target.value)}
                        rows={3}
                        autoFocus
                      />
                      <div className="dss-statut-row">
                        {STATUTS_NOTER.map(s => (
                          <button
                            key={s.key}
                            className={`dss-statut-pill${newEtapeStatut === s.key ? ' dss-statut-active' : ''}`}
                            onClick={() => setNewEtapeStatut(s.key)}
                            type="button"
                          >
                            <span className="dss-statut-dot" style={{ background: s.color }} />
                            {s.label}
                          </button>
                        ))}
                      </div>
                      <div className="dss-noter-actions">
                        <button className="dss-noter-cancel" onClick={() => { setShowAddEtape(false); setNewEtapeTexte('') }}>Annuler</button>
                        <button className="dss-noter-save" disabled={!newEtapeTexte.trim()} onClick={handleAddEtape}>Enregistrer</button>
                      </div>
                    </div>
                  )}

                  {/* Bouton Noter en pointillés */}
                  {!isClos && !showAddEtape && (
                    <button
                      className="dss-add-btn"
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

          {/* Espaceur safe-area */}
          <div style={{ height: 'calc(env(safe-area-inset-bottom, 0px) + 24px)' }} />
        </div>
      </div>

      <style>{DSS_CSS}</style>
    </>
  )
}

/* ══ CSS ════════════════════════════════════════════════════════════════════ */
const DSS_CSS = `
  /* ── Backdrop ──────────────────────────────────────────────────────────── */
  .dss-backdrop {
    position: fixed; inset: 0;
    background: rgba(0,0,0,0.45);
    z-index: 299;
    animation: dssFadeIn 0.2s ease forwards;
  }
  @keyframes dssFadeIn { from { opacity: 0; } to { opacity: 1; } }

  /* ── Panneau ───────────────────────────────────────────────────────────── */
  .dss-sheet {
    position: fixed; left: 0; right: 0; bottom: 0;
    max-height: 90vh;
    background: #F7F5F0;
    border-radius: 20px 20px 0 0;
    z-index: 300;
    display: flex; flex-direction: column;
    overflow: hidden;
    box-shadow: 0 -4px 40px rgba(0,0,0,0.18);
    animation: dssSlideIn 0.35s cubic-bezier(0.32, 0.72, 0, 1) forwards;
  }
  @keyframes dssSlideIn { from { transform: translateY(100%); } to { transform: translateY(0); } }

  /* ── Poignée ───────────────────────────────────────────────────────────── */
  .dss-handle-area {
    padding: 10px 0 0;
    display: flex; justify-content: center; align-items: center;
    flex-shrink: 0; cursor: grab;
    background: #1C3829;
  }
  .dss-handle-pill {
    width: 36px; height: 4px; border-radius: 2px;
    background: rgba(255,255,255,0.25);
  }

  /* ── Header vert ───────────────────────────────────────────────────────── */
  .dss-header {
    background: #1C3829;
    padding: 10px 18px 0;
    flex-shrink: 0;
  }
  .dss-header-top {
    display: flex; align-items: center; justify-content: space-between;
    margin-bottom: 10px;
  }
  .dss-badge-wrap { position: relative; }
  .dss-right-actions { display: flex; align-items: center; gap: 6px; }
  .dss-close-btn {
    width: 30px; height: 30px; border-radius: 50%;
    border: none; background: rgba(255,255,255,0.12); color: rgba(255,255,255,0.8);
    display: flex; align-items: center; justify-content: center;
    cursor: pointer; flex-shrink: 0; transition: background 0.15s;
  }
  .dss-close-btn:active { background: rgba(255,255,255,0.22); }
  .dss-titre {
    font-size: 18px; font-weight: 700; color: #fff;
    line-height: 1.25; letter-spacing: -0.3px; margin-bottom: 3px;
  }
  .dss-org {
    font-size: 13px; color: rgba(255,255,255,0.55);
    margin-bottom: 14px; line-height: 1.4;
  }

  /* ── Menu ··· ──────────────────────────────────────────────────────────── */
  .dss-menu-wrap { position: relative; }
  .dss-menu-btn {
    border: none; background: rgba(255,255,255,0.12); color: rgba(255,255,255,0.8);
    border-radius: 8px; padding: 4px 10px; font-size: 18px; cursor: pointer;
    font-family: inherit; letter-spacing: 1px; line-height: 1;
    transition: background 0.15s;
  }
  .dss-menu-btn:active { background: rgba(255,255,255,0.22); }
  .dss-menu-card {
    position: absolute; top: calc(100% + 8px); right: 0; z-index: 50;
    background: #fff; border-radius: 12px;
    box-shadow: 0 6px 28px rgba(0,0,0,0.15);
    min-width: 220px; overflow: hidden;
    border: 1px solid #DDD8CE;
  }
  .dss-menu-item {
    display: block; width: 100%; padding: 14px 18px;
    text-align: left; border: none; background: none;
    font-size: 15px; font-family: inherit; cursor: pointer; color: #2A1F14;
    transition: background 0.12s;
  }
  .dss-menu-item:active { background: #F7F5F0; }
  .dss-menu-item-danger { color: #C4623A; }
  .dss-menu-divider { height: 1px; background: #F0EBE3; margin: 0 12px; }

  /* ── Confirmations inline ──────────────────────────────────────────────── */
  .dss-confirm-inline {
    background: #fff; border: 1px solid #DDD8CE; border-radius: 12px;
    padding: 14px; margin-bottom: 18px;
  }
  .dss-confirm-danger { border-color: #C4623A; }
  .dss-confirm-inline p { font-size: 13px; color: #2A1F14; margin: 0 0 12px; line-height: 1.5; }
  .dss-confirm-btns { display: flex; gap: 8px; justify-content: flex-end; }

  /* ── Status dropdown ───────────────────────────────────────────────────── */
  .dss-menu-backdrop { position: fixed; inset: 0; z-index: 9; }
  .dss-etat-menu {
    position: absolute; left: 0; top: calc(100% + 6px); z-index: 10;
    background: #fff; border: 1px solid #DDD8CE; border-radius: 12px;
    box-shadow: 0 6px 24px rgba(0,0,0,0.14);
    min-width: 170px; overflow: hidden;
  }
  .dss-etat-opt {
    display: block; width: 100%; padding: 11px 16px;
    border: none; background: none; text-align: left;
    font-size: 14px; font-family: inherit; cursor: pointer;
    color: #2A1F14; transition: background 0.1s;
  }
  .dss-etat-opt:active { background: #F7F5F0; }
  .dss-etat-active { font-weight: 600; color: #1C3829; }

  /* ── Pills tabs ────────────────────────────────────────────────────────── */
  .dss-tabs { display: flex; gap: 6px; }
  .dss-tab {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 7px 16px; border-radius: 20px 20px 0 0;
    border: none; background: rgba(255,255,255,0.12);
    color: rgba(255,255,255,0.55); font-size: 13px; font-weight: 600;
    font-family: inherit; cursor: pointer; transition: all 0.15s;
    letter-spacing: 0.01em;
  }
  .dss-tab:active { opacity: 0.8; }
  .dss-tab-active { background: #F7F5F0; color: #1C3829; }
  .dss-tab-badge {
    font-size: 10px; font-weight: 700;
    background: rgba(255,255,255,0.2); color: rgba(255,255,255,0.8);
    border-radius: 10px; padding: 1px 6px; line-height: 1.5;
  }
  .dss-tab-active .dss-tab-badge { background: #1C3829; color: #fff; }

  /* ── Contenu ────────────────────────────────────────────────────────────── */
  .dss-content {
    overflow-y: auto; flex: 1;
    -webkit-overflow-scrolling: touch;
    background: #F7F5F0;
  }
  .dss-body {
    padding: 20px 20px 8px;
    display: flex; flex-direction: column; gap: 0;
  }

  /* ── Barre de progression ───────────────────────────────────────────────── */
  .dss-prog-section { margin-bottom: 16px; }
  .dss-prog-track {
    height: 3px; background: #DDD8CE; border-radius: 2px;
    overflow: hidden; margin-bottom: 8px;
  }
  .dss-prog-fill {
    height: 100%; background: #1C3829; border-radius: 2px;
    transition: width 0.4s ease;
  }
  .dss-prog-counter { font-size: 12px; text-align: right; }
  .dss-prog-done  { font-weight: 700; color: #1C3829; }
  .dss-prog-sep   { color: #C0B8A8; }
  .dss-prog-total { color: #A09080; }

  /* ── Tâches ─────────────────────────────────────────────────────────────── */
  .dss-taches-list { display: flex; flex-direction: column; }
  .dss-tache-row {
    display: flex; align-items: center; gap: 12px;
    padding: 12px 0; border-bottom: 1px solid #F0EBE3; min-height: 44px;
  }
  .dss-tache-row:last-child { border-bottom: none; }
  .dss-check {
    width: 22px; height: 22px; border-radius: 5px;
    border: 2px solid #DDD8CE; background: transparent;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0; cursor: pointer; transition: all 0.15s; min-width: 22px;
  }
  .dss-check-done { background: #1C3829; border-color: #1C3829; }
  .dss-check:active { transform: scale(0.9); }
  .dss-tache-titre {
    flex: 1; font-size: 14px; color: #2A1F14; line-height: 1.4;
  }
  .dss-tache-done { text-decoration: line-through; color: #A09080; }
  .dss-tache-del {
    border: none; background: none; color: #A09080; font-size: 20px;
    padding: 0 4px; cursor: pointer; opacity: 0.4; transition: opacity 0.15s;
    min-width: 28px; min-height: 28px; display: flex; align-items: center; justify-content: center;
  }
  .dss-tache-del:active { opacity: 1; }
  .dss-add-input {
    flex: 1; border: none; outline: none; font-size: 14px;
    color: #2A1F14; background: transparent; font-family: inherit;
  }
  .dss-add-input::placeholder { color: #C0B8A8; }
  .dss-empty {
    font-size: 14px; color: #A09080; padding: 16px 0; text-align: center;
  }
  .dss-add-btn {
    width: 100%; margin-top: 12px; padding: 13px; background: transparent;
    border: 1.5px dashed #DDD8CE; border-radius: 10px;
    color: #A09080; font-size: 13px; font-weight: 500;
    font-family: inherit; cursor: pointer; text-align: center;
    transition: background 0.15s, color 0.15s;
  }
  .dss-add-btn:active { background: #F0EBE3; color: #2A1F14; }

  /* ── Sections Détail ─────────────────────────────────────────────────────── */
  .dss-section {
    display: flex; gap: 14px; padding: 0 0 22px;
  }
  .dss-vline {
    width: 3px; border-radius: 2px; flex-shrink: 0;
    align-self: stretch; min-height: 24px; margin-top: 3px;
  }
  .dss-vline-green { background: #1C3829; }
  .dss-vline-sand  { background: #B5A898; }
  .dss-section-body { flex: 1; min-width: 0; }
  .dss-section-label {
    display: block; font-size: 10px; font-weight: 700;
    text-transform: uppercase; letter-spacing: 2px; color: #A09080;
    margin-bottom: 10px; line-height: 1;
  }
  .dss-desc-text {
    font-size: 14px; color: #5A4A3A; line-height: 1.6; margin: 0;
  }

  /* ── Info rows ───────────────────────────────────────────────────────────── */
  .dss-info-row {
    display: flex; align-items: baseline; gap: 12px;
    padding: 8px 0; border-bottom: 1px solid #F0EBE3;
  }
  .dss-info-row-last { border-bottom: none; }
  .dss-info-key {
    font-size: 11px; font-weight: 600; color: #A09080;
    text-transform: uppercase; letter-spacing: 0.08em;
    flex-shrink: 0; width: 74px;
  }
  .dss-info-val { font-size: 14px; color: #2A1F14; flex: 1; }
  .dss-info-edit-btn {
    border: none; background: none; color: #A09080; font-size: 12px;
    font-family: inherit; cursor: pointer; padding: 0;
    text-decoration: underline; text-decoration-color: #DDD8CE;
    flex-shrink: 0; transition: color 0.15s;
  }
  .dss-info-edit-btn:active { color: #2A1F14; }
  .dss-ech-edit {
    display: flex; align-items: center; gap: 8px;
    padding: 8px 0 4px;
  }
  .dss-ech-edit input { flex: 1; }

  /* État pills */
  .dss-etat-pill {
    display: inline-block; font-size: 12px; font-weight: 600;
    padding: 3px 10px; border-radius: 20px;
  }
  .dss-etat-actionnable     { background: #E8F0EA; color: #1C3829; }
  .dss-etat-attente_externe { background: #FFF8EC; color: #B45309; }
  .dss-etat-bloque          { background: #FEF2F2; color: #C0392B; }
  .dss-etat-surveille       { background: #F5F3EE; color: #7A6A5A; }
  .dss-etat-clos            { background: #F5F3EE; color: #A09080; }

  /* ── Timeline ────────────────────────────────────────────────────────────── */
  .dss-timeline { margin-bottom: 4px; }
  .dss-etape-row {
    display: flex; align-items: flex-start; gap: 10px; min-height: 44px;
  }
  .dss-etape-track {
    display: flex; flex-direction: column; align-items: center;
    flex-shrink: 0; width: 16px; padding-top: 4px;
  }
  .dss-etape-dot {
    width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0;
  }
  .dss-etape-line {
    flex: 1; width: 2px; background: #DDD8CE; margin-top: 4px; min-height: 16px;
  }
  .dss-etape-body { flex: 1; padding-bottom: 12px; }
  .dss-etape-meta {
    display: flex; align-items: center; gap: 6px; margin-bottom: 2px; flex-wrap: wrap;
  }
  .dss-etape-date   { font-size: 11px; color: #A09080; font-weight: 500; }
  .dss-etape-statut { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; }
  .dss-etape-auto {
    font-size: 10px; color: #A09080; background: #F0EBE3;
    padding: 1px 6px; border-radius: 20px; font-style: italic;
  }
  .dss-etape-texte { font-size: 13px; color: #2A1F14; line-height: 1.45; margin: 0; }

  /* ── Formulaire Noter ────────────────────────────────────────────────────── */
  .dss-noter-form {
    background: #fff; border: 1px solid #DDD8CE; border-radius: 12px;
    padding: 14px; margin-top: 4px; margin-bottom: 4px;
    display: flex; flex-direction: column; gap: 10px;
  }
  .dss-noter-textarea {
    width: 100%; border: 1.5px solid #DDD8CE; border-radius: 8px;
    padding: 10px 12px; font-size: 14px; font-family: inherit;
    color: #2A1F14; background: #F7F5F0; resize: none; outline: none;
    line-height: 1.5; transition: border-color 0.15s;
  }
  .dss-noter-textarea:focus { border-color: #1C3829; }
  .dss-noter-textarea::placeholder { color: #C0B8A8; }
  .dss-statut-row { display: flex; gap: 6px; flex-wrap: wrap; }
  .dss-statut-pill {
    display: inline-flex; align-items: center; gap: 5px;
    padding: 5px 12px; border-radius: 20px;
    border: 1.5px solid #DDD8CE; background: transparent;
    font-size: 12px; font-weight: 500; color: #A09080;
    cursor: pointer; font-family: inherit; transition: all 0.15s;
    flex-shrink: 0;
  }
  .dss-statut-pill:active { opacity: 0.8; }
  .dss-statut-active { border-color: #2A1F14; color: #2A1F14; background: #F7F5F0; }
  .dss-statut-dot {
    width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0;
  }
  .dss-noter-actions { display: flex; gap: 8px; justify-content: flex-end; }
  .dss-noter-cancel {
    border: none; background: none; font-size: 13px; color: #A09080;
    cursor: pointer; font-family: inherit; padding: 6px 10px;
    transition: color 0.15s;
  }
  .dss-noter-cancel:active { color: #2A1F14; }
  .dss-noter-save {
    background: #1C3829; color: #fff; border: none; border-radius: 8px;
    padding: 8px 18px; font-size: 13px; font-weight: 600; font-family: inherit;
    cursor: pointer; transition: background 0.15s;
  }
  .dss-noter-save:disabled { opacity: 0.4; cursor: default; }
  .dss-noter-save:not(:disabled):active { background: #152e1f; }
`
