-- Migration: troca o UNIQUE global de restaurant_areas.name por UNIQUE por estabelecimento.
--
-- Motivo: o catálogo legado usava nome globalmente único (idx_22590_unique_name),
-- o que impede áreas com o mesmo nome em estabelecimentos diferentes (ex.: cada casa
-- ter sua própria "Área Coberta"). Passamos a exigir unicidade por (name, establishment_id),
-- tratando as áreas legadas (establishment_id NULL) como grupo 0.
--
-- Non-destructive: como os nomes atuais já são globalmente únicos, nenhum dado conflita.

DO $$
DECLARE
  rec record;
BEGIN
  -- 1) Remove eventual CONSTRAINT UNIQUE apenas em (name)
  FOR rec IN
    SELECT c.conname
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
     WHERE t.relname = 'restaurant_areas'
       AND c.contype = 'u'
       AND pg_get_constraintdef(c.oid) = 'UNIQUE (name)'
  LOOP
    EXECUTE format('ALTER TABLE restaurant_areas DROP CONSTRAINT %I', rec.conname);
  END LOOP;

  -- 2) Remove eventual ÍNDICE ÚNICO global apenas em (name)
  FOR rec IN
    SELECT n.nspname AS schname, i.relname AS idxname
      FROM pg_index x
      JOIN pg_class i ON i.oid = x.indexrelid
      JOIN pg_class t ON t.oid = x.indrelid
      JOIN pg_namespace n ON n.oid = i.relnamespace
     WHERE t.relname = 'restaurant_areas'
       AND x.indisunique
       AND pg_get_indexdef(x.indexrelid) ILIKE '%(name)%'
       AND pg_get_indexdef(x.indexrelid) NOT ILIKE '%establishment_id%'
  LOOP
    EXECUTE format('DROP INDEX %I.%I', rec.schname, rec.idxname);
  END LOOP;
END $$;

-- 3) Cria unicidade por estabelecimento (legado NULL vira grupo 0)
CREATE UNIQUE INDEX IF NOT EXISTS uq_restaurant_areas_name_establishment
  ON restaurant_areas (name, (COALESCE(establishment_id, 0)));
