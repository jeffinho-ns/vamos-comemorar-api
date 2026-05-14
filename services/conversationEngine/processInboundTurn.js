const { interpretMessage, generateReservationConfirmationMessage } = require('../aiService');
const { sendMessage } = require('../whatsappService');
const inbox = require('../whatsappInboxRepository');
const businessRulesEngine = require('../businessRulesEngine');
const stateManager = require('../stateManager/stateManager');
const {
  formatMissingFieldsForUser,
  getStepPrompt,
  isTerminalStep,
} = require('../stateManager/conversationSteps');
const { validateFieldsForStep, validateField } = require('../../validators/stepFieldValidator');
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
  detectEstablishmentFromText,
  normalizeCanonicalEstablishmentId,
  parseDateFromHistory,
  getCardapioUrlByEstablishmentId,
  applyBusinessRulesToReservationParams,
} = require('./helpers');
const {
  ageFromIsoDate,
  loadAiCatalog,
  createReservationInternal,
  buildReservationBodyFromParams,
  buildGuestListSecondMessage,
} = require('../whatsappReservationService');

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
    });
  }
}

async function activateHumanTakeover(pool, waId) {
  await inbox.setHumanTakeoverHours(pool, waId, resolveAutoTakeoverHours());
  await inbox.updateConversationStatus(pool, waId, 'in_progress');
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

async function processInboundTurn({ pool, app, payload, incomingMessageText, waId }) {
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
    inboundRow = await inbox.insertMessage(pool, {
      conversationId: conversation.id,
      direction: 'inbound',
      body: messageText,
      rawPayload: payload,
    });
    await inbox.upsertContact(pool, {
      waId,
      contactName,
      lastEstablishmentId: linkedEstablishment?.id || null,
    });
    usedPersistence = true;
  } catch (persistError) {
    console.error('[conversationEngine] persistência indisponível:', persistError.message);
  }

  emitInbox(app, {
    type: 'inbound',
    wa_id: waId,
    conversation,
    message: inboundRow,
    body: messageText,
  });

  if (usedPersistence && (await inbox.isHumanTakeoverActive(pool, waId))) {
    console.log('[conversationEngine] Handoff humano ativo — IA não responde automaticamente.');
    return;
  }

  let conversationState = null;
  const lockedEstablishmentId =
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
    } catch (stateError) {
      console.warn('[conversationEngine] estado persistido indisponível:', stateError.message);
    }
  }

  if (conversationState && isTerminalStep(conversationState.currentStep)) {
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
    establishmentRulesBlock: '',
    dateOverridesBlock: '',
    establishments: [],
  };
  try {
    catalog = await loadAiCatalog(pool);
  } catch (catalogError) {
    console.warn('[conversationEngine] catálogo IA:', catalogError.message);
  }

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
    const interpreted = await interpretMessage({
      messageHistory,
      context: {
        establishmentsBlock: linkedEstablishment
          ? `- id ${linkedEstablishment.id}: ${linkedEstablishment.name}`
          : catalog.establishmentsBlock,
        areasBlock: catalog.areasBlock,
        establishmentRulesBlock: catalog.establishmentRulesBlock || '',
        dateOverridesBlock: catalog.dateOverridesBlock || '',
        lockedEstablishmentId,
        lockedEstablishmentName:
          linkedEstablishment?.name ||
          (conversation?.establishment_name ? String(conversation.establishment_name) : null),
        conversationStep: conversationState?.currentStep || 'greeting',
        missingFields: conversationState?.missingFields || [],
      },
    });

    if (lockedEstablishmentId) {
      interpreted.params = {
        ...(interpreted.params || {}),
        establishment_id: lockedEstablishmentId,
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

    if (usedPersistence && conversation?.id && conversationState) {
      const stepValidation = await validateFieldsForStep(
        conversationState.currentStep,
        interpreted.params || {},
        {
          pool,
          establishmentId: lockedEstablishmentId || interpreted.params?.establishment_id,
          reservationDate: interpreted.params?.reservation_date,
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
          await activateHumanTakeover(pool, waId);
          const handoffReply =
            'Percebi que estamos com dificuldade em avançar por aqui. Vou chamar um atendente humano para te ajudar com a reserva, combinado?';
          await sendMessage(waId, handoffReply);
          await persistOutbound(handoffReply, 'anti_loop_handoff');
          return;
        }

        await sendMessage(waId, failure.message);
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
      } else {
        const mergeResult = await applyValidatedParamsToState(
          pool,
          conversation.id,
          interpreted.params,
          {
            pool,
            lockedEstablishmentId,
            collectedFields: conversationState.collectedFields,
          }
        );

        if (mergeResult.failures.length > 0) {
          const failure = mergeResult.failures[0];
          const failedState = await stateManager.recordValidationFailure(pool, conversation.id, {
            message: failure.message,
            intent: interpreted.action,
          });
          if (stateManager.shouldTriggerHandoff(failedState)) {
            await activateHumanTakeover(pool, waId);
            const handoffReply =
              'Percebi que estamos com dificuldade em avançar por aqui. Vou chamar um atendente humano para te ajudar com a reserva, combinado?';
            await sendMessage(waId, handoffReply);
            await persistOutbound(handoffReply, 'anti_loop_handoff');
            return;
          }
          await sendMessage(waId, failure.message);
          await persistOutbound(failure.message, 'STATE_VALIDATION_ERROR');
          return;
        }

        conversationState = stateManager.buildStateSnapshot(
          await stateManager.getByConversationId(pool, conversation.id),
          { lockedEstablishmentId }
        );
      }
    }

    const interpretedEstablishmentId = extractInterpretedEstablishmentId(interpreted);
    if (interpretedEstablishmentId) {
      conversation = await inbox.setConversationEstablishment(pool, waId, interpretedEstablishmentId);
    }

    const resolvedEstablishmentId =
      interpretedEstablishmentId ||
      detectEstablishmentFromText(messageText, catalog.establishments || []) ||
      detectEstablishmentFromText(
        messageHistory.map((message) => message.content).join(' '),
        catalog.establishments || []
      ) ||
      linkedEstablishment?.id ||
      (Number.isFinite(Number(conversation?.establishment_id)) ? Number(conversation.establishment_id) : null);
    const resolvedEstablishmentName =
      (catalog.establishments || []).find((item) => Number(item.id) === Number(resolvedEstablishmentId))
        ?.name ||
      linkedEstablishment?.name ||
      conversation?.establishment_name ||
      '';
    const canonicalEstablishmentId = normalizeCanonicalEstablishmentId(
      resolvedEstablishmentId,
      resolvedEstablishmentName
    );

    let dateOverrideNotice = null;
    const parsedDate = parsePtBrDateFromText(messageText) || parseDateFromHistory(messageHistory);
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
      if (usedPersistence) {
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
      await sendMessage(waId, handoffReply);
      await persistOutbound(handoffReply, 'falar_com_humano');
      return;
    }

    if (interpreted.action === 'REFUSE_MINOR' && interpreted.suggested_reply) {
      const minorReply = mergeReplyWithOverrideNotice(interpreted.suggested_reply, dateOverrideNotice);
      await sendMessage(waId, minorReply);
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
        await sendMessage(waId, businessValidation.message);
        await persistOutbound(businessValidation.message, 'COLLECT_DATA');
        return;
      }

      const missing = validateProcessReservationParams(params);
      if (missing.length > 0) {
        const fallback = `Para registrar sua reserva no sistema, ainda preciso de: ${formatMissingFieldsForUser(missing)}. Pode me enviar?`;
        await sendMessage(waId, fallback);
        await persistOutbound(fallback, 'COLLECT_DATA');
        return;
      }

      const age = ageFromIsoDate(params.data_nascimento);
      if (age !== null && age < 18) {
        const minorMsg =
          'Puxa, muito obrigado pelo contato! Para reservar conosco é necessário ter 18 anos ou mais. Se você for menor, peça para um responsável seguir por aqui, combinado?';
        await sendMessage(waId, minorMsg);
        await persistOutbound(minorMsg, 'REFUSE_MINOR');
        return;
      }

      const body = buildReservationBodyFromParams(params, waId, { notes: 'Origem: WhatsApp (IA)' });
      const created = await createReservationInternal(body);
      if (!created.success) {
        const errText =
          `Não consegui finalizar a reserva agora: ${created.error}. Podemos tentar outro horário ou outro dia? Se preferir, diga "atendente" e chamamos alguém da equipe.`;
        await sendMessage(waId, errText);
        await persistOutbound(errText, 'PROCESS_RESERVATION_ERROR');
        return;
      }

      const resData = created.data || {};
      const reservationRow = resData.reservation || resData;
      const guestListLink = resData.guest_list_link || null;
      const hasGuestList = Boolean(guestListLink);

      if (conversation?.id) {
        await stateManager.markCompleted(pool, conversation.id);
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

      await sendMessage(waId, confirmText);
      await persistOutbound(confirmText, 'PROCESS_RESERVATION_CONFIRM');

      if (hasGuestList && guestListLink) {
        const linkMsg = buildGuestListSecondMessage(guestListLink);
        await sendMessage(waId, linkMsg);
        await persistOutbound(linkMsg, 'GUEST_LIST_LINK');
      }
      return;
    }

    let replyText =
      interpreted.suggested_reply ||
      getStepPrompt(conversationState?.currentStep || 'greeting');

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

    if (looksLikeMenuQuestion(messageText)) {
      const menuUrl = getCardapioUrlByEstablishmentId(canonicalEstablishmentId);
      replyText = menuUrl
        ? `Perfeito! Aqui está o cardápio: ${menuUrl}\n\nSe quiser, já te passo os melhores horários e deixo sua reserva encaminhada.`
        : 'Claro! Eu te envio o cardápio da casa escolhida. Me confirma qual estabelecimento você quer, que já te mando e te ajudo com a reserva.';
    } else if (looksLikeParkingQuestion(messageText)) {
      replyText =
        'Estacionamento pode variar por casa e por dia/evento. Se você me disser a data e o estabelecimento, já te passo a melhor orientação e deixo sua reserva encaminhada.';
    } else if (looksLikeMusicQuestion(messageText) && canonicalEstablishmentId && parsedDate?.iso) {
      const [year, month, day] = parsedDate.iso.split('-');
      const displayDate = `${day}-${month}-${year}`;
      const establishmentName =
        (catalog.establishments || []).find((item) => Number(item.id) === Number(canonicalEstablishmentId))
          ?.name || 'a casa';
      replyText = `Para ${displayDate} no ${establishmentName}, a programação musical pode variar conforme evento e operação do dia.\n\nSe quiser, eu já te passo os horários disponíveis e deixo sua reserva encaminhada.`;
    } else if (looksLikeAvailabilityQuestion(messageText) && canonicalEstablishmentId && parsedDate?.iso) {
      const windows = await businessRulesEngine.getOperatingWindowsForDate(
        pool,
        canonicalEstablishmentId,
        parsedDate.iso
      );
      const [year, month, day] = parsedDate.iso.split('-');
      const displayDate = `${day}-${month}-${year}`;
      replyText =
        windows.length > 0
          ? `No dia ${displayDate}, os horários disponíveis são: ${windows.join(' | ')}.\n\nSe quiser, já deixo sua reserva encaminhada. Me fala só o horário que prefere e quantas pessoas serão.`
          : `No dia ${displayDate}, não temos janela de reserva disponível no sistema.\n\nSe quiser, eu te sugiro o melhor dia/horário alternativo e já encaminho sua reserva.`;
    } else if (looksLikeAvailabilityQuestion(messageText) && !parsedDate?.iso) {
      replyText =
        'Consigo verificar agora para você. Me fala só a data desejada (ex.: hoje, amanhã ou DD/MM) que eu já te passo os horários disponíveis e encaminho a reserva.';
    } else if (looksLikeAvailabilityQuestion(messageText) && !canonicalEstablishmentId) {
      replyText =
        'Consigo verificar os horários disponíveis agora. Me confirma apenas o estabelecimento que você quer, que já te passo as opções e encaminho sua reserva.';
    }

    await sendMessage(waId, replyText);
    await persistOutbound(replyText, interpreted.action || 'COLLECT_DATA');
  } catch (error) {
    console.error('[conversationEngine] erro ao processar turno:', error.message);
  }
}

module.exports = {
  processInboundTurn,
};
