-- ============================================================================
-- SaaS Multi-Tenant — 011: materiais globais de onboarding
-- ============================================================================

SET search_path TO meu_backup_db, public;

INSERT INTO training_materials (title, description, content_type, url, sort_order, is_published)
SELECT v.title, v.description, v.content_type, v.url, v.sort_order, TRUE
  FROM (VALUES
    ('Bem-vindo ao Agilizai', 'Visão geral do painel e primeiros passos.', 'link', '/documentacao', 0),
    ('Configurar reservas', 'Acesse o sistema de reservas e defina horários.', 'link', '/admin/restaurant-reservations', 10),
    ('Gerenciar cardápio', 'Cadastre categorias e itens do seu estabelecimento.', 'link', '/admin/cardapio', 20)
  ) AS v(title, description, content_type, url, sort_order)
 WHERE NOT EXISTS (
   SELECT 1 FROM training_materials tm
    WHERE tm.organization_id IS NULL AND tm.title = v.title
 );
