# Staff Agent — Continuidade (retomar depois)

/**
 * Status em 26/08/2026:** Fase 1 **no ar**.  
 * **Bug corrigido (pausar cardápio):** o turno só rodava a 1ª tool (`listar`) e parava —
 * commit recente adiciona loop + auto-preview quando há 1 match. Redeploy da API necessário.
 *
 * **Próximo passo acordado:** Fase 2 — **bloquear / liberar dia** na agenda (preview → Confirmar).  
 * **Não misturar com:** agente WhatsApp do **cliente** (OpenAI `gpt-5.5` / `services/agent/*`).
 */

### Prompt para colar no Cursor (outro PC)

```
Retome o Staff Agent Agilizaiapp.

Contexto: vamos-comemorar-api/services/staffAgent/CONTINUIDADE.md
(+ ponte no next: app/components/admin/STAFF_AGENT_CONTINUIDADE.md).

Fase 1 em produção (Groq openai/gpt-oss-120b, flag *, float em /admin).
NÃO mexer no agente WhatsApp do cliente (services/agent, gpt-5.5).

Próxima tarefa: Fase 2 — tool bloquear/liberar dia (bloquear_agenda / reativar_bloqueio)
com preview→Confirmar, reusando restaurant_reservation_blocks, cuidado especial Highline.
```

---

## Repos

| Repo | Branch | Papel |
|------|--------|--------|
| `vamos-comemorar-api` | `master` | Groq, tools, `/api/staff-agent` |
| `vamos-comemorar-next` | `main` | Widget flutuante em `/admin` |

API produção: `https://api.agilizaiapp.com.br`

---

## Arquivos-chave (API)

Pasta: `services/staffAgent/`

| Arquivo | Função |
|---------|--------|
| `phase1ToolCatalog.js` | Catálogo das 10 tools + excluídas |
| `featureFlag.js` | Flag / piloto allow-all |
| `groqClient.js` | Cliente Groq + fallbacks |
| `toolExecutor.js` | Execução real (SQL/ações) |
| `pendingActions.js` | Preview → confirmar writes |
| `permissions.js` | Role + UEP |
| `staffAgentService.js` | Orquestra turno |
| `routes/staffAgent.js` | `GET /status`, `POST /turn`, `POST /confirm` |
| `CONTINUIDADE.md` | **Este arquivo** |

Montagem: `server.js` → `app.use('/api/staff-agent', ...)`.

## Arquivos-chave (Next)

| Arquivo | Função |
|---------|--------|
| `app/components/admin/StaffAgentFloat.tsx` | FAB + chat |
| `app/admin/layout.tsx` | Monta o float em todas as `/admin` |
| `app/components/admin/STAFF_AGENT_CONTINUIDADE.md` | Ponte para este doc |

---

## Tools Fase 1 (10)

**Leitura:** `briefing_turno`, `buscar_reservas`, `checar_capacidade`, `listar_espera`, `listar_itens_cardapio`, `resumir_conversa_whatsapp`, `sugerir_resposta_whatsapp`

**Escrita (Confirmar):** `chamar_espera`, `pausar_item_cardapio`, `reativar_item_cardapio`

(Nomes canônicos em `phase1ToolCatalog.js` — se divergir deste resumo, o catálogo vence.)

**Fora de escopo (não implementar sem novo acordo):**  
`criar_reserva`, `editar_reserva`, `cancelar_reserva`, `bloquear_agenda`, `reativar_bloqueio`, `ajustar_horarios`, usuários/cargos, enviar WA, campanhas, config IA cliente.

---

## Env no Render (serviço da API)

```text
GROQ_API_KEY=...
STAFF_AGENT_PHASE1_ESTABLISHMENT_IDS=*
```

Opcionais:

```text
STAFF_AGENT_ENABLED=true
STAFF_AGENT_GROQ_MODEL=openai/gpt-oss-120b
STAFF_AGENT_PHASE1_STRICT=true          # só se quiser whitelist de novo
STAFF_AGENT_GROQ_FALLBACK_MODELS=...
```

### Flag (piloto atual)

- Qualquer valor não-vazio (`*`, `1`, `1,7`…) → **todas as casas** liberadas.
- Whitelist real só com `STAFF_AGENT_PHASE1_STRICT=true`.
- `/api/staff-agent/status` saudável: `allow_all: true`, `code_rev: "staff-agent-allow-all-v3"`, `establishment_enabled: true`.

### Cardápio (pausar / ativar)

- Pausar: ok.
- **Ativar/reativar:** a busca precisa incluir pausados (`include_paused` / `only_paused`). Pedidos com “ativar” também contam.
- **Tempo real:** após apply, a API emite Socket.IO `menu_item_visibility` (rooms `cardapio_bar_{barId}`). O admin `/admin/cardapio` escuta e atualiza sem F5.


---

## Commits âncora

**API (`master`):**

- `917f8f4` — feat Fase 1
- `f4b0987` — fix escopo no turn
- `4c17209` — status/tools/flag
- `0b64e6a` — modelo Groq novo
- `2899e72` / `5577ff7` — piloto allow-all + `code_rev`
- `2bb4d13` — este guia de continuidade

**Next (`main`):**

- `5583914a` — float em todas as `/admin`
- `c8d4b6fc` — seletor estável
- `93a3b171` — allow_all / aviso de redeploy
- `1b3040af` — ponte `STAFF_AGENT_CONTINUIDADE.md`

---

## Teste rápido

Admin → FAB → casa (Justino ou Highline):

1. `Como está o dia de hoje?`
2. `Quem está na espera?`
3. `Pausar X` → Confirmar

Se o aviso amarelo voltar: Network → `/api/staff-agent/status` → sem `code_rev` = Render no código antigo → Manual Deploy.

---

## Próximo passo (Fase 2)

1. Tools `bloquear_agenda` + `reativar_bloqueio` (já listadas como excluídas na Fase 1).
2. Obrigatório: dry-run / preview → `pendingActions` → Confirmar.
3. Reusar lógica/tabelas de bloqueio já existentes (`restaurant_reservation_blocks` / rotas de blocks) — não inventar schema.
4. Highline: logar `establishment_id` + contexto; nada de falha silenciosa.
5. Continuar **fora**: criar reserva pelo chat, campanhas WA, RBAC.

### Backlog depois da Fase 2

1. Rascunho WA ao **assumir** conversa no inbox (tool já existe; falta UX).
2. Chip sugestão área/mesa no alocar (IA embutida na tela).

---

## Regras de ouro

1. Cliente WhatsApp ≠ Staff Agent (providers e pastas separados).
2. `establishment_id` da sessão/escopo — nunca inventado pelo LLM.
3. Writes sensíveis: preview → humano → apply.
4. Base de conhecimento da casa vence o LLM.
5. Não criar arquivos gigantes (>400 linhas); mudanças cirúrgicas.
6. Não commit/push sem pedido explícito (exceto quando o usuário pedir para versionar continuidade).

---

*Atualize a data/status no topo ao avançar de fase.*
