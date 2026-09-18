import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { analyserBrainDump, genererPlanJournee } from '../services/claude'
import { getRoutines } from '../services/db'
import {
  APP_TIME_ZONE, todayISO, todayFR, todayCalendarParts,
  isTaskInActionQueue,
} from '../utils/date'
import { construirePlanJournee, delaiAvantChangement } from '../utils/planJournee'

// ── Ta journée : cache localStorage du plan rédigé par l'IA ──────────────────
// Clé = jour civil + signature du plan (utils/planJournee) : mêmes données utiles le même jour → aucun appel IA.
// Quelques signatures du jour sont gardées : cocher puis décocher une tâche ne rappelle pas l'IA.
const PLAN_CACHE_KEY = 'nm-plan-journee'
const PLAN_CACHE_MAX = 5
const PLAN_VIDE_TEXTE = 'Aucune contrainte ni action prioritaire détectée aujourd’hui.'
const clePlan = (plan) => `${plan.referenceISO}|${plan.signature}`

function lireCachePlan(plan) {
  try {
    const entrees = JSON.parse(localStorage.getItem(PLAN_CACHE_KEY))
    const entree = Array.isArray(entrees)
      ? entrees.find(e => e?.date === plan.referenceISO && e?.signature === plan.signature)
      : null
    return typeof entree?.texte === 'string' ? entree.texte : null
  } catch { return null }
}

function ecrireCachePlan(plan, texte) {
  try {
    const entrees = JSON.parse(localStorage.getItem(PLAN_CACHE_KEY))
    // Seules les entrées du jour sont conservées ; la signature courante remplace son ancienne entrée
    const autres = (Array.isArray(entrees) ? entrees : [])
      .filter(e => e?.date === plan.referenceISO && e?.signature !== plan.signature)
    const entree = { date: plan.referenceISO, signature: plan.signature, texte, genereLe: new Date().toISOString() }
    localStorage.setItem(PLAN_CACHE_KEY, JSON.stringify([entree, ...autres].slice(0, PLAN_CACHE_MAX)))
  } catch { /* stockage indisponible : le plan reste affiché, sans cache */ }
}

// Au plus une génération par jour + signature, même si la page est quittée puis rouverte pendant l'appel.
// Un échec n'est jamais retenté automatiquement pour la même signature : seul ↺ relance.
const generationsEnCours = new Map()
const echecsPlan = new Map()

function genererPlanAvecCache(plan, forcer) {
  const cle = clePlan(plan)
  if (!forcer && generationsEnCours.has(cle)) return generationsEnCours.get(cle)
  const promesse = genererPlanJournee(plan.texte)
    .then(texte => {
      if (!texte) throw new Error('Réponse vide.')
      ecrireCachePlan(plan, texte)
      echecsPlan.delete(cle)
      return texte
    })
    .catch(e => {
      echecsPlan.set(cle, e.message || 'Erreur de génération.')
      throw e
    })
    .finally(() => {
      if (generationsEnCours.get(cle) === promesse) generationsEnCours.delete(cle)
    })
  generationsEnCours.set(cle, promesse)
  return promesse
}

function calcQuadrant(u, i) {
  if (u && i)  return 1
  if (!u && i) return 2
  if (u && !i) return 3
  return 4
}

function routinesDuJour(routines) {
  const { dayOfWeek: dow, day: dom } = todayCalendarParts()
  return routines.filter(r => {
    if (r.recurrence === 'daily')   return true
    if (r.recurrence === 'weekly')  return r.jourSemaine === dow
    if (r.recurrence === 'monthly') return r.jourMois    === dom
    return false
  })
}

// ── Catégories temporelles ───────────────────────────────────────────────────
// Une tâche n'appartient qu'à une seule catégorie : le classement exclusif vient de
// construirePlanJournee (utils/planJournee), jamais d'un calcul propre à la page.
// « Maintenant » est à part : c'est une recommandation, elle peut pointer une tâche déjà classée ici.
const CATEGORIES = [
  { cle: 'retard',  titre: 'En retard',           sections: ['echeancesDepassees', 'retardsPlanification'] },
  { cle: 'jour',    titre: 'Aujourd’hui',         sections: ['echeancesAujourdhui', 'planifieAujourdhui'] },
  { cle: 'semaine', titre: 'Cette semaine',       sections: ['echeancesProches'] },
  { cle: 'next',    titre: 'Ensuite',             sections: ['sansDate'] },
]

const dateCourteFormatter = new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', day: 'numeric', month: 'short' })

// 'YYYY-MM-DD' → « 15 sept. » (midi UTC : calendrier neutre, aucun décalage de fuseau)
function dateCourte(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso ?? '')) return null
  const [annee, mois, jour] = iso.split('-').map(Number)
  return dateCourteFormatter.format(new Date(Date.UTC(annee, mois - 1, jour, 12)))
}

// Complément de droite selon la catégorie : la date concernée porte la couleur du bloc
function complementDe(cle, item) {
  if (cle === 'retard')  return dateCourte(item.echeance) || dateCourte(item.datePlanifiee)
  if (cle === 'semaine') return dateCourte(item.echeance)
  if (cle === 'jour')    return item.echeance ? 'échéance' : null
  return item.dureeMin ? `${item.dureeMin} min` : null
}

// Un item du plan ne porte pas le dossier complet : seul dossierId sert à naviguer.
// tacheId peut être un repli « dossierId#rang » — il ne désigne aucune tâche enregistrée, on ne s'en sert jamais.
function LigneCategorie({ cle, item, onOuvrir }) {
  const complement = complementDe(cle, item)
  const attente = item.etat !== 'actionnable'
  return (
    <div
      className={`aj-cat-row${attente ? ' aj-cat-row-attente' : ''}`}
      onClick={() => onOuvrir(item.dossierId)}
      onTouchEnd={(e) => { e.preventDefault(); onOuvrir(item.dossierId) }}
    >
      <span className="aj-cat-texte">
        <span className="aj-cat-titre">{item.titre || item.dossierTitre}</span>
        <span className="aj-cat-sous">
          {item.titre ? item.dossierTitre : 'Dossier'}
          {item.organisme && ` · ${item.organisme}`}
        </span>
      </span>
      {complement && <span className={`aj-cat-comp aj-cat-comp-${cle}`}>{complement}</span>}
    </div>
  )
}

// masque : nombre d'éléments écartés par les plafonds du plan — toujours annoncé, jamais masqué en silence
function BlocCategorie({ cle, titre, items, masque, onOuvrir }) {
  if (items.length === 0) return null
  return (
    <div className="aj-section">
      <div className={`aj-vline aj-vline-${cle}`} />
      <div className="aj-section-body">
        <span className={`aj-slabel aj-slabel-${cle}`}>{titre}</span>
        {items.map(item => (
          <LigneCategorie key={`${item.dossierId}-${item.ordreTache}`} cle={cle} item={item} onOuvrir={onOuvrir} />
        ))}
        {masque > 0 && (
          <p className="aj-cat-masque">+ {masque} autre{masque > 1 ? 's' : ''} non affiché{masque > 1 ? 's' : ''}</p>
        )}
      </div>
    </div>
  )
}

export default function Aujourdhui() {
  const { dossiersAujourdhui, dossiers, loading, apiKey, creerDossier, authUser } = useApp()
  const navigate = useNavigate()

  const [bdTexte,   setBdTexte]   = useState('')
  const [bdLoading, setBdLoading] = useState(false)
  const [bdError,   setBdError]   = useState('')
  const [showBD,    setShowBD]    = useState(false)
  const [indexTache, setIndexTache] = useState(0)

  // ── Routines du jour ───────────────────────────────────────────────────────
  // Coche "fait aujourd'hui" : localStorage uniquement (clé datée), jamais Supabase
  const [routinesJour, setRoutinesJour] = useState([])
  const [routinesFaites, setRoutinesFaites] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`nm-routines-faites-${todayISO()}`)) || [] }
    catch { return [] }
  })

  useEffect(() => {
    if (!authUser) return
    getRoutines(authUser.id).then(r => setRoutinesJour(routinesDuJour(r))).catch(() => {})
  }, [authUser])

  const toggleRoutineFaite = (id) => {
    setRoutinesFaites(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
      localStorage.setItem(`nm-routines-faites-${todayISO()}`, JSON.stringify(next))
      return next
    })
  }

  // ── Ta journée : plan déterministe (utils/planJournee) rédigé par l'IA ─────
  // L'heure seule ne change le plan qu'à des instants précis (heure fixe qui passe, minuit) : `tick` est avancé
  // par un minuteur unique ciblé sur le prochain de ces instants, et au retour sur la page. Pas de polling.
  const [tick,        setTick]        = useState(() => Date.now())
  const [pageVisible, setPageVisible] = useState(() => document.visibilityState !== 'hidden')
  const [planTexte,   setPlanTexte]   = useState(null)
  const [planLoading, setPlanLoading] = useState(false)
  const [planError,   setPlanError]   = useState(null)
  const requetePlan = useRef(0)   // seule la dernière génération demandée met à jour l'affichage

  // Tout le portefeuille : le constructeur écarte lui-même dossiers clos et tâches terminées
  const plan = useMemo(() => construirePlanJournee(dossiers || []), [dossiers, tick]) // eslint-disable-line
  const cleCourante = clePlan(plan)

  const lancerGeneration = useCallback(async (p, forcer = false) => {
    const id = ++requetePlan.current
    setPlanLoading(true); setPlanError(null)
    try {
      const texte = await genererPlanAvecCache(p, forcer)
      if (id === requetePlan.current) setPlanTexte(texte)
    } catch (e) {
      if (id === requetePlan.current) { setPlanTexte(null); setPlanError(e.message || 'Erreur de génération.') }
    } finally {
      if (id === requetePlan.current) setPlanLoading(false)
    }
  }, [])

  // Génération automatique : au plus une fois par jour + signature, page visible, jamais pour un plan vide.
  // Cache trouvé, plan vide, pas de clé ou échec déjà constaté pour cette signature → aucun appel.
  // La visibilité est lue au moment de l'effet ; `pageVisible` ne sert qu'à le relancer au retour sur la page.
  useEffect(() => {
    if (loading || document.visibilityState === 'hidden') return
    const enCache = plan.vide ? null : lireCachePlan(plan)
    if (plan.vide || enCache || !apiKey || echecsPlan.has(cleCourante)) {
      requetePlan.current++
      setPlanLoading(false)
      setPlanTexte(enCache)
      setPlanError(plan.vide || enCache || !apiKey ? null : echecsPlan.get(cleCourante))
      return
    }
    lancerGeneration(plan)
  }, [loading, pageVisible, apiKey, cleCourante]) // eslint-disable-line

  // Minuteur ciblé : prochaine heure fixe du jour qui devient « passée », ou minuit
  useEffect(() => {
    const minuteur = setTimeout(() => setTick(Date.now()), delaiAvantChangement(plan))
    return () => clearTimeout(minuteur)
  }, [plan])

  // Retour sur la page (onglet, application en arrière-plan) : l'heure a pu avancer pendant l'absence
  useEffect(() => {
    const auRetour = () => {
      const visible = document.visibilityState !== 'hidden'
      setPageVisible(visible)
      if (visible) setTick(Date.now())
    }
    document.addEventListener('visibilitychange', auRetour)
    window.addEventListener('focus', auRetour)
    return () => {
      document.removeEventListener('visibilitychange', auRetour)
      window.removeEventListener('focus', auRetour)
    }
  }, [])

  // ↺ : plan reconstruit depuis les données actuelles, génération forcée même à signature identique, cache remplacé
  const rafraichirPlan = () => {
    setTick(Date.now())
    const actuel = construirePlanJournee(dossiers || [])
    if (actuel.vide) {
      requetePlan.current++
      setPlanLoading(false); setPlanTexte(null); setPlanError(null)
      return
    }
    if (!apiKey) { setPlanError('Clé API requise — configurez-la dans Réglages.'); return }
    lancerGeneration(actuel, true)
  }

  const lancerBrainDump = async () => {
    if (!bdTexte.trim()) return
    if (!apiKey) { setBdError('Clé API requise — configurez-la dans Réglages.'); return }
    setBdLoading(true); setBdError('')
    try {
      const analysed = await analyserBrainDump(bdTexte)
      const enrichis = analysed.map(d => ({
        ...d, origine: 'vocal', quadrant: calcQuadrant(d.urgence, d.importance),
      }))
      const created = await Promise.all(enrichis.map(d => creerDossier(d)))
      // Focus ne reçoit que la file d'action : ni tâche future, ni tâche d'aujourd'hui avec heure
      const referenceISO = todayISO()
      const brainDumpTaches = created
        .sort((a, b) => a.quadrant - b.quadrant)
        .flatMap(d =>
          d.taches.filter(t => isTaskInActionQueue(t, referenceISO)).map(t => ({
            tache:   { ...t, done: false },
            dossier: { id: d.id, titre: d.titre, organisme: d.organisme ?? null, quadrant: d.quadrant },
          }))
        )
      setBdTexte('')
      // Aucune tâche éligible : dossiers créés, on reste sur Aujourd'hui (comme « Créer » du Brain dump de Capturer)
      if (brainDumpTaches.length === 0) { setShowBD(false); return }
      navigate('/focus', { state: { brainDumpTaches } })
    } catch (e) {
      setBdError(e.message || 'Erreur lors de l\'analyse.')
    } finally {
      setBdLoading(false)
    }
  }

  const creerRapideAccueil = async () => {
    const lignes = bdTexte.split('\n').map(l => l.trim()).filter(Boolean)
    if (lignes.length === 0) return
    setBdLoading(true); setBdError('')
    try {
      const titre = lignes.length === 1
        ? (lignes[0].length > 100 ? lignes[0].slice(0, 100) + '…' : lignes[0])
        : `Notes rapides — ${new Date().toLocaleDateString('fr-FR', { timeZone: APP_TIME_ZONE, day: 'numeric', month: 'short' })}`
      const dossier = await creerDossier({ titre, taches: lignes, origine: 'vocal' })
      setBdTexte('')
      setShowBD(false)
      navigate(`/dossiers/${dossier.id}`)
    } catch (e) {
      setBdError(e.message || 'Erreur lors de la création.')
    } finally {
      setBdLoading(false)
    }
  }

  const closeBD = () => { if (!bdLoading) { setShowBD(false); setBdTexte(''); setBdError('') } }

  // ── Données état actif ────────────────────────────────────────────────────
  const today = todayISO()

  // File d'action : 7 premiers dossiers actionnables ayant au moins une tâche actionnable
  // (liste dédiée : un dossier en attente / bloqué / 100 % futur ne prend pas de place)
  const dossiersPourActions = (dossiers || [])
    .filter(d =>
      d.etat === 'actionnable' &&
      (d.taches || []).some(t => isTaskInActionQueue(t, today))
    )
    .sort((a, b) =>
      a.quadrant - b.quadrant ||
      (b.updatedAt || '').localeCompare(a.updatedAt || '')
    )
    .slice(0, 7)

  const toutesLesTaches = dossiersPourActions.flatMap(d =>
    (d.taches || [])
      .filter(t => isTaskInActionQueue(t, today))
      .map(t => ({ tache: t, dossier: d }))
  )

  // Planifié aujourd'hui : heures fixes du plan (déjà triées par heure, jamais plafonnées)
  const tachesPlanifieesAujourdhui = plan.sections.heuresFixes

  // Catégories temporelles : un seul bloc par tâche, dans l'ordre de priorité de CATEGORIES
  const categories = CATEGORIES.map(({ cle, titre, sections }) => ({
    cle,
    titre,
    items:  sections.flatMap(s => plan.sections[s]),
    masque: sections.reduce((n, s) => n + (plan.masques[s] || 0), 0),
  }))

  const ouvrirDossier = (dossierId) => navigate(`/dossiers/${dossierId}`)

  const indexEffectif  = Math.min(indexTache, Math.max(0, toutesLesTaches.length - 1))
  const tacheNow       = toutesLesTaches[indexEffectif] || null

  const handleApres = () => {
    if (toutesLesTaches.length <= 1) return
    setIndexTache(i => Math.min(i + 1, toutesLesTaches.length - 1))
  }
  const allDossiers    = dossiers || dossiersAujourdhui
  const dossiersAttente = allDossiers
    .filter(d => d.etat === 'attente_externe')
    .sort((a, b) => new Date(a.lastActionAt ?? a.updatedAt) - new Date(b.lastActionAt ?? b.updatedAt))
  const joursAttentePremier = dossiersAttente[0]
    ? Math.floor((new Date() - new Date(dossiersAttente[0].lastActionAt ?? dossiersAttente[0].updatedAt)) / 86_400_000)
    : null

  const isEmpty = dossiersAujourdhui.length === 0

  // ── Header commun ─────────────────────────────────────────────────────────
  const AjHeader = () => (
    <header className="aj-header">
      <div className="aj-logo">
        <div className="aj-logo-circle">
          <span className="aj-logo-mark">»</span>
        </div>
        <span className="aj-logo-name">Next Move</span>
      </div>
      <button className="aj-avatar" onClick={() => navigate('/reglages')} aria-label="Réglages">L</button>
    </header>
  )

  if (loading) {
    return (
      <div className="aj-page">
        <AjHeader />
        <div className="aj-date-bar"><span className="aj-date">{todayFR()}</span></div>
        <div className="aj-body">
          <div className="aj-greeting">
            <span className="aj-greet-light">Bonjour,</span>
            <span className="aj-greet-bold">Ludovic.</span>
          </div>
          <div className="aj-sk-block" />
          <div className="aj-sk-block" style={{ height: 80, opacity: 0.5 }} />
        </div>
        <style>{ajCSS}</style>
      </div>
    )
  }

  return (
    <div className="aj-page">
      <AjHeader />
      <div className="aj-date-bar"><span className="aj-date">{todayFR()}</span></div>

      <div className="aj-body">

        {/* ── Greeting ─────────────────────────────────────────────── */}
        <div className="aj-greeting">
          <span className="aj-greet-light">Bonjour,</span>
          <span className="aj-greet-bold">Ludovic.</span>
        </div>

        {/* ── Ta journée ────────────────────────────────────────────── */}
        {(plan.vide || planTexte || planLoading || planError) && (
          <div className="aj-resume-card">
            <div className="aj-resume-top">
              <span className={`aj-resume-dot${planLoading ? ' aj-resume-dot-pulse' : ''}`} />
              <span className="aj-resume-label">Ta journée</span>
              <button
                className="aj-resume-refresh"
                onClick={rafraichirPlan}
                disabled={planLoading}
                title="Régénérer"
              >↺</button>
            </div>
            {plan.vide ? (
              <p className="aj-resume-text">{PLAN_VIDE_TEXTE}</p>
            ) : planLoading ? (
              <div className="aj-resume-skeleton" />
            ) : planError ? (
              <p className="aj-resume-error">{planError}</p>
            ) : (
              <p className="aj-resume-text">{planTexte}</p>
            )}
          </div>
        )}

        {isEmpty ? (

          /* ══ ÉTAT VIDE ══════════════════════════════════════════════ */
          <div className="aj-capture-card">
            <p className="aj-capture-prompt">Qu'est-ce qui te passe par la tête&nbsp;?</p>
            <textarea
              className="aj-capture-area"
              placeholder="Décris tout ce qui t'occupe : dossiers, tâches, idées…"
              value={bdTexte}
              onChange={e => setBdTexte(e.target.value)}
              disabled={bdLoading}
              rows={4}
            />
            {bdError && <p className="aj-bd-error">{bdError}</p>}
            <button
              className="aj-dicter-btn"
              onClick={lancerBrainDump}
              onTouchEnd={lancerBrainDump}
              disabled={bdLoading || !bdTexte.trim()}
            >
              {bdLoading
                ? <><span className="aj-spinner" /> Analyse…</>
                : 'Dicter'
              }
            </button>
          </div>

        ) : (

          /* ══ ÉTAT ACTIF ═════════════════════════════════════════════ */
          <>
            {/* ── En retard ────────────────────────────────────────── */}
            <BlocCategorie {...categories[0]} onOuvrir={ouvrirDossier} />

            {/* ── Planifié aujourd'hui (heures fixes) ──────────────── */}
            {tachesPlanifieesAujourdhui.length > 0 && (
              <div className="aj-section">
                <div className="aj-vline aj-vline-planned" />
                <div className="aj-section-body">
                  <span className="aj-slabel aj-slabel-planned">Planifié aujourd’hui</span>
                  {tachesPlanifieesAujourdhui.map(item => (
                    <div
                      key={`${item.dossierId}-${item.ordreTache}`}
                      className={`aj-planned-row${item.etat !== 'actionnable' ? ' aj-cat-row-attente' : ''}`}
                      onClick={() => ouvrirDossier(item.dossierId)}
                    >
                      <span className="aj-planned-heure">{item.heurePlanifiee}</span>
                      <div className="aj-planned-texte">
                        <span className="aj-planned-titre">{item.titre || item.dossierTitre}</span>
                        <span className="aj-planned-dossier">{item.titre ? item.dossierTitre : 'Dossier'}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Aujourd'hui ──────────────────────────────────────── */}
            <BlocCategorie {...categories[1]} onOuvrir={ouvrirDossier} />

            {/* ── Maintenant (recommandation, pas une catégorie) ───── */}
            {tacheNow && (
              <div className="aj-section">
                <div className="aj-vline aj-vline-now" />
                <div className="aj-section-body">
                  <span className="aj-slabel aj-slabel-now">Maintenant</span>
                  <p className="aj-task-title">{tacheNow.tache.titre}</p>
                  <p className="aj-task-sub">{tacheNow.dossier.titre}</p>
                  <div className="aj-task-btns">
                    <button
                      className="aj-btn-start"
                      onClick={() => navigate('/focus', { state: { taches: toutesLesTaches, from: 'today' } })}
                      onTouchEnd={(e) => { e.preventDefault(); navigate('/focus', { state: { taches: toutesLesTaches, from: 'today' } }) }}
                    >
                      Commencer
                    </button>
                    <button
                      className="aj-btn-later"
                      onClick={handleApres}
                      onTouchEnd={(e) => { e.preventDefault(); handleApres() }}
                      disabled={toutesLesTaches.length <= 1}
                    >Après</button>
                  </div>
                </div>
              </div>
            )}

            {/* ── Cette semaine ────────────────────────────────────── */}
            <BlocCategorie {...categories[2]} onOuvrir={ouvrirDossier} />

            {/* ── Ensuite ──────────────────────────────────────────── */}
            <BlocCategorie {...categories[3]} onOuvrir={ouvrirDossier} />

            {/* ── Routines du jour ─────────────────────────────────── */}
            {routinesJour.length > 0 && (
              <div className="aj-section">
                <div className="aj-vline aj-vline-routine" />
                <div className="aj-section-body">
                  <span className="aj-slabel aj-slabel-routine">Routines du jour</span>
                  {routinesJour.map(r => (
                    <div key={r.id} className="aj-routine-row" onClick={() => toggleRoutineFaite(r.id)}>
                      <span className={`aj-routine-check${routinesFaites.includes(r.id) ? ' aj-routine-checked' : ''}`} />
                      <span className={`aj-routine-titre${routinesFaites.includes(r.id) ? ' aj-routine-done' : ''}`}>
                        {r.titre}
                      </span>
                      <span className="aj-routine-duree">{r.dureeMin} min</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── En attente de retour ─────────────────────────────── */}
            {dossiersAttente.length > 0 && (
              <div className="aj-section">
                <div className="aj-vline aj-vline-wait" />
                <div className="aj-section-body">
                  <span className="aj-slabel aj-slabel-wait">En attente de retour</span>
                  <div
                    onClick={() => navigate(`/dossiers/${dossiersAttente[0].id}`)}
                    onTouchEnd={(e) => { e.preventDefault(); navigate(`/dossiers/${dossiersAttente[0].id}`) }}
                    style={{ cursor: 'pointer' }}
                  >
                    <p className="aj-wait-titre">{dossiersAttente[0].titre}</p>
                    {dossiersAttente[0].organisme && (
                      <p className="aj-wait-org">{dossiersAttente[0].organisme}</p>
                    )}
                  </div>
                  {joursAttentePremier !== null && joursAttentePremier >= 15 && (
                    <p className="aj-wait-relance">Aucun retour depuis {joursAttentePremier} jours — relancer ?</p>
                  )}
                  {dossiersAttente.length > 1 && (
                    <button className="aj-wait-more" onClick={() => navigate('/dossiers?filtre=attente')}>
                      et {dossiersAttente.length - 1} autre{dossiersAttente.length > 2 ? 's' : ''} →
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* ── Dicter discret ───────────────────────────────────── */}
            <button className="aj-dicter-ghost" onClick={() => setShowBD(true)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1C3829" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                <line x1="12" y1="19" x2="12" y2="23"/>
                <line x1="8" y1="23" x2="16" y2="23"/>
              </svg>
              Dicter autre chose
            </button>
          </>
        )}
      </div>

      {/* ── Modal Dicter (état actif) ─────────────────────────────────────── */}
      {showBD && (
        <div className="overlay" onClick={closeBD}>
          <div className="sheet" onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>Dicter autre chose</h3>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 14, lineHeight: 1.5 }}>
              Décrivez ce qui vous préoccupe. L'IA crée les dossiers et lance le Mode Focus.
            </p>
            <textarea
              className="input"
              rows={5}
              placeholder="Ex : j'ai une facture CFF à payer avant vendredi…"
              value={bdTexte}
              onChange={e => setBdTexte(e.target.value)}
              disabled={bdLoading}
              style={{ resize: 'none', marginBottom: 10, lineHeight: 1.5 }}
              autoFocus
            />
            {bdError && (
              <p style={{ fontSize: 13, color: 'var(--red)', marginBottom: 10 }}>{bdError}</p>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-ghost btn-sm" style={{ flex: 1 }}
                onClick={closeBD} disabled={bdLoading}>
                Annuler
              </button>
              <button className="btn btn-primary" style={{ flex: 2 }}
                onClick={lancerBrainDump}
                onTouchEnd={lancerBrainDump}
                disabled={bdLoading || !bdTexte.trim()}>
                {bdLoading
                  ? <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} />
                      Analyse en cours…
                    </span>
                  : 'Analyser et lancer'
                }
              </button>
            </div>
            <button className="btn btn-ghost btn-full btn-sm" style={{ marginTop: 8 }}
              onClick={creerRapideAccueil}
              onTouchEnd={(e) => { e.preventDefault(); creerRapideAccueil() }}
              disabled={bdLoading || !bdTexte.trim()}>
              ⚡ Créer directement (sans IA)
            </button>
          </div>
        </div>
      )}

      <style>{ajCSS}</style>
    </div>
  )
}

/* ══ CSS ══════════════════════════════════════════════════════════════════════ */
const ajCSS = `
  /* ── Page ──────────────────────────────────────────────────────────────── */
  .aj-page {
    flex: 1;
    overflow-y: auto;
    overscroll-behavior-y: contain;
    padding-bottom: calc(68px + env(safe-area-inset-bottom, 0px) + 28px);
    background: #F7F5F0;
  }

  /* ── Header ─────────────────────────────────────────────────────────────── */
  .aj-header {
    background: #1C3829;
    padding: 48px 20px 18px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    position: sticky;
    top: 0;
    z-index: 10;
  }
  .aj-logo {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .aj-logo-circle {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: #C4623A;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .aj-logo-mark {
    color: #fff;
    font-size: 13px;
    font-weight: 800;
    letter-spacing: -1.5px;
    line-height: 1;
  }
  .aj-logo-name {
    color: rgba(255,255,255,0.92);
    font-size: 15px;
    font-weight: 600;
    letter-spacing: -0.2px;
  }
  .aj-avatar {
    width: 34px;
    height: 34px;
    border-radius: 50%;
    background: #C4623A;
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    font-weight: 700;
    flex-shrink: 0;
    letter-spacing: 0;
    border: none;
    cursor: pointer;
    font-family: inherit;
    transition: background 0.15s, transform 0.12s;
  }
  .aj-avatar:active { background: #a84e2d; transform: scale(0.93); }

  /* ── Date bar ────────────────────────────────────────────────────────────── */
  .aj-date-bar {
    padding: 14px 20px 0;
  }
  .aj-date {
    font-size: 11px;
    font-weight: 500;
    color: #A09080;
    text-transform: capitalize;
    letter-spacing: 0.02em;
  }

  /* ── Body ────────────────────────────────────────────────────────────────── */
  .aj-body {
    padding: 0 20px;
  }

  /* ── Greeting ────────────────────────────────────────────────────────────── */
  .aj-greeting {
    display: flex;
    flex-direction: column;
    margin: 18px 0 22px;
    line-height: 1.12;
  }
  .aj-greet-light {
    font-size: 33px;
    font-weight: 300;
    color: #2A1F14;
    letter-spacing: -1px;
  }
  .aj-greet-bold {
    font-size: 33px;
    font-weight: 700;
    color: #2A1F14;
    letter-spacing: -1px;
  }

  /* ── Résumé IA matinal ───────────────────────────────────────────────────── */
  .aj-resume-card {
    background: #fff;
    border-radius: 14px;
    border: 1px solid #DDD8CE;
    padding: 14px 16px;
    margin-bottom: 6px;
    box-shadow: 0 1px 4px rgba(42,31,20,0.05);
  }
  .aj-resume-top {
    display: flex;
    align-items: center;
    gap: 7px;
    margin-bottom: 8px;
  }
  .aj-resume-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #1C3829;
    flex-shrink: 0;
  }
  .aj-resume-dot-pulse {
    animation: aj-dot-pulse 1.8s ease-in-out infinite;
  }
  @keyframes aj-dot-pulse {
    0%, 100% { opacity: 1; transform: scale(1);   }
    50%       { opacity: 0.3; transform: scale(0.6); }
  }
  .aj-resume-label {
    flex: 1;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 1.4px;
    text-transform: uppercase;
    color: #1C3829;
  }
  .aj-resume-refresh {
    background: none;
    border: none;
    color: #A09080;
    font-size: 16px;
    cursor: pointer;
    padding: 2px 4px;
    line-height: 1;
    transition: color 0.15s, transform 0.2s;
    font-family: inherit;
  }
  .aj-resume-refresh:hover:not(:disabled) { color: #1C3829; }
  .aj-resume-refresh:active:not(:disabled) { transform: rotate(-90deg); }
  .aj-resume-refresh:disabled { opacity: 0.3; cursor: default; }
  .aj-resume-text {
    font-size: 14px;
    color: #2A1F14;
    line-height: 1.6;
    margin: 0;
    letter-spacing: -0.1px;
    white-space: pre-line;
  }
  .aj-resume-skeleton {
    height: 52px;
    background: linear-gradient(90deg, #DDD8CE 25%, #ede9e2 50%, #DDD8CE 75%);
    background-size: 200% 100%;
    animation: shimmer 1.4s infinite;
    border-radius: 8px;
  }
  .aj-resume-error {
    font-size: 12px;
    color: #C0392B;
    margin: 0;
  }

  /* ── Capture card (état vide) ────────────────────────────────────────────── */
  .aj-capture-card {
    background: #fff;
    border-radius: 16px;
    border: 1px solid #DDD8CE;
    padding: 20px;
    box-shadow: 0 1px 4px rgba(42,31,20,0.06);
  }
  .aj-capture-prompt {
    font-size: 16px;
    font-weight: 600;
    color: #2A1F14;
    margin-bottom: 12px;
    letter-spacing: -0.3px;
  }
  .aj-capture-area {
    width: 100%;
    border: 1.5px solid #DDD8CE;
    border-radius: 10px;
    padding: 12px 14px;
    font-size: 14px;
    font-family: inherit;
    color: #2A1F14;
    background: #F7F5F0;
    resize: none;
    outline: none;
    line-height: 1.5;
    transition: border-color 0.15s;
    margin-bottom: 12px;
    display: block;
  }
  .aj-capture-area:focus { border-color: #1C3829; }
  .aj-capture-area::placeholder { color: #C0B8A8; }
  .aj-bd-error {
    font-size: 13px;
    color: #C0392B;
    margin-bottom: 10px;
  }
  .aj-dicter-btn {
    width: 100%;
    padding: 13px;
    background: #1C3829;
    color: #fff;
    border: none;
    border-radius: 10px;
    font-size: 15px;
    font-weight: 600;
    font-family: inherit;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    transition: background 0.15s, opacity 0.15s;
    letter-spacing: -0.2px;
  }
  .aj-dicter-btn:disabled { opacity: 0.38; cursor: not-allowed; }
  .aj-dicter-btn:active:not(:disabled) { background: #152e1f; }

  /* ── Sections (état actif) ───────────────────────────────────────────────── */
  .aj-section {
    display: flex;
    gap: 14px;
    margin-bottom: 18px;
    align-items: stretch;
  }
  .aj-vline {
    width: 3px;
    border-radius: 2px;
    flex-shrink: 0;
    align-self: stretch;
    min-height: 60px;
  }
  .aj-vline-now     { background: var(--cat-actif); }
  .aj-vline-retard  { background: var(--cat-retard); }
  .aj-vline-jour    { background: var(--cat-actif); }
  .aj-vline-semaine { background: var(--cat-attention); }
  .aj-vline-next    { background: #B5A898; }
  .aj-vline-wait    { background: var(--cat-attente); }

  .aj-section-body {
    flex: 1;
    padding: 2px 0 8px;
  }
  .aj-slabel {
    display: block;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 1.5px;
    text-transform: uppercase;
    margin-bottom: 7px;
    line-height: 1;
  }
  .aj-slabel-now     { color: var(--cat-actif); }
  .aj-slabel-retard  { color: var(--cat-retard); }
  .aj-slabel-jour    { color: var(--cat-actif); }
  .aj-slabel-semaine { color: var(--cat-attention); }
  .aj-slabel-next    { color: #8A7A6A; }
  .aj-slabel-wait    { color: var(--cat-attente); }

  /* Maintenant */
  .aj-task-title {
    font-size: 17px;
    font-weight: 700;
    color: #2A1F14;
    line-height: 1.3;
    letter-spacing: -0.4px;
    margin-bottom: 3px;
  }
  .aj-task-sub {
    font-size: 12px;
    color: #A09080;
    margin-bottom: 11px;
    line-height: 1.4;
  }
  .aj-task-btns {
    display: flex;
    gap: 8px;
  }
  .aj-btn-start {
    padding: 8px 18px;
    background: #1C3829;
    color: #fff;
    border: none;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 600;
    font-family: inherit;
    cursor: pointer;
    transition: background 0.15s;
  }
  .aj-btn-start:active { background: #152e1f; }
  .aj-btn-later {
    padding: 8px 16px;
    background: transparent;
    color: #A09080;
    border: 1.5px solid #DDD8CE;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 500;
    font-family: inherit;
    cursor: pointer;
    transition: background 0.15s;
  }
  .aj-btn-later:active { background: #F0EBE3; }

  /* Lignes de catégorie (En retard · Aujourd'hui · Cette semaine · Ensuite) */
  .aj-cat-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 7px 0;
    border-bottom: 1px solid #F0EBE3;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }
  .aj-cat-row:last-child { border-bottom: none; }
  .aj-cat-row:active { opacity: 0.6; }
  .aj-cat-texte {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .aj-cat-titre {
    font-size: 14px;
    color: #2A1F14;
    line-height: 1.35;
  }
  .aj-cat-sous {
    font-size: 11px;
    color: #A09080;
    line-height: 1.3;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  /* Dossier en attente / bloqué / à l'œil : la ligne s'efface, le bloc garde sa couleur */
  .aj-cat-row-attente .aj-cat-titre,
  .aj-cat-row-attente .aj-planned-titre { color: var(--cat-attente); }

  .aj-cat-comp {
    flex-shrink: 0;
    font-size: 11px;
    color: #A09080;
    font-variant-numeric: tabular-nums;
  }
  .aj-cat-comp-retard  { color: var(--cat-retard); font-weight: 700; }
  .aj-cat-comp-semaine { color: var(--cat-attention); font-weight: 600; }
  .aj-cat-comp-jour    { color: var(--cat-actif); }
  .aj-cat-masque {
    font-size: 11px;
    color: #C0B8A8;
    padding-top: 7px;
  }

  /* Routines du jour */
  .aj-vline-routine  { background: #DDD8CE; }
  .aj-slabel-routine { color: #8A7A6A; }
  .aj-routine-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 7px 0;
    border-bottom: 1px solid #F0EBE3;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }
  .aj-routine-row:last-child { border-bottom: none; }
  .aj-routine-check {
    width: 18px;
    height: 18px;
    border-radius: 5px;
    border: 1.5px solid #DDD8CE;
    background: #fff;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.15s, border-color 0.15s;
  }
  .aj-routine-check.aj-routine-checked {
    background: #1C3829;
    border-color: #1C3829;
  }
  .aj-routine-check.aj-routine-checked::after {
    content: '✓';
    color: #fff;
    font-size: 12px;
    font-weight: 700;
    line-height: 1;
  }
  .aj-routine-titre {
    flex: 1;
    font-size: 14px;
    color: #2A1F14;
    line-height: 1.4;
  }
  .aj-routine-titre.aj-routine-done {
    text-decoration: line-through;
    color: #A09080;
  }
  .aj-routine-duree {
    font-size: 11px;
    color: #A09080;
    flex-shrink: 0;
  }

  /* Planifié aujourd'hui */
  .aj-vline-planned  { background: var(--cat-actif); }
  .aj-slabel-planned { color: var(--cat-actif); }
  .aj-planned-row {
    display: flex;
    align-items: baseline;
    gap: 12px;
    padding: 6px 0;
    border-bottom: 1px solid #F0EBE3;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }
  .aj-planned-row:last-child { border-bottom: none; }
  .aj-planned-row:active { opacity: 0.6; }
  .aj-planned-heure {
    font-size: 13px;
    font-weight: 700;
    color: #1C3829;
    font-variant-numeric: tabular-nums;
    min-width: 40px;
    flex-shrink: 0;
  }
  .aj-planned-texte {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .aj-planned-titre {
    font-size: 14px;
    color: #2A1F14;
    line-height: 1.4;
  }
  .aj-planned-dossier {
    font-size: 12px;
    color: #A09080;
    line-height: 1.4;
  }

  /* En attente */
  .aj-wait-titre {
    font-size: 15px;
    font-weight: 600;
    color: #2A1F14;
    letter-spacing: -0.3px;
    margin-bottom: 2px;
  }
  .aj-wait-org {
    font-size: 12px;
    color: #A09080;
    margin-bottom: 7px;
  }
  /* Seule alerte du bloc (≥ 15 jours sans retour) : elle garde la couleur d'attention */
  .aj-wait-relance {
    font-size: 12px;
    color: var(--cat-attention);
    margin-bottom: 7px;
  }
  .aj-wait-more {
    background: none;
    border: none;
    color: var(--cat-attente);
    font-size: 13px;
    font-weight: 600;
    font-family: inherit;
    cursor: pointer;
    padding: 0;
    transition: opacity 0.15s;
  }
  .aj-wait-more:active { opacity: 0.6; }

  /* ── Bouton Dicter (plus visible) ───────────────────────────────────────── */
  .aj-dicter-ghost {
    width: 100%;
    margin-top: 4px;
    padding: 12px 16px;
    background: #E8F0EA;
    color: #1C3829;
    border: 1.5px solid rgba(28,56,41,0.2);
    border-radius: 10px;
    font-size: 13px;
    font-weight: 600;
    font-family: inherit;
    cursor: pointer;
    transition: background 0.15s, border-color 0.15s;
    letter-spacing: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
  }
  .aj-dicter-ghost:active { background: #d4e6d8; border-color: #1C3829; }

  /* ── Spinner inline ──────────────────────────────────────────────────────── */
  .aj-spinner {
    width: 14px;
    height: 14px;
    border: 2px solid rgba(255,255,255,0.3);
    border-top-color: #fff;
    border-radius: 50%;
    animation: spin 0.75s linear infinite;
    display: inline-block;
    vertical-align: middle;
  }

  /* ── Skeleton ────────────────────────────────────────────────────────────── */
  .aj-sk-block {
    background: linear-gradient(90deg, #DDD8CE 25%, #ede9e2 50%, #DDD8CE 75%);
    background-size: 200% 100%;
    animation: shimmer 1.4s infinite;
    border-radius: 10px;
    height: 120px;
    margin-bottom: 12px;
  }
  @keyframes shimmer {
    0%   { background-position: -200% 0; }
    100% { background-position:  200% 0; }
  }
`
