const { interpretMessage, generateReservationConfirmationMessage, isLikelyReservationIntent } = require('../aiService');
const outboundGateway = require('../messaging/outboundGateway');
const inbox = require('../whatsappInboxRepository');
const businessRulesEngine = require('../businessRulesEngine');
const stateManager = require('../stateManager/stateManager');
const {
  formatMissingFieldsForUser,
  getStepPrompt,
  isTerminalStep,
  FIELD_LABELS_PT,
  OBSERVATIONS_STEP,
  OBSERVATIONS_FIELD,
} = require('../stateManager/conversationSteps');
const { validateFieldsForStep, validateField } = require('../../validators/stepFieldValidator');
const { extractLocalFields, extractReservationSlotsFromMessage } = require('../../nlp/localMessageExtractor');
const { getProfileForPrompt, refreshProfileFromSources } = require('../operationalMemory/customerOperationalProfileService');
const {
  analyzeSentimentLead,
  buildPromptToneInstructions,
} = require('../sentimentEngine/sentimentLeadEngine');
const {
  findEstablishmentCandidates,
  findAreaCandidates,
  buildDisambiguationReply,
  resolvePendingDisambiguation,
} = require('../disambiguation/disambiguationEngine');
const {
  extractEstablishmentToken,
  resolveEstablishmentByToken,
  mapRowsToOpenAIHistory,
  looksLikePrematureBookingPromise,
  validateProcessReservationParams,
  extractInterpretedEstablishmentId,
  parsePtBrDateFromText,
  mergeReplyWithOverrideNotice,
  looksLikeAvailabilityQuestion,
  looksLikeMusicQuestion,
  looksLikeMenuQuestion,
  looksLikeParkingQuestion,
  looksLikeAreaQuestion,
  looksLikePetQuestion,
  looksLikeRepeatedDataComplaint,
  detectEstablishmentFromText,
  looksLikeFreshReservationStart,
  resolveEstablishmentForTurn,
  buildAvailabilityReplyText,
  buildAreaListingReplyText,
  buildPetPolicyReplyText,
  normalizeCanonicalEstablishmentId,
  parseDateFromHistory,
  getCardapioUrlByEstablishmentId,
  applyBusinessRulesToReservationParams,
  loadActiveRestaurantAreas,
  buildAreasBlockForEstablishment,
} = require('./helpers');
const {
  EVENT_TYPES,
  recordEvent,
} = require('../metrics/conversationMetricsService');
const {
  ageFromIsoDate,
  loadAiCatalog,
  createReservationInternal,
  buildReservationBodyFromParams,
  buildGuestListSecondMessage,
} = require('../whatsappReservationService');
const { isConversationSafetyBlockEnabled } = require('../conversationTestingMode');
const { isAgentModeEnabled } = require('../agent/agentMode');
const { processAgentInboundTurn } = require('./processAgentInboundTurn');
const { sanitizeAssistantReply } = require('../agent/agentService');
const { getMemory } = require('../agent/agentMemoryService');
const {
  shouldUseLegacyReservationFunnel,
  hydrateLegacyStateFromAgent,
} = require('./reservationRouting');

function resolveAutoTakeoverHours() {
  const configured = Number(process.env.WHATSAPP_AI_AUTO_TAKEOVER_HOURS);
  if (Number.isFinite(configured) && configured > 0) {
    return configured;
  }
  return 168;
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

async function activateHumanTakeover(pool, waId) {
  await inbox.setHumanTakeoverHours(pool, waId, resolveAutoTakeoverHours());
  await inbox.updateConversationStatus(pool, waId, 'in_progress');
}

function buildCollectedFieldsSummary(collectedFields = {}) {
  return Object.entries(collectedFields || {})
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${FIELD_LABELS_PT[key] || key}: ${value}`)
    .join('; ');
}

function buildNextFieldLabel(missingFields = []) {
  if (!Array.isArray(missingFields) || missingFields.length === 0) return null;
  return FIELD_LABELS_PT[missingFields[0]] || missingFields[0];
}

function formatIsoDateForUser(isoDate) {
  const raw = String(isoDate || '').slice(0, 10);
  const [year, month, day] = raw.split('-');
  if (!year || !month || !day) return raw;
  return `${day}/${month}/${year}`;
}

async function trackFunnelEvent(pool, event) {
  try {
    await recordEvent(pool, event);
  } catch (metricError) {
    console.warn('[conversationEngine] métricas indisponíveis:', metricError.message);
  }
}

async function loadActiveAreas(pool, establishmentId = null) {
  try {
    return await loadActiveRestaurantAreas(pool, establishmentId);
  } catch (error) {
    console.warn('[conversationEngine] falha ao carregar áreas:', error.message);
    return [];
  }
}

function getEstablishmentNameFromCatalog(catalog, establishmentId) {
  return (
    (catalog.establishments || []).find((item) => Number(item.id) === Number(establishmentId))?.name ||
    'a casa'
  );
}

async function buildOperationalInfoReply(pool, { messageText, establishmentId, reservationDate, catalog }) {
  if (!establishmentId) return null;

  const establishmentName = getEstablishmentNameFromCatalog(catalog, establishmentId);
  const blocks = [];

  if (looksLikeAvailabilityQuestion(messageText) && reservationDate?.iso) {
    const windows = await businessRulesEngine.getOperatingWindowsForDate(
      pool,
      establishmentId,
      reservationDate.iso
    );
    const [year, month, day] = reservationDate.iso.split('-');
    blocks.push(
      buildAvailabilityReplyText({
        establishmentName,
        displayDate: `${day}-${month}-${year}`,
        windows,
      })
    );
  }

  if (looksLikeAreaQuestion(messageText)) {
    const activeAreas = await loadActiveAreas(pool, establishmentId);
    blocks.push(
      buildAreaListingReplyText({
        establishmentName,
        areaNames: activeAreas.map((area) => area.name),
      })
    );
  }

  if (looksLikePetQuestion(messageText)) {
    blocks.push(buildPetPolicyReplyText({ establishmentName }));
  }

  if (blocks.length === 0) return null;
  return blocks.join('\n\n');
}

async function applyValidatedParamsToState(pool, conversationId, interpretedParams, options) {
  const accepted = {};
  const failures = [];

  for (const [fieldName, rawValue] of Object.entries(interpretedParams || {})) {
    if (rawValue === undefined || rawValue === null || rawValue === '') continue;
    const validation = await validateField(fieldName, rawValue, {
      pool: options.pool,
      establishmentId:
        options.lockedEstablishmentId ||
        interpretedParams.establishment_id ||
        options.collectedFields?.establishment_id,
      reservationDate:
        interpretedParams.reservation_date || options.collectedFields?.reservation_date,
      collectedFields: options.collectedFields,
    });
    if (!validation.ok) {
      failures.push({ fieldName, ...validation });
      continue;
    }
    accepted[fieldName] = validation.normalized;
  }

  if (Object.keys(accepted).length > 0) {
    await stateManager.mergeCollectedFields(pool, conversationId, accepted, options);
  }

  return { accepted, failures };
}

async function processInboundTurn(args) {
  const { pool, waId, incomingMessageText } = args;

  if (isAgentModeEnabled() && process.env.OPENAI_API_KEY) {
    let conversation = null;
    let messageHistory = [];

    try {
      conversation = await inbox.getConversationByWaId(pool, waId);
      if (conversation?.id) {
        const recent = await inbox.getRecentMessagesForContext(pool, conversation.id, 24);
        messageHistory = mapRowsToOpenAIHistory(recent);
        const lastMessage = messageHistory[messageHistory.length - 1];
        const incomingText = String(incomingMessageText || '').trim();
        if (!lastMessage || lastMessage.role !== 'user' || lastMessage.content !== incomingText) {
          messageHistory.push({ role: 'user', content: incomingText });
        }
      }
    } catch (_error) {
      // segue com roteamento conservador (legado se parecer reserva)
    }

    const useLegacyFunnel = await shouldUseLegacyReservationFunnel(pool, {
      conversationId: conversation?.id,
      messageText: incomingMessageText,
      messageHistory,
    });

    if (useLegacyFunnel || args.proactiveResume) {
      if (conversation?.id) {
        try {
          const memory = await getMemory(pool, conversation.id);
          await hydrateLegacyStateFromAgent(
            pool,
            conversation.id,
            waId,
            memory?.workingState || {}
          );
        } catch (hydrateError) {
          console.warn(
            '[conversationEngine] falha ao sincronizar memória do agente para legado:',
            hydrateError.message
          );
        }
      }
      if (args.proactiveResume) {
        console.log(`[conversationEngine] retomada proativa waId=${waId}`);
      } else {
        console.log(`[conversationEngine] funil legado de reserva waId=${waId}`);
      }
      return processLegacyInboundTurn(args);
    }

    return processAgentInboundTurn(args);
  }

  if (isAgentModeEnabled()) {
    console.warn(
      '[conversationEngine] WHATSAPP_AGENT_MODE ativo sem OPENAI_API_KEY; usando fluxo legado.'
    );
  }
  return processLegacyInboundTurn(args);
}

async function processLegacyInboundTurn({
  pool,
  app,
  payload,
  incomingMessageText,
  waId,
  proactiveResume = false,
}) {
  const establishmentToken = extractEstablishmentToken(incomingMessageText);
  const messageText =
    establishmentToken?.cleanedText || String(incomingMessageText || '').trim();

  let linkedEstablishment = null;
  if (establishmentToken?.rawToken) {
    try {
      linkedEstablishment = await resolveEstablishmentByToken(pool, establishmentToken.rawToken);
    } catch (tokenError) {
      console.warn('[conversationEngine] falha ao resolver token de estabelecimento:', tokenError.message);
    }
  }

  let conversation = null;
  let inboundRow = null;
  let usedPersistence = false;

  try {
    const contactName = extractContactName(payload);
    conversation = await inbox.upsertConversation(pool, {
      waId,
      contactName,
      establishmentId: linkedEstablishment?.id || null,
    });
    if (!proactiveResume) {
      inboundRow = await inbox.insertMessage(pool, {
        conversationId: conversation.id,
        direction: 'inbound',
        body: messageText,
        rawPayload: payload,
      });
    }
    await inbox.upsertContact(pool, {
      waId,
      contactName,
      lastEstablishmentId: linkedEstablishment?.id || null,
    });
    usedPersistence = true;
  } catch (persistError) {
    console.error('[conversationEngine] persistência indisponível:', persistError.message);
  }

  if (!proactiveResume) {
    emitInbox(app, {
      type: 'inbound',
      wa_id: waId,
      conversation,
      message: inboundRow,
      body: messageText,
    });
  }

  let conversationState = null;
  let lockedEstablishmentId =
    linkedEstablishment?.id ||
    (Number.isFinite(Number(conversation?.establishment_id)) ? Number(conversation.establishment_id) : null);

  if (usedPersistence && conversation?.id) {
    try {
      conversationState = await stateManager.ensureSession(pool, {
        conversationId: conversation.id,
        waId,
        reservationContext: {
          locked_establishment_id: lockedEstablishmentId || null,
        },
      });
      conversationState = stateManager.buildStateSnapshot(conversationState, {
        lockedEstablishmentId,
      });
      await stateManager.persistState(pool, conversation.id, {
        currentStep: conversationState.currentStep,
        missingFields: conversationState.missingFields,
        collectedFields: conversationState.collectedFields,
        reservationContext: conversationState.reservationContext,
      });
      await trackFunnelEvent(pool, {
        eventType: EVENT_TYPES.STEP_ENTERED,
        conversationId: conversation.id,
        sessionId: conversationState.sessionId,
        waId,
        establishmentId: lockedEstablishmentId,
        step: conversationState.currentStep,
      });
    } catch (stateError) {
      console.warn('[conversationEngine] estado persistido indisponível:', stateError.message);
    }
  }

  if (
    usedPersistence &&
    conversation?.id &&
    conversationState?.currentStep === 'handoff' &&
    !(await inbox.isHumanTakeoverActive(pool, waId))
  ) {
    try {
      conversationState = await stateManager.reopenFromHandoff(pool, conversation.id, {
        lockedEstablishmentId,
      });
    } catch (reopenError) {
      console.warn('[conversationEngine] falha ao reabrir sessão após handoff:', reopenError.message);
    }
  }

  if (
    usedPersistence &&
    conversation?.id &&
    conversationState?.currentStep === 'completed' &&
    !isConversationSafetyBlockEnabled()
  ) {
    try {
      await inbox.clearHumanTakeover(pool, waId);
      conversationState = stateManager.buildStateSnapshot(
        await stateManager.getByConversationId(pool, conversation.id),
        { lockedEstablishmentId }
      );
      await stateManager.persistState(pool, conversation.id, {
        currentStep: conversationState.currentStep,
        missingFields: conversationState.missingFields,
        handoffRecommended: false,
        retryCount: 0,
      });
    } catch (reopenCompletedError) {
      console.warn('[conversationEngine] falha ao reabrir sessão após completed:', reopenCompletedError.message);
    }
  }

  if (usedPersistence && (await inbox.isHumanTakeoverActive(pool, waId))) {
    console.log('[conversationEngine] Atendimento humano ativo — IA não responde até "Retornar para IA".');
    return;
  }

  if (conversationState && isTerminalStep(conversationState.currentStep) && isConversationSafetyBlockEnabled()) {
    console.log('[conversationEngine] sessão em passo terminal:', conversationState.currentStep);
    return;
  }

  let messageHistory = [{ role: 'user', content: messageText }];
  if (usedPersistence && conversation) {
    try {
      const recent = await inbox.getRecentMessagesForContext(pool, conversation.id, 12);
      messageHistory = mapRowsToOpenAIHistory(recent);
    } catch (historyError) {
      console.warn('[conversationEngine] falha ao montar histórico:', historyError.message);
    }
  }

  let catalog = {
    establishmentsBlock: '',
    areasBlock: '',
    establishments: [],
  };
  try {
    catalog = await loadAiCatalog(pool);
  } catch (catalogError) {
    console.warn('[conversationEngine] catálogo IA:', catalogError.message);
  }

  const explicitEstablishmentInMessage = detectEstablishmentFromText(
    messageText,
    catalog.establishments || []
  );
  let activeEstablishmentId = lockedEstablishmentId;

  if (usedPersistence && conversation?.id && looksLikeFreshReservationStart(messageText)) {
    try {
      conversationState = await stateManager.getByConversationId(pool, conversation.id);
      conversationState = stateManager.buildStateSnapshot(
        {
          ...conversationState,
          collectedFields: {},
          completedSteps: [],
          retryCount: 0,
          handoffRecommended: false,
        },
        { lockedEstablishmentId: explicitEstablishmentInMessage ? null : lockedEstablishmentId }
      );
      await stateManager.persistState(pool, conversation.id, {
        collectedFields: conversationState.collectedFields,
        missingFields: conversationState.missingFields,
        currentStep: conversationState.currentStep,
        completedSteps: [],
        retryCount: 0,
        handoffRecommended: false,
      });
      activeEstablishmentId = explicitEstablishmentInMessage || linkedEstablishment?.id || null;
    } catch (resetError) {
      console.warn('[conversationEngine] falha ao reiniciar coleta da reserva:', resetError.message);
    }
  }

  const resolvedEstablishmentId = resolveEstablishmentForTurn({
    messageText,
    messageHistory,
    establishments: catalog.establishments || [],
    lockedEstablishmentId: activeEstablishmentId,
    conversationEstablishmentId: Number.isFinite(Number(conversation?.establishment_id))
      ? Number(conversation.establishment_id)
      : null,
    collectedFields: conversationState?.collectedFields || {},
  });

  if (resolvedEstablishmentId && usedPersistence && conversation?.id) {
    try {
      const mergeOptions = explicitEstablishmentInMessage
        ? {}
        : { lockedEstablishmentId: activeEstablishmentId };
      conversationState = await stateManager.mergeCollectedFields(
        pool,
        conversation.id,
        { establishment_id: resolvedEstablishmentId },
        mergeOptions
      );
      activeEstablishmentId = resolvedEstablishmentId;
      if (explicitEstablishmentInMessage) {
        conversation = await inbox.setConversationEstablishment(pool, waId, resolvedEstablishmentId);
        lockedEstablishmentId = resolvedEstablishmentId;
      }
      conversationState = stateManager.buildStateSnapshot(conversationState, {
        lockedEstablishmentId: explicitEstablishmentInMessage
          ? resolvedEstablishmentId
          : activeEstablishmentId,
      });
    } catch (mergeError) {
      console.warn('[conversationEngine] falha ao sincronizar estabelecimento:', mergeError.message);
    }
  } else if (resolvedEstablishmentId) {
    activeEstablishmentId = resolvedEstablishmentId;
  }

  const operationalProfile = await getProfileForPrompt(pool, waId);
  const sentiment = analyzeSentimentLead(messageText, conversationState || {});
  if (usedPersistence && conversation?.id) {
    try {
      await stateManager.recordCommercialSignals(pool, conversation.id, {
        emotionalState: sentiment.emotionalState,
        leadTemperature: sentiment.leadTemperature,
        leadType: sentiment.leadType,
        followupStatus: 'none',
        abandonedAt: null,
      });
      conversationState = await stateManager.getByConversationId(pool, conversation.id);
    } catch (signalError) {
      console.warn('[conversationEngine] falha ao registrar sinais comerciais:', signalError.message);
    }
  }

  const localExtraction = extractLocalFields({
    messageText,
    currentStep: conversationState?.currentStep || 'greeting',
    collectedFields: conversationState?.collectedFields || {},
  });

  const persistOutbound = async (bodyText, intentLabel) => {
    if (!usedPersistence || !conversation) return;
    try {
      const saved = await inbox.insertMessage(pool, {
        conversationId: conversation.id,
        direction: 'outbound',
        body: bodyText,
        intent: intentLabel || null,
        suggestedReply: null,
        rawPayload: null,
      });
      emitInbox(app, {
        type: 'outbound',
        wa_id: waId,
        conversation: await inbox.getConversationByWaId(pool, waId),
        message: saved,
      });
    } catch (outboundError) {
      console.warn('[conversationEngine] falha ao gravar outbound:', outboundError.message);
    }
  };

  try {
    const pendingDisambiguation = conversationState?.reservationContext?.pending_disambiguation;
    if (pendingDisambiguation && usedPersistence && conversation?.id) {
      const selected = resolvePendingDisambiguation(messageText, pendingDisambiguation);
      if (selected) {
        const patch =
          pendingDisambiguation.type === 'area'
            ? { area_id: selected.id }
            : { establishment_id: selected.id };
        await stateManager.mergeCollectedFields(pool, conversation.id, patch, {
          lockedEstablishmentId,
        });
        const nextContext = {
          ...(conversationState.reservationContext || {}),
          pending_disambiguation: null,
        };
        await stateManager.persistState(pool, conversation.id, {
          reservationContext: nextContext,
        });
        const confirmReply =
          pendingDisambiguation.type === 'area'
            ? `Perfeito, vamos com a área ${selected.name}.`
            : `Perfeito, vamos com ${selected.name}.`;
        await outboundGateway.sendText(waId, confirmReply);
        await persistOutbound(confirmReply, 'DISAMBIGUATION_RESOLVED');
        return;
      }
    }

    if (usedPersistence && conversation?.id && conversationState) {
      if (conversationState.currentStep === 'establishment' && !lockedEstablishmentId) {
        const establishmentCandidates = findEstablishmentCandidates(messageText, catalog.establishments || []);
        if (establishmentCandidates.length > 1) {
          const reply = buildDisambiguationReply('establishment', establishmentCandidates);
          await stateManager.persistState(pool, conversation.id, {
            reservationContext: {
              ...(conversationState.reservationContext || {}),
              pending_disambiguation: {
                type: 'establishment',
                candidates: establishmentCandidates,
              },
            },
          });
          await outboundGateway.sendText(waId, reply);
          await persistOutbound(reply, 'DISAMBIGUATION_ESTABLISHMENT');
          return;
        }
      }

      if (conversationState.currentStep === 'area') {
        const activeAreas = await loadActiveAreas(
          pool,
          lockedEstablishmentId || conversationState.collectedFields?.establishment_id
        );
        const areaCandidates = findAreaCandidates(
          messageText,
          activeAreas,
          lockedEstablishmentId || conversationState.collectedFields?.establishment_id
        );
        if (areaCandidates.length > 1) {
          const reply = buildDisambiguationReply('area', areaCandidates);
          await stateManager.persistState(pool, conversation.id, {
            reservationContext: {
              ...(conversationState.reservationContext || {}),
              pending_disambiguation: {
                type: 'area',
                candidates: areaCandidates,
              },
            },
          });
          await outboundGateway.sendText(waId, reply);
          await persistOutbound(reply, 'DISAMBIGUATION_AREA');
          return;
        }
      }
    }

    const inboundSlotFields = {
      ...extractReservationSlotsFromMessage(messageText).fields,
      ...(localExtraction.fields || {}),
    };
    if (explicitEstablishmentInMessage) {
      inboundSlotFields.establishment_id = explicitEstablishmentInMessage;
    }
    if (looksLikeAvailabilityQuestion(messageText)) {
      delete inboundSlotFields.reservation_time;
    }
    if (usedPersistence && conversation?.id && Object.keys(inboundSlotFields).length > 0) {
      await applyValidatedParamsToState(pool, conversation.id, inboundSlotFields, {
        pool,
        lockedEstablishmentId: activeEstablishmentId,
        collectedFields: conversationState?.collectedFields,
      });
      conversationState = stateManager.buildStateSnapshot(
        await stateManager.getByConversationId(pool, conversation.id),
        { lockedEstablishmentId: activeEstablishmentId }
      );
    }

    if (
      usedPersistence &&
      conversation?.id &&
      conversationState?.currentStep === OBSERVATIONS_STEP
    ) {
      const obsContext = {
        ...(conversationState.reservationContext || {}),
        observations_asked: true,
      };
      await stateManager.persistState(pool, conversation.id, {
        reservationContext: obsContext,
      });
      conversationState = stateManager.buildStateSnapshot(
        await stateManager.getByConversationId(pool, conversation.id),
        {
          lockedEstablishmentId: activeEstablishmentId,
          reservationContext: obsContext,
        }
      );
    }

    const parsedDateForAvailability =
      parsePtBrDateFromText(messageText) ||
      parseDateFromHistory(messageHistory) ||
      (conversationState?.collectedFields?.reservation_date
        ? { iso: conversationState.collectedFields.reservation_date }
        : null);
    const availabilityEstablishmentId =
      activeEstablishmentId ||
      resolvedEstablishmentId ||
      Number(conversationState?.collectedFields?.establishment_id) ||
      null;

    const operationalReplyEarly = await buildOperationalInfoReply(pool, {
      messageText,
      establishmentId: availabilityEstablishmentId,
      reservationDate: parsedDateForAvailability,
      catalog,
    });
    if (operationalReplyEarly) {
      await outboundGateway.sendText(waId, operationalReplyEarly);
      await persistOutbound(operationalReplyEarly, 'OPERATIONAL_INFO');
      return;
    }

    let interpreted;
    if (!localExtraction.needsLlm && Object.keys(localExtraction.fields).length > 0) {
      interpreted = {
        action: 'COLLECT_DATA',
        params: localExtraction.fields,
        missing_fields: conversationState?.missingFields || [],
        suggested_reply: getStepPrompt(
          conversationState?.currentStep || 'greeting',
          conversationState?.collectedFields || {},
          {
            establishmentName:
              linkedEstablishment?.name || conversation?.establishment_name || '',
            lockedEstablishmentId: activeEstablishmentId,
          }
        ),
      };
    } else {
      // Para o Highline (e outros estabelecimentos com áreas canônicas no
      // código), sobrescrevemos o areasBlock genérico do catálogo do banco —
      // que mistura áreas de TODOS os bares — pela lista correta. Sem isso, o
      // LLM legado inventa áreas alheias (ex.: "Terraço", "Área Coberta", etc.).
      const areasBlockForPrompt = buildAreasBlockForEstablishment(
        activeEstablishmentId,
        catalog.areasBlock
      );

      // Carrega knowledge base (Treinamento da IA — Regras da Casa) pro
      // caminho legado. Sem isso, o LLM responde "Para fechar sua reserva..."
      // pra QUALQUER pergunta porque não sabe nada sobre pets, dress code,
      // aniversário, mesa vs camarote, etc. — e empurra formulário robótico.
      let faqKnowledgeBlock = '';
      try {
        const {
          loadAllActiveFaqsForEstablishment,
          buildFaqKnowledgeBlock,
        } = require('../agent/faqPrefetchService');
        if (activeEstablishmentId) {
          const faqEntries = await loadAllActiveFaqsForEstablishment(
            pool,
            activeEstablishmentId,
            { maxChars: 8000 }
          );
          const establishmentNameForFaq =
            linkedEstablishment?.name ||
            (conversation?.establishment_name ? String(conversation.establishment_name) : '');
          faqKnowledgeBlock = buildFaqKnowledgeBlock(faqEntries, establishmentNameForFaq);
        }
      } catch (faqLoadError) {
        console.warn('[conversationEngine] falha ao carregar FAQ para prompt legado:', faqLoadError.message);
      }

      interpreted = await interpretMessage({
        pool,
        messageHistory,
        context: {
          establishmentsBlock: linkedEstablishment
            ? `- id ${linkedEstablishment.id}: ${linkedEstablishment.name}`
            : catalog.establishmentsBlock,
          areasBlock: areasBlockForPrompt,
          faqKnowledgeBlock,
          lockedEstablishmentId: activeEstablishmentId,
          lockedEstablishmentName:
            linkedEstablishment?.name ||
            (conversation?.establishment_name ? String(conversation.establishment_name) : null),
          conversationStep: conversationState?.currentStep || 'greeting',
          missingFields: conversationState?.missingFields || [],
          collectedFieldsParsed: conversationState?.collectedFields || {},
          collectedFieldsSummary: buildCollectedFieldsSummary(conversationState?.collectedFields),
          collectedReservationDate: conversationState?.collectedFields?.reservation_date || null,
          nextFieldLabel: buildNextFieldLabel(conversationState?.missingFields),
          operationalProfileSummary: operationalProfile.summary,
          needsAvailabilityTool: looksLikeAvailabilityQuestion(messageText),
          emotionalState: sentiment.emotionalState,
          leadTemperature: sentiment.leadTemperature,
          toneInstructions: buildPromptToneInstructions(sentiment),
        },
      });
      interpreted.params = {
        ...(localExtraction.fields || {}),
        ...(interpreted.params || {}),
      };
    }

    const shouldHonorLockedEstablishment =
      activeEstablishmentId &&
      !explicitEstablishmentInMessage &&
      !detectEstablishmentFromText(messageText, catalog.establishments || []);

    if (shouldHonorLockedEstablishment) {
      interpreted.params = {
        ...(interpreted.params || {}),
        establishment_id: activeEstablishmentId,
        establishment_name_hint:
          interpreted?.params?.establishment_name_hint ||
          linkedEstablishment?.name ||
          conversation?.establishment_name ||
          null,
      };
      if (Array.isArray(interpreted.missing_fields)) {
        interpreted.missing_fields = interpreted.missing_fields.filter(
          (field) => field !== 'establishment_id'
        );
      }
    }

    if (looksLikeAvailabilityQuestion(messageText) && interpreted?.params?.reservation_time) {
      delete interpreted.params.reservation_time;
    }

    if (usedPersistence && conversation?.id && conversationState) {
      const paramsToPersist = { ...(interpreted.params || {}) };
      if (looksLikeAvailabilityQuestion(messageText)) {
        delete paramsToPersist.reservation_time;
      }
      await applyValidatedParamsToState(pool, conversation.id, paramsToPersist, {
        pool,
        lockedEstablishmentId: activeEstablishmentId,
        collectedFields: conversationState.collectedFields,
      });
      conversationState = stateManager.buildStateSnapshot(
        await stateManager.getByConversationId(pool, conversation.id),
        { lockedEstablishmentId: activeEstablishmentId }
      );
    }

    if (usedPersistence && conversation?.id && conversationState) {
      const stepValidation = await validateFieldsForStep(
        conversationState.currentStep,
        interpreted.params || {},
        {
          pool,
          establishmentId:
            activeEstablishmentId ||
            interpreted.params?.establishment_id ||
            conversationState.collectedFields?.establishment_id,
          reservationDate:
            interpreted.params?.reservation_date ||
            conversationState.collectedFields?.reservation_date,
          collectedFields: conversationState.collectedFields,
        }
      );

      if (!stepValidation.ok && stepValidation.failures.length > 0) {
        const failure = stepValidation.failures[0];
        const failedState = await stateManager.recordValidationFailure(pool, conversation.id, {
          message: failure.message,
          intent: interpreted.action,
        });

        if (stateManager.shouldTriggerHandoff(failedState)) {
          await trackFunnelEvent(pool, {
            eventType: EVENT_TYPES.BOT_LOOP,
            conversationId: conversation.id,
            sessionId: failedState.sessionId,
            waId,
            establishmentId: lockedEstablishmentId,
            step: failedState.currentStep,
            retryCount: failedState.retryCount,
          });
          await activateHumanTakeover(pool, waId);
          const handoffReply =
            'Percebi que estamos com dificuldade em avançar por aqui. Vou chamar um atendente humano para te ajudar com a reserva, combinado?';
          await outboundGateway.sendText(waId, handoffReply);
          await persistOutbound(handoffReply, 'anti_loop_handoff');
          await trackFunnelEvent(pool, {
            eventType: EVENT_TYPES.HUMAN_HANDOFF,
            conversationId: conversation.id,
            sessionId: failedState.sessionId,
            waId,
            establishmentId: lockedEstablishmentId,
            step: failedState.currentStep,
            payload: { reason: 'anti_loop' },
          });
          return;
        }

        await trackFunnelEvent(pool, {
          eventType: EVENT_TYPES.VALIDATION_FAILURE,
          conversationId: conversation.id,
          sessionId: failedState.sessionId,
          waId,
          establishmentId: lockedEstablishmentId,
          step: failedState.currentStep,
          payload: { code: failure.code || null },
        });

        await outboundGateway.sendText(waId, failure.message);
        await persistOutbound(failure.message, 'STATE_VALIDATION_ERROR');
        return;
      }

      if (Object.keys(stepValidation.accepted).length > 0) {
        await stateManager.mergeCollectedFields(pool, conversation.id, stepValidation.accepted, {
          lockedEstablishmentId,
        });
        await stateManager.markStepCompleted(pool, conversation.id, conversationState.currentStep);
        conversationState = stateManager.buildStateSnapshot(
          await stateManager.getByConversationId(pool, conversation.id),
          { lockedEstablishmentId }
        );
        await trackFunnelEvent(pool, {
          eventType: EVENT_TYPES.STEP_ENTERED,
          conversationId: conversation.id,
          sessionId: conversationState.sessionId,
          waId,
          establishmentId: lockedEstablishmentId,
          step: conversationState.currentStep,
          previousStep: conversationState.completedSteps?.[conversationState.completedSteps.length - 1] || null,
        });
      } else {
        conversationState = stateManager.buildStateSnapshot(
          await stateManager.getByConversationId(pool, conversation.id),
          { lockedEstablishmentId: activeEstablishmentId }
        );
      }
    }

    const interpretedEstablishmentId = extractInterpretedEstablishmentId(interpreted);
    if (interpretedEstablishmentId) {
      conversation = await inbox.setConversationEstablishment(pool, waId, interpretedEstablishmentId);
    }

    const replyEstablishmentId =
      activeEstablishmentId ||
      interpretedEstablishmentId ||
      resolvedEstablishmentId;
    const resolvedEstablishmentName =
      (catalog.establishments || []).find((item) => Number(item.id) === Number(replyEstablishmentId))
        ?.name ||
      linkedEstablishment?.name ||
      conversation?.establishment_name ||
      '';
    const canonicalEstablishmentId = normalizeCanonicalEstablishmentId(
      replyEstablishmentId,
      resolvedEstablishmentName
    );

    let dateOverrideNotice = null;
    const parsedDate =
      parsePtBrDateFromText(messageText) ||
      parseDateFromHistory(messageHistory) ||
      (conversationState?.collectedFields?.reservation_date
        ? { iso: conversationState.collectedFields.reservation_date }
        : null);
    if (canonicalEstablishmentId && parsedDate?.iso) {
      const override = await businessRulesEngine.getDateOverride(
        pool,
        canonicalEstablishmentId,
        parsedDate.iso
      );
      dateOverrideNotice = businessRulesEngine.buildOverrideNotice(override);
    }

    if (usedPersistence && inboundRow?.id) {
      await inbox.updateInboundAiFields(pool, inboundRow.id, {
        intent: interpreted.action,
        suggestedReply: interpreted.suggested_reply,
      });
    }

    emitInbox(app, {
      type: 'interpreted',
      wa_id: waId,
      conversation,
      messageId: inboundRow?.id,
      action: interpreted.action,
      suggested_reply: interpreted.suggested_reply,
    });

    if (interpreted.action === 'falar_com_humano') {
      if (usedPersistence && isConversationSafetyBlockEnabled()) {
        await activateHumanTakeover(pool, waId);
        if (conversation?.id) {
          await stateManager.markHandoff(pool, conversation.id, { intent: 'falar_com_humano' });
        }
      }
      const handoffReply = mergeReplyWithOverrideNotice(
        interpreted.suggested_reply ||
          'Oi! Percebi que faz sentido um atendente humano te ajudar melhor agora. Só um instante — já chamo alguém da equipe por aqui pra continuar com você, combinado?',
        dateOverrideNotice
      );
      await outboundGateway.sendText(waId, handoffReply);
      await persistOutbound(handoffReply, 'falar_com_humano');
      if (isConversationSafetyBlockEnabled()) {
        await trackFunnelEvent(pool, {
          eventType: EVENT_TYPES.HUMAN_HANDOFF,
          conversationId: conversation?.id || null,
          sessionId: conversationState?.sessionId || null,
          waId,
          establishmentId: lockedEstablishmentId,
          step: conversationState?.currentStep || null,
          payload: { reason: 'explicit_request' },
        });
        return;
      }
    }

    if (
      interpreted.action === 'REFUSE_MINOR' &&
      interpreted.suggested_reply &&
      !isLikelyReservationIntent(messageText)
    ) {
      const minorReply = mergeReplyWithOverrideNotice(interpreted.suggested_reply, dateOverrideNotice);
      await outboundGateway.sendText(waId, minorReply);
      await persistOutbound(minorReply, 'REFUSE_MINOR');
      return;
    }

    const stateParams = {
      ...(conversationState?.collectedFields || {}),
      ...(interpreted.params || {}),
    };
    const canProcessReservation =
      interpreted.action === 'PROCESS_RESERVATION' &&
      (!conversationState || conversationState.missingFields.length === 0);

    if (canProcessReservation) {
      const params = stateParams;
      const businessValidation = applyBusinessRulesToReservationParams(params);
      if (!businessValidation.ok) {
        await outboundGateway.sendText(waId, businessValidation.message);
        await persistOutbound(businessValidation.message, 'COLLECT_DATA');
        return;
      }

      // GUARD HARDLINE: rejeita data alucinada (>11 meses no futuro). O LLM
      // legado tem histórico de inventar ano 2027 quando o cliente fala
      // "próximo sábado". Sem essa barreira, ele grava reserva fantasma.
      try {
        const { isDateTooFarInFuture } = require('../../nlp/dateResolver');
        const candidateDate = String(params.reservation_date || '').slice(0, 10);
        if (candidateDate && isDateTooFarInFuture(candidateDate, null, 11)) {
          console.warn(
            `[conversationEngine] PROCESS_RESERVATION bloqueada: data muito no futuro (${candidateDate}) waId=${waId}`
          );
          const safeMsg =
            'Pra eu não errar na data, me confirma de novo: que dia exatamente você quer reservar? Pode mandar no formato DD/MM (ex.: 29/05 ou "próximo sábado") que eu já encaminho.';
          await outboundGateway.sendText(waId, safeMsg);
          await persistOutbound(safeMsg, 'DATE_TOO_FAR_FUTURE');
          if (conversation?.id) {
            // Limpa a data inválida do estado pra forçar nova coleta limpa.
            await stateManager.mergeCollectedFields(pool, conversation.id, {
              reservation_date: null,
            }).catch(() => {});
          }
          return;
        }
      } catch (dateGuardError) {
        console.warn('[conversationEngine] date guard error:', dateGuardError.message);
      }

      // GUARD HARDLINE: bloqueia área inválida ANTES de criar reserva.
      // Pro Highline (id=7) só aceitamos sub-áreas canônicas. Se vier
      // "Terraço", "Área Coberta", etc., recusamos.
      try {
        const {
          isHighlineEstablishment,
          HIGHLINE_SUBAREAS,
        } = require('../agent/highlineReservationAreas');
        const reservationEstId = Number(params.establishment_id);
        if (isHighlineEstablishment(reservationEstId)) {
          const requestedArea = String(params.area_name || params.area_label || '').toLowerCase();
          const forbiddenInArea = /(terra[cç]o|^balc[aã]o$|[áa]rea coberta|[áa]rea descoberta|[áa]rea vip(?! consum)|mezanino)/i;
          if (requestedArea && forbiddenInArea.test(requestedArea)) {
            console.warn(
              `[conversationEngine] PROCESS_RESERVATION bloqueada: área proibida (${requestedArea}) waId=${waId}`
            );
            const labels = HIGHLINE_SUBAREAS.map((s) => s.label).join(', ');
            const safeMsg = `Pra te confirmar a reserva no Highline, preciso de uma área válida — só temos: ${labels}. Qual dessas você prefere?`;
            await outboundGateway.sendText(waId, safeMsg);
            await persistOutbound(safeMsg, 'INVALID_AREA');
            if (conversation?.id) {
              await stateManager.mergeCollectedFields(pool, conversation.id, {
                area_id: null,
                area_name: null,
              }).catch(() => {});
            }
            return;
          }
        }
      } catch (areaGuardError) {
        console.warn('[conversationEngine] area guard error:', areaGuardError.message);
      }

      const missing = validateProcessReservationParams(params);
      if (missing.length > 0) {
        const fallback = `Para registrar sua reserva no sistema, ainda preciso de: ${formatMissingFieldsForUser(missing)}. Pode me enviar?`;
        await outboundGateway.sendText(waId, fallback);
        await persistOutbound(fallback, 'COLLECT_DATA');
        return;
      }

      const age = ageFromIsoDate(params.data_nascimento);
      if (age !== null && age < 18) {
        const minorMsg =
          'Puxa, muito obrigado pelo contato! Para reservar conosco é necessário ter 18 anos ou mais. Se você for menor, peça para um responsável seguir por aqui, combinado?';
        await outboundGateway.sendText(waId, minorMsg);
        await persistOutbound(minorMsg, 'REFUSE_MINOR');
        return;
      }

      const noteParts = ['Origem: WhatsApp (IA)'];
      if (params.reservation_notes) {
        noteParts.push(String(params.reservation_notes).trim());
      }
      const body = buildReservationBodyFromParams(params, waId, {
        notes: noteParts.filter(Boolean).join(' | '),
      });
      const created = await createReservationInternal(body);
      if (!created.success) {
        const errText =
          `Não consegui finalizar a reserva agora: ${created.error}. Podemos tentar outro horário ou outro dia? Se preferir, diga "atendente" e chamamos alguém da equipe.`;
        await outboundGateway.sendText(waId, errText);
        await persistOutbound(errText, 'PROCESS_RESERVATION_ERROR');
        return;
      }

      const resData = created.data || {};
      const reservationRow = resData.reservation || resData;
      const guestListLink = resData.guest_list_link || null;
      const hasGuestList = Boolean(guestListLink);

      if (conversation?.id) {
        await stateManager.markCompleted(pool, conversation.id);
        await trackFunnelEvent(pool, {
          eventType: EVENT_TYPES.CONVERSION_COMPLETED,
          conversationId: conversation.id,
          sessionId: conversationState?.sessionId || null,
          waId,
          establishmentId: Number(params.establishment_id) || null,
          step: 'completed',
          previousStep: conversationState?.currentStep || null,
        });
      }

      const reservationEstablishmentId = Number(
        reservationRow.establishment_id || params.establishment_id || interpretedEstablishmentId
      );
      if (Number.isFinite(reservationEstablishmentId) && reservationEstablishmentId > 0) {
        conversation = await inbox.setConversationEstablishment(pool, waId, reservationEstablishmentId);
      }

      await inbox.upsertContact(pool, {
        waId,
        contactName: reservationRow.client_name || params.client_name || extractContactName(payload),
        clientEmail: reservationRow.client_email || params.client_email || null,
        birthDate: params.data_nascimento || null,
        lastEstablishmentId:
          Number.isFinite(reservationEstablishmentId) && reservationEstablishmentId > 0
            ? reservationEstablishmentId
            : null,
        lastReservationId: reservationRow.id || null,
      });
      try {
        await refreshProfileFromSources(pool, waId);
      } catch (profileError) {
        console.warn('[conversationEngine] falha ao atualizar perfil operacional:', profileError.message);
      }

      let confirmText;
      try {
        confirmText = await generateReservationConfirmationMessage({
          reservation: reservationRow,
          hasGuestList,
          isBirthday: Boolean(params.is_birthday),
        });
      } catch (confirmationError) {
        confirmText =
          `Sua reserva foi registrada com sucesso, ${reservationRow.client_name || ''}! ` +
          `Te esperamos no ${reservationRow.establishment_name || 'estabelecimento'} ` +
          `em ${reservationRow.reservation_date} às ${String(reservationRow.reservation_time || '').slice(0, 5)}.`;
      }

      const isPracinha = Number(params?.establishment_id) === 8;
      const partySize = Number(params?.quantidade_convidados);
      if (isPracinha && Number.isFinite(partySize) && partySize > 6) {
        confirmText +=
          '\n\nImportante para alinhar certinho: na Pracinha, garantimos até 6 lugares sentados na reserva; acima disso, o restante do grupo é acomodado no fluxo da casa.';
      }

      // Guard determinístico FINAL na mensagem de confirmação: o LLM pode
      // inventar "Terraço", "Atenciosamente, Caro X", ano errado. A reserva
      // já está gravada no banco com os dados REAIS (validados acima), então
      // se o LLM gerar texto com nome de área proibido, sobrescrevemos por
      // um template seguro montado a partir do registro REAL.
      try {
        const guardOutput = sanitizeAssistantReply(confirmText, {
          toolTrace: [],
          workingState: params || {},
        });
        if (guardOutput.blocked) {
          console.warn(
            `[conversationEngine] PROCESS_RESERVATION confirm guard: substituiu confirmação (reason=${guardOutput.reason}) waId=${waId}`
          );
          // Quando o guard bloqueia, montamos uma confirmação determinística
          // só com os dados que VIERAM DO BANCO (reservationRow), não do LLM.
          const r = reservationRow || {};
          const safeDate = String(r.reservation_date || params.reservation_date || '').slice(0, 10);
          const safeTime = String(r.reservation_time || params.reservation_time || '').slice(0, 5);
          const safeName = (r.client_name || params.client_name || '').toString().split(' ')[0] || '';
          confirmText = [
            safeName ? `Fechado, ${safeName}!` : 'Fechado!',
            `Sua reserva ficou pra ${safeDate}${safeTime ? ' às ' + safeTime : ''}.`,
            'Qualquer coisa, é só me chamar.',
          ].join(' ');
        }
      } catch (confirmGuardError) {
        console.warn(
          '[conversationEngine] PROCESS_RESERVATION confirm guard error:',
          confirmGuardError.message
        );
      }

      await outboundGateway.sendText(waId, confirmText);
      await persistOutbound(confirmText, 'PROCESS_RESERVATION_CONFIRM');

      if (guestListLink) {
        const linkMsg = buildGuestListSecondMessage(guestListLink);
        await outboundGateway.sendText(waId, linkMsg);
        await persistOutbound(linkMsg, 'GUEST_LIST_LINK');
      } else {
        console.warn(
          `[conversationEngine] reserva ${reservationRow.id || 'n/a'} sem guest_list_link waId=${waId}`
        );
      }
      return;
    }

    const establishmentNameForPrompt =
      resolvedEstablishmentName || conversation?.establishment_name || '';

    let replyText =
      interpreted.suggested_reply ||
      getStepPrompt(conversationState?.currentStep || 'greeting', conversationState?.collectedFields || {}, {
        establishmentName: establishmentNameForPrompt,
        lockedEstablishmentId: activeEstablishmentId,
      });

    if (
      (interpreted.action === 'COLLECT_DATA' || !interpreted.action) &&
      looksLikePrematureBookingPromise(replyText)
    ) {
      const missingText =
        conversationState?.missingFields?.length > 0
          ? ` Para registrar no sistema, ainda preciso de: ${formatMissingFieldsForUser(conversationState.missingFields)}.`
          : ' Para registrar no sistema, ainda faltam alguns dados.';
      replyText = `Só pra alinhar: sua reserva ainda não foi salva aqui.${missingText} Me envia o que faltar que eu fecho o cadastro na hora, combinado?`;
    }

    replyText = mergeReplyWithOverrideNotice(replyText, dateOverrideNotice);

    const operationalReply = await buildOperationalInfoReply(pool, {
      messageText,
      establishmentId: canonicalEstablishmentId,
      reservationDate: parsedDate,
      catalog,
    });
    if (operationalReply) {
      replyText = operationalReply;
    } else if (looksLikeMenuQuestion(messageText)) {
      const menuUrl = getCardapioUrlByEstablishmentId(canonicalEstablishmentId);
      replyText = menuUrl
        ? `Perfeito! Aqui está o cardápio: ${menuUrl}\n\nSe quiser, já te passo os melhores horários e deixo sua reserva encaminhada.`
        : 'Claro! Eu te envio o cardápio da casa escolhida. Me confirma qual estabelecimento você quer, que já te mando e te ajudo com a reserva.';
    } else if (looksLikeRepeatedDataComplaint(messageText) && conversationState?.collectedFields) {
      const summary = buildCollectedFieldsSummary(conversationState.collectedFields);
      const pending = formatMissingFieldsForUser(conversationState.missingFields || []);
      replyText = summary
        ? `Você tem razão — já anotei aqui: ${summary}. Para seguir, ainda preciso de ${pending || 'mais alguns detalhes'}.`
        : `Você tem razão — vou seguir com o que já conversamos. Me confirma só o próximo dado: ${pending || 'quantidade de pessoas'}.`;
    } else if (looksLikeParkingQuestion(messageText)) {
      if (canonicalEstablishmentId && parsedDate?.iso) {
        const establishmentName =
          (catalog.establishments || []).find((item) => Number(item.id) === Number(canonicalEstablishmentId))
            ?.name || 'a casa';
        replyText =
          `Sobre estacionamento no ${establishmentName} para ${formatIsoDateForUser(parsedDate.iso)}: a orientação pode variar conforme o dia e o evento. Se quiser, já confirmo com a equipe da casa e sigo com sua reserva para ${formatIsoDateForUser(parsedDate.iso)}.`;
      } else {
        replyText =
          'Estacionamento pode variar por casa e por dia/evento. Se você me disser a data e o estabelecimento, já te passo a melhor orientação e deixo sua reserva encaminhada.';
      }
    } else if (looksLikeMusicQuestion(messageText) && canonicalEstablishmentId && parsedDate?.iso) {
      const [year, month, day] = parsedDate.iso.split('-');
      const displayDate = `${day}-${month}-${year}`;
      const establishmentName =
        (catalog.establishments || []).find((item) => Number(item.id) === Number(canonicalEstablishmentId))
          ?.name || 'a casa';
      replyText = `Para ${displayDate} no ${establishmentName}, a programação musical pode variar conforme evento e operação do dia.\n\nSe quiser, eu já te passo os horários disponíveis e deixo sua reserva encaminhada.`;
    } else if (looksLikeAvailabilityQuestion(messageText) && !parsedDate?.iso) {
      replyText =
        'Consigo verificar agora para você. Me fala só a data desejada (ex.: hoje, amanhã ou DD/MM) que eu já te passo os horários disponíveis e encaminho a reserva.';
    } else if (looksLikeAvailabilityQuestion(messageText) && !canonicalEstablishmentId) {
      replyText =
        'Consigo verificar os horários disponíveis agora. Me confirma apenas o estabelecimento que você quer, que já te passo as opções e encaminho sua reserva.';
    }

    // Guard determinístico de saída: bloqueia áreas inválidas (Terraço, Balcão,
    // Área Coberta/Descoberta/VIP), tom formal ("Caro X", "Atenciosamente") e
    // confirmações falsas mesmo quando a resposta vem do cérebro legado
    // (aiService.interpretMessage). Esse caminho não tem toolTrace, então o
    // guard só vai filtrar/substituir texto problemático sem tentar sintetizar.
    try {
      const guardOutput = sanitizeAssistantReply(replyText, {
        toolTrace: [],
        workingState: conversationState?.collectedFields || {},
      });
      if (guardOutput.blocked) {
        console.warn(
          `[conversationEngine] legacy guard: substituiu reply (reason=${guardOutput.reason}) waId=${waId}`
        );
        replyText = guardOutput.text;
      }
    } catch (guardError) {
      console.warn('[conversationEngine] legacy guard error:', guardError.message);
    }

    await outboundGateway.sendText(waId, replyText);
    await persistOutbound(replyText, interpreted.action || 'COLLECT_DATA');
  } catch (error) {
    console.error('[conversationEngine] erro ao processar turno:', error.message);
    try {
      const fallback =
        'Tive um instante por aqui. Pode repetir sua última mensagem que eu continuo sua reserva com o que faltava?';
      await outboundGateway.sendText(waId, fallback);
      await persistOutbound(fallback, 'ENGINE_ERROR');
    } catch (sendError) {
      console.warn('[conversationEngine] falha ao enviar fallback de erro:', sendError.message);
    }
  }
}

module.exports = {
  processInboundTurn,
};
