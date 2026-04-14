-- Migration : table `routines` — tâches récurrentes
-- Date     : 2026-04-14
-- Branche  : feature/planning-ia-routines
-- À coller dans Supabase → SQL Editor et exécuter AVANT le déploiement.

CREATE TABLE IF NOT EXISTS routines (
  id            TEXT        PRIMARY KEY,
  titre         TEXT        NOT NULL,
  duree_minutes INTEGER     NOT NULL DEFAULT 30,
  recurrence    TEXT        NOT NULL DEFAULT 'daily'
                  CHECK (recurrence IN ('daily', 'weekly', 'monthly')),
  jour_semaine  INTEGER     CHECK (jour_semaine BETWEEN 0 AND 6),  -- 0=dim … 6=sam
  jour_mois     INTEGER     CHECK (jour_mois    BETWEEN 1 AND 31),
  actif         BOOLEAN     NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_routines_recurrence ON routines(recurrence);

ALTER TABLE routines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "routines_all_authenticated"
  ON routines FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
