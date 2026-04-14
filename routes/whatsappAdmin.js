const express = require('express');
const auth = require('../middleware/auth');
const authorize = require('../middleware/authorize');
const { sendMessage } = require('../services/whatsappService');
const inbox = require('../services/whatsappInboxRepository');

module.exports = (pool, app) => {
  const router = express.Router();
  const allowedRoles = ['admin', 'gerente', 'hostess', 'promoter', 'recepção', 'recepcao', 'atendente'];
  const ALLOWED_STATUSES = new Set(['new', 'in_progress', 'waiting_customer', 'resolved']);
  const ALLOWED_CONTACT_STATUSES = new Set(['new', 'qualified', 'customer', 'inactive']);

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

  function parseCsvTags(value) {
    if (!value) return [];
    return String(value)
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
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
      'contact_status',
      'tags',
      'notes',
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
          csvCell(row.contact_status),
          csvCell(Array.isArray(row.tags) ? row.tags.join('; ') : ''),
          csvCell(row.notes),
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

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function clampInt(value, min, max, fallback) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, Math.round(n)));
  }

  function contactEligibleForCampaign(contact, campaign) {
    if (!contact?.marketing_opt_in) {
      return { ok: false, reason: 'Sem opt-in de marketing' };
    }
    const filters = campaign?.target_filters && typeof campaign.target_filters === 'object'
      ? campaign.target_filters
      : {};
    const tagsRequired = Array.isArray(filters.tags) ? filters.tags : [];
    const statusRequired = typeof filters.contact_status === 'string' ? filters.contact_status.trim() : '';
    const optInRequired = filters.marketing_opt_in === true;
    const contactTags = Array.isArray(contact.tags)
      ? contact.tags.map((t) => String(t).trim().toLowerCase())
      : [];

    if (statusRequired && contact.contact_status !== statusRequired) {
      return { ok: false, reason: 'Status não atende ao filtro da campanha' };
    }
    if (tagsRequired.length > 0) {
      const required = tagsRequired.map((t) => String(t || '').trim().toLowerCase()).filter(Boolean);
      const matched = required.some((tag) => contactTags.includes(tag));
      if (!matched) {
        return { ok: false, reason: 'Tags não atendem ao filtro da campanha' };
      }
    }
    if (optInRequired && !contact.marketing_opt_in) {
      return { ok: false, reason: 'Campanha exige opt-in explícito' };
    }
    return { ok: true };
  }

  function maxBatchChunkSize() {
    return clampInt(process.env.WHATSAPP_CAMPAIGN_BATCH_MAX_CHUNK, 1, 200, 50);
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
        contactStatus:
          typeof req.query?.contact_status === 'string' ? req.query.contact_status.trim() : '',
        tagsAny: parseCsvTags(req.query?.tags_any),
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
        contactStatus:
          typeof req.query?.contact_status === 'string' ? req.query.contact_status.trim() : '',
        tagsAny: parseCsvTags(req.query?.tags_any),
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

  router.patch('/contacts/:id', auth, authorize(...allowedRoles), async (req, res) => {
    const contactId = Number(req.params?.id);
    if (!Number.isFinite(contactId) || contactId <= 0) {
      return res.status(400).json({ message: 'id inválido' });
    }
    try {
      const scope = await loadUserScope(req.user);
      const existing = await inbox.getContactById(pool, contactId);
      if (!existing) {
        return res.status(404).json({ message: 'Contato não encontrado' });
      }
      if (!canAccessEstablishment(scope, existing.last_establishment_id)) {
        return res.status(403).json({ message: 'Acesso negado para este estabelecimento' });
      }

      const marketingOptIn = parseBoolean(req.body?.marketing_opt_in);
      const contactStatusRaw = String(req.body?.contact_status || '').trim();
      const contactStatus = contactStatusRaw ? contactStatusRaw : null;
      if (contactStatus && !ALLOWED_CONTACT_STATUSES.has(contactStatus)) {
        return res.status(400).json({ message: 'contact_status inválido' });
      }

      const tagsRaw = req.body?.tags;
      let tags = null;
      if (Array.isArray(tagsRaw)) {
        tags = tagsRaw
          .map((t) => String(t || '').trim())
          .filter(Boolean)
          .slice(0, 20);
      } else if (typeof tagsRaw === 'string') {
        tags = tagsRaw
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean)
          .slice(0, 20);
      }

      const updated = await inbox.updateContactById(pool, contactId, {
        contactName:
          typeof req.body?.contact_name === 'string' ? req.body.contact_name.trim() : null,
        clientEmail:
          typeof req.body?.client_email === 'string' ? req.body.client_email.trim() : null,
        marketingOptIn,
        contactStatus,
        tags,
        notes: typeof req.body?.notes === 'string' ? req.body.notes.trim() : null,
      });
      return res.json({ ok: true, contact: updated });
    } catch (e) {
      console.error('[whatsappAdmin] patch contact:', e);
      return res.status(500).json({ message: 'Erro ao atualizar contato WhatsApp' });
    }
  });

  router.get('/campaigns', auth, authorize(...allowedRoles), async (req, res) => {
    try {
      const scope = await loadUserScope(req.user);
      if (!scope.isAdmin && scope.allowedEstablishmentIds.length === 0) {
        return res.json({ campaigns: [] });
      }
      const establishmentId = Number(req.query?.establishment_id);
      if (
        Number.isFinite(establishmentId) &&
        establishmentId > 0 &&
        !canAccessEstablishment(scope, establishmentId)
      ) {
        return res.status(403).json({ message: 'Acesso negado para este estabelecimento' });
      }

      const campaigns = await inbox.listCampaigns(pool, {
        establishmentId: Number.isFinite(establishmentId) ? establishmentId : undefined,
        allowedEstablishmentIds: scope.isAdmin ? null : scope.allowedEstablishmentIds,
      });
      return res.json({ campaigns });
    } catch (e) {
      console.error('[whatsappAdmin] list campaigns:', e);
      return res.status(500).json({ message: 'Erro ao listar campanhas' });
    }
  });

  router.post('/campaigns', auth, authorize(...allowedRoles), async (req, res) => {
    try {
      const scope = await loadUserScope(req.user);
      const establishmentId = Number(req.body?.establishment_id);
      const name = String(req.body?.name || '').trim();
      const messageTemplate = String(req.body?.message_template || '').trim();
      if (!Number.isFinite(establishmentId) || establishmentId <= 0) {
        return res.status(400).json({ message: 'establishment_id inválido' });
      }
      if (!name || !messageTemplate) {
        return res.status(400).json({ message: 'name e message_template são obrigatórios' });
      }
      if (!canAccessEstablishment(scope, establishmentId)) {
        return res.status(403).json({ message: 'Acesso negado para este estabelecimento' });
      }
      const campaign = await inbox.createCampaign(pool, {
        establishmentId,
        name,
        messageTemplate,
        targetFilters:
          req.body?.target_filters && typeof req.body.target_filters === 'object'
            ? req.body.target_filters
            : {},
        userId: req.user?.id || null,
      });
      return res.status(201).json({ ok: true, campaign });
    } catch (e) {
      console.error('[whatsappAdmin] create campaign:', e);
      return res.status(500).json({ message: 'Erro ao criar campanha' });
    }
  });

  router.put('/campaigns/:id', auth, authorize(...allowedRoles), async (req, res) => {
    const campaignId = Number(req.params?.id);
    if (!Number.isFinite(campaignId) || campaignId <= 0) {
      return res.status(400).json({ message: 'id inválido' });
    }
    try {
      const scope = await loadUserScope(req.user);
      const existing = await inbox.getCampaignById(pool, campaignId);
      if (!existing) {
        return res.status(404).json({ message: 'Campanha não encontrada' });
      }
      if (!canAccessEstablishment(scope, existing.establishment_id)) {
        return res.status(403).json({ message: 'Acesso negado para este estabelecimento' });
      }
      const updated = await inbox.updateCampaignById(pool, campaignId, {
        name: typeof req.body?.name === 'string' ? req.body.name.trim() : null,
        messageTemplate:
          typeof req.body?.message_template === 'string'
            ? req.body.message_template.trim()
            : null,
        targetFilters:
          req.body?.target_filters && typeof req.body.target_filters === 'object'
            ? req.body.target_filters
            : null,
        isActive:
          req.body?.is_active === true || req.body?.is_active === false ? req.body.is_active : null,
        userId: req.user?.id || null,
      });
      return res.json({ ok: true, campaign: updated });
    } catch (e) {
      console.error('[whatsappAdmin] update campaign:', e);
      return res.status(500).json({ message: 'Erro ao atualizar campanha' });
    }
  });

  router.delete('/campaigns/:id', auth, authorize(...allowedRoles), async (req, res) => {
    const campaignId = Number(req.params?.id);
    if (!Number.isFinite(campaignId) || campaignId <= 0) {
      return res.status(400).json({ message: 'id inválido' });
    }
    try {
      const scope = await loadUserScope(req.user);
      const existing = await inbox.getCampaignById(pool, campaignId);
      if (!existing) {
        return res.status(404).json({ message: 'Campanha não encontrada' });
      }
      if (!canAccessEstablishment(scope, existing.establishment_id)) {
        return res.status(403).json({ message: 'Acesso negado para este estabelecimento' });
      }
      await inbox.deleteCampaignById(pool, campaignId);
      return res.json({ ok: true });
    } catch (e) {
      console.error('[whatsappAdmin] delete campaign:', e);
      return res.status(500).json({ message: 'Erro ao remover campanha' });
    }
  });

  router.get('/campaigns/:id/audience-preview', auth, authorize(...allowedRoles), async (req, res) => {
    const campaignId = Number(req.params?.id);
    if (!Number.isFinite(campaignId) || campaignId <= 0) {
      return res.status(400).json({ message: 'id inválido' });
    }
    try {
      const scope = await loadUserScope(req.user);
      const campaign = await inbox.getCampaignById(pool, campaignId);
      if (!campaign) {
        return res.status(404).json({ message: 'Campanha não encontrada' });
      }
      if (!canAccessEstablishment(scope, campaign.establishment_id)) {
        return res.status(403).json({ message: 'Acesso negado para este estabelecimento' });
      }

      const audienceOpts = {
        allowedEstablishmentIds: scope.isAdmin ? null : scope.allowedEstablishmentIds,
      };
      const [estimatedCount, sample] = await Promise.all([
        inbox.countCampaignAudience(pool, campaign, audienceOpts),
        inbox.buildCampaignAudience(pool, campaign, { ...audienceOpts, limit: 10 }),
      ]);
      return res.json({
        campaign_id: campaign.id,
        establishment_id: campaign.establishment_id,
        estimated_count: estimatedCount,
        sample,
      });
    } catch (e) {
      console.error('[whatsappAdmin] campaign audience-preview:', e);
      return res.status(500).json({ message: 'Erro ao calcular público da campanha' });
    }
  });

  router.post('/campaigns/:id/send-to-contact', auth, authorize(...allowedRoles), async (req, res) => {
    const campaignId = Number(req.params?.id);
    const contactId = Number(req.body?.contact_id);
    if (!Number.isFinite(campaignId) || campaignId <= 0) {
      return res.status(400).json({ message: 'id da campanha inválido' });
    }
    if (!Number.isFinite(contactId) || contactId <= 0) {
      return res.status(400).json({ message: 'contact_id inválido' });
    }

    try {
      const scope = await loadUserScope(req.user);
      const campaign = await inbox.getCampaignById(pool, campaignId);
      if (!campaign) {
        return res.status(404).json({ message: 'Campanha não encontrada' });
      }
      if (!canAccessEstablishment(scope, campaign.establishment_id)) {
        return res.status(403).json({ message: 'Acesso negado para este estabelecimento' });
      }

      const contact = await inbox.getContactById(pool, contactId);
      if (!contact) {
        return res.status(404).json({ message: 'Contato não encontrado' });
      }
      if (!canAccessEstablishment(scope, contact.last_establishment_id)) {
        return res.status(403).json({ message: 'Acesso negado para este contato' });
      }

      const eligibility = contactEligibleForCampaign(contact, campaign);
      if (!eligibility.ok) {
        return res.status(400).json({
          message:
            eligibility.reason === 'Sem opt-in de marketing'
              ? 'Envio bloqueado: contato sem opt-in de marketing.'
              : `Envio bloqueado: ${eligibility.reason}.`,
        });
      }

      const text = String(campaign.message_template || '').trim();
      if (!text) {
        return res.status(400).json({ message: 'Campanha sem mensagem configurada' });
      }

      const sendResult = await sendMessage(contact.wa_id, text);
      const conv = await inbox.upsertConversation(pool, {
        waId: contact.wa_id,
        contactName: contact.contact_name,
        establishmentId: campaign.establishment_id,
      });
      const saved = await inbox.insertMessage(pool, {
        conversationId: conv.id,
        direction: 'outbound',
        body: text,
        intent: 'CAMPAIGN_SEND',
        suggestedReply: null,
        rawPayload: sendResult || null,
      });
      emitInbox({ type: 'outbound' });
      return res.json({ ok: true, message: saved });
    } catch (e) {
      console.error('[whatsappAdmin] campaign send-to-contact:', e);
      return res.status(500).json({ message: e.message || 'Erro ao enviar campanha para contato' });
    }
  });

  router.post('/campaigns/:id/batches', auth, authorize(...allowedRoles), async (req, res) => {
    const campaignId = Number(req.params?.id);
    if (!Number.isFinite(campaignId) || campaignId <= 0) {
      return res.status(400).json({ message: 'id da campanha inválido' });
    }
    const chunkSize = clampInt(req.body?.chunk_size, 1, 100, 25);
    const delayMs = clampInt(req.body?.delay_ms, 0, 15000, 400);

    try {
      const scope = await loadUserScope(req.user);
      const campaign = await inbox.getCampaignById(pool, campaignId);
      if (!campaign) {
        return res.status(404).json({ message: 'Campanha não encontrada' });
      }
      if (!canAccessEstablishment(scope, campaign.establishment_id)) {
        return res.status(403).json({ message: 'Acesso negado para este estabelecimento' });
      }

      const audienceOpts = {
        allowedEstablishmentIds: scope.isAdmin ? null : scope.allowedEstablishmentIds,
      };
      const totalPlanned = await inbox.countCampaignAudience(pool, campaign, audienceOpts);
      const batch = await inbox.createCampaignBatch(pool, {
        campaignId,
        totalPlanned,
        chunkSize,
        delayMs,
        startedBy: req.user?.id || null,
      });
      return res.json({ ok: true, batch });
    } catch (e) {
      console.error('[whatsappAdmin] create campaign batch:', e);
      return res.status(500).json({ message: e.message || 'Erro ao criar fila de disparo' });
    }
  });

  router.get('/campaigns/:id/batches', auth, authorize(...allowedRoles), async (req, res) => {
    const campaignId = Number(req.params?.id);
    if (!Number.isFinite(campaignId) || campaignId <= 0) {
      return res.status(400).json({ message: 'id da campanha inválido' });
    }
    try {
      const scope = await loadUserScope(req.user);
      const campaign = await inbox.getCampaignById(pool, campaignId);
      if (!campaign) {
        return res.status(404).json({ message: 'Campanha não encontrada' });
      }
      if (!canAccessEstablishment(scope, campaign.establishment_id)) {
        return res.status(403).json({ message: 'Acesso negado para este estabelecimento' });
      }
      const batches = await inbox.listCampaignBatchesForCampaign(pool, campaignId, 40);
      return res.json({ batches });
    } catch (e) {
      console.error('[whatsappAdmin] list campaign batches:', e);
      return res.status(500).json({ message: 'Erro ao listar filas de disparo' });
    }
  });

  router.get('/campaign-batches/:batchId', auth, authorize(...allowedRoles), async (req, res) => {
    const batchId = Number(req.params?.batchId);
    if (!Number.isFinite(batchId) || batchId <= 0) {
      return res.status(400).json({ message: 'batch inválido' });
    }
    try {
      const scope = await loadUserScope(req.user);
      const batch = await inbox.getCampaignBatchById(pool, batchId);
      if (!batch) {
        return res.status(404).json({ message: 'Lote não encontrado' });
      }
      if (!canAccessEstablishment(scope, batch.establishment_id)) {
        return res.status(403).json({ message: 'Acesso negado para este estabelecimento' });
      }
      return res.json({ batch });
    } catch (e) {
      console.error('[whatsappAdmin] get campaign batch:', e);
      return res.status(500).json({ message: 'Erro ao carregar lote' });
    }
  });

  router.get('/campaign-batches/:batchId/logs', auth, authorize(...allowedRoles), async (req, res) => {
    const batchId = Number(req.params?.batchId);
    if (!Number.isFinite(batchId) || batchId <= 0) {
      return res.status(400).json({ message: 'batch inválido' });
    }
    const limit = clampInt(req.query?.limit, 1, 500, 80);
    const offset = clampInt(req.query?.offset, 0, 100000, 0);

    try {
      const scope = await loadUserScope(req.user);
      const batch = await inbox.getCampaignBatchById(pool, batchId);
      if (!batch) {
        return res.status(404).json({ message: 'Lote não encontrado' });
      }
      if (!canAccessEstablishment(scope, batch.establishment_id)) {
        return res.status(403).json({ message: 'Acesso negado para este estabelecimento' });
      }
      const logs = await inbox.listCampaignSendLogs(pool, { batchId, limit, offset });
      return res.json({ logs });
    } catch (e) {
      console.error('[whatsappAdmin] campaign batch logs:', e);
      return res.status(500).json({ message: 'Erro ao listar logs do lote' });
    }
  });

  router.post('/campaign-batches/:batchId/cancel', auth, authorize(...allowedRoles), async (req, res) => {
    const batchId = Number(req.params?.batchId);
    if (!Number.isFinite(batchId) || batchId <= 0) {
      return res.status(400).json({ message: 'batch inválido' });
    }
    try {
      const scope = await loadUserScope(req.user);
      const batch = await inbox.getCampaignBatchById(pool, batchId);
      if (!batch) {
        return res.status(404).json({ message: 'Lote não encontrado' });
      }
      if (!canAccessEstablishment(scope, batch.establishment_id)) {
        return res.status(403).json({ message: 'Acesso negado para este estabelecimento' });
      }
      if (batch.status === 'completed' || batch.status === 'cancelled') {
        return res.json({ ok: true, batch });
      }
      const r = await pool.query(
        `UPDATE whatsapp_campaign_batches
         SET status = 'cancelled', completed_at = COALESCE(completed_at, NOW()), updated_at = NOW()
         WHERE id = $1 AND status IN ('queued', 'processing')
         RETURNING *`,
        [batchId]
      );
      if (r.rows.length === 0) {
        const b = await inbox.getCampaignBatchById(pool, batchId);
        return res.json({ ok: true, batch: b });
      }
      return res.json({ ok: true, batch: r.rows[0] });
    } catch (e) {
      console.error('[whatsappAdmin] cancel campaign batch:', e);
      return res.status(500).json({ message: 'Erro ao cancelar lote' });
    }
  });

  router.post('/campaign-batches/:batchId/process', auth, authorize(...allowedRoles), async (req, res) => {
    const batchId = Number(req.params?.batchId);
    if (!Number.isFinite(batchId) || batchId <= 0) {
      return res.status(400).json({ message: 'batch inválido' });
    }

    try {
      const scope = await loadUserScope(req.user);
      let batch = await inbox.getCampaignBatchById(pool, batchId);
      if (!batch) {
        return res.status(404).json({ message: 'Lote não encontrado' });
      }
      if (!canAccessEstablishment(scope, batch.establishment_id)) {
        return res.status(403).json({ message: 'Acesso negado para este estabelecimento' });
      }
      if (batch.status === 'completed') {
        return res.json({
          ok: true,
          batch,
          last_chunk: { processed: 0, sent_ok: 0, sent_fail: 0, skipped: 0, done: true },
        });
      }
      if (batch.status === 'cancelled' || batch.status === 'failed') {
        return res.status(400).json({ message: 'Este lote não pode ser processado.' });
      }

      const lock = await pool.query(
        `UPDATE whatsapp_campaign_batches
         SET status = 'processing', updated_at = NOW()
         WHERE id = $1 AND status = 'queued'
         RETURNING *`,
        [batchId]
      );

      if (lock.rows.length === 0) {
        const b = await inbox.getCampaignBatchById(pool, batchId);
        if (b?.status === 'completed') {
          return res.json({
            ok: true,
            batch: b,
            last_chunk: { processed: 0, sent_ok: 0, sent_fail: 0, skipped: 0, done: true },
          });
        }
        return res.status(409).json({
          message:
            'Este lote já está em processamento. Aguarde o término do chunk ou use outro lote.',
        });
      }

      batch = lock.rows[0];

      const campaign = await inbox.getCampaignById(pool, batch.campaign_id);
      if (!campaign) {
        await inbox.updateCampaignBatchFields(pool, batchId, {
          status: 'failed',
          errorMessage: 'Campanha removida',
          completedAt: new Date(),
        });
        return res.status(400).json({ message: 'Campanha não encontrada para este lote' });
      }

      const text = String(campaign.message_template || '').trim();
      if (!text) {
        await inbox.updateCampaignBatchFields(pool, batchId, {
          status: 'failed',
          errorMessage: 'Campanha sem mensagem configurada',
          completedAt: new Date(),
        });
        return res.status(400).json({ message: 'Campanha sem mensagem configurada' });
      }

      const effectiveChunk = Math.min(Number(batch.chunk_size) || 25, maxBatchChunkSize());
      const audienceOpts = {
        limit: effectiveChunk,
        minContactId: batch.cursor_last_contact_id,
        orderBy: 'id_asc',
        allowedEstablishmentIds: scope.isAdmin ? null : scope.allowedEstablishmentIds,
      };
      const audience = await inbox.buildCampaignAudience(pool, campaign, audienceOpts);

      if (audience.length === 0) {
        const doneBatch = await inbox.updateCampaignBatchFields(pool, batchId, {
          status: 'completed',
          completedAt: new Date(),
        });
        return res.json({
          ok: true,
          batch: doneBatch,
          last_chunk: { processed: 0, sent_ok: 0, sent_fail: 0, skipped: 0, done: true },
        });
      }

      let chunkSentOk = 0;
      let chunkSkipped = 0;
      let chunkFail = 0;

      for (let i = 0; i < audience.length; i += 1) {
        const contact = audience[i];
        if (i > 0 && Number(batch.delay_ms) > 0) {
          await sleep(Number(batch.delay_ms));
        }

        const eligibility = contactEligibleForCampaign(contact, campaign);
        if (!eligibility.ok) {
          chunkSkipped += 1;
          await inbox.insertCampaignSendLog(pool, {
            batchId,
            contactId: contact.id,
            waId: contact.wa_id,
            status: 'skipped',
            errorMessage: eligibility.reason,
            meta: { reason: eligibility.reason },
          });
          continue;
        }

        try {
          const sendResult = await sendMessage(contact.wa_id, text);
          const conv = await inbox.upsertConversation(pool, {
            waId: contact.wa_id,
            contactName: contact.contact_name,
            establishmentId: campaign.establishment_id,
          });
          await inbox.insertMessage(pool, {
            conversationId: conv.id,
            direction: 'outbound',
            body: text,
            intent: 'CAMPAIGN_BATCH',
            suggestedReply: null,
            rawPayload: sendResult || null,
          });
          chunkSentOk += 1;
          await inbox.insertCampaignSendLog(pool, {
            batchId,
            contactId: contact.id,
            waId: contact.wa_id,
            status: 'sent',
            errorMessage: null,
            meta: null,
          });
          emitInbox({ type: 'outbound' });
        } catch (sendErr) {
          chunkFail += 1;
          await inbox.insertCampaignSendLog(pool, {
            batchId,
            contactId: contact.id,
            waId: contact.wa_id,
            status: 'failed',
            errorMessage: sendErr.message || String(sendErr),
            meta: null,
          });
        }
      }

      const nextCursor = audience[audience.length - 1].id;
      const mergedProcessed = Number(batch.processed_count) + audience.length;
      const mergedSentOk = Number(batch.sent_ok) + chunkSentOk;
      const mergedSentFail = Number(batch.sent_fail) + chunkFail;
      const mergedSkipped = Number(batch.skipped_count) + chunkSkipped;
      const isDone = audience.length < effectiveChunk;

      const patch = {
        cursorLastContactId: nextCursor,
        processedCount: mergedProcessed,
        sentOk: mergedSentOk,
        sentFail: mergedSentFail,
        skippedCount: mergedSkipped,
        status: isDone ? 'completed' : 'queued',
      };
      if (isDone) {
        patch.completedAt = new Date();
      }
      const updated = await inbox.updateCampaignBatchFields(pool, batchId, patch);

      return res.json({
        ok: true,
        batch: updated,
        last_chunk: {
          processed: audience.length,
          sent_ok: chunkSentOk,
          sent_fail: chunkFail,
          skipped: chunkSkipped,
          done: isDone,
          cursor_after: nextCursor,
        },
      });
    } catch (e) {
      console.error('[whatsappAdmin] process campaign batch:', e);
      try {
        await inbox.updateCampaignBatchFields(pool, batchId, {
          status: 'failed',
          errorMessage: String(e.message || e).slice(0, 2000),
        });
      } catch (_) {
        /* ignore */
      }
      return res.status(500).json({ message: e.message || 'Erro ao processar lote' });
    }
  });

  router.get('/reports/summary', auth, authorize(...allowedRoles), async (req, res) => {
    try {
      const scope = await loadUserScope(req.user);
      const establishmentId = Number(req.query?.establishment_id);
      const hasEstablishmentFilter = Number.isFinite(establishmentId) && establishmentId > 0;
      if (hasEstablishmentFilter && !canAccessEstablishment(scope, establishmentId)) {
        return res.status(403).json({ message: 'Acesso negado para este estabelecimento' });
      }

      let targetEstablishmentId = hasEstablishmentFilter ? establishmentId : undefined;
      if (!scope.isAdmin && !targetEstablishmentId && scope.allowedEstablishmentIds.length === 1) {
        targetEstablishmentId = scope.allowedEstablishmentIds[0];
      }

      const summary = await inbox.getWhatsappSummaryReport(pool, {
        establishmentId: targetEstablishmentId,
        startDate:
          typeof req.query?.start_date === 'string' && req.query.start_date.trim()
            ? req.query.start_date.trim()
            : null,
        endDate:
          typeof req.query?.end_date === 'string' && req.query.end_date.trim()
            ? req.query.end_date.trim()
            : null,
      });
      return res.json({ summary });
    } catch (e) {
      console.error('[whatsappAdmin] reports/summary:', e);
      return res.status(500).json({ message: 'Erro ao gerar resumo de relatórios' });
    }
  });

  return router;
};
