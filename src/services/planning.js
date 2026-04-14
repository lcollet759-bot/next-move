// ── Service Planning — algorithmes purs ──────────────────────────────────────
// Pas de dépendance React ni Supabase. Importable partout.

// ── Estimation de durée par mots-clés (fallback sans IA) ─────────────────────
const REGLES_DUREE = [
  { mots: ['tribunal', 'audience', 'plainte', 'recours', 'juridiction'], min: 120 },
  { mots: ['déclaration', 'déclarations', 'formulaire', 'saisir', 'remplir'], min: 90 },
  { mots: ['rédiger', 'lettre', 'courrier', 'courriel', 'email', 'mise en demeure', 'rédaction', 'contrat'], min: 60 },
  { mots: ['rendez-vous', ' rdv', 'entretien', 'réunion'], min: 60 },
  { mots: ['rassembler', 'préparer', 'réunir', 'collecter', 'chercher', 'documents'], min: 30 },
  { mots: ['appel', 'téléphon', 'appeler', 'contacter', 'joindre'], min: 20 },
  { mots: ['relancer', 'rappeler', 'rappel', 'relance', 'suivi'], min: 15 },
  { mots: ['envoyer', 'transmettre', 'soumettre', 'poster', 'déposer'], min: 20 },
  { mots: ['vérifier', 'contrôler', 'consulter', 'lire', 'examiner'], min: 20 },
  { mots: ['payer', 'virement', 'régler', 'qr', 'facture', 'paiement'], min: 15 },
  { mots: ['télécharger', 'imprimer', 'copier'], min: 10 },
  { mots: ['scanner', 'photocopier', 'numériser'], min: 10 },
  { mots: ['signer', 'signature', 'approuver'], min: 10 },
]

export function estimerDureeFallback(titreTache) {
  const t = (titreTache || '').toLowerCase()
  for (const { mots, min } of REGLES_DUREE) {
    if (mots.some(m => t.includes(m))) return min
  }
  return 45
}

// ── Helpers temps ─────────────────────────────────────────────────────────────

export function minutesToHHMM(totalMin) {
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return `${String(h).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

export function hhmmToMinutes(hhmm) {
  const [h, m] = (hhmm || '09:00').split(':').map(Number)
  return h * 60 + m
}

// Heure de départ : heure actuelle arrondie au quart d'heure, minimum 9h
export function heureDeDepart() {
  const now = new Date()
  const totalMin = now.getHours() * 60 + now.getMinutes()
  const arrondi  = Math.ceil(totalMin / 15) * 15
  return Math.max(arrondi, 9 * 60)
}

// ── Génération du planning ────────────────────────────────────────────────────
// tachesList : [{ tacheId, dossierId, titreTache, titreDossier, organisme, quadrant, dureeMin, done }]
// heuresTotales : nombre (ex : 4)
// Retourne le même tableau enrichi de heureDebut, heureFin, horsPlanning
export function genererCreneaux(tachesList, heuresTotales) {
  const startMin = heureDeDepart()
  const endMin   = startMin + Math.round(heuresTotales * 60)
  let   current  = startMin
  const result   = []

  for (const t of tachesList) {
    if (t.done) continue
    const duree = Math.max(t.dureeMin || 45, 5)
    result.push({
      ...t,
      heureDebut:   minutesToHHMM(current),
      heureFin:     minutesToHHMM(current + duree),
      horsPlanning: current + duree > endMin,
    })
    current += duree + 10   // 10 min de pause entre les tâches
  }

  return result
}

// ── Recalcul des horaires (à partir du 1er créneau, sans changer l'ordre) ─────
export function recalculerHoraires(tachesPlanifiees) {
  if (!tachesPlanifiees.length) return tachesPlanifiees
  let current = hhmmToMinutes(tachesPlanifiees[0].heureDebut)
  return tachesPlanifiees.map(t => {
    const slot = {
      ...t,
      heureDebut: minutesToHHMM(current),
      heureFin:   minutesToHHMM(current + t.dureeMin),
    }
    current += t.dureeMin + 10
    return slot
  })
}

// ── Extension d'une tâche + recalcul en cascade ───────────────────────────────
export function recalculerApresExtension(tachesPlanifiees, tacheId, dureeSupp) {
  const idx = tachesPlanifiees.findIndex(t => t.tacheId === tacheId)
  if (idx < 0) return tachesPlanifiees

  // Augmenter la durée de la tâche ciblée
  const updated = tachesPlanifiees.map((t, i) =>
    i === idx ? { ...t, dureeMin: t.dureeMin + dureeSupp } : t
  )

  // Recalculer les horaires à partir de cette tâche
  let current = hhmmToMinutes(updated[idx].heureDebut)
  const result = [...updated]
  for (let i = idx; i < result.length; i++) {
    result[i] = {
      ...result[i],
      heureDebut: minutesToHHMM(current),
      heureFin:   minutesToHHMM(current + result[i].dureeMin),
    }
    current += result[i].dureeMin + 10
  }
  return result
}

// ── Formatage de la durée ─────────────────────────────────────────────────────
export function formatDuree(min) {
  if (!min || min < 1) return '—'
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`
}
