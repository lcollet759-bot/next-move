import { useState, useEffect } from 'react'
import { useApp } from '../context/AppContext'
import { getEtapesForDossier } from '../services/db'

export function useDossier(dossierId) {
  const app = useApp()
  const { dossiers, mettreAJourDossier, authUser } = app

  const dossier = dossiers.find(d => d.id === dossierId)

  const [etapes, setEtapes] = useState([])

  const reloadEtapes = () => {
    if (!dossierId) return Promise.resolve()
    return getEtapesForDossier(dossierId, authUser?.id).then(setEtapes)
  }

  useEffect(() => {
    if (dossier) reloadEtapes()
  }, [dossier]) // eslint-disable-line

  const isClos     = dossier?.etat === 'clos'
  const tachesDone = dossier ? dossier.taches.filter(t => t.done).length : 0
  const total      = dossier ? dossier.taches.length : 0
  const pct        = total > 0 ? (tachesDone / total) * 100 : 0

  const save = (updates) => mettreAJourDossier(dossierId, updates).then(() => reloadEtapes())

  return { ...app, dossier, etapes, isClos, tachesDone, total, pct, reloadEtapes, save }
}
