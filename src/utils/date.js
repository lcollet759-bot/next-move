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
