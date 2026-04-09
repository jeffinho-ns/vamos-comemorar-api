const express = require('express');
const auth = require('../middleware/auth');
const authorize = require('../middleware/authorize');
const { sendMessage } = require('../services/whatsappService');
const inbox = require('../services/whatsappInboxRepository');

module.exports = (pool, app) => {
  const router = express.Router();
  const allowedRoles = ['admin', 'gerente', 'hostess', 'promoter', 'recepção', 'recepcao', 'atendente'];

  function emitInbox(payload) {
    const io = app?.get?.('socketio');
    if (io) {
      io.to('whatsapp_inbox').emit('whatsapp_inbox_update', payload);
    }
  }

  router.get('/conversations', auth, authorize(...allowedRoles), async (req, res) => {
    try {
      const rows = await inbox.listConversations(pool, 150);
      return res.json({ conversations: rows });
    } catch (e) {
      console.error('[whatsappAdmin] list conversations:', e);
      return res.status(500).json({ message: 'Erro ao listar conversas' });
    }
  });

  router.get('/conversations/:waId/messages', auth, authorize(...allowedRoles), async (req, res) => {
    const { waId } = req.params;
    try {
      const conv = await inbox.getConversationByWaId(pool, waId);
      if (!conv) {
        return res.json({ messages: [], conversation: null });
      }
      const messages = await inbox.listMessages(pool, conv.id, 300);
      return res.json({ conversation: conv, messages });
    } catch (e) {
      console.error('[whatsappAdmin] list messages:', e);
      return res.status(500).json({ message: 'Erro ao listar mensagens' });
    }
  });

  router.post('/conversations/:waId/takeover', auth, authorize(...allowedRoles), async (req, res) => {
    const { waId } = req.params;
    const hours = Number(req.body?.hours) || 24;
    try {
      const existing = await inbox.getConversationByWaId(pool, waId);
      if (!existing) {
        await inbox.upsertConversation(pool, { waId, contactName: null });
      }
      const conv = await inbox.setHumanTakeoverHours(pool, waId, hours);
      if (!conv) {
        return res.status(404).json({ message: 'Conversa não encontrada' });
      }
      emitInbox({ type: 'takeover', conversation: conv });
      return res.json({ ok: true, conversation: conv });
    } catch (e) {
      console.error('[whatsappAdmin] takeover:', e);
      return res.status(500).json({ message: 'Erro ao assumir conversa' });
    }
  });

  router.post('/conversations/:waId/resume', auth, authorize(...allowedRoles), async (req, res) => {
    const { waId } = req.params;
    try {
      const existing = await inbox.getConversationByWaId(pool, waId);
      if (!existing) {
        return res.status(404).json({ message: 'Conversa não encontrada' });
      }
      const conv = await inbox.clearHumanTakeover(pool, waId);
      emitInbox({ type: 'resume', conversation: conv });
      return res.json({ ok: true, conversation: conv });
    } catch (e) {
      console.error('[whatsappAdmin] resume:', e);
      return res.status(500).json({ message: 'Erro ao retomar IA da conversa' });
    }
  });

  router.post('/conversations/:waId/send', auth, authorize(...allowedRoles), async (req, res) => {
    const { waId } = req.params;
    const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
    if (!text) {
      return res.status(400).json({ message: 'text é obrigatório' });
    }
    try {
      let conv = await inbox.getConversationByWaId(pool, waId);
      if (!conv) {
        conv = await inbox.upsertConversation(pool, { waId, contactName: null });
      }

      const sendResult = await sendMessage(waId, text);
      const saved = await inbox.insertMessage(pool, {
        conversationId: conv.id,
        direction: 'outbound',
        body: text,
        intent: null,
        suggestedReply: null,
        rawPayload: sendResult || null,
      });

      const updatedConv = await inbox.getConversationByWaId(pool, waId);
      emitInbox({
        type: 'outbound',
        conversation: updatedConv,
        message: saved,
      });

      return res.json({ ok: true, message: saved, whatsapp: sendResult });
    } catch (e) {
      console.error('[whatsappAdmin] send:', e);
      return res.status(500).json({ message: e.message || 'Erro ao enviar mensagem' });
    }
  });

  return router;
};
