# Runbook — deploy SaaS (produção)

Execute **com backup** (`pg_dump`) e preferencialmente em staging antes.

## 1. Migrations pendentes

```bash
cd vamos-comemorar-api
node scripts/saas/run-saas-migrations.js   # dry-run: lista pendentes
SAAS_MIGRATE_CONFIRM=apply node scripts/saas/run-saas-migrations.js
```

Esperado se prod parou na 008: `009`–`012`.

## 2. Backfill organization_id (RLS)

```bash
node scripts/saas/backfill_organization_id_operational.js
SAAS_BACKFILL_CONFIRM=apply node scripts/saas/backfill_organization_id_operational.js
```

## 3. Backfill memberships (UEP → memberships)

```bash
node scripts/saas/backfill_memberships_from_uep.js
SAAS_BACKFILL_CONFIRM=apply node scripts/saas/backfill_memberships_from_uep.js
```

## 4. Promoters órfãos

```bash
node scripts/saas/fix_promoter_orphans.js
SAAS_FIX_CONFIRM=apply node scripts/saas/fix_promoter_orphans.js
```

Revisa o dry-run antes de aplicar — rebaixa `role=promoter` sem registro em `promoters` para `cliente`.

## 5. Front (Render)

Definir variável de ambiente:

```
NEXT_PUBLIC_SAAS_MODE=on
```

Redeploy do `vamos-comemorar-next`.

## 6. API — leitura places/bars via establishments (opcional)

```
ESTABLISHMENTS_READ_SOURCE=establishments
```

Redeploy da API. Validar paridade:

```bash
node scripts/saas/compare_establishments_read_sources.js --api
```

## 7. Smoke test

```bash
# Público + DB (sem senha)
DATABASE_URL=... SAAS_SMOKE_DB_ONLY=1 node scripts/saas/smoke_test_saas.js

# Autenticado (token do login no browser → localStorage authToken)
SAAS_SMOKE_TOKEN=<jwt> node scripts/saas/smoke_test_saas.js
```

## 8. Migration 024 (users.organization_id)

Aplicada em prod 2026-07-03. Pré-requisito: `users.organization_id` backfill (0 órfãos).

```bash
SAAS_MIGRATE_CONFIRM=apply node scripts/saas/run-saas-migrations.js
```
