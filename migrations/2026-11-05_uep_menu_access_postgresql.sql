-- Acesso ao menu admin por estabelecimento (sidebar /admin/users).
-- JSON array de chaves string; default lista vazia.

ALTER TABLE user_establishment_permissions
  ADD COLUMN IF NOT EXISTS menu_access JSONB DEFAULT '[]'::jsonb;

UPDATE user_establishment_permissions
   SET menu_access = '[]'::jsonb
 WHERE menu_access IS NULL;
