-- Audit: user_establishment_permissions vs promoters de eventos vs analistas de bar
-- Rodar: psql $DATABASE_URL -f scripts/saas/audit_user_establishment_permissions.sql
SET search_path TO meu_backup_db, public;

\echo '=== 1) Gerente/recepção/atendente SEM UEP (RISCO com SAAS_MODE=on) ==='
SELECT u.id, u.email, u.name, u.role::text
FROM users u
WHERE u.role::text IN ('gerente', 'recepção', 'recepcao', 'atendente')
  AND NOT EXISTS (
    SELECT 1 FROM user_establishment_permissions uep
    WHERE uep.user_id = u.id AND uep.is_active = TRUE
  )
ORDER BY u.email;

\echo '=== 2) Analistas de bar (analista@*) — devem ter UEP ==='
SELECT u.id, u.email, u.role::text,
       COUNT(uep.id) FILTER (WHERE uep.is_active) AS perms,
       string_agg(p.name, ', ' ORDER BY p.id) FILTER (WHERE uep.is_active) AS places
FROM users u
LEFT JOIN user_establishment_permissions uep ON uep.user_id = u.id AND uep.is_active
LEFT JOIN places p ON p.id = uep.establishment_id
WHERE u.email LIKE 'analista@%'
GROUP BY u.id, u.email, u.role
ORDER BY u.email;

\echo '=== 3) Promoters de EVENTOS (tabela promoters) — NÃO precisam UEP; usam /promoter/{codigo} ==='
SELECT COUNT(*) AS promoters_ativos
FROM promoters p WHERE p.ativo = TRUE;

SELECT p.promoter_id, p.nome, p.email, p.codigo_identificador, p.establishment_id, p.user_id,
       COUNT(uep.id) FILTER (WHERE uep.is_active) AS uep_ativas
FROM promoters p
LEFT JOIN users u ON u.id = p.user_id
LEFT JOIN user_establishment_permissions uep ON uep.user_id = u.id
WHERE p.ativo = TRUE
GROUP BY p.promoter_id, p.nome, p.email, p.codigo_identificador, p.establishment_id, p.user_id
HAVING COUNT(uep.id) FILTER (WHERE uep.is_active) > 0
ORDER BY p.nome;

\echo '=== 4) role=promoter SEM promoters table E sem UEP (órfãos — revisar) ==='
SELECT u.id, u.email, u.name
FROM users u
WHERE u.role::text = 'promoter'
  AND NOT EXISTS (SELECT 1 FROM promoters p WHERE p.user_id = u.id)
  AND NOT EXISTS (SELECT 1 FROM user_establishment_permissions uep WHERE uep.user_id = u.id AND uep.is_active)
  AND u.email NOT LIKE 'analista@%'
ORDER BY u.email;

\echo '=== 5) Resumo ==='
SELECT
  (SELECT COUNT(*) FROM users u WHERE u.role::text NOT IN ('cliente','client')) AS total_staff,
  (SELECT COUNT(DISTINCT uep.user_id) FROM user_establishment_permissions uep WHERE uep.is_active) AS users_com_uep_ativa,
  (SELECT COUNT(*) FROM promoters p WHERE p.ativo = TRUE) AS promoters_evento_ativos,
  (SELECT COUNT(*) FROM users u WHERE u.email LIKE 'analista@%') AS analistas_bar;
