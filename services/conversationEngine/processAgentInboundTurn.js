const outboundGateway = require('../messaging/outboundGateway');
const inbox = require('../whatsappInboxRepository');
const { runAgentTurn, getReferenceDateIso } = require('../agent/agentService');
const { buildReservationDateHint } = require('../agent/reservationDateHint');
const {
  parseReservationFieldsFromUserText,
  mergeContactHintsIntoWorkingState,
} = require('../agent/reservationFunnel');
const { buildAgentReservationOperatingBlock } = require('../agent/reservationOperatingContext');
const { mergeWorkingState } = require('../agent/agentMemoryService');
const {
  getMemory,
  persistMemory,
  buildSummaryFromWorkingState,
} = require('../agent/agentMemoryService');
const { loadAiCatalogLight } = require('../whatsappReservationService');
const { buildGuestListSecondMessage } = require('../whatsappReservationService');
const {
  getProfileForPrompt,
  refreshProfileFromSources,
} = require('../operationalMemory/customerOperationalProfileService');
const {
  analyzeSentimentLead,
  buildPromptToneInstructions,
} = require('../sentimentEngine/sentimentLeadEngine');
const {
  mapRowsToOpenAIHistory,
  resolveEstablishmentForTurn,
  detectEstablishmentFromText,
} = require('../conversationEngine/helpers');
const { getWhatsappDefaultEstablishmentId } = require('./whatsappEstablishmentContext');
const { isExplicitHumanRequest, shouldForceHumanIntent } = require('../aiService');

const HIGHLINE_ID = 7;
const B2B_THRESHOLD_PEOPLE = 60;
const B2B_KEYWORDS = /\b(locac[aã]o|loca[cç][aã]o|exclusiv[ao]|privativ[ao]|formatura|formaturas|evento\s+corporativo|corporativ[ao]|empresa|empresarial|confraterniza[cç][aã]o|workshop|congresso|festa\s+de\s+formatura)\b/i;

function detectB2BIntent(text) {
  if (!text) return null;
  const normalized = String(text).toLowerCase();
  if (B2B_KEYWORDS.test(normalized)) return 'keyword';
  const partyMatch =
    normalized.match(/(\d{2,3})\s*(?:pessoas|convidados|gente|pax|hospedes|h[oó]spedes)/) ||
    normalized.match(/(?:para|pra|com)\s*~?\s*(\d{2,3})\s*pessoas/);
  if (partyMatch) {
    const n = Number(partyMatch[1]);
    if (Number.isFinite(n) && n > B2B_THRESHOLD_PEOPLE) return 'group_size';
  }
  return null;
}

function extractContactName(payload) {
  const entry = payload?.entry?.[0];
  const change = entry?.changes?.[0];
  const value = change?.value;
  return value?.contacts?.[0]?.profile?.name || null;
}

function emitInbox(app, payload) {
  const io = app?.get?.('socketio');
  if (io) {
    io.to('whatsapp_inbox').emit('whatsapp_inbox_update', {
      type: payload?.type || 'refresh',
      wa_id: payload?.wa_id || null,
    });
  }
}

async function activateHumanTakeover(pool, waId, hours = 48) {
  const safeHours = Number.isFinite(Number(hours)) && Number(hours) > 0 ? Number(hours) : 48;
  await pool.query(
    `UPDATE whatsapp_conversations
        SET human_takeover_until = NOW() + (($2::text || ' hours')::interval),
            updated_at = NOW()
      WHERE wa_id = $1`,
    [waId, String(safeHours)]
  );
}

function classifyAgentRuntimeError(error) {
  const status = Number(error?.status || error?.statusCode || error?.response?.status || 0);
  const code = String(error?.code || '').toUpperCase();
  const detail = String(error?.message || error?.error?.message || 'erro_desconhecido');
  if (status === 429 || /rate limit|too many/i.test(detail)) return 'OPENAI_429';
  if (status >= 500) return `OPENAI_${status}`;
  if (code === 'OPENAI_TIMEOUT' || /timeout|timed out/i.test(detail)) return 'OPENAI_TIMEOUT';
  if (code === 'ECONNRESET' || code === 'ECONNABORTED') return code;
  return 'AGENT_RUNTIME_ERROR';
}

async function processAgentInboundTurn({ pool, app, payload, incomingMessageText, waId }) {
  const incomingText = String(incomingMessageText || '').trim();
  if (!incomingText) {
    return;
  }

  let conversation = null;
  let inboundRow = null;

  try {
    const contactName = extractContactName(payload);
    conversation = await inbox.upsertConversation(pool, {
      waId,
      contactName,
      establishmentId: null,
    });
    inboundRow = await inbox.insertMessage(pool, {
      conversationId: conversation.id,
      direction: 'inbound',
      body: incomingText,
      rawPayload: payload,
    });
    await inbox.upsertContact(pool, { waId, contactName });
  } catch (persistError) {
    console.error('[agentEngine] persistência indisponível:', persistError.message);
    return;
  }

  emitInbox(app, {
    type: 'inbound',
    wa_id: waId,
    conversation,
    message: inboundRow,
    body: incomingText,
  });

  if (await inbox.isHumanTakeoverActive(pool, waId)) {
    console.log('[agentEngine] Atendimento humano ativo — IA não responde até "Retornar para IA".');
    return;
  }

  // P1-D: cliente pediu humano explicitamente → ativa takeover ANTES de chamar
  // o LLM. Sem isso, a IA promete "vou te passar pro atendimento" e continua
  // respondendo no próximo turno (bug do Luccas, conv=716).
  if (isExplicitHumanRequest(incomingText) || shouldForceHumanIntent(incomingText)) {
    try {
      const result = await pool.query(
        `UPDATE whatsapp_conversations
            SET human_takeover_until = NOW() + interval '48 hours',
                updated_at = NOW()
          WHERE wa_id = $1
          RETURNING id`,
        [waId]
      );
      console.log(
        `[agentEngine] takeover humano ativado por pedido explícito waId=${waId} conv=${result.rows[0]?.id || '?'}`
      );
      const handoffReply =
        'Claro! Já chamei alguém da equipe pra continuar com você por aqui. Em instantes você vai ser atendido por uma pessoa, beleza?';
      await outboundGateway.sendText(waId, handoffReply);
      await persistOutbound(handoffReply, 'HUMAN_REQUESTED');
    } catch (handoffError) {
      console.error('[agentEngine] falha ao ativar takeover humano:', handoffError.message);
    }
    return;
  }

  // P1-E: detecta intenção B2B (evento privativo, grupo >60, formatura,
  // corporativo). Esses leads precisam de humano — a IA pediria e-mail e
  // data de nascimento como se fosse reserva normal (bug da Amalia, conv=698).
  const b2bReason = detectB2BIntent(incomingText);
  if (b2bReason) {
    try {
      await pool.query(
        `UPDATE whatsapp_conversations
            SET human_takeover_until = NOW() + interval '48 hours',
                updated_at = NOW()
          WHERE wa_id = $1`,
        [waId]
      );
      console.log(`[agentEngine] takeover B2B (${b2bReason}) waId=${waId}`);
      const b2bReply =
        b2bReason === 'group_size'
          ? 'Pra um grupo desse tamanho a gente trata como evento especial e quem cuida é uma pessoa do time, não a IA. Já encaminhei pra equipe — em instantes alguém vai te chamar por aqui, combinado?'
          : 'Pra evento privativo/locação a gente faz o atendimento direto com a equipe. Já encaminhei pro time — em instantes alguém vai te chamar por aqui, combinado?';
      await outboundGateway.sendText(waId, b2bReply);
      await persistOutbound(b2bReply, 'B2B_HANDOFF');
    } catch (b2bError) {
      console.error('[agentEngine] falha no handoff B2B:', b2bError.message);
    }
    return;
  }

  const memory = await getMemory(pool, conversation.id);
  let messageHistory = [{ role: 'user', content: incomingText }];
  try {
    const recent = await inbox.getRecentMessagesForContext(pool, conversation.id, 24);
    messageHistory = mapRowsToOpenAIHistory(recent);
    const lastMessage = messageHistory[messageHistory.length - 1];
    if (!lastMessage || lastMessage.role !== 'user' || lastMessage.content !== incomingText) {
      messageHistory.push({ role: 'user', content: incomingText });
    }
  } catch (_error) {
    messageHistory = [{ role: 'user', content: incomingText }];
  }

  let catalog = { establishmentsBlock: '', areasBlock: '', establishments: [] };
  try {
    catalog = await loadAiCatalogLight(pool);
  } catch (_error) {
    // ignore
  }

  const operationalProfile = await getProfileForPrompt(pool, waId);
  const sentiment = analyzeSentimentLead(incomingText, { collectedFields: memory.workingState });

  const persistOutbound = async (bodyText, intentLabel, rawPayload = null) => {
    const saved = await inbox.insertMessage(pool, {
      conversationId: conversation.id,
      direction: 'outbound',
      body: bodyText,
      intent: intentLabel || 'AGENT_REPLY',
      suggestedReply: null,
      rawPayload,
    });
    emitInbox(app, {
      type: 'outbound',
      wa_id: waId,
      conversation: await inbox.getConversationByWaId(pool, waId),
      message: saved,
    });
  };

  let contactLastEstablishmentId = null;
  let whatsappContact = null;
  try {
    whatsappContact = await inbox.getContactByWaId(pool, waId);
    const raw = Number(whatsappContact?.last_establishment_id);
    if (Number.isFinite(raw) && raw > 0) contactLastEstablishmentId = raw;
  } catch (_error) {
    // ignore
  }

  const conversationEstablishmentId = Number.isFinite(Number(conversation?.establishment_id))
    ? Number(conversation.establishment_id)
    : contactLastEstablishmentId;
  const historyPlainText = messageHistory.map((m) => m?.content || '').join(' ');
  const defaultWhatsappEstablishmentId = getWhatsappDefaultEstablishmentId();

  const resolvedEstablishmentId = resolveEstablishmentForTurn({
    messageText: incomingText,
    messageHistory,
    establishments: catalog.establishments || [],
    lockedEstablishmentId: memory.workingState?.establishment_id || null,
    conversationEstablishmentId,
    collectedFields: memory.workingState || {},
  });
  const lockedEstablishmentId =
    resolvedEstablishmentId ||
    detectEstablishmentFromText(incomingText, catalog.establishments || []) ||
    detectEstablishmentFromText(historyPlainText, catalog.establishments || []) ||
    Number(memory.workingState?.establishment_id) ||
    conversationEstablishmentId ||
    defaultWhatsappEstablishmentId ||
    null;

  const resolvedEstablishment = (catalog.establishments || []).find(
    (item) => Number(item.id) === Number(lockedEstablishmentId)
  );
  const lockedEstablishmentName = resolvedEstablishment?.name || 'HighLine';

  if (lockedEstablishmentId && waId) {
    try {
      await inbox.setConversationEstablishment(pool, waId, lockedEstablishmentId);
      await inbox.upsertContact(pool, { waId, lastEstablishmentId: lockedEstablishmentId });
    } catch (_error) {
      // ignore
    }
  }

  const dateHint = buildReservationDateHint({
    userText: incomingText,
    referenceDateIso: getReferenceDateIso(),
    workingState: memory.workingState || {},
    messageHistory,
  });
  const textFieldPatch = parseReservationFieldsFromUserText(
    incomingText,
    memory.workingState || {},
    messageHistory
  );
  let workingStateForTurn = mergeContactHintsIntoWorkingState(
    mergeWorkingState(memory.workingState || {}, dateHint.patch || {}, textFieldPatch),
    whatsappContact || {}
  );
  if (lockedEstablishmentId) {
    workingStateForTurn = mergeWorkingState(workingStateForTurn, {
      establishment_id: lockedEstablishmentId,
    });
  }
  const memoryForTurn = {
    ...memory,
    workingState: workingStateForTurn,
  };

  const focusDateIso =
    memoryForTurn.workingState?.reservation_date ||
    memoryForTurn.workingState?.pending_reservation_date_iso ||
    null;

  let reservationOperatingBlock = '';
  if (lockedEstablishmentId && pool) {
    try {
      reservationOperatingBlock = await buildAgentReservationOperatingBlock(
        pool,
        lockedEstablishmentId,
        lockedEstablishmentName,
        focusDateIso
      );
    } catch (error) {
      console.warn('[agentEngine] regras operacionais indisponíveis:', error.message);
    }
  }

  try {
    const agentResult = await runAgentTurn({
      pool,
      messageHistory,
      memory: memoryForTurn,
      context: {
        establishmentsBlock: catalog.establishmentsBlock,
        establishmentRulesBlock: catalog.establishmentRulesBlock,
        dateOverridesBlock: catalog.dateOverridesBlock,
        reservationOperatingBlock,
        lockedEstablishmentId,
        lockedEstablishmentName,
        contextSummary: memory.contextSummary,
        workingStateSummary: buildSummaryFromWorkingState(memoryForTurn.workingState),
        reservationDateBlock: dateHint.promptBlock,
        emotionalState: sentiment.emotionalState,
        leadTemperature: sentiment.leadTemperature,
        toneInstructions: buildPromptToneInstructions(sentiment),
        operationalProfileSummary: operationalProfile.summary,
      },
      runtimeContext: {
        waId,
        conversationId: conversation.id,
        contactName:
          whatsappContact?.contact_name ||
          conversation?.contact_name ||
          extractContactName(payload) ||
          null,
      },
    });

    await persistMemory(pool, conversation.id, {
      workingState: agentResult.workingState,
    }).catch((memoryError) => {
      console.error('[agentEngine] falha ao persistir memória:', memoryError.message);
    });

    if (inboundRow?.id) {
      await inbox.updateInboundAiFields(pool, inboundRow.id, {
        intent: agentResult.preReservationResult ? 'PROCESS_RESERVATION' : 'AGENT_REPLY',
        suggestedReply: agentResult.replyText,
      });
    }

    await outboundGateway.sendText(waId, agentResult.replyText);
    await persistOutbound(
      agentResult.replyText,
      agentResult.preReservationResult ? 'PROCESS_RESERVATION' : 'AGENT_REPLY'
    );
    console.log(
      `[agentEngine] resposta enviada waId=${waId} establishment_id=${lockedEstablishmentId || 'n/a'} faqFirst=${Boolean(agentResult.faqFirst)} intent=${agentResult.preReservationResult ? 'PROCESS_RESERVATION' : 'AGENT_REPLY'} chars=${agentResult.replyText.length} tools=${agentResult.toolTrace?.length || 0}`
    );

    if (agentResult.guestListLink) {
      const linkMsg = buildGuestListSecondMessage(agentResult.guestListLink);
      await outboundGateway.sendText(waId, linkMsg);
      await persistOutbound(linkMsg, 'GUEST_LIST_LINK');
    } else if (agentResult.preReservationResult?.reservation) {
      console.warn(`[agentEngine] pré-reserva sem guest_list_link waId=${waId}`);
    }

    if (agentResult.preReservationResult?.reservation) {
      try {
        await refreshProfileFromSources(pool, waId);
      } catch (_error) {
        // ignore
      }
    }
  } catch (error) {
    console.error('[agentEngine] erro no turno do agente:', error.message, error.stack);

    const errorCode = classifyAgentRuntimeError(error);
    let recentAgentErrors = 0;
    let lastOutboundIntent = null;

    try {
      const errCount = await pool.query(
        `SELECT COUNT(*)::int AS qtd
           FROM whatsapp_messages
          WHERE conversation_id = $1
            AND direction = 'outbound'
            AND intent = 'AGENT_ERROR'
            AND created_at > NOW() - interval '10 minutes'`,
        [conversation.id]
      );
      recentAgentErrors = Number(errCount.rows[0]?.qtd || 0);

      const lastOut = await pool.query(
        `SELECT intent
           FROM whatsapp_messages
          WHERE conversation_id = $1
            AND direction = 'outbound'
          ORDER BY created_at DESC
          LIMIT 1`,
        [conversation.id]
      );
      lastOutboundIntent = String(lastOut.rows[0]?.intent || '');
    } catch (obsError) {
      console.warn('[agentEngine] falha ao medir AGENT_ERROR recente:', obsError.message);
    }

    const shouldEscalateToHuman =
      recentAgentErrors >= 1 || lastOutboundIntent === 'AGENT_ERROR';

    const fallback =
      'Opa, deu uma instabilidade aqui do meu lado. Tenta me mandar de novo em uma mensagem que eu sigo com você agora.';
    const handoffReply =
      'Tive uma instabilidade aqui e pra você não perder tempo já chamei alguém da equipe pra continuar seu atendimento por aqui, beleza?';

    try {
      if (shouldEscalateToHuman) {
        await activateHumanTakeover(pool, waId, 48);
        await outboundGateway.sendText(waId, handoffReply);
        await persistOutbound(handoffReply, 'HUMAN_REQUESTED', {
          source: 'agent_error_guard',
          errorCode,
          recentAgentErrors,
        });
        console.warn(
          `[agentEngine] takeover por AGENT_ERROR em sequência waId=${waId} errCode=${errorCode} recent=${recentAgentErrors}`
        );
      } else {
        await outboundGateway.sendText(waId, fallback);
        await persistOutbound(fallback, 'AGENT_ERROR', {
          errorCode,
          source: 'agent_turn_catch',
        });
        console.warn(`[agentEngine] fallback enviado waId=${waId} errCode=${errorCode}`);
      }
    } catch (_sendError) {
      console.error('[agentEngine] falha ao enviar fallback:', _sendError.message);
    }
  }
}

module.exports = {
  processAgentInboundTurn,
};
