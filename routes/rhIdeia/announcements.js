'use strict';

const express = require('express');
const { applyCommonMiddleware, requireManage, writeAudit } = require('./middleware');
const { buildVisibilityClause, applyVisibilityToWhere } = require('../../services/rhIdeia/scopeHelpers');
const {
  str,
  parseId,
  parseBoolean,
  pickScope,
  pickPriority,
  pickTimestamp,
  parseEstablishmentId,
  resolveScopeEstablishment,
} = require('../../validators/rhIdeiaValidator');
const { PRIORITIES } = require('../../services/rhIdeia/constants');

const INVALID_PRIORITY = `Prioridade inválida. Use uma de: ${PRIORITIES.join(', ')}.`;

module.exports = (pool) => {
  const router = express.Router({ mergeParams: true });
  applyCommonMiddleware(router, pool);

  router.get('/announcements', async (req, res) => {
    const orgId = req.iriOrganizationId;
    const userId = req.user.id || req.user.userId;
    const scope = String(req.query.scope || 'active').trim().toLowerCase();
    const showAll = scope === 'all' && req.iriCanManage;

    const vis = buildVisibilityClause({
      alias: 'a',
      orgParamIndex: 1,
      userEstablishmentIds: req.iriUserEstablishmentIds,
      manageAll: req.iriCanManage,
    });
    const params = [orgId];
    const where = applyVisibilityToWhere([], vis, params);

    if (!showAll) {
      where.push('a.is_active = TRUE');
      where.push('(a.expires_at IS NULL OR a.expires_at > NOW())');
    }

    try {
      const result = await pool.query(
        `SELECT a.id, a.organization_id, a.establishment_id, a.scope, a.sector_id,
                a.title, a.body, a.priority, a.requires_ack, a.created_by,
                a.published_at, a.expires_at, a.is_active,
                s.name AS sector_name,
                u.name AS created_by_name,
                r.received_at, r.read_at, r.acked_at,
                (SELECT COUNT(*)::int FROM iri_announcement_reads x WHERE x.announcement_id = a.id) AS receipts_count,
                (SELECT COUNT(*)::int FROM iri_announcement_reads x
                  WHERE x.announcement_id = a.id AND x.acked_at IS NOT NULL) AS ack_count
           FROM iri_announcements a
           LEFT JOIN iri_sectors s ON s.id = a.sector_id
           LEFT JOIN users u ON u.id = a.created_by
           LEFT JOIN iri_announcement_reads r
             ON r.announcement_id = a.id AND r.user_id = $${params.length + 1}
          WHERE ${where.join(' AND ')}
          ORDER BY a.published_at DESC
          LIMIT 100`,
        [...params, userId || 0]
      );
      return res.json({
        success: true,
        data: result.rows,
        meta: { can_manage: req.iriCanManage, scope: showAll ? 'all' : 'active' },
      });
    } catch (err) {
      console.error(`[iri] announcements list organization_id=${orgId}:`, err.message);
      return res.status(500).json({ success: false, message: 'Falha ao listar comunicados.' });
    }
  });

  router.post('/announcements', requireManage, async (req, res) => {
    const title = str(req.body.title, 300);
    const body = str(req.body.body, 8000);
    if (!title || !body) {
      return res.status(400).json({ success: false, message: 'Título e mensagem são obrigatórios.' });
    }

    const priority = pickPriority(req.body.priority, 'normal');
    if (!priority.ok) return res.status(400).json({ success: false, message: INVALID_PRIORITY });

    const scopePick = pickScope(req.body.scope, 'organization');
    if (!scopePick.ok) return res.status(400).json({ success: false, message: 'Escopo inválido.' });

    const establishmentId = resolveScopeEstablishment(
      scopePick.value,
      parseEstablishmentId(req.body.establishment_id)
    );
    if (scopePick.value === 'establishment' && !establishmentId) {
      return res.status(400).json({ success: false, message: 'establishment_id obrigatório para escopo de unidade.' });
    }

    const expiresAt = pickTimestamp(req.body.expires_at);
    if (!expiresAt.ok) {
      return res.status(400).json({ success: false, message: 'Data de expiração inválida.' });
    }

    const actorUserId = req.user.id || req.user.userId;
    try {
      const result = await pool.query(
        `INSERT INTO iri_announcements
          (organization_id, establishment_id, scope, sector_id, title, body,
           priority, requires_ack, created_by, expires_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         RETURNING *`,
        [
          req.iriOrganizationId,
          establishmentId,
          scopePick.value,
          parseId(req.body.sector_id),
          title,
          body,
          priority.value,
          parseBoolean(req.body.requires_ack, true),
          actorUserId,
          expiresAt.value,
        ]
      );
      await writeAudit(pool, {
        organizationId: req.iriOrganizationId,
        establishmentId,
        entityType: 'announcement',
        entityId: result.rows[0].id,
        action: 'create',
        actorUserId,
      });
      return res.status(201).json({ success: true, data: result.rows[0] });
    } catch (err) {
      console.error(`[iri] announcement create organization_id=${req.iriOrganizationId}:`, err.message);
      return res.status(500).json({ success: false, message: 'Falha ao publicar comunicado.' });
    }
  });

  router.patch('/announcements/:id', requireManage, async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: 'ID inválido.' });

    const sets = [];
    const params = [];
    const pushSet = (column, value) => {
      params.push(value);
      sets.push(`${column} = $${params.length}`);
    };

    if (req.body.is_active !== undefined) pushSet('is_active', parseBoolean(req.body.is_active, true));
    if (req.body.priority !== undefined) {
      const priority = pickPriority(req.body.priority, null);
      if (!priority.ok || !priority.value) {
        return res.status(400).json({ success: false, message: INVALID_PRIORITY });
      }
      pushSet('priority', priority.value);
    }
    if (req.body.expires_at !== undefined) {
      const expiresAt = pickTimestamp(req.body.expires_at);
      if (!expiresAt.ok) {
        return res.status(400).json({ success: false, message: 'Data de expiração inválida.' });
      }
      pushSet('expires_at', expiresAt.value);
    }
    if (sets.length === 0) {
      return res.status(400).json({ success: false, message: 'Nenhum campo para atualizar.' });
    }

    params.push(id, req.iriOrganizationId);
    try {
      const result = await pool.query(
        `UPDATE iri_announcements SET ${sets.join(', ')}
          WHERE id = $${params.length - 1} AND organization_id = $${params.length}
          RETURNING *`,
        params
      );
      if (!result.rows[0]) {
        return res.status(404).json({ success: false, message: 'Comunicado não encontrado.' });
      }
      await writeAudit(pool, {
        organizationId: req.iriOrganizationId,
        establishmentId: result.rows[0].establishment_id,
        entityType: 'announcement',
        entityId: id,
        action: 'update',
        actorUserId: req.user.id || req.user.userId,
      });
      return res.json({ success: true, data: result.rows[0] });
    } catch (err) {
      console.error(`[iri] announcement update id=${id}:`, err.message);
      return res.status(500).json({ success: false, message: 'Falha ao atualizar comunicado.' });
    }
  });

  router.get('/announcements/:id/receipts', requireManage, async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: 'ID inválido.' });
    try {
      const exists = await pool.query(
        `SELECT id FROM iri_announcements WHERE id = $1 AND organization_id = $2`,
        [id, req.iriOrganizationId]
      );
      if (!exists.rows[0]) {
        return res.status(404).json({ success: false, message: 'Comunicado não encontrado.' });
      }
      const result = await pool.query(
        `SELECT r.user_id, r.received_at, r.read_at, r.acked_at,
                u.name AS user_name, u.email AS user_email
           FROM iri_announcement_reads r
           LEFT JOIN users u ON u.id = r.user_id
          WHERE r.announcement_id = $1
          ORDER BY r.acked_at DESC NULLS LAST, r.received_at DESC
          LIMIT 500`,
        [id]
      );
      return res.json({ success: true, data: result.rows });
    } catch (err) {
      console.error(`[iri] announcement receipts id=${id}:`, err.message);
      return res.status(500).json({ success: false, message: 'Falha ao carregar ciências.' });
    }
  });

  router.post('/announcements/:id/read', async (req, res) => {
    return upsertReceipt(req, res, { ack: false });
  });

  router.post('/announcements/:id/ack', async (req, res) => {
    return upsertReceipt(req, res, { ack: true });
  });

  async function upsertReceipt(req, res, { ack }) {
    const id = parseId(req.params.id);
    const userId = req.user.id || req.user.userId;
    if (!id) return res.status(400).json({ success: false, message: 'ID inválido.' });
    if (!userId) return res.status(400).json({ success: false, message: 'Usuário não identificado.' });

    try {
      const exists = await pool.query(
        `SELECT id, requires_ack FROM iri_announcements
          WHERE id = $1 AND organization_id = $2 AND is_active = TRUE`,
        [id, req.iriOrganizationId]
      );
      if (!exists.rows[0]) {
        return res.status(404).json({ success: false, message: 'Comunicado não encontrado.' });
      }

      const ackSql = ack
        ? `, acked_at = COALESCE(iri_announcement_reads.acked_at, NOW())`
        : '';
      const result = await pool.query(
        `INSERT INTO iri_announcement_reads (announcement_id, user_id, received_at, read_at)
         VALUES ($1, $2, NOW(), NOW())
         ON CONFLICT (announcement_id, user_id) DO UPDATE
           SET read_at = COALESCE(iri_announcement_reads.read_at, NOW())${ackSql}
         RETURNING *`,
        [id, userId]
      );

      if (ack) {
        await writeAudit(pool, {
          organizationId: req.iriOrganizationId,
          entityType: 'announcement',
          entityId: id,
          action: 'ack',
          actorUserId: userId,
        });
      }
      return res.json({ success: true, data: result.rows[0] });
    } catch (err) {
      console.error(`[iri] announcement ${ack ? 'ack' : 'read'} id=${id}:`, err.message);
      return res.status(500).json({
        success: false,
        message: ack ? 'Falha ao confirmar ciência.' : 'Falha ao registrar leitura.',
      });
    }
  }

  return router;
};
