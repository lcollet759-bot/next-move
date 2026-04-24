/**
 * Couche de persistance — Supabase
 * Remplace l'ancienne implémentation IndexedDB.
 * Interface publique identique → AppContext et le reste de l'app ne changent pas.
 */

import { supabase } from './supabase.js'

// ─── AUTH ────────────────────────────────────────────────────────────────────

export const signIn = async (email, password) => {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) raise(error, 'signIn');
  return data;
};

export const signOut = async () => {
  const { error } = await supabase.auth.signOut();
  if (error) raise(error, 'signOut');
};

export const getCurrentUser = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  return user; // null si non connecté
};

export const onAuthStateChange = (callback) => {
  return supabase.auth.onAuthStateChange(callback);
};

// ─── PROFIL UTILISATEUR ──────────────────────────────────────────────────────

export const getUserProfile = async (userId) => {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();
  if (error) raise(error, 'getUserProfile');
  return data;
};

export const updateUserProfile = async (userId, updates) => {
  const { data, error } = await supabase
    .from('users')
    .update(updates)
    .eq('id', userId)
    .select()
    .single();
  if (error) raise(error, 'updateUserProfile');
  return data;
};

export const updateCleApi = async (userId, cleApi) => {
  return updateUserProfile(userId, { cle_api_anthropic: cleApi });
};

// Admin uniquement
export const getAllUsers = async () => {
  const { data, error } = await supabase
    .from('users')
    .select('id, email, prenom, role, actif, created_at')
    .order('created_at', { ascending: true });
  if (error) raise(error, 'getAllUsers');
  return data;
};

export const toggleUserActif = async (userId, actif) => {
  const { error } = await supabase
    .from('users')
    .update({ actif })
    .eq('id', userId);
  if (error) raise(error, 'toggleUserActif');
};

// ── Helpers camelCase ↔ snake_case ────────────────────────────────────────

function toRow(d) {
  return {
    id:                 d.id,
    titre:              d.titre,
    organisme:          d.organisme ?? null,
    origine:            d.origine   ?? 'texte',
    type:               d.type      ?? 'vivant',
    etat:               d.etat      ?? 'actionnable',
    urgence:            d.urgence   ?? false,
    importance:         d.importance ?? true,
    quadrant:           d.quadrant  ?? 2,
    description:        d.description ?? '',
    echeance:           d.echeance  ?? null,
    raison_aujourd_hui: d.raisonAujourdhui ?? '',
    taches:             d.taches    ?? [],
    created_at:         d.createdAt,
    updated_at:         d.updatedAt,
  }
}

function fromRow(r) {
  return {
    id:               r.id,
    titre:            r.titre,
    organisme:        r.organisme ?? null,
    origine:          r.origine,
    type:             r.type,
    etat:             r.etat,
    urgence:          r.urgence,
    importance:       r.importance,
    quadrant:         r.quadrant,
    description:      r.description ?? '',
    echeance:         r.echeance ?? null,
    raisonAujourdhui: r.raison_aujourd_hui ?? '',
    taches:           Array.isArray(r.taches) ? r.taches : [],
    createdAt:        r.created_at,
    updatedAt:        r.updated_at,
  }
}

function toJournalRow(j) {
  return {
    id:         j.id,
    dossier_id: j.dossierId,
    action:     j.action,
    detail:     j.detail ?? '',
    timestamp:  j.timestamp,
  }
}

function fromJournalRow(r) {
  return {
    id:        r.id,
    dossierId: r.dossier_id,
    action:    r.action,
    detail:    r.detail ?? '',
    timestamp: r.timestamp,
  }
}

function raise(error, ctx) {
  if (!error) return
  console.error(`[DB] ${ctx}:`, error.message)
  throw new Error(error.message)
}

// ── Dossiers ──────────────────────────────────────────────────────────────

export async function getDossiers(userId) {
  const { data, error } = await supabase
    .from('dossiers')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  raise(error, 'getDossiers')
  return (data ?? []).map(fromRow)
}

export async function getDossier(id, userId) {
  const { data, error } = await supabase
    .from('dossiers')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .single()
  if (error?.code === 'PGRST116') return null
  raise(error, 'getDossier')
  return data ? fromRow(data) : null
}

export async function saveDossier(dossier, userId) {
  const row = { ...toRow(dossier), user_id: userId }
  const { error } = await supabase
    .from('dossiers')
    .upsert(row, { onConflict: 'id' })
  raise(error, 'saveDossier')
}

export async function deleteDossier(id, userId) {
  const { error } = await supabase
    .from('dossiers')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)
  raise(error, 'deleteDossier')
}

// ── Journal ───────────────────────────────────────────────────────────────

export async function getJournal(userId) {
  const { data, error } = await supabase
    .from('journal')
    .select('*')
    .eq('user_id', userId)
    .order('timestamp', { ascending: false })
  raise(error, 'getJournal')
  return (data ?? []).map(fromJournalRow)
}

export async function getJournalForDossier(dossierId, userId) {
  const { data, error } = await supabase
    .from('journal')
    .select('*')
    .eq('dossier_id', dossierId)
    .eq('user_id', userId)
    .order('timestamp', { ascending: false })
  raise(error, 'getJournalForDossier')
  return (data ?? []).map(fromJournalRow)
}

export async function addJournalEntry(entry, userId) {
  const row = { ...toJournalRow(entry), user_id: userId }
  const { error } = await supabase
    .from('journal')
    .insert(row)
  raise(error, 'addJournalEntry')
}

// ── Étapes (dossiers vivants) ─────────────────────────────────────────────

function toEtapeRow(e) {
  return {
    id:         e.id,
    dossier_id: e.dossierId,
    date:       e.date,
    texte:      e.texte,
    statut:     e.statut,
    source:     e.source ?? 'manuel',
    created_at: e.createdAt,
  }
}

function fromEtapeRow(r) {
  return {
    id:        r.id,
    dossierId: r.dossier_id,
    date:      r.date,
    texte:     r.texte,
    statut:    r.statut,
    source:    r.source,
    createdAt: r.created_at,
  }
}

export async function getEtapesForDossier(dossierId, userId) {
  const { data, error } = await supabase
    .from('etapes')
    .select('*')
    .eq('dossier_id', dossierId)
    .eq('user_id', userId)
    .order('date',       { ascending: true })
    .order('created_at', { ascending: true })
  raise(error, 'getEtapesForDossier')
  return (data ?? []).map(fromEtapeRow)
}

export async function addEtape(etape, userId) {
  const row = { ...toEtapeRow(etape), user_id: userId }
  const { error } = await supabase
    .from('etapes')
    .insert(row)
  raise(error, 'addEtape')
}

export async function deleteEtape(id, userId) {
  const { error } = await supabase
    .from('etapes')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)
  raise(error, 'deleteEtape')
}

// ── Plannings (calendrier adaptatif) ─────────────────────────────────────────

function toPlanningRow(p) {
  return {
    id:                 p.id,
    date:               p.date,
    heures_disponibles: p.heuresDisponibles,
    taches_planifiees:  p.tachesPlanifiees ?? [],
    created_at:         p.createdAt,
  }
}

function fromPlanningRow(r) {
  return {
    id:               r.id,
    date:             r.date,
    heuresDisponibles: r.heures_disponibles,
    tachesPlanifiees:  Array.isArray(r.taches_planifiees) ? r.taches_planifiees : [],
    createdAt:         r.created_at,
  }
}

export async function getPlanningForDate(date, userId) {
  const { data, error } = await supabase
    .from('plannings')
    .select('*')
    .eq('date', date)
    .eq('user_id', userId)
    .maybeSingle()
  raise(error, 'getPlanningForDate')
  return data ? fromPlanningRow(data) : null
}

export async function savePlanning(planning, userId) {
  const row = { ...toPlanningRow(planning), user_id: userId }
  const { error } = await supabase
    .from('plannings')
    .upsert(row, { onConflict: 'date' })
  raise(error, 'savePlanning')
}

// ── Routines ──────────────────────────────────────────────────────────────────

function toRoutineRow(r) {
  return {
    id:            r.id,
    titre:         r.titre,
    duree_minutes: r.dureeMin,
    recurrence:    r.recurrence,
    jour_semaine:  r.jourSemaine ?? null,
    jour_mois:     r.jourMois    ?? null,
    actif:         r.actif       ?? true,
    created_at:    r.createdAt,
  }
}

function fromRoutineRow(r) {
  return {
    id:          r.id,
    titre:       r.titre,
    dureeMin:    r.duree_minutes,
    recurrence:  r.recurrence,
    jourSemaine: r.jour_semaine,
    jourMois:    r.jour_mois,
    actif:       r.actif,
    createdAt:   r.created_at,
  }
}

export async function getRoutines(userId) {
  const { data, error } = await supabase
    .from('routines')
    .select('*')
    .eq('user_id', userId)
    .eq('actif', true)
    .order('created_at', { ascending: true })
  raise(error, 'getRoutines')
  return (data ?? []).map(fromRoutineRow)
}

export async function saveRoutine(routine, userId) {
  const row = { ...toRoutineRow(routine), user_id: userId }
  const { error } = await supabase
    .from('routines')
    .upsert(row, { onConflict: 'id' })
  raise(error, 'saveRoutine')
}

export async function deleteRoutine(id, userId) {
  const { error } = await supabase
    .from('routines')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)
  raise(error, 'deleteRoutine')
}
