-- Validação RLS expandido (008–021) — órfãos organization_id nas tabelas RLS
SET search_path TO meu_backup_db, public;

\echo '=== Tabelas com RLS ==='
SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'meu_backup_db'
  AND c.relkind = 'r'
  AND c.relrowsecurity = true
ORDER BY c.relname;

\echo '=== Órfãos organization_id (tabelas RLS — esperado 0) ==='
SELECT 'restaurant_reservations' AS tbl, count(*) FROM restaurant_reservations WHERE organization_id IS NULL
UNION ALL SELECT 'guest_lists', count(*) FROM guest_lists WHERE organization_id IS NULL
UNION ALL SELECT 'guests', count(*) FROM guests WHERE organization_id IS NULL
UNION ALL SELECT 'waitlist', count(*) FROM waitlist WHERE organization_id IS NULL
UNION ALL SELECT 'walk_ins', count(*) FROM walk_ins WHERE organization_id IS NULL
UNION ALL SELECT 'large_reservations', count(*) FROM large_reservations WHERE organization_id IS NULL
UNION ALL SELECT 'birthday_reservations', count(*) FROM birthday_reservations WHERE organization_id IS NULL
UNION ALL SELECT 'restaurant_reservation_blocks', count(*) FROM restaurant_reservation_blocks WHERE organization_id IS NULL
UNION ALL SELECT 'reservas', count(*) FROM reservas WHERE organization_id IS NULL
UNION ALL SELECT 'reservas_camarote', count(*) FROM reservas_camarote WHERE organization_id IS NULL
UNION ALL SELECT 'promoters', count(*) FROM promoters WHERE organization_id IS NULL
UNION ALL SELECT 'promoter_eventos', count(*) FROM promoter_eventos WHERE organization_id IS NULL
UNION ALL SELECT 'promoter_convidados', count(*) FROM promoter_convidados WHERE organization_id IS NULL
UNION ALL SELECT 'menu_items', count(*) FROM menu_items WHERE organization_id IS NULL
UNION ALL SELECT 'cardapio_images', count(*) FROM cardapio_images WHERE organization_id IS NULL
UNION ALL SELECT 'menu_pause_schedules', count(*) FROM menu_pause_schedules WHERE organization_id IS NULL
UNION ALL SELECT 'whatsapp_contacts', count(*) FROM whatsapp_contacts WHERE organization_id IS NULL
UNION ALL SELECT 'whatsapp_conversations', count(*) FROM whatsapp_conversations WHERE organization_id IS NULL
UNION ALL SELECT 'whatsapp_messages', count(*) FROM whatsapp_messages WHERE organization_id IS NULL
UNION ALL SELECT 'whatsapp_campaigns', count(*) FROM whatsapp_campaigns WHERE organization_id IS NULL
UNION ALL SELECT 'establishment_faq', count(*) FROM establishment_faq WHERE organization_id IS NULL;

\echo '=== NOT NULL constraints em organization_id (tabelas RLS core 019) ==='
SELECT c.table_name, c.is_nullable
FROM information_schema.columns c
WHERE c.table_schema = 'meu_backup_db'
  AND c.column_name = 'organization_id'
  AND c.table_name IN (
    'restaurant_reservations','guest_lists','guests','waitlist','walk_ins',
    'large_reservations','birthday_reservations','restaurant_reservation_blocks',
    'reservas','reservas_camarote','promoters','promoter_eventos','promoter_convidados'
  )
ORDER BY c.table_name;
