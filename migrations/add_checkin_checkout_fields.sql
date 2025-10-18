-- Migração para adicionar campos de check-in e check-out
-- Execute este script se a tabela restaurant_reservations já existir

-- Adicionar campos de check-in e check-out se não existirem
ALTER TABLE restaurant_reservations 
ADD COLUMN IF NOT EXISTS check_in_time TIMESTAMP NULL DEFAULT NULL,
ADD COLUMN IF NOT EXISTS check_out_time TIMESTAMP NULL DEFAULT NULL;

-- Adicionar índices para melhor performance
ALTER TABLE restaurant_reservations 
ADD INDEX IF NOT EXISTS idx_reservation_date (reservation_date),
ADD INDEX IF NOT EXISTS idx_status (status);

-- Atualizar status existentes para usar os novos valores
UPDATE restaurant_reservations 
SET status = 'confirmed' 
WHERE status = 'CONFIRMADA' OR status = 'NOVA';

UPDATE restaurant_reservations 
SET status = 'pending' 
WHERE status = 'PENDENTE';

UPDATE restaurant_reservations 
SET status = 'cancelled' 
WHERE status = 'CANCELADA';

-- Criar tabela waitlist se não existir
CREATE TABLE IF NOT EXISTS waitlist (
  id int(11) NOT NULL AUTO_INCREMENT,
  establishment_id int(11) DEFAULT NULL,
  client_name varchar(255) NOT NULL,
  client_phone varchar(20) DEFAULT NULL,
  client_email varchar(255) DEFAULT NULL,
  number_of_people int(11) NOT NULL,
  preferred_time varchar(50) DEFAULT NULL,
  status varchar(50) DEFAULT 'AGUARDANDO',
  position int(11) DEFAULT 1,
  estimated_wait_time int(11) DEFAULT 0,
  notes text DEFAULT NULL,
  created_at timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_establishment_id (establishment_id),
  KEY idx_status (status),
  KEY idx_position (position)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Criar tabela walk_ins se não existir
CREATE TABLE IF NOT EXISTS walk_ins (
  id int(11) NOT NULL AUTO_INCREMENT,
  establishment_id int(11) DEFAULT NULL,
  client_name varchar(255) NOT NULL,
  client_phone varchar(20) DEFAULT NULL,
  number_of_people int(11) NOT NULL,
  arrival_time timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  area_id int(11) DEFAULT NULL,
  table_number varchar(50) DEFAULT NULL,
  status varchar(50) DEFAULT 'ATIVO',
  notes text DEFAULT NULL,
  created_by int(11) DEFAULT NULL,
  created_at timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_establishment_id (establishment_id),
  KEY idx_status (status),
  KEY idx_arrival_time (arrival_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;








