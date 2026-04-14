-- Migration : table `plannings` — calendrier adaptatif
-- Date     : 2026-04-14
-- Branche  : feature/calendrier-adaptatif
-- À coller dans Supabase → SQL Editor et exécuter AVANT le déploiement.

-- ── Table ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS plannings (
  id                 TEXT        PRIMARY KEY,
  date               DATE        NOT NULL UNIQUE,   -- un planning par jour
  heures_disponibles REAL        NOT NULL DEFAULT 4,
  taches_planifiees  JSONB       NOT NULL DEFAULT '[]',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Index ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_plannings_date ON plannings(date DESC);

-- ── RLS (identique au reste du schéma) ────────────────────────────────────
ALTER TABLE plannings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "plannings_all_authenticated"
  ON plannings
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
