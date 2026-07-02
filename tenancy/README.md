# Tenancy / Entitlements (camada SaaS multi-tenant)

Módulos de isolamento por tenant, RBAC e entitlements. Plugados **gradualmente**
nas rotas de reserva; comportamento controlado por `SAAS_MODE`.

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
| `tenantScope.js` | `loadUserScope` (memberships → ids **operacionais** place/bar) / `canAccessEstablishment`. |
| `queryScope.js` | `establishmentScopeClause` (leitura em listagens) + `canReadEstablishment` / `denyIfCannotReadEstablishment` (GET/PUT/DELETE por id). |
| `tenantMiddleware.js` | Injeta `req.tenant`; valida establishment do request contra o escopo. |
| `requireModule.js` | Gate de módulo contratado (receita). |
| `requirePermission.js` | Gate de permissão `modulo:acao` (RBAC). |
| `meEntitlementsRouter.js` | `GET /api/me/entitlements` (read-only). |

## Runbook: virar `SAAS_MODE=on` (enforce gradual)

**Pré-requisitos:** migrations 001–007 aplicadas; `observe` rodando há dias; front envia `Authorization` nas proxies de reserva.

1. **Usuário de teste restrito** (sem criar membership ainda — usar legado):
   - Escolher um usuário não-admin com **1** `user_establishment_permissions.establishment_id` (ex.: só HighLine = 7).
2. **Janela de teste (baixo tráfego):** Render → `SAAS_MODE=on` (rollback = voltar `observe`).
3. **Validar:**
   - Admin: vê todas as reservas.
   - Usuário restrito: listagem só da sua casa; `GET /:id` de outra casa → 404.
   - Formulário **público** `POST /` sem token → continua criando reserva.
4. **Se OK:** manter `on` só em `/api/restaurant-reservations`; expandir depois.

**IDs:** `loadUserScope` traduz `memberships.establishment_id` (canônico) para `legacy_place_id` / `legacy_bar_id` antes do enforce.

## Por que produção permanece segura em `observe`
- `observe` **nunca bloqueia** — só loga `[tenant:observe] BLOQUEARIA...`.
- Código de enforce (`queryScope`, `denyIfCannotReadEstablishment`) só age com `SAAS_MODE=on`.
- Anônimos (reserva pública) **nunca** são bloqueados pelo tenancy.
