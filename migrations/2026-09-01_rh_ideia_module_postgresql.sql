-- ============================================================
-- Ideia RH — módulo people ops do Grupo Ideia Um
-- Gate por organization_id (slug grupo-ideia-um), multi-unidade
-- ============================================================

-- Módulo SaaS
INSERT INTO modules (key, name)
VALUES ('rh_ideia', 'Ideia RH')
ON CONFLICT (key) DO NOTHING;

-- Habilitar em TODOS establishments da org (legacy_place_id 1,7,8,9)
INSERT INTO establishment_modules (establishment_id, module_id, is_enabled)
SELECT e.id, m.id, TRUE
FROM establishments e
CROSS JOIN modules m
WHERE e.legacy_place_id IN (1, 7, 8, 9)
  AND m.key = 'rh_ideia'
ON CONFLICT (establishment_id, module_id) DO UPDATE SET is_enabled = TRUE;

-- organization_modules para grupo-ideia-um
DO $$
BEGIN
  IF to_regclass('public.organization_modules') IS NOT NULL
     OR to_regclass('meu_backup_db.organization_modules') IS NOT NULL THEN
    INSERT INTO organization_modules (organization_id, module_id, is_enabled)
    SELECT o.id, m.id, TRUE
    FROM organizations o
    CROSS JOIN modules m
    WHERE o.slug = 'grupo-ideia-um'
      AND m.key = 'rh_ideia'
    ON CONFLICT (organization_id, module_id) DO UPDATE SET is_enabled = TRUE;
  END IF;
END $$;

-- Flags UEP
ALTER TABLE user_establishment_permissions
  ADD COLUMN IF NOT EXISTS can_access_rh_ideia BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS can_manage_rh_ideia BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS can_validate_rh_ideia BOOLEAN DEFAULT FALSE;

-- ---------- Setores RH (escopo organização) ----------
CREATE TABLE IF NOT EXISTS iri_sectors (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL,
  key VARCHAR(40) NOT NULL,
  name VARCHAR(120) NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, key)
);

CREATE INDEX IF NOT EXISTS idx_iri_sectors_org ON iri_sectors(organization_id);

-- ---------- Comunicados ----------
CREATE TABLE IF NOT EXISTS iri_announcements (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL,
  establishment_id INTEGER,
  sector_id INTEGER REFERENCES iri_sectors(id) ON DELETE SET NULL,
  scope VARCHAR(20) NOT NULL DEFAULT 'organization',
  title VARCHAR(300) NOT NULL,
  body TEXT NOT NULL,
  priority VARCHAR(20) NOT NULL DEFAULT 'normal',
  requires_ack BOOLEAN NOT NULL DEFAULT TRUE,
  created_by INTEGER,
  published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS iri_announcement_reads (
  id SERIAL PRIMARY KEY,
  announcement_id INTEGER NOT NULL REFERENCES iri_announcements(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at TIMESTAMPTZ,
  acked_at TIMESTAMPTZ,
  UNIQUE (announcement_id, user_id)
);

-- ---------- Documentos ----------
CREATE TABLE IF NOT EXISTS iri_documents (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL,
  establishment_id INTEGER,
  sector_id INTEGER REFERENCES iri_sectors(id) ON DELETE SET NULL,
  scope VARCHAR(20) NOT NULL DEFAULT 'organization',
  category VARCHAR(80) NOT NULL DEFAULT 'regulamento',
  role_key VARCHAR(80),
  title VARCHAR(300) NOT NULL,
  description TEXT,
  file_url TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  is_current BOOLEAN NOT NULL DEFAULT TRUE,
  replaces_id INTEGER REFERENCES iri_documents(id) ON DELETE SET NULL,
  uploaded_by INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------- Treinamentos ----------
CREATE TABLE IF NOT EXISTS iri_trainings (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL,
  establishment_id INTEGER,
  scope VARCHAR(20) NOT NULL DEFAULT 'organization',
  title VARCHAR(300) NOT NULL,
  description TEXT,
  role_key VARCHAR(80),
  content_url TEXT,
  content_body TEXT,
  validity_days INTEGER,
  is_mandatory BOOLEAN NOT NULL DEFAULT TRUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS iri_training_assignments (
  id SERIAL PRIMARY KEY,
  training_id INTEGER NOT NULL REFERENCES iri_trainings(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  due_at TIMESTAMPTZ,
  status VARCHAR(40) NOT NULL DEFAULT 'pendente',
  completed_at TIMESTAMPTZ,
  result VARCHAR(80),
  expires_at TIMESTAMPTZ,
  UNIQUE (training_id, user_id)
);

-- ---------- Audit log ----------
CREATE TABLE IF NOT EXISTS iri_audit_log (
  id BIGSERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL,
  establishment_id INTEGER,
  entity_type VARCHAR(80) NOT NULL,
  entity_id INTEGER,
  action VARCHAR(80) NOT NULL,
  actor_user_id INTEGER,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_iri_ann_org ON iri_announcements(organization_id, is_active, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_iri_ann_reads_user ON iri_announcement_reads(user_id);
CREATE INDEX IF NOT EXISTS idx_iri_docs_org ON iri_documents(organization_id, category);
CREATE INDEX IF NOT EXISTS idx_iri_trainings_org ON iri_trainings(organization_id, is_active);
CREATE INDEX IF NOT EXISTS idx_iri_train_assign_user ON iri_training_assignments(user_id, status);
CREATE INDEX IF NOT EXISTS idx_iri_audit_org ON iri_audit_log(organization_id, created_at DESC);

-- ---------- Seed setores RH (Grupo Ideia) ----------
INSERT INTO iri_sectors (organization_id, key, name, sort_order)
SELECT o.id, s.key, s.name, s.sort_order
FROM organizations o
CROSS JOIN (VALUES
  ('administrativo', 'Administrativo', 1),
  ('cozinha', 'Cozinha', 2),
  ('salao', 'Salão', 3),
  ('bar', 'Bar', 4),
  ('rh', 'RH', 5),
  ('limpeza', 'Limpeza', 6),
  ('gerencia', 'Gerência', 7)
) AS s(key, name, sort_order)
WHERE o.slug = 'grupo-ideia-um'
ON CONFLICT (organization_id, key) DO NOTHING;

-- Liberar acesso para quem já tem UEP ativa nas casas do grupo
UPDATE user_establishment_permissions uep
SET can_access_rh_ideia = TRUE
FROM establishments e
WHERE e.id = uep.establishment_id
  AND e.legacy_place_id IN (1, 7, 8, 9)
  AND uep.is_active = TRUE
  AND uep.can_access_rh_ideia IS NOT TRUE;

-- Gestão/validação para admin/gerência
UPDATE user_establishment_permissions uep
SET
  can_manage_rh_ideia = TRUE,
  can_validate_rh_ideia = TRUE
FROM users u, establishments e
WHERE u.id = uep.user_id
  AND e.id = uep.establishment_id
  AND e.legacy_place_id IN (1, 7, 8, 9)
  AND uep.is_active = TRUE
  AND LOWER(TRIM(u.role::text)) IN (
    'admin', 'administrador', 'gerente', 'subgerente'
  )
  AND (uep.can_manage_rh_ideia IS NOT TRUE OR uep.can_validate_rh_ideia IS NOT TRUE);
