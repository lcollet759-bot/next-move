/**
 * Date civile de l'application — source de vérité unique, fuseau Europe/Zurich.
 * Pour les timestamps techniques (createdAt, updatedAt, journal…), continuer à utiliser new Date().toISOString().
 */
export const APP_TIME_ZONE = 'Europe/Zurich'

const datePartsFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: APP_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

function dateParts(date = new Date()) {
  const parts = datePartsFormatter.formatToParts(date)
  const get = type => parts.find(p => p.type === type)?.value

  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
  }
}

// 'YYYY-MM-DD' du jour civil suisse
export function todayISO(date = new Date()) {
  const { year, month, day } = dateParts(date)
  return `${year}-${month}-${day}`
}

// Ex. « vendredi 11 septembre »
export function todayFR(date = new Date()) {
  return new Intl.DateTimeFormat('fr-CH', {
    timeZone: APP_TIME_ZONE,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(date)
}

// Jour du mois (1-31) et jour de semaine (0 = dimanche … 6 = samedi) du jour civil suisse
export function todayCalendarParts(date = new Date()) {
  const { year, month, day } = dateParts(date)

  // Midi UTC du jour civil suisse : getUTCDay() ne dépend plus du fuseau du terminal
  const safeDate = new Date(
    Date.UTC(Number(year), Number(month) - 1, Number(day), 12)
  )

  return {
    day: Number(day),
    dayOfWeek: safeDate.getUTCDay(),
  }
}

// ── Planification des tâches (datePlanifiee 'YYYY-MM-DD' / heurePlanifiee 'HH:MM') ──
// Lecture seule et tolérante : une valeur invalide équivaut à « non planifiée »,
// elle ne doit jamais faire disparaître une tâche.
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

// Format 'YYYY-MM-DD' ET date réellement existante (rejette 2026-02-31, 2026-13-01…)
export function isValidISODate(value) {
  if (typeof value !== 'string' || !ISO_DATE_RE.test(value)) {
    return false
  }

  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  )
}

// Heure 'HH:MM' sur 24 h (rejette '14h', '24:00', '9:00'…)
export function isValidISOTime(value) {
  return typeof value === 'string' && TIME_RE.test(value)
}

function taskDateISO(task) {
  return isValidISODate(task?.datePlanifiee)
    ? task.datePlanifiee
    : null
}

function taskTime(task) {
  return isValidISOTime(task?.heurePlanifiee)
    ? task.heurePlanifiee
    : null
}

// Tâche non terminée, prévue aujourd'hui avec une heure valide → « Planifié aujourd'hui »
export function isTaskTimedToday(task, referenceISO = todayISO()) {
  return Boolean(
    task &&
    !task.done &&
    taskDateISO(task) === referenceISO &&
    taskTime(task)
  )
}

// Tâche éligible à la file d'action (Maintenant / Ensuite / Focus)
export function isTaskInActionQueue(task, referenceISO = todayISO()) {
  if (!task || task.done) return false

  const date = taskDateISO(task)

  // Ancienne tâche ou date invalide : ne jamais la faire disparaître
  if (!date) return true

  // Tâche future : pas encore actionnable
  if (date > referenceISO) return false

  // Tâche en retard : elle redevient actionnable
  if (date < referenceISO) return true

  // Aujourd'hui : avec heure valide → « Planifié aujourd'hui », sans heure → file normale
  return !taskTime(task)
}
