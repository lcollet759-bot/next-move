const REMINDERS_KEY = 'next-move-reminders'
const WEEKLY_KEY    = 'nm-weekly-notif'

// ── Revue hebdomadaire (lundi matin) ──────────────────────────────────────────
// Envoie une notification listant les dossiers Q4 si c'est lundi
// et qu'on n'a pas encore notifié cette semaine ISO.
export function checkWeeklyReview(dossiers) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return

  const now = new Date()
  if (now.getDay() !== 1) return                        // 0=dim, 1=lun, …

  const weekKey = isoWeekKey(now)
  if (localStorage.getItem(WEEKLY_KEY) === weekKey) return  // déjà envoyé

  const q4 = dossiers.filter(d => d.quadrant === 4 && d.etat !== 'clos')
  if (q4.length === 0) return

  const lines = q4.slice(0, 3).map(d => `· ${d.titre}`).join('\n')
  const more  = q4.length > 3 ? `\n+ ${q4.length - 3} autre${q4.length - 3 > 1 ? 's' : ''}` : ''

  notify(
    `${q4.length} dossier${q4.length > 1 ? 's' : ''} en attente de décision`,
    `${lines}${more}\nTraiter, planifier ou supprimer ?`
  )

  localStorage.setItem(WEEKLY_KEY, weekKey)
}

// ── Escalade Q4 → Important ───────────────────────────────────────────────────
export function notifyEscalade(titre) {
  notify(
    'Dossier devenu prioritaire',
    `"${titre}" attend depuis 15 jours — il devient important.`
  )
}

// Calcule la clé de semaine ISO (ex : "2026-W15") pour un Date donné.
function isoWeekKey(date) {
  const d   = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const day = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const week      = Math.ceil(((d - yearStart) / 86_400_000 + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

export async function requestPermission() {
  if (!('Notification' in window)) return 'unsupported'
  if (Notification.permission === 'granted') return 'granted'
  return Notification.requestPermission()
}

export function setReminder(dossierId, titre, echeance) {
  if (!echeance) return
  const reminders = getReminders()
  const idx = reminders.findIndex(r => r.dossierId === dossierId)
  const entry = { dossierId, titre, echeance, notifiedAt: null }
  if (idx >= 0) reminders[idx] = entry
  else reminders.push(entry)
  saveReminders(reminders)
}

export function removeReminder(dossierId) {
  const reminders = getReminders().filter(r => r.dossierId !== dossierId)
  saveReminders(reminders)
}

export function checkReminders() {
  if (!('Notification' in window) || Notification.permission !== 'granted') return

  const reminders = getReminders()
  const now   = new Date()
  const today = now.toDateString()
  const DAY   = 24 * 60 * 60 * 1000

  const updated = reminders.map(r => {
    if (!r.echeance) return r
    // Parsing heure locale — évite le décalage UTC en Suisse (UTC+1/+2)
    const due  = new Date(r.echeance + 'T00:00:00')
    const diff = due - now

    // Une seule notification par jour
    if (r.notifiedAt === today) return r

    if (diff < 0) {
      notify('Échéance dépassée', `"${r.titre}" — délai dépassé.`)
      return { ...r, notifiedAt: today }
    }
    if (diff <= DAY) {
      notify('Échéance aujourd\'hui', `"${r.titre}" est à traiter aujourd'hui.`)
      return { ...r, notifiedAt: today }
    }
    return r
  })

  saveReminders(updated)
}

function notify(title, body) {
  try {
    new Notification(title, { body, icon: '/favicon.svg', badge: '/favicon.svg' })
  } catch {}
}

function getReminders() {
  try { return JSON.parse(localStorage.getItem(REMINDERS_KEY) || '[]') } catch { return [] }
}

function saveReminders(reminders) {
  localStorage.setItem(REMINDERS_KEY, JSON.stringify(reminders))
}
