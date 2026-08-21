-- Justino360 — Fase 4 (calendário operacional / marketing → operação)
-- Idempotente: seguro para rodar em produção mais de uma vez.
--
-- Escopo: apenas j360_calendar_events. Não toca operational_details,
-- reservas, Highline ou WhatsApp.

BEGIN;

-- Cancelamento de evento é soft delete: a equipe já leu o briefing,
-- então o histórico precisa continuar auditável.
ALTER TABLE j360_calendar_events
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE j360_calendar_events
  ADD COLUMN IF NOT EXISTS updated_by INTEGER;

-- Listagem por janela de datas já filtrando eventos vigentes.
CREATE INDEX IF NOT EXISTS idx_j360_calendar_est_active_starts
  ON j360_calendar_events(establishment_id, is_active, starts_at);

COMMIT;
