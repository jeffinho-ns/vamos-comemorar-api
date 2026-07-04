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
| `jwtClaims.js` | `buildTokenPayload` — JWT com `organization_id`, `organization_ids`, `is_super_admin`. |
| `requestContext.js` | AsyncLocalStorage — contexto de org por request (RLS). |
| `scopedQuery.js` / `poolRlsWrap.js` | `SET LOCAL app.current_org` / `app.bypass_rls` em queries às tabelas RLS (`tenancy/rlsTables.js`). |
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

**IDs:** `loadUserScope` traduz `memberships.establishment_id` (canônico) para `legacy_place_id` / `legacy_bar_id` antes do enforce. Fallback UEP também resolve `organizationIds` via tabela `establishments`.

## JWT com tenant

No login (`routes/users.js`, `routes/auth.js`), o token passa a incluir:

- `organization_id` — org primária (primeira do escopo)
- `organization_ids` — array completo
- `is_super_admin` — flag do banco

Tokens antigos (7d) continuam válidos; `tenantMiddleware` revalida escopo via DB e loga divergência JWT vs DB em `observe`.

## RLS (`restaurant_reservations` + lote operacional)

| `SAAS_RLS_MODE` | Comportamento |
|-----------------|---------------|
| `off` (padrão) | Sem policies ativas na prática (pool não seta session vars). |
| `on` | `pool.query` em SQL que toca tabelas RLS usa `SET LOCAL app.current_org` ou `app.bypass_rls` (admin). |

Migrations:
- `008_rls_restaurant_reservations.sql`
- `014_rls_operational_tables.sql` — `guest_lists`, `waitlist`, `walk_ins`, `large_reservations`, `birthday_reservations`, `restaurant_reservation_blocks`
- `016_rls_guests.sql` — RLS em `guests`
- `017_rls_lote4_reservas_promoters.sql` — `reservas`, `promoters`, `promoter_eventos`, `promoter_convidados`
- `018_rls_tighten_strict_tenant.sql` — remove cláusula `organization_id IS NULL` das policies
- `019_contract_organization_id_not_null.sql` — NOT NULL em tabelas RLS
- `020_role_permissions_seed.sql` — matriz de fábrica role → permissions por org
- `021_rls_cardapio_whatsapp.sql` — RLS `menu_items`, whatsapp_*, `establishment_faq`

- `022_add_organization_id_eventos.sql` — `organization_id` em `eventos`
- `023_rls_eventos_listas_users.sql` — RLS eventos, listas, users

**Provisionamento (Bloco A):** `billing/provisioningOperational.js` — nova org cria place+bar+legacy IDs+área+mesas+FAQ.

**Backfill:** `backfill_organization_id_whatsapp.js`, `backfill_organization_id_events_users.js`

**Check-ins:** sem tabela `checkins`; enforce via rotas + RLS em `guests`/`guest_lists`.

Tabelas monitoradas: `tenancy/rlsTables.js` (**25 tabelas**). Validação: `scripts/saas/validate_rls_operational.sql`.

**Ordem recomendada:** staging → aplicar 008/014 → `SAAS_RLS_MODE=on` no Render → validar `/health` (`saas.rlsMode`) → analista restrito → produção.

Runbook detalhado: `scripts/saas/go_live_rls_production.md`.

**Anônimo / sem org na sessão:** policies são fail-open (mesmo comportamento legado).

**Linhas com `organization_id` NULL:** ainda visíveis a todos os tenants (fail-open até backfill 100%). Rodar contagem pós-014 antes de remover essa cláusula.

## Leitura places/bars via establishments

| `ESTABLISHMENTS_READ_SOURCE` | GET `/api/places` e `/api/bars` |
|------------------------------|-----------------------------------|
| `legacy` (padrão) | Tabelas `places` / `bars` |
| `establishments` | `services/establishmentLegacyAdapter.js` (IDs operacionais preservados) |

Paridade: `node scripts/saas/compare_establishments_read_sources.js`. Views: migration 013/015 (`places_compat`, `bars_compat`).

## Por que produção permanece segura em `observe`
- `observe` **nunca bloqueia** — só loga `[tenant:observe] BLOQUEARIA...`.
- Código de enforce (`queryScope`, `denyIfCannotReadEstablishment`) só age com `SAAS_MODE=on`.
- Anônimos (reserva pública) **nunca** são bloqueados pelo tenancy.
