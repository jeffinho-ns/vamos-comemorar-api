-- ============================================================================
-- SaaS Multi-Tenant — Unificação / 007: serviços por estabelecimento
-- ----------------------------------------------------------------------------
-- "Cada casa decide o que tem de serviço": tabela establishment_modules
-- (establishment × module × on/off). Faz um SEED inteligente baseado nos dados
-- existentes — é só um ponto de partida; o cliente curará no painel depois.
-- 100% ADITIVO e idempotente (ON CONFLICT DO NOTHING preserva curadoria futura).
--
-- Regra do seed (por establishment, usando os ids legados):
--   has_ops  = existe reserva em restaurant_reservations (place id OU bar id)
--   has_menu = tem bar (legacy_bar_id) OU existe menu_items.barid correspondente
--   reservas/checkin/eventos/whatsapp/promoters/relatorios = has_ops
--   cardapio = has_menu OU (NÃO has_ops)   -> casas cardápio-only (ex.: Sitio Ilha)
-- ============================================================================

SET search_path TO meu_backup_db, public;

CREATE TABLE IF NOT EXISTS establishment_modules (
  establishment_id INTEGER NOT NULL REFERENCES establishments(id) ON DELETE CASCADE,
  module_id        INTEGER NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  is_enabled       BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (establishment_id, module_id)
);
CREATE INDEX IF NOT EXISTS idx_establishment_modules_est ON establishment_modules(establishment_id);

DO $$
DECLARE
  e RECORD;
  has_ops  BOOLEAN;
  has_menu BOOLEAN;
  m RECORD;
  enabled BOOLEAN;
BEGIN
  FOR e IN SELECT id, legacy_place_id, legacy_bar_id FROM establishments LOOP
    has_ops := EXISTS (
      SELECT 1 FROM restaurant_reservations rr
       WHERE rr.establishment_id IN (e.legacy_place_id, e.legacy_bar_id)
    );
    has_menu := (e.legacy_bar_id IS NOT NULL) OR EXISTS (
      SELECT 1 FROM menu_items mi
       WHERE mi.barid IN (e.legacy_place_id, e.legacy_bar_id)
    );

    FOR m IN SELECT id, key FROM modules LOOP
      enabled := CASE m.key
        WHEN 'cardapio' THEN (has_menu OR NOT has_ops)
        ELSE has_ops
      END;
      INSERT INTO establishment_modules (establishment_id, module_id, is_enabled)
      VALUES (e.id, m.id, enabled)
      ON CONFLICT (establishment_id, module_id) DO NOTHING;
    END LOOP;
  END LOOP;
  RAISE NOTICE 'Seed de establishment_modules concluído.';
END $$;
