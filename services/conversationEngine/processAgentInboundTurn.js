const outboundGateway = require('../messaging/outboundGateway');
const inbox = require('../whatsappInboxRepository');
const { runAgentTurn } = require('../agent/agentService');
const {
  getMemory,
  persistMemory,
  buildSummaryFromWorkingState,
} = require('../agent/agentMemoryService');
const { loadAiCatalog } = require('../whatsappReservationService');
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
const { isConversationSafetyBlockEnabled} = require('../conversationTestingMode');
const { getWhatsappDefaultEstablishmentId } = require('./whatsappEstablishmentContext');

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
    });
  }
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

  if (await inbox.isHumanTakeoverActive(pool, waId) && isConversationSafetyBlockEnabled()) {
    return;
  }

  if (!isConversationSafetyBlockEnabled()) {
    try {
      await inbox.clearHumanTakeover(pool, waId);
    } catch (_error) {
      // ignore
    }
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
    catalog = await loadAiCatalog(pool);
  } catch (_error) {
    // ignore
  }

  const operationalProfile = await getProfileForPrompt(pool, waId);
  const sentiment = analyzeSentimentLead(incomingText, { collectedFields: memory.workingState });

  const persistOutbound = async (bodyText, intentLabel) => {
    const saved = await inbox.insertMessage(pool, {
      conversationId: conversation.id,
      direction: 'outbound',
      body: bodyText,
      intent: intentLabel || 'AGENT_REPLY',
      suggestedReply: null,
      rawPayload: null,
    });
    emitInbox(app, {
      type: 'outbound',
      wa_id: waId,
      conversation: await inbox.getConversationByWaId(pool, waId),
      message: saved,
    });
  };

  let contactLastEstablishmentId = null;
  try {
    const contact = await inbox.getContactByWaId(pool, waId);
    const raw = Number(contact?.last_establishment_id);
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

  try {
    const agentResult = await runAgentTurn({
      pool,
      messageHistory,
      memory,
      context: {
        establishmentsBlock: catalog.establishmentsBlock,
        lockedEstablishmentId,
        lockedEstablishmentName,
        contextSummary: memory.contextSummary,
        workingStateSummary: buildSummaryFromWorkingState(memory.workingState),
        emotionalState: sentiment.emotionalState,
        leadTemperature: sentiment.leadTemperature,
        toneInstructions: buildPromptToneInstructions(sentiment),
        operationalProfileSummary: operationalProfile.summary,
      },
      runtimeContext: {
        waId,
        conversationId: conversation.id,
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
    const fallback =
      'Tive um instante por aqui. Pode repetir sua mensagem que eu continuo com você?';
    try {
      await outboundGateway.sendText(waId, fallback);
      await persistOutbound(fallback, 'AGENT_ERROR');
      console.warn(`[agentEngine] fallback enviado waId=${waId}`);
    } catch (_sendError) {
      console.error('[agentEngine] falha ao enviar fallback:', _sendError.message);
    }
  }
}

module.exports = {
  processAgentInboundTurn,
};
