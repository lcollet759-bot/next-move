import { useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { analyserCapture, analyserDocument, analyserBrainDump } from '../services/claude'
import EtatBadge from '../components/EtatBadge'
import QuadrantBadge from '../components/QuadrantBadge'
import { haptic } from '../utils/haptic'

const MODES = ['Dicter', 'Écrire', 'Document', 'Brain dump']

function calcQuadrant(u, i) {
  if (u && i)   return 1
  if (!u && i)  return 2
  if (u && !i)  return 3
  return 4
}

async function compressImage(file, maxWidth = 1200, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const ratio  = Math.min(1, maxWidth / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width  = Math.round(img.width  * ratio)
      canvas.height = Math.round(img.height * ratio)
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
      canvas.toBlob((blob) => {
        if (!blob) { reject(new Error('Compression échouée.')); return }
        const reader = new FileReader()
        reader.onload = (e) => resolve({ base64: e.target.result.split(',')[1], mimeType: 'image/jpeg', preview: e.target.result })
        reader.readAsDataURL(blob)
      }, 'image/jpeg', quality)
    }
    img.onerror = () => reject(new Error('Lecture de l\'image impossible.'))
    img.src = url
  })
}

async function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload  = (e) => resolve(e.target.result.split(',')[1])
    reader.onerror = () => reject(new Error('Lecture du fichier impossible.'))
    reader.readAsDataURL(file)
  })
}

// Extrait le texte brut d'un PDF sans dépendance externe.
// Cible les opérateurs Tj / TJ du flux de contenu PDF non compressé.
// Retourne une chaîne vide si le PDF est scanné ou compressé.
async function extractPDFText(file) {
  try {
    const raw = await file.text()
    const matches = []
    const tjRegex = /\(([^)]+)\)\s*Tj/g
    let m
    while ((m = tjRegex.exec(raw)) !== null) {
      matches.push(m[1])
    }
    const tjArrRegex = /\[([^\]]+)\]\s*TJ/g
    while ((m = tjArrRegex.exec(raw)) !== null) {
      matches.push(m[1].replace(/\(([^)]+)\)/g, '$1 ').trim())
    }
    return matches.join(' ').replace(/\s+/g, ' ').trim()
  } catch {
    return ''
  }
}

// Mode icons
const IconMic = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
    <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
    <line x1="12" y1="19" x2="12" y2="23"/>
    <line x1="8" y1="23" x2="16" y2="23"/>
  </svg>
)
const IconPencil = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>
  </svg>
)
const IconFile = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14 2 14 8 20 8"/>
    <line x1="16" y1="13" x2="8" y2="13"/>
    <line x1="16" y1="17" x2="8" y2="17"/>
  </svg>
)
const IconBubble = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
  </svg>
)

const MODE_CONFIG = [
  { id: 'Dicter',     label: 'Dicter',   icon: <IconMic /> },
  { id: 'Écrire',     label: 'Écrire',   icon: <IconPencil /> },
  { id: 'Document',   label: 'Document', icon: <IconFile /> },
  { id: 'Brain dump', label: 'Brain',    icon: <IconBubble /> },
]

const MicBigSvg = () => (
  <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
    <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
    <line x1="12" y1="19" x2="12" y2="23"/>
    <line x1="8" y1="23" x2="16" y2="23"/>
  </svg>
)
const MicSmallSvg = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
    <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
    <line x1="12" y1="19" x2="12" y2="23"/>
    <line x1="8" y1="23" x2="16" y2="23"/>
  </svg>
)
const BackSvg = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 18 9 12 15 6"/>
  </svg>
)

export default function Capturer() {
  const { creerDossier, apiKey } = useApp()
  const navigate = useNavigate()
  const [mode, setMode] = useState('Écrire')

  // Speech recognition
  const [isListening, setIsListening]   = useState(false)
  const recognitionRef                   = useRef(null)

  // Brain dump
  const [transcript, setTranscript] = useState('')
  const brainRef = useRef(null)

  // Document
  const [docFile,    setDocFile]    = useState(null)
  const [docPreview, setDocPreview] = useState(null)
  const [docBase64,  setDocBase64]  = useState(null)
  const [docMime,    setDocMime]    = useState('image/jpeg')
  const [pdfText,    setPdfText]    = useState(null)
  const cameraRef = useRef(null)
  const fileRef   = useRef(null)

  // Common
  const [texte,           setTexte]           = useState('')
  const [loading,         setLoading]         = useState(false)
  const [error,           setError]           = useState('')
  const [proposition,     setProposition]     = useState(null)
  const [brainDumpResult, setBrainDumpResult] = useState(null)
  const [saving,          setSaving]          = useState(false)

  // ── Speech recognition ────────────────────────────────────────────────────
  const startListening = useCallback((onResult) => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) { setError('Dictée vocale non supportée sur ce navigateur.'); return }
    const rec = new SR()
    rec.lang = 'fr-FR'
    rec.continuous = true
    rec.interimResults = false
    rec.onresult = (e) => {
      const result = e.results[e.resultIndex]
      if (result.isFinal) onResult(result[0].transcript.trim())
    }
    rec.onerror = () => setIsListening(false)
    rec.onend   = () => setIsListening(false)
    recognitionRef.current = rec
    rec.start()
    setIsListening(true)
  }, [])

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop()
    setIsListening(false)
  }, [])

  const toggleDicter = useCallback(() => {
    if (isListening) stopListening()
    else startListening(text => setTexte(prev => prev ? prev + ' ' + text : text))
  }, [isListening, startListening, stopListening])

  const toggleBrainMic = useCallback(() => {
    if (isListening) stopListening()
    else startListening(text => setTranscript(prev => prev ? prev + ' ' + text : text))
  }, [isListening, startListening, stopListening])

  // ── Document ──────────────────────────────────────────────────────────────
  const handleFile = useCallback(async (file) => {
    if (!file) return
    setError(''); setProposition(null); setDocFile(file)
    const mime = file.type || 'image/jpeg'; setDocMime(mime)
    try {
      if (mime === 'application/pdf') {
        console.log('[Document] Analyse en cours...')
        const extracted = await extractPDFText(file)
        setPdfText(extracted)
        setDocPreview(null)
        if (!extracted) {
          setError('Ce PDF semble être une image scannée. Prends une photo du document avec le mode Document pour l\'analyser.')
        }
      } else {
        const { base64, preview } = await compressImage(file)
        setDocBase64(base64); setDocPreview(preview)
      }
    } catch (e) { setError(e.message) }
  }, [])

  const handleCameraChange = useCallback((e) => handleFile(e.target.files?.[0]), [handleFile])
  const handleFileChange   = useCallback((e) => handleFile(e.target.files?.[0]), [handleFile])

  // ── Analyse ───────────────────────────────────────────────────────────────
  const analyser = useCallback(async () => {
    if (!apiKey) { setError('Clé API requise — configurez-la dans Réglages.'); return }
    const input = mode === 'Brain dump' ? transcript : texte
    setError(''); setLoading(true); setProposition(null); setBrainDumpResult(null)
    try {
      if (mode === 'Brain dump') {
        const dossiers = await analyserBrainDump(input)
        setBrainDumpResult(dossiers.map(d => ({ ...d, origine: 'vocal', quadrant: calcQuadrant(d.urgence, d.importance) })))
      } else {
        let result
        if (mode === 'Document' && docBase64) {
          console.log('[Document] Analyse en cours...')
          result = await analyserDocument(docBase64, docMime)
          console.log('[Document] Réponse reçue')
        } else if (mode === 'Document' && pdfText) {
          console.log('[Document] Analyse en cours...')
          const texteReduit = pdfText.substring(0, 2000)
          result = await analyserCapture(`Voici le contenu d'un document :\n\n${texteReduit}\n\n[FIN DU DOCUMENT]\n\nAnalyse ce document et crée un dossier Next Move.`)
          console.log('[Document] Réponse reçue')
        } else {
          result = await analyserCapture(input)
        }
        const origine = mode === 'Écrire' ? 'texte' : mode.toLowerCase()
        setProposition({ ...result, origine, quadrant: calcQuadrant(result.urgence, result.importance) })
      }
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }, [mode, texte, transcript, docBase64, pdfText, docMime, apiKey])

  const confirmer = useCallback(async () => {
    if (!proposition) return
    setSaving(true)
    try {
      const origine = mode === 'Écrire' ? 'texte' : mode.toLowerCase()
      const dossier = await creerDossier({ ...proposition, origine })
      haptic('success'); navigate(`/dossiers/${dossier.id}`)
    } catch (e) { haptic('error'); setError(e.message) }
    finally { setSaving(false) }
  }, [proposition, creerDossier, mode, navigate])

  const toutCreer = useCallback(async () => {
    if (!brainDumpResult?.length) return
    setSaving(true); setError('')
    try {
      await Promise.all(brainDumpResult.map(d => creerDossier(d)))
      haptic('success'); navigate('/')
    } catch (e) { haptic('error'); setError(e.message) }
    finally { setSaving(false) }
  }, [brainDumpResult, creerDossier, navigate])

  const reset = () => {
    setProposition(null); setBrainDumpResult(null)
    setTexte(''); setTranscript('')
    setDocFile(null); setDocPreview(null); setDocBase64(null); setPdfText(null); setError('')
    if (isListening) stopListening()
  }

  const changeMode = (m) => { setMode(m); reset() }

  // ── Vue Brain dump results ────────────────────────────────────────────────
  if (brainDumpResult) {
    return (
      <div className="page">
        <header className="cap-header">
          <div className="cap-header-top">
            <button className="cap-back" onClick={() => { setBrainDumpResult(null) }} aria-label="Retour">
              <BackSvg />
            </button>
            <div className="cap-brand">
              <span className="cap-logo-mark">»</span>
              <span className="cap-brand-name">Capturer</span>
            </div>
            <div style={{ width: 40 }} />
          </div>
          <p className="cap-header-sub" style={{ fontSize: 16, fontWeight: 500, opacity: 0.8 }}>
            {brainDumpResult.length} dossier{brainDumpResult.length > 1 ? 's' : ''} identifié{brainDumpResult.length > 1 ? 's' : ''}
          </p>
        </header>
        <div className="section">
          {brainDumpResult.map((d, i) => (
            <div key={i} className="card" style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                <QuadrantBadge quadrant={d.quadrant} />
                {d.echeance && <span className="badge badge-surveille" style={{ fontSize: 11 }}>Échéance {d.echeance}</span>}
              </div>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>{d.titre}</div>
              {d.organisme && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>{d.organisme}</div>}
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: d.taches?.length ? 8 : 0 }}>{d.description}</div>
              {d.taches?.length > 0 && (
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                  {d.taches.slice(0, 3).map((t, j) => (
                    <div key={j} style={{ fontSize: 12, color: 'var(--text-muted)', padding: '2px 0' }}>
                      · {typeof t === 'string' ? t : t.titre}
                    </div>
                  ))}
                  {d.taches.length > 3 && <div style={{ fontSize: 12, color: 'var(--text-muted)', paddingTop: 2 }}>+ {d.taches.length - 3} tâche{d.taches.length - 3 > 1 ? 's' : ''}</div>}
                </div>
              )}
            </div>
          ))}
          {error && <p className="cap-error">{error}</p>}
          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <button className="btn btn-ghost" style={{ flex: 1 }} onClick={reset}>← Recommencer</button>
            <button className="btn btn-primary" style={{ flex: 2 }} onClick={toutCreer} disabled={saving}>
              {saving ? 'Création…' : `Créer ${brainDumpResult.length} dossier${brainDumpResult.length > 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
        <CAP_STYLES />
      </div>
    )
  }

  // ── Vue proposition simple ────────────────────────────────────────────────
  if (proposition) {
    return (
      <div className="page">
        <header className="cap-header">
          <div className="cap-header-top">
            <button className="cap-back" onClick={reset} aria-label="Modifier">
              <BackSvg />
            </button>
            <div className="cap-brand">
              <span className="cap-logo-mark">»</span>
              <span className="cap-brand-name">Capturer</span>
            </div>
            <div style={{ width: 40 }} />
          </div>
          <p className="cap-header-sub" style={{ fontSize: 16, fontWeight: 500, opacity: 0.8 }}>
            Vérifiez et confirmez
          </p>
        </header>
        <div className="section">
          <div className="card" style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
              <QuadrantBadge quadrant={proposition.quadrant} />
              <EtatBadge etat={proposition.etat || 'actionnable'} />
            </div>
            <label className="label">Titre</label>
            <input className="input" value={proposition.titre} onChange={e => setProposition(p => ({ ...p, titre: e.target.value }))} style={{ marginBottom: 12 }} />
            <label className="label">Organisme / Entreprise</label>
            <input className="input" value={proposition.organisme || ''} placeholder="CFF, La Poste, commune, assurance…" onChange={e => setProposition(p => ({ ...p, organisme: e.target.value }))} style={{ marginBottom: 12 }} />
            <label className="label">Résumé</label>
            <textarea className="input textarea" value={proposition.description} onChange={e => setProposition(p => ({ ...p, description: e.target.value }))} style={{ marginBottom: 12 }} />
            {proposition.echeance && (
              <>
                <label className="label">Échéance</label>
                <input className="input" type="date" value={proposition.echeance} onChange={e => setProposition(p => ({ ...p, echeance: e.target.value }))} style={{ marginBottom: 12 }} />
              </>
            )}
            {proposition.taches?.length > 0 && (
              <>
                <label className="label">Tâches suggérées</label>
                {proposition.taches.map((t, i) => <div key={i} className="prop-tache">· {typeof t === 'string' ? t : t.titre}</div>)}
              </>
            )}
            {proposition.raisonPriorite && (
              <div style={{ marginTop: 10, padding: '8px 10px', background: 'var(--green-light)', borderRadius: 'var(--radius-sm)', fontSize: 13, color: 'var(--green)', lineHeight: 1.5 }}>
                {proposition.raisonPriorite}
              </div>
            )}
          </div>
          {error && <p className="cap-error">{error}</p>}
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-ghost" style={{ flex: 1 }} onClick={reset}>← Modifier</button>
            <button className="btn btn-primary" style={{ flex: 2 }} onClick={confirmer} disabled={saving}>
              {saving ? 'Création…' : 'Créer le dossier'}
            </button>
          </div>
        </div>
        <CAP_STYLES />
        <style>{`.prop-tache { font-size: 14px; padding: 5px 0; color: var(--text); border-bottom: 1px solid var(--border); } .prop-tache:last-of-type { border-bottom: none; }`}</style>
      </div>
    )
  }

  // ── Vue principale ────────────────────────────────────────────────────────
  const subtitle = mode === 'Brain dump' ? 'Vide ta tête.' : 'Dis-moi tout.'

  const canAnalyse = !loading &&
    (mode === 'Brain dump'                  ? !!transcript.trim() : true) &&
    (mode === 'Écrire' || mode === 'Dicter' ? !!texte.trim()      : true) &&
    (mode === 'Document'                    ? !!(docBase64 || pdfText) : true)

  return (
    <div className="page">
      <header className="cap-header">
        <div className="cap-header-top">
          <button className="cap-back" onClick={() => navigate(-1)} aria-label="Retour">
            <BackSvg />
          </button>
          <div className="cap-brand">
            <span className="cap-logo-mark">»</span>
            <span className="cap-brand-name">Capturer</span>
          </div>
          <div style={{ width: 40 }} />
        </div>
        <p className="cap-header-sub">{subtitle}</p>
        <div className="cap-mode-row">
          {MODE_CONFIG.map(({ id, label, icon }) => (
            <button
              key={id}
              className={`cap-mode-btn${mode === id ? ' cap-mode-active' : ''}`}
              onClick={() => changeMode(id)}
            >
              <span className="cap-mode-icon">{icon}</span>
              <span className="cap-mode-label">{label}</span>
            </button>
          ))}
        </div>
      </header>

      <div className="section">

        {/* ── DICTER ── */}
        {mode === 'Dicter' && (
          <div className="cap-panel">
            <div className="cap-dicter-center">
              <div className={`cap-mic-ring${!isListening ? ' cap-mic-ring-idle' : ''}`}>
                <button
                  className={`cap-mic-btn${isListening ? ' cap-mic-listening' : ''}`}
                  onClick={toggleDicter}
                  aria-label={isListening ? 'Arrêter la dictée' : 'Commencer la dictée'}
                >
                  <MicBigSvg />
                </button>
              </div>
              {!isListening && !texte && (
                <p className="cap-mic-cta">Appuie et parle</p>
              )}
              <p className="cap-dicter-hint">
                {isListening
                  ? "J'écoute… Appuyez à nouveau pour arrêter."
                  : null}
              </p>
            </div>
            {texte && (
              <div className="cap-dicter-result">
                <p className="cap-dicter-text">{texte}</p>
                <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-end' }} onClick={() => setTexte('')}>Effacer</button>
              </div>
            )}
          </div>
        )}

        {/* ── ÉCRIRE ── */}
        {mode === 'Écrire' && (
          <div className="cap-panel">
            <div className="cap-textarea-wrap">
              <textarea
                className="input textarea"
                placeholder="Décrivez la situation… Ex : J'ai reçu un courrier de la SUVA réclamant un paiement de 340 CHF avant le 15 avril."
                value={texte}
                onChange={e => setTexte(e.target.value)}
                style={{ minHeight: 160, paddingBottom: 28 }}
              />
              <span className="cap-char-count">{texte.length} car.</span>
            </div>
          </div>
        )}

        {/* ── DOCUMENT ── */}
        {mode === 'Document' && (
          <div className="cap-panel">
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handleCameraChange} />
            <input ref={fileRef}   type="file" accept="image/*,application/pdf" style={{ display: 'none' }} onChange={handleFileChange} />
            {docFile ? (
              <div className="doc-preview">
                {docPreview
                  ? <img src={docPreview} alt="Document" className="doc-img" />
                  : <div className="doc-pdf-placeholder">
                      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="1.5" strokeLinecap="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                        <polyline points="14 2 14 8 20 8"/>
                        <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
                      </svg>
                      <span className="doc-filename">{docFile.name}</span>
                    </div>
                }
                <button className="btn btn-ghost btn-sm" onClick={() => { setDocFile(null); setDocPreview(null); setDocBase64(null); setPdfText(null); setError('') }}>Changer de document</button>
              </div>
            ) : (
              <div className="doc-import-panel">
                <button className="doc-btn" onClick={() => cameraRef.current?.click()}>
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                    <circle cx="12" cy="13" r="4"/>
                  </svg>
                  <span>Prendre une photo</span>
                  <span className="doc-btn-sub">Appareil photo</span>
                </button>
                <button className="doc-btn" onClick={() => fileRef.current?.click()}>
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                  </svg>
                  <span>Importer un fichier</span>
                  <span className="doc-btn-sub">Image ou PDF</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── BRAIN DUMP ── */}
        {mode === 'Brain dump' && (
          <div className="cap-panel">
            <div className="cap-brain-wrap">
              <textarea
                ref={brainRef}
                className="input textarea"
                placeholder="Balance tout ce qui te passe par la tête… factures, démarches, projets, rendez-vous…"
                value={transcript}
                onChange={e => setTranscript(e.target.value)}
                style={{ minHeight: 220, paddingBottom: 52 }}
              />
              <button
                className={`cap-brain-mic${isListening ? ' cap-brain-mic-active' : ''}`}
                onClick={toggleBrainMic}
                title={isListening ? 'Arrêter la dictée' : 'Dicter'}
              >
                <MicSmallSvg />
              </button>
            </div>
            {transcript && (
              <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-end' }} onClick={() => setTranscript('')}>Effacer</button>
            )}
          </div>
        )}

        {error && <p className="cap-error">{error}</p>}

        <button
          className="btn btn-primary btn-full btn-lg"
          style={{ marginTop: 16 }}
          onClick={analyser}
          disabled={!canAnalyse}
        >
          {loading
            ? <><div className="spinner" style={{ width: 18, height: 18, borderWidth: 2, borderTopColor: 'white' }} /> Analyse en cours…</>
            : mode === 'Brain dump' ? "Organiser avec l'IA" : "Analyser avec l'IA"
          }
        </button>

        {!apiKey && (
          <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--text-muted)', marginTop: 10 }}>
            Clé API requise — configurez-la dans <strong>Réglages</strong>
          </p>
        )}
      </div>

      <CAP_STYLES />
    </div>
  )
}

function CAP_STYLES() {
  return (
    <style>{`
      /* ── Header ── */
      .cap-header {
        position: sticky;
        top: 0;
        z-index: 10;
        background: #1C3829;
        color: #fff;
        padding: 14px 16px 0;
        flex-shrink: 0;
      }
      .cap-header-top {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 10px;
      }
      .cap-back {
        width: 40px; height: 40px;
        display: flex; align-items: center; justify-content: center;
        background: transparent;
        border: none;
        color: rgba(255,255,255,0.75);
        cursor: pointer;
        border-radius: 10px;
        transition: background 0.15s;
      }
      .cap-back:active { background: rgba(255,255,255,0.1); }
      .cap-brand {
        display: flex;
        align-items: center;
        gap: 5px;
      }
      .cap-logo-mark {
        font-size: 20px;
        font-weight: 700;
        color: #C4623A;
        letter-spacing: -1px;
        line-height: 1;
      }
      .cap-brand-name {
        font-size: 16px;
        font-weight: 600;
        color: #fff;
        letter-spacing: 0.3px;
      }
      .cap-header-sub {
        font-size: 24px;
        font-weight: 700;
        color: rgba(255,255,255,0.95);
        margin: 0 0 14px;
        letter-spacing: -0.4px;
        line-height: 1.15;
      }

      /* ── Mode row ── */
      .cap-mode-row {
        display: flex;
        justify-content: space-between;
        padding-bottom: 14px;
        gap: 8px;
      }
      .cap-mode-btn {
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 5px;
        padding: 10px 4px;
        border: none;
        border-radius: 12px;
        background: rgba(255,255,255,0.08);
        color: rgba(255,255,255,0.45);
        cursor: pointer;
        transition: background 0.15s, color 0.15s;
      }
      .cap-mode-btn.cap-mode-active {
        background: rgba(255,255,255,0.18);
        color: #fff;
      }
      .cap-mode-icon { display: flex; align-items: center; justify-content: center; }
      .cap-mode-label {
        font-size: 9px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 1px;
        line-height: 1;
      }

      /* ── Panel ── */
      .cap-panel {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 12px;
        width: 100%;
      }

      /* ── Dicter ── */
      .cap-dicter-center {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 22px;
        padding: 36px 0 12px;
        width: 100%;
      }
      .cap-mic-ring {
        width: 106px;
        height: 106px;
        border-radius: 50%;
        background: #E8F0EA;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }
      .cap-mic-btn {
        width: 80px;
        height: 80px;
        border-radius: 50%;
        background: #1C3829;
        border: none;
        color: #fff;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: background 0.15s, transform 0.1s;
        box-shadow: 0 4px 16px rgba(28,56,41,0.25);
      }
      .cap-mic-btn:active { transform: scale(0.93); }
      .cap-mic-btn.cap-mic-listening {
        background: #C4623A;
        animation: cap-pulse 1.3s ease-in-out infinite;
      }
      @keyframes cap-pulse {
        0%, 100% { box-shadow: 0 0 0 0 rgba(196,98,58,0.45); }
        50%       { box-shadow: 0 0 0 16px rgba(196,98,58,0); }
      }
      /* Anneau pulse subtle quand micro inactif — invite à appuyer */
      .cap-mic-ring-idle {
        animation: cap-ring-idle 2.4s ease-in-out infinite;
      }
      @keyframes cap-ring-idle {
        0%, 100% { box-shadow: 0 0 0 0 rgba(28,56,41,0); }
        50%       { box-shadow: 0 0 0 10px rgba(28,56,41,0.10); }
      }
      /* Label "Appuie et parle" */
      .cap-mic-cta {
        font-size: 15px;
        font-weight: 600;
        color: #1C3829;
        letter-spacing: -0.2px;
        text-align: center;
        margin: 0;
      }
      .cap-dicter-hint {
        font-size: 14px;
        color: var(--text-muted);
        text-align: center;
        line-height: 1.55;
        max-width: 220px;
        min-height: 40px;
      }
      .cap-dicter-result {
        width: 100%;
        background: #fff;
        border: 1px solid var(--border);
        border-radius: var(--radius);
        padding: 14px;
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .cap-dicter-text {
        font-size: 14px;
        color: var(--text);
        line-height: 1.65;
        margin: 0;
      }

      /* ── Écrire ── */
      .cap-textarea-wrap { position: relative; width: 100%; }
      .cap-textarea-wrap .input { width: 100%; background: #fff; }
      .cap-char-count {
        position: absolute;
        bottom: 10px;
        right: 12px;
        font-size: 11px;
        color: var(--text-muted);
        pointer-events: none;
      }

      /* ── Brain dump ── */
      .cap-brain-wrap { position: relative; width: 100%; }
      .cap-brain-wrap .input { width: 100%; background: #fff; }
      .cap-brain-mic {
        position: absolute;
        bottom: 12px;
        right: 12px;
        width: 36px;
        height: 36px;
        border-radius: 50%;
        border: none;
        background: #1C3829;
        color: #fff;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: background 0.15s, transform 0.1s;
        box-shadow: 0 2px 8px rgba(28,56,41,0.2);
      }
      .cap-brain-mic:active { transform: scale(0.92); }
      .cap-brain-mic.cap-brain-mic-active {
        background: #C4623A;
        animation: cap-pulse 1.3s ease-in-out infinite;
      }

      /* ── Document ── */
      .doc-import-panel { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; width: 100%; }
      .doc-btn { min-height: 140px; border: 2px dashed var(--border); border-radius: var(--radius); background: var(--gray-light); color: var(--green); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; font-size: 14px; font-weight: 500; cursor: pointer; transition: border-color 0.15s, background 0.15s; padding: 16px 12px; text-align: center; }
      .doc-btn:hover { border-color: var(--green); background: var(--green-light); }
      .doc-btn-sub { font-size: 11px; color: var(--text-muted); font-weight: 400; }
      .doc-preview { width: 100%; display: flex; flex-direction: column; align-items: center; gap: 10px; }
      .doc-img { width: 100%; max-height: 260px; object-fit: contain; border-radius: var(--radius); border: 1px solid var(--border); }
      .doc-pdf-placeholder { width: 100%; min-height: 120px; background: var(--gray-light); border-radius: var(--radius); border: 1px solid var(--border); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; padding: 20px; }
      .doc-filename { font-size: 13px; color: var(--text-muted); text-align: center; word-break: break-all; }

      /* ── Common ── */
      .cap-error { color: var(--red); font-size: 13px; background: var(--red-light); padding: 10px 12px; border-radius: var(--radius-sm); margin-top: 8px; width: 100%; }
    `}</style>
  )
}
