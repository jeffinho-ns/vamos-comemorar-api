# Go-live: `SAAS_RLS_MODE=on` em produção

Pré-requisitos já confirmados (2026-07-02):

- Migrations `001`–`008` aplicadas em produção
- `SAAS_MODE=on` na API Render
- Login Rooftop (`analista.mkt02`) validado

## Passos no Render (API)

1. **Backup** do Postgres (`pg_dump`) — se ainda não tiver backup recente.
2. Adicionar variável de ambiente:
   ```
   SAAS_RLS_MODE=on
   ```
3. Aguardar redeploy automático.
4. Conferir health:
   ```bash
   curl -s https://api.agilizaiapp.com.br/health | jq '.saas'
   ```
   Esperado: `{ "mode": "on", "rlsMode": "on" }`

## Validação pós-deploy

| Teste | Como | Esperado |
|-------|------|----------|
| Público | `POST /api/restaurant-reservations` sem token | Continua criando reserva |
| Admin | Listar reservas com token admin | Todas as casas |
| Restrito | `analista.mkt03` (só Pracinha 8) | Só establishment 8 |
| Rooftop | `analista.mkt02` | Só establishment 9 |
| JWT | Decodificar token após re-login | `organization_id` presente |

## Rollback

Render → `SAAS_RLS_MODE=off` (ou remover a variável) → redeploy.

RLS no banco permanece ativo, mas sem `set_config` por request a API volta ao comportamento só app-layer.

## Opcional (front)

Sidebar modular real:

```
NEXT_PUBLIC_SAAS_MODE=on
```

No Vercel do front. Usuários legados (UEP sem memberships) e Rooftop têm bypass na sidebar.
