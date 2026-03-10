CREATE TABLE IF NOT EXISTS restaurant_reservation_blocks (
  id SERIAL PRIMARY KEY,
  establishment_id INT NOT NULL,
  area_id INT NULL,
  start_datetime TIMESTAMP NOT NULL,
  end_datetime   TIMESTAMP NOT NULL,
  reason TEXT NOT NULL,
  recurrence_type VARCHAR(20) NOT NULL DEFAULT 'none',
  recurrence_weekday SMALLINT NULL,
  max_people_capacity INT NULL,
  created_by INT NULL REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reservation_blocks_estab_date
  ON restaurant_reservation_blocks (establishment_id, start_datetime, end_datetime);

CREATE INDEX IF NOT EXISTS idx_reservation_blocks_area
  ON restaurant_reservation_blocks (area_id);

