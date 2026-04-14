const API_URL = 'https://api.anthropic.com/v1/messages'
const MODEL   = 'claude-sonnet-4-20250514'

function getApiKey() {
  return localStorage.getItem('anthropic_api_key') || ''
}

function headers() {
  return {
    'Content-Type': 'application/json',
    'x-api-key': getApiKey(),
    'anthropic-version': '2023-06-01',
    'anthropic-dangerous-direct-browser-access': 'true'
  }
}

function todayISO() {
  return new Date().toISOString().split('T')[0]
}

// Nettoie la réponse et extrait le JSON même si enveloppé dans des backticks
function parseJSON(text) {
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  const match   = cleaned.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('Aucun JSON valide dans la réponse IA.')
  return JSON.parse(match[0])
}

async function callClaude(system, userContent, options = {}) {
  const { maxTokens = 1024, temperature = 0 } = options
  const key = getApiKey()
  if (!key) throw new Error('Clé API manquante. Configurez-la dans Réglages.')

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      temperature,
      system,
      messages: [{ role: 'user', content: userContent }]
    })
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    const msg = err.error?.message || ''
    if (res.status === 401) throw new Error('Clé API invalide. Vérifiez vos réglages.')
    if (res.status === 429) throw new Error('Limite de requêtes atteinte. Réessayez dans quelques instants.')
    throw new Error(msg || `Erreur API (${res.status})`)
  }

  const data = await res.json()
  return data.content[0].text
}

// ── Contexte commun ────────────────────────────────────────────────────────
const CONTEXTE_SUISSE = `Tu es l'assistant IA de Next Move, au service d'un utilisateur basé en Suisse.
Contexte : administration helvétique (confédération, cantons, communes), organismes suisses (CFF, La Poste, SUVA, AVS/AI, caisses cantonales, offices des migrations, services communaux, assurances-maladie LAMal, OFAS, etc.).
Monnaie : CHF (francs suisses). Langue : français suisse. Ton : direct, concis, sans jargon.`

// ── Règle de détection du statut initial ──────────────────────────────────
const REGLE_ETAT = `Règles pour le champ "etat" :
- "attente_externe" si la situation implique d'attendre une réponse ou décision d'un tiers : mots-clés "attendre", "en attente", "en cours de traitement", "dossier en cours", "réponse attendue", "délai d'instruction", "sous examen", "traitement en cours", "nous reviendrons", "sera traité"
- "actionnable" dans tous les autres cas (action immédiate possible)`

// ── Règles communes pour les tâches ───────────────────────────────────────
const REGLES_TACHES = `Règles pour le champ "taches" :
- 3 à 6 tâches maximum, ordonnées dans l'ordre logique d'exécution
- Chaque tâche commence par un verbe d'action (Appeler, Remplir, Télécharger, Envoyer, Vérifier, Rassembler, Contacter, Payer, Signer, Scanner, etc.)
- Sois spécifique : mentionner le nom du service, du formulaire ou du portail quand c'est connu
- Adapté au contexte suisse : portails cantonaux, guichets officiels, délais légaux, paiements par BVR/QR-facture
- Exemple pour "déclaration de salaire AVS" : ["Rassembler les fiches de salaire du mois", "Accéder au portail employeur de la caisse AVS", "Saisir les montants bruts par employé", "Vérifier les taux de cotisation (5,3% employé + 5,3% employeur)", "Soumettre la déclaration avant l'échéance", "Conserver la confirmation de transmission"]`

// ── Règles communes pour les dates ────────────────────────────────────────
const REGLES_DATES = `Règles pour "echeance" :
- Mettre UNIQUEMENT la date limite d'action (pas la date d'émission du document)
- Indices d'une échéance : "avant le", "jusqu'au", "délai de paiement", "à payer avant", "date limite", "délai", "à retourner avant", "répondre avant", "payer d'ici le", "valable jusqu'au", "délai légal", "dans les X jours", "sous X jours"
- Si la date est relative ("dans 30 jours", "sous 10 jours"), la calculer à partir de la date du jour fournie
- Si aucune échéance explicite n'est mentionnée → "echeance": null
- Ne jamais confondre la date d'émission avec l'échéance`

// ── Analyse une capture texte/vocale → dossier structuré ──────────────────
export async function analyserCapture(texte) {
  if (texte.length > 8000) throw new Error('Texte trop long (maximum 8 000 caractères).')

  const system = `${CONTEXTE_SUISSE}

Analyse la situation décrite et retourne UNIQUEMENT un objet JSON valide avec cette structure exacte :
{
  "titre": "string court (max 6 mots, factuel)",
  "organisme": "nom de l'organisme, entreprise ou personne concernée, ou null",
  "type": "vivant" ou "operationnel",
  "description": "résumé factuel en 1-2 phrases incluant les informations clés (montants CHF, références, contexte)",
  "taches": ["première action à faire", "deuxième action", ...],
  "urgence": true si échéance ≤ 7 jours ou situation critique, sinon false,
  "importance": true si les conséquences sont significatives (financières, légales, relationnelles), sinon false,
  "echeance": "YYYY-MM-DD" ou null,
  "etat": "actionnable" ou "attente_externe",
  "raisonPriorite": "une phrase directe expliquant pourquoi agir maintenant ou bientôt"
}

${REGLES_TACHES}

${REGLES_DATES}

${REGLE_ETAT}

Pas de texte avant ou après le JSON.`

  const userMsg = `Date du jour : ${todayISO()}\n\n${texte}`
  const raw = await callClaude(system, userMsg, { maxTokens: 1200, temperature: 0 })
  return parseJSON(raw)
}

// ── Analyse un document (image ou PDF) ────────────────────────────────────
export async function analyserDocument(base64, mimeType = 'image/jpeg') {
  const system = `${CONTEXTE_SUISSE}

Analyse ce document (courrier, facture, décision administrative, contrat, rappel, sommation, etc.) reçu par un utilisateur en Suisse.

Identifie et extrais :
- Émetteur (organisme, entreprise, administration)
- Objet principal du document
- Montant éventuel en CHF
- Date d'émission (pour la description uniquement, PAS pour l'échéance)
- Date d'échéance / délai d'action (pour le champ "echeance")

Retourne UNIQUEMENT un objet JSON valide :
{
  "titre": "string court (max 6 mots, ex: 'Facture EWZ novembre', 'Sommation loyer', 'Décision permis séjour')",
  "organisme": "nom de l'émetteur ou null",
  "type": "vivant" ou "operationnel",
  "description": "résumé en 1-2 phrases : objet + montant CHF si présent + date d'émission",
  "taches": ["première action concrète", "deuxième action", ...],
  "urgence": true si échéance ≤ 7 jours ou retard, sinon false,
  "importance": true si conséquences financières/légales/administratives significatives, sinon false,
  "echeance": "YYYY-MM-DD" ou null,
  "etat": "actionnable" ou "attente_externe",
  "raisonPriorite": "une phrase directe sur l'action requise et son délai"
}

${REGLES_TACHES}

${REGLES_DATES}

${REGLE_ETAT}

Pas de texte avant ou après le JSON.`

  const key = getApiKey()
  if (!key) throw new Error('Clé API manquante. Configurez-la dans Réglages.')

  const isPDF = mimeType === 'application/pdf'
  const contentItem = isPDF
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
    : { type: 'image',    source: { type: 'base64', media_type: mimeType, data: base64 } }

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1200,
      temperature: 0,
      system,
      messages: [{
        role: 'user',
        content: [
          contentItem,
          { type: 'text', text: `Date du jour : ${todayISO()}\nAnalyse ce document et structure le dossier.` }
        ]
      }]
    })
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    const msg = err.error?.message || ''
    if (res.status === 401) throw new Error('Clé API invalide. Vérifiez vos réglages.')
    if (res.status === 429) throw new Error('Limite de requêtes atteinte. Réessayez dans quelques instants.')
    throw new Error(msg || `Erreur API (${res.status})`)
  }

  const data = await res.json()
  return parseJSON(data.content[0].text)
}

// Alias pour compatibilité
export { analyserDocument as analyserImage }

// ── Message matinal personnalisé ───────────────────────────────────────────
export async function genererMessageMatinal(dossiers) {
  if (!getApiKey() || dossiers.length === 0) return null

  const system = `${CONTEXTE_SUISSE}
Génère un bref message de début de journée (2-3 phrases maximum).
Mets en avant les 1-2 dossiers les plus urgents. Ton naturel et direct.`

  const liste = dossiers
    .map(d => {
      const priorite = d.urgence && d.importance ? 'urgent & important' :
                       d.importance ? 'important' :
                       d.urgence    ? 'urgent' : 'à surveiller'
      const ech = d.echeance ? `, échéance ${d.echeance}` : ''
      return `- "${d.titre}"${d.organisme ? ` (${d.organisme})` : ''} — ${priorite}${ech}`
    })
    .join('\n')

  return callClaude(
    system,
    `Date du jour : ${todayISO()}\n\nDossiers actifs :\n${liste}`,
    { maxTokens: 250, temperature: 0.7 }
  )
}

// ── Brain dump : texte libre → plusieurs dossiers ─────────────────────────
export async function analyserBrainDump(texte) {
  if (texte.length > 12000) throw new Error('Texte trop long (maximum 12 000 caractères).')

  const system = `${CONTEXTE_SUISSE}

L'utilisateur vient de faire un "brain dump" vocal : il a parlé librement de tout ce qui l'occupe.
Ton rôle : identifier chaque sujet distinct et créer un dossier séparé pour chacun.

Retourne UNIQUEMENT un tableau JSON valide (array) de dossiers :
[
  {
    "titre": "string court (max 6 mots, factuel)",
    "organisme": "nom de l'organisme, entreprise ou personne concernée, ou null",
    "type": "vivant" ou "operationnel",
    "description": "résumé factuel en 1-2 phrases incluant les informations clés (montants CHF, références, contexte)",
    "taches": ["première action à faire", "deuxième action", ...],
    "urgence": true si échéance ≤ 7 jours ou situation critique, sinon false,
    "importance": true si les conséquences sont significatives (financières, légales, relationnelles), sinon false,
    "echeance": "YYYY-MM-DD" ou null,
    "etat": "actionnable" ou "attente_externe",
    "raisonPriorite": "une phrase directe expliquant pourquoi agir maintenant ou bientôt"
  },
  ...
]

${REGLES_TACHES}

${REGLES_DATES}

${REGLE_ETAT}

Règles de découpage :
- Crée un dossier distinct par sujet (une facture = un dossier, une démarche = un dossier, un projet = un dossier)
- Minimum 1 dossier, maximum 10 dossiers
- Ne regroupe pas des sujets différents dans un seul dossier
- Si le même sujet est mentionné plusieurs fois, crée un seul dossier
- Ignore les apartés sans action concrète (météo, anecdotes, commentaires généraux)

Pas de texte avant ou après le tableau JSON.`

  const userMsg = `Date du jour : ${todayISO()}\n\n${texte}`
  const raw = await callClaude(system, userMsg, { maxTokens: 4000, temperature: 0 })

  // Extraire le tableau JSON
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  const match   = cleaned.match(/\[[\s\S]*\]/)
  if (!match) throw new Error('Aucun JSON valide dans la réponse IA.')
  const result = JSON.parse(match[0])
  if (!Array.isArray(result) || result.length === 0) throw new Error('Aucun dossier identifié.')
  return result
}

// ── Estimation IA des durées de tâches pour le planning ───────────────────
// taches : [{ id, titre, dossierTitre, organisme }]
// Retourne : [{ tacheId, dureeMin }]
export async function estimerDureesIA(taches) {
  if (!taches.length) return []

  const system = `${CONTEXTE_SUISSE}
Tu es un planificateur expert. Estime la durée réaliste en minutes pour accomplir chaque tâche administrative.
Règles indicatives : appel = 15-30 min, lettre/rédaction = 45-90 min, formulaire simple = 20-30 min, déclaration complexe = 90-120 min, scanner/payer = 10-15 min, rendez-vous = 60 min.
Retourne UNIQUEMENT un objet JSON : {"durees":[{"tacheId":"...","dureeMin":30},...]}`

  const liste = taches
    .map(t => `id="${t.id}" | "${t.titre}"${t.dossierTitre ? ` (${t.dossierTitre}${t.organisme ? ', ' + t.organisme : ''})` : ''}`)
    .join('\n')

  const raw = await callClaude(system, `Tâches à planifier :\n${liste}`, { maxTokens: 700, temperature: 0 })
  const parsed = parseJSON(raw)
  return Array.isArray(parsed.durees) ? parsed.durees : []
}

// ── Explication "pourquoi aujourd'hui" ────────────────────────────────────
export async function genererRaison(dossier) {
  if (!getApiKey()) return ''

  const system = `${CONTEXTE_SUISSE}
En une phrase courte et directe, explique pourquoi ce dossier mérite attention aujourd'hui.`

  const ctx = `Date du jour : ${todayISO()}
Dossier : ${dossier.titre}${dossier.organisme ? ` — ${dossier.organisme}` : ''}.
État : ${dossier.etat}. Urgence : ${dossier.urgence}. Importance : ${dossier.importance}.
Échéance : ${dossier.echeance || 'aucune'}.`

  return callClaude(system, ctx, { maxTokens: 120, temperature: 0.3 })
}
