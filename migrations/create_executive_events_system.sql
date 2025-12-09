-- ========================================
-- SISTEMA DE EXECUTIVE EVENT MENUS
-- Data: 2025-01-XX
-- Descrição: Sistema completo para eventos corporativos/privados
--            Cardápios temporários e exclusivos com acesso via QR Code
-- ========================================

-- ========================================
-- TABELA: executive_events
-- Eventos executivos/corporativos
-- ========================================
CREATE TABLE IF NOT EXISTS executive_events (
  id SERIAL PRIMARY KEY,
  establishment_id INTEGER NOT NULL,
  name VARCHAR(255) NOT NULL,
  event_date DATE NOT NULL,
  logo_url VARCHAR(500) DEFAULT NULL,
  cover_image_url VARCHAR(500) DEFAULT NULL,
  slug VARCHAR(255) UNIQUE NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_executive_events_establishment 
    FOREIGN KEY (establishment_id) 
    REFERENCES bars(id) 
    ON DELETE CASCADE
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_executive_events_establishment 
  ON executive_events(establishment_id);
CREATE INDEX IF NOT EXISTS idx_executive_events_slug 
  ON executive_events(slug);
CREATE INDEX IF NOT EXISTS idx_executive_events_active 
  ON executive_events(is_active);
CREATE INDEX IF NOT EXISTS idx_executive_events_date 
  ON executive_events(event_date);

-- Comentários
COMMENT ON TABLE executive_events IS 'Eventos executivos/corporativos com cardápios exclusivos';
COMMENT ON COLUMN executive_events.slug IS 'Slug único para acesso público via URL/QR Code';
COMMENT ON COLUMN executive_events.is_active IS 'Se false, evento não é acessível publicamente';

-- ========================================
-- TABELA: event_settings
-- Configurações e personalização do evento
-- ========================================
CREATE TABLE IF NOT EXISTS event_settings (
  id SERIAL PRIMARY KEY,
  event_id INTEGER NOT NULL UNIQUE,
  custom_colors JSONB DEFAULT NULL,
  welcome_message TEXT DEFAULT NULL,
  wifi_info JSONB DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_event_settings_event 
    FOREIGN KEY (event_id) 
    REFERENCES executive_events(id) 
    ON DELETE CASCADE
);

-- Comentários
COMMENT ON TABLE event_settings IS 'Configurações de personalização visual e conteúdo do evento';
COMMENT ON COLUMN event_settings.custom_colors IS 'JSON com cores customizadas: {categoryBgColor, categoryTextColor, subcategoryBgColor, subcategoryTextColor, sidebarBgColor, sidebarTextColor, backgroundColor, textColor}';
COMMENT ON COLUMN event_settings.welcome_message IS 'Mensagem de boas-vindas personalizada para o evento';
COMMENT ON COLUMN event_settings.wifi_info IS 'JSON com informações de WiFi: {network, password}';

-- ========================================
-- TABELA: event_items
-- Relacionamento Many-to-Many: Event ↔ Items
-- ========================================
CREATE TABLE IF NOT EXISTS event_items (
  id SERIAL PRIMARY KEY,
  event_id INTEGER NOT NULL,
  item_id INTEGER NOT NULL,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_event_items_event 
    FOREIGN KEY (event_id) 
    REFERENCES executive_events(id) 
    ON DELETE CASCADE,
  CONSTRAINT fk_event_items_item 
    FOREIGN KEY (item_id) 
    REFERENCES menu_items(id) 
    ON DELETE CASCADE,
  CONSTRAINT unique_event_item UNIQUE (event_id, item_id)
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_event_items_event 
  ON event_items(event_id);
CREATE INDEX IF NOT EXISTS idx_event_items_item 
  ON event_items(item_id);
CREATE INDEX IF NOT EXISTS idx_event_items_order 
  ON event_items(event_id, display_order);

-- Comentários
COMMENT ON TABLE event_items IS 'Relacionamento entre eventos e itens do cardápio (Many-to-Many)';
COMMENT ON COLUMN event_items.display_order IS 'Ordem de exibição do item no evento';

-- ========================================
-- TABELA: event_seals
-- Selos/Badges personalizados por evento
-- ========================================
CREATE TABLE IF NOT EXISTS event_seals (
  id SERIAL PRIMARY KEY,
  event_id INTEGER NOT NULL,
  name VARCHAR(100) NOT NULL,
  color VARCHAR(7) NOT NULL,
  type VARCHAR(20) DEFAULT 'food',
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_event_seals_event 
    FOREIGN KEY (event_id) 
    REFERENCES executive_events(id) 
    ON DELETE CASCADE
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_event_seals_event 
  ON event_seals(event_id);
CREATE INDEX IF NOT EXISTS idx_event_seals_order 
  ON event_seals(event_id, display_order);

-- Comentários
COMMENT ON TABLE event_seals IS 'Selos/badges personalizados por evento (ex: "Vegano", "Sem Glúten", etc.)';
COMMENT ON COLUMN event_seals.color IS 'Cor em formato hexadecimal (#RRGGBB)';
COMMENT ON COLUMN event_seals.type IS 'Tipo do selo: food, drink, ou custom';

-- ========================================
-- TRIGGERS: Atualização automática de updated_at
-- ========================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger para executive_events
DROP TRIGGER IF EXISTS update_executive_events_updated_at ON executive_events;
CREATE TRIGGER update_executive_events_updated_at 
  BEFORE UPDATE ON executive_events 
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger para event_settings
DROP TRIGGER IF EXISTS update_event_settings_updated_at ON event_settings;
CREATE TRIGGER update_event_settings_updated_at 
  BEFORE UPDATE ON event_settings 
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

-- ========================================
-- VALIDAÇÕES E CONSTRAINTS ADICIONAIS
-- ========================================

-- Validar formato de cor hexadecimal (opcional, via CHECK constraint)
-- Nota: PostgreSQL não suporta regex em CHECK constraints diretamente
-- A validação será feita na aplicação

-- ========================================
-- DADOS DE EXEMPLO (OPCIONAL - COMENTADO)
-- ========================================
/*
-- Exemplo de inserção de evento
INSERT INTO executive_events (establishment_id, name, event_date, slug)
VALUES (1, 'Jantar Corporativo Q1 2025', '2025-03-15', 'jantar-corporativo-q1-2025');

-- Exemplo de configurações
INSERT INTO event_settings (event_id, custom_colors, welcome_message, wifi_info)
VALUES (
  1,
  '{"categoryBgColor": "#1a1a1a", "categoryTextColor": "#ffffff", "backgroundColor": "#f5f5f5"}',
  'Bem-vindos ao nosso jantar corporativo!',
  '{"network": "Restaurante_WiFi", "password": "Evento2025"}'
);
*/

-- ========================================
-- ROLLBACK (se necessário)
-- ========================================
/*
DROP TRIGGER IF EXISTS update_event_settings_updated_at ON event_settings;
DROP TRIGGER IF EXISTS update_executive_events_updated_at ON executive_events;
DROP FUNCTION IF EXISTS update_updated_at_column();
DROP TABLE IF EXISTS event_seals;
DROP TABLE IF EXISTS event_items;
DROP TABLE IF EXISTS event_settings;
DROP TABLE IF EXISTS executive_events;
*/

