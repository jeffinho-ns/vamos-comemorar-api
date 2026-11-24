-- Três tipos de arte na aba Flyers: informação, datas e imagens da casa.
-- usage_hint = instrução para a Sol (quando enviar / o que a foto mostra).

ALTER TABLE ai_flyers
  ADD COLUMN IF NOT EXISTS asset_kind VARCHAR(20) NOT NULL DEFAULT 'informacao';

ALTER TABLE ai_flyers
  ADD COLUMN IF NOT EXISTS usage_hint TEXT NOT NULL DEFAULT '';

UPDATE ai_flyers
   SET asset_kind = 'informacao'
 WHERE asset_kind IS NULL OR btrim(asset_kind) = '';

CREATE INDEX IF NOT EXISTS idx_ai_flyers_kind
  ON ai_flyers (establishment_id, asset_kind, is_active);
