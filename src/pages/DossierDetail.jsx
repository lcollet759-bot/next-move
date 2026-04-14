import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { getJournalForDossier, getEtapesForDossier } from '../services/db'
import EtatBadge from '../components/EtatBadge'
import QuadrantBadge from '../components/QuadrantBadge'
import { haptic } from '../utils/haptic'

const ETATS = [
  { key: 'actionnable',     label: 'Actionnable',        desc: 'À traiter maintenant' },
  { key: 'attente_externe', label: 'En attente externe',  desc: 'Attente d\'un retour tiers' },
  { key: 'bloque',          label: 'Bloqué',              desc: 'Obstacle identifié' },
  { key: 'surveille',       label: 'Surveillé',           desc: 'À suivre sans urgence' },
]

const ETATS_LABELS = {
  actionnable:     'Actionnable',
  attente_externe: 'En attente externe',
  bloque:          'Bloqué',
  surveille:       'Surveillé',
  clos:            'Clôturé',
}

// ── Analyse déterministe de la cause de blocage ───────────────────────────────
function analyserCauseBlocage(dossier) {
  const today = new Date(); today.setHours(0, 0, 0, 0)

  // Cas 1 — Échéance dépassée
  if (dossier.echeance) {
    const due  = new Date(dossier.echeance + 'T00:00:00')
    if (due < today) {
      const dateStr = due.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })
      return {
        phrase:     `Échéance du ${dateStr} dépassée — reporter ou clore ?`,
        action:     'Reporter l\'échéance',
        actionType: 'echeance',
      }
    }
  }

  // Cas 2 — Attente externe sans réponse depuis ≥ 15 jours
  if (dossier.organisme) {
    const daysSince = Math.floor((today - new Date(dossier.updatedAt)) / 86_400_000)
    if (daysSince >= 15) {
      return {
        phrase:     `Aucun retour de ${dossier.organisme} depuis ${daysSince} jour${daysSince > 1 ? 's' : ''} — relancer ?`,
        action:     'Marquer comme relancé',
        actionType: 'relancer',
      }
    }
  }

  // Cas 3 — Aucun progrès depuis longtemps
  const daysSinceUpdate = Math.floor((today - new Date(dossier.updatedAt)) / 86_400_000)
  const toutesBloquees  = dossier.taches.length > 0 && dossier.taches.every(t => t.done)
  if (toutesBloquees || daysSinceUpdate >= 14) {
    const days = daysSinceUpdate
    return {
      phrase:     `Ce dossier n'avance plus depuis ${days} jour${days > 1 ? 's' : ''} — identifier l'obstacle ?`,
      action:     'Débloquer',
      actionType: 'debloquer',
    }
  }

  // Cas 4 — Blocage manuel (défaut)
  return {
    phrase:     'Vous avez signalé un blocage — quelle est la prochaine action possible ?',
    action:     'Passer en actionnable',
    actionType: 'manuel',
  }
}

// ── Étapes : constantes ───────────────────────────────────────────────────────
const ETAPE_STATUT_LABELS = { fait: 'Fait', en_attente: 'En attente', bloque: 'Bloqué' }

function formatDate(iso) {
  if (!iso) return null
  return new Date(iso + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}

// Affiche 'DD MMM YYYY' (ex : 14 avr. 2026) — pour la timeline
function formatDateShort(iso) {
  if (!iso) return ''
  return new Date(iso + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatDateTime(iso) {
  return new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function getBadgeClass(etat) {
  const map = { actionnable: 'badge-actionnable', attente_externe: 'badge-attente', bloque: 'badge-bloque', surveille: 'badge-surveille', clos: 'badge-clos' }
  return map[etat] || 'badge-surveille'
}

// Champ inline générique : tap pour éditer, blur pour sauvegarder
function InlineField({ value, onSave, multiline = false, placeholder = '', style = {}, className = '' }) {
  const [editing, setEditing] = useState(false)
  const [draft,   setDraft]   = useState(value)
  const ref = useRef(null)

  useEffect(() => { setDraft(value) }, [value])
  useEffect(() => { if (editing) ref.current?.focus() }, [editing])

  const commit = () => {
    setEditing(false)
    if (draft !== value) onSave(draft)
  }

  const commonProps = {
    ref,
    value: draft,
    onChange: e => setDraft(e.target.value),
    onBlur: commit,
    onKeyDown: e => { if (!multiline && e.key === 'Enter') { e.preventDefault(); commit() } if (e.key === 'Escape') { setDraft(value); setEditing(false) } },
    style: { ...style, width: '100%' },
    className: `inline-input ${className}`,
    autoComplete: 'off',
  }

  if (!editing) {
    return (
      <div
        className={`inline-display ${className}`}
        style={style}
        onClick={() => setEditing(true)}
        title="Toucher pour modifier"
      >
        {value || <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>{placeholder}</span>}
        <span className="inline-edit-icon">✎</span>
      </div>
    )
  }

  return multiline
    ? <textarea {...commonProps} rows={3} className={`input textarea inline-input ${className}`} />
    : <input {...commonProps} type="text" className={`input inline-input ${className}`} />
}

export default function DossierDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { dossiers, mettreAJourDossier, toggleTache, ajouterTache, supprimerTache, supprimerDossier, ajouterEtapeManuelle, supprimerEtape } = useApp()

  const dossier = dossiers.find(d => d.id === id)
  const [journal,          setJournal]          = useState([])
  const [etapes,           setEtapes]           = useState([])
  const [showEtatSheet,    setShowEtatSheet]     = useState(false)
  const [showConfirmClose, setShowConfirmClose]  = useState(false)
  const [showConfirmDel,   setShowConfirmDel]    = useState(false)
  const [newTache,         setNewTache]          = useState('')
  const [showEcheance,     setShowEcheance]      = useState(false)
  const [echeance,         setEcheance]          = useState('')
  const [editingTacheId,   setEditingTacheId]    = useState(null)
  const [tacheDraft,       setTacheDraft]        = useState('')
  // Étapes : état du formulaire d'ajout
  const [showAddEtape,     setShowAddEtape]      = useState(false)
  const [newEtapeDate,     setNewEtapeDate]      = useState('')
  const [newEtapeTexte,    setNewEtapeTexte]     = useState('')
  const [newEtapeStatut,   setNewEtapeStatut]    = useState('fait')
  const newTacheRef   = useRef(null)
  const tacheInputRef = useRef(null)

  const reloadEtapes = () => getEtapesForDossier(id).then(setEtapes)

  useEffect(() => {
    if (dossier) {
      setEcheance(dossier.echeance || '')
      getJournalForDossier(id).then(setJournal)
      reloadEtapes()
    }
  }, [dossier, id])

  useEffect(() => {
    if (editingTacheId) tacheInputRef.current?.focus()
  }, [editingTacheId])

  if (!dossier) {
    return (
      <div className="page">
        <div className="empty-state">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--border)" strokeWidth="1.5" strokeLinecap="round" style={{ marginBottom: 14 }}>
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <p className="empty-title">Dossier introuvable</p>
          <button className="btn btn-ghost" style={{ marginTop: 12 }} onClick={() => navigate(-1)}>← Retour</button>
        </div>
      </div>
    )
  }

  const isClos      = dossier.etat === 'clos'
  const tachesDone  = dossier.taches.filter(t => t.done).length
  const blocageCause = dossier.etat === 'bloque' && !isClos ? analyserCauseBlocage(dossier) : null

  const save = (updates) => mettreAJourDossier(id, updates).then(() =>
    Promise.all([getJournalForDossier(id).then(setJournal), reloadEtapes()])
  )

  const handleBlocageAction = () => {
    if (!blocageCause) return
    if (blocageCause.actionType === 'echeance')               { setShowEcheance(true) }
    else if (blocageCause.actionType === 'relancer')           { save({ etat: 'attente_externe' }) }
    else                                                        { save({ etat: 'actionnable' }) }
  }

  const handleAddEtape = async () => {
    if (!newEtapeTexte.trim()) return
    haptic('light')
    await ajouterEtapeManuelle(id, {
      date:   newEtapeDate || new Date().toISOString().split('T')[0],
      texte:  newEtapeTexte.trim(),
      statut: newEtapeStatut,
    })
    setShowAddEtape(false)
    setNewEtapeTexte('')
    setNewEtapeDate('')
    setNewEtapeStatut('fait')
    await reloadEtapes()
  }

  const handleDeleteEtape = async (etapeId) => {
    haptic('medium')
    await supprimerEtape(etapeId)
    await reloadEtapes()
  }

  const handleEtatChange = async (etat) => { haptic('light'); await save({ etat }); setShowEtatSheet(false) }
  const handleClose      = async ()      => { haptic('success'); await save({ etat: 'clos' }); setShowConfirmClose(false); navigate('/dossiers') }
  const handleDelete     = async ()      => { haptic('medium'); await supprimerDossier(id); navigate('/dossiers') }

  const handleEcheanceSave = async () => { await save({ echeance: echeance || null }); setShowEcheance(false) }

  const handleAddTache = async (e) => {
    e.preventDefault()
    if (!newTache.trim()) return
    await ajouterTache(id, newTache.trim())
    setNewTache('')
    newTacheRef.current?.focus()
  }

  const handleTacheEdit = (tache) => {
    setEditingTacheId(tache.id)
    setTacheDraft(tache.titre)
  }

  const handleTacheEditSave = async () => {
    if (!editingTacheId) return
    const tache = dossier.taches.find(t => t.id === editingTacheId)
    if (tache && tacheDraft.trim() && tacheDraft.trim() !== tache.titre) {
      const taches  = dossier.taches.map(t => t.id === editingTacheId ? { ...t, titre: tacheDraft.trim() } : t)
      await mettreAJourDossier(id, { taches })
    }
    setEditingTacheId(null)
    setTacheDraft('')
  }

  return (
    <div className="page" style={{ position: 'relative' }}>
      {/* Header */}
      <div className="page-header">
        <div className="row-between" style={{ marginBottom: 8 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)}>← Retour</button>
          <div className="row" style={{ gap: 6 }}>
            <QuadrantBadge quadrant={dossier.quadrant} />
            <button className={`badge ${getBadgeClass(dossier.etat)}`} style={{ cursor: isClos ? 'default' : 'pointer', border: 'none' }} onClick={() => !isClos && setShowEtatSheet(true)}>
              {ETATS_LABELS[dossier.etat] || dossier.etat}{!isClos && ' ↓'}
            </button>
          </div>
        </div>

        {/* Titre éditable inline */}
        {isClos ? (
          <h1 className="page-title">{dossier.titre}</h1>
        ) : (
          <InlineField
            value={dossier.titre}
            onSave={v => save({ titre: v })}
            placeholder="Titre du dossier"
            className="page-title-inline"
            style={{ fontSize: 22, fontWeight: 600, color: 'var(--text)' }}
          />
        )}

        {/* Organisme éditable inline */}
        {isClos ? (
          dossier.organisme && <p className="page-subtitle" style={{ marginTop: 4 }}>{dossier.organisme}</p>
        ) : (
          <InlineField
            value={dossier.organisme || ''}
            onSave={v => save({ organisme: v || null })}
            placeholder="Ajouter un organisme…"
            style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 4 }}
          />
        )}
      </div>

      {/* Description éditable inline */}
      <div className="section">
        <div className="card" style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.6 }}>
          {isClos ? (
            dossier.description || <span style={{ fontStyle: 'italic' }}>Aucune description</span>
          ) : (
            <InlineField
              value={dossier.description || ''}
              onSave={v => save({ description: v })}
              multiline
              placeholder="Ajouter une description…"
              style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.6 }}
            />
          )}
        </div>
      </div>

      {/* Banner blocage */}
      {blocageCause && (
        <div className="section">
          <div className="blocage-banner">
            <svg className="blocage-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <p className="blocage-phrase">{blocageCause.phrase}</p>
            <button className="btn blocage-btn" onClick={handleBlocageAction}>
              {blocageCause.action}
            </button>
          </div>
        </div>
      )}

      {/* Raison priorité */}
      {dossier.raisonAujourdhui && (
        <div className="section">
          <div style={{ background: 'var(--green-light)', borderRadius: 'var(--radius)', padding: '12px 14px', fontSize: 13, color: 'var(--green)', lineHeight: 1.5 }}>
            {dossier.raisonAujourdhui}
          </div>
        </div>
      )}

      {/* Échéance */}
      <div className="section">
        <div className="card" style={{ padding: '12px 16px' }}>
          <div className="row-between">
            <div className="row">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0 }}>
                <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
              </svg>
              <div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>Échéance</div>
                <div style={{ fontSize: 14, color: dossier.echeance ? 'var(--text)' : 'var(--text-muted)' }}>
                  {dossier.echeance ? formatDate(dossier.echeance) : 'Aucune'}
                </div>
              </div>
            </div>
            {!isClos && (
              <button className="btn btn-ghost btn-sm" onClick={() => setShowEcheance(true)}>
                {dossier.echeance ? 'Modifier' : 'Ajouter'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Tâches */}
      <div className="section">
        <div className="section-header">
          <span className="label" style={{ marginBottom: 0 }}>
            Tâches {dossier.taches.length > 0 && `· ${tachesDone}/${dossier.taches.length}`}
          </span>
        </div>

        <div className="card" style={{ padding: '8px 12px' }}>
          {dossier.taches.length === 0 && (
            <p style={{ fontSize: 14, color: 'var(--text-muted)', padding: '8px 4px' }}>Aucune tâche</p>
          )}
          {dossier.taches.map(tache => (
            <div key={tache.id} className="tache-row">
              <button
                className={`tache-check ${tache.done ? 'tache-done' : ''}`}
                onClick={() => { if (!isClos) { haptic('light'); toggleTache(id, tache.id) } }}
                aria-label={tache.done ? 'Décocher' : 'Cocher'}
              >
                {tache.done && '✓'}
              </button>

              {/* Titre de tâche éditable inline */}
              {editingTacheId === tache.id ? (
                <input
                  ref={tacheInputRef}
                  className="tache-edit-input"
                  value={tacheDraft}
                  onChange={e => setTacheDraft(e.target.value)}
                  onBlur={handleTacheEditSave}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleTacheEditSave() } if (e.key === 'Escape') { setEditingTacheId(null) } }}
                />
              ) : (
                <span
                  className={`tache-titre ${tache.done ? 'tache-titre-done' : ''}`}
                  onClick={() => !isClos && !tache.done && handleTacheEdit(tache)}
                  style={{ cursor: !isClos && !tache.done ? 'text' : 'default' }}
                >
                  {tache.titre}
                </span>
              )}

              {!isClos && (
                <button className="tache-del" onClick={() => supprimerTache(id, tache.id)} aria-label="Supprimer">×</button>
              )}
            </div>
          ))}

          {!isClos && (
            <form onSubmit={handleAddTache} className="tache-add-form">
              <input
                ref={newTacheRef}
                className="tache-add-input"
                placeholder="+ Ajouter une tâche…"
                value={newTache}
                onChange={e => setNewTache(e.target.value)}
              />
            </form>
          )}
        </div>
      </div>

      {/* Suggestion de clôture */}
      {!isClos && dossier.taches.length > 0 && dossier.taches.every(t => t.done) && (
        <div className="section">
          <div style={{ background: 'var(--green-light)', border: '1px solid var(--green)', borderRadius: 'var(--radius)', padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--green)', marginBottom: 2 }}>Toutes les tâches sont complétées</div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Ce dossier est prêt à être clôturé.</div>
            </div>
            <button className="btn btn-primary btn-sm" style={{ flexShrink: 0 }} onClick={() => { haptic('light'); setShowConfirmClose(true) }}>Clôturer</button>
          </div>
        </div>
      )}

      {/* Actions */}
      {!isClos && (
        <div className="section">
          <button className="btn btn-primary btn-full" style={{ marginBottom: 10 }} onClick={() => setShowConfirmClose(true)}>Clôturer ce dossier</button>
          <button className="btn btn-danger btn-full btn-sm" onClick={() => setShowConfirmDel(true)}>Supprimer définitivement</button>
        </div>
      )}

      {/* ── Historique (dossier vivant) ───────────────────────────────── */}
      <div className="section">
        <div className="section-header">
          <span className="label" style={{ marginBottom: 0 }}>Historique</span>
          {!isClos && !showAddEtape && (
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setNewEtapeDate(new Date().toISOString().split('T')[0])
                setShowAddEtape(true)
              }}
            >
              + Ajouter une étape
            </button>
          )}
        </div>

        {/* Formulaire d'ajout inline */}
        {showAddEtape && (
          <div className="card etape-form">
            <div className="etape-form-row">
              <input
                type="date"
                className="input"
                style={{ flex: '0 0 auto', width: 150 }}
                value={newEtapeDate}
                onChange={e => setNewEtapeDate(e.target.value)}
              />
              <div className="etape-statut-group">
                {['fait', 'en_attente', 'bloque'].map(s => (
                  <button
                    key={s}
                    className={`etape-statut-btn etape-statut-${s}${newEtapeStatut === s ? ' etape-statut-active' : ''}`}
                    onClick={() => setNewEtapeStatut(s)}
                    type="button"
                  >
                    {ETAPE_STATUT_LABELS[s]}
                  </button>
                ))}
              </div>
            </div>
            <textarea
              className="input textarea"
              rows={2}
              placeholder="Décrivez cette étape… (ex : Lettre envoyée à la gérance)"
              value={newEtapeTexte}
              onChange={e => setNewEtapeTexte(e.target.value)}
              style={{ marginTop: 10, marginBottom: 10, fontSize: 14 }}
              autoFocus
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => { setShowAddEtape(false); setNewEtapeTexte('') }}>
                Annuler
              </button>
              <button
                className="btn btn-primary btn-sm"
                style={{ flex: 1 }}
                onClick={handleAddEtape}
                disabled={!newEtapeTexte.trim()}
              >
                Ajouter l'étape
              </button>
            </div>
          </div>
        )}

        {/* Timeline */}
        {etapes.length === 0 && !showAddEtape ? (
          <p style={{ fontSize: 13, color: 'var(--text-muted)', padding: '4px 0' }}>
            Aucune étape enregistrée.
          </p>
        ) : (
          <div className="etapes-timeline">
            {etapes.map((etape, idx) => (
              <div key={etape.id} className={`etape-item${etape.source === 'auto' ? ' etape-item-auto' : ''}`}>
                {/* Fil + dot */}
                <div className="etape-track">
                  <div className={`etape-dot etape-dot-${etape.statut}`} />
                  {idx < etapes.length - 1 && <div className="etape-line" />}
                </div>
                {/* Contenu */}
                <div className="etape-body">
                  <div className="etape-meta">
                    <span className="etape-date">{formatDateShort(etape.date)}</span>
                    <span className={`etape-badge etape-badge-${etape.statut}`}>
                      {ETAPE_STATUT_LABELS[etape.statut]}
                    </span>
                    {etape.source === 'auto' && (
                      <span className="etape-auto-tag">auto</span>
                    )}
                  </div>
                  <p className="etape-texte">{etape.texte}</p>
                </div>
                {/* Supprimer (uniquement étapes manuelles, dossier non clos) */}
                {!isClos && etape.source === 'manuel' && (
                  <button
                    className="tache-del"
                    onClick={() => handleDeleteEtape(etape.id)}
                    aria-label="Supprimer cette étape"
                  >×</button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Sheet : changement état */}
      {showEtatSheet && (
        <div className="overlay" onClick={() => setShowEtatSheet(false)}>
          <div className="sheet" onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>Changer l'état</h3>
            {ETATS.map(e => (
              <button key={e.key} className={`etat-option ${dossier.etat === e.key ? 'etat-option-active' : ''}`} onClick={() => handleEtatChange(e.key)}>
                <EtatBadge etat={e.key} />
                <span className="etat-desc">{e.desc}</span>
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
            <p style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 20 }}>Le dossier sera archivé. Vous pourrez le consulter dans l'onglet Clôturés.</p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setShowConfirmClose(false)}>Annuler</button>
              <button className="btn btn-primary" style={{ flex: 2 }} onClick={handleClose}>Confirmer</button>
            </div>
          </div>
        </div>
      )}

      {/* Sheet : confirmer suppression */}
      {showConfirmDel && (
        <div className="overlay" onClick={() => setShowConfirmDel(false)}>
          <div className="sheet" onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Supprimer ce dossier ?</h3>
            <p style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 20 }}>Cette action est irréversible. Toutes les données du dossier seront effacées.</p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setShowConfirmDel(false)}>Annuler</button>
              <button className="btn btn-danger" style={{ flex: 2 }} onClick={handleDelete}>Supprimer</button>
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

      <style>{`
        .inline-display {
          position: relative;
          cursor: text;
          padding: 2px 24px 2px 0;
          border-radius: 4px;
          transition: background 0.12s;
          min-height: 24px;
        }
        .inline-display:hover { background: var(--gray-light); }
        .inline-edit-icon {
          position: absolute;
          right: 4px;
          top: 50%;
          transform: translateY(-50%);
          font-size: 11px;
          color: var(--text-muted);
          opacity: 0;
          transition: opacity 0.12s;
        }
        .inline-display:hover .inline-edit-icon { opacity: 1; }
        .page-title-inline { font-size: 22px !important; font-weight: 600 !important; line-height: 1.3; }
        .tache-row { display: flex; align-items: center; gap: 10px; padding: 10px 4px; border-bottom: 1px solid var(--border); min-height: 44px; }
        .tache-row:last-of-type { border-bottom: none; }
        .tache-check { width: 22px; height: 22px; border-radius: 6px; border: 2px solid var(--border); background: transparent; display: flex; align-items: center; justify-content: center; font-size: 12px; color: white; flex-shrink: 0; transition: all 0.15s; min-width: 22px; }
        .tache-done { background: var(--green); border-color: var(--green); }
        .tache-titre { flex: 1; font-size: 14px; color: var(--text); }
        .tache-titre-done { text-decoration: line-through; color: var(--text-muted); }
        .tache-edit-input { flex: 1; border: none; border-bottom: 1.5px solid var(--green); outline: none; font-size: 14px; color: var(--text); background: transparent; font-family: inherit; padding: 2px 4px; }
        .tache-del { border: none; background: none; color: var(--text-muted); font-size: 20px; padding: 0 6px; cursor: pointer; opacity: 0.4; transition: opacity 0.15s; min-width: 32px; min-height: 32px; display: flex; align-items: center; justify-content: center; }
        .tache-del:hover { opacity: 1; }
        .tache-add-form { padding: 6px 4px; }
        .tache-add-input { width: 100%; border: none; outline: none; font-size: 14px; color: var(--text-muted); background: transparent; font-family: inherit; padding: 2px 0; min-height: 36px; }
        .tache-add-input::placeholder { color: var(--border); }
        .etat-option { width: 100%; display: flex; align-items: center; gap: 12px; padding: 12px; border: 1.5px solid var(--border); border-radius: var(--radius-sm); background: transparent; cursor: pointer; margin-bottom: 8px; transition: border-color 0.15s; min-height: 52px; }
        .etat-option:hover { border-color: var(--green); }
        .etat-option-active { border-color: var(--green); background: var(--green-light); }
        .etat-desc { font-size: 13px; color: var(--text-muted); }
        .journal-row { padding: 10px 4px; border-bottom: 1px solid var(--border); }
        .journal-row:last-child { border-bottom: none; }
        .journal-action { font-size: 13px; font-weight: 500; color: var(--text); }
        .journal-detail { font-size: 13px; color: var(--text-muted); }
        .journal-time { font-size: 11px; color: var(--border); margin-top: 2px; }
        .section-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
        .blocage-banner {
          display: flex; align-items: flex-start; gap: 10px;
          background: var(--red-light, #fef2f2);
          border: 1px solid var(--red, #c0392b);
          border-radius: var(--radius);
          padding: 14px 14px 14px 14px;
        }
        .blocage-icon { color: var(--red); flex-shrink: 0; margin-top: 2px; }
        .blocage-phrase { flex: 1; font-size: 13px; color: var(--text); line-height: 1.5; }
        .blocage-btn {
          flex-shrink: 0;
          padding: 7px 12px;
          font-size: 12px; font-weight: 600;
          background: var(--red); color: #fff;
          border: none; border-radius: var(--radius-sm);
          cursor: pointer; white-space: nowrap;
          transition: opacity 0.15s;
        }
        .blocage-btn:active { opacity: 0.8; }

        /* ── Historique / Étapes ─────────────────────────────────────── */
        .etape-form {
          padding: 14px 16px;
          margin-bottom: 12px;
        }
        .etape-form-row {
          display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
        }
        .etape-statut-group {
          display: flex; gap: 4px; flex-wrap: wrap;
        }
        .etape-statut-btn {
          padding: 5px 10px;
          border-radius: 20px;
          border: 1.5px solid var(--border);
          background: transparent;
          font-size: 12px; font-weight: 500;
          cursor: pointer; font-family: inherit;
          transition: all 0.15s; color: var(--text-muted);
        }
        .etape-statut-btn.etape-statut-active.etape-statut-fait       { background: var(--green-light);  border-color: var(--green);  color: var(--green); }
        .etape-statut-btn.etape-statut-active.etape-statut-en_attente { background: var(--amber-light, #fffbeb); border-color: var(--amber, #d97706); color: var(--amber, #d97706); }
        .etape-statut-btn.etape-statut-active.etape-statut-bloque     { background: var(--red-light, #fef2f2); border-color: var(--red); color: var(--red); }

        /* Timeline */
        .etapes-timeline { padding-top: 4px; }
        .etape-item {
          display: flex; align-items: flex-start; gap: 10px;
          min-height: 44px; position: relative;
        }
        .etape-item-auto { opacity: 0.75; }
        .etape-track {
          display: flex; flex-direction: column; align-items: center;
          flex-shrink: 0; width: 18px; padding-top: 3px;
        }
        .etape-dot {
          width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0;
        }
        .etape-dot-fait       { background: var(--green); }
        .etape-dot-en_attente { background: var(--amber, #d97706); }
        .etape-dot-bloque     { background: var(--red); }
        .etape-line {
          flex: 1; width: 2px; background: var(--border);
          margin-top: 4px; min-height: 18px;
        }
        .etape-body {
          flex: 1; padding-bottom: 14px;
        }
        .etape-meta {
          display: flex; align-items: center; gap: 6px;
          flex-wrap: wrap; margin-bottom: 3px;
        }
        .etape-date {
          font-size: 11px; color: var(--text-muted); font-weight: 500;
        }
        .etape-badge {
          font-size: 10px; font-weight: 700; padding: 2px 7px;
          border-radius: 20px; text-transform: uppercase; letter-spacing: 0.04em;
        }
        .etape-badge-fait       { background: var(--green-light);  color: var(--green); }
        .etape-badge-en_attente { background: var(--amber-light, #fffbeb); color: var(--amber, #d97706); }
        .etape-badge-bloque     { background: var(--red-light, #fef2f2); color: var(--red); }
        .etape-auto-tag {
          font-size: 10px; color: var(--text-muted);
          background: var(--gray-light); padding: 2px 6px; border-radius: 20px;
          font-style: italic;
        }
        .etape-texte {
          font-size: 14px; color: var(--text); line-height: 1.45; margin: 0;
        }
        .etape-item-auto .etape-texte { color: var(--text-muted); font-size: 13px; }
      `}</style>
    </div>
  )
}
