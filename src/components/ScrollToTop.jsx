import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

/**
 * Remet le conteneur scrollable à zéro à chaque changement de route.
 */
export default function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    const page = document.querySelector('.page')
    if (page) page.scrollTop = 0
  }, [pathname])
  return null
}
