import { useState, useRef, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { analyserCapture, analyserDocument, analyserBrainDump } from '../services/claude'
import EtatBadge from '../components/EtatBadge'
import QuadrantBadge from '../components/QuadrantBadge'
import { haptic } from '../utils/haptic'

const MODES = ['Vocal', 'Texte', 'Document', 'Brain dump']

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

export default function Capturer() {
  const { creerDossier, apiKey } = useApp()
  const navigate = useNavigate()
  const [mode, setMode] = useState('Texte')

  // Vocal
  const [recording,     setRecording]     = useState(false)
  const [transcript,    setTranscript]    = useState('')
  const [voiceBrowser,  setVoiceBrowser]  = useState(null)  // 'ok' | 'warn'
  const recognitionRef  = useRef(null)
  const isRecordingRef  = useRef(false)
  const prevTranscript  = useRef('')

  // Document
  const [docFile,    setDocFile]    = useState(null)
  const [docPreview, setDocPreview] = useState(null)
  const [docBase64,  setDocBase64]  = useState(null)
  const [docMime,    setDocMime]    = useState('image/jpeg')
  const cameraRef = useRef(null)
  const fileRef   = useRef(null)

  // Common
  const [texte,           setTexte]           = useState('')
  const [loading,         setLoading]         = useState(false)
  const [error,           setError]           = useState('')
  const [proposition,     setProposition]     = useState(null)
  const [brainDumpResult, setBrainDumpResult] = useState(null)
  const [saving,          setSaving]          = useState(false)

  // ── Détection navigateur ──────────────────────────────────────────────────
  useEffect(() => {
    async function detectBrowser() {
      const isBrave = navigator.brave
        ? await navigator.brave.isBrave().catch(() => false)
        : false
      if (isBrave) { setVoiceBrowser('warn'); return }
      const hasAPI = !!(window.SpeechRecognition || window.webkitSpeechRecognition)
      if (!hasAPI) { setVoiceBrowser('warn'); return }
      setVoiceBrowser('ok')
    }
    detectBrowser()
  }, [])

  // ── Vocal : Web Speech API, mode manuel ───────────────────────────────────
  const startRecording = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) { setError('Dictée vocale non supportée sur ce navigateur.'); return }

    setTranscript('')
    setError('')
    prevTranscript.current = ''
    isRecordingRef.current = true

    function createAndStart() {
      const recognition = new SR()
      recognition.lang           = 'fr-FR'
      recognition.interimResults = true
      recognition.continuous     = true

      recognition.onresult = (e) => {
        let finals  = ''
        let interim = ''
        for (let i = 0; i < e.results.length; i++) {
          if (e.results[i].isFinal) finals  += e.results[i][0].transcript
          else                      interim += e.results[i][0].transcript
        }
        const next = finals + interim

        // Détection répétitions (Brave / non-Chrome)
        if (voiceBrowser !== 'warn' && next.length > 20 && prevTranscript.current.length > 0) {
          const prev  = prevTranscript.current
          const chunk = prev.slice(-20).trim()
          if (chunk.length > 10 && next.includes(chunk + chunk.slice(0, 8))) {
            setVoiceBrowser('warn')
          }
        }
        prevTranscript.current = next
        setTranscript(next)
      }

      recognition.onerror = (e) => {
        if (!isRecordingRef.current) return
        if (e.error !== 'not-allowed' && e.error !== 'service-not-allowed') {
          setTimeout(createAndStart, 200)
        } else {
          setError(`Microphone non autorisé : ${e.error}`)
          isRecordingRef.current = false
          setRecording(false)
        }
      }

      recognition.onend = () => {
        if (isRecordingRef.current) {
          setTimeout(createAndStart, 100)
        } else {
          setRecording(false)
        }
      }

      recognitionRef.current = recognition
      try { recognition.start() } catch {}
    }

    createAndStart()
    setRecording(true)
  }, [])

  const stopRecording = useCallback(() => {
    isRecordingRef.current = false
    recognitionRef.current?.stop()
  }, [])

  const clearTranscript = useCallback(() => {
    prevTranscript.current = ''
    setTranscript('')
  }, [])

  // ── Document ──────────────────────────────────────────────────────────────
  const handleFile = useCallback(async (file) => {
    if (!file) return
    setError(''); setProposition(null); setDocFile(file)
    const mime = file.type || 'image/jpeg'; setDocMime(mime)
    try {
      if (mime === 'application/pdf') {
        setDocBase64(await readFileAsBase64(file)); setDocPreview(null)
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
    const input = (mode === 'Vocal' || mode === 'Brain dump') ? transcript : texte
    setError(''); setLoading(true); setProposition(null); setBrainDumpResult(null)
    try {
      if (mode === 'Brain dump') {
        const dossiers = await analyserBrainDump(input)
        setBrainDumpResult(dossiers.map(d => ({ ...d, origine: 'vocal', quadrant: calcQuadrant(d.urgence, d.importance) })))
      } else {
        let result
        if (mode === 'Document' && docBase64) result = await analyserDocument(docBase64, docMime)
        else result = await analyserCapture(input)
        setProposition({ ...result, origine: mode.toLowerCase(), quadrant: calcQuadrant(result.urgence, result.importance) })
      }
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }, [mode, texte, transcript, docBase64, docMime, apiKey])

  const confirmer = useCallback(async () => {
    if (!proposition) return
    setSaving(true)
    try {
      const dossier = await creerDossier({ ...proposition, origine: mode.toLowerCase() })
      haptic('success'); navigate(`/dossiers/${dossier.id}`)
    } catch (e) { haptic('error'); setError(e.message) }
    finally { setSaving(false) }
  }, [proposition, creerDossier, mode, navigate])

  const toutCreer = useCallback(async () => {
    if (!brainDumpResult?.length) return
    setSaving(true); setError('')
    try {
      await Promise.all(brainDumpResult.map(d => creerDossier(d)))
      haptic('success'); navigate('/aujourdhui')
    } catch (e) { haptic('error'); setError(e.message) }
    finally { setSaving(false) }
  }, [brainDumpResult, creerDossier, navigate])

  const reset = () => {
    setProposition(null); setBrainDumpResult(null)
    setTexte(''); prevTranscript.current = ''; setTranscript('')
    setDocFile(null); setDocPreview(null); setDocBase64(null); setError('')
  }

  // ── Vue Brain dump results ────────────────────────────────────────────────
  if (brainDumpResult) {
    return (
      <div className="page">
        <div className="page-header">
          <h1 className="page-title">Brain dump</h1>
          <p className="page-subtitle">{brainDumpResult.length} dossier{brainDumpResult.length > 1 ? 's' : ''} identifié{brainDumpResult.length > 1 ? 's' : ''}</p>
        </div>
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
          {error && <p className="error-msg">{error}</p>}
          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <button className="btn btn-ghost" style={{ flex: 1 }} onClick={reset}>← Recommencer</button>
            <button className="btn btn-primary" style={{ flex: 2 }} onClick={toutCreer} disabled={saving}>
              {saving ? 'Création…' : `Créer ${brainDumpResult.length} dossier${brainDumpResult.length > 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Vue proposition simple ────────────────────────────────────────────────
  if (proposition) {
    return (
      <div className="page">
        <div className="page-header">
          <h1 className="page-title">Proposition</h1>
          <p className="page-subtitle">Vérifiez et confirmez le dossier</p>
        </div>
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
          {error && <p className="error-msg">{error}</p>}
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-ghost" style={{ flex: 1 }} onClick={reset}>← Modifier</button>
            <button className="btn btn-primary" style={{ flex: 2 }} onClick={confirmer} disabled={saving}>
              {saving ? 'Création…' : 'Créer le dossier'}
            </button>
          </div>
        </div>
        <style>{`.prop-tache { font-size: 14px; padding: 5px 0; color: var(--text); border-bottom: 1px solid var(--border); } .prop-tache:last-of-type { border-bottom: none; }`}</style>
      </div>
    )
  }

  // ── Vue principale ────────────────────────────────────────────────────────
  const canAnalyse = !loading &&
    (mode === 'Vocal'      ? transcript.trim() : true) &&
    (mode === 'Brain dump' ? transcript.trim() : true) &&
    (mode === 'Texte'      ? texte.trim()      : true) &&
    (mode === 'Document'   ? !!docBase64        : true)

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Capturer</h1>
        <p className="page-subtitle">Dictez, écrivez ou importez un document</p>
      </div>

      {voiceBrowser === 'warn' && (mode === 'Vocal' || mode === 'Brain dump') && (
        <div className="section">
          <div className="browser-warn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, marginTop: 1 }}>
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <span>
              Pour une meilleure expérience vocale, utilisez <strong>Google Chrome</strong>.
              La dictée peut présenter des répétitions sur Brave et d'autres navigateurs.
            </span>
          </div>
        </div>
      )}

      <div className="section">
        <div className="mode-tabs">
          {MODES.map(m => (
            <button key={m} className={`mode-tab ${mode === m ? 'mode-tab-active' : ''}`} onClick={() => { setMode(m); reset() }}>
              {m}
            </button>
          ))}
        </div>
      </div>

      <div className="section">
        {/* ── VOCAL ── */}
        {mode === 'Vocal' && (
          <div className="cap-panel">
            <textarea
              className="input textarea vocal-edit"
              placeholder={recording ? 'Parlez maintenant…' : 'Appuyez sur le micro pour dicter, ou tapez directement…'}
              value={transcript}
              onChange={e => setTranscript(e.target.value)}
              style={{ minHeight: 130, resize: 'vertical' }}
              readOnly={recording}
            />
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <button
                className={`mic-btn ${recording ? 'mic-active' : ''}`}
                onClick={recording ? stopRecording : startRecording}
                aria-label={recording ? 'Arrêter' : 'Dicter'}
              >
                {recording ? (
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
                ) : (
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                    <line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>
                  </svg>
                )}
              </button>
              {recording && <span style={{ fontSize: 13, color: 'var(--red)' }}>En écoute…</span>}
              {!recording && transcript && <button className="btn btn-ghost btn-sm" onClick={clearTranscript}>Effacer</button>}
            </div>
          </div>
        )}

        {/* ── TEXTE ── */}
        {mode === 'Texte' && (
          <div className="cap-panel">
            <textarea className="input textarea" placeholder="Décrivez la situation… Ex : J'ai reçu un courrier de la SUVA réclamant un paiement de 340 CHF avant le 15 avril." value={texte} onChange={e => setTexte(e.target.value)} style={{ minHeight: 160 }} />
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
                <button className="btn btn-ghost btn-sm" onClick={() => { setDocFile(null); setDocPreview(null); setDocBase64(null) }}>Changer de document</button>
              </div>
            ) : (
              <div className="doc-import-panel">
                <button className="doc-btn" onClick={() => cameraRef.current?.click()}>
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                    <circle cx="12" cy="13" r="4"/>
                  </svg>
                  <span>Prendre une photo</span><span className="doc-btn-sub">Appareil photo</span>
                </button>
                <button className="doc-btn" onClick={() => fileRef.current?.click()}>
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                  </svg>
                  <span>Importer un fichier</span><span className="doc-btn-sub">Image ou PDF</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── BRAIN DUMP ── */}
        {mode === 'Brain dump' && (
          <div className="cap-panel">
            <div className="brain-dump-info">
              <p className="brain-dump-title">Parlez librement</p>
              <p className="brain-dump-desc">Videz votre esprit à voix haute — factures, démarches, projets… L'IA découpe en dossiers distincts.</p>
            </div>
            <textarea
              className="input textarea vocal-edit"
              placeholder={recording ? 'Parlez librement, prenez votre temps…' : 'Appuyez sur le micro pour commencer, ou tapez directement…'}
              value={transcript}
              onChange={e => setTranscript(e.target.value)}
              style={{ minHeight: 130, resize: 'vertical' }}
              readOnly={recording}
            />
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <button
                className={`mic-btn ${recording ? 'mic-active' : ''}`}
                onClick={recording ? stopRecording : startRecording}
                aria-label={recording ? 'Arrêter' : 'Commencer'}
              >
                {recording ? (
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
                ) : (
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                    <line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>
                  </svg>
                )}
              </button>
              {recording && <span style={{ fontSize: 13, color: 'var(--red)' }}>En écoute…</span>}
              {!recording && transcript && <button className="btn btn-ghost btn-sm" onClick={clearTranscript}>Effacer</button>}
            </div>
          </div>
        )}

        {error && <p className="error-msg">{error}</p>}

        <button className="btn btn-primary btn-full btn-lg" style={{ marginTop: 16 }} onClick={analyser} disabled={!canAnalyse}>
          {loading
            ? <><div className="spinner" style={{ width: 18, height: 18, borderWidth: 2, borderTopColor: 'white' }} /> Analyse en cours…</>
            : mode === 'Brain dump' ? 'Organiser avec l\'IA' : 'Analyser avec l\'IA'
          }
        </button>

        {!apiKey && (
          <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--text-muted)', marginTop: 10 }}>
            Clé API requise — configurez-la dans <strong>Réglages</strong>
          </p>
        )}
      </div>

      <style>{`
        .browser-warn {
          display: flex; gap: 10px; align-items: flex-start;
          background: var(--amber-light, #fffbeb); border: 1px solid var(--amber, #d97706);
          border-radius: var(--radius); padding: 12px 14px;
          font-size: 13px; color: var(--text); line-height: 1.5;
        }
        .mode-tabs { display: flex; background: var(--gray-light); border-radius: var(--radius-sm); padding: 3px; gap: 2px; margin-bottom: 16px; }
        .mode-tab { flex: 1; padding: 8px 4px; border: none; background: transparent; border-radius: 7px; font-size: 12px; font-weight: 500; color: var(--text-muted); transition: all 0.15s; white-space: nowrap; }
        .mode-tab-active { background: var(--surface); color: var(--green); box-shadow: var(--shadow); }
        .cap-panel { display: flex; flex-direction: column; align-items: center; gap: 12px; width: 100%; }
        .vocal-edit { font-size: 15px; line-height: 1.55; color: var(--text); }
        .vocal-edit:read-only { background: var(--gray-light); cursor: default; }
        .mic-btn { width: 72px; height: 72px; border-radius: 50%; border: none; background: var(--green); color: white; display: flex; align-items: center; justify-content: center; transition: all 0.15s; box-shadow: var(--shadow-md); flex-shrink: 0; }
        .mic-active { background: var(--red); animation: pulse 1.2s ease-in-out infinite; }
        @keyframes pulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(220,38,38,0.3); } 50% { box-shadow: 0 0 0 12px rgba(220,38,38,0); } }
        .brain-dump-info { width: 100%; padding: 14px 16px; background: var(--green-light); border-radius: var(--radius); border-left: 3px solid var(--green); }
        .brain-dump-title { font-size: 14px; font-weight: 600; color: var(--green); margin-bottom: 4px; }
        .brain-dump-desc { font-size: 13px; color: var(--text-secondary); line-height: 1.5; }
        .doc-import-panel { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; width: 100%; }
        .doc-btn { min-height: 140px; border: 2px dashed var(--border); border-radius: var(--radius); background: var(--gray-light); color: var(--green); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; font-size: 14px; font-weight: 500; cursor: pointer; transition: border-color 0.15s, background 0.15s; padding: 16px 12px; text-align: center; }
        .doc-btn:hover { border-color: var(--green); background: var(--green-light); }
        .doc-btn-sub { font-size: 11px; color: var(--text-muted); font-weight: 400; }
        .doc-preview { width: 100%; display: flex; flex-direction: column; align-items: center; gap: 10px; }
        .doc-img { width: 100%; max-height: 260px; object-fit: contain; border-radius: var(--radius); border: 1px solid var(--border); }
        .doc-pdf-placeholder { width: 100%; min-height: 120px; background: var(--gray-light); border-radius: var(--radius); border: 1px solid var(--border); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; padding: 20px; }
        .doc-filename { font-size: 13px; color: var(--text-muted); text-align: center; word-break: break-all; }
        .error-msg { color: var(--red); font-size: 13px; background: var(--red-light); padding: 10px 12px; border-radius: var(--radius-sm); margin-top: 8px; width: 100%; }
      `}</style>
    </div>
  )
}
