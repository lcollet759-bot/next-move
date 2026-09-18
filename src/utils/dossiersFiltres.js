/**
 * Recherche, filtres temporels et tris de la page Dossiers et des tâches d'un dossier.
 * Logique pure, sans IA ni accès aux données. Dates civiles Europe/Zurich via utils/date (todayISO).
 * Les tâches terminées sont toujours ignorées ; une date absente, null ou invalide équivaut à « pas de date ».
 */
import { todayISO, isValidISODate, isValidISOTime } from './date'

const dateValide  = v => (isValidISODate(v) ? v : null)
const heureValide = v => (isValidISOTime(v) ? v : null)

// Date civile + n jours : arithmétique de calendrier sur 'YYYY-MM-DD' (UTC sert de calendrier neutre, aucun fuseau)
function ajouterJoursISO(iso, jours) {
  const [year, month, day] = iso.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day + jours)).toISOString().slice(0, 10)
}

const tachesDe = dossier => (Array.isArray(dossier?.taches) ? dossier.taches : [])
  .map(t => (t && typeof t === 'object' ? t : { titre: String(t ?? '') }))
const tachesActives = dossier => tachesDe(dossier).filter(t => !t.done)

// ── Recherche ─────────────────────────────────────────────────────────────────
// Insensible à la casse et aux accents, espaces superflus ignorés.
export function normaliserTexte(valeur) {
  return String(valeur ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

// Cherche dans le titre, l'organisme, la description et la raison affichée du dossier, et dans les titres de ses tâches.
export function dossierCorrespond(dossier, recherche) {
  const q = normaliserTexte(recherche)
  if (!q) return true
  const textes = [dossier?.titre, dossier?.organisme, dossier?.description, dossier?.raisonAujourdhui, ...tachesDe(dossier).map(t => t.titre)]
  return textes.some(t => normaliserTexte(t).includes(q))
}

// ── Filtres temporels ─────────────────────────────────────────────────────────
// Un dossier correspond si au moins une tâche active remplit la règle. Une date planifiée passée reste une date
// planifiée : elle est seulement regroupée avec les échéances dépassées dans « En retard ».
export const FILTRES_TEMPS = [
  { key: 'retard',     label: 'En retard' },
  { key: 'aujourdhui', label: "Aujourd'hui" },
  { key: 'semaine',    label: 'Échéance ≤ 7 jours' },
  { key: 'avenir',     label: 'Planifié à venir' },
  { key: 'sansdate',   label: 'Sans date' },
]

const REGLES_TEMPS = {
  retard:     (t, j) => { const e = dateValide(t.echeance), p = dateValide(t.datePlanifiee); return Boolean((e && e < j) || (p && p < j)) },
  aujourdhui: (t, j) => dateValide(t.datePlanifiee) === j || dateValide(t.echeance) === j,
  semaine:    (t, j, j7) => { const e = dateValide(t.echeance); return Boolean(e) && e >= j && e <= j7 },
  avenir:     (t, j) => { const p = dateValide(t.datePlanifiee); return Boolean(p) && p > j },
  sansdate:   t => !dateValide(t.datePlanifiee) && !dateValide(t.echeance),
}

export function dossierCorrespondTemps(dossier, filtre, referenceISO = todayISO()) {
  const regle = REGLES_TEMPS[filtre]
  if (!regle) return true
  const j7 = ajouterJoursISO(referenceISO, 7)
  return tachesActives(dossier).some(t => regle(t, referenceISO, j7))
}

// Même règle de période, appliquée à une seule tâche (liste transversale des tâches du Pupitre).
// Le filtre porte sur les dates de la tâche : l'état fait / non fait est filtré à part par l'appelant.
export function tacheCorrespondTemps(tache, filtre, referenceISO = todayISO()) {
  const regle = REGLES_TEMPS[filtre]
  if (!regle) return true
  const t = tache && typeof tache === 'object' ? tache : {}
  return regle(t, referenceISO, ajouterJoursISO(referenceISO, 7))
}

// ── Tris ──────────────────────────────────────────────────────────────────────
// Échéance et date planifiée ne sont jamais mélangées : chaque tri n'utilise que son propre champ.
export const TRIS = [
  { key: 'actuel',        label: 'Ordre actuel',                        court: 'Trier' },
  { key: 'echeance-asc',  label: 'Échéance : proche → lointaine',       court: 'Échéance · proche' },
  { key: 'echeance-desc', label: 'Échéance : lointaine → proche',       court: 'Échéance · lointaine' },
  { key: 'plan-asc',      label: 'Date planifiée : proche → lointaine', court: 'Planifié · proche' },
  { key: 'plan-desc',     label: 'Date planifiée : lointaine → proche', court: 'Planifié · lointaine' },
]

const PARAMS_TRI = {
  'echeance-asc':  ['echeance', 1],
  'echeance-desc': ['echeance', -1],
  'plan-asc':      ['datePlanifiee', 1],
  'plan-desc':     ['datePlanifiee', -1],
}

// Deux tâches datées sur le même champ : jour, puis (date planifiée seulement) heure dans le même sens ;
// le même jour, une tâche avec heure passe avant une tâche sans heure. 0 = égalité (ordre d'origine conservé).
function comparerTachesDatees(a, b, champ, sens) {
  const da = dateValide(a[champ]), db = dateValide(b[champ])
  if (da !== db) return da < db ? -sens : sens
  if (champ !== 'datePlanifiee') return 0
  const ha = heureValide(a.heurePlanifiee), hb = heureValide(b.heurePlanifiee)
  if (ha && hb) return ha === hb ? 0 : (ha < hb ? -sens : sens)
  if (ha) return -1
  if (hb) return 1
  return 0
}

// Tâches d'un dossier : actives triées (celles sans la date du tri après les datées, dans leur ordre d'origine),
// puis tâches terminées dans leur ordre d'origine. « Ordre actuel » : liste inchangée.
export function trierTaches(taches, tri) {
  const liste = Array.isArray(taches) ? taches : []
  const params = PARAMS_TRI[tri]
  if (!params) return liste
  const [champ, sens] = params
  const indexees = liste.map((t, i) => ({ t, i, o: t && typeof t === 'object' ? t : {} }))
  const actives = indexees.filter(x => !x.o.done)
  const datees = actives.filter(x => dateValide(x.o[champ])).sort((x, y) => comparerTachesDatees(x.o, y.o, champ, sens) || x.i - y.i)
  const sansDate = actives.filter(x => !dateValide(x.o[champ]))
  const faites = indexees.filter(x => x.o.done)
  return [...datees, ...sansDate, ...faites].map(x => x.t)
}

// Ordre actuel de la page Dossiers : quadrant, puis dernière mise à jour (la plus récente d'abord).
export function comparerOrdreActuel(a, b) {
  return (a.quadrant - b.quadrant) || String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? ''))
}

// Dossiers : positionnés selon la tâche active qui arrive en tête pour le tri choisi (première date en « proche →
// lointaine », plus lointaine en « lointaine → proche ») ; dossiers sans cette date toujours après les dossiers datés ;
// à égalité, ordre actuel.
export function trierDossiers(dossiers, tri) {
  const liste = [...(Array.isArray(dossiers) ? dossiers : [])].sort(comparerOrdreActuel)
  const params = PARAMS_TRI[tri]
  if (!params) return liste
  const [champ, sens] = params
  const cles = new Map(liste.map(d => [d, trierTaches(tachesActives(d), tri).find(t => dateValide(t[champ])) ?? null]))
  return liste.sort((a, b) => {
    const ka = cles.get(a), kb = cles.get(b)
    if (!ka || !kb) return ka ? -1 : kb ? 1 : 0
    return comparerTachesDatees(ka, kb, champ, sens)
  })
}
