-- =====================================================
-- Promoter Michele (michelealinep27@gmail.com) - poder adicionar mais nomes
-- Evento: Xic Hop 27/02/2026 - Highline (após meia-noite)
-- =====================================================
-- Permite que a promoter Michele ultrapasse limites de convidados por evento,
-- para que possa continuar adicionando nomes pelo link /promoter/michele
-- mesmo após a meia-noite e no dia seguinte.
--
-- Se as tabelas estiverem no schema meu_backup_db, executar antes:
--   SET search_path TO meu_backup_db, public;
-- =====================================================

-- Atualizar permissão "pode_ultrapassar_limites" para a Michele
-- (promoter com codigo_identificador = 'michele' ou email = michelealinep27@gmail.com)
UPDATE promoter_permissoes
SET pode_ultrapassar_limites = true,
    updated_at = CURRENT_TIMESTAMP
WHERE promoter_id IN (
  SELECT promoter_id FROM meu_backup_db.promoters
  WHERE codigo_identificador = 'michele'
     OR LOWER(TRIM(email)) = 'michelealinep27@gmail.com'
);

-- Se a Michele ainda não tiver linha em promoter_permissoes, inserir
INSERT INTO promoter_permissoes (
  promoter_id,
  pode_ver_lista_convidados,
  pode_adicionar_convidados,
  pode_remover_convidados,
  pode_gerar_link_convite,
  pode_gerar_qr_code,
  pode_ver_historico,
  pode_ver_relatorios,
  pode_ultrapassar_limites,
  pode_aprovar_convidados_extra
)
SELECT
  p.promoter_id,
  true, true, true, true, true, true, true, true, false
FROM meu_backup_db.promoters p
WHERE (p.codigo_identificador = 'michele' OR LOWER(TRIM(p.email)) = 'michelealinep27@gmail.com')
  AND NOT EXISTS (SELECT 1 FROM promoter_permissoes pp WHERE pp.promoter_id = p.promoter_id)
LIMIT 1;
