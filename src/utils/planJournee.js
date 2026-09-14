/**
 * Plan du jour de la page Aujourd'hui : les faits sont établis par le code, jamais par l'IA.
 * Logique pure, sans IA ni accès aux données. Dates civiles Europe/Zurich via utils/date.
 *
 * Chaque tâche active (non terminée, dossier non clos) est classée dans une seule section, par ordre de gravité :
 * heure fixe aujourd'hui → échéance dépassée → échéance aujourd'hui → prévue aujourd'hui sans heure → retard de
 * planification → échéance ≤ 7 jours → sans date imposée. Les autres faits de la tâche restent en annotation.
 * Le texte produit est destiné au modèle, qui ordonne et rédige sans recalculer de date, d'heure, de durée ni de tâche.
 *
 * - Les contraintes du jour (heures fixes, échéances dépassées, échéances du jour) ne sont jamais plafonnées ;
 *   elles sont prises dans tout dossier non clos. Seules les actions à choisir sont plafonnées, et uniquement
 *   dans les dossiers « À traiter », comme la file d'action de la page.
 * - L'urgence et le quadrant stockés (figés à la création) ne servent jamais au classement ; l'importance du dossier,
 *   puis le quadrant, ne servent qu'à départager les actions sans date.
 * - La signature ne dépend que des données utiles : ni l'heure actuelle ni le nombre exact de jours d'attente
 *   n'y entrent, pour qu'un simple retour sur la page ne provoque aucun nouvel appel.
 */
import { APP_TIME_ZONE, todayISO, isValidISODate, isValidISOTime } from './date'

export const SEUIL_RELANCE_JOURS = 15    // même seuil que le bloc « En attente de retour » (Aujourdhui.jsx)
const HORIZON_ECHEANCE_JOURS = 7         // même horizon que l'urgence calculée et le filtre « Échéance ≤ 7 jours »
const SEUILS_CHARGE = { normale: 3, chargee: 6 }

// Plafonds des actions à choisir. Les contraintes du jour n'en ont pas.
export const PLAFONDS = {
  planifieAujourdhui:   8,
  retardsPlanification: 5,
  echeancesProches:     5,
  sansDate:             6,
  relances:             3,
  bloques:              3,
}

const SECTIONS_TACHES = [
  'heuresFixes', 'echeancesDepassees', 'echeancesAujourdhui',
  'planifieAujourdhui', 'retardsPlanification', 'echeancesProches', 'sansDate',
]

// Libellés visibles (règle UX : zéro statut technique)
const ETATS_LIBELLES = {
  actionnable:     'À traiter',
  attente_externe: "J'attends un retour",
  bloque:          'Bloqué',
  surveille:       "À l'œil",
}

const NIVEAUX_CHARGE = { legere: 'journée légère', normale: 'journée normale', chargee: 'journée chargée' }

const JOUR_MS = 86_400_000
const LONGUEUR_MAX_TITRE = 140

const dateValide  = v => (isValidISODate(v) ? v : null)
const heureValide = v => (isValidISOTime(v) ? v : null)

function texteCourt(valeur) {
  const texte = String(valeur ?? '').replace(/\s+/g, ' ').trim()
  return texte.length > LONGUEUR_MAX_TITRE ? `${texte.slice(0, LONGUEUR_MAX_TITRE)}…` : texte
}

const tachesDe = dossier => (Array.isArray(dossier?.taches) ? dossier.taches : [])
  .map(t => (t && typeof t === 'object' ? t : { titre: String(t ?? '') }))

// ── Calendrier (UTC sert de calendrier neutre, aucun décalage de fuseau) ─────────
function utcMidi(iso) {
  const [year, month, day] = iso.split('-').map(Number)
  return Date.UTC(year, month - 1, day, 12)
}

function ajouterJoursISO(iso, jours) {
  return new Date(utcMidi(iso) + jours * JOUR_MS).toISOString().slice(0, 10)
}

// Nombre de jours civils de `de` à `a` (négatif si `a` est avant `de`)
const ecartJours = (de, a) => Math.round((utcMidi(a) - utcMidi(de)) / JOUR_MS)

const heureFormatter = new Intl.DateTimeFormat('en-GB', { timeZone: APP_TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
const jourFormatter = new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' })
const jourAnneeFormatter = new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

// 'HH:MM' Europe/Zurich
const heureZurich = (date = new Date()) => heureFormatter.format(date)

// « mardi 15 septembre », avec l'année seulement si elle diffère de celle de référence
const formatJour = (iso, referenceISO) =>
  (iso.slice(0, 4) === referenceISO.slice(0, 4) ? jourFormatter : jourAnneeFormatter).format(new Date(utcMidi(iso)))

function jourRelatif(iso, referenceISO) {
  const n = ecartJours(referenceISO, iso)
  if (n === 0)  return "aujourd'hui"
  if (n === 1)  return `demain (${formatJour(iso, referenceISO)})`
  if (n === -1) return `hier (${formatJour(iso, referenceISO)})`
  return `le ${formatJour(iso, referenceISO)}`
}

const compte = (n, singulier, pluriel) => `${n} ${n > 1 ? pluriel : singulier}`

// ── Classement ──────────────────────────────────────────────────────────────────
function classerEcheance(echeance, referenceISO, horizonISO) {
  if (echeance < referenceISO)   return 'echeancesDepassees'
  if (echeance === referenceISO) return 'echeancesAujourdhui'
  if (echeance <= horizonISO)    return 'echeancesProches'
  return null
}

// Une seule section par tâche ; null = rien à proposer aujourd'hui (tâche planifiée plus tard, sans échéance proche)
function classerTache(item, referenceISO, horizonISO) {
  const { datePlanifiee: plan, heurePlanifiee: heure, echeance } = item
  if (plan === referenceISO && heure) return 'heuresFixes'
  const parEcheance = echeance ? classerEcheance(echeance, referenceISO, horizonISO) : null
  if (parEcheance === 'echeancesDepassees' || parEcheance === 'echeancesAujourdhui') return parEcheance
  // Dossier en attente, bloqué ou à l'œil : seules ses dates imposées comptent, jamais une action à choisir
  if (item.etat !== 'actionnable') return parEcheance
  if (plan === referenceISO)          return 'planifieAujourdhui'
  if (plan && plan < referenceISO)    return 'retardsPlanification'
  if (parEcheance)                    return parEcheance
  return plan ? null : 'sansDate'
}

// ── Tris (déterministes, ordre d'origine en dernier recours) ─────────────────────
const parOrdre = (a, b) => a.ordreDossier - b.ordreDossier || a.ordreTache - b.ordreTache
const parImportance = (a, b) => Number(b.importance) - Number(a.importance)
const parDate = champ => (a, b) => {
  const x = a[champ], y = b[champ]
  if (x === y) return 0
  if (!x) return 1
  if (!y) return -1
  return x < y ? -1 : 1
}
const parEcheance = parDate('echeance')
const parDatePlanifiee = parDate('datePlanifiee')

const TRIS = {
  heuresFixes:          (a, b) => a.heurePlanifiee.localeCompare(b.heurePlanifiee) || parOrdre(a, b),
  echeancesDepassees:   (a, b) => parEcheance(a, b) || parImportance(a, b) || parOrdre(a, b),
  echeancesAujourdhui:  (a, b) => parImportance(a, b) || parOrdre(a, b),
  planifieAujourdhui:   (a, b) => parEcheance(a, b) || parImportance(a, b) || parOrdre(a, b),
  retardsPlanification: (a, b) => parDatePlanifiee(a, b) || parImportance(a, b) || parOrdre(a, b),
  echeancesProches:     (a, b) => parEcheance(a, b) || parImportance(a, b) || parOrdre(a, b),
  // Prochaine étape de chaque dossier d'abord (ordre logique des tâches), puis faits datés, puis signaux secondaires
  sansDate:             (a, b) => a.rang - b.rang || parEcheance(a, b) || parImportance(a, b) || a.quadrant - b.quadrant || parOrdre(a, b),
}

// ── Construction ────────────────────────────────────────────────────────────────
// options.maintenant : instant de référence (défaut : maintenant) — date du jour, heure actuelle et jours d'attente
// Retourne { referenceISO, heureActuelle, sections, relances, autresAttentes, bloques, masques, charge, vide, texte, signature }
export function construirePlanJournee(dossiers, { maintenant = new Date() } = {}) {
  const referenceISO = todayISO(maintenant)
  const heureActuelle = heureZurich(maintenant)
  const horizonISO = ajouterJoursISO(referenceISO, HORIZON_ECHEANCE_JOURS)

  const sections = Object.fromEntries(SECTIONS_TACHES.map(cle => [cle, []]))
  const attentes = []
  const bloquesTous = []

  const liste = (Array.isArray(dossiers) ? dossiers : []).filter(d => d && typeof d === 'object' && d.etat !== 'clos')
  liste.forEach((d, ordreDossier) => {
    const contexte = {
      dossierId:    d.id ?? null,
      dossierTitre: texteCourt(d.titre) || 'Sans titre',
      organisme:    texteCourt(d.organisme) || null,
      etat:         ETATS_LIBELLES[d.etat] ? d.etat : 'actionnable',   // état inconnu : ne jamais faire disparaître le dossier
      importance:   d.importance === true,
      quadrant:     Number.isInteger(d.quadrant) ? d.quadrant : 4,
      ordreDossier,
    }
    const taches = tachesDe(d)
    const actives = taches
      .map((t, ordreTache) => ({ t, ordreTache }))
      .filter(({ t }) => !t.done && texteCourt(t.titre))

    // Échéance du dossier : repli seulement si aucune tâche, active ou terminée, ne porte d'échéance
    // (sinon elle a été calculée depuis les tâches à la création et peut désigner une tâche déjà faite).
    const repli = dateValide(d.echeance) && !taches.some(t => dateValide(t.echeance)) ? d.echeance : null

    let rangSansDate = 0
    actives.forEach(({ t, ordreTache }, i) => {
      const echeanceTache = dateValide(t.echeance)
      const echeance = echeanceTache ?? (i === 0 ? repli : null)   // le repli s'attache à la prochaine tâche du dossier
      const datePlanifiee = dateValide(t.datePlanifiee)
      const duree = Number(t.dureeMin)
      const item = {
        ...contexte,
        tacheId:        typeof t.id === 'string' && t.id ? t.id : `${contexte.dossierId}#${ordreTache}`,
        titre:          texteCourt(t.titre),
        datePlanifiee,
        heurePlanifiee: datePlanifiee ? heureValide(t.heurePlanifiee) : null,
        echeance,
        echeanceSource: echeance ? (echeanceTache ? 'tache' : 'dossier') : null,
        dureeMin:       Number.isFinite(duree) && duree > 0 ? Math.round(duree) : null,
        ordreTache,
      }
      const section = classerTache(item, referenceISO, horizonISO)
      if (!section) return
      if (section === 'sansDate') item.rang = rangSansDate++
      sections[section].push(item)
    })

    // Dossier sans aucune tâche (ex. attente créée sans action) : son échéance reste visible
    if (repli && taches.length === 0) {
      const section = classerEcheance(repli, referenceISO, horizonISO)
      if (section) {
        sections[section].push({
          ...contexte, tacheId: null, titre: null, datePlanifiee: null, heurePlanifiee: null,
          echeance: repli, echeanceSource: 'dossier', dureeMin: null, ordreTache: -1,
        })
      }
    }

    if (contexte.etat === 'attente_externe') {
      // Même calcul que le bloc « En attente de retour », pour annoncer le même nombre de jours
      const jours = Math.floor((maintenant - new Date(d.lastActionAt ?? d.updatedAt)) / JOUR_MS)
      attentes.push({ ...contexte, jours: Number.isFinite(jours) ? jours : null })
    }
    if (contexte.etat === 'bloque') bloquesTous.push({ ...contexte, tachesEnSuspens: actives.length })
  })

  // Totaux avant plafonds (charge), puis tri et plafonds des actions à choisir
  const totaux = Object.fromEntries(SECTIONS_TACHES.map(cle => [cle, sections[cle].length]))
  const masques = {}
  for (const cle of SECTIONS_TACHES) {
    sections[cle].sort(TRIS[cle])
    const plafond = PLAFONDS[cle]
    masques[cle] = plafond && sections[cle].length > plafond ? sections[cle].length - plafond : 0
    if (masques[cle]) sections[cle] = sections[cle].slice(0, plafond)
  }
  sections.heuresFixes.forEach(item => { item.passee = item.heurePlanifiee < heureActuelle })

  attentes.sort((a, b) => (b.jours ?? -1) - (a.jours ?? -1) || a.ordreDossier - b.ordreDossier)
  const relancesToutes = attentes.filter(a => a.jours !== null && a.jours >= SEUIL_RELANCE_JOURS)
  const relances = relancesToutes.slice(0, PLAFONDS.relances)
  masques.relances = relancesToutes.length - relances.length
  const autresAttentes = attentes.length - relancesToutes.length
  const bloques = bloquesTous.slice(0, PLAFONDS.bloques)
  masques.bloques = bloquesTous.length - bloques.length

  const engagementsDuJour = totaux.heuresFixes + totaux.echeancesDepassees + totaux.echeancesAujourdhui
    + totaux.planifieAujourdhui + totaux.retardsPlanification
  const charge = {
    ...totaux,
    relances: relancesToutes.length,
    engagementsDuJour,
    niveau: engagementsDuJour >= SEUILS_CHARGE.chargee ? 'chargee'
          : engagementsDuJour >= SEUILS_CHARGE.normale ? 'normale' : 'legere',
  }
  const vide = SECTIONS_TACHES.every(cle => totaux[cle] === 0) && relancesToutes.length === 0

  const plan = { referenceISO, heureActuelle, sections, relances, autresAttentes, bloques, masques, charge, vide }
  return { ...plan, texte: redigerPlan(plan), signature: signaturePlan(plan) }
}

// ── Horloge du plan ─────────────────────────────────────────────────────────────
// Délai (ms) jusqu'au prochain instant où le plan change avec la seule heure : une heure fixe du jour qui devient
// « passée » (HH:MM + 1 min, même règle que `passee`) ou minuit Europe/Zurich. Sert à un minuteur unique, sans polling ;
// une seconde de marge garantit que la bascule est acquise quand il se déclenche.
export function delaiAvantChangement(plan, maintenant = new Date()) {
  const enMinutes = hhmm => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m }
  const actuelle = enMinutes(heureZurich(maintenant))
  const bascules = (plan?.sections?.heuresFixes ?? [])
    .map(it => enMinutes(it.heurePlanifiee) + 1)
    .filter(minute => minute > actuelle)
  const cible = Math.min(24 * 60, ...bascules)
  const ecoule = maintenant.getSeconds() * 1000 + maintenant.getMilliseconds()
  return Math.max((cible - actuelle) * 60_000 - ecoule, 0) + 1000
}

// ── Signature : données utiles uniquement (ni heure actuelle, ni jours d'attente exacts) ──
// Seul effet de l'heure : l'état « passée » d'une heure fixe du jour, qui change le plan à proposer.
const faitsTache = it => [
  it.dossierId, it.dossierTitre, it.organisme, it.etat, it.importance,
  it.tacheId, it.titre, it.datePlanifiee, it.heurePlanifiee, it.echeance, it.echeanceSource, it.dureeMin,
]

function signaturePlan(plan) {
  const faits = JSON.stringify({
    referenceISO:   plan.referenceISO,
    sections:       SECTIONS_TACHES.map(cle => plan.sections[cle].map(it =>
      cle === 'heuresFixes' ? [...faitsTache(it), it.passee] : faitsTache(it))),
    masques:        plan.masques,
    relances:       plan.relances.map(r => [r.dossierId, r.dossierTitre, r.organisme]),
    autresAttentes: plan.autresAttentes,
    bloques:        plan.bloques.map(b => [b.dossierId, b.dossierTitre, b.organisme, b.tachesEnSuspens]),
  })
  return empreinte(faits)
}

// FNV-1a 32 bits, deux graines, plus la longueur : empreinte courte et stable (pas un usage cryptographique)
function empreinte(texte) {
  let h1 = 0x811c9dc5, h2 = 0x01000193 ^ 0x5bd1e995
  for (let i = 0; i < texte.length; i++) {
    const c = texte.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 0x01000193)
    h2 = Math.imul(h2 ^ c, 0x01000193)
  }
  const hex = h => (h >>> 0).toString(16).padStart(8, '0')
  return `${texte.length.toString(36)}-${hex(h1)}${hex(h2)}`
}

// ── Texte structuré pour le modèle ──────────────────────────────────────────────
function libelleDossier(it) {
  const morceaux = [`dossier « ${it.dossierTitre} »${it.organisme ? ` (${it.organisme})` : ''}`]
  if (it.importance) morceaux.push('important')
  if (it.etat !== 'actionnable') morceaux.push(`état : ${ETATS_LIBELLES[it.etat]}`)
  return morceaux.join(' · ')
}

function noteEcheance(it, referenceISO) {
  const quoi = it.echeanceSource === 'dossier' ? 'échéance du dossier' : 'échéance'
  const n = ecartJours(referenceISO, it.echeance)
  if (n < 0)   return `${quoi} du ${formatJour(it.echeance, referenceISO)}, dépassée de ${compte(-n, 'jour', 'jours')}`
  if (n === 0) return `${quoi} aujourd'hui`
  if (n === 1) return `${quoi} ${jourRelatif(it.echeance, referenceISO)}`
  return `${quoi} ${jourRelatif(it.echeance, referenceISO)}, dans ${n} jours`
}

const noteDuree = it => (it.dureeMin ? `durée indiquée : ${it.dureeMin} min` : null)

function ligneTache(it, notes, prefixe = '') {
  const faits = notes.filter(Boolean)
  const tete = it.titre ?? 'Aucune tâche en cours'
  return `- ${prefixe}${tete} — ${libelleDossier(it)}${faits.length ? ` — ${faits.join(' · ')}` : ''}`
}

const LIGNES = {
  heuresFixes: (it, ref) => ligneTache(it, [
    it.passee ? 'heure déjà passée' : null,
    it.echeance ? noteEcheance(it, ref) : null,
    noteDuree(it),
  ], `${it.heurePlanifiee} · `),
  echeancesDepassees: (it, ref) => ligneTache(it, [
    noteEcheance(it, ref),
    it.datePlanifiee ? `prévu ${jourRelatif(it.datePlanifiee, ref)}` : null,
    noteDuree(it),
  ]),
  echeancesAujourdhui: (it, ref) => ligneTache(it, [
    noteEcheance(it, ref),
    it.datePlanifiee && it.datePlanifiee !== ref ? `prévu ${jourRelatif(it.datePlanifiee, ref)}` : null,
    noteDuree(it),
  ]),
  planifieAujourdhui: (it, ref) => ligneTache(it, [
    it.echeance ? noteEcheance(it, ref) : null,
    noteDuree(it),
  ]),
  retardsPlanification: (it, ref) => {
    const retard = -ecartJours(ref, it.datePlanifiee)
    return ligneTache(it, [
      `prévu ${jourRelatif(it.datePlanifiee, ref)}, en retard de ${compte(retard, 'jour', 'jours')}`,
      it.echeance ? noteEcheance(it, ref) : null,
      noteDuree(it),
    ])
  },
  echeancesProches: (it, ref) => ligneTache(it, [
    noteEcheance(it, ref),
    it.datePlanifiee ? `prévu ${jourRelatif(it.datePlanifiee, ref)}` : null,
    noteDuree(it),
  ]),
  sansDate: (it, ref) => ligneTache(it, [
    it.echeance ? noteEcheance(it, ref) : null,
    noteDuree(it),
  ]),
}

const TITRES = {
  heuresFixes:          "Heures fixes aujourd'hui",
  echeancesDepassees:   'Échéances dépassées',
  echeancesAujourdhui:  "Échéances aujourd'hui",
  planifieAujourdhui:   "Prévu aujourd'hui, sans heure",
  retardsPlanification: 'Planifié les jours précédents, pas encore fait',
  echeancesProches:     `Échéances dans les ${HORIZON_ECHEANCE_JOURS} prochains jours`,
  sansDate:             "Actions disponibles sans date planifiée (prochaine étape de chaque dossier d'abord)",
  relances:             `Relances possibles (aucun retour depuis ${SEUIL_RELANCE_JOURS} jours ou plus)`,
  bloques:              'Dossiers bloqués',
}

// Section obligatoire : toujours affichée, « aucune » si vide, pour que le modèle n'invente rien
function bloc(titre, lignes, masques, obligatoire) {
  if (!lignes.length && !obligatoire) return null
  const corps = lignes.length ? [...lignes] : ['- aucune']
  if (masques) corps.push(`- … et ${compte(masques, 'autre', 'autres')}, non détaillées`)
  return `${titre} :\n${corps.join('\n')}`
}

function redigerPlan(plan) {
  const { referenceISO: ref, sections, masques, charge } = plan
  const blocTaches = (cle, obligatoire) =>
    bloc(TITRES[cle], sections[cle].map(it => LIGNES[cle](it, ref)), masques[cle], obligatoire)

  const contraintes = ['heuresFixes', 'echeancesDepassees', 'echeancesAujourdhui'].map(cle => blocTaches(cle, true))

  const actions = ['planifieAujourdhui', 'retardsPlanification', 'echeancesProches', 'sansDate']
    .map(cle => blocTaches(cle, false))
  actions.push(bloc(TITRES.relances, plan.relances.map(r => `- ${libelleDossier(r)} — aucun retour depuis ${r.jours} jours`), masques.relances, false))
  if (plan.autresAttentes) {
    actions.push(`Autres dossiers en attente d'un retour depuis moins de ${SEUIL_RELANCE_JOURS} jours : ${plan.autresAttentes}`)
  }
  const actionsPresentes = actions.filter(Boolean)

  const info = bloc(TITRES.bloques, plan.bloques.map(b => `- ${libelleDossier(b)} — ${compte(b.tachesEnSuspens, 'tâche en suspens', 'tâches en suspens')}`), masques.bloques, false)

  const ligneCharge = `CHARGE DU JOUR : ${[
    compte(charge.heuresFixes, 'heure fixe', 'heures fixes'),
    compte(charge.echeancesDepassees, 'échéance dépassée', 'échéances dépassées'),
    compte(charge.echeancesAujourdhui, "échéance aujourd'hui", "échéances aujourd'hui"),
    compte(charge.planifieAujourdhui, 'tâche prévue sans heure', 'tâches prévues sans heure'),
    compte(charge.retardsPlanification, 'retard de planification', 'retards de planification'),
  ].join(', ')} → ${NIVEAUX_CHARGE[charge.niveau]}. En réserve : ${[
    compte(charge.echeancesProches, `échéance à ${HORIZON_ECHEANCE_JOURS} jours`, `échéances à ${HORIZON_ECHEANCE_JOURS} jours`),
    compte(charge.sansDate, 'action sans date planifiée', 'actions sans date planifiée'),
    compte(charge.relances, 'relance', 'relances'),
  ].join(', ')}.`

  return [
    `Date : ${jourAnneeFormatter.format(new Date(utcMidi(ref)))} · heure actuelle : ${plan.heureActuelle} (${APP_TIME_ZONE})`,
    ['CONTRAINTES DU JOUR', ...contraintes].join('\n'),
    ['ACTIONS POSSIBLES', ...(actionsPresentes.length ? actionsPresentes : ['- aucune'])].join('\n'),
    ...(info ? [['POUR INFORMATION', info].join('\n')] : []),
    ligneCharge,
  ].join('\n\n')
}
