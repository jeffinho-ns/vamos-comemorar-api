-- ============================================================================
-- SaaS Multi-Tenant — Fase 1 / 001: Núcleo de tenancy (ADITIVO)
-- ----------------------------------------------------------------------------
-- Cria as tabelas-raiz do modelo multi-tenant SEM tocar em nenhuma tabela
-- legada. Tudo é idempotente (CREATE ... IF NOT EXISTS). Não remove nada.
--
-- ⚠️ NÃO EXECUTAR EM PRODUÇÃO direto. Rodar primeiro em STAGING com backup.
--    Estratégia: Expand → Migrate → Contract (ver migrations/saas/README.md).
-- ============================================================================

SET search_path TO meu_backup_db, public;

-- Organização = tenant raiz (o grupo/empresa cliente do SaaS)
CREATE TABLE IF NOT EXISTS organizations (
  id              SERIAL PRIMARY KEY,
  slug            VARCHAR(120) NOT NULL UNIQUE,
  name            VARCHAR(255) NOT NULL,
  status          VARCHAR(30)  NOT NULL DEFAULT 'active', -- active | suspended | trial | canceled
  saas_enabled    BOOLEAN      NOT NULL DEFAULT FALSE,    -- feature flag por org (liga o "modo SaaS")
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Estabelecimento canônico = unifica places + bars (mantém ponteiros legados)
CREATE TABLE IF NOT EXISTS establishments (
  id                       SERIAL PRIMARY KEY,
  organization_id          INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  slug                     VARCHAR(120),
  name                     VARCHAR(255) NOT NULL,
  status                   VARCHAR(30) NOT NULL DEFAULT 'active',
  config                   JSONB NOT NULL DEFAULT '{}'::jsonb, -- horários, limites, regras (substitui hardcodes)
  legacy_place_id          INTEGER,  -- aponta para places.id
  legacy_bar_id            INTEGER,  -- aponta para bars.id (resolve alias 5 -> place 9)
  whatsapp_phone_number_id VARCHAR(120),
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_establishments_org        ON establishments(organization_id);
CREATE INDEX IF NOT EXISTS idx_establishments_legacy_pl  ON establishments(legacy_place_id);
CREATE INDEX IF NOT EXISTS idx_establishments_legacy_bar ON establishments(legacy_bar_id);

-- Papéis (roles) — de fábrica + customizáveis por organização (organization_id NULL = global de fábrica)
CREATE TABLE IF NOT EXISTS roles (
  id              SERIAL PRIMARY KEY,
  organization_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE,
  key             VARCHAR(60) NOT NULL,   -- account_admin, gerente_bar, promoter, hostess, recepcao
  name            VARCHAR(120) NOT NULL,
  is_system       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, key)
);

-- Permissões no formato modulo:acao (reservas:create, checkin:update, ...)
CREATE TABLE IF NOT EXISTS permissions (
  id          SERIAL PRIMARY KEY,
  key         VARCHAR(80) NOT NULL UNIQUE, -- ex.: 'reservas:create'
  module      VARCHAR(40) NOT NULL,        -- ex.: 'reservas'
  action      VARCHAR(40) NOT NULL,        -- ex.: 'create'
  description VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id       INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id INTEGER NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

-- Vínculo usuário × organização × estabelecimento × papel
-- establishment_id NULL = escopo de organização inteira
CREATE TABLE IF NOT EXISTS memberships (
  id               SERIAL PRIMARY KEY,
  user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id  INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  establishment_id INTEGER REFERENCES establishments(id) ON DELETE CASCADE,
  role_id          INTEGER REFERENCES roles(id) ON DELETE SET NULL,
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, organization_id, establishment_id)
);
CREATE INDEX IF NOT EXISTS idx_memberships_user ON memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_memberships_org  ON memberships(organization_id);
