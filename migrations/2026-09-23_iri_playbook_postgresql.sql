-- Ideia RH — manual por função (Seu Justino) + pontuação.
-- Texto fica no banco. Não há file_url: nada para baixar.

CREATE TABLE IF NOT EXISTS iri_employee_profiles (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  establishment_id INTEGER NOT NULL,
  sector_id INTEGER REFERENCES iri_sectors(id) ON DELETE SET NULL,
  role_key VARCHAR(80) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_iri_profiles_est
  ON iri_employee_profiles(organization_id, establishment_id, role_key);

CREATE TABLE IF NOT EXISTS iri_playbook_chapters (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL,
  establishment_id INTEGER NOT NULL,
  slug VARCHAR(120) NOT NULL,
  part VARCHAR(40) NOT NULL,
  audience VARCHAR(20) NOT NULL,
  visible_roles TEXT[] NOT NULL DEFAULT '{}',
  title VARCHAR(300) NOT NULL,
  body TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_current BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, slug, version)
);

CREATE INDEX IF NOT EXISTS idx_iri_chapters_est
  ON iri_playbook_chapters(organization_id, establishment_id, is_current);

CREATE TABLE IF NOT EXISTS iri_playbook_reads (
  id SERIAL PRIMARY KEY,
  chapter_id INTEGER NOT NULL REFERENCES iri_playbook_chapters(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL,
  version INTEGER NOT NULL,
  read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (chapter_id, user_id, version)
);

CREATE TABLE IF NOT EXISTS iri_playbook_terms (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL,
  establishment_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  version INTEGER NOT NULL,
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, user_id, version)
);

CREATE TABLE IF NOT EXISTS iri_playbook_questions (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL,
  establishment_id INTEGER NOT NULL,
  slug VARCHAR(80) NOT NULL,
  sort_order INTEGER NOT NULL,
  prompt TEXT NOT NULL,
  options JSONB NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  UNIQUE (organization_id, slug, version)
);

CREATE TABLE IF NOT EXISTS iri_playbook_answer_keys (
  question_id INTEGER PRIMARY KEY REFERENCES iri_playbook_questions(id) ON DELETE CASCADE,
  correct_index INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS iri_playbook_attempts (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL,
  establishment_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  version INTEGER NOT NULL,
  score INTEGER NOT NULL,
  total INTEGER NOT NULL,
  passed BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_iri_attempts_user
  ON iri_playbook_attempts(user_id, version, passed);

CREATE TABLE IF NOT EXISTS iri_playbook_checklists (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL,
  establishment_id INTEGER NOT NULL,
  role_key VARCHAR(80) NOT NULL,
  title VARCHAR(300) NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  UNIQUE (organization_id, establishment_id, role_key, version)
);

CREATE TABLE IF NOT EXISTS iri_playbook_checklist_items (
  id SERIAL PRIMARY KEY,
  checklist_id INTEGER NOT NULL REFERENCES iri_playbook_checklists(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS iri_playbook_checklist_runs (
  id SERIAL PRIMARY KEY,
  checklist_id INTEGER NOT NULL REFERENCES iri_playbook_checklists(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL,
  run_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status VARCHAR(40) NOT NULL DEFAULT 'entregue',
  confirmed_by INTEGER,
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (checklist_id, user_id, run_date)
);

CREATE TABLE IF NOT EXISTS iri_playbook_checklist_ticks (
  run_id INTEGER NOT NULL REFERENCES iri_playbook_checklist_runs(id) ON DELETE CASCADE,
  item_id INTEGER NOT NULL REFERENCES iri_playbook_checklist_items(id) ON DELETE CASCADE,
  PRIMARY KEY (run_id, item_id)
);

CREATE TABLE IF NOT EXISTS iri_evaluations (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL,
  establishment_id INTEGER NOT NULL,
  subject_user_id INTEGER NOT NULL,
  leader_user_id INTEGER NOT NULL,
  period_start DATE,
  period_end DATE,
  scores JSONB NOT NULL,
  strengths TEXT,
  improve TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS iri_leader_events (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL,
  establishment_id INTEGER NOT NULL,
  leader_user_id INTEGER NOT NULL,
  kind VARCHAR(40) NOT NULL,
  subject_user_id INTEGER,
  note TEXT,
  event_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS iri_point_ledger (
  id BIGSERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL,
  establishment_id INTEGER,
  user_id INTEGER NOT NULL,
  source VARCHAR(80) NOT NULL,
  points INTEGER NOT NULL,
  evidence_type VARCHAR(80),
  evidence_id INTEGER,
  note TEXT,
  created_by INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_iri_points_user
  ON iri_point_ledger(organization_id, user_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_iri_points_evidence
  ON iri_point_ledger(organization_id, user_id, source, evidence_type, evidence_id);

CREATE TABLE IF NOT EXISTS iri_reward_closes (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL,
  establishment_id INTEGER NOT NULL,
  year_month CHAR(7) NOT NULL,
  closed_by INTEGER NOT NULL,
  note TEXT,
  snapshot JSONB,
  closed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, establishment_id, year_month)
);

INSERT INTO iri_sectors (organization_id, key, name, sort_order)
SELECT o.id, s.key, s.name, s.sort_order
FROM organizations o
CROSS JOIN (VALUES
  ('portaria', 'Portaria', 8),
  ('apoio', 'Apoio', 9)
) AS s(key, name, sort_order)
WHERE o.slug = 'grupo-ideia-um'
ON CONFLICT (organization_id, key) DO NOTHING;
