-- Migration : table `etapes` — dossiers vivants
-- Date     : 2026-04-14
-- Branche  : feature/dossier-vivant
-- À coller dans Supabase → SQL Editor et exécuter AVANT le déploiement.

-- ── Table ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS etapes (
  id          TEXT        PRIMARY KEY,
  dossier_id  TEXT        NOT NULL REFERENCES dossiers(id) ON DELETE CASCADE,
  date        DATE        NOT NULL,
  texte       TEXT        NOT NULL,
  statut      TEXT        NOT NULL DEFAULT 'fait'
                CHECK (statut IN ('fait', 'en_attente', 'bloque')),
  source      TEXT        NOT NULL DEFAULT 'manuel'
                CHECK (source IN ('manuel', 'auto')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Index ──────────────────────────────────────────────────────────────────
-- Requêtes par dossier, triées chronologiquement
CREATE INDEX IF NOT EXISTS idx_etapes_dossier_date
  ON etapes(dossier_id, date ASC, created_at ASC);

-- ── RLS (identique au reste du schéma) ────────────────────────────────────
ALTER TABLE etapes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "etapes_all_authenticated"
  ON etapes
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
