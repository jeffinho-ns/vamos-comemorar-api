'use strict';

const inbox = require('../whatsappInboxRepository');
const { getWameApiKey } = require('./wameConfig');
const { instanceIdFromStoredPayload, requestJson } = require('./wameService');

const jobs = new Map();

function messageTimestamp(value) {
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

function customerPhone(chatId) {
  const digits = String(chatId || '').replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 20) return null;
  if (digits === '551123050938' || digits === '551152003650') return null;
  return digits;
}

async function findInstanceId(pool, establishmentId) {
  const result = await pool.query(
    `SELECT m.raw_payload
       FROM whatsapp_messages m
       JOIN whatsapp_conversations c ON c.id = m.conversation_id
      WHERE c.establishment_id = $1
        AND m.raw_payload IS NOT NULL
      ORDER BY m.created_at DESC
      LIMIT 30`,
    [establishmentId]
  );
  for (const row of result.rows) {
    const id = instanceIdFromStoredPayload(row.raw_payload);
    if (id) return id;
  }
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
  const conversation = await inbox.upsertConversation(pool, {
    waId: phone,
    contactName: name,
    establishmentId,
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
    const createdAt = messageTimestamp(message.timestamp);
    if (!wameId || !body || !createdAt) continue;
    if (await inbox.hasMessageWithWameId(pool, conversation.id, wameId)) continue;
    await inbox.insertHistoryMessage(pool, {
      conversationId: conversation.id,
      direction: message.from_me === true ? 'outbound' : 'inbound',
      body,
      messageType: String(message.type || 'text').slice(0, 32),
      createdAt,
      rawPayload: {
        source: 'wame_history',
        instance: instanceId,
        wame_message_id: wameId,
        from_me: message.from_me === true,
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
  job.status = 'done';
  job.finishedAt = new Date().toISOString();
  console.log(
    `[wameHistory] casa ${establishmentId} conversas=${job.done}/${job.total} mensagens=${inserted} falhas=${failed}`
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
