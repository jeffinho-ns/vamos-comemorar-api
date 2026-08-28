-- operational_details: UNIQUE global em event_date → por estabelecimento.
-- Motivo: Pracinha, Justino e Highline precisam de OS no mesmo dia.
-- Idempotente: pode rodar mais de uma vez.

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT c.conname
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
     WHERE t.relname = 'operational_details'
       AND c.contype = 'u'
       AND pg_get_constraintdef(c.oid) ~* '\(event_date\)'
       AND pg_get_constraintdef(c.oid) !~* 'establishment_id'
  LOOP
    EXECUTE format('ALTER TABLE operational_details DROP CONSTRAINT %I', r.conname);
    RAISE NOTICE 'dropped constraint %', r.conname;
  END LOOP;

  -- Índices UNIQUE legados (sem establishment_id) criados fora de constraint.
  FOR r IN
    SELECT i.indexname
      FROM pg_indexes i
     WHERE i.tablename = 'operational_details'
       AND i.indexdef ~* 'UNIQUE'
       AND i.indexdef ~* '\(event_date\)'
       AND i.indexdef !~* 'establishment_id'
  LOOP
    EXECUTE format('DROP INDEX IF EXISTS %I', r.indexname);
    RAISE NOTICE 'dropped index %', r.indexname;
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS operational_details_event_date_est_uidx
  ON operational_details (event_date, establishment_id);
