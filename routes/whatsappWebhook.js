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

function extractEstablishmentToken(text) {
  const normalizedText = String(text || '');
  const match = normalizedText.match(/#EST[_:-]([A-Za-z0-9_-]{1,80})/i);
  if (!match) return null;
  const rawToken = String(match[1] || '').trim();
  if (!rawToken) return null;
  const cleanedText = normalizedText
    .replace(match[0], ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return {
    rawToken,
    marker: match[0],
    cleanedText,
  };
}

async function resolveEstablishmentByToken(pool, token) {
  if (!token) return null;
  const numericId = Number(token);
  if (Number.isFinite(numericId) && numericId > 0) {
    const byId = await pool.query(
      `SELECT id, name, slug
       FROM places
       WHERE id = $1
       LIMIT 1`,
      [numericId]
    );
    return byId.rows[0] || null;
  }

  const bySlug = await pool.query(
    `SELECT id, name, slug
     FROM places
     WHERE LOWER(slug) = LOWER($1)
     LIMIT 1`,
    [String(token).trim()]
  );
  return bySlug.rows[0] || null;
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
    io.to('whatsapp_inbox').emit('whatsapp_inbox_update', {
      type: payload?.type || 'refresh',
    });
  }
}

const MISSING_FIELD_LABELS_PT = {
  establishment_id: 'estabelecimento',
  client_name: 'nome completo',
  client_email: 'e-mail',
  data_nascimento: 'data de nascimento',
  quantidade_convidados: 'quantidade de pessoas',
  reservation_date: 'data da reserva',
  reservation_time: 'horário',
  area_id: 'área',
};

function formatMissingFieldsForUser(missingKeys) {
  return (missingKeys || [])
    .map((k) => MISSING_FIELD_LABELS_PT[k] || k)
    .join(', ');
}

/** Evita enviar texto da IA que promete reserva já registrada quando ainda não foi. */
function looksLikePrematureBookingPromise(text) {
  if (!text || typeof text !== 'string') return false;
  return /quase pronta|está pronta|já está|ja esta|confirmad[ao]|registrad[ao]|reserva (foi|esta|está)|garantid[ao]|no sistema\b/i.test(
    text
  );
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

function applyBusinessRulesToReservationParams(params) {
  const establishmentId = Number(params?.establishment_id);
  const quantidade = Number(params?.quantidade_convidados);

  // Pracinha do Seu Justino (ID 8): aceita até 60 no total.
  if (establishmentId === 8 && Number.isFinite(quantidade) && quantidade > 60) {
    return {
      ok: false,
      message:
        "Na Pracinha do Seu Justino conseguimos registrar reservas para até 60 pessoas por vez. Se desejar, posso ajustar para até 60 agora ou chamar o time para um formato especial.",
    };
  }

  return { ok: true };
}

function extractInterpretedEstablishmentId(interpreted) {
  const raw = interpreted?.params?.establishment_id;
  const id = Number(raw);
  if (!Number.isFinite(id) || id <= 0) return null;
  return id;
}

function parsePtBrDateFromText(text) {
  const raw = String(text || '');
  const normalized = raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth() + 1;
  const currentDay = today.getDate();

  const buildFutureDate = (day, month, yearCandidate = null) => {
    let year = yearCandidate;
    if (!year) {
      year = currentYear;
      if (month < currentMonth || (month === currentMonth && day < currentDay)) {
        year += 1;
      }
    } else if (year < 100) {
      year += 2000;
    }
    const iso = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return { iso, day, month, year };
  };

  const match = raw.match(/\b(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{2,4}))?\b/);
  if (match) {
    const day = Number(match[1]);
    const month = Number(match[2]);
    const year = match[3] ? Number(match[3]) : null;
    if (
      Number.isFinite(day) &&
      Number.isFinite(month) &&
      day >= 1 &&
      day <= 31 &&
      month >= 1 &&
      month <= 12
    ) {
      return buildFutureDate(day, month, year);
    }
  }

  // Ex.: "hoje", "amanhã", "amanha"
  if (/\bhoje\b/i.test(normalized)) {
    return buildFutureDate(currentDay, currentMonth, currentYear);
  }
  if (/\bamanha\b/i.test(normalized)) {
    const d = new Date(today);
    d.setDate(d.getDate() + 1);
    return buildFutureDate(d.getDate(), d.getMonth() + 1, d.getFullYear());
  }

  // Ex.: "dia 3" -> próxima ocorrência desse dia no calendário.
  const dayOnly = raw.match(/\bdia\s+(\d{1,2})\b/i);
  if (dayOnly) {
    const day = Number(dayOnly[1]);
    if (Number.isFinite(day) && day >= 1 && day <= 31) {
      let month = currentMonth;
      let year = currentYear;
      if (day < currentDay) {
        month += 1;
        if (month > 12) {
          month = 1;
          year += 1;
        }
      }
      return buildFutureDate(day, month, year);
    }
  }

  return null;
}

async function loadDateOverride(pool, establishmentId, isoDate) {
  try {
    const result = await pool.query(
      `SELECT override_date::text, is_open, start_time::text, end_time::text, second_start_time::text, second_end_time::text, note
         FROM restaurant_reservation_date_overrides
        WHERE establishment_id = $1
          AND override_date = $2
        LIMIT 1`,
      [establishmentId, isoDate]
    );
    return result.rows[0] || null;
  } catch (_e) {
    return null;
  }
}

function buildOverrideNotice(overrideRow) {
  if (!overrideRow) return null;
  const isoDate = String(overrideRow.override_date || '').slice(0, 10);
  const [year, month, day] = isoDate.split('-');
  const date = year && month && day ? `${day}-${month}-${year}` : isoDate;
  if (!overrideRow.is_open) {
    return `Para ${date}, temos exceção de agenda: a casa estará fechada.`;
  }
  const windows = [];
  if (overrideRow.start_time && overrideRow.end_time) {
    windows.push(`${String(overrideRow.start_time).slice(0, 5)}-${String(overrideRow.end_time).slice(0, 5)}`);
  }
  if (overrideRow.second_start_time && overrideRow.second_end_time) {
    windows.push(
      `${String(overrideRow.second_start_time).slice(0, 5)}-${String(overrideRow.second_end_time).slice(0, 5)}`
    );
  }
  const notePart = overrideRow.note ? ` Obs: ${String(overrideRow.note)}` : '';
  if (windows.length === 0) {
    return `Para ${date}, temos exceção de agenda cadastrada.${notePart}`;
  }
  return `Para ${date}, temos horário especial: ${windows.join(' | ')}.${notePart}`;
}

function mergeReplyWithOverrideNotice(replyText, notice) {
  const base = String(replyText || '').trim();
  if (!notice) return base;
  if (!base) return notice;
  if (base.toLowerCase().includes(String(notice).toLowerCase())) return base;
  return `${base}\n\n${notice}`;
}

function getDefaultOperatingWindowsByEstablishment(establishmentId, isoDate) {
  const id = Number(establishmentId);
  const date = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) return [];
  const weekday = date.getDay();

  if (id === 9) {
    if (weekday >= 2 && weekday <= 4) return ['18:00-22:30'];
    if (weekday === 5 || weekday === 6) return ['12:00-16:00', '17:00-22:30'];
    if (weekday === 0) return ['12:00-16:00', '17:00-20:30'];
    return [];
  }

  if (id === 1 || id === 8) {
    if (weekday >= 2 && weekday <= 4) return ['18:00-01:00'];
    if (weekday === 5 || weekday === 6) return ['18:00-03:30'];
    if (weekday === 0) return ['12:00-21:00'];
    return [];
  }

  return [];
}

async function loadOperatingWindowsForDate(pool, establishmentId, isoDate) {
  if (!establishmentId || !isoDate) return [];
  try {
    const override = await pool.query(
      `SELECT is_open, start_time::text, end_time::text, second_start_time::text, second_end_time::text
         FROM restaurant_reservation_date_overrides
        WHERE establishment_id = $1
          AND override_date = $2
        LIMIT 1`,
      [establishmentId, isoDate]
    );
    if (override.rows.length > 0) {
      const row = override.rows[0];
      if (!row.is_open) return [];
      const windows = [];
      if (row.start_time && row.end_time) {
        windows.push(`${String(row.start_time).slice(0, 5)}-${String(row.end_time).slice(0, 5)}`);
      }
      if (row.second_start_time && row.second_end_time) {
        windows.push(
          `${String(row.second_start_time).slice(0, 5)}-${String(row.second_end_time).slice(0, 5)}`
        );
      }
      if (windows.length > 0) return windows;
      return getDefaultOperatingWindowsByEstablishment(establishmentId, isoDate);
    }

    const date = new Date(`${isoDate}T00:00:00`);
    if (Number.isNaN(date.getTime())) return [];
    const weekday = date.getDay();
    const weekly = await pool.query(
      `SELECT is_open, start_time::text, end_time::text, second_start_time::text, second_end_time::text
         FROM restaurant_reservation_operating_hours
        WHERE establishment_id = $1
          AND weekday = $2
        LIMIT 1`,
      [establishmentId, weekday]
    );
    if (weekly.rows.length === 0 || !weekly.rows[0].is_open) {
      return getDefaultOperatingWindowsByEstablishment(establishmentId, isoDate);
    }
    const row = weekly.rows[0];
    const windows = [];
    if (row.start_time && row.end_time) {
      windows.push(`${String(row.start_time).slice(0, 5)}-${String(row.end_time).slice(0, 5)}`);
    }
    if (row.second_start_time && row.second_end_time) {
      windows.push(
        `${String(row.second_start_time).slice(0, 5)}-${String(row.second_end_time).slice(0, 5)}`
      );
    }
    if (windows.length > 0) return windows;
    return getDefaultOperatingWindowsByEstablishment(establishmentId, isoDate);
  } catch (_e) {
    return getDefaultOperatingWindowsByEstablishment(establishmentId, isoDate);
  }
}

function looksLikeAvailabilityQuestion(text) {
  const t = String(text || '').toLowerCase();
  return /hor[aá]ri|que horas|dispon[ií]vel|disponibilidade/.test(t);
}

function looksLikeMusicQuestion(text) {
  const t = String(text || '').toLowerCase();
  return /m[uú]sica|programa[cç][aã]o|dj|banda|show|estilo/.test(t);
}

function looksLikeMenuQuestion(text) {
  const t = String(text || '').toLowerCase();
  return /card[aá]pio|menu/.test(t);
}

function looksLikeParkingQuestion(text) {
  const t = String(text || '').toLowerCase();
  return /estacionamento|valet|parar o carro/.test(t);
}

function detectEstablishmentFromText(text, establishments = []) {
  const normalized = String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (!normalized) return null;
  for (const est of establishments) {
    const name = String(est?.name || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    if (!name) continue;
    if (normalized.includes(name)) {
      const id = Number(est.id);
      if (Number.isFinite(id) && id > 0) return id;
    }
  }
  return null;
}

function normalizeCanonicalEstablishmentId(establishmentIdRaw, establishmentNameRaw = '') {
  const establishmentId = Number(establishmentIdRaw);
  const hint = String(establishmentNameRaw || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

  const highlineEnvId = Number(process.env.HIGHLINE_ESTABLISHMENT_ID || '');
  if (hint.includes('reserva rooftop') || hint.includes('rooftop')) return 9;
  if (hint.includes('pracinha')) return 8;
  if (hint.includes('seu justino') || hint.includes('justino')) return 1;
  if (hint.includes('highline') || hint.includes('high line')) {
    if (Number.isFinite(highlineEnvId) && highlineEnvId > 0) return highlineEnvId;
    if (Number.isFinite(establishmentId) && establishmentId > 0) return establishmentId;
  }
  return Number.isFinite(establishmentId) && establishmentId > 0 ? establishmentId : null;
}

function parseDateFromHistory(messageHistory) {
  const list = Array.isArray(messageHistory) ? messageHistory : [];
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const msg = list[i];
    if (msg?.role !== 'user') continue;
    const parsed = parsePtBrDateFromText(msg?.content || '');
    if (parsed?.iso) return parsed;
  }
  return null;
}

function getCardapioUrlByEstablishmentId(establishmentId) {
  const id = Number(establishmentId);
  const map = {
    7: 'https://www.agilizaiapp.com.br/cardapio/highline',
    4: 'https://www.agilizaiapp.com.br/cardapio/ohfregues',
    8: 'https://www.agilizaiapp.com.br/cardapio/pracinha',
    9: 'https://www.agilizaiapp.com.br/cardapio/reserva-rooftop',
    1: 'https://www.agilizaiapp.com.br/cardapio/justino',
  };
  return map[id] || null;
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
    const incomingMessageText = extractMessageText(payload);
    const senderNumber = extractSenderNumber(payload);

    if (!incomingMessageText) {
      console.log('[WhatsApp webhook] Nenhuma mensagem de texto encontrada no payload.');
      return res.sendStatus(200);
    }

    if (!senderNumber) {
      console.warn('[WhatsApp webhook] Remetente ausente; não é possível responder ou persistir.');
      return res.sendStatus(200);
    }

    const establishmentToken = extractEstablishmentToken(incomingMessageText);
    const messageText =
      establishmentToken?.cleanedText || String(incomingMessageText || '').trim();

    let linkedEstablishment = null;
    if (establishmentToken?.rawToken) {
      try {
        linkedEstablishment = await resolveEstablishmentByToken(pool, establishmentToken.rawToken);
        if (!linkedEstablishment) {
          console.warn('[WhatsApp webhook] token de estabelecimento não encontrado:', {
            token: establishmentToken.rawToken,
          });
        }
      } catch (tokenError) {
        console.warn('[WhatsApp webhook] falha ao resolver token de estabelecimento:', {
          token: establishmentToken.rawToken,
          error: tokenError.message,
        });
      }
    }

    let conversation = null;
    let inboundRow = null;
    let usedPersistence = false;

    try {
      const contactName = extractContactName(payload);
      conversation = await inbox.upsertConversation(pool, {
        waId: senderNumber,
        contactName,
        establishmentId: linkedEstablishment?.id || null,
      });
      inboundRow = await inbox.insertMessage(pool, {
        conversationId: conversation.id,
        direction: 'inbound',
        body: messageText,
        rawPayload: payload,
      });
      try {
        await inbox.upsertContact(pool, {
          waId: senderNumber,
          contactName,
          lastEstablishmentId: linkedEstablishment?.id || null,
        });
      } catch (contactError) {
        console.warn('[WhatsApp webhook] CRM de contatos indisponível:', contactError.message);
      }
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

    let catalog = {
      establishmentsBlock: '',
      areasBlock: '',
      establishmentRulesBlock: '',
      dateOverridesBlock: '',
    };
    try {
      catalog = await loadAiCatalog(pool);
    } catch (e) {
      console.warn('[WhatsApp webhook] catálogo IA:', e.message);
    }

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
          lockedEstablishmentId:
            linkedEstablishment?.id ||
            (Number.isFinite(Number(conversation?.establishment_id))
              ? Number(conversation.establishment_id)
              : null),
          lockedEstablishmentName:
            linkedEstablishment?.name ||
            (conversation?.establishment_name ? String(conversation.establishment_name) : null),
        },
      });
      console.log('[WhatsApp webhook] interpretação IA:', interpreted);

      const lockedEstablishmentId =
        linkedEstablishment?.id ||
        (Number.isFinite(Number(conversation?.establishment_id))
          ? Number(conversation.establishment_id)
          : null);
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

      const interpretedEstablishmentId = extractInterpretedEstablishmentId(interpreted);
      if (interpretedEstablishmentId) {
        try {
          conversation = await inbox.setConversationEstablishment(
            pool,
            senderNumber,
            interpretedEstablishmentId
          );
        } catch (scopeError) {
          console.warn('[WhatsApp webhook] não foi possível atualizar establishment da conversa:', scopeError.message);
        }
      }

      const resolvedEstablishmentId =
        interpretedEstablishmentId ||
        detectEstablishmentFromText(messageText, catalog.establishments || []) ||
        detectEstablishmentFromText(
          messageHistory.map((m) => m.content).join(' '),
          catalog.establishments || []
        ) ||
        linkedEstablishment?.id ||
        (Number.isFinite(Number(conversation?.establishment_id))
          ? Number(conversation.establishment_id)
          : null);
      const resolvedEstablishmentName =
        (catalog.establishments || []).find(
          (e) => Number(e.id) === Number(resolvedEstablishmentId)
        )?.name ||
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
        const override = await loadDateOverride(pool, canonicalEstablishmentId, parsedDate.iso);
        dateOverrideNotice = buildOverrideNotice(override);
      }
      const availabilityQuestion = looksLikeAvailabilityQuestion(messageText);
      const musicQuestion = looksLikeMusicQuestion(messageText);
      const menuQuestion = looksLikeMenuQuestion(messageText);
      const parkingQuestion = looksLikeParkingQuestion(messageText);

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
        const handoffReply = mergeReplyWithOverrideNotice(
          interpreted.suggested_reply,
          dateOverrideNotice
        );
        const sendResult = await sendMessage(senderNumber, handoffReply);
        console.log('[WhatsApp webhook] envio automático (handoff):', sendResult);
        await persistOutbound(handoffReply, 'falar_com_humano');
        return res.sendStatus(200);
      }

      /** Menor de idade — mensagem educada */
      if (interpreted.action === 'REFUSE_MINOR' && interpreted.suggested_reply) {
        const minorReply = mergeReplyWithOverrideNotice(
          interpreted.suggested_reply,
          dateOverrideNotice
        );
        await sendMessage(senderNumber, minorReply);
        await persistOutbound(minorReply, 'REFUSE_MINOR');
        return res.sendStatus(200);
      }

      /** Processar reserva no banco */
      if (interpreted.action === 'PROCESS_RESERVATION') {
        const params = interpreted.params || {};
        const businessValidation = applyBusinessRulesToReservationParams(params);
        if (!businessValidation.ok) {
          await sendMessage(senderNumber, businessValidation.message);
          await persistOutbound(businessValidation.message, 'COLLECT_DATA');
          return res.sendStatus(200);
        }
        const missing = validateProcessReservationParams(params);

        if (missing.length > 0) {
          const humanMissing = formatMissingFieldsForUser(missing);
          let fallback = `Para registrar sua reserva no sistema, ainda preciso de: ${humanMissing}. Pode me enviar?`;
          const sr = interpreted.suggested_reply || '';
          if (sr && !looksLikePrematureBookingPromise(sr)) {
            fallback = `${fallback}\n\n${sr}`;
          } else if (sr && looksLikePrematureBookingPromise(sr)) {
            console.warn(
              '[WhatsApp webhook] IA sugeriu PROCESS_RESERVATION incompleto com texto enganoso; usando só lista de faltantes.'
            );
          }
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

        const reservationEstablishmentId = Number(
          reservationRow.establishment_id || params.establishment_id || interpretedEstablishmentId
        );
        if (Number.isFinite(reservationEstablishmentId) && reservationEstablishmentId > 0) {
          try {
            conversation = await inbox.setConversationEstablishment(
              pool,
              senderNumber,
              reservationEstablishmentId
            );
          } catch (scopeError) {
            console.warn(
              '[WhatsApp webhook] não foi possível vincular estabelecimento da conversa após reserva:',
              scopeError.message
            );
          }
        }

        try {
          await inbox.upsertContact(pool, {
            waId: senderNumber,
            contactName: reservationRow.client_name || params.client_name || extractContactName(payload),
            clientEmail: reservationRow.client_email || params.client_email || null,
            birthDate: params.data_nascimento || null,
            lastEstablishmentId:
              Number.isFinite(reservationEstablishmentId) && reservationEstablishmentId > 0
                ? reservationEstablishmentId
                : null,
            lastReservationId: reservationRow.id || null,
          });
        } catch (contactError) {
          console.warn('[WhatsApp webhook] não foi possível atualizar contato CRM:', contactError.message);
        }

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

        // Regra de transparência comercial para Pracinha: acima de 6, só 6 assentos garantidos.
        const isPracinha = Number(params?.establishment_id) === 8;
        const partySize = Number(params?.quantidade_convidados);
        if (isPracinha && Number.isFinite(partySize) && partySize > 6) {
          confirmText +=
            "\n\nImportante para alinhar certinho: na Pracinha, garantimos até 6 lugares sentados na reserva; acima disso, o restante do grupo é acomodado no fluxo da casa.";
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
        let replyText = interpreted.suggested_reply;
        if (
          (interpreted.action === 'COLLECT_DATA' || !interpreted.action) &&
          looksLikePrematureBookingPromise(replyText)
        ) {
          const mf =
            Array.isArray(interpreted.missing_fields) && interpreted.missing_fields.length
              ? ` Para registrar no sistema, ainda preciso de: ${formatMissingFieldsForUser(interpreted.missing_fields)}.`
              : ' Para registrar no sistema, ainda faltam alguns dados.';
          replyText =
            `Só pra alinhar: sua reserva ainda não foi salva aqui.${mf} Me envia o que faltar que eu fecho o cadastro na hora, combinado?`;
          console.warn('[WhatsApp webhook] Substituída suggested_reply que prometia reserva sem salvar.');
        }
        replyText = mergeReplyWithOverrideNotice(replyText, dateOverrideNotice);
        if (musicQuestion && canonicalEstablishmentId && parsedDate?.iso) {
          const [year, month, day] = parsedDate.iso.split('-');
          const displayDate = `${day}-${month}-${year}`;
          const estName =
            (catalog.establishments || []).find((e) => Number(e.id) === Number(canonicalEstablishmentId))
              ?.name || 'a casa';
          replyText =
            `Para ${displayDate} no ${estName}, a programação musical pode variar conforme evento e operação do dia.\n\nSe quiser, eu já te passo os horários disponíveis e deixo sua reserva encaminhada.`;
        }
        if (menuQuestion) {
          const menuUrl = getCardapioUrlByEstablishmentId(canonicalEstablishmentId);
          if (menuUrl) {
            replyText =
              `Perfeito! Aqui está o cardápio: ${menuUrl}\n\nSe quiser, já te passo os melhores horários e deixo sua reserva encaminhada.`;
          } else {
            replyText =
              'Claro! Eu te envio o cardápio da casa escolhida. Me confirma qual estabelecimento você quer, que já te mando e te ajudo com a reserva.';
          }
        }
        if (parkingQuestion) {
          replyText =
            'Estacionamento pode variar por casa e por dia/evento. Se você me disser a data e o estabelecimento, já te passo a melhor orientação e deixo sua reserva encaminhada.';
        }
        if (availabilityQuestion && canonicalEstablishmentId && parsedDate?.iso) {
          const windows = await loadOperatingWindowsForDate(
            pool,
            canonicalEstablishmentId,
            parsedDate.iso
          );
          const [year, month, day] = parsedDate.iso.split('-');
          const displayDate = `${day}-${month}-${year}`;
          if (windows.length > 0) {
            replyText =
              `No dia ${displayDate}, os horários disponíveis são: ${windows.join(' | ')}.\n\nSe quiser, já deixo sua reserva encaminhada. Me fala só o horário que prefere e quantas pessoas serão.`;
          } else {
            replyText =
              `No dia ${displayDate}, não temos janela de reserva disponível no sistema.\n\nSe quiser, eu te sugiro o melhor dia/horário alternativo e já encaminho sua reserva.`;
          }
        } else if (availabilityQuestion && !parsedDate?.iso) {
          replyText =
            'Consigo verificar agora para você. Me fala só a data desejada (ex.: hoje, amanhã ou DD/MM) que eu já te passo os horários disponíveis e encaminho a reserva.';
        } else if (availabilityQuestion && !canonicalEstablishmentId) {
          replyText =
            'Consigo verificar os horários disponíveis agora. Me confirma apenas o estabelecimento que você quer, que já te passo as opções e encaminho sua reserva.';
        }
        const sendResult = await sendMessage(senderNumber, replyText);
        console.log('[WhatsApp webhook] envio automático:', sendResult);
        await persistOutbound(replyText, interpreted.action || 'COLLECT_DATA');
      }
    } catch (error) {
      console.error('[WhatsApp webhook] erro ao processar mensagem (IA/envio):', error.message);
    }

    return res.sendStatus(200);
  });

  return router;
};
