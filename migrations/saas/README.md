# Migrations SaaS Multi-Tenant — Fase 1

Conjunto de migrations **aditivas** que introduzem o modelo multi-tenant por baixo do
sistema atual (Strangler Fig). **Nada aqui foi executado** — são arquivos prontos para
rodar primeiro em **staging**.

> ⚠️ Sistema em produção com reservas reais. Siga o roteiro. Não rode em produção sem
> backup e sem validar em staging antes.

## Arquivos (rodam nesta ordem)

| Ordem | Arquivo | O que faz | Risco |
|------|---------|-----------|-------|
| 001 | `001_tenant_core.sql` | Cria `organizations`, `establishments`, `roles`, `permissions`, `role_permissions`, `memberships` | Baixo (só cria tabelas novas) |
| 002 | `002_modules_billing.sql` | Cria `modules`, `plans`, `plan_modules`, `subscriptions`, `organization_modules`, `invoices`, `payments`, `billing_events` | Baixo |
| 003 | `003_users_super_admin.sql` | Adiciona `users.is_super_admin` (default FALSE) + backfill da lista atual | Baixo |
| 004 | `004_add_organization_id.sql` | **EXPAND**: adiciona `organization_id` (nullable) + índice nas tabelas operacionais existentes | Baixo (nullable; guard `to_regclass`) |
| 005 | `005_backfill_pilot_org.sql` | **MIGRATE**: cria a org piloto (Grupo Ideia Um), gera `establishments` a partir de `places`/`bars`, faz backfill `organization_id` em todas as linhas | Médio (revisar antes) |

> A virada de `organization_id` para **NOT NULL** (CONTRACT) é uma migration **posterior**,
> só depois do backfill 100% validado e do código já gravando `organization_id`.

## Pré-requisitos
- `DATABASE_URL` apontando para o banco **de staging** (nunca produção neste momento).
- Tabelas no schema `meu_backup_db` (igual produção — ver `config/database.js`).

## Como rodar (em staging)

```bash
# 1) BACKUP do banco antes de tudo
pg_dump "$DATABASE_URL" > backup_pre_saas_$(date +%F).sql

# 2) Dry-run (lista o que seria aplicado, não altera nada)
node scripts/saas/run-saas-migrations.js

# 3) Aplicar de fato (só em staging!)
SAAS_MIGRATE_CONFIRM=apply node scripts/saas/run-saas-migrations.js
```

O runner cria a tabela de controle `meu_backup_db.saas_schema_migrations` e aplica cada
arquivo uma única vez, em transação. É seguro rodar de novo (idempotente).

## Validação pós-migration (staging)
```sql
SET search_path TO meu_backup_db, public;
SELECT id, slug, name, saas_enabled FROM organizations;
SELECT id, name, legacy_place_id, legacy_bar_id FROM establishments ORDER BY id;
-- Não pode haver linha operacional sem org após o backfill:
SELECT count(*) FROM restaurant_reservations WHERE organization_id IS NULL;  -- esperado 0
```

## Rollback
- Tabelas novas (001/002): `DROP TABLE IF EXISTS ...` na ordem inversa das FKs.
- Coluna `organization_id` (004): `ALTER TABLE x DROP COLUMN IF EXISTS organization_id;`
- `is_super_admin` (003): `ALTER TABLE users DROP COLUMN IF EXISTS is_super_admin;`
- Remover marca no controle: `DELETE FROM meu_backup_db.saas_schema_migrations WHERE filename = '...';`

## O que NÃO está aqui (próximas fases, exigem decisão/staging)
- `organization_id` NOT NULL (Contract).
- RLS por tabela (`ENABLE ROW LEVEL SECURITY` + policies) — **008 piloto** em `restaurant_reservations`; expandir após validação.
- `organization_id` no JWT — **implementado** (`tenancy/jwtClaims.js`); `tenantMiddleware` + RLS via `SAAS_RLS_MODE`.
- Migrar filtros por nome (`restaurant_areas` ILIKE 'Reserva Rooftop - %') para `establishment_id`.
