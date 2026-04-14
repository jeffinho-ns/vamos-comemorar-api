const express = require('express');
const auth = require('../middleware/auth');
const authorize = require('../middleware/authorize');
const { sendMessage } = require('../services/whatsappService');
const inbox = require('../services/whatsappInboxRepository');

module.exports = (pool, app) => {
  const router = express.Router();
  const allowedRoles = ['admin', 'gerente', 'hostess', 'promoter', 'recepção', 'recepcao', 'atendente'];
  const ALLOWED_STATUSES = new Set(['new', 'in_progress', 'waiting_customer', 'resolved']);

  function isAdminRole(user) {
    const role = String(user?.role || '').trim().toLowerCase();
    return role === 'admin' || role === 'administrador';
  }

  async function loadUserScope(user) {
    if (isAdminRole(user)) {
      return { isAdmin: true, allowedEstablishmentIds: [] };
    }
    const result = await pool.query(
      `SELECT DISTINCT establishment_id
       FROM user_establishment_permissions
       WHERE user_id = $1
         AND is_active = TRUE
         AND can_manage_reservations = TRUE`,
      [user.id]
    );
    const allowedEstablishmentIds = result.rows
      .map((r) => Number(r.establishment_id))
      .filter((v) => Number.isFinite(v) && v > 0);
    return { isAdmin: false, allowedEstablishmentIds };
  }

  function canAccessEstablishment(scope, establishmentId) {
    if (scope.isAdmin) return true;
    const normalizedId = Number(establishmentId);
    if (!Number.isFinite(normalizedId) || normalizedId <= 0) return false;
    return scope.allowedEstablishmentIds.includes(normalizedId);
  }

  function parseBoolean(value) {
    if (value === true || value === false) return value;
    const str = String(value || '').trim().toLowerCase();
    if (str === 'true') return true;
    if (str === 'false') return false;
    return null;
  }

  function csvCell(value) {
    if (value === null || value === undefined) return '';
    const str = String(value).replace(/"/g, '""');
    return `"${str}"`;
  }

  function buildContactsCsv(rows) {
    const headers = [
      'wa_id',
      'contact_name',
      'client_email',
      'birth_date',
      'last_establishment_id',
      'last_establishment_name',
      'last_reservation_id',
      'marketing_opt_in',
      'marketing_opt_in_at',
      'first_seen_at',
      'last_seen_at',
    ];
    const lines = [headers.join(',')];
    for (const row of rows || []) {
      lines.push(
        [
          csvCell(row.wa_id),
          csvCell(row.contact_name),
          csvCell(row.client_email),
          csvCell(row.birth_date),
          csvCell(row.last_establishment_id),
          csvCell(row.last_establishment_name),
          csvCell(row.last_reservation_id),
          csvCell(row.marketing_opt_in),
          csvCell(row.marketing_opt_in_at),
          csvCell(row.first_seen_at),
          csvCell(row.last_seen_at),
        ].join(',')
      );
    }
    return lines.join('\n');
  }

  function emitInbox(payload) {
    const io = app?.get?.('socketio');
    if (io) {
      io.to('whatsapp_inbox').emit('whatsapp_inbox_update', {
        type: payload?.type || 'refresh',
      });
    }
  }

  router.get('/conversations', auth, authorize(...allowedRoles), async (req, res) => {
    try {
      const scope = await loadUserScope(req.user);
      if (!scope.isAdmin && scope.allowedEstablishmentIds.length === 0) {
        return res.json({ conversations: [] });
      }

      const status = typeof req.query?.status === 'string' ? req.query.status.trim() : '';
      const assignedUserIdRaw = req.query?.assigned_user_id;
      const assignedUserId =
        assignedUserIdRaw !== undefined && assignedUserIdRaw !== ''
          ? Number(assignedUserIdRaw)
          : undefined;
      const rows = await inbox.listConversations(pool, {
        limit: 150,
        status,
        assignedUserId: Number.isFinite(assignedUserId) ? assignedUserId : undefined,
        allowedEstablishmentIds: scope.isAdmin ? null : scope.allowedEstablishmentIds,
      });
      return res.json({ conversations: rows });
    } catch (e) {
      console.error('[whatsappAdmin] list conversations:', e);
      return res.status(500).json({ message: 'Erro ao listar conversas' });
    }
  });

  router.get('/conversations/:waId/messages', auth, authorize(...allowedRoles), async (req, res) => {
    const { waId } = req.params;
    try {
      const scope = await loadUserScope(req.user);
      const conv = await inbox.getConversationByWaId(pool, waId);
      if (!conv) {
        return res.json({ messages: [], conversation: null });
      }
      if (!canAccessEstablishment(scope, conv.establishment_id)) {
        return res.status(403).json({ message: 'Acesso negado para este estabelecimento' });
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
      const scope = await loadUserScope(req.user);
      const existing = await inbox.getConversationByWaId(pool, waId);
      if (!existing) {
        if (!scope.isAdmin) {
          return res.status(404).json({ message: 'Conversa não encontrada' });
        }
        await inbox.upsertConversation(pool, { waId, contactName: null });
      } else if (!canAccessEstablishment(scope, existing.establishment_id)) {
        return res.status(403).json({ message: 'Acesso negado para este estabelecimento' });
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
      const scope = await loadUserScope(req.user);
      const existing = await inbox.getConversationByWaId(pool, waId);
      if (!existing) {
        return res.status(404).json({ message: 'Conversa não encontrada' });
      }
      if (!canAccessEstablishment(scope, existing.establishment_id)) {
        return res.status(403).json({ message: 'Acesso negado para este estabelecimento' });
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
      const scope = await loadUserScope(req.user);
      let conv = await inbox.getConversationByWaId(pool, waId);
      if (!conv) {
        if (!scope.isAdmin) {
          return res.status(404).json({ message: 'Conversa não encontrada' });
        }
        conv = await inbox.upsertConversation(pool, { waId, contactName: null });
      } else if (!canAccessEstablishment(scope, conv.establishment_id)) {
        return res.status(403).json({ message: 'Acesso negado para este estabelecimento' });
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

  router.post('/conversations/:waId/status', auth, authorize(...allowedRoles), async (req, res) => {
    const { waId } = req.params;
    const status = String(req.body?.status || '').trim();
    if (!ALLOWED_STATUSES.has(status)) {
      return res.status(400).json({ message: 'status inválido' });
    }
    try {
      const scope = await loadUserScope(req.user);
      const existing = await inbox.getConversationByWaId(pool, waId);
      if (!existing) {
        return res.status(404).json({ message: 'Conversa não encontrada' });
      }
      if (!canAccessEstablishment(scope, existing.establishment_id)) {
        return res.status(403).json({ message: 'Acesso negado para este estabelecimento' });
      }
      const conv = await inbox.updateConversationStatus(pool, waId, status);
      emitInbox({ type: 'status', conversation: conv });
      return res.json({ ok: true, conversation: conv });
    } catch (e) {
      console.error('[whatsappAdmin] status:', e);
      return res.status(500).json({ message: 'Erro ao atualizar status da conversa' });
    }
  });

  router.post('/conversations/:waId/assign-self', auth, authorize(...allowedRoles), async (req, res) => {
    const { waId } = req.params;
    try {
      const scope = await loadUserScope(req.user);
      const existing = await inbox.getConversationByWaId(pool, waId);
      if (!existing) {
        return res.status(404).json({ message: 'Conversa não encontrada' });
      }
      if (!canAccessEstablishment(scope, existing.establishment_id)) {
        return res.status(403).json({ message: 'Acesso negado para este estabelecimento' });
      }
      const conv = await inbox.assignConversation(pool, waId, req.user.id);
      emitInbox({ type: 'assign', conversation: conv });
      return res.json({ ok: true, conversation: conv });
    } catch (e) {
      console.error('[whatsappAdmin] assign-self:', e);
      return res.status(500).json({ message: 'Erro ao assumir conversa para atendimento' });
    }
  });

  router.post('/conversations/:waId/unassign', auth, authorize(...allowedRoles), async (req, res) => {
    const { waId } = req.params;
    try {
      const scope = await loadUserScope(req.user);
      const existing = await inbox.getConversationByWaId(pool, waId);
      if (!existing) {
        return res.status(404).json({ message: 'Conversa não encontrada' });
      }
      if (!canAccessEstablishment(scope, existing.establishment_id)) {
        return res.status(403).json({ message: 'Acesso negado para este estabelecimento' });
      }
      const conv = await inbox.assignConversation(pool, waId, null);
      emitInbox({ type: 'unassign', conversation: conv });
      return res.json({ ok: true, conversation: conv });
    } catch (e) {
      console.error('[whatsappAdmin] unassign:', e);
      return res.status(500).json({ message: 'Erro ao liberar conversa' });
    }
  });

  router.get('/contacts', auth, authorize(...allowedRoles), async (req, res) => {
    try {
      const scope = await loadUserScope(req.user);
      if (!scope.isAdmin && scope.allowedEstablishmentIds.length === 0) {
        return res.json({ contacts: [] });
      }
      const establishmentId = Number(req.query?.establishment_id);
      if (
        Number.isFinite(establishmentId) &&
        establishmentId > 0 &&
        !canAccessEstablishment(scope, establishmentId)
      ) {
        return res.status(403).json({ message: 'Acesso negado para este estabelecimento' });
      }

      const contacts = await inbox.listContacts(pool, {
        limit: 1000,
        search: typeof req.query?.search === 'string' ? req.query.search : '',
        establishmentId: Number.isFinite(establishmentId) ? establishmentId : undefined,
        marketingOptIn: parseBoolean(req.query?.marketing_opt_in),
        allowedEstablishmentIds: scope.isAdmin ? null : scope.allowedEstablishmentIds,
      });
      return res.json({ contacts });
    } catch (e) {
      console.error('[whatsappAdmin] contacts:', e);
      return res.status(500).json({ message: 'Erro ao listar contatos WhatsApp' });
    }
  });

  router.get('/contacts/export.csv', auth, authorize(...allowedRoles), async (req, res) => {
    try {
      const scope = await loadUserScope(req.user);
      if (!scope.isAdmin && scope.allowedEstablishmentIds.length === 0) {
        return res.status(200).type('text/csv').send('wa_id\n');
      }

      const establishmentId = Number(req.query?.establishment_id);
      if (
        Number.isFinite(establishmentId) &&
        establishmentId > 0 &&
        !canAccessEstablishment(scope, establishmentId)
      ) {
        return res.status(403).json({ message: 'Acesso negado para este estabelecimento' });
      }

      const contacts = await inbox.listContacts(pool, {
        limit: 5000,
        search: typeof req.query?.search === 'string' ? req.query.search : '',
        establishmentId: Number.isFinite(establishmentId) ? establishmentId : undefined,
        marketingOptIn: parseBoolean(req.query?.marketing_opt_in),
        allowedEstablishmentIds: scope.isAdmin ? null : scope.allowedEstablishmentIds,
      });

      const csv = buildContactsCsv(contacts);
      const stamp = new Date().toISOString().slice(0, 10);
      const filename = `whatsapp-contacts-${stamp}.csv`;
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.status(200).send(csv);
    } catch (e) {
      console.error('[whatsappAdmin] contacts/export.csv:', e);
      return res.status(500).json({ message: 'Erro ao exportar contatos WhatsApp' });
    }
  });

  return router;
};
