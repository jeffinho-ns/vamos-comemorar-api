-- Páginas do BI Seu Justino por estabelecimento (UEP).
-- JSON array de chaves string; default lista vazia.

ALTER TABLE user_establishment_permissions
  ADD COLUMN IF NOT EXISTS bi_menu_access JSONB DEFAULT '[]'::jsonb;

UPDATE user_establishment_permissions
   SET bi_menu_access = '[]'::jsonb
 WHERE bi_menu_access IS NULL;
