const express = require('express');
const { interpretMessage, generateReservationConfirmationMessage } = require('../services/aiService');
const { sendMessage } = require('../services/whatsappService');
const inbox = require('../services/whatsappInboxRepository');
const {
  ageFromIsoDate,
  loadAiCatalog,
  createReservationInternal,
  buildReservationBodyFromParams,
  buildGuestListSecondMessage,
} = require('../services/whatsappReservationService');

function extractMessageText(payload) {
  const entry = payload?.entry?.[0];
  const change = entry?.changes?.[0];
  const value = change?.value;
  const firstMessage = value?.messages?.[0];

  if (!firstMessage) return null;

  if (firstMessage?.text?.body) return firstMessage.text.body;
  if (firstMessage?.button?.text) return firstMessage.button.text;
  if (firstMessage?.interactive?.button_reply?.title) {
    return firstMessage.interactive.button_reply.title;
  }
  if (firstMessage?.interactive?.list_reply?.title) {
    return firstMessage.interactive.list_reply.title;
  }

  return null;
}

function extractSenderNumber(payload) {
  const entry = payload?.entry?.[0];
  const change = entry?.changes?.[0];
  const value = change?.value;
  const firstMessage = value?.messages?.[0];
  const firstContact = value?.contacts?.[0];

  return firstMessage?.from || firstContact?.wa_id || null;
}

function extractContactName(payload) {
  const entry = payload?.entry?.[0];
  const change = entry?.changes?.[0];
  const value = change?.value;
  return value?.contacts?.[0]?.profile?.name || null;
}

function mapRowsToOpenAIHistory(rows) {
  return (rows || []).map((r) => ({
    role: r.direction === 'outbound' ? 'assistant' : 'user',
    content: r.body,
  }));
}

function emitInbox(app, payload) {
  const io = app?.get?.('socketio');
  if (io) {
    io.to('whatsapp_inbox').emit('whatsapp_inbox_update', payload);
  }
}

function validateProcessReservationParams(p) {
  const keys = [
    'establishment_id',
    'client_name',
    'client_email',
    'data_nascimento',
    'quantidade_convidados',
    'reservation_date',
    'reservation_time',
    'area_id',
  ];
  const missing = [];
  for (const k of keys) {
    const v = p[k];
    if (v === undefined || v === null || v === '') {
      missing.push(k);
      continue;
    }
    if (
      (k === 'establishment_id' || k === 'area_id' || k === 'quantidade_convidados') &&
      Number.isNaN(Number(v))
    ) {
      missing.push(k);
    }
  }
  return missing;
}

module.exports = (pool, app) => {
  const router = express.Router();

  /**
   * Webhook da API oficial do WhatsApp (Meta).
   * GET: validação do endpoint.
   * POST: recebimento de eventos (mensagens/status).
   */
  router.get('/', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;

    if (!verifyToken) {
      console.error('[WhatsApp webhook] WHATSAPP_VERIFY_TOKEN não definido no ambiente.');
      return res.status(500).send('Internal configuration error');
    }

    if (token === verifyToken && challenge) {
      return res.status(200).type('text/plain').send(challenge);
    }

    console.warn('[WhatsApp webhook] Verificação GET recusada', {
      hub_mode: mode,
      has_verify_token: Boolean(token),
      has_challenge: Boolean(challenge),
    });
    return res.status(403).send('Forbidden');
  });

  router.post('/', async (req, res) => {
    const payload = req.body;

    if (!payload || (typeof payload === 'object' && Object.keys(payload).length === 0)) {
      console.warn('[WhatsApp webhook] POST recebido sem corpo.');
      return res.sendStatus(200);
    }

    console.log('[WhatsApp webhook] payload:', JSON.stringify(payload, null, 2));
    const messageText = extractMessageText(payload);
    const senderNumber = extractSenderNumber(payload);

    if (!messageText) {
      console.log('[WhatsApp webhook] Nenhuma mensagem de texto encontrada no payload.');
      return res.sendStatus(200);
    }

    if (!senderNumber) {
      console.warn('[WhatsApp webhook] Remetente ausente; não é possível responder ou persistir.');
      return res.sendStatus(200);
    }

    let conversation = null;
    let inboundRow = null;
    let usedPersistence = false;

    try {
      conversation = await inbox.upsertConversation(pool, {
        waId: senderNumber,
        contactName: extractContactName(payload),
      });
      inboundRow = await inbox.insertMessage(pool, {
        conversationId: conversation.id,
        direction: 'inbound',
        body: messageText,
        rawPayload: payload,
      });
      usedPersistence = true;
    } catch (err) {
      console.error('[WhatsApp webhook] persistência indisponível (rode a migration?):', err.message);
    }

    emitInbox(app, {
      type: 'inbound',
      wa_id: senderNumber,
      conversation,
      message: inboundRow,
      body: messageText,
    });

    const humanActive = usedPersistence
      ? await inbox.isHumanTakeoverActive(pool, senderNumber)
      : false;

    if (humanActive) {
      console.log('[WhatsApp webhook] Handoff humano ativo — IA não responde automaticamente.');
      return res.sendStatus(200);
    }

    let messageHistory = [{ role: 'user', content: messageText }];
    if (usedPersistence && conversation) {
      try {
        const recent = await inbox.getRecentMessagesForContext(pool, conversation.id, 12);
        messageHistory = mapRowsToOpenAIHistory(recent);
      } catch (e) {
        console.warn('[WhatsApp webhook] falha ao montar histórico:', e.message);
      }
    }

    let catalog = { establishmentsBlock: '', areasBlock: '' };
    try {
      catalog = await loadAiCatalog(pool);
    } catch (e) {
      console.warn('[WhatsApp webhook] catálogo IA:', e.message);
    }

    try {
      const interpreted = await interpretMessage({
        messageHistory,
        context: {
          establishmentsBlock: catalog.establishmentsBlock,
          areasBlock: catalog.areasBlock,
        },
      });
      console.log('[WhatsApp webhook] interpretação IA:', interpreted);

      if (usedPersistence && inboundRow?.id) {
        try {
          await inbox.updateInboundAiFields(pool, inboundRow.id, {
            intent: interpreted.action,
            suggestedReply: interpreted.suggested_reply,
          });
        } catch (e) {
          console.warn('[WhatsApp webhook] não foi possível salvar intent/sugestão:', e.message);
        }
      }

      emitInbox(app, {
        type: 'interpreted',
        wa_id: senderNumber,
        conversation,
        messageId: inboundRow?.id,
        action: interpreted.action,
        suggested_reply: interpreted.suggested_reply,
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
            wa_id: senderNumber,
            conversation: await inbox.getConversationByWaId(pool, senderNumber),
            message: saved,
          });
        } catch (e) {
          console.warn('[WhatsApp webhook] falha ao gravar outbound:', e.message);
        }
      };

      /** Escalamento humano */
      if (interpreted.action === 'falar_com_humano' && interpreted.suggested_reply) {
        const sendResult = await sendMessage(senderNumber, interpreted.suggested_reply);
        console.log('[WhatsApp webhook] envio automático (handoff):', sendResult);
        await persistOutbound(interpreted.suggested_reply, 'falar_com_humano');
        return res.sendStatus(200);
      }

      /** Menor de idade — mensagem educada */
      if (interpreted.action === 'REFUSE_MINOR' && interpreted.suggested_reply) {
        await sendMessage(senderNumber, interpreted.suggested_reply);
        await persistOutbound(interpreted.suggested_reply, 'REFUSE_MINOR');
        return res.sendStatus(200);
      }

      /** Processar reserva no banco */
      if (interpreted.action === 'PROCESS_RESERVATION') {
        const params = interpreted.params || {};
        const missing = validateProcessReservationParams(params);

        if (missing.length > 0) {
          const fallback =
            interpreted.suggested_reply ||
            `Quase lá! Para concluir sua reserva, preciso destes dados: ${missing.join(', ')}. Pode me enviar?`;
          await sendMessage(senderNumber, fallback);
          await persistOutbound(fallback, 'COLLECT_DATA');
          return res.sendStatus(200);
        }

        const age = ageFromIsoDate(params.data_nascimento);
        if (age !== null && age < 18) {
          const minorMsg =
            'Puxa, muito obrigado pelo contato! Para reservar conosco é necessário ter 18 anos ou mais. ' +
            'Se você for menor, peça para um responsável seguir por aqui, combinado? 💚';
          await sendMessage(senderNumber, minorMsg);
          await persistOutbound(minorMsg, 'REFUSE_MINOR');
          return res.sendStatus(200);
        }

        const body = buildReservationBodyFromParams(params, senderNumber, {
          notes: 'Origem: WhatsApp (IA)',
        });

        const created = await createReservationInternal(body);
        if (!created.success) {
          const errText =
            `Não consegui finalizar a reserva agora: ${created.error}. ` +
            `Podemos tentar outro horário ou outro dia? Se preferir, diga "atendente" e chamamos alguém da equipe.`;
          await sendMessage(senderNumber, errText);
          await persistOutbound(errText, 'PROCESS_RESERVATION_ERROR');
          return res.sendStatus(200);
        }

        const resData = created.data || {};
        const reservationRow = resData.reservation || resData;
        const guestListLink = resData.guest_list_link || null;
        const hasGuestList = Boolean(guestListLink);

        let confirmText;
        try {
          confirmText = await generateReservationConfirmationMessage({
            reservation: reservationRow,
            hasGuestList,
            isBirthday: Boolean(params.is_birthday),
          });
        } catch (ce) {
          console.error('[WhatsApp webhook] confirmação IA:', ce.message);
          confirmText =
            `Sua reserva foi registrada com sucesso, ${reservationRow.client_name || ''}! ` +
            `Te esperamos no ${reservationRow.establishment_name || 'estabelecimento'} ` +
            `em ${reservationRow.reservation_date} às ${String(reservationRow.reservation_time || '').slice(0, 5)}.`;
        }

        await sendMessage(senderNumber, confirmText);
        await persistOutbound(confirmText, 'PROCESS_RESERVATION_CONFIRM');

        if (hasGuestList && guestListLink) {
          const linkMsg = buildGuestListSecondMessage(guestListLink);
          await sendMessage(senderNumber, linkMsg);
          await persistOutbound(linkMsg, 'GUEST_LIST_LINK');
        }

        return res.sendStatus(200);
      }

      /** Coletar dados ou outras intenções — resposta conversacional */
      if (interpreted.suggested_reply) {
        const sendResult = await sendMessage(senderNumber, interpreted.suggested_reply);
        console.log('[WhatsApp webhook] envio automático:', sendResult);
        await persistOutbound(interpreted.suggested_reply, interpreted.action || 'COLLECT_DATA');
      }
    } catch (error) {
      console.error('[WhatsApp webhook] erro ao processar mensagem (IA/envio):', error.message);
    }

    return res.sendStatus(200);
  });

  return router;
};
