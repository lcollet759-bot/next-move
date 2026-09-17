/**
 * Mise à jour des dates d'une tâche (datePlanifiee, heurePlanifiee, echeance), sans IA ni accès aux données.
 * Retourne les `updates` à passer à mettreAJourDossier.
 *
 * L'échéance du dossier est calculée depuis celles des tâches à la création, puis jamais recalculée.
 * Quand l'échéance d'une tâche change, et seulement si l'échéance du dossier est strictement égale à l'ancienne
 * échéance de cette tâche (sans autre tâche portant la même date), elle est considérée comme sa copie dérivée
 * et suit la nouvelle valeur (null si l'échéance de la tâche est supprimée).
 * Une échéance du dossier différente est une échéance générale : elle n'est jamais modifiée ici.
 */
export function majDatesTache(dossier, tacheId, champs) {
  const taches = Array.isArray(dossier?.taches) ? dossier.taches : []
  const tache = taches.find(t => t?.id === tacheId)
  const updates = { taches: taches.map(t => (t?.id === tacheId ? { ...t, ...champs } : t)) }
  if (!tache || !('echeance' in champs)) return updates

  const ancienne = tache.echeance ?? null
  const nouvelle = champs.echeance ?? null
  const copieDerivee = ancienne !== null
    && dossier.echeance === ancienne
    && !taches.some(t => t?.id !== tacheId && t?.echeance === ancienne)
  if (ancienne !== nouvelle && copieDerivee) updates.echeance = nouvelle
  return updates
}
