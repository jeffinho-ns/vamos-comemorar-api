const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const http = require('http');
const { createFunnelMemoryPool } = require('../helpers/funnelMemoryPool');

const STEP_RESPONSES = [
  {
    action: 'COLLECT_DATA',
    params: { establishment_id: 1 },
    missing_fields: ['reservation_date', 'reservation_time', 'quantidade_convidados', 'area_id', 'client_name', 'client_email', 'data_nascimento'],
    suggested_reply: 'Qual data você prefere?',
  },
  {
    action: 'COLLECT_DATA',
    params: { reservation_date: '2026-12-20' },
    missing_fields: ['reservation_time', 'quantidade_convidados', 'area_id', 'client_name', 'client_email', 'data_nascimento'],
    suggested_reply: 'Qual horário você prefere?',
  },
  {
    action: 'COLLECT_DATA',
    params: { reservation_time: '20:30' },
    missing_fields: ['quantidade_convidados', 'area_id', 'client_name', 'client_email', 'data_nascimento'],
    suggested_reply: 'Para quantas pessoas?',
  },
  {
    action: 'COLLECT_DATA',
    params: { quantidade_convidados: 4 },
    missing_fields: ['area_id', 'client_name', 'client_email', 'data_nascimento'],
    suggested_reply: 'Qual área você prefere?',
  },
  {
    action: 'COLLECT_DATA',
    params: { area_id: 10 },
    missing_fields: ['client_name', 'client_email', 'data_nascimento'],
    suggested_reply: 'Me envie nome, e-mail e data de nascimento.',
  },
  {
    action: 'COLLECT_DATA',
    params: {
      client_name: 'Maria Silva',
      client_email: 'maria@example.com',
      data_nascimento: '1990-05-10',
    },
    missing_fields: [],
    suggested_reply: 'Posso registrar a reserva agora?',
  },
  {
    action: 'PROCESS_RESERVATION',
    params: {},
    missing_fields: [],
    suggested_reply: 'Reserva confirmada.',
  },
];

function buildWebhookPayload(waId, text, wamid) {
  return {
    entry: [
      {
        changes: [
          {
            value: {
              contacts: [{ wa_id: waId, profile: { name: 'Maria Silva' } }],
              messages: [
                {
                  id: wamid,
                  from: waId,
                  text: { body: text },
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

test('webhook POST responde 200 e processa turno inline', async () => {
  const dedup = require('../../services/whatsappMessageDedupRepository');
  const originalDedup = dedup.claimInboundMessage;
  dedup.claimInboundMessage = async () => ({ duplicate: false });

  const queue = require('../../infrastructure/queue/redisConnection');
  const originalQueueEnabled = queue.isQueueEnabled;
  queue.isQueueEnabled = () => false;

  const lock = require('../../services/conversationLock');
  const originalLock = lock.withConversationLock;
  lock.withConversationLock = async (_pool, _waId, fn) => fn();

  const engine = require('../../services/conversationEngine/processInboundTurn');
  const originalTurn = engine.processInboundTurn;
  let processed = false;
  engine.processInboundTurn = async () => {
    processed = true;
  };

  const router = require('../../routes/whatsappWebhook')(null, { get: () => null });
  const app = express();
  app.use(express.json());
  app.use('/webhook', router);

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();

  try {
    const payload = buildWebhookPayload('5511999999999', 'oi', 'wamid-contract-1');
    const response = await fetch(`http://127.0.0.1:${port}/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    assert.equal(response.status, 200);
    assert.equal(processed, true);
  } finally {
    dedup.claimInboundMessage = originalDedup;
    queue.isQueueEnabled = originalQueueEnabled;
    lock.withConversationLock = originalLock;
    engine.processInboundTurn = originalTurn;
    await new Promise((resolve) => server.close(resolve));
  }
});

test('funil principal avança de greeting até completed sem OpenAI real', async () => {
  const pool = createFunnelMemoryPool();
  const waId = '5511888777666';
  const conversationId = 1;
  pool.query(
    `INSERT INTO whatsapp_conversations (wa_id, contact_name, establishment_id)
     VALUES ($1, $2, $3)`,
    [waId, 'Maria Silva', null]
  );

  const inbox = require('../../services/whatsappInboxRepository');
  const originalUpsert = inbox.upsertConversation;
  const originalInsert = inbox.insertMessage;
  const originalUpsertContact = inbox.upsertContact;
  const originalGetRecent = inbox.getRecentMessagesForContext;
  const originalHumanTakeover = inbox.isHumanTakeoverActive;
  const originalUpdateInbound = inbox.updateInboundAiFields;
  const originalGetConversation = inbox.getConversationByWaId;
  const originalSetEstablishment = inbox.setConversationEstablishment;

  inbox.upsertConversation = async () => ({
    id: conversationId,
    wa_id: waId,
    establishment_id: null,
    establishment_name: 'Estabelecimento Teste',
  });
  inbox.insertMessage = async (_poolRef, data) => ({
    id: 1,
    conversation_id: data.conversationId,
    direction: data.direction,
    body: data.body,
  });
  inbox.upsertContact = async () => ({ id: 1 });
  inbox.getRecentMessagesForContext = async (_poolRef, _conversationId) => [
    { direction: 'inbound', body: 'oi' },
  ];
  inbox.isHumanTakeoverActive = async () => false;
  inbox.updateInboundAiFields = async () => {};
  inbox.getConversationByWaId = async () => ({ id: conversationId, wa_id: waId });
  inbox.setConversationEstablishment = async () => ({
    id: conversationId,
    wa_id: waId,
    establishment_id: 1,
    establishment_name: 'Estabelecimento Teste',
  });

  const aiService = require('../../services/aiService');
  const originalInterpret = aiService.interpretMessage;
  const originalConfirm = aiService.generateReservationConfirmationMessage;
  let interpretCalls = 0;
  aiService.interpretMessage = async () => {
    const response = STEP_RESPONSES[Math.min(interpretCalls, STEP_RESPONSES.length - 1)];
    interpretCalls += 1;
    return { ...response };
  };
  aiService.generateReservationConfirmationMessage = async () => 'Reserva confirmada com sucesso.';

  const outboundGateway = require('../../services/messaging/outboundGateway');
  const originalSendText = outboundGateway.sendText;
  outboundGateway.sendText = async () => ({ delivered: true, mode: 'inline' });

  const reservationService = require('../../services/whatsappReservationService');
  const originalCreate = reservationService.createReservationInternal;
  const originalCatalog = reservationService.loadAiCatalog;
  reservationService.createReservationInternal = async () => ({
    success: true,
    data: {
      reservation: {
        id: 99,
        client_name: 'Maria Silva',
        client_email: 'maria@example.com',
        establishment_id: 1,
        establishment_name: 'Estabelecimento Teste',
        reservation_date: '2026-12-20',
        reservation_time: '20:30:00',
      },
    },
  });
  reservationService.loadAiCatalog = async () => ({
    establishmentsBlock: '- id 1: Estabelecimento Teste',
    areasBlock: '- id 10: Salão',
    establishments: [{ id: 1, name: 'Estabelecimento Teste' }],
  });

  const businessRulesEngine = require('../../services/businessRulesEngine');
  const originalDateOverride = businessRulesEngine.getDateOverride;
  businessRulesEngine.getDateOverride = async () => null;

  const profileService = require('../../services/operationalMemory/customerOperationalProfileService');
  const originalProfile = profileService.getProfileForPrompt;
  const originalRefresh = profileService.refreshProfileFromSources;
  profileService.getProfileForPrompt = async () => ({ summary: '' });
  profileService.refreshProfileFromSources = async () => {};

  const metrics = require('../../services/metrics/conversationMetricsService');
  const originalRecord = metrics.recordEvent;
  metrics.recordEvent = async (_poolRef, event) => ({ id: 1, occurred_at: new Date(), ...event });

  const enginePath = require.resolve('../../services/conversationEngine/processInboundTurn');
  delete require.cache[enginePath];
  const { processInboundTurn } = require('../../services/conversationEngine/processInboundTurn');
  const stateManager = require('../../services/stateManager/stateManager');

  try {
    const userMessages = [
      'oi',
      'estabelecimento 1',
      '20/12/2026',
      '20:30',
      '4 pessoas',
      'salão',
      'Maria Silva maria@example.com 10/05/1990',
      'pode confirmar',
    ];

    for (const message of userMessages) {
      await processInboundTurn({
        pool,
        app: { get: () => null },
        payload: buildWebhookPayload(waId, message, `wamid-${message}`),
        incomingMessageText: message,
        waId,
      });
    }

    const finalState = await stateManager.getByConversationId(pool, conversationId);
    assert.equal(finalState.currentStep, 'completed');
    assert.ok(interpretCalls > 0);
    assert.equal(finalState.collectedFields.establishment_id, 1);
    assert.equal(finalState.collectedFields.client_email, 'maria@example.com');
  } finally {
    inbox.upsertConversation = originalUpsert;
    inbox.insertMessage = originalInsert;
    inbox.upsertContact = originalUpsertContact;
    inbox.getRecentMessagesForContext = originalGetRecent;
    inbox.isHumanTakeoverActive = originalHumanTakeover;
    inbox.updateInboundAiFields = originalUpdateInbound;
    inbox.getConversationByWaId = originalGetConversation;
    inbox.setConversationEstablishment = originalSetEstablishment;
    aiService.interpretMessage = originalInterpret;
    aiService.generateReservationConfirmationMessage = originalConfirm;
    outboundGateway.sendText = originalSendText;
    reservationService.createReservationInternal = originalCreate;
    reservationService.loadAiCatalog = originalCatalog;
    businessRulesEngine.getDateOverride = originalDateOverride;
    profileService.getProfileForPrompt = originalProfile;
    profileService.refreshProfileFromSources = originalRefresh;
    metrics.recordEvent = originalRecord;
  }
});
