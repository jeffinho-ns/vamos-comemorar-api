# AI Legacy Removal - Safe List

Objetivo: remover legado sem quebrar producao.

## Pre-condicoes obrigatorias

1. Janela de 24h com `AGENT_ERROR` em queda e sem regressao de reservas.
2. Janela de 24h sem intents legadas (`COLLECT_DATA`, `STATE_VALIDATION_ERROR`, `PROCESS_RESERVATION_ERROR`).
3. `WHATSAPP_AGENT_MODE=true`.
4. `WHATSAPP_STUCK_RESOLVER_ENABLED=false` (ou stuck-resolver migrado para caminho novo).

## Ordem segura de remocao

### Etapa A - Desacoplar dependencias do legado

- Em `services/conversationEngine/processAgentInboundTurn.js`
  - Remover dependencia de `../aiService` so para `isExplicitHumanRequest` e `shouldForceHumanIntent`.
  - Criar helper local (ou novo modulo pequeno) para esses dois checks.

- Em `workers/queueWorkers.js`
  - Remover worker `OPENAI_INTERPRET` que chama `interpretMessage`.

### Etapa B - Remover roteamento legado

- Em `services/conversationEngine/processInboundTurn.js`
  - Eliminar `processLegacyInboundTurn`.
  - Eliminar caminho `proactiveResume => legado`.
  - Manter apenas fluxo `processAgentInboundTurn`.

- Remover `services/conversationEngine/reservationRouting.js`.

### Etapa C - Remover prompt/engine legado

- Remover `services/aiService.js` (apos Etapa A/B).
- Remover `services/promptBuilder/PromptBuilder.js`.

### Etapa D - Limpeza de recovery legado

- Em `services/recoveryEngine/stuckConversationResolver.js`
  - Remover `hydrateLegacyStateFromAgent`.
  - Nao chamar mais `processInboundTurn(... proactiveResume: true)` para cair no legado.
  - Se manter resume, chamar caminho do agente novo.

## Arquivos de teste para atualizar/remover

- `tests/unit/reservationRouting.test.js` (remover).
- `tests/integration/reservationFunnel.contract.test.js` (revisar mocks de `aiService.interpretMessage`).

## Criterio de aceite final

1. Nenhum import de `services/aiService.js` para fluxo de conversa.
2. Nenhum import de `services/promptBuilder/PromptBuilder.js`.
3. Nenhum arquivo referenciando `processLegacyInboundTurn`.
4. Health-check em 24h:
   - `AGENT_ERROR` sob controle operacional.
   - Reserva criada por IA voltando ao patamar esperado.

