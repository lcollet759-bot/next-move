import { openDB } from 'idb'

const DB_NAME = 'next-move'
const DB_VERSION = 1

let _db = null

async function getDB() {
  if (_db) return _db
  _db = await openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      const dossierStore = db.createObjectStore('dossiers', { keyPath: 'id' })
      dossierStore.createIndex('etat', 'etat')
      dossierStore.createIndex('quadrant', 'quadrant')

      const journalStore = db.createObjectStore('journal', { keyPath: 'id' })
      journalStore.createIndex('dossierId', 'dossierId')
      journalStore.createIndex('timestamp', 'timestamp')
    }
  })
  return _db
}

// ── Dossiers ──
export async function getDossiers() {
  const db = await getDB()
  return db.getAll('dossiers')
}

export async function getDossier(id) {
  const db = await getDB()
  return db.get('dossiers', id)
}

export async function saveDossier(dossier) {
  const db = await getDB()
  await db.put('dossiers', dossier)
}

export async function deleteDossier(id) {
  const db = await getDB()
  await db.delete('dossiers', id)
}

// ── Journal ──
export async function getJournal() {
  const db = await getDB()
  const all = await db.getAllFromIndex('journal', 'timestamp')
  return all.reverse()
}

export async function getJournalForDossier(dossierId) {
  const db = await getDB()
  const all = await db.getAllFromIndex('journal', 'dossierId', dossierId)
  return all.sort((a, b) => b.timestamp.localeCompare(a.timestamp))
}

export async function addJournalEntry(entry) {
  const db = await getDB()
  await db.add('journal', entry)
}
