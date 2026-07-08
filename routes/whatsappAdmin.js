const express = require('express');
const multer = require('multer');
const auth = require('../middleware/auth');
const authorize = require('../middleware/authorize');
const {
  buildPublicWhatsAppErrorMessage,
  isWhatsAppTransientError,
  sendMessage,
  sendImage,
  WhatsAppApiError,
} = require('../services/whatsappService');
const cloudinaryService = require('../services/cloudinaryService');
const { enqueueWhatsAppOutbound } = require('../infrastructure/queue/producers');

const uploadImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});
const inbox = require('../services/whatsappInboxRepository');
const {
  deliverCampaignToContact,
  campaignPreviewText,
  defaultTemplateName,
  defaultTemplateLanguage,
  formatCampaignDeliveryError,
  isWithinSessionWindow,
} = require('../services/campaignDeliveryService');
const stateManager = require('../services/stateManager/stateManager');
const { processStuckConversationBatch } = require('../services/recoveryEngine/stuckConversationResolver');
const {
  getWhatsappHighlineOnlyEstablishmentIds,
} = require('../config/whatsappHighlineAccess');
const { isSaasEnforced, isSaasObserving } = require('../tenancy/featureFlags');
const tenantMiddleware = require('../tenancy/tenantMiddleware');
const requireModule = require('../tenancy/requireModule');
const requirePermission = require('../tenancy/requirePermission');
const {
  loadUserScope: loadTenantScope,
} = require('../tenancy/tenantScope');

module.exports = (pool, app) => {
  const router = express.Router();
  const allowedRoles = ['admin', 'gerente', 'hostess', 'promoter', 'recepção', 'recepcao', 'atendente'];
  const ALLOWED_STATUSES = new Set(['new', 'in_progress', 'waiting_customer', 'resolved']);
  const ALLOWED_CONTACT_STATUSES = new Set(['new', 'qualified', 'customer', 'inactive']);

  router.use(auth);
  router.use(authorize(...allowedRoles));
  // establishment_id na query é filtro de inbox/CRM — a rota valida o escopo.
  router.use(tenantMiddleware({ ignoreQueryEstablishmentId: true }));
  router.use(requireModule('whatsapp'));
  router.use((req, res, next) => {
    const perm = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)
      ? 'whatsapp:update'
      : 'whatsapp:read';
    return requirePermission(perm)(req, res, next);
  });

  function isAdminRole(user) {
    const role = String(user?.role || '').trim().toLowerCase();
    return role === 'admin' || role === 'administrador';
  }

  async function loadUepWhatsappEstablishmentIds(userId) {
    const result = await pool.query(
      `SELECT DISTINCT establishment_id
       FROM user_establishment_permissions
       WHERE user_id = $1
         AND is_active = TRUE
         AND (can_manage_whatsapp = TRUE OR can_manage_reservations = TRUE)`,
      [userId],
    );
    return result.rows
      .map((r) => Number(r.establishment_id))
      .filter((v) => Number.isFinite(v) && v > 0);
  }

  async function loadUserScope(user) {
    const highlineOnlyIds = getWhatsappHighlineOnlyEstablishmentIds(user);
    if (highlineOnlyIds) {
      return { isAdmin: false, allowedEstablishmentIds: highlineOnlyIds };
    }
    if (isAdminRole(user)) {
      return { isAdmin: true, allowedEstablishmentIds: [] };
    }

    let allowedEstablishmentIds = [];
    if (isSaasEnforced() || isSaasObserving()) {
      const scope = await loadTenantScope(pool, user);
      if (scope.isAdmin) {
        return { isAdmin: true, allowedEstablishmentIds: [] };
      }
      allowedEstablishmentIds = [...(scope.establishmentIds || [])];
    }

    const uepIds = await loadUepWhatsappEstablishmentIds(user.id);
    allowedEstablishmentIds = [
      ...new Set([...allowedEstablishmentIds, ...uepIds]),
    ];

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
        wa_id: payload?.conversation?.wa_id || payload?.wa_id || null,
        type: payload?.type || 'refresh',
      });
    }
  }

  function scheduleBestEffortWhatsAppRetry(waId, text, savedMessageId) {
    const baseDelayMs = clampInt(process.env.WHATSAPP_MANUAL_LOCAL_RETRY_MS, 5000, 120000, 15000);
    const retryDelaysMs = [baseDelayMs, baseDelayMs * 3, baseDelayMs * 8];
    let delivered = false;

    retryDelaysMs.forEach((retryDelayMs, index) => {
      setTimeout(async () => {
        if (delivered) return;
        try {
          await sendMessage(waId, text);
          delivered = true;
          console.log('[whatsappAdmin] manual send retry accepted', {
            wa_id: waId,
            message_id: savedMessageId,
            attempt: index + 1,
          });
        } catch (retryError) {
          console.error('[whatsappAdmin] manual send retry failed:', {
            wa_id: waId,
            message_id: savedMessageId,
            attempt: index + 1,
            error: retryError.message || String(retryError),
          });
        }
      }, retryDelayMs).unref?.();
    });
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function clampInt(value, min, max, fallback) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, Math.round(n)));
  }

  function assertCampaignActiveForSend(campaign) {
    if (campaign && campaign.is_active === false) {
      return { ok: false, message: 'Campanha inativa. Ative-a antes de enviar.' };
    }
    return { ok: true };
  }

  function parseContactsCsvText(csvText) {
    const lines = String(csvText || '')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) return [];

    const header = lines[0].split(/[,;]/).map((h) => h.trim().toLowerCase().replace(/^"|"$/g, ''));
    const headerKeys = [
      'wa_id',
      'telefone',
      'phone',
      'celular',
      'whatsapp',
      'nome',
      'contact_name',
      'name',
      'email',
      'client_email',
      'e-mail',
      'e_mail',
      'marketing_opt_in',
      'opt_in',
      'optin',
      'tags',
      'etiquetas',
    ];
    const hasHeader = header.some((h) => headerKeys.includes(h));
    const dataLines = hasHeader ? lines.slice(1) : lines;

    const colFirst = (names) => {
      if (!hasHeader) return -1;
      for (const name of names) {
        const idx = header.indexOf(name);
        if (idx >= 0) return idx;
      }
      return -1;
    };

    const idxWa = hasHeader
      ? colFirst(['wa_id', 'telefone', 'phone', 'celular', 'whatsapp'])
      : 0;
    const idxName = hasHeader ? colFirst(['contact_name', 'nome', 'name']) : 1;
    const idxEmail = hasHeader ? colFirst(['client_email', 'email', 'e-mail', 'e_mail']) : -1;
    const idxOptIn = hasHeader ? colFirst(['marketing_opt_in', 'opt_in', 'optin']) : 2;
    const idxTags = hasHeader ? colFirst(['tags', 'etiquetas']) : 3;

    return dataLines.map((line, lineNo) => {
      const cells = line.split(/[,;]/).map((c) => c.trim().replace(/^"|"$/g, ''));
      const row = {};
      if (idxWa >= 0 && cells[idxWa]) row.wa_id = cells[idxWa];
      if (idxName >= 0 && cells[idxName]) row.contact_name = cells[idxName];
      if (idxEmail >= 0 && cells[idxEmail]) row.client_email = cells[idxEmail];
      if (idxOptIn >= 0 && cells[idxOptIn] !== undefined && cells[idxOptIn] !== '') {
        row.marketing_opt_in = cells[idxOptIn];
      }
      if (idxTags >= 0 && cells[idxTags]) row.tags = cells[idxTags];
      if (!hasHeader && cells[0]) row.wa_id = cells[0];
      if (!hasHeader && cells[1]) row.contact_name = cells[1];
      row._line = lineNo + (hasHeader ? 2 : 1);
      return row;
    });
  }

  function assertCampaignHasContent(campaign) {
    const body = String(campaign?.message_template || '').trim();
    const image = String(campaign?.image_url || '').trim();
    if (!body && !image) {
      return { ok: false, message: 'Campanha precisa de texto e/ou imagem.' };
    }
    return { ok: true };
  }

  function contactEstablishmentForAccess(contact, campaign) {
    const contactEst = Number(contact?.last_establishment_id);
    if (Number.isFinite(contactEst) && contactEst > 0) return contactEst;
    const campaignEst = Number(campaign?.establishment_id);
    if (Number.isFinite(campaignEst) && campaignEst > 0) return campaignEst;
    return null;
  }

  function campaignSendErrorResponse(error) {
    const message = formatCampaignDeliveryError(error);
    const isValidation =
      error instanceof Error &&
      !error.name?.includes('WhatsApp') &&
      !error.responseBody &&
      (message.includes('janela de 24h') ||
        message.includes('meta_template') ||
        message.includes('sem texto') ||
        message.includes('sem wa_id'));
    const status =
      isValidation || (error instanceof WhatsAppApiError && !error.isTransient) ? 400 : 502;
    return { status, message };
  }

  async function persistCampaignOutbound(pool, { waId, contactName, establishmentId, campaign, delivery, intent }) {
    const preview = campaignPreviewText(campaign);
    const imageUrl = String(campaign?.image_url || '').trim();
    // Não reatribui establishment_id da conversa — campanha é outbound de marketing;
    // a casa do thread continua a definida pelo atendimento/IA (setConversationEstablishment).
    const conv = await inbox.upsertConversation(pool, {
      waId,
      contactName,
      establishmentId: null,
    });
    const saved = await inbox.insertMessage(pool, {
      conversationId: conv.id,
      direction: 'outbound',
      body: preview,
      intent: intent || 'CAMPAIGN_SEND',
      suggestedReply: null,
      rawPayload: delivery
        ? {
            mode: delivery.mode,
            results: (delivery.results || []).map((item) => ({
              type: item.type,
              template_name: item.template_name || null,
            })),
          }
        : null,
      messageType: imageUrl ? 'image' : 'text',
      mediaUrl: imageUrl || null,
      mediaMime: imageUrl ? 'image/jpeg' : null,
    });
    return saved;
  }

  function parseSendMode(value) {
    const mode = String(value || 'auto').trim().toLowerCase();
    if (mode === 'session' || mode === 'template' || mode === 'auto') return mode;
    return 'auto';
  }

  function contactEligibleForCampaign(contact, campaign, options = {}) {
    const enforceAudienceFilters = options.enforceAudienceFilters !== false;
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

    if (enforceAudienceFilters) {
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
    }
    if (optInRequired && !contact.marketing_opt_in) {
      return { ok: false, reason: 'Campanha exige opt-in explícito' };
    }
    return { ok: true };
  }

  function maxBatchChunkSize() {
    return clampInt(process.env.WHATSAPP_CAMPAIGN_BATCH_MAX_CHUNK, 1, 200, 50);
  }

  router.get('/conversations', async (req, res) => {
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
      const establishmentIdRaw = req.query?.establishment_id;
      const establishmentId =
        establishmentIdRaw === 'unassigned'
          ? null
          : establishmentIdRaw !== undefined && establishmentIdRaw !== ''
            ? Number(establishmentIdRaw)
            : undefined;
      const unassignedOnly = establishmentIdRaw === 'unassigned';
      const listLimit = clampInt(
        req.query?.limit ?? process.env.WHATSAPP_INBOX_LIST_LIMIT,
        50,
        1000,
        500
      );

      const listOptions = {
        limit: listLimit,
        status,
        assignedUserId: Number.isFinite(assignedUserId) ? assignedUserId : undefined,
        allowedEstablishmentIds: scope.isAdmin ? null : scope.allowedEstablishmentIds,
        unassignedOnly,
        userId: Number(req.user?.id),
      };
      if (Number.isFinite(establishmentId) && establishmentId > 0) {
        if (!canAccessEstablishment(scope, establishmentId)) {
          return res.status(403).json({ message: 'Acesso negado para este estabelecimento' });
        }
        listOptions.establishmentId = establishmentId;
      }

      const [rows, counts] = await Promise.all([
        inbox.listConversations(pool, listOptions),
        inbox.countConversationsByEstablishment(pool, {
          allowedEstablishmentIds: scope.isAdmin ? null : scope.allowedEstablishmentIds,
        }),
      ]);

      return res.json({
        conversations: rows,
        meta: {
          limit: listLimit,
          returned: rows.length,
          total: counts.total,
          unassigned: counts.unassigned,
          by_establishment: counts.byEstablishment,
          truncated: rows.length >= listLimit,
        },
      });
    } catch (e) {
      console.error('[whatsappAdmin] list conversations:', e);
      return res.status(500).json({ message: 'Erro ao listar conversas' });
    }
  });

  router.get('/conversations/:waId/messages', async (req, res) => {
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
      const requestedLimit = Number(req.query?.limit);
      const limit =
        Number.isFinite(requestedLimit) && requestedLimit > 0 && requestedLimit <= 2000
          ? Math.floor(requestedLimit)
          : 500;
      const messages = await inbox.listMessages(pool, conv.id, limit);
      return res.json({ conversation: conv, messages, limit });
    } catch (e) {
      console.error('[whatsappAdmin] list messages:', e);
      return res.status(500).json({ message: 'Erro ao listar mensagens' });
    }
  });

  router.post('/conversations/:waId/mark-read', async (req, res) => {
    const { waId } = req.params;
    try {
      const scope = await loadUserScope(req.user);
      const userId = Number(req.user?.id);
      if (!Number.isFinite(userId) || userId <= 0) {
        return res.status(401).json({ message: 'Usuário não identificado' });
      }
      const conv = await inbox.getConversationByWaId(pool, waId);
      if (!conv) {
        return res.status(404).json({ message: 'Conversa não encontrada' });
      }
      if (!canAccessEstablishment(scope, conv.establishment_id)) {
        return res.status(403).json({ message: 'Acesso negado para este estabelecimento' });
      }
      const lastMessageId = Number(req.body?.last_message_id);
      const row = await inbox.markConversationRead(pool, {
        userId,
        conversationId: conv.id,
        lastMessageId: Number.isFinite(lastMessageId) && lastMessageId > 0 ? lastMessageId : null,
      });
      return res.json({ ok: true, read_state: row });
    } catch (e) {
      console.error('[whatsappAdmin] mark-read:', e);
      return res.status(500).json({ message: 'Erro ao marcar conversa como lida' });
    }
  });

  router.post('/conversations/:waId/takeover', async (req, res) => {
    const { waId } = req.params;
    const hours = Number(req.body?.hours);
    const untilManualResume = req.body?.until_resume !== false;
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
      let conv = null;
      if (untilManualResume) {
        conv = await inbox.setHumanTakeoverUntilManualResume(pool, waId);
      } else {
        conv = await inbox.setHumanTakeoverHours(pool, waId, Number.isFinite(hours) && hours > 0 ? hours : 24);
      }
      if (!conv) {
        return res.status(404).json({ message: 'Conversa não encontrada' });
      }
      emitInbox({ type: 'takeover', conversation: conv });
      return res.json({ ok: true, conversation: conv, ai_paused: true });
    } catch (e) {
      console.error('[whatsappAdmin] takeover:', e);
      return res.status(500).json({ message: 'Erro ao assumir conversa' });
    }
  });

  router.post('/conversations/stuck/resolve', async (req, res) => {
    try {
      const scope = await loadUserScope(req.user);
      if (!scope.isAdmin && scope.allowedEstablishmentIds.length === 0) {
        return res.status(403).json({ message: 'Sem permissão' });
      }
      const waId = req.body?.wa_id ? String(req.body.wa_id).trim() : null;
      const result = await processStuckConversationBatch(pool, app, {
        force: true,
        waId,
      });
      emitInbox({ type: 'stuck_resolve_batch' });
      return res.json({ ok: true, result });
    } catch (e) {
      console.error('[whatsappAdmin] stuck resolve batch:', e);
      return res.status(500).json({ message: 'Erro ao retomar conversas travadas' });
    }
  });

  router.post('/conversations/:waId/resolve-stuck', async (req, res) => {
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
      const result = await processStuckConversationBatch(pool, app, {
        force: true,
        waId,
      });
      emitInbox({ type: 'stuck_resolve', wa_id: waId });
      return res.json({ ok: true, result });
    } catch (e) {
      console.error('[whatsappAdmin] resolve-stuck:', e);
      return res.status(500).json({ message: 'Erro ao retomar conversa travada' });
    }
  });

  router.post('/conversations/resume-ai-unassigned', async (req, res) => {
    try {
      const scope = await loadUserScope(req.user);
      if (!scope.isAdmin && scope.allowedEstablishmentIds.length === 0) {
        return res.status(403).json({ message: 'Sem permissão' });
      }

      const params = [];
      let scopeFilter = '';
      if (!scope.isAdmin) {
        params.push(scope.allowedEstablishmentIds);
        scopeFilter = `AND c.establishment_id = ANY($${params.length}::int[])`;
      }

      const result = await pool.query(
        `WITH target AS (
           SELECT c.id
             FROM whatsapp_conversations c
            WHERE c.human_takeover_until IS NOT NULL
              AND c.human_takeover_until > NOW()
              AND c.assigned_user_id IS NULL
              AND c.status <> 'resolved'
              ${scopeFilter}
            ORDER BY c.updated_at DESC
            LIMIT 100
         )
         UPDATE whatsapp_conversations c
            SET human_takeover_until = NULL,
                updated_at = NOW()
           FROM target
          WHERE c.id = target.id
          RETURNING c.id, c.wa_id`,
        params
      );

      emitInbox({ type: 'resume_ai_unassigned' });
      return res.json({
        ok: true,
        resumed_count: result.rowCount,
        wa_ids: result.rows.map((row) => row.wa_id),
      });
    } catch (e) {
      console.error('[whatsappAdmin] resume-ai-unassigned:', e);
      return res.status(500).json({ message: 'Erro ao retomar IA das conversas sem atendente' });
    }
  });

  router.post('/conversations/:waId/resume', async (req, res) => {
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
      if (existing?.id) {
        try {
          await stateManager.reopenFromHandoff(pool, existing.id, {
            lockedEstablishmentId: existing.establishment_id || null,
          });
        } catch (stateError) {
          console.warn('[whatsappAdmin] resume: falha ao reabrir estado da sessão:', stateError.message);
        }
      }
      emitInbox({ type: 'resume', conversation: conv });
      return res.json({ ok: true, conversation: conv });
    } catch (e) {
      console.error('[whatsappAdmin] resume:', e);
      return res.status(500).json({ message: 'Erro ao retomar IA da conversa' });
    }
  });

  router.post('/conversations/:waId/send', async (req, res) => {
    const rawWaId = String(req.params.waId || '').trim();
    const normalizedTo =
      inbox.normalizeWaId(rawWaId) || rawWaId.replace(/\D/g, '');
    const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
    if (!text) {
      return res.status(400).json({ message: 'text é obrigatório' });
    }
    if (!normalizedTo || normalizedTo.length < 12) {
      return res.status(400).json({ message: 'Número WhatsApp inválido para envio.' });
    }
    try {
      const scope = await loadUserScope(req.user);
      let conv =
        (await inbox.getConversationByWaId(pool, normalizedTo)) ||
        (rawWaId !== normalizedTo
          ? await inbox.getConversationByWaId(pool, rawWaId)
          : null);
      if (!conv) {
        if (!scope.isAdmin) {
          return res.status(404).json({ message: 'Conversa não encontrada' });
        }
        conv = await inbox.upsertConversation(pool, {
          waId: normalizedTo,
          contactName: null,
        });
      } else if (!canAccessEstablishment(scope, conv.establishment_id)) {
        return res.status(403).json({ message: 'Acesso negado para este estabelecimento' });
      }

      const inSessionWindow = await isWithinSessionWindow(pool, normalizedTo);
      if (!inSessionWindow) {
        return res.status(400).json({
          code: 'OUTSIDE_24H_WINDOW',
          message:
            'Este cliente está fora da janela de 24h da Meta. Para receber texto livre, ele precisa ter enviado uma mensagem nas últimas 24 horas. Peça para ele mandar um "oi" no WhatsApp ou use campanha com template aprovado.',
        });
      }

      const wasHumanTakeoverActive = await inbox.isHumanTakeoverActive(pool, conv.wa_id);
      let sendResult;
      try {
        sendResult = await sendMessage(normalizedTo, text);
      } catch (sendError) {
        if (!isWhatsAppTransientError(sendError)) {
          throw sendError;
        }

        const queuedFallback = await enqueueWhatsAppOutbound({
          to: normalizedTo,
          text,
          meta: {
            source: 'admin_manual_send_transient_fallback',
            user_id: req.user?.id || null,
          },
        });

        if (queuedFallback.enqueued) {
          sendResult = {
            queued: true,
            mode: 'bullmq',
            job_id: queuedFallback.jobId,
            original_error: buildPublicWhatsAppErrorMessage(sendError),
          };
        } else {
          throw sendError;
        }
      }

      const metaMessageId = sendResult?.messages?.[0]?.id
        ? String(sendResult.messages[0].id)
        : null;
      if (!sendResult?.queued && !metaMessageId) {
        throw new Error(
          'A Meta não confirmou o envio (sem ID de mensagem). A mensagem não foi entregue ao cliente.',
        );
      }

      const deliveryPayload = sendResult?.queued
        ? sendResult
        : {
            ...sendResult,
            delivery_status: 'accepted',
            meta_message_id: metaMessageId,
          };

      const saved = await inbox.insertMessage(pool, {
        conversationId: conv.id,
        direction: 'outbound',
        body: text,
        intent: null,
        suggestedReply: null,
        rawPayload: deliveryPayload,
      });

      const updatedConv = wasHumanTakeoverActive
        ? await inbox.setHumanTakeoverUntilManualResume(pool, conv.wa_id)
        : await inbox.getConversationByWaId(pool, conv.wa_id);
      emitInbox({
        type: 'outbound',
        conversation: updatedConv,
        message: saved,
      });

      return res.json({
        ok: true,
        message: saved,
        whatsapp: deliveryPayload,
        conversation: updatedConv,
        ai_paused: wasHumanTakeoverActive,
        pending_delivery: Boolean(sendResult?.queued),
        meta_message_id: metaMessageId,
      });
    } catch (e) {
      console.error('[whatsappAdmin] send:', e);
      const isTransient = isWhatsAppTransientError(e);
      return res.status(isTransient ? 503 : 400).json({
        message: formatCampaignDeliveryError(e),
        transient: isTransient,
      });
    }
  });

  // Envio manual de imagem para o cliente. A imagem é hospedada no Cloudinary
  // (URL pública) e enviada à Meta via link; a mesma URL é guardada para
  // renderizar a miniatura no painel. O texto do campo de digitação vira legenda.
  router.post(
    '/conversations/:waId/send-image',
    uploadImage.single('image'),
    async (req, res) => {
      const { waId } = req.params;
      const file = req.file;
      const caption = typeof req.body?.caption === 'string' ? req.body.caption.trim() : '';

      if (!file) {
        return res.status(400).json({ message: 'Arquivo de imagem é obrigatório (campo "image").' });
      }
      const mime = file.mimetype || '';
      if (!mime.startsWith('image/')) {
        return res.status(400).json({ message: 'Apenas arquivos de imagem são permitidos.' });
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

        const ext = (mime.split('/')[1] || 'jpg').split(';')[0];
        const fileName = `wpp_${waId}_${Date.now()}.${ext}`;
        const uploaded = await cloudinaryService.uploadFile(fileName, file.buffer, {
          folder: 'whatsapp-outbound',
        });
        const secureUrl = uploaded.secureUrl;

        const wasHumanTakeoverActive = await inbox.isHumanTakeoverActive(pool, waId);
        const sendResult = await sendImage(waId, { link: secureUrl, caption });

        const saved = await inbox.insertMessage(pool, {
          conversationId: conv.id,
          direction: 'outbound',
          body: caption || '',
          messageType: 'image',
          mediaUrl: secureUrl,
          mediaMime: mime,
          mediaPublicId: uploaded.publicId || null,
          intent: null,
          suggestedReply: null,
          rawPayload: sendResult || null,
        });

        const updatedConv = wasHumanTakeoverActive
          ? await inbox.setHumanTakeoverUntilManualResume(pool, waId)
          : await inbox.getConversationByWaId(pool, waId);
        emitInbox({
          type: 'outbound',
          conversation: updatedConv,
          message: saved,
        });

        return res.json({
          ok: true,
          message: saved,
          whatsapp: sendResult,
          conversation: updatedConv,
          ai_paused: wasHumanTakeoverActive,
        });
      } catch (e) {
        console.error('[whatsappAdmin] send-image:', e);
        const isTransient = isWhatsAppTransientError(e);
        return res.status(isTransient ? 503 : 500).json({
          message: buildPublicWhatsAppErrorMessage(e),
          transient: isTransient,
        });
    }
  });

  router.post('/conversations/:waId/status', async (req, res) => {
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

  router.post('/conversations/:waId/assign-self', async (req, res) => {
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
      await inbox.assignConversation(pool, waId, req.user.id);
      const conv = await inbox.setHumanTakeoverUntilManualResume(pool, waId);
      emitInbox({ type: 'assign', conversation: conv });
      return res.json({ ok: true, conversation: conv, ai_paused: true });
    } catch (e) {
      console.error('[whatsappAdmin] assign-self:', e);
      return res.status(500).json({ message: 'Erro ao assumir conversa para atendimento' });
    }
  });

  router.post('/conversations/:waId/unassign', async (req, res) => {
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

  router.get('/contacts', async (req, res) => {
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

  router.get('/contacts/export.csv', async (req, res) => {
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

  router.post('/contacts/backfill-opt-in', async (req, res) => {
    try {
      const scope = await loadUserScope(req.user);
      const establishmentId = Number(req.body?.establishment_id);
      if (
        Number.isFinite(establishmentId) &&
        establishmentId > 0 &&
        !canAccessEstablishment(scope, establishmentId)
      ) {
        return res.status(403).json({ message: 'Acesso negado para este estabelecimento' });
      }
      if (
        !scope.isAdmin &&
        Number.isFinite(establishmentId) &&
        establishmentId > 0 &&
        scope.allowedEstablishmentIds.length > 0 &&
        !scope.allowedEstablishmentIds.includes(establishmentId)
      ) {
        return res.status(403).json({ message: 'Acesso negado para este estabelecimento' });
      }

      const result = await inbox.backfillMarketingOptInFromConversations(pool, {
        establishmentId: Number.isFinite(establishmentId) && establishmentId > 0 ? establishmentId : undefined,
      });
      return res.json({
        ok: true,
        message: `${result.updated} contato(s) receberam opt-in (já tinham conversado antes).`,
        ...result,
      });
    } catch (e) {
      console.error('[whatsappAdmin] contacts/backfill-opt-in:', e);
      return res.status(500).json({ message: 'Erro ao conceder opt-in em massa' });
    }
  });

  router.post('/contacts/import', async (req, res) => {
    try {
      const scope = await loadUserScope(req.user);
      const establishmentId = Number(req.body?.establishment_id);
      if (!Number.isFinite(establishmentId) || establishmentId <= 0) {
        return res.status(400).json({ message: 'establishment_id é obrigatório' });
      }
      if (!canAccessEstablishment(scope, establishmentId)) {
        return res.status(403).json({ message: 'Acesso negado para este estabelecimento' });
      }

      let rows = Array.isArray(req.body?.contacts) ? req.body.contacts : [];
      if (rows.length === 0 && typeof req.body?.csv_text === 'string' && req.body.csv_text.trim()) {
        rows = parseContactsCsvText(req.body.csv_text);
      }
      if (rows.length === 0) {
        return res.status(400).json({
          message:
            'Envie contacts[] (JSON) ou csv_text. Colunas aceitas: telefone/wa_id (obrigatório), nome, email, marketing_opt_in, tags. O estabelecimento é escolhido no painel.',
        });
      }
      if (rows.length > 5000) {
        return res.status(400).json({ message: 'Máximo de 5000 contatos por importação' });
      }

      const defaultMarketingOptIn = parseBoolean(req.body?.default_marketing_opt_in) === true;
      const sourceTag =
        typeof req.body?.source_tag === 'string' && req.body.source_tag.trim()
          ? req.body.source_tag.trim()
          : 'importado';

      const result = await inbox.importContacts(pool, {
        establishmentId,
        rows,
        defaultMarketingOptIn,
        sourceTag,
      });

      return res.json({
        ok: true,
        message: `Importação concluída: ${result.imported} novo(s), ${result.updated} atualizado(s), ${result.skipped} ignorado(s).`,
        establishment_id: establishmentId,
        ...result,
      });
    } catch (e) {
      console.error('[whatsappAdmin] contacts/import:', e);
      return res.status(500).json({ message: e.message || 'Erro ao importar contatos' });
    }
  });

  router.patch('/contacts/:id', async (req, res) => {
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

  router.post('/campaigns/upload-image', uploadImage.single('image'), async (req, res) => {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ message: 'Arquivo de imagem é obrigatório (campo "image").' });
    }
    const mime = file.mimetype || '';
    if (!mime.startsWith('image/')) {
      return res.status(400).json({ message: 'Apenas arquivos de imagem são permitidos.' });
    }
    try {
      const ext = (mime.split('/')[1] || 'jpg').split(';')[0];
      const fileName = `campaign_${Date.now()}.${ext}`;
      const uploaded = await cloudinaryService.uploadFile(fileName, file.buffer, {
        folder: 'whatsapp-campaigns',
      });
      return res.json({ ok: true, image_url: uploaded.secureUrl, public_id: uploaded.publicId || null });
    } catch (e) {
      console.error('[whatsappAdmin] campaign upload-image:', e);
      return res.status(500).json({ message: 'Erro ao enviar imagem da campanha' });
    }
  });

  router.get('/campaigns/meta-template-info', async (_req, res) => {
    return res.json({
      default_template_name: defaultTemplateName(),
      default_template_language: defaultTemplateLanguage(),
      template_structure: {
        category: 'MARKETING',
        header: 'IMAGE (dinâmico — URL da campanha)',
        body: '{{1}} título + {{2}} texto principal',
        note: 'Crie e aprove este template no WhatsApp Manager antes de disparos fora da janela de 24h.',
      },
      send_modes: {
        auto: 'Imagem+texto na janela 24h; template Meta fora dela',
        session: 'Sempre imagem+texto (só entrega se cliente falou nas últimas 24h)',
        template: 'Sempre template Meta aprovado (marketing em massa)',
      },
    });
  });

  router.get('/campaigns', async (req, res) => {
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

  router.post('/campaigns', async (req, res) => {
    try {
      const scope = await loadUserScope(req.user);
      const establishmentId = Number(req.body?.establishment_id);
      const name = String(req.body?.name || '').trim();
      const messageTemplate = String(req.body?.message_template || '').trim();
      const headline = String(req.body?.headline || '').trim();
      const imageUrl = String(req.body?.image_url || '').trim();
      const sendMode = parseSendMode(req.body?.send_mode);
      const metaTemplateName = String(req.body?.meta_template_name || '').trim() || null;
      const metaTemplateLanguage =
        String(req.body?.meta_template_language || '').trim() || defaultTemplateLanguage();
      if (!Number.isFinite(establishmentId) || establishmentId <= 0) {
        return res.status(400).json({ message: 'establishment_id inválido' });
      }
      if (!name) {
        return res.status(400).json({ message: 'name é obrigatório' });
      }
      if (!messageTemplate && !imageUrl) {
        return res.status(400).json({ message: 'Informe o texto da campanha e/ou uma imagem.' });
      }
      if (!canAccessEstablishment(scope, establishmentId)) {
        return res.status(403).json({ message: 'Acesso negado para este estabelecimento' });
      }
      const campaign = await inbox.createCampaign(pool, {
        establishmentId,
        name,
        messageTemplate: messageTemplate || ' ',
        headline: headline || name,
        imageUrl: imageUrl || null,
        sendMode,
        metaTemplateName,
        metaTemplateLanguage,
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

  router.put('/campaigns/:id', async (req, res) => {
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
        headline: typeof req.body?.headline === 'string' ? req.body.headline.trim() : null,
        messageTemplate:
          typeof req.body?.message_template === 'string'
            ? req.body.message_template.trim()
            : null,
        imageUrl: typeof req.body?.image_url === 'string' ? req.body.image_url.trim() : null,
        sendMode: req.body?.send_mode ? parseSendMode(req.body.send_mode) : null,
        metaTemplateName:
          typeof req.body?.meta_template_name === 'string'
            ? req.body.meta_template_name.trim() || null
            : null,
        metaTemplateLanguage:
          typeof req.body?.meta_template_language === 'string'
            ? req.body.meta_template_language.trim()
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

  router.delete('/campaigns/:id', async (req, res) => {
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

  router.get('/campaigns/:id/audience-preview', async (req, res) => {
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

  router.post('/campaigns/:id/send-to-contact', async (req, res) => {
    const campaignId = Number(req.params?.id);
    const contactIdRaw = req.body?.contact_id ?? req.query?.contact_id;
    const contactId = Number(contactIdRaw);
    const waIdRaw = req.body?.wa_id ?? req.query?.wa_id;
    const waId = typeof waIdRaw === 'string' ? waIdRaw.trim() : '';
    if (!Number.isFinite(campaignId) || campaignId <= 0) {
      return res.status(400).json({ message: 'id da campanha inválido' });
    }
    if ((!Number.isFinite(contactId) || contactId <= 0) && !waId) {
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

      const activeCheck = assertCampaignActiveForSend(campaign);
      if (!activeCheck.ok) {
        return res.status(400).json({ message: activeCheck.message });
      }

      const contact = Number.isFinite(contactId) && contactId > 0
        ? await inbox.getContactById(pool, contactId)
        : await inbox.getContactByWaId(pool, waId);
      if (!contact) {
        return res.status(404).json({ message: 'Contato não encontrado' });
      }
      const accessEstablishmentId = contactEstablishmentForAccess(contact, campaign);
      if (!canAccessEstablishment(scope, accessEstablishmentId)) {
        return res.status(403).json({ message: 'Acesso negado para este contato' });
      }

      const eligibility = contactEligibleForCampaign(contact, campaign, {
        enforceAudienceFilters: false,
      });
      if (!eligibility.ok) {
        return res.status(400).json({
          message:
            eligibility.reason === 'Sem opt-in de marketing'
              ? 'Envio bloqueado: contato sem opt-in de marketing.'
              : `Envio bloqueado: ${eligibility.reason}.`,
        });
      }

      const contentCheck = assertCampaignHasContent(campaign);
      if (!contentCheck.ok) {
        return res.status(400).json({ message: contentCheck.message });
      }

      const delivery = await deliverCampaignToContact(pool, campaign, contact);
      const saved = await persistCampaignOutbound(pool, {
        waId: contact.wa_id,
        contactName: contact.contact_name,
        establishmentId: campaign.establishment_id,
        campaign,
        delivery,
        intent: 'CAMPAIGN_SEND',
      });
      const primaryResult = delivery.results?.[0]?.response;
      const metaWaId = Array.isArray(primaryResult?.contacts)
        ? primaryResult.contacts[0]?.wa_id || null
        : null;
      const metaStatus = Array.isArray(primaryResult?.messages)
        ? primaryResult.messages[0]?.message_status || null
        : null;
      console.log(
        `[whatsappAdmin] campaign send accepted campaign=${campaign.id} contact=${contact.id} to=${contact.wa_id} mode=${delivery.mode} metaWaId=${metaWaId || 'n/a'} status=${metaStatus || 'n/a'}`
      );
      emitInbox({ type: 'outbound' });
      return res.json({
        ok: true,
        message: saved,
        delivery_mode: delivery.mode,
        whatsapp: {
          accepted: true,
          to: contact.wa_id,
          mode: delivery.mode,
          meta_wa_id: metaWaId,
          meta_status: metaStatus,
          results: delivery.results,
        },
      });
    } catch (e) {
      console.error('[whatsappAdmin] campaign send-to-contact:', e);
      const { status, message } = campaignSendErrorResponse(e);
      return res.status(status).json({ message: message || 'Erro ao enviar campanha para contato' });
    }
  });

  router.post('/campaigns/:id/batches', async (req, res) => {
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

      const activeCheck = assertCampaignActiveForSend(campaign);
      if (!activeCheck.ok) {
        return res.status(400).json({ message: activeCheck.message });
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

  router.get('/campaigns/:id/batches', async (req, res) => {
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

  router.get('/campaign-batches/:batchId', async (req, res) => {
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

  router.get('/campaign-batches/:batchId/logs', async (req, res) => {
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

  router.post('/campaign-batches/:batchId/cancel', async (req, res) => {
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

  router.post('/campaign-batches/:batchId/process', async (req, res) => {
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

      const activeCheck = assertCampaignActiveForSend(campaign);
      if (!activeCheck.ok) {
        await inbox.updateCampaignBatchFields(pool, batchId, {
          status: 'failed',
          errorMessage: activeCheck.message,
          completedAt: new Date(),
        });
        return res.status(400).json({ message: activeCheck.message });
      }

      const contentCheck = assertCampaignHasContent(campaign);
      if (!contentCheck.ok) {
        await inbox.updateCampaignBatchFields(pool, batchId, {
          status: 'failed',
          errorMessage: contentCheck.message,
          completedAt: new Date(),
        });
        return res.status(400).json({ message: contentCheck.message });
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
          const delivery = await deliverCampaignToContact(pool, campaign, contact);
          await persistCampaignOutbound(pool, {
            waId: contact.wa_id,
            contactName: contact.contact_name,
            establishmentId: campaign.establishment_id,
            campaign,
            delivery,
            intent: 'CAMPAIGN_BATCH',
          });
          chunkSentOk += 1;
          await inbox.insertCampaignSendLog(pool, {
            batchId,
            contactId: contact.id,
            waId: contact.wa_id,
            status: 'sent',
            errorMessage: null,
            meta: { mode: delivery.mode },
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

  router.get('/reports/summary', async (req, res) => {
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
