import { createContext, useContext, useReducer, useEffect, useCallback, useState } from 'react'
import { v4 as uuid } from 'uuid'
import * as db from '../services/db'
import { getCurrentUser, getUserProfile, onAuthStateChange, signOut } from '../services/db'
import { setReminder, removeReminder, checkReminders, requestPermission, notifyEscalade } from '../services/notifications'

const AppContext = createContext(null)

const RECALC_KEY = 'nm-last-recalc'

// ── Helpers ──────────────────────────────────────────────────────────────────

function todayISO() {
  return new Date().toISOString().split('T')[0]
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

// ── Recalcul Eisenhower matinal ───────────────────────────────────────────────
// Règles :
//  - Échéance dépassée             → urgence=true + importance=true
//  - Échéance dans ≤ 3 jours       → urgence=true
//  - Échéance dans 4-7 jours       → urgence=true si déjà important
//  - Actionnable inactif ≥ 21 j    → importance=true (remonte en priorité)
function recalculerPriorites(dossiers) {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const updates = []

  for (const d of dossiers) {
    // On ne touche pas aux dossiers terminés
    if (['clos', 'bloque', 'attente_externe'].includes(d.etat)) continue

    let newUrgence    = d.urgence
    let newImportance = d.importance
    let changed       = false

    if (d.echeance) {
      const due  = new Date(d.echeance + 'T00:00:00')
      const diff = Math.ceil((due - today) / 86_400_000)   // jours restants (négatif = dépassé)

      if (diff < 0) {
        // Échéance dépassée — force urgent ET important
        if (!d.urgence || !d.importance) {
          newUrgence    = true
          newImportance = true
          changed       = true
        }
      } else if (diff <= 3 && !d.urgence) {
        // ≤ 3 jours — devient urgent
        newUrgence = true
        changed    = true
      } else if (diff <= 7 && !d.urgence && d.importance) {
        // 4-7 jours ET déjà important — passe urgent aussi
        newUrgence = true
        changed    = true
      }
    }

    // Dossier actionnable sans activité depuis ≥ 21 jours → remonte en importance
    if (d.etat === 'actionnable' && !d.importance) {
      const daysSince = Math.floor((today - new Date(d.updatedAt)) / 86_400_000)
      if (daysSince >= 21) {
        newImportance = true
        changed       = true
      }
    }

    if (changed) {
      updates.push({
        id:         d.id,
        urgence:    newUrgence,
        importance: newImportance,
        quadrant:   calcQuadrant(newUrgence, newImportance)
      })
    }
  }

  return updates
}

// ── Évolution automatique des statuts ────────────────────────────────────────
// Règles :
//  - Échéance dépassée + actionnable/surveille → bloqué
//  - En attente externe depuis ≥ 15 jours      → actionnable + "Relancer ?"
//  - Q4 (ni urgent ni important) inactif ≥ 15j → importance=true (escalade)
function evoluerStatuts(dossiers) {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const updates = []

  for (const d of dossiers) {
    if (d.etat === 'clos') continue

    const changes = {}

    // Échéance dépassée : passe en Bloqué
    if (d.echeance && ['actionnable', 'surveille'].includes(d.etat)) {
      const due  = new Date(d.echeance + 'T00:00:00')
      const diff = Math.ceil((due - today) / 86_400_000)
      if (diff < 0) {
        changes.etat             = 'bloque'
        changes.raisonAujourdhui = 'Échéance dépassée — action requise.'
      }
    }

    // En attente externe depuis ≥ 15 jours : repasse en Actionnable
    if (d.etat === 'attente_externe') {
      const daysSince = Math.floor((today - new Date(d.updatedAt)) / 86_400_000)
      if (daysSince >= 15) {
        changes.etat             = 'actionnable'
        changes.raisonAujourdhui = 'Relancer ?'
      }
    }

    // Q4 inactif ≥ 15 jours : escalade → devient Important
    if (d.quadrant === 4 && ['actionnable', 'surveille'].includes(d.etat)) {
      const daysSince = Math.floor((today - new Date(d.updatedAt)) / 86_400_000)
      if (daysSince >= 15) {
        changes.importance = true
        changes._escalade  = true   // flag interne : déclenche notifyEscalade dans load()
      }
    }

    if (Object.keys(changes).length > 0) {
      updates.push({ id: d.id, ...changes })
    }
  }

  return updates
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

  const [authUser, setAuthUser]       = useState(null)
  const [userProfile, setUserProfile] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)

  // ── Auth ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    getCurrentUser().then(async (user) => {
      if (user) {
        setAuthUser(user)
        const profile = await getUserProfile(user.id)
        setUserProfile(profile)
      }
      setAuthLoading(false)
    })

    const { data: { subscription } } = onAuthStateChange(async (event, session) => {
      if (session?.user) {
        setAuthUser(session.user)
        const profile = await getUserProfile(session.user.id)
        setUserProfile(profile)
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
      await migrateFromIndexedDB()

      let [dossiers, journal] = await Promise.all([
        db.getDossiers(authUser?.id),
        db.getJournal(authUser?.id),
      ])

      // ── Recalcul quotidien : Eisenhower + statuts automatiques ────────────
      const lastRecalc = localStorage.getItem(RECALC_KEY)
      const today      = todayISO()
      if (lastRecalc !== today && dossiers.length > 0) {
        // Fusionner les deux types de mises à jour par ID
        const prioMap   = new Map(recalculerPriorites(dossiers).map(u => [u.id, u]))
        const statutMap = new Map(evoluerStatuts(dossiers).map(u => [u.id, u]))
        const allIds    = new Set([...prioMap.keys(), ...statutMap.keys()])

        if (allIds.size > 0) {
          const newJournalEntries = []
          const now = new Date().toISOString()

          await Promise.all([...allIds].map(uid => {
            const dossier = dossiers.find(d => d.id === uid)
            if (!dossier) return Promise.resolve()

            const prioU   = prioMap.get(uid)   || {}
            const statutU = statutMap.get(uid) || {}
            // Les changements de statut ont la priorité sur l'Eisenhower
            const { _escalade, ...statutUClean } = statutU
            const merged  = { ...prioU, ...statutUClean }

            const urgence    = merged.urgence    ?? dossier.urgence
            const importance = merged.importance ?? dossier.importance
            const updated    = {
              ...dossier,
              ...merged,
              urgence,
              importance,
              quadrant:  calcQuadrant(urgence, importance),
              updatedAt: now
            }
            dossiers = dossiers.map(d => d.id === uid ? updated : d)

            const ops = [db.saveDossier(updated, authUser?.id)]

            // Journaliser les transitions de statut automatiques
            if (merged.etat && merged.etat !== dossier.etat) {
              const etatsLabels = { bloque: 'Bloqué', actionnable: 'Actionnable' }
              const entry = {
                id:        uuid(),
                dossierId: uid,
                action:    'Statut automatique',
                detail:    `→ ${etatsLabels[merged.etat] || merged.etat}`,
                timestamp: now
              }
              newJournalEntries.push(entry)
              ops.push(db.addJournalEntry(entry, authUser?.id))
              // Tracer aussi dans l'historique dossier
              ops.push(db.addEtape({
                id:        uuid(),
                dossierId: uid,
                date:      today,
                texte:     (ETAT_TO_ETAPE_TEXTE[merged.etat] || `→ ${merged.etat}`) + ' (automatique)',
                statut:    ETAT_TO_ETAPE_STATUT[merged.etat] || 'fait',
                source:    'auto',
                createdAt: now,
              }, authUser?.id))
            }

            // Journaliser et notifier l'escalade Q4 → Important
            if (_escalade) {
              const entry = {
                id:        uuid(),
                dossierId: uid,
                action:    'Escalade automatique',
                detail:    'Q4 inactif ≥ 15 jours → Important',
                timestamp: now
              }
              newJournalEntries.push(entry)
              ops.push(db.addJournalEntry(entry, authUser?.id))
              notifyEscalade(dossier.titre)
              // Tracer dans l'historique dossier
              ops.push(db.addEtape({
                id:        uuid(),
                dossierId: uid,
                date:      today,
                texte:     'Escalade automatique — dossier Q4 inactif ≥ 15 jours, passé en Important',
                statut:    'en_attente',
                source:    'auto',
                createdAt: now,
              }, authUser?.id))
            }

            return Promise.all(ops)
          }))

          if (newJournalEntries.length > 0) {
            journal = [...newJournalEntries, ...journal]
          }
        }

        localStorage.setItem(RECALC_KEY, today)
      }

      dossiers.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      dispatch({ type: 'LOADED', dossiers, journal })
    }
    load()
    requestPermission()
    const interval = setInterval(checkReminders, 60 * 60 * 1000)
    checkReminders()
    return () => clearInterval(interval)
  }, [authUser])

  async function log(dossierId, action, detail) {
    const entry = { id: uuid(), dossierId, action, detail, timestamp: new Date().toISOString() }
    await db.addJournalEntry(entry, authUser?.id)
    dispatch({ type: 'ADD_JOURNAL', entry })
  }

  // ── creerDossier ──────────────────────────────────────────────────────────
  const creerDossier = useCallback(async (data) => {
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
      taches:          (data.taches || []).map(t =>
        typeof t === 'string'
          ? { id: uuid(), titre: t.trim(), done: false }
          : { ...t, titre: t.titre?.trim() || '' }
      ).filter(t => t.titre),
      createdAt:       new Date().toISOString(),
      updatedAt:       new Date().toISOString()
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
  }, [state.dossiers, authUser])

  // ── mettreAJourDossier ────────────────────────────────────────────────────
  const mettreAJourDossier = useCallback(async (id, updates) => {
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
      updatedAt:  new Date().toISOString()
    }

    await db.saveDossier(updated, authUser?.id)
    dispatch({ type: 'UPDATE_DOSSIER', dossier: updated })

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
  }, [state.dossiers, authUser])

  // ── Tâches ────────────────────────────────────────────────────────────────
  const toggleTache = useCallback(async (dossierId, tacheId) => {
    const dossier = state.dossiers.find(d => d.id === dossierId)
    if (!dossier) return
    const taches  = dossier.taches.map(t => t.id === tacheId ? { ...t, done: !t.done } : t)
    const updated = { ...dossier, taches, updatedAt: new Date().toISOString() }
    await db.saveDossier(updated, authUser?.id)
    dispatch({ type: 'UPDATE_DOSSIER', dossier: updated })
    const tache = taches.find(t => t.id === tacheId)
    if (tache?.done) await log(dossierId, 'Tâche complétée', tache.titre)
  }, [state.dossiers, authUser])

  const ajouterTache = useCallback(async (dossierId, titre) => {
    const titreTrim = (titre || '').trim()
    if (!titreTrim) return
    const dossier = state.dossiers.find(d => d.id === dossierId)
    if (!dossier) return
    const tache   = { id: uuid(), titre: titreTrim, done: false }
    const updated = { ...dossier, taches: [...dossier.taches, tache], updatedAt: new Date().toISOString() }
    await db.saveDossier(updated, authUser?.id)
    dispatch({ type: 'UPDATE_DOSSIER', dossier: updated })
  }, [state.dossiers, authUser])

  const supprimerTache = useCallback(async (dossierId, tacheId) => {
    const dossier = state.dossiers.find(d => d.id === dossierId)
    if (!dossier) return
    const updated = { ...dossier, taches: dossier.taches.filter(t => t.id !== tacheId), updatedAt: new Date().toISOString() }
    await db.saveDossier(updated, authUser?.id)
    dispatch({ type: 'UPDATE_DOSSIER', dossier: updated })
  }, [state.dossiers, authUser])

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
  const supprimerDossier = useCallback(async (id) => {
    await db.deleteDossier(id, authUser?.id)
    removeReminder(id)
    dispatch({ type: 'DELETE_DOSSIER', id })
  }, [authUser])

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
      ajouterEtapeManuelle,
      supprimerEtape,
      setApiKey,
      setOpenaiKey,
      authUser,
      userProfile,
      authLoading,
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
