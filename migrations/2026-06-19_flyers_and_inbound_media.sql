-- Parte 1: armazenar o public_id da mídia (Cloudinary) para permitir a
-- exclusão precisa do arquivo no expurgo de 24h das mídias de conversa.
ALTER TABLE whatsapp_messages
  ADD COLUMN IF NOT EXISTS media_public_id TEXT;

-- Parte 2: Flyers por estabelecimento, enviados automaticamente em eventos
-- de reserva (reserva_criada, reserva_cancelada, pos_visita).
CREATE TABLE IF NOT EXISTS ai_flyers (
  id BIGSERIAL PRIMARY KEY,
  establishment_id INTEGER NOT NULL,
  trigger_event VARCHAR(40) NOT NULL DEFAULT 'reserva_criada',
  title VARCHAR(120) NOT NULL DEFAULT '',
  caption TEXT NOT NULL DEFAULT '',
  media_url TEXT NOT NULL DEFAULT '',
  media_public_id TEXT NOT NULL DEFAULT '',
  delay_hours INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_flyers_establishment
  ON ai_flyers (establishment_id, trigger_event, is_active);

-- Registro de envios (idempotência: evita reenviar o mesmo flyer para a
-- mesma reserva/evento).
CREATE TABLE IF NOT EXISTS ai_flyer_sends (
  id BIGSERIAL PRIMARY KEY,
  flyer_id BIGINT NOT NULL,
  reservation_id BIGINT,
  wa_id VARCHAR(20) NOT NULL DEFAULT '',
  trigger_event VARCHAR(40) NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_ai_flyer_sends
  ON ai_flyer_sends (flyer_id, reservation_id, trigger_event);
