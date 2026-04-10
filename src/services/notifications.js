const REMINDERS_KEY = 'next-move-reminders'

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
