import { createContext, useContext, useReducer, useEffect, useCallback, useRef, useState } from 'react'
import { v4 as uuid } from 'uuid'
import * as db from '../services/db'
import { getCurrentUser, getUserProfile, onAuthStateChange, signOut } from '../services/db'
import { setReminder, removeReminder, checkReminders, requestPermission, notifyEscalade } from '../services/notifications'
import { todayISO } from '../utils/date'

const AppContext = createContext(null)

const RECALC_KEY = 'nm-last-recalc'
const PING_KEY   = 'last_supabase_ping'
const PING_INTERVAL_MS = 48 * 60 * 60 * 1000   // 48h

// ── Resync au retour au premier plan ─────────────────────────────────────────
// Les données n'étaient chargées qu'une fois par session : une modification faite sur un autre
// appareil ou un autre onglet n'apparaissait qu'après un rechargement complet de la page.
const RESYNC_INTERVAL_MIN_MS = 60_000   // deux essais ne peuvent pas être plus rapprochés (anti-rafale)
const RESYNC_TIMEOUT_MS      = 8000     // plus généreux qu'au démarrage : ici, échouer ne bloque rien, on garde l'état

// ── Helpers ──────────────────────────────────────────────────────────────────

// Helper : wrapper une promesse avec timeout 3 sec
function withTimeout(promise, ms = 3000) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout après ${ms}ms`)), ms)
    )
  ])
}

const estTimeout = (err) => err?.message?.startsWith('Timeout après')

// Lecture des données, partagée par le chargement initial et le resync.
// Ne fait que lire : ni migration IndexedDB, ni ping keep-alive, qui restent propres au démarrage.
export async function chargerDonnees(userId, ms) {
  const [dossiers, journal] = await withTimeout(
    Promise.all([db.getDossiers(userId), db.getJournal(userId)]),
    ms
  )
  return { dossiers: [...dossiers].sort((a, b) => b.createdAt.localeCompare(a.createdAt)), journal }
}

// Mappe un état dossier vers le statut d'étape correspondant
const ETAT_TO_ETAPE_STATUT = {
  actionnable:     'fait',
  attente_externe: 'en_attente',
  bloque:          'bloque',
  surveille:       'en_attente',
  clos:            'fait',
}

const ETAT_TO_ETAPE_TEXTE = {
  actionnable:     'Passé en actionnable',
  attente_externe: 'Passé en attente externe',
  bloque:          'Passage en bloqué',
  surveille:       'Passé en surveillance',
  clos:            'Dossier clôturé',
}

function calcQuadrant(urgence, importance) {
  if (urgence && importance)  return 1
  if (!urgence && importance) return 2
  if (urgence && !importance) return 3
  return 4
}

function validateDossier(data) {
  const titre = (data.titre || '').trim()
  if (!titre)           throw new Error('Le titre du dossier est requis.')
  if (titre.length > 120) throw new Error('Titre trop long (maximum 120 caractères).')
  if (data.echeance && !/^\d{4}-\d{2}-\d{2}$/.test(data.echeance)) {
    throw new Error('Format de date invalide (attendu YYYY-MM-DD).')
  }
  if (data.taches && !Array.isArray(data.taches)) {
    throw new Error('Les tâches doivent être un tableau.')
  }
  return titre
}

// Normalise une tâche (string ou objet) : id garanti, titre nettoyé, done défini.
// Les propriétés inconnues de l'objet sont conservées.
function normaliserTache(tache) {
  const raw = typeof tache === 'string'
    ? { titre: tache }
    : (tache || {})

  const titre = typeof raw.titre === 'string'
    ? raw.titre.trim()
    : ''

  const id = typeof raw.id === 'string' && raw.id.trim()
    ? raw.id
    : uuid()

  return {
    ...raw,
    id,
    titre,
    done: typeof raw.done === 'boolean'
      ? raw.done
      : false,
  }
}

// ── Reducer ───────────────────────────────────────────────────────────────────

const init = {
  dossiers:   [],
  journal:    [],
  loading:    true,
  apiKey:     localStorage.getItem('anthropic_api_key') || '',
  openaiKey:  localStorage.getItem('openai_api_key')   || ''
}

function reducer(state, action) {
  switch (action.type) {
    case 'LOADED':
      return { ...state, dossiers: action.dossiers, journal: action.journal, loading: false }
    // Resync : remplace les données par celles du serveur sans toucher à `loading`, donc sans
    // squelette de chargement ni relance des effets qui en dépendent. Jamais dispatché sur échec.
    case 'RESYNC':
      return { ...state, dossiers: action.dossiers, journal: action.journal }
    case 'RESET':
      return { ...init, loading: false }
    case 'ADD_DOSSIER':
      return { ...state, dossiers: [action.dossier, ...state.dossiers] }
    case 'UPDATE_DOSSIER':
      return { ...state, dossiers: state.dossiers.map(d => d.id === action.dossier.id ? action.dossier : d) }
    case 'DELETE_DOSSIER':
      return { ...state, dossiers: state.dossiers.filter(d => d.id !== action.id) }
    case 'ADD_JOURNAL':
      return { ...state, journal: [action.entry, ...state.journal] }
    case 'SET_API_KEY':
      return { ...state, apiKey: action.key }
    case 'SET_OPENAI_KEY':
      return { ...state, openaiKey: action.key }
    default:
      return state
  }
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, init)

  const [authUser, setAuthUser]             = useState(null)
  const [userProfile, setUserProfile]       = useState(null)
  const [authLoading, setAuthLoading]       = useState(true)
  const [authErrorMessage, setAuthErrorMessage] = useState('')

  // ── Garde du resync ───────────────────────────────────────────────────────
  // Une mutation met l'écran à jour immédiatement puis attend Supabase jusqu'à 12 s. Un resync qui
  // tomberait dans cette fenêtre rapporterait la ligne d'avant l'écriture et annulerait visuellement
  // la modification : tant qu'une écriture est en vol, le resync est sauté (jamais mis en attente).
  const ecrituresEnVol = useRef(0)
  const resyncEnCours  = useRef(false)
  const dernierEssai   = useRef(0)

  // Enveloppe une mutation sans rien changer à son comportement : seul le compteur bouge.
  const protegerEcriture = (fn) => async (...args) => {
    ecrituresEnVol.current++
    try { return await fn(...args) }
    finally { ecrituresEnVol.current-- }
  }

  // ── Auth ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    async function initAuth() {
      try {
        const user = await withTimeout(getCurrentUser(), 3000)
        if (user) {
          const profile = await withTimeout(getUserProfile(user.id), 3000)
          if (!profile?.actif) {
            await signOut()
            setAuthErrorMessage('Ton compte a été désactivé. Contacte l\'administrateur.')
          } else {
            setAuthUser(user)
            setUserProfile(profile)
          }
        }
      } catch (err) {
        console.warn('[auth] init timeout/erreur, démarrage non authentifié', err.message)
      } finally {
        setAuthLoading(false)
      }
    }
    initAuth()

    const { data: { subscription } } = onAuthStateChange(async (event, session) => {
      if (session?.user) {
        let profile = null
        try {
          profile = await withTimeout(getUserProfile(session.user.id), 3000)
        } catch (err) {
          console.warn('[auth] getUserProfile timeout au login, connexion quand même', err.message)
          setAuthUser(session.user)
          setAuthErrorMessage('')
          return
        }
        if (!profile?.actif) {
          await signOut()
          setAuthUser(null)
          setUserProfile(null)
          setAuthErrorMessage('Ton compte a été désactivé. Contacte l\'administrateur.')
          return
        }
        setAuthUser(session.user)
        setUserProfile(profile)
        setAuthErrorMessage('')
      } else {
        setAuthUser(null)
        setUserProfile(null)
        dispatch({ type: 'RESET' })
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const logout = async () => {
    await signOut()
    setAuthUser(null)
    setUserProfile(null)
    dispatch({ type: 'RESET' })
  }

  // ── Chargement des données (déclenché quand authUser est connu) ────────────
  useEffect(() => {
    if (!authUser) return

    // ── Migration one-shot depuis IndexedDB ──────────────────────────────────
    async function migrateFromIndexedDB() {
      const MIGRATION_KEY = 'nm-supabase-migrated'
      if (localStorage.getItem(MIGRATION_KEY)) return
      try {
        const { openDB } = await import('idb')
        const idb = await openDB('next-move', 1)
        const oldDossiers = await idb.getAll('dossiers')
        const oldJournal  = await idb.getAll('journal')
        if (oldDossiers.length > 0) {
          // Upsert en batch pour éviter les conflits
          await Promise.all(oldDossiers.map(d => db.saveDossier(d, authUser?.id)))
          await Promise.all(oldJournal.map(j => db.addJournalEntry(j, authUser?.id)))
          console.log(`[Migration] ${oldDossiers.length} dossiers, ${oldJournal.length} entrées migrés vers Supabase`)
        }
        idb.close()
      } catch {
        // Pas de données IndexedDB ou DB inexistante — migration silencieuse
      } finally {
        localStorage.setItem(MIGRATION_KEY, '1')
      }
    }

    async function load() {
      // Migrer les données IndexedDB existantes (une seule fois)
      try {
        await withTimeout(migrateFromIndexedDB(), 3000)
      } catch (err) {
        console.warn('[load] IndexedDB timeout/error, continuing...', err.message)
      }

      // Keep-alive Supabase : pinger une fois toutes les 48h pour éviter la pause projet
      try {
        const last = parseInt(localStorage.getItem(PING_KEY) || '0', 10)
        if (Date.now() - last > PING_INTERVAL_MS) {
          db.pingSupabase().then(() => {
            localStorage.setItem(PING_KEY, String(Date.now()))
          }).catch(() => {})
        }
      } catch {}

      let donnees = { dossiers: [], journal: [] }
      try {
        donnees = await chargerDonnees(authUser?.id, 3000)
      } catch (err) {
        console.warn('[load] Supabase timeout, app starting offline', err.message)
        // Dossiers et journal restent vides — l'app démarre quand même
      }

      // Au démarrage seulement : un échec laisse l'app partir hors-ligne, écran vide assumé.
      // Le resync, lui, ne dispatche jamais sur échec (voir rafraichirDonnees).
      dispatch({ type: 'LOADED', ...donnees })
    }
    load()
    requestPermission()
    const interval = setInterval(checkReminders, 60 * 60 * 1000)
    checkReminders()
    return () => clearInterval(interval)
  }, [authUser])

  // ── Resync au retour au premier plan ──────────────────────────────────────
  // Retourne la raison du refus, ou 'ok'. Ne lève jamais : un appelant peut l'ignorer sans risque.
  const rafraichirDonnees = useCallback(async () => {
    if (!authUser)                 return 'sans-session'
    if (ecrituresEnVol.current > 0) return 'ecriture-en-vol'   // l'état optimiste reste prioritaire
    if (resyncEnCours.current)      return 'deja-en-cours'
    // Anti-rafale : compté depuis le début de l'essai, pour ne pas marteler un réseau indisponible
    if (Date.now() - dernierEssai.current < RESYNC_INTERVAL_MIN_MS) return 'trop-recent'

    resyncEnCours.current = true
    dernierEssai.current = Date.now()
    try {
      const donnees = await chargerDonnees(authUser.id, RESYNC_TIMEOUT_MS)
      // Une mutation a pu démarrer pendant la requête : ses données seraient plus fraîches que celles-ci
      if (ecrituresEnVol.current > 0) return 'ecriture-en-vol'
      dispatch({ type: 'RESYNC', ...donnees })
      return 'ok'
    } catch (err) {
      // Aucun dispatch : l'état courant est conservé tel quel, jamais vidé
      console.warn('[resync]', estTimeout(err) ? 'timeout, état conservé' : 'échec, état conservé', err.message)
      return 'echec'
    } finally {
      resyncEnCours.current = false
    }
  }, [authUser])

  // Un seul mécanisme pour toute l'application, sans polling : le Pupitre en bénéficie par héritage.
  useEffect(() => {
    if (!authUser) return
    const auRetour = () => {
      if (document.visibilityState !== 'hidden') rafraichirDonnees()
    }
    document.addEventListener('visibilitychange', auRetour)
    window.addEventListener('focus', auRetour)
    return () => {
      document.removeEventListener('visibilitychange', auRetour)
      window.removeEventListener('focus', auRetour)
    }
  }, [authUser, rafraichirDonnees])

  async function log(dossierId, action, detail) {
    const entry = { id: uuid(), dossierId, action, detail, timestamp: new Date().toISOString() }
    await db.addJournalEntry(entry, authUser?.id)
    dispatch({ type: 'ADD_JOURNAL', entry })
  }

  // ── creerDossier ──────────────────────────────────────────────────────────
  const creerDossier = useCallback(protegerEcriture(async (data) => {
    const titre     = validateDossier(data)
    const urgence   = data.urgence   ?? false
    const importance = data.importance ?? true

    // Valider l'état suggéré par l'IA (point 7 : attente_externe auto-détecté)
    const etatValide = ['actionnable', 'attente_externe', 'surveille', 'bloque'].includes(data.etat)
      ? data.etat
      : 'actionnable'

    const dossier = {
      id:              uuid(),
      titre,
      organisme:       (data.organisme || '').trim() || null,
      origine:         data.origine || 'texte',
      type:            data.type    || 'vivant',
      etat:            etatValide,
      urgence,
      importance,
      quadrant:        calcQuadrant(urgence, importance),
      description:     (data.description || '').trim(),
      echeance:        data.echeance || null,
      raisonAujourdhui: (data.raisonPriorite || '').trim(),
      taches:          (data.taches || [])
        .map(normaliserTache)
        .filter(t => t.titre),
      createdAt:       new Date().toISOString(),
      updatedAt:       new Date().toISOString(),
      lastActionAt:    new Date().toISOString(),
    }

    await db.saveDossier(dossier, authUser?.id)
    dispatch({ type: 'ADD_DOSSIER', dossier })
    if (dossier.echeance) setReminder(dossier.id, dossier.titre, dossier.echeance)
    await log(dossier.id, 'Création', `Dossier créé via ${dossier.origine}`)
    // Étape initiale dans l'historique
    await db.addEtape({
      id:        uuid(),
      dossierId: dossier.id,
      date:      todayISO(),
      texte:     'Dossier ouvert',
      statut:    'fait',
      source:    'auto',
      createdAt: dossier.createdAt,
    }, authUser?.id)
    return dossier
  }), [state.dossiers, authUser])

  // ── mettreAJourDossier ────────────────────────────────────────────────────
  const mettreAJourDossier = useCallback(protegerEcriture(async (id, updates) => {
    const dossier = state.dossiers.find(d => d.id === id)
    if (!dossier) return null

    // Validation partielle
    if (updates.titre !== undefined) {
      const titre = (updates.titre || '').trim()
      if (!titre) throw new Error('Le titre ne peut pas être vide.')
      if (titre.length > 120) throw new Error('Titre trop long (maximum 120 caractères).')
      updates = { ...updates, titre }
    }
    if (updates.echeance && !/^\d{4}-\d{2}-\d{2}$/.test(updates.echeance)) {
      throw new Error('Format de date invalide.')
    }

    const urgence    = updates.urgence    ?? dossier.urgence
    const importance = updates.importance ?? dossier.importance
    const updated    = {
      ...dossier,
      ...updates,
      urgence,
      importance,
      quadrant:   calcQuadrant(urgence, importance),
      updatedAt:  new Date().toISOString(),
      lastActionAt: (updates.etat !== undefined || updates.echeance !== undefined)
        ? new Date().toISOString()
        : dossier.lastActionAt
    }

    // UI optimiste : on met à jour l'écran TOUT DE SUITE
    dispatch({ type: 'UPDATE_DOSSIER', dossier: updated })
    try {
      await withTimeout(db.saveDossier(updated, authUser?.id), 12000)
    } catch (err) {
      // échec : on annule visuellement (le dossier revient à son état précédent)
      if (!estTimeout(err)) {
        dispatch({ type: 'UPDATE_DOSSIER', dossier })
      }
      console.warn('[mettreAJourDossier] sauvegarde', estTimeout(err) ? 'timeout, état conservé' : 'échouée, rollback', err.message)
    }

    if (updated.echeance) setReminder(updated.id, updated.titre, updated.echeance)
    else removeReminder(updated.id)

    if (updates.etat) {
      const labels = {
        actionnable:     'Actionnable',
        attente_externe: 'En attente externe',
        bloque:          'Bloqué',
        surveille:       'Surveillé',
        clos:            'Clôturé'
      }
      await log(id, 'Changement d\'état', `→ ${labels[updates.etat] || updates.etat}`)
      // Tracer la transition dans l'historique du dossier
      await db.addEtape({
        id:        uuid(),
        dossierId: id,
        date:      todayISO(),
        texte:     ETAT_TO_ETAPE_TEXTE[updates.etat] || `→ ${updates.etat}`,
        statut:    ETAT_TO_ETAPE_STATUT[updates.etat] || 'fait',
        source:    'auto',
        createdAt: new Date().toISOString(),
      }, authUser?.id)
    }
    return updated
  }), [state.dossiers, authUser])

  // ── Tâches ────────────────────────────────────────────────────────────────
  const toggleTache = useCallback(protegerEcriture(async (dossierId, tacheId) => {
    const dossier = state.dossiers.find(d => d.id === dossierId)
    if (!dossier) return
    const taches  = dossier.taches.map(t => t.id === tacheId ? { ...t, done: !t.done } : t)
    const now = new Date().toISOString()
    const updated = { ...dossier, taches, updatedAt: now, lastActionAt: now }
    // UI optimiste : on met à jour l'écran TOUT DE SUITE
    dispatch({ type: 'UPDATE_DOSSIER', dossier: updated })
    try {
      // sauvegarde en arrière-plan, avec timeout
      await withTimeout(db.saveDossier(updated, authUser?.id), 12000)
      const tache = taches.find(t => t.id === tacheId)
      if (tache?.done) log(dossierId, 'Tâche complétée', tache.titre)
    } catch (err) {
      // échec : on annule visuellement (la case revient à son état précédent)
      if (!estTimeout(err)) {
        dispatch({ type: 'UPDATE_DOSSIER', dossier })
      }
      console.warn('[toggleTache] sauvegarde', estTimeout(err) ? 'timeout, état conservé' : 'échouée, rollback', err.message)
    }
  }), [state.dossiers, authUser])

  const ajouterTache = useCallback(protegerEcriture(async (dossierId, titre) => {
    const titreTrim = (titre || '').trim()
    if (!titreTrim) return
    const dossier = state.dossiers.find(d => d.id === dossierId)
    if (!dossier) return
    const tache   = { id: uuid(), titre: titreTrim, done: false }
    const now = new Date().toISOString()
    const updated = { ...dossier, taches: [...dossier.taches, tache], updatedAt: now, lastActionAt: now }
    // UI optimiste : on met à jour l'écran TOUT DE SUITE
    dispatch({ type: 'UPDATE_DOSSIER', dossier: updated })
    try {
      await withTimeout(db.saveDossier(updated, authUser?.id), 12000)
    } catch (err) {
      // échec : on annule visuellement (la tâche ajoutée disparaît)
      if (!estTimeout(err)) {
        dispatch({ type: 'UPDATE_DOSSIER', dossier })
      }
      console.warn('[ajouterTache] sauvegarde', estTimeout(err) ? 'timeout, état conservé' : 'échouée, rollback', err.message)
    }
  }), [state.dossiers, authUser])

  const supprimerTache = useCallback(protegerEcriture(async (dossierId, tacheId) => {
    const dossier = state.dossiers.find(d => d.id === dossierId)
    if (!dossier) return
    const now = new Date().toISOString()
    const updated = { ...dossier, taches: dossier.taches.filter(t => t.id !== tacheId), updatedAt: now, lastActionAt: now }
    // UI optimiste : on met à jour l'écran TOUT DE SUITE
    dispatch({ type: 'UPDATE_DOSSIER', dossier: updated })
    try {
      await withTimeout(db.saveDossier(updated, authUser?.id), 12000)
    } catch (err) {
      // échec : on annule visuellement (la tâche supprimée réapparaît)
      if (!estTimeout(err)) {
        dispatch({ type: 'UPDATE_DOSSIER', dossier })
      }
      console.warn('[supprimerTache] sauvegarde', estTimeout(err) ? 'timeout, état conservé' : 'échouée, rollback', err.message)
    }
  }), [state.dossiers, authUser])

  // ── Étapes manuelles ─────────────────────────────────────────────────────
  const ajouterEtapeManuelle = useCallback(async (dossierId, { date, texte, statut }) => {
    const titreTrim = (texte || '').trim()
    if (!titreTrim) return
    await db.addEtape({
      id:        uuid(),
      dossierId,
      date:      date || todayISO(),
      texte:     titreTrim,
      statut:    statut || 'fait',
      source:    'manuel',
      createdAt: new Date().toISOString(),
    }, authUser?.id)
  }, [authUser])

  const supprimerEtape = useCallback(async (etapeId) => {
    await db.deleteEtape(etapeId, authUser?.id)
  }, [authUser])

  // ── Suppression dossier ───────────────────────────────────────────────────
  const supprimerDossier = useCallback(protegerEcriture(async (id) => {
    const dossier = state.dossiers.find(d => d.id === id)
    // UI optimiste : retrait immédiat de l'écran
    removeReminder(id)
    dispatch({ type: 'DELETE_DOSSIER', id })
    try {
      await withTimeout(db.deleteDossier(id, authUser?.id), 12000)
    } catch (err) {
      // échec : on restaure le dossier (ADD_DOSSIER le ré-insère)
      if (!estTimeout(err)) {
        if (dossier) dispatch({ type: 'ADD_DOSSIER', dossier })
      }
      console.warn('[supprimerDossier] suppression', estTimeout(err) ? 'timeout, état conservé' : 'échouée, rollback', err.message)
    }
  }), [state.dossiers, authUser])

  // ── Clé API ───────────────────────────────────────────────────────────────
  const setApiKey = useCallback((key) => {
    localStorage.setItem('anthropic_api_key', key)
    dispatch({ type: 'SET_API_KEY', key })
  }, [])

  const setOpenaiKey = useCallback((key) => {
    localStorage.setItem('openai_api_key', key)
    dispatch({ type: 'SET_OPENAI_KEY', key })
  }, [])

  // ── Valeurs dérivées ──────────────────────────────────────────────────────
  const dossiersActifs    = state.dossiers.filter(d => d.etat !== 'clos')
  const dossiersAujourdhui = [...dossiersActifs]
    .sort((a, b) => a.quadrant - b.quadrant || b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 7)

  return (
    <AppContext.Provider value={{
      ...state,
      dossiersActifs,
      dossiersAujourdhui,
      creerDossier,
      mettreAJourDossier,
      toggleTache,
      ajouterTache,
      supprimerTache,
      supprimerDossier,
      rafraichirDonnees,
      ajouterEtapeManuelle,
      supprimerEtape,
      setApiKey,
      setOpenaiKey,
      authUser,
      userProfile,
      authLoading,
      authErrorMessage,
      logout,
      setUserProfile,
    }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be inside AppProvider')
  return ctx
}
