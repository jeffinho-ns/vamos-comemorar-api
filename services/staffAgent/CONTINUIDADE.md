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
| `phase1ToolCatalog.js` | Catálogo das tools + excluídas |
| `dateUtils.js` | `todayIsoSp` / `parseDateOrToday` (fuso SP) |
| `agendaBlocks.js` | Fase 2: tools de bloquear / liberar dia |
| `agendaBlockHelpers.js` | Datas, horários, resolução de área e conflito |
| `artistOS.js` | Fase 3: criar / listar OS de Artista/Banda/DJ |
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

## Tools (15 — Fase 1 + agenda Fase 2 + OS Fase 3)

**Leitura:** `briefing_turno`, `buscar_reservas`, `checar_capacidade`, `listar_espera`, `listar_itens_cardapio`, `listar_bloqueios_agenda`, `listar_os_artista`, `resumir_conversa_whatsapp`, `sugerir_resposta_whatsapp`

**Escrita (Confirmar):** `chamar_espera`, `pausar_item_cardapio`, `reativar_item_cardapio`, `bloquear_dia_agenda`, `liberar_dia_agenda`, `criar_os_artista`

(Nomes canônicos em `phase1ToolCatalog.js` — se divergir deste resumo, o catálogo vence.)

**Fora de escopo (não implementar sem novo acordo):**  
`criar_reserva`, `editar_reserva`, `cancelar_reserva`, `ajustar_horarios`, usuários/cargos, enviar WA, campanhas, config IA cliente.

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
4. `Quais dias estão bloqueados?`
5. `Bloqueia o dia 15/09 por evento privado` → Confirmar → conferir no painel de bloqueios
6. `Libera o dia 15/09` → Confirmar
7. `Bloqueia o Rooftop no dia 20/09 das 18h às 22h` → Confirmar
8. `Libera o Rooftop no dia 20/09` → Confirmar
9. `Cria uma OS de artista para 30/08, projeto Samba do Ivan, funcionamento das 18h às 2h, entrada 30 reais`
   → preview pergunta o que falta → Confirmar → conferir em `/admin/detalhes-operacionais`

Se o aviso amarelo voltar: Network → `/api/staff-agent/status` → sem `code_rev` = Render no código antigo → Manual Deploy.

---

## Fase 2 — agenda (implementada)

`services/staffAgent/agendaBlocks.js` grava na **mesma** tabela do painel
(`restaurant_reservation_blocks`), então o bloqueio feito pelo chat aparece no admin
e fecha a página `/reservar`.

- Um **dia** por vez, sem recorrência. Sem área = casa inteira (`area_id NULL`); sem horário = dia inteiro.
- **Área:** `area_name` é resolvido pelo escopo real da casa via `areasFilterForEstablishment`
  (extraído de `routes/restaurantAreas.js` para `services/establishmentRules.js` — não duplicar).
  Nome ambíguo devolve as opções em vez de chutar.
- **Faixa de horário:** `start_time`/`end_time` aceitam `18:00`, `18h`, `18h30`. Fim antes do início
  fecha no fim do dia (não vira madrugada).
- **Conflito:** só recusa se os horários se sobrepõem E os escopos se tocam — bloqueio da casa
  inteira conflita com qualquer área; áreas distintas convivem no mesmo horário.
- Bloquear **não cancela** reservas existentes — o preview avisa quantas existem no dia.
- Datas aceitas: `YYYY-MM-DD`, `15/09`, `hoje`, `amanhã`, dia da semana. Dia/mês sem ano que já passou → próximo ano.
- Insert/delete via `queryWithRlsContext` com `organization_id` resolvido pelo establishment.
- `created_by` = usuário que confirmou (`userId` chega ao `executeTool` pelo `confirmTurn`).
- **Tempo real:** `utils/agendaRealtime.js` emite `reservation_block_changed` na room
  `agenda_est_{establishmentId}` (join via `join_agenda`). Emitem tanto o Staff Agent quanto
  as rotas `/api/restaurant-reservation-blocks` (POST/PUT/DELETE), então bloqueio feito no
  painel também aparece no calendário de quem está com a tela aberta.
  O front (`app/admin/restaurant-reservations/page.tsx`) recarrega `loadBlocks()` ao receber.

Ainda **fora**: criar/editar/cancelar reserva pelo chat, recorrência semanal, bloquear várias datas de uma vez.

## Fase 3 — OS de Artista/Banda/DJ (implementada)

`services/staffAgent/artistOS.js` espelha o modal **"Nova OS de Artista/Banda/DJ"**
(`app/components/ArtistOSCreateModal.tsx`), gravando em `operational_details` com
`os_type='artist'`. O mapeamento é o mesmo do modal — se mudar lá, mude aqui:

| Chat | Coluna |
|------|--------|
| `project_name` | `artistic_attraction` + `event_name` |
| `working_hours` | `show_schedule` |
| `ticket_values` | `ticket_prices` (fallback `'Não informado'`) |
| `promotions` | `promotions` |
| benefits, menu, briefing, partnership, tv_games, extras | `admin_notes` → `{ dynamicFields }` |

- **Obrigatórios:** `event_date`, `project_name`, `working_hours`. Número da OS é gerado
  (`DDMMYYYY-NNN`, série por data) e a casa vem da sessão.
- O preview lista o que ficou vazio e **pergunta se falta algo antes de criar**.
- **Duas datas:** "crie a OS na data de 29/08, o evento acontece em 31/08" → `event_date` = 31/08
  (é o que vai para a tabela) e `os_date` = 29/08 (usada só para numerar: `29082026-001`).
  Uma data só = ambas iguais.
- **Negações viram vazio:** "sem briefing", "sem parceria", "não vai ter jogo" gravam campo nulo,
  não o texto da negação (`cleanOptionalText`), e o preview não volta a perguntar por eles.
- `extra_fields` aceita JSON (`{"Estacionamento":"grátis"}`) ou texto (`Estacionamento: grátis; ...`);
  as chaves viram slug legível, porque o `ArtistOSViewModal` deriva o rótulo trocando `_` por espaço.
- **Não coleta** CPF/CNPJ, endereço, dados bancários nem cachê — isso continua na tela de edição.
- **Quem pode criar:** apenas **gerente, admin e super admin** (`minRoles` sem `recepcao`) + UEP
  `can_create_os` (default FALSE). O backend da rota REST **não** checa essa flag; no Staff Agent
  ela é obrigatória. Leitura (`listar_os_artista`) continua liberada para recepção/promoter.
- **Tempo real:** `utils/osRealtime.js` emite `operational_detail_changed` na room `os_est_{id}`
  (join via `join_os`). Emitem o Staff Agent e as rotas `/api/v1/operational-details`
  (POST/PUT/DELETE); `app/admin/detalhes-operacionais/page.tsx` recarrega a lista ao receber.

### Como o pedido é reconhecido

`detectOsIntent()` (em `staffAgentService.js`) identifica o pedido e **força a tool**
(`tool_choice`) em vez de torcer para o modelo escolher — foi assim que evitamos o
"não tenho função para isso".

- Aceita: criar / abrir / montar / gerar / cadastrar / lançar / registrar / emitir /
  preencher / fazer + "OS", "O.S.", "ordem de serviço", "nova OS".
- Consulta ("quais OS", "tem OS para o dia X") cai em `listar_os_artista`.
- **Cuidado com o artigo "os"**: só conta como OS se vier em MAIÚSCULAS, com pontos,
  ou por extenso. Senão "pausa os itens" viraria Ordem de Serviço.
- Regressão coberta por `tests/unit/staffAgentOsIntent.test.js` (23 frases reais).

### Pendência conhecida: UNIQUE (event_date)

`operational_details` tem `UNIQUE (event_date)` **global**, não por estabelecimento — duas casas
não conseguem ter OS na mesma data. A tool detecta e explica, mas a correção
(`UNIQUE (event_date, establishment_id)`) ficou para uma tarefa separada.

### Rota pública fechada

`GET /api/v1/operational-details/date/:date` devolvia `od.*` sem token, expondo cachê e dados
bancários. Agora usa `optionalAuth`: anônimo recebe só `PUBLIC_DETAIL_FIELDS` (divulgação);
com token, o objeto completo. Consumidores públicos (`/reservar`, `upcoming`) usam apenas
campos dessa whitelist.

### Backlog

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
