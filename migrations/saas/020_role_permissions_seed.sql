-- ============================================================================
-- SaaS — 020: seed role_permissions (matriz de fábrica por org)
-- Idempotente: ON CONFLICT DO NOTHING
-- ============================================================================

SET search_path TO meu_backup_db, public;

DO $$
DECLARE
  org_rec RECORD;
  role_rec RECORD;
  perm_rec RECORD;
  perm_keys text[];
BEGIN
  FOR org_rec IN SELECT id FROM organizations LOOP
    -- Garante 5 roles de fábrica
    INSERT INTO roles (organization_id, key, name, is_system) VALUES
      (org_rec.id, 'account_admin', 'Account Admin', TRUE),
      (org_rec.id, 'gerente_bar',   'Gerente do Bar', TRUE),
      (org_rec.id, 'promoter',      'Promoter', TRUE),
      (org_rec.id, 'hostess',       'Hostess', TRUE),
      (org_rec.id, 'recepcao',      'Recepção', TRUE)
    ON CONFLICT (organization_id, key) DO NOTHING;

    FOR role_rec IN SELECT id, key FROM roles WHERE organization_id = org_rec.id LOOP
      IF role_rec.key = 'account_admin' THEN
        perm_keys := NULL;
        FOR perm_rec IN SELECT id FROM permissions LOOP
          INSERT INTO role_permissions (role_id, permission_id)
          VALUES (role_rec.id, perm_rec.id)
          ON CONFLICT DO NOTHING;
        END LOOP;
      ELSIF role_rec.key = 'gerente_bar' THEN
        perm_keys := ARRAY[
          'reservas:read','reservas:create','reservas:update','reservas:delete',
          'checkin:read','checkin:update','cardapio:read','cardapio:update',
          'whatsapp:read','whatsapp:update','eventos:read','eventos:update','relatorios:read'
        ];
      ELSIF role_rec.key = 'promoter' THEN
        perm_keys := ARRAY['eventos:read','reservas:read','checkin:read'];
      ELSIF role_rec.key = 'hostess' THEN
        perm_keys := ARRAY['checkin:read','checkin:update','reservas:read'];
      ELSIF role_rec.key = 'recepcao' THEN
        perm_keys := ARRAY['reservas:read','reservas:create','reservas:update','checkin:read','checkin:update'];
      ELSE
        perm_keys := NULL;
      END IF;

      IF perm_keys IS NOT NULL THEN
        FOR perm_rec IN
          SELECT id FROM permissions WHERE key = ANY(perm_keys)
        LOOP
          INSERT INTO role_permissions (role_id, permission_id)
          VALUES (role_rec.id, perm_rec.id)
          ON CONFLICT DO NOTHING;
        END LOOP;
      END IF;
    END LOOP;
  END LOOP;

  RAISE NOTICE 'role_permissions seed concluído para todas as organizations';
END $$;
