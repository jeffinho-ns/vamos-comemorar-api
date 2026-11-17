'use strict';

const inbox = require('../whatsappInboxRepository');
const { getWameApiKey } = require('./wameConfig');
const { isHouseDisplayPhone } = require('./wameHouse');
const { requestJson } = require('./wameService');

const jobs = new Map();

function messageTimestamp(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === 'string' && /[T-]/.test(value)) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  const ms = n > 1e12 ? n : n * 1000;
  const date = new Date(ms);
  return Number.isNaN(date.getTime()) ? null : date;
}

function messageBody(message) {
  const text = message?.text;
  if (typeof text === 'string' && text.trim()) return text.trim().slice(0, 4000);
  if (text && typeof text.body === 'string' && text.body.trim()) {
    return text.body.trim().slice(0, 4000);
  }
  const type = String(message?.type || '').trim();
  if (!type || type === 'text') return '';
  return `[${type}]`;
}

function contactName(chat, phone) {
  const name = String(chat?.contact?.name || '').trim();
  if (!name) return null;
  const digits = name.replace(/\D/g, '');
  if (digits && digits === phone) return null;
  if (/^\+?[\d\s()-]+$/.test(name)) return null;
  return name.slice(0, 255);
}

function isFromMe(message) {
  return message?.from_me === true || message?.fromMe === true;
}

function customerPhone(chatId) {
  const digits = String(chatId || '').replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 20) return null;
  if (isHouseDisplayPhone(digits)) return null;
  return digits;
}

async function findInstanceId(pool, establishmentId) {
  const { findEstablishmentWameInstanceId } = require('./wameService');
  const remembered = await findEstablishmentWameInstanceId(pool, establishmentId);
  if (remembered) return remembered;

  const byEstEnv = String(process.env.WAME_INSTANCE_BY_ESTABLISHMENT || '').trim();
  if (byEstEnv) {
    try {
      const map = JSON.parse(byEstEnv);
      const keyed = map?.[String(establishmentId)] || map?.[establishmentId];
      if (keyed && /^[a-z0-9]{8,40}$/i.test(String(keyed))) return String(keyed);
    } catch (_) {
      /* ignore JSON inválido */
    }
  }

  // Fallback só quando há uma única instância no Render.
  // Com várias casas Wame, passe instance_id no POST /wame/import-history.
  return getWameApiKey() || null;
}

async function listChatMessages(instanceId, chatId, maxPages = 5) {
  const messages = [];
  let page = 1;
  while (page <= maxPages) {
    const payload = await requestJson(
      instanceId,
      `chat/messages?chatId=${encodeURIComponent(chatId)}&page=${page}&limit=50`
    );
    const batch = Array.isArray(payload.messages) ? payload.messages : [];
    messages.push(...batch);
    if (!payload.pagination?.hasMore || batch.length === 0) break;
    page += 1;
  }
  return messages;
}

async function importChat(pool, { chat, establishmentId, instanceId, maxPages = 5 }) {
  const phone = customerPhone(chat.chatId);
  if (!phone) return { skipped: true };
  const name = contactName(chat, phone);
  // touchUpdatedAt:false — histórico não pode subir conversa antiga no topo do inbox
  // nem parecer "ativa" sem inbound real nas últimas 24h.
  const conversation = await inbox.upsertConversation(pool, {
    waId: phone,
    contactName: name,
    establishmentId,
    touchUpdatedAt: false,
  });
  await inbox.upsertContact(pool, {
    waId: phone,
    contactName: name,
    lastEstablishmentId: establishmentId,
    grantMarketingOptIn: false,
    sourceChannel: 'WHATSAPP',
  });

  const messages = await listChatMessages(instanceId, chat.chatId, maxPages);
  let inserted = 0;
  for (const message of messages) {
    const wameId = message?.id ? String(message.id) : '';
    const body = messageBody(message);
    const createdAt =
      messageTimestamp(message.timestamp) ||
      messageTimestamp(message.messageTimestamp) ||
      messageTimestamp(message.date) ||
      messageTimestamp(message.created_at);
    if (!wameId || !body || !createdAt) continue;
    if (await inbox.hasMessageWithWameId(pool, conversation.id, wameId)) continue;
    const fromMe = isFromMe(message);
    await inbox.insertHistoryMessage(pool, {
      conversationId: conversation.id,
      direction: fromMe ? 'outbound' : 'inbound',
      body,
      messageType: String(message.type || 'text').slice(0, 32),
      createdAt,
      rawPayload: {
        source: 'wame_history',
        instance: instanceId,
        wame_message_id: wameId,
        from_me: fromMe,
        status: message.status || null,
      },
    });
    inserted += 1;
  }
  await inbox.alignConversationActivity(pool, conversation.id);
  return { skipped: false, inserted };
}

async function runImport(pool, { establishmentId, instanceId, latestOnly = false }) {
  const job = jobs.get(establishmentId);
  const listed = await requestJson(instanceId, 'chat?provider=whatsapp');
  const chats = Array.isArray(listed.chats) ? listed.chats : [];
  job.total = chats.length;
  let inserted = 0;
  let failed = 0;
  const maxPages = latestOnly ? 1 : 5;
  for (const chat of chats) {
    if (job.cancelled) break;
    try {
      const result = await importChat(pool, { chat, establishmentId, instanceId, maxPages });
      if (!result.skipped) inserted += result.inserted;
    } catch (error) {
      failed += 1;
      job.lastError = error.message;
    }
    job.done += 1;
    job.inserted = inserted;
    job.failed = failed;
  }
  // Corrige conversas desta casa que o import antigo empurrou com updated_at=NOW()
  // sem inbound recente (parece ativa, mas o painel bloqueia por janela 24h).
  try {
    const fixed = await pool.query(
      `UPDATE whatsapp_conversations c
          SET updated_at = COALESCE(sub.last_inbound, sub.last_any)
         FROM (
           SELECT m.conversation_id,
                  MAX(m.created_at) FILTER (WHERE m.direction = 'inbound') AS last_inbound,
                  MAX(m.created_at) AS last_any
             FROM whatsapp_messages m
             JOIN whatsapp_conversations cx ON cx.id = m.conversation_id
            WHERE cx.establishment_id = $1
            GROUP BY m.conversation_id
         ) sub
        WHERE c.id = sub.conversation_id
          AND c.establishment_id = $1
          AND COALESCE(sub.last_inbound, sub.last_any) IS NOT NULL
          AND c.updated_at > COALESCE(sub.last_inbound, sub.last_any) + INTERVAL '1 minute'`,
      [establishmentId]
    );
    job.realigned = fixed.rowCount || 0;
  } catch (error) {
    console.warn('[wameHistory] realinhamento pós-import:', error.message);
  }

  job.status = 'done';
  job.finishedAt = new Date().toISOString();
  console.log(
    `[wameHistory] casa ${establishmentId} conversas=${job.done}/${job.total} mensagens=${inserted} falhas=${failed} realinhadas=${job.realigned || 0}`
  );
}

function startWameHistoryImport(pool, { establishmentId, instanceId, latestOnly = false }) {
  const current = jobs.get(establishmentId);
  if (current && current.status === 'running') return current;
  const job = {
    status: 'running',
    establishmentId,
    total: 0,
    done: 0,
    inserted: 0,
    failed: 0,
    lastError: null,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    cancelled: false,
    latestOnly: latestOnly === true,
  };
  jobs.set(establishmentId, job);
  setImmediate(() => {
    runImport(pool, { establishmentId, instanceId, latestOnly: job.latestOnly }).catch((error) => {
      job.status = 'error';
      job.lastError = error.message;
      job.finishedAt = new Date().toISOString();
      console.error('[wameHistory] falha:', error.message);
    });
  });
  return job;
}

function getWameHistoryImport(establishmentId) {
  return jobs.get(establishmentId) || null;
}

module.exports = {
  messageBody,
  messageTimestamp,
  contactName,
  customerPhone,
  findInstanceId,
  startWameHistoryImport,
  getWameHistoryImport,
};
