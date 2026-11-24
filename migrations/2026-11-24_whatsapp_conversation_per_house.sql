-- Isola o inbox por casa: o mesmo cliente pode ter um fio no Highline e outro no Justino.
-- Idempotente. O ensure em runtime também aplica isto no boot.

DO $$
DECLARE
  rec record;
BEGIN
  FOR rec IN
    SELECT con.conname
      FROM pg_constraint con
     WHERE con.conrelid = 'whatsapp_conversations'::regclass
       AND con.contype = 'u'
       AND pg_get_constraintdef(con.oid) ILIKE '%(wa_id)%'
       AND pg_get_constraintdef(con.oid) NOT ILIKE '%establishment_id%'
  LOOP
    EXECUTE format('ALTER TABLE whatsapp_conversations DROP CONSTRAINT IF EXISTS %I', rec.conname);
  END LOOP;
END $$;

DO $$
DECLARE
  rec record;
BEGIN
  FOR rec IN
    SELECT indexname
      FROM pg_indexes
     WHERE tablename = 'whatsapp_conversations'
       AND indexdef ILIKE '%UNIQUE%'
       AND indexdef ILIKE '%wa_id%'
       AND indexdef NOT ILIKE '%establishment_id%'
  LOOP
    EXECUTE format('DROP INDEX IF EXISTS %I', rec.indexname);
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_whatsapp_conversations_wa_est
  ON whatsapp_conversations (wa_id, establishment_id)
  WHERE establishment_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_whatsapp_conversations_wa_null_est
  ON whatsapp_conversations (wa_id)
  WHERE establishment_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_wa_updated
  ON whatsapp_conversations (wa_id, updated_at DESC);
