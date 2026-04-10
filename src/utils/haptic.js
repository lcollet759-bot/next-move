/**
 * Retour haptique via Vibration API (supporté sur Android Chrome, ignoré sur iOS/desktop)
 */
export function haptic(type = 'light') {
  if (typeof navigator === 'undefined' || !navigator.vibrate) return
  const patterns = {
    light:   8,
    medium:  25,
    heavy:   50,
    success: [8, 20, 8],
    error:   [30, 10, 30],
  }
  navigator.vibrate(patterns[type] ?? 8)
}
