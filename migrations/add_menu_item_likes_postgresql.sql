-- Uma curtida por visitante e por item do cardápio público.
-- A tabela é criada também em runtime (menuItemLikesService.ensureMenuItemLikesTable).

SET search_path TO meu_backup_db, public;

CREATE TABLE IF NOT EXISTS menu_item_likes (
  id BIGSERIAL PRIMARY KEY,
  item_id INTEGER NOT NULL,
  bar_id INTEGER NOT NULL,
  visitor_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT menu_item_likes_item_visitor_unique UNIQUE (item_id, visitor_key)
);

CREATE INDEX IF NOT EXISTS idx_menu_item_likes_bar_id
  ON menu_item_likes (bar_id);
