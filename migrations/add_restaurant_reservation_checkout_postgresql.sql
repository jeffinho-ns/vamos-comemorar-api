-- Check-out para reservas sem lista (restaurant_reservations)
-- Alinha com o fluxo de listas: check-in + check-out e horários.

ALTER TABLE restaurant_reservations
  ADD COLUMN IF NOT EXISTS checked_out BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS checkout_time TIMESTAMP NULL DEFAULT NULL;
