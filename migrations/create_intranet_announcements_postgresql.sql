-- Comunicados administrativos / RH exibidos no dashboard /admin (intranet).
-- Opcional: se a tabela não existir, a API retorna lista vazia.

CREATE TABLE IF NOT EXISTS intranet_announcements (
  id SERIAL PRIMARY KEY,
  establishment_id INTEGER NULL,
  title TEXT NOT NULL DEFAULT 'Aviso',
  body TEXT NOT NULL,
  footer_label TEXT DEFAULT 'Comunicado interno',
  sort_order INT DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_intranet_announcements_active_est
  ON intranet_announcements (establishment_id, sort_order)
  WHERE is_active = TRUE;
