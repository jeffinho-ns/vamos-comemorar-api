-- Disparo em lote controlado: filas e log por campanha
SET search_path TO meu_backup_db, public;

CREATE TABLE IF NOT EXISTS whatsapp_campaign_batches (
  id SERIAL PRIMARY KEY,
  campaign_id INTEGER NOT NULL REFERENCES whatsapp_campaigns(id) ON DELETE CASCADE,
  status VARCHAR(24) NOT NULL DEFAULT 'queued',
  total_planned INTEGER NOT NULL DEFAULT 0,
  processed_count INTEGER NOT NULL DEFAULT 0,
  sent_ok INTEGER NOT NULL DEFAULT 0,
  sent_fail INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  cursor_last_contact_id INTEGER NOT NULL DEFAULT 0,
  chunk_size INTEGER NOT NULL DEFAULT 25,
  delay_ms INTEGER NOT NULL DEFAULT 400,
  started_by INTEGER REFERENCES users(id),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_whatsapp_campaign_batches_status'
  ) THEN
    ALTER TABLE whatsapp_campaign_batches
      ADD CONSTRAINT chk_whatsapp_campaign_batches_status
      CHECK (status IN ('queued', 'processing', 'completed', 'failed', 'cancelled'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_whatsapp_campaign_batches_campaign
  ON whatsapp_campaign_batches (campaign_id, created_at DESC);

CREATE TABLE IF NOT EXISTS whatsapp_campaign_send_logs (
  id BIGSERIAL PRIMARY KEY,
  batch_id INTEGER NOT NULL REFERENCES whatsapp_campaign_batches(id) ON DELETE CASCADE,
  contact_id INTEGER REFERENCES whatsapp_contacts(id) ON DELETE SET NULL,
  wa_id VARCHAR(32) NOT NULL,
  status VARCHAR(24) NOT NULL,
  error_message TEXT,
  meta JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_whatsapp_campaign_send_logs_status'
  ) THEN
    ALTER TABLE whatsapp_campaign_send_logs
      ADD CONSTRAINT chk_whatsapp_campaign_send_logs_status
      CHECK (status IN ('sent', 'skipped', 'failed'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_whatsapp_campaign_send_logs_batch
  ON whatsapp_campaign_send_logs (batch_id, created_at DESC);

COMMENT ON TABLE whatsapp_campaign_batches IS 'Fila de disparo em lote por campanha (cursor + limites)';
COMMENT ON TABLE whatsapp_campaign_send_logs IS 'Log por contato em cada lote de disparo';
