-- Condução do Fluxo Rooftop: itens da fila já conduzidos (sincronização multi-dispositivo)
-- Chave única: establishment_id + flow_date + queue_item_id (idempotência)
SET search_path TO meu_backup_db, public;

CREATE TABLE IF NOT EXISTS rooftop_conduction (
  id SERIAL PRIMARY KEY,
  establishment_id INTEGER NOT NULL,
  flow_date DATE NOT NULL,
  queue_item_id VARCHAR(128) NOT NULL,
  entity_type VARCHAR(32) NOT NULL,
  entity_id INTEGER NOT NULL,
  guest_list_id INTEGER,
  reservation_id INTEGER,
  conducted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  conducted_by VARCHAR(255),
  CONSTRAINT uq_rooftop_conduction_key UNIQUE (establishment_id, flow_date, queue_item_id)
);

CREATE INDEX IF NOT EXISTS idx_rooftop_conduction_lookup
  ON rooftop_conduction (establishment_id, flow_date);

COMMENT ON TABLE rooftop_conduction IS 'Itens da fila Rooftop já conduzidos (check-in no térreo → condução ao rooftop)';
