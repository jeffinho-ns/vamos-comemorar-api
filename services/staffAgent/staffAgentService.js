'use strict';

/**
 * Orquestra um turno do Staff Agent (Groq + tools Fase 1).
 */

const groqClient = require('./groqClient');
const { isEstablishmentEnabled } = require('./featureFlag');
const { assertCanUseTool, isStaffRole } = require('./permissions');
const { executeTool } = require('./toolExecutor');
const { createPendingAction, consumePendingAction } = require('./pendingActions');
const {
  getPhase1ToolDefinitions,
  getPhase1ToolByName,
  getPhase1Meta,
} = require('./phase1ToolCatalog');

const SYSTEM_PROMPT = `Você é o assistente interno de operação do Agilizaiapp (Staff Agent Fase 1).
Responda em português do Brasil, curto e claro, sem bullets longos.
Use tools quando o pedido exigir dados ou ações. Não invente IDs.
Nunca diga que já executou uma ação de escrita — o sistema pede confirmação ao colaborador.
Se faltar dado (data, item_id, waitlist_id, wa_id), pergunte em uma frase.
Escopo: só a casa informada no contexto.`;

function parseToolArgs(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function runTurn(pool, { user, establishmentId, message }) {
  const estId = Number(establishmentId);
  if (!Number.isFinite(estId) || estId <= 0) {
    const err = new Error('establishment_id inválido');
    err.code = 'bad_establishment';
    throw err;
  }
  if (!isEstablishmentEnabled(estId)) {
    const err = new Error(
      'Staff Agent não está ligado nesta casa. Peça ao admin para incluir o ID em STAFF_AGENT_PHASE1_ESTABLISHMENT_IDS.'
    );
    err.code = 'feature_disabled';
    throw err;
  }
  if (!isStaffRole(user?.role) && !user?.is_super_admin && !user?.isSuperAdmin) {
    // hostess/recepção também estão em isStaffRole; se falhar, ainda tenta
    if (!user?.id && !user?.userId) {
      const err = new Error('Não autenticado');
      err.code = 'unauthorized';
      throw err;
    }
  }
  if (!groqClient.isEnabled()) {
    const err = new Error('GROQ_API_KEY não configurada no servidor.');
    err.code = 'groq_disabled';
    throw err;
  }

  const text = String(message || '').trim();
  if (!text || text.length > 1000) {
    const err = new Error('Mensagem vazia ou muito longa.');
    err.code = 'bad_message';
    throw err;
  }

  const completion = await groqClient.chatCompletion({
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'system',
        content: `Contexto: establishment_id=${estId}. Data de referência: use YYYY-MM-DD. Não altere establishment_id.`,
      },
      { role: 'user', content: text },
    ],
    tools: getPhase1ToolDefinitions(),
    tool_choice: 'auto',
  });

  const choice = completion.choices?.[0]?.message || {};
  const toolCalls = Array.isArray(choice.tool_calls) ? choice.tool_calls : [];

  if (toolCalls.length === 0) {
    return {
      ok: true,
      type: 'message',
      reply: String(choice.content || 'Não entendi o pedido. Tente: “como está o dia de hoje?”').trim(),
      meta: getPhase1Meta(),
    };
  }

  // Fase 1: executa a primeira tool call (evita efeitos colaterais em paralelo)
  const call = toolCalls[0];
  const toolName = call.function?.name;
  const args = parseToolArgs(call.function?.arguments);
  const toolDef = getPhase1ToolByName(toolName);
  if (!toolDef) {
    return {
      ok: false,
      type: 'message',
      reply: 'Ação não disponível nesta fase.',
    };
  }

  await assertCanUseTool(pool, { user, establishmentId: estId, toolName });

  if (toolDef.isWrite || toolDef.requiresConfirmation) {
    const preview = await executeTool(pool, {
      toolName,
      args,
      establishmentId: estId,
      mode: 'preview',
    });
    if (!preview.ok) {
      return { ok: false, type: 'message', reply: preview.message || 'Não foi possível preparar a ação.' };
    }
    const confirmId = createPendingAction({
      userId: user.id || user.userId,
      establishmentId: estId,
      toolName,
      args,
    });
    return {
      ok: true,
      type: 'confirm',
      reply: preview.message,
      confirm_id: confirmId,
      tool: toolName,
      preview: preview.preview || preview,
      meta: getPhase1Meta(),
    };
  }

  const result = await executeTool(pool, {
    toolName,
    args,
    establishmentId: estId,
    mode: 'read',
  });

  return {
    ok: Boolean(result.ok),
    type: 'result',
    reply: result.message || (result.ok ? 'Pronto.' : 'Não encontrei dados.'),
    tool: toolName,
    data: result,
    meta: getPhase1Meta(),
  };
}

async function confirmTurn(pool, { user, confirmId }) {
  const userId = user.id || user.userId;
  const pending = consumePendingAction(confirmId, userId);
  if (!pending) {
    const err = new Error('Confirmação expirada ou inválida. Peça de novo.');
    err.code = 'confirm_expired';
    throw err;
  }

  await assertCanUseTool(pool, {
    user,
    establishmentId: pending.establishmentId,
    toolName: pending.toolName,
  });

  console.info('[staffAgent] apply', {
    user_id: userId,
    establishment_id: pending.establishmentId,
    tool: pending.toolName,
    args: pending.args,
  });

  const result = await executeTool(pool, {
    toolName: pending.toolName,
    args: pending.args,
    establishmentId: pending.establishmentId,
    mode: 'apply',
  });

  return {
    ok: Boolean(result.ok),
    type: 'applied',
    reply: result.message || (result.ok ? 'Feito.' : 'Não foi possível aplicar.'),
    tool: pending.toolName,
    data: result,
  };
}

module.exports = {
  runTurn,
  confirmTurn,
};
