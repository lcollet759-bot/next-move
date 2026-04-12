-- ── Next Move — Schéma Supabase ──────────────────────────────────────────────
-- Exécuter dans : https://supabase.com/dashboard/project/txjschrjzwhvziroexvb/sql

-- Table dossiers
CREATE TABLE IF NOT EXISTS dossiers (
  id                  text        PRIMARY KEY,
  titre               text        NOT NULL,
  organisme           text,
  origine             text        NOT NULL DEFAULT 'texte',
  type                text        NOT NULL DEFAULT 'vivant',
  etat                text        NOT NULL DEFAULT 'actionnable',
  urgence             boolean     NOT NULL DEFAULT false,
  importance          boolean     NOT NULL DEFAULT true,
  quadrant            integer     NOT NULL DEFAULT 2,
  description         text        NOT NULL DEFAULT '',
  echeance            date,
  raison_aujourd_hui  text        NOT NULL DEFAULT '',
  taches              jsonb       NOT NULL DEFAULT '[]',
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- Table journal
CREATE TABLE IF NOT EXISTS journal (
  id          text        PRIMARY KEY,
  dossier_id  text        NOT NULL REFERENCES dossiers(id) ON DELETE CASCADE,
  action      text        NOT NULL,
  detail      text        NOT NULL DEFAULT '',
  timestamp   timestamptz NOT NULL DEFAULT now()
);

-- Index pour les requêtes fréquentes
CREATE INDEX IF NOT EXISTS idx_dossiers_etat     ON dossiers(etat);
CREATE INDEX IF NOT EXISTS idx_dossiers_quadrant ON dossiers(quadrant);
CREATE INDEX IF NOT EXISTS idx_journal_dossier   ON journal(dossier_id);
CREATE INDEX IF NOT EXISTS idx_journal_timestamp ON journal(timestamp DESC);

-- RLS : activé avec politique ouverte (accès protégé par le mot de passe de l'app)
ALTER TABLE dossiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_all_dossiers" ON dossiers;
DROP POLICY IF EXISTS "anon_all_journal"  ON journal;

CREATE POLICY "anon_all_dossiers" ON dossiers FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_journal"  ON journal  FOR ALL TO anon USING (true) WITH CHECK (true);
