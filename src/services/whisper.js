const WHISPER_URL = 'https://api.openai.com/v1/audio/transcriptions'

function getOpenAIKey() {
  return localStorage.getItem('openai_api_key') || ''
}

export async function transcribeAudio(blob) {
  const key = getOpenAIKey()
  if (!key) throw new Error('Clé OpenAI manquante. Configurez-la dans Réglages → Transcription vocale.')

  // Déterminer l'extension à partir du type MIME
  const ext = blob.type.includes('webm') ? 'webm'
    : blob.type.includes('mp4')  ? 'mp4'
    : blob.type.includes('ogg')  ? 'ogg'
    : 'wav'

  const formData = new FormData()
  formData.append('file', blob, `recording.${ext}`)
  formData.append('model', 'whisper-1')
  formData.append('language', 'fr')
  formData.append('response_format', 'json')

  const res = await fetch(WHISPER_URL, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}` },
    body: formData
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    const msg = err.error?.message || ''
    if (res.status === 401) throw new Error('Clé OpenAI invalide. Vérifiez vos réglages.')
    if (res.status === 429) throw new Error('Limite de requêtes OpenAI atteinte. Réessayez dans un instant.')
    throw new Error(msg || `Erreur Whisper (${res.status})`)
  }

  const data = await res.json()
  return (data.text || '').trim()
}
