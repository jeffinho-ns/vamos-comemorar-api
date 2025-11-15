-- ========================================
-- MIGRAÇÃO MYSQL PARA POSTGRESQL
-- Triggers e Functions/Procedures
-- ========================================
-- Este arquivo contém:
-- 1. Função trigger para updated_at
-- 2. Triggers para todas as tabelas com updated_at
-- 3. Stored Procedure CalculatePromoterPerformance (PL/pgSQL)
-- 4. Function CanPromoterAddGuests (PL/pgSQL)
-- ========================================

-- ========================================
-- PARTE 1: FUNÇÃO TRIGGER PARA updated_at
-- ========================================

CREATE OR REPLACE FUNCTION trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ========================================
-- PARTE 2: TRIGGERS PARA TODAS AS TABELAS COM updated_at
-- ========================================

-- Tabela: bars
DROP TRIGGER IF EXISTS set_timestamp_bars ON bars;
CREATE TRIGGER set_timestamp_bars
  BEFORE UPDATE ON bars
  FOR EACH ROW
  EXECUTE FUNCTION trigger_set_timestamp();

-- Tabela: beneficios
DROP TRIGGER IF EXISTS set_timestamp_beneficios ON beneficios;
CREATE TRIGGER set_timestamp_beneficios
  BEFORE UPDATE ON beneficios
  FOR EACH ROW
  EXECUTE FUNCTION trigger_set_timestamp();

-- Tabela: birthday_reservations
DROP TRIGGER IF EXISTS set_timestamp_birthday_reservations ON birthday_reservations;
CREATE TRIGGER set_timestamp_birthday_reservations
  BEFORE UPDATE ON birthday_reservations
  FOR EACH ROW
  EXECUTE FUNCTION trigger_set_timestamp();

-- Tabela: cardapio_images
DROP TRIGGER IF EXISTS set_timestamp_cardapio_images ON cardapio_images;
CREATE TRIGGER set_timestamp_cardapio_images
  BEFORE UPDATE ON cardapio_images
  FOR EACH ROW
  EXECUTE FUNCTION trigger_set_timestamp();

-- Tabela: convidados
DROP TRIGGER IF EXISTS set_timestamp_convidados ON convidados;
CREATE TRIGGER set_timestamp_convidados
  BEFORE UPDATE ON convidados
  FOR EACH ROW
  EXECUTE FUNCTION trigger_set_timestamp();

-- Tabela: eventos
DROP TRIGGER IF EXISTS set_timestamp_eventos ON eventos;
CREATE TRIGGER set_timestamp_eventos
  BEFORE UPDATE ON eventos
  FOR EACH ROW
  EXECUTE FUNCTION trigger_set_timestamp();

-- Tabela: guest_lists
DROP TRIGGER IF EXISTS set_timestamp_guest_lists ON guest_lists;
CREATE TRIGGER set_timestamp_guest_lists
  BEFORE UPDATE ON guest_lists
  FOR EACH ROW
  EXECUTE FUNCTION trigger_set_timestamp();

-- Tabela: hostess
DROP TRIGGER IF EXISTS set_timestamp_hostess ON hostess;
CREATE TRIGGER set_timestamp_hostess
  BEFORE UPDATE ON hostess
  FOR EACH ROW
  EXECUTE FUNCTION trigger_set_timestamp();

-- Tabela: large_reservations
DROP TRIGGER IF EXISTS set_timestamp_large_reservations ON large_reservations;
CREATE TRIGGER set_timestamp_large_reservations
  BEFORE UPDATE ON large_reservations
  FOR EACH ROW
  EXECUTE FUNCTION trigger_set_timestamp();

-- Tabela: listas
DROP TRIGGER IF EXISTS set_timestamp_listas ON listas;
CREATE TRIGGER set_timestamp_listas
  BEFORE UPDATE ON listas
  FOR EACH ROW
  EXECUTE FUNCTION trigger_set_timestamp();

-- Tabela: listas_convidados
DROP TRIGGER IF EXISTS set_timestamp_listas_convidados ON listas_convidados;
CREATE TRIGGER set_timestamp_listas_convidados
  BEFORE UPDATE ON listas_convidados
  FOR EACH ROW
  EXECUTE FUNCTION trigger_set_timestamp();

-- Tabela: listas_convidados_eventos
DROP TRIGGER IF EXISTS set_timestamp_listas_convidados_eventos ON listas_convidados_eventos;
CREATE TRIGGER set_timestamp_listas_convidados_eventos
  BEFORE UPDATE ON listas_convidados_eventos
  FOR EACH ROW
  EXECUTE FUNCTION trigger_set_timestamp();

-- Tabela: lista_convidado_beneficio
DROP TRIGGER IF EXISTS set_timestamp_lista_convidado_beneficio ON lista_convidado_beneficio;
CREATE TRIGGER set_timestamp_lista_convidado_beneficio
  BEFORE UPDATE ON lista_convidado_beneficio
  FOR EACH ROW
  EXECUTE FUNCTION trigger_set_timestamp();

-- Tabela: menu_categories
DROP TRIGGER IF EXISTS set_timestamp_menu_categories ON menu_categories;
CREATE TRIGGER set_timestamp_menu_categories
  BEFORE UPDATE ON menu_categories
  FOR EACH ROW
  EXECUTE FUNCTION trigger_set_timestamp();

-- Tabela: menu_items
DROP TRIGGER IF EXISTS set_timestamp_menu_items ON menu_items;
CREATE TRIGGER set_timestamp_menu_items
  BEFORE UPDATE ON menu_items
  FOR EACH ROW
  EXECUTE FUNCTION trigger_set_timestamp();

-- Tabela: promoters
DROP TRIGGER IF EXISTS set_timestamp_promoters ON promoters;
CREATE TRIGGER set_timestamp_promoters
  BEFORE UPDATE ON promoters
  FOR EACH ROW
  EXECUTE FUNCTION trigger_set_timestamp();

-- Tabela: promoter_comissoes
DROP TRIGGER IF EXISTS set_timestamp_promoter_comissoes ON promoter_comissoes;
CREATE TRIGGER set_timestamp_promoter_comissoes
  BEFORE UPDATE ON promoter_comissoes
  FOR EACH ROW
  EXECUTE FUNCTION trigger_set_timestamp();

-- Tabela: promoter_condicoes
DROP TRIGGER IF EXISTS set_timestamp_promoter_condicoes ON promoter_condicoes;
CREATE TRIGGER set_timestamp_promoter_condicoes
  BEFORE UPDATE ON promoter_condicoes
  FOR EACH ROW
  EXECUTE FUNCTION trigger_set_timestamp();

-- Tabela: promoter_convidados
DROP TRIGGER IF EXISTS set_timestamp_promoter_convidados ON promoter_convidados;
CREATE TRIGGER set_timestamp_promoter_convidados
  BEFORE UPDATE ON promoter_convidados
  FOR EACH ROW
  EXECUTE FUNCTION trigger_set_timestamp();

-- Tabela: promoter_convites
DROP TRIGGER IF EXISTS set_timestamp_promoter_convites ON promoter_convites;
CREATE TRIGGER set_timestamp_promoter_convites
  BEFORE UPDATE ON promoter_convites
  FOR EACH ROW
  EXECUTE FUNCTION trigger_set_timestamp();

-- Tabela: promoter_eventos
DROP TRIGGER IF EXISTS set_timestamp_promoter_eventos ON promoter_eventos;
CREATE TRIGGER set_timestamp_promoter_eventos
  BEFORE UPDATE ON promoter_eventos
  FOR EACH ROW
  EXECUTE FUNCTION trigger_set_timestamp();

-- Tabela: promoter_evento_condicoes
DROP TRIGGER IF EXISTS set_timestamp_promoter_evento_condicoes ON promoter_evento_condicoes;
CREATE TRIGGER set_timestamp_promoter_evento_condicoes
  BEFORE UPDATE ON promoter_evento_condicoes
  FOR EACH ROW
  EXECUTE FUNCTION trigger_set_timestamp();

-- Tabela: promoter_performance
DROP TRIGGER IF EXISTS set_timestamp_promoter_performance ON promoter_performance;
CREATE TRIGGER set_timestamp_promoter_performance
  BEFORE UPDATE ON promoter_performance
  FOR EACH ROW
  EXECUTE FUNCTION trigger_set_timestamp();

-- Tabela: promoter_permissoes
DROP TRIGGER IF EXISTS set_timestamp_promoter_permissoes ON promoter_permissoes;
CREATE TRIGGER set_timestamp_promoter_permissoes
  BEFORE UPDATE ON promoter_permissoes
  FOR EACH ROW
  EXECUTE FUNCTION trigger_set_timestamp();

-- Tabela: reservas
DROP TRIGGER IF EXISTS set_timestamp_reservas ON reservas;
CREATE TRIGGER set_timestamp_reservas
  BEFORE UPDATE ON reservas
  FOR EACH ROW
  EXECUTE FUNCTION trigger_set_timestamp();

-- Tabela: reservas_camarote
DROP TRIGGER IF EXISTS set_timestamp_reservas_camarote ON reservas_camarote;
CREATE TRIGGER set_timestamp_reservas_camarote
  BEFORE UPDATE ON reservas_camarote
  FOR EACH ROW
  EXECUTE FUNCTION trigger_set_timestamp();

-- Tabela: restaurant_areas
DROP TRIGGER IF EXISTS set_timestamp_restaurant_areas ON restaurant_areas;
CREATE TRIGGER set_timestamp_restaurant_areas
  BEFORE UPDATE ON restaurant_areas
  FOR EACH ROW
  EXECUTE FUNCTION trigger_set_timestamp();

-- Tabela: restaurant_reservations
DROP TRIGGER IF EXISTS set_timestamp_restaurant_reservations ON restaurant_reservations;
CREATE TRIGGER set_timestamp_restaurant_reservations
  BEFORE UPDATE ON restaurant_reservations
  FOR EACH ROW
  EXECUTE FUNCTION trigger_set_timestamp();

-- Tabela: restaurant_tables
DROP TRIGGER IF EXISTS set_timestamp_restaurant_tables ON restaurant_tables;
CREATE TRIGGER set_timestamp_restaurant_tables
  BEFORE UPDATE ON restaurant_tables
  FOR EACH ROW
  EXECUTE FUNCTION trigger_set_timestamp();

-- Tabela: toppings
DROP TRIGGER IF EXISTS set_timestamp_toppings ON toppings;
CREATE TRIGGER set_timestamp_toppings
  BEFORE UPDATE ON toppings
  FOR EACH ROW
  EXECUTE FUNCTION trigger_set_timestamp();

-- Tabela: waitlist
DROP TRIGGER IF EXISTS set_timestamp_waitlist ON waitlist;
CREATE TRIGGER set_timestamp_waitlist
  BEFORE UPDATE ON waitlist
  FOR EACH ROW
  EXECUTE FUNCTION trigger_set_timestamp();

-- Tabela: walk_ins
DROP TRIGGER IF EXISTS set_timestamp_walk_ins ON walk_ins;
CREATE TRIGGER set_timestamp_walk_ins
  BEFORE UPDATE ON walk_ins
  FOR EACH ROW
  EXECUTE FUNCTION trigger_set_timestamp();

-- ========================================
-- PARTE 3: STORED PROCEDURE CalculatePromoterPerformance
-- ========================================

CREATE OR REPLACE FUNCTION CalculatePromoterPerformance(
  p_promoter_id INTEGER,
  p_evento_id INTEGER,
  p_data_evento DATE
)
RETURNS VOID AS $$
DECLARE
  v_convidados_convidados INTEGER := 0;
  v_convidados_compareceram INTEGER := 0;
  v_taxa_comparecimento DECIMAL(5,2) := 0.00;
  v_receita_gerada DECIMAL(10,2) := 0.00;
BEGIN
  -- Calcular convidados
  SELECT 
    COUNT(*),
    SUM(CASE WHEN status_checkin = 'Check-in' THEN 1 ELSE 0 END)
  INTO v_convidados_convidados, v_convidados_compareceram
  FROM listas_convidados lc
  JOIN listas l ON lc.lista_id = l.lista_id
  WHERE l.promoter_responsavel_id = p_promoter_id
  AND l.evento_id = p_evento_id;
  
  -- Calcular taxa de comparecimento
  IF v_convidados_convidados > 0 THEN
    v_taxa_comparecimento := (v_convidados_compareceram::DECIMAL / v_convidados_convidados::DECIMAL) * 100;
  END IF;
  
  -- Inserir ou atualizar performance
  INSERT INTO promoter_performance (
    promoter_id, evento_id, data_evento, convidados_convidados, 
    convidados_compareceram, taxa_comparecimento, receita_gerada
  ) VALUES (
    p_promoter_id, p_evento_id, p_data_evento, v_convidados_convidados,
    v_convidados_compareceram, v_taxa_comparecimento, v_receita_gerada
  )
  ON CONFLICT (promoter_id, evento_id, data_evento) 
  DO UPDATE SET
    convidados_convidados = EXCLUDED.convidados_convidados,
    convidados_compareceram = EXCLUDED.convidados_compareceram,
    taxa_comparecimento = EXCLUDED.taxa_comparecimento,
    receita_gerada = EXCLUDED.receita_gerada,
    updated_at = NOW();
    
END;
$$ LANGUAGE plpgsql;

-- NOTA: Se a tabela promoter_performance não tiver uma constraint UNIQUE em (promoter_id, evento_id, data_evento),
-- você precisará criar uma antes de executar este script:
-- ALTER TABLE promoter_performance ADD CONSTRAINT unique_promoter_evento_data UNIQUE (promoter_id, evento_id, data_evento);

-- ========================================
-- PARTE 4: FUNCTION CanPromoterAddGuests
-- ========================================

CREATE OR REPLACE FUNCTION CanPromoterAddGuests(
  p_promoter_id INTEGER,
  p_evento_id INTEGER,
  p_quantidade_nova INTEGER
)
RETURNS BOOLEAN AS $$
DECLARE
  v_max_convidados INTEGER := 0;
  v_convidados_atuais INTEGER := 0;
  v_pode_ultrapassar BOOLEAN := FALSE;
BEGIN
  -- Buscar limite do promoter
  SELECT 
    COALESCE(pec.max_convidados_para_evento, pc.max_convidados_por_evento, 0),
    COALESCE(pp.pode_ultrapassar_limites, FALSE)
  INTO v_max_convidados, v_pode_ultrapassar
  FROM promoters p
  LEFT JOIN promoter_condicoes pc ON p.promoter_id = pc.promoter_id AND pc.ativo = TRUE
  LEFT JOIN promoter_evento_condicoes pec ON p.promoter_id = pec.promoter_id AND pec.evento_id = p_evento_id
  LEFT JOIN promoter_permissoes pp ON p.promoter_id = pp.promoter_id
  WHERE p.promoter_id = p_promoter_id;
  
  -- Contar convidados atuais
  SELECT COUNT(*)
  INTO v_convidados_atuais
  FROM listas_convidados lc
  JOIN listas l ON lc.lista_id = l.lista_id
  WHERE l.promoter_responsavel_id = p_promoter_id
  AND l.evento_id = p_evento_id;
  
  -- Verificar se pode adicionar
  IF v_max_convidados = 0 OR v_pode_ultrapassar THEN
    RETURN TRUE;
  END IF;
  
  RETURN (v_convidados_atuais + p_quantidade_nova) <= v_max_convidados;
END;
$$ LANGUAGE plpgsql;

-- ========================================
-- FIM DO SCRIPT
-- ========================================

-- Para verificar se tudo foi criado corretamente:
-- SELECT routine_name, routine_type FROM information_schema.routines WHERE routine_schema = 'public' AND routine_name IN ('trigger_set_timestamp', 'CalculatePromoterPerformance', 'CanPromoterAddGuests');
-- SELECT trigger_name, event_object_table FROM information_schema.triggers WHERE trigger_schema = 'public' AND trigger_name LIKE 'set_timestamp_%';

