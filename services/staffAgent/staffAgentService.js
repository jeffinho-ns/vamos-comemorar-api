'use strict';

/**
 * Orquestra um turno do Staff Agent (Groq + tools Fase 1).
 *
 * Problema corrigido: antes só rodava a 1ª tool (ex.: listar) e parava,
 * então "Pausar Japão" nunca chegava em pausar_item_cardapio.
 *
 * Agora: loop de tools (até MAX_TOOL_STEPS). Se o pedido for pausar/reativar
 * e a busca achar exatamente 1 item, já abre o preview de confirmação.
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

const MAX_TOOL_STEPS = 3;

const SYSTEM_PROMPT = `Você é o assistente interno de operação do Agilizaiapp (Staff Agent Fase 1).
Responda em português do Brasil, curto e claro, sem bullets longos.
Use tools quando o pedido exigir dados ou ações. Não invente IDs.

Cardápio (pausar/reativar):
1) Chame listar_itens_cardapio com o nome pedido.
   - Se o usuário pediu ATIVAR/REATIVAR, use include_paused=true (itens pausados não aparecem sem isso).
2) Se vier exatamente 1 item, chame em seguida pausar_item_cardapio ou reativar_item_cardapio com esse item_id.
3) Se vierem vários, cite os #id e nomes e peça qual; nunca pause/ative mais de um por vez.
4) Não responda só "encontrei N itens" quando o usuário pediu pausar/ativar e há 1 match — chame a tool de escrita.

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

function detectMenuWriteIntent(text) {
  const t = String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  // "ativar" / "ativa" / "reativar" / "voltar no cardapio"
  if (
    /\b(reativ\w*|ativ\w*)\b/.test(t) ||
    (/\b(voltar|liberar)\b/.test(t) && /\b(cardapio|item|prato|drink)\b/.test(t))
  ) {
    return 'reativar_item_cardapio';
  }
  if (/\b(paus\w*|pause|tirar|esconder|ocultar)\b/.test(t)) {
    return 'pausar_item_cardapio';
  }
  return null;
}

function extractMenuItemQuery(text) {
  let q = String(text || '').trim();
  q = q.replace(
    /^(paus\w*|pause|ativ\w*|reativ\w*|tirar|esconder|ocultar|voltar|liberar)\s+(o\s+|a\s+|os\s+|as\s+)?(item(s)?\s+)?(do\s+card[aá]pio\s+)?/i,
    ''
  );
  return q.trim();
}

async function finishMenuWriteAfterList(pool, { user, estId, menuWriteIntent, result }) {
  if (!menuWriteIntent || !result?.ok || !Array.isArray(result.items)) {
    return null;
  }
  if (result.items.length === 1) {
    await assertCanUseTool(pool, {
      user,
      establishmentId: estId,
      toolName: menuWriteIntent,
    });
    return buildWriteConfirm(pool, {
      user,
      estId,
      toolName: menuWriteIntent,
      args: { item_id: result.items[0].id },
    });
  }
  return {
    ok: true,
    type: 'result',
    reply: result.message || (result.items.length ? 'Pronto.' : 'Nenhum item encontrado.'),
    tool: 'listar_itens_cardapio',
    data: result,
    meta: getPhase1Meta(),
  };
}

/** Pausar/ativar sem passar pela Groq na busca — evita schema boolean e acelera. */
async function tryMenuWriteTurn(pool, { user, estId, text, menuWriteIntent }) {
  const idMatch = String(text).match(/#(\d+)/);
  if (idMatch) {
    const itemId = Number(idMatch[1]);
    if (Number.isFinite(itemId) && itemId > 0) {
      await assertCanUseTool(pool, {
        user,
        establishmentId: estId,
        toolName: menuWriteIntent,
      });
      return buildWriteConfirm(pool, {
        user,
        estId,
        toolName: menuWriteIntent,
        args: { item_id: itemId },
      });
    }
  }

  const query = extractMenuItemQuery(text);
  if (!query || query.length < 2) return null;

  await assertCanUseTool(pool, {
    user,
    establishmentId: estId,
    toolName: 'listar_itens_cardapio',
  });

  const isReativar = menuWriteIntent === 'reativar_item_cardapio';
  const result = await executeTool(pool, {
    toolName: 'listar_itens_cardapio',
    args: {
      query,
      include_paused: isReativar,
      only_paused: isReativar,
    },
    establishmentId: estId,
    mode: 'read',
  });

  return finishMenuWriteAfterList(pool, { user, estId, menuWriteIntent, result });
}

function toolResultPayload(result) {
  const items = Array.isArray(result.items)
    ? result.items.map((i) => ({ id: i.id, name: i.name, visible: i.visible }))
    : undefined;
  return JSON.stringify({
    ok: result.ok,
    message: result.message,
    count: result.count,
    items,
  });
}

async function buildWriteConfirm(pool, { user, estId, toolName, args }) {
  const preview = await executeTool(pool, {
    toolName,
    args,
    establishmentId: estId,
    mode: 'preview',
  });
  if (!preview.ok) {
    return {
      ok: false,
      type: 'message',
      reply: preview.message || 'Não foi possível preparar a ação.',
    };
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

async function runTurn(pool, { user, establishmentId, message }) {
  const estId = Number(establishmentId);
  if (!Number.isFinite(estId) || estId <= 0) {
    const err = new Error('establishment_id inválido');
    err.code = 'bad_establishment';
    throw err;
  }
  if (!isEstablishmentEnabled(estId)) {
    const err = new Error(
      `Staff Agent não está ligado nesta casa (ID ${estId}). No Render, use STAFF_AGENT_PHASE1_ESTABLISHMENT_IDS=* ou inclua este ID na lista.`
    );
    err.code = 'feature_disabled';
    throw err;
  }
  if (!isStaffRole(user?.role) && !user?.is_super_admin && !user?.isSuperAdmin) {
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

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'system',
      content: `Contexto: establishment_id=${estId}. Data de referência: use YYYY-MM-DD. Não altere establishment_id.`,
    },
    { role: 'user', content: text },
  ];

  const menuWriteIntent = detectMenuWriteIntent(text);

  if (menuWriteIntent) {
    const fast = await tryMenuWriteTurn(pool, { user, estId, text, menuWriteIntent });
    if (fast) return fast;
  }

  let lastReadReply = null;
  let lastToolName = null;
  let lastData = null;

  for (let step = 0; step < MAX_TOOL_STEPS; step += 1) {
    const completion = await groqClient.chatCompletion({
      messages,
      tools: getPhase1ToolDefinitions(),
      tool_choice: 'auto',
    });

    const choice = completion.choices?.[0]?.message || {};
    const toolCalls = Array.isArray(choice.tool_calls) ? choice.tool_calls : [];

    if (toolCalls.length === 0) {
      return {
        ok: true,
        type: lastReadReply ? 'result' : 'message',
        reply: String(
          choice.content ||
            lastReadReply ||
            'Não entendi o pedido. Tente: “como está o dia de hoje?”'
        ).trim(),
        tool: lastToolName || undefined,
        data: lastData || undefined,
        meta: getPhase1Meta(),
      };
    }

    const call = toolCalls[0];
    const toolName = call.function?.name;
    let args = parseToolArgs(call.function?.arguments);
    // Reativar: a busca padrão esconde pausados — força include_paused.
    if (
      toolName === 'listar_itens_cardapio' &&
      menuWriteIntent === 'reativar_item_cardapio'
    ) {
      args = { ...args, include_paused: true, only_paused: true };
    }
    const toolDef = getPhase1ToolByName(toolName);
    if (!toolDef) {
      return { ok: false, type: 'message', reply: 'Ação não disponível nesta fase.' };
    }

    await assertCanUseTool(pool, { user, establishmentId: estId, toolName });

    if (toolDef.isWrite || toolDef.requiresConfirmation) {
      return buildWriteConfirm(pool, { user, estId, toolName, args });
    }

    const result = await executeTool(pool, {
      toolName,
      args,
      establishmentId: estId,
      mode: 'read',
    });

    lastReadReply = result.message || (result.ok ? 'Pronto.' : 'Não encontrei dados.');
    lastToolName = toolName;
    lastData = result;

    // Pediu pausar/reativar e a busca achou exatamente 1 item → abre o Confirmar.
    if (toolName === 'listar_itens_cardapio' && menuWriteIntent) {
      const finished = await finishMenuWriteAfterList(pool, {
        user,
        estId,
        menuWriteIntent,
        result,
      });
      if (finished) return finished;
    }

    messages.push({
      role: 'assistant',
      content: choice.content || null,
      tool_calls: toolCalls,
    });
    messages.push({
      role: 'tool',
      tool_call_id: call.id,
      content: toolResultPayload(result),
    });
  }

  return {
    ok: Boolean(lastData?.ok !== false),
    type: 'result',
    reply: lastReadReply || 'Pronto.',
    tool: lastToolName || undefined,
    data: lastData || undefined,
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
