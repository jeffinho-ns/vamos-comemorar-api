# Tenancy / Entitlements (camada SaaS multi-tenant)

Módulos **aditivos e inertes** que preparam o isolamento por tenant, RBAC e
entitlements. **Nada aqui está plugado no `server.js`** — ligar é decisão
consciente, fase a fase, conforme `docs/PLANO-SAAS-MULTI-TENANT.md`.

## Princípio: FAIL-OPEN controlado por `SAAS_MODE`
| `SAAS_MODE` | Comportamento |
|-------------|---------------|
| `off` (padrão) | Tudo liberado. Middlewares viram no-op. Produção intacta. |
| `observe` | Resolve tenant/permissões e **loga o que SERIA bloqueado**, sem bloquear. |
| `on` | Enforcement real (bloqueia acesso cruzado / módulo não contratado / sem permissão). |

> Só ligar `on` **depois** de rodar as migrations da Fase 1 em staging, validar o
> backfill e passar dias em `observe` ajustando a matriz de papéis.

## Arquivos
| Arquivo | Papel |
|---------|-------|
| `featureFlags.js` | Lê `SAAS_MODE` (off/observe/on). |
| `tenantScope.js` | `loadUserScope` / `canAccessEstablishment` (generaliza o padrão de `routes/whatsappAdmin.js`). |
| `tenantMiddleware.js` | Injeta `req.tenant`; valida establishment do request contra o escopo. |
| `entitlements.js` | `resolveEntitlements` (módulos + permissões). Fail-open. |
| `requireModule.js` | Gate de módulo contratado (receita). |
| `requirePermission.js` | Gate de permissão `modulo:acao` (RBAC). |
| `meEntitlementsRouter.js` | `GET /api/me/entitlements` (read-only). |

## Como ligar com segurança (futuro, NÃO fazer agora)

1. Rodar migrations da Fase 1 em **staging** (`migrations/saas/README.md`).
2. Montar o endpoint read-only (baixo risco):
   ```js
   app.use('/api/me', require('./tenancy/meEntitlementsRouter')(pool));
   ```
3. `SAAS_MODE=observe` em staging/produção; aplicar `tenantMiddleware()` nas rotas
   de reserva (hoje sem auth) **depois** de garantir `authenticateToken` nelas.
4. Ler os logs `[tenant:observe]` / `[module:observe]` por dias, ajustar papéis.
5. Só então `SAAS_MODE=on`, 1 grupo de rotas por vez. Rollback = voltar para `observe`/`off`.

## Por que isto não quebra produção hoje
- Nenhum `require()` destes arquivos foi adicionado ao `server.js` nem aos routers.
- Mesmo se forem montados, com `SAAS_MODE` ausente o comportamento é no-op.
- O endpoint de entitlements é fail-open (retorna `allowAll` em erro).
