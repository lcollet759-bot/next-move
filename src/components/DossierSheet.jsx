import { useState, useEffect, useRef, useCallback } from 'react'
import { useApp } from '../context/AppContext'
import { getEtapesForDossier } from '../services/db'
import { haptic } from '../utils/haptic'

// ── Constantes ────────────────────────────────────────────────────────────────
const ETATS = [
  { key: 'actionnable',     label: 'Actionnable',       cls: 'badge-actionnable' },
  { key: 'attente_externe', label: 'En attente',         cls: 'badge-attente' },
  { key: 'bloque',          label: 'Bloqué',             cls: 'badge-bloque' },
  { key: 'surveille',       label: 'Surveillé',          cls: 'badge-surveille' },
]
const ETAT_LABELS = {
  actionnable: 'Actionnable', attente_externe: 'En attente externe',
  bloque: 'Bloqué', surveille: 'Surveillé', clos: 'Clôturé',
}
const ETAPE_STATUT_COLORS = {
  fait: 'var(--green)', en_attente: 'var(--amber, #d97706)', bloque: 'var(--red)',
}

function formatDateShort(iso) {
  if (!iso) return ''
  return new Date(iso + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

// ── Champ éditable inline léger ───────────────────────────────────────────────
function InlineField({ value, onSave, multiline = false, placeholder = '', style = {} }) {
  const [editing, setEditing] = useState(false)
  const [draft,   setDraft]   = useState(value ?? '')
  const ref = useRef(null)

  useEffect(() => { setDraft(value ?? '') }, [value])
  useEffect(() => { if (editing) ref.current?.focus() }, [editing])

  const commit = () => {
    setEditing(false)
    const trimmed = draft.trim()
    if (trimmed !== (value ?? '').trim()) onSave(trimmed)
  }

  if (!editing) {
    return (
      <div
        style={{ ...style, cursor: 'text', padding: '2px 0', minHeight: 22 }}
        onClick={() => setEditing(true)}
      >
        {value
          ? value
          : <span style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: 'inherit' }}>{placeholder}</span>
        }
      </div>
    )
  }

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
    : <input {...common} type="text" />
}

// ── DossierSheet ──────────────────────────────────────────────────────────────
export default function DossierSheet({ dossierId, onClose }) {
  const { dossiers, mettreAJourDossier, toggleTache } = useApp()
  const dossier = dossiers.find(d => d.id === dossierId)

  const [etapes,       setEtapes]       = useState([])
  const [showEtatMenu, setShowEtatMenu] = useState(false)

  // Swipe-to-dismiss
  const sheetRef  = useRef(null)
  const startY    = useRef(0)
  const dragDelta = useRef(0)

  // ── Chargement étapes ───────────────────────────────────────────────────
  useEffect(() => {
    if (!dossierId) return
    getEtapesForDossier(dossierId).then(setEtapes).catch(() => {})
  }, [dossierId])

  // ── Animation de fermeture ──────────────────────────────────────────────
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

  // ── Swipe sur le handle ─────────────────────────────────────────────────
  const onTouchStart = (e) => {
    startY.current    = e.touches[0].clientY
    dragDelta.current = 0
    if (sheetRef.current) sheetRef.current.style.transition = 'none'
  }
  const onTouchMove = (e) => {
    const dy = e.touches[0].clientY - startY.current
    dragDelta.current = dy
    if (dy > 0 && sheetRef.current) {
      sheetRef.current.style.transform = `translateY(${dy}px)`
    }
  }
  const onTouchEnd = () => {
    if (dragDelta.current > 90) {
      haptic('light')
      handleClose()
    } else if (sheetRef.current) {
      sheetRef.current.style.transition = 'transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)'
      sheetRef.current.style.transform  = 'translateY(0)'
    }
  }

  if (!dossier) { handleClose(); return null }

  const isClos = dossier.etat === 'clos'
  const tachesDone = dossier.taches.filter(t => t.done).length
  const save = (updates) => mettreAJourDossier(dossierId, updates)
    .then(() => getEtapesForDossier(dossierId).then(setEtapes))

  return (
    <>
      {/* Backdrop */}
      <div className="ds-backdrop" onClick={handleClose} />

      {/* Panneau */}
      <div ref={sheetRef} className="ds-sheet">

        {/* Poignée de glissement */}
        <div
          className="ds-handle-area"
          style={{ touchAction: 'none', userSelect: 'none' }}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          <div className="ds-handle-pill" />
        </div>

        {/* En-tête */}
        <div className="ds-header">
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Titre */}
            <InlineField
              value={dossier.titre}
              onSave={v => save({ titre: v })}
              placeholder="Titre du dossier"
              style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)', lineHeight: 1.3 }}
            />
            {/* Organisme */}
            <InlineField
              value={dossier.organisme ?? ''}
              onSave={v => save({ organisme: v || null })}
              placeholder="Ajouter un organisme…"
              style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            {/* Badge statut cliquable */}
            <div style={{ position: 'relative' }}>
              <button
                className={`badge ${ETATS.find(e => e.key === dossier.etat)?.cls || 'badge-surveille'}`}
                style={{ cursor: isClos ? 'default' : 'pointer', border: 'none', fontSize: 11 }}
                onClick={() => !isClos && setShowEtatMenu(v => !v)}
              >
                {ETAT_LABELS[dossier.etat] ?? dossier.etat}
                {!isClos && ' ↓'}
              </button>
              {showEtatMenu && (
                <div className="ds-etat-menu">
                  {ETATS.map(e => (
                    <button
                      key={e.key}
                      className={`ds-etat-opt${dossier.etat === e.key ? ' ds-etat-active' : ''}`}
                      onClick={() => { haptic('light'); save({ etat: e.key }); setShowEtatMenu(false) }}
                    >
                      {e.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Bouton fermer */}
            <button className="ds-close-btn" onClick={handleClose} aria-label="Fermer">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Contenu défilable */}
        <div className="ds-content">

          {/* Description */}
          <div className="ds-section">
            <p className="ds-label">Description</p>
            <div style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.6 }}>
              <InlineField
                value={dossier.description ?? ''}
                onSave={v => save({ description: v })}
                multiline
                placeholder="Ajouter une description…"
                style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.6 }}
              />
            </div>
          </div>

          {/* Tâches */}
          <div className="ds-section">
            <p className="ds-label">
              Tâches
              {dossier.taches.length > 0 && (
                <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}> · {tachesDone}/{dossier.taches.length}</span>
              )}
            </p>
            {dossier.taches.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Aucune tâche.</p>
            ) : (
              <div className="ds-taches">
                {dossier.taches.map(tache => (
                  <div key={tache.id} className="ds-tache-row">
                    <button
                      className={`tache-check${tache.done ? ' tache-done' : ''}`}
                      onClick={() => { if (!isClos) { haptic('light'); toggleTache(dossierId, tache.id) } }}
                      style={{ flexShrink: 0 }}
                    >
                      {tache.done && '✓'}
                    </button>
                    <span
                      className={tache.done ? 'tache-titre-done' : ''}
                      style={{ fontSize: 14, color: tache.done ? 'var(--text-muted)' : 'var(--text)', lineHeight: 1.35 }}
                    >
                      {tache.titre}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Historique */}
          {etapes.length > 0 && (
            <div className="ds-section">
              <p className="ds-label">Historique</p>
              <div className="ds-etapes">
                {etapes.map((e, idx) => (
                  <div key={e.id} className="ds-etape-row">
                    <div className="ds-etape-track">
                      <div
                        className="ds-etape-dot"
                        style={{ background: ETAPE_STATUT_COLORS[e.statut] ?? 'var(--border)' }}
                      />
                      {idx < etapes.length - 1 && <div className="ds-etape-line" />}
                    </div>
                    <div className="ds-etape-body">
                      <span className="ds-etape-date">{formatDateShort(e.date)}</span>
                      <p
                        className="ds-etape-texte"
                        style={{ color: e.source === 'auto' ? 'var(--text-muted)' : 'var(--text)' }}
                      >
                        {e.texte}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Espaceur safe-area */}
          <div style={{ height: 'calc(env(safe-area-inset-bottom, 0px) + 24px)' }} />
        </div>
      </div>

      <style>{`
        /* ── Backdrop ───────────────────────────────────────────────── */
        .ds-backdrop {
          position: fixed; inset: 0;
          background: rgba(0, 0, 0, 0.45);
          z-index: 299;
          animation: dsFadeIn 0.2s ease forwards;
        }
        @keyframes dsFadeIn  { from { opacity: 0; } to { opacity: 1; } }

        /* ── Panneau ─────────────────────────────────────────────────── */
        .ds-sheet {
          position: fixed;
          left: 0; right: 0; bottom: 0;
          max-height: 88vh;
          background: var(--surface);
          border-radius: 20px 20px 0 0;
          z-index: 300;
          display: flex; flex-direction: column;
          overflow: hidden;
          box-shadow: 0 -4px 40px rgba(0,0,0,0.18);
          animation: dsSlideIn 0.35s cubic-bezier(0.32, 0.72, 0, 1) forwards;
        }
        @keyframes dsSlideIn { from { transform: translateY(100%); } to { transform: translateY(0); } }

        /* ── Poignée ─────────────────────────────────────────────────── */
        .ds-handle-area {
          padding: 10px 0 4px;
          display: flex; justify-content: center; align-items: center;
          flex-shrink: 0; cursor: grab;
        }
        .ds-handle-pill {
          width: 36px; height: 4px; border-radius: 2px;
          background: var(--border);
        }

        /* ── En-tête ─────────────────────────────────────────────────── */
        .ds-header {
          display: flex; align-items: flex-start; gap: 10px;
          padding: 4px 18px 14px;
          border-bottom: 1px solid var(--border);
          flex-shrink: 0;
        }
        .ds-close-btn {
          width: 28px; height: 28px; border-radius: 50%;
          border: none; background: var(--gray-light); color: var(--text-muted);
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; flex-shrink: 0; transition: background 0.15s;
        }
        .ds-close-btn:hover { background: var(--border); }

        /* ── Menu statut ─────────────────────────────────────────────── */
        .ds-etat-menu {
          position: absolute; right: 0; top: calc(100% + 6px);
          background: var(--surface);
          border: 1px solid var(--border); border-radius: var(--radius-sm);
          box-shadow: 0 4px 20px rgba(0,0,0,0.12);
          z-index: 10; min-width: 160px; overflow: hidden;
        }
        .ds-etat-opt {
          display: block; width: 100%; padding: 10px 14px;
          border: none; background: none; text-align: left;
          font-size: 14px; font-family: inherit; cursor: pointer;
          transition: background 0.1s; color: var(--text);
        }
        .ds-etat-opt:hover { background: var(--gray-light); }
        .ds-etat-active { font-weight: 600; color: var(--green); }

        /* ── Contenu ─────────────────────────────────────────────────── */
        .ds-content {
          overflow-y: auto; flex: 1;
          -webkit-overflow-scrolling: touch;
        }
        .ds-section {
          padding: 14px 18px;
          border-bottom: 1px solid var(--border);
        }
        .ds-section:last-of-type { border-bottom: none; }
        .ds-label {
          font-size: 11px; font-weight: 700;
          color: var(--text-muted); text-transform: uppercase;
          letter-spacing: 0.08em; margin-bottom: 8px;
        }

        /* ── Tâches ──────────────────────────────────────────────────── */
        .ds-taches { display: flex; flex-direction: column; gap: 0; }
        .ds-tache-row {
          display: flex; align-items: center; gap: 10px;
          padding: 8px 0; border-bottom: 1px solid var(--border);
          min-height: 40px;
        }
        .ds-tache-row:last-child { border-bottom: none; }

        /* ── Historique ──────────────────────────────────────────────── */
        .ds-etapes { display: flex; flex-direction: column; }
        .ds-etape-row {
          display: flex; align-items: flex-start; gap: 10px; min-height: 38px;
        }
        .ds-etape-track {
          display: flex; flex-direction: column; align-items: center;
          flex-shrink: 0; width: 16px; padding-top: 4px;
        }
        .ds-etape-dot {
          width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
        }
        .ds-etape-line {
          flex: 1; width: 2px; background: var(--border);
          margin-top: 3px; min-height: 14px;
        }
        .ds-etape-body { flex: 1; padding-bottom: 10px; }
        .ds-etape-date {
          font-size: 11px; color: var(--text-muted); font-weight: 500;
          display: block; margin-bottom: 1px;
        }
        .ds-etape-texte { font-size: 13px; line-height: 1.4; margin: 0; }
      `}</style>
    </>
  )
}
