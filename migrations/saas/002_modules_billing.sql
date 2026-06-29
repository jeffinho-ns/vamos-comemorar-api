-- ============================================================================
-- SaaS Multi-Tenant — Fase 1 / 002: Módulos, planos e faturamento (ADITIVO)
-- ----------------------------------------------------------------------------
-- Modulariza/monetiza o sistema e prepara o faturamento (Fase 5).
-- Idempotente. Não toca em tabelas legadas.
-- ⚠️ NÃO EXECUTAR EM PRODUÇÃO sem staging + backup.
-- ============================================================================

SET search_path TO meu_backup_db, public;

-- Catálogo de módulos vendáveis (reservas, checkin, cardapio, whatsapp, eventos, ...)
CREATE TABLE IF NOT EXISTS modules (
  id          SERIAL PRIMARY KEY,
  key         VARCHAR(40) NOT NULL UNIQUE,
  name        VARCHAR(120) NOT NULL,
  description VARCHAR(255),
  is_active   BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS plans (
  id          SERIAL PRIMARY KEY,
  key         VARCHAR(40) NOT NULL UNIQUE,
  name        VARCHAR(120) NOT NULL,
  price_cents INTEGER NOT NULL DEFAULT 0,
  currency    VARCHAR(3) NOT NULL DEFAULT 'BRL',
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS plan_modules (
  plan_id   INTEGER NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  module_id INTEGER NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  PRIMARY KEY (plan_id, module_id)
);

-- Assinatura da organização a um plano
CREATE TABLE IF NOT EXISTS subscriptions (
  id              SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  plan_id         INTEGER REFERENCES plans(id) ON DELETE SET NULL,
  status          VARCHAR(30) NOT NULL DEFAULT 'active', -- active | trialing | past_due | canceled
  started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  current_period_start DATE,
  current_period_end   DATE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_subscriptions_org ON subscriptions(organization_id);

-- Override por organização (liga/desliga módulo independentemente do plano)
CREATE TABLE IF NOT EXISTS organization_modules (
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  module_id       INTEGER NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  is_enabled      BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (organization_id, module_id)
);

-- ---------------------------------------------------------------------------
-- Faturamento (Fase 5) — modo manual primeiro, gateway-ready
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS invoices (
  id              SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  period_start    DATE,
  period_end      DATE,
  amount_cents    INTEGER NOT NULL DEFAULT 0,
  currency        VARCHAR(3) NOT NULL DEFAULT 'BRL',
  status          VARCHAR(20) NOT NULL DEFAULT 'pending', -- paid | pending | overdue | canceled
  due_date        DATE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_invoices_org ON invoices(organization_id);

CREATE TABLE IF NOT EXISTS payments (
  id           SERIAL PRIMARY KEY,
  invoice_id   INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  amount_cents INTEGER NOT NULL DEFAULT 0,
  paid_at      TIMESTAMPTZ,
  method       VARCHAR(30),   -- manual | pix | boleto | stripe | asaas | pagarme
  receipt_url  VARCHAR(500),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payments_invoice ON payments(invoice_id);

-- Auditoria de mudanças de plano/valor/módulos
CREATE TABLE IF NOT EXISTS billing_events (
  id              SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  event_type      VARCHAR(50) NOT NULL,
  payload         JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_billing_events_org ON billing_events(organization_id);
