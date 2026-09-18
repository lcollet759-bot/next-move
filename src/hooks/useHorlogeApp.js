/**
 * Horloge partagée de l'application — un seul jeu d'écouteurs, aucun polling.
 *
 * Retourne :
 * - `jour` : jour civil Europe/Zurich ('YYYY-MM-DD'). Son identité ne change QUE lorsque le jour change,
 *   il est donc utilisable tel quel en dépendance de `useMemo` sans provoquer de recalcul inutile.
 * - `tick` : horodatage avancé à chaque instant où l'affichage peut changer sans que les données bougent —
 *   minuit et retour de l'application au premier plan.
 * - `synchroniser` : à appeler pour un instant supplémentaire propre à une page (par exemple une heure fixe
 *   qui devient « passée », cf. delaiAvantChangement de utils/planJournee). La page arme son propre minuteur
 *   ciblé ; les écouteurs de premier plan, eux, restent ici et ne sont jamais dupliqués.
 *
 * Un minuteur unique jusqu'à minuit, réarmé après chaque déclenchement : jamais de setInterval,
 * jamais de réveil périodique.
 *
 * Limite connue (identique à celle de delaiAvantChangement, déjà en production) : le délai jusqu'à minuit
 * est calculé à partir du temps écoulé dans la journée. La nuit du passage à l'heure d'été, où la journée
 * civile ne dure que 23 heures, le minuteur peut se déclencher jusqu'à une heure après minuit si l'application
 * reste ouverte sans interaction. Tout retour au premier plan corrige immédiatement. La nuit du retour à
 * l'heure d'hiver (25 heures), le minuteur se déclenche trop tôt : le jour n'ayant pas changé, il se réarme
 * simplement sur le temps restant réel.
 */
import { useCallback, useEffect, useState } from 'react'
import { APP_TIME_ZONE, todayISO } from '../utils/date'

const JOUR_MS = 86_400_000
const DELAI_MINIMUM_MS = 1000   // garde-fou : un minuteur ne peut jamais être réarmé immédiatement

const heureFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: APP_TIME_ZONE, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
})

// Millisecondes jusqu'au prochain minuit Europe/Zurich, avec une seconde de marge
// pour que la bascule de jour soit acquise quand le minuteur se déclenche.
export function msAvantMinuit(maintenant = new Date()) {
  const [heures, minutes, secondes] = heureFormatter.format(maintenant).split(':').map(Number)
  const ecoule = ((heures * 60 + minutes) * 60 + secondes) * 1000 + maintenant.getMilliseconds()
  return JOUR_MS - ecoule + DELAI_MINIMUM_MS
}

export function useHorlogeApp() {
  const [jour, setJour] = useState(() => todayISO())
  const [tick, setTick] = useState(() => Date.now())

  // Le jour n'est remplacé que s'il a réellement changé : son identité reste stable au sein d'une journée.
  const synchroniser = useCallback(() => {
    setJour(precedent => {
      const courant = todayISO()
      return courant === precedent ? precedent : courant
    })
    setTick(Date.now())
  }, [])

  // Minuteur ciblé sur minuit, réarmé après chaque déclenchement
  useEffect(() => {
    const delai = Math.max(DELAI_MINIMUM_MS, msAvantMinuit())
    const minuteur = setTimeout(synchroniser, delai)
    return () => clearTimeout(minuteur)
  }, [tick, jour, synchroniser])

  // Retour au premier plan : le temps a pu avancer pendant que l'application était en arrière-plan,
  // où les minuteurs sont suspendus ou fortement ralentis (PWA Android).
  useEffect(() => {
    const auRetour = () => {
      if (document.visibilityState !== 'hidden') synchroniser()
    }
    document.addEventListener('visibilitychange', auRetour)
    window.addEventListener('focus', auRetour)
    return () => {
      document.removeEventListener('visibilitychange', auRetour)
      window.removeEventListener('focus', auRetour)
    }
  }, [synchroniser])

  return { jour, tick, synchroniser }
}
