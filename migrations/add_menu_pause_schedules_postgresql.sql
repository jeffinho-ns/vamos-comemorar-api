-- Pausa agendada de itens do cardápio (global: vale no cardápio público e no admin)
CREATE TABLE IF NOT EXISTS menu_pause_schedules (
  id SERIAL PRIMARY KEY,
  bar_id INTEGER NOT NULL,
  category_id INTEGER NOT NULL,
  sub_category_name VARCHAR(255) NULL,
  weekdays SMALLINT[] NOT NULL DEFAULT '{}',
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  label VARCHAR(120) NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT menu_pause_schedules_weekdays_check CHECK (
    cardinality(weekdays) > 0
    AND weekdays <@ ARRAY[0,1,2,3,4,5,6]::SMALLINT[]
  )
);

CREATE INDEX IF NOT EXISTS idx_menu_pause_schedules_bar_category
  ON menu_pause_schedules (bar_id, category_id)
  WHERE is_enabled = TRUE;

COMMENT ON TABLE menu_pause_schedules IS
  'Janelas de pausa por categoria/subcategoria (dias da semana + horário, fuso America/Sao_Paulo).';
