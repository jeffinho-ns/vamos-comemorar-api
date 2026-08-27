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
const {
  createPendingAction,
  consumePendingAction,
  peekPendingAction,
  dropPendingAction,
} = require('./pendingActions');
const { parseOsFromText, parseOsAmendment } = require('./artistOSTextParser');
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

Agenda (bloquear/liberar dia):
- "bloqueia/fecha o dia X" → bloquear_dia_agenda com date=X (repasse a data como o usuário falou: 15/09, amanhã etc.).
- "libera/desbloqueia o dia X" → liberar_dia_agenda.
- "quais dias estão bloqueados" → listar_bloqueios_agenda.
- Um dia por vez. Bloquear não cancela reservas já existentes.
- Se citarem uma área ("o Rooftop", "os camarotes"), passe area_name; senão, deixe vazio = casa inteira.
- Se citarem horário ("das 18h às 22h"), passe start_time/end_time em HH:MM; senão, dia inteiro.

OS de Artista/Banda/DJ (criar_os_artista):
- Gatilhos (todos significam criar_os_artista): "criar/abrir/montar/gerar/cadastrar/lançar/registrar/emitir/preencher/fazer uma OS", "nova OS", "OS nova", "O.S.", "ordem de serviço", "OS do DJ/da banda/do show/da atração/do evento/de sexta".
- "Quais OS temos", "tem OS para o dia X", "me mostra as OS" → listar_os_artista.
- Obrigatórios: event_date, project_name, working_hours. O número da OS é automático e a casa vem do contexto — não pergunte por eles.
- Faltando um obrigatório, pergunte só o que falta, uma pergunta por vez.
- Aproveite tudo que o colaborador já disse na mensagem (entrada, promoções, benefícios, briefing, parceria, jogos na TV).
- DUAS DATAS: "crie a OS na data X, o evento acontece em Y" → event_date=Y (quando o evento ocorre) e os_date=X. Uma data só = event_date.
- Horário: "começa 17:00 e termina 05:00" → working_hours="17:00 às 05:00". Não invente outro formato.
- Negou um campo ("sem briefing", "sem parceria", "não vai ter jogo")? Deixe o campo VAZIO. Nunca escreva "sem briefing" como se fosse o conteúdo, e não volte a perguntar por ele.
- Informação solta que não tem campo próprio vai em extra_fields como "Rótulo: valor".
- Nunca peça CPF/CNPJ, dados bancários, cachê ou contrato: isso é preenchido na tela.

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

/**
 * O colaborador escreve de muitas formas ("abre uma OS", "monta a ordem de serviço
 * do DJ", "lança a O.S. de sábado"). Quando o pedido é claramente de OS, forçamos a
 * tool certa em vez de torcer para o modelo escolher.
 *
 * Cuidado com o artigo "os" (os itens, os pratos): só contamos como OS quando vier
 * em maiúsculas, com pontos, ou escrito por extenso.
 */
function mentionsOs(text) {
  const raw = String(text || '');
  if (/\bOS\b/.test(raw)) return true;
  if (/\bO\.\s?S\.?/i.test(raw)) return true;
  const t = raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return /\bord(em|ens) de servico\b/.test(t);
}

function detectOsIntent(text) {
  if (!mentionsOs(text)) return null;

  const t = String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  const criar =
    /\b(cria|criar|crie|criando|nova|novo|abre|abrir|abra|monta|montar|monte|gera|gerar|gere|cadastra|cadastrar|cadastre|lanca|lancar|lance|registra|registrar|registre|faz|fazer|faca|preenche|preencher|preencha|adiciona|adicionar|adicione|emite|emitir|emita|subir|subo)\b/.test(
      t
    );
  const listar =
    /\b(quais|qual|lista|listar|liste|listagem|ver|vejo|mostra|mostrar|mostre|confere|conferir|confira|existe|existem|tem|temos|cadastradas?|criadas?)\b/.test(
      t
    );

  if (criar) return 'criar_os_artista';
  if (listar) return 'listar_os_artista';
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

/** "sim", "pode criar", "confirma" — segue direto para o apply. */
function isConfirmationText(text) {
  const t = String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .trim();
  if (!t || t.length > 40) return false;
  return /^(sim|isso|ok|okay|beleza|blz|confirma\w*|pode\s+(criar|confirmar|salvar|mandar|ir)|manda|cria\w*|salva\w*|so\s+isso|nada\s+mais|mais\s+nada|e\s+isso|ta\s+bom)$/.test(t);
}

/**
 * Complemento de uma OS em preview: mescla os campos novos e reabre a confirmação.
 * Retorna null quando não há OS pendente ou a mensagem não acrescenta nada.
 */
async function tryAmendPendingOs(pool, { user, estId, text, pendingConfirmId }) {
  const userId = user.id || user.userId;
  const pending = peekPendingAction(pendingConfirmId, userId);
  if (!pending || pending.toolName !== 'criar_os_artista') return null;

  if (isConfirmationText(text)) {
    return confirmTurn(pool, { user, confirmId: pendingConfirmId });
  }

  const amendment = parseOsAmendment(text);
  if (!amendment) return null;

  const args = { ...pending.args, ...amendment.fields };
  if (amendment.extra_fields) {
    args.extra_fields = [pending.args.extra_fields, amendment.extra_fields]
      .filter(Boolean)
      .join('; ');
  }

  dropPendingAction(pendingConfirmId);
  return buildWriteConfirm(pool, {
    user,
    estId: pending.establishmentId || estId,
    toolName: 'criar_os_artista',
    args,
  });
}

async function runTurn(pool, { user, establishmentId, message, pendingConfirmId = null }) {
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

  // Ação em preview e o colaborador respondeu com mais dados em vez de confirmar:
  // complementa a OS e devolve um preview novo.
  if (pendingConfirmId) {
    const amended = await tryAmendPendingOs(pool, {
      user,
      estId,
      text,
      pendingConfirmId,
    });
    if (amended) return amended;
  }

  const menuWriteIntent = detectMenuWriteIntent(text);

  if (menuWriteIntent) {
    const fast = await tryMenuWriteTurn(pool, { user, estId, text, menuWriteIntent });
    if (fast) return fast;
  }

  const osIntent = detectOsIntent(text);

  // Pedido de OS costuma vir completo numa frase só: monta direto, sem depender da Groq.
  if (osIntent === 'criar_os_artista') {
    const parsed = parseOsFromText(text);
    if (parsed) {
      await assertCanUseTool(pool, {
        user,
        establishmentId: estId,
        toolName: 'criar_os_artista',
      });
      return buildWriteConfirm(pool, {
        user,
        estId,
        toolName: 'criar_os_artista',
        args: parsed,
      });
    }
  }

  let lastReadReply = null;
  let lastToolName = null;
  let lastData = null;

  for (let step = 0; step < MAX_TOOL_STEPS; step += 1) {
    // Pedido de OS reconhecido: empurra o modelo para a tool, mas sem depender disso —
    // alguns modelos da Groq devolvem 400 quando a função é forçada pelo nome.
    const forceOsTool = step === 0 && osIntent;
    let completion;
    try {
      completion = await groqClient.chatCompletion({
        messages,
        tools: getPhase1ToolDefinitions(),
        tool_choice: forceOsTool
          ? { type: 'function', function: { name: osIntent } }
          : 'auto',
      });
    } catch (e) {
      if (!forceOsTool || e.code === 'groq_rate_limit') throw e;
      console.warn('[staffAgent] tool_choice forçado falhou, refazendo em auto', {
        tool: osIntent,
        message: e.message,
      });
      completion = await groqClient.chatCompletion({
        messages,
        tools: getPhase1ToolDefinitions(),
        tool_choice: 'auto',
      });
    }

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
    userId,
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
  detectOsIntent,
};
