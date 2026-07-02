# Runbook — deploy SaaS (produção)

Execute **com backup** (`pg_dump`) e preferencialmente em staging antes.

## 1. Migrations pendentes

```bash
cd vamos-comemorar-api
node scripts/saas/run-saas-migrations.js   # dry-run: lista pendentes
SAAS_MIGRATE_CONFIRM=apply node scripts/saas/run-saas-migrations.js
```

Esperado se prod parou na 008: `009`–`012`.

## 2. Backfill memberships (UEP → memberships)

```bash
node scripts/saas/backfill_memberships_from_uep.js
SAAS_BACKFILL_CONFIRM=apply node scripts/saas/backfill_memberships_from_uep.js
```

## 3. Promoters órfãos

```bash
node scripts/saas/fix_promoter_orphans.js
SAAS_FIX_CONFIRM=apply node scripts/saas/fix_promoter_orphans.js
```

Revisa o dry-run antes de aplicar — rebaixa `role=promoter` sem registro em `promoters` para `cliente`.

## 4. Front (Render)

Definir variável de ambiente:

```
NEXT_PUBLIC_SAAS_MODE=on
```

Redeploy do `vamos-comemorar-next`.

## 5. Smoke test

- Login analista restrito → sidebar sem módulos bloqueados
- `/documentacao` → seção **Materiais SaaS**
- `/superadmin/billing` → resumo do mês
- Impersonate + auditoria
