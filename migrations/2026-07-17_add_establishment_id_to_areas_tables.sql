-- Migration: adiciona establishment_id (nullable) a restaurant_areas e restaurant_tables
-- Objetivo: permitir áreas/mesas EDITÁVEIS por estabelecimento sem quebrar o legado.
--
-- Semântica:
--   establishment_id IS NULL  => área/mesa LEGADA (catálogo global compartilhado).
--                                 Comportamento atual preservado (filtro por convenção de nome).
--   establishment_id = <id>   => área/mesa PRÓPRIA de um estabelecimento (place.id operacional),
--                                 criada/gerenciada pelo admin do estabelecimento.
--
-- Non-destructive & idempotente: seguro rodar mais de uma vez e em produção.

ALTER TABLE restaurant_areas  ADD COLUMN IF NOT EXISTS establishment_id INTEGER;
ALTER TABLE restaurant_tables ADD COLUMN IF NOT EXISTS establishment_id INTEGER;

CREATE INDEX IF NOT EXISTS idx_restaurant_areas_establishment_id
  ON restaurant_areas (establishment_id);

CREATE INDEX IF NOT EXISTS idx_restaurant_tables_establishment_id
  ON restaurant_tables (establishment_id);
