/**
 * Couche de persistance — Supabase
 * Remplace l'ancienne implémentation IndexedDB.
 * Interface publique identique → AppContext et le reste de l'app ne changent pas.
 */

import { supabase } from './supabase.js'

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

export async function getDossiers() {
  const { data, error } = await supabase
    .from('dossiers')
    .select('*')
    .order('created_at', { ascending: false })
  raise(error, 'getDossiers')
  return (data ?? []).map(fromRow)
}

export async function getDossier(id) {
  const { data, error } = await supabase
    .from('dossiers')
    .select('*')
    .eq('id', id)
    .single()
  if (error?.code === 'PGRST116') return null
  raise(error, 'getDossier')
  return data ? fromRow(data) : null
}

export async function saveDossier(dossier) {
  const { error } = await supabase
    .from('dossiers')
    .upsert(toRow(dossier), { onConflict: 'id' })
  raise(error, 'saveDossier')
}

export async function deleteDossier(id) {
  const { error } = await supabase
    .from('dossiers')
    .delete()
    .eq('id', id)
  raise(error, 'deleteDossier')
}

// ── Journal ───────────────────────────────────────────────────────────────

export async function getJournal() {
  const { data, error } = await supabase
    .from('journal')
    .select('*')
    .order('timestamp', { ascending: false })
  raise(error, 'getJournal')
  return (data ?? []).map(fromJournalRow)
}

export async function getJournalForDossier(dossierId) {
  const { data, error } = await supabase
    .from('journal')
    .select('*')
    .eq('dossier_id', dossierId)
    .order('timestamp', { ascending: false })
  raise(error, 'getJournalForDossier')
  return (data ?? []).map(fromJournalRow)
}

export async function addJournalEntry(entry) {
  const { error } = await supabase
    .from('journal')
    .insert(toJournalRow(entry))
  raise(error, 'addJournalEntry')
}
