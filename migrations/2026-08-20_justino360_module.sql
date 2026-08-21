-- ============================================================
-- Justino360 — módulo de operação do Seu Justino (concepção Isa)
-- establishment_id operacional = places.id = 1
-- ============================================================

-- Módulo SaaS
INSERT INTO modules (key, name)
VALUES ('justino360', 'Justino360')
ON CONFLICT (key) DO NOTHING;

-- Habilitar só no estabelecimento com legacy_place_id = 1 (Seu Justino)
INSERT INTO establishment_modules (establishment_id, module_id, is_enabled)
SELECT e.id, m.id, TRUE
FROM establishments e
CROSS JOIN modules m
WHERE e.legacy_place_id = 1
  AND m.key = 'justino360'
ON CONFLICT (establishment_id, module_id) DO UPDATE SET is_enabled = TRUE;

-- Também na organização (a tabela só existe após migrations/saas/002)
DO $$
BEGIN
  IF to_regclass('public.organization_modules') IS NOT NULL THEN
    INSERT INTO organization_modules (organization_id, module_id, is_enabled)
    SELECT DISTINCT e.organization_id, m.id, TRUE
    FROM establishments e
    CROSS JOIN modules m
    WHERE e.legacy_place_id = 1
      AND m.key = 'justino360'
      AND e.organization_id IS NOT NULL
    ON CONFLICT (organization_id, module_id) DO UPDATE SET is_enabled = TRUE;
  END IF;
END $$;

-- Flags UEP
ALTER TABLE user_establishment_permissions
  ADD COLUMN IF NOT EXISTS can_access_justino360 BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS can_manage_justino360 BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS can_validate_justino360 BOOLEAN DEFAULT FALSE;

-- ---------- Setores ----------
CREATE TABLE IF NOT EXISTS j360_sectors (
  id SERIAL PRIMARY KEY,
  establishment_id INTEGER NOT NULL,
  key VARCHAR(40) NOT NULL,
  name VARCHAR(120) NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (establishment_id, key)
);

CREATE INDEX IF NOT EXISTS idx_j360_sectors_est ON j360_sectors(establishment_id);

-- ---------- Checklists ----------
CREATE TABLE IF NOT EXISTS j360_checklist_templates (
  id SERIAL PRIMARY KEY,
  establishment_id INTEGER NOT NULL,
  sector_id INTEGER REFERENCES j360_sectors(id) ON DELETE SET NULL,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  shift_type VARCHAR(40) DEFAULT 'abertura', -- abertura | fechamento | rotina | inspecao
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS j360_checklist_template_items (
  id SERIAL PRIMARY KEY,
  template_id INTEGER NOT NULL REFERENCES j360_checklist_templates(id) ON DELETE CASCADE,
  title VARCHAR(300) NOT NULL,
  description TEXT,
  requires_photo BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS j360_checklist_runs (
  id SERIAL PRIMARY KEY,
  establishment_id INTEGER NOT NULL,
  template_id INTEGER NOT NULL REFERENCES j360_checklist_templates(id) ON DELETE CASCADE,
  sector_id INTEGER REFERENCES j360_sectors(id) ON DELETE SET NULL,
  run_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status VARCHAR(40) NOT NULL DEFAULT 'em_andamento', -- em_andamento | concluido | atrasado
  started_by INTEGER,
  completed_by INTEGER,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_j360_runs_est_date ON j360_checklist_runs(establishment_id, run_date);

CREATE TABLE IF NOT EXISTS j360_checklist_run_items (
  id SERIAL PRIMARY KEY,
  run_id INTEGER NOT NULL REFERENCES j360_checklist_runs(id) ON DELETE CASCADE,
  template_item_id INTEGER REFERENCES j360_checklist_template_items(id) ON DELETE SET NULL,
  title VARCHAR(300) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pendente', -- pendente | ok | nao_ok | na
  observation TEXT,
  evidence_url TEXT,
  answered_by INTEGER,
  answered_at TIMESTAMPTZ,
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- ---------- Ocorrências ----------
CREATE TABLE IF NOT EXISTS j360_incidents (
  id SERIAL PRIMARY KEY,
  establishment_id INTEGER NOT NULL,
  sector_id INTEGER REFERENCES j360_sectors(id) ON DELETE SET NULL,
  checklist_run_item_id INTEGER REFERENCES j360_checklist_run_items(id) ON DELETE SET NULL,
  asset_id INTEGER,
  title VARCHAR(300) NOT NULL,
  description TEXT,
  category VARCHAR(80) DEFAULT 'operacional',
  priority VARCHAR(20) NOT NULL DEFAULT 'media', -- baixa | media | alta | critica
  status VARCHAR(40) NOT NULL DEFAULT 'aberta', -- aberta | em_andamento | aguardando | solucionada | cancelada
  evidence_url TEXT,
  assigned_to INTEGER,
  due_at TIMESTAMPTZ,
  solution TEXT,
  created_by INTEGER,
  resolved_by INTEGER,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_j360_incidents_est_status ON j360_incidents(establishment_id, status);

-- ---------- Tarefas ----------
CREATE TABLE IF NOT EXISTS j360_tasks (
  id SERIAL PRIMARY KEY,
  establishment_id INTEGER NOT NULL,
  sector_id INTEGER REFERENCES j360_sectors(id) ON DELETE SET NULL,
  origin VARCHAR(40) NOT NULL DEFAULT 'manual', -- checklist | ocorrencia | reuniao | manual | calendario
  origin_id INTEGER,
  title VARCHAR(300) NOT NULL,
  description TEXT,
  priority VARCHAR(20) NOT NULL DEFAULT 'media',
  status VARCHAR(40) NOT NULL DEFAULT 'aberta', -- aberta | em_andamento | aguardando | concluida | validada
  assigned_to INTEGER,
  due_at TIMESTAMPTZ,
  evidence_url TEXT,
  validated_by INTEGER,
  validated_at TIMESTAMPTZ,
  created_by INTEGER,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_j360_tasks_est_status ON j360_tasks(establishment_id, status);
CREATE INDEX IF NOT EXISTS idx_j360_tasks_assignee ON j360_tasks(assigned_to, status);

-- ---------- Documentos ----------
CREATE TABLE IF NOT EXISTS j360_documents (
  id SERIAL PRIMARY KEY,
  establishment_id INTEGER NOT NULL,
  sector_id INTEGER REFERENCES j360_sectors(id) ON DELETE SET NULL,
  category VARCHAR(80) NOT NULL DEFAULT 'pop', -- pop | manual | ficha | norma | laudo | ata | certificado | procedimento | outro
  role_key VARCHAR(80), -- garcom | barman | caixa | null = geral
  title VARCHAR(300) NOT NULL,
  description TEXT,
  file_url TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  is_current BOOLEAN NOT NULL DEFAULT TRUE,
  replaces_id INTEGER REFERENCES j360_documents(id) ON DELETE SET NULL,
  uploaded_by INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_j360_docs_est ON j360_documents(establishment_id, category);

-- ---------- Comunicados ----------
CREATE TABLE IF NOT EXISTS j360_announcements (
  id SERIAL PRIMARY KEY,
  establishment_id INTEGER NOT NULL,
  sector_id INTEGER REFERENCES j360_sectors(id) ON DELETE SET NULL,
  title VARCHAR(300) NOT NULL,
  body TEXT NOT NULL,
  priority VARCHAR(20) NOT NULL DEFAULT 'normal',
  requires_ack BOOLEAN NOT NULL DEFAULT TRUE,
  created_by INTEGER,
  published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS j360_announcement_reads (
  id SERIAL PRIMARY KEY,
  announcement_id INTEGER NOT NULL REFERENCES j360_announcements(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at TIMESTAMPTZ,
  acked_at TIMESTAMPTZ,
  UNIQUE (announcement_id, user_id)
);

-- ---------- Treinamentos ----------
CREATE TABLE IF NOT EXISTS j360_trainings (
  id SERIAL PRIMARY KEY,
  establishment_id INTEGER NOT NULL,
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

CREATE TABLE IF NOT EXISTS j360_training_assignments (
  id SERIAL PRIMARY KEY,
  training_id INTEGER NOT NULL REFERENCES j360_trainings(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  due_at TIMESTAMPTZ,
  status VARCHAR(40) NOT NULL DEFAULT 'pendente', -- pendente | em_andamento | concluido | vencido
  completed_at TIMESTAMPTZ,
  result VARCHAR(80),
  expires_at TIMESTAMPTZ,
  UNIQUE (training_id, user_id)
);

-- ---------- Calendário / Marketing ----------
CREATE TABLE IF NOT EXISTS j360_calendar_events (
  id SERIAL PRIMARY KEY,
  establishment_id INTEGER NOT NULL,
  title VARCHAR(300) NOT NULL,
  description TEXT,
  event_type VARCHAR(80) NOT NULL DEFAULT 'evento', -- evento | campanha | promocao | gravacao | corporativo | cardapio | outro
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ,
  impact_sector_ids INTEGER[] DEFAULT '{}',
  briefing TEXT,
  materials_url TEXT,
  created_by INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_j360_calendar_est_starts ON j360_calendar_events(establishment_id, starts_at);

-- ---------- Reuniões ----------
CREATE TABLE IF NOT EXISTS j360_meetings (
  id SERIAL PRIMARY KEY,
  establishment_id INTEGER NOT NULL,
  title VARCHAR(300) NOT NULL,
  meeting_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  attendees TEXT,
  minutes TEXT,
  created_by INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS j360_meeting_decisions (
  id SERIAL PRIMARY KEY,
  meeting_id INTEGER NOT NULL REFERENCES j360_meetings(id) ON DELETE CASCADE,
  decision TEXT NOT NULL,
  task_id INTEGER REFERENCES j360_tasks(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------- Ativos / Manutenção ----------
CREATE TABLE IF NOT EXISTS j360_assets (
  id SERIAL PRIMARY KEY,
  establishment_id INTEGER NOT NULL,
  sector_id INTEGER REFERENCES j360_sectors(id) ON DELETE SET NULL,
  name VARCHAR(200) NOT NULL,
  code VARCHAR(80),
  location VARCHAR(200),
  manufacturer VARCHAR(200),
  notes TEXT,
  next_maintenance_at DATE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS j360_asset_maintenance (
  id SERIAL PRIMARY KEY,
  asset_id INTEGER NOT NULL REFERENCES j360_assets(id) ON DELETE CASCADE,
  establishment_id INTEGER NOT NULL,
  kind VARCHAR(40) NOT NULL DEFAULT 'corretiva', -- corretiva | preventiva | inspecao
  title VARCHAR(300) NOT NULL,
  description TEXT,
  status VARCHAR(40) NOT NULL DEFAULT 'aberta',
  evidence_url TEXT,
  performed_by INTEGER,
  performed_at TIMESTAMPTZ,
  due_at TIMESTAMPTZ,
  created_by INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- FK tardia: incidentes → ativos
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_j360_incidents_asset'
  ) THEN
    ALTER TABLE j360_incidents
      ADD CONSTRAINT fk_j360_incidents_asset
      FOREIGN KEY (asset_id) REFERENCES j360_assets(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ---------- Audit log ----------
CREATE TABLE IF NOT EXISTS j360_audit_log (
  id BIGSERIAL PRIMARY KEY,
  establishment_id INTEGER NOT NULL,
  entity_type VARCHAR(80) NOT NULL,
  entity_id INTEGER,
  action VARCHAR(80) NOT NULL,
  actor_user_id INTEGER,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_j360_audit_est ON j360_audit_log(establishment_id, created_at DESC);

-- ---------- Índices de FK (evitam seq scan nas telas de detalhe) ----------
CREATE INDEX IF NOT EXISTS idx_j360_tpl_items_tpl ON j360_checklist_template_items(template_id);
CREATE INDEX IF NOT EXISTS idx_j360_run_items_run ON j360_checklist_run_items(run_id);
CREATE INDEX IF NOT EXISTS idx_j360_tpl_est ON j360_checklist_templates(establishment_id, is_active);
CREATE INDEX IF NOT EXISTS idx_j360_ann_est ON j360_announcements(establishment_id, is_active, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_j360_ann_reads_user ON j360_announcement_reads(user_id);
CREATE INDEX IF NOT EXISTS idx_j360_trainings_est ON j360_trainings(establishment_id, is_active);
CREATE INDEX IF NOT EXISTS idx_j360_train_assign_user ON j360_training_assignments(user_id, status);
CREATE INDEX IF NOT EXISTS idx_j360_meetings_est ON j360_meetings(establishment_id, meeting_at DESC);
CREATE INDEX IF NOT EXISTS idx_j360_assets_est ON j360_assets(establishment_id, is_active);
CREATE INDEX IF NOT EXISTS idx_j360_asset_maint_asset ON j360_asset_maintenance(asset_id, status);
CREATE INDEX IF NOT EXISTS idx_j360_asset_maint_est ON j360_asset_maintenance(establishment_id, status);

-- ---------- Seed setores Seu Justino ----------
INSERT INTO j360_sectors (establishment_id, key, name, sort_order) VALUES
  (1, 'cozinha', 'Cozinha', 1),
  (1, 'bar', 'Bar', 2),
  (1, 'salao', 'Salão', 3),
  (1, 'limpeza', 'Limpeza', 4),
  (1, 'caixa', 'Caixa', 5),
  (1, 'gerencia', 'Gerência', 6),
  (1, 'manutencao', 'Manutenção', 7),
  (1, 'marketing', 'Marketing', 8)
ON CONFLICT (establishment_id, key) DO NOTHING;

-- Liberar Justino360 para quem já tem UEP ativa no Seu Justino.
-- Acesso (executar checklists, abrir ocorrência, ler comunicado) = toda a equipe.
UPDATE user_establishment_permissions
SET can_access_justino360 = TRUE
WHERE establishment_id = 1
  AND is_active = TRUE
  AND can_access_justino360 IS NOT TRUE;

-- Gestão e validação só para admin/gerência — nunca para a equipe de operação.
UPDATE user_establishment_permissions uep
SET
  can_manage_justino360 = TRUE,
  can_validate_justino360 = TRUE
FROM users u
WHERE u.id = uep.user_id
  AND uep.establishment_id = 1
  AND uep.is_active = TRUE
  AND LOWER(TRIM(COALESCE(u.role, ''))) IN (
    'admin', 'administrador', 'gerente', 'subgerente'
  )
  AND (uep.can_manage_justino360 IS NOT TRUE OR uep.can_validate_justino360 IS NOT TRUE);

-- ---------- Seed templates de checklist (Fase 1) ----------
DO $$
DECLARE
  sec_cozinha INT;
  sec_bar INT;
  sec_salao INT;
  sec_limpeza INT;
  sec_caixa INT;
  sec_gerencia INT;
  tid INT;
BEGIN
  SELECT id INTO sec_cozinha FROM j360_sectors WHERE establishment_id = 1 AND key = 'cozinha';
  SELECT id INTO sec_bar FROM j360_sectors WHERE establishment_id = 1 AND key = 'bar';
  SELECT id INTO sec_salao FROM j360_sectors WHERE establishment_id = 1 AND key = 'salao';
  SELECT id INTO sec_limpeza FROM j360_sectors WHERE establishment_id = 1 AND key = 'limpeza';
  SELECT id INTO sec_caixa FROM j360_sectors WHERE establishment_id = 1 AND key = 'caixa';
  SELECT id INTO sec_gerencia FROM j360_sectors WHERE establishment_id = 1 AND key = 'gerencia';

  IF NOT EXISTS (SELECT 1 FROM j360_checklist_templates WHERE establishment_id = 1) THEN
    INSERT INTO j360_checklist_templates (establishment_id, sector_id, name, description, shift_type)
    VALUES (1, sec_cozinha, 'Abertura — Cozinha', 'Higiene, equipamentos, temperaturas e validade', 'abertura')
    RETURNING id INTO tid;
    INSERT INTO j360_checklist_template_items (template_id, title, requires_photo, sort_order) VALUES
      (tid, 'Bancadas e superfícies higienizadas', false, 1),
      (tid, 'Temperatura das câmaras frias registrada', true, 2),
      (tid, 'Validade de insumos conferida', false, 3),
      (tid, 'Equipamentos ligados e em funcionamento', false, 4),
      (tid, 'EPIs e utensílios disponíveis', false, 5);

    INSERT INTO j360_checklist_templates (establishment_id, sector_id, name, description, shift_type)
    VALUES (1, sec_cozinha, 'Fechamento — Cozinha', 'Limpeza, estoque e desligamento', 'fechamento')
    RETURNING id INTO tid;
    INSERT INTO j360_checklist_template_items (template_id, title, requires_photo, sort_order) VALUES
      (tid, 'Sobras etiquetadas e armazenadas', true, 1),
      (tid, 'Fogões e fornos desligados', false, 2),
      (tid, 'Área limpa e lixo retirado', false, 3);

    INSERT INTO j360_checklist_templates (establishment_id, sector_id, name, description, shift_type)
    VALUES (1, sec_bar, 'Abertura — Bar', 'Estoque, geladeiras e organização', 'abertura')
    RETURNING id INTO tid;
    INSERT INTO j360_checklist_template_items (template_id, title, requires_photo, sort_order) VALUES
      (tid, 'Geladeiras organizadas e temperatura ok', true, 1),
      (tid, 'Estoque de bebidas conferido', false, 2),
      (tid, 'Utensílios e copos limpos', false, 3),
      (tid, 'Chopeiras e equipamentos ok', false, 4);

    INSERT INTO j360_checklist_templates (establishment_id, sector_id, name, description, shift_type)
    VALUES (1, sec_bar, 'Fechamento — Bar', 'Conferência e limpeza do bar', 'fechamento')
    RETURNING id INTO tid;
    INSERT INTO j360_checklist_template_items (template_id, title, requires_photo, sort_order) VALUES
      (tid, 'Contagem de estoque crítico', false, 1),
      (tid, 'Área do bar limpa e organizada', true, 2),
      (tid, 'Equipamentos desligados conforme POP', false, 3);

    INSERT INTO j360_checklist_templates (establishment_id, sector_id, name, description, shift_type)
    VALUES (1, sec_salao, 'Abertura — Salão', 'Mesas, ambiente e banheiros', 'abertura')
    RETURNING id INTO tid;
    INSERT INTO j360_checklist_template_items (template_id, title, requires_photo, sort_order) VALUES
      (tid, 'Mesas montadas e alinhadas', false, 1),
      (tid, 'Iluminação e som conferidos', false, 2),
      (tid, 'Banheiros abastecidos e limpos', true, 3),
      (tid, 'Ambiente organizado para abertura', false, 4);

    INSERT INTO j360_checklist_templates (establishment_id, sector_id, name, description, shift_type)
    VALUES (1, sec_limpeza, 'Rotina — Limpeza', 'Conferência por ambiente', 'rotina')
    RETURNING id INTO tid;
    INSERT INTO j360_checklist_template_items (template_id, title, requires_photo, sort_order) VALUES
      (tid, 'Salão e circulação', false, 1),
      (tid, 'Banheiros', true, 2),
      (tid, 'Área de serviço / back', false, 3),
      (tid, 'Produtos e equipamentos ok', false, 4);

    INSERT INTO j360_checklist_templates (establishment_id, sector_id, name, description, shift_type)
    VALUES (1, sec_caixa, 'Abertura/Fechamento — Caixa', 'Conferências e procedimentos', 'abertura')
    RETURNING id INTO tid;
    INSERT INTO j360_checklist_template_items (template_id, title, requires_photo, sort_order) VALUES
      (tid, 'Fundo de caixa conferido', false, 1),
      (tid, 'Equipamentos de PDV ok', false, 2),
      (tid, 'Fechamento e conferência do dia', true, 3);

    INSERT INTO j360_checklist_templates (establishment_id, sector_id, name, description, shift_type)
    VALUES (1, sec_gerencia, 'Inspeção geral — Gerência', 'Visão ampla da operação', 'inspecao')
    RETURNING id INTO tid;
    INSERT INTO j360_checklist_template_items (template_id, title, requires_photo, sort_order) VALUES
      (tid, 'Equipe posicionada e uniformizada', false, 1),
      (tid, 'Atendimento e experiência do cliente', false, 2),
      (tid, 'Manutenção e estrutura ok', false, 3),
      (tid, 'Ocorrências do dia revisadas', false, 4);
  END IF;
END $$;
