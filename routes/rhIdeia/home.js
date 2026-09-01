'use strict';

const express = require('express');
const { applyCommonMiddleware } = require('./middleware');
const { buildVisibilityClause, applyVisibilityToWhere } = require('../../services/rhIdeia/scopeHelpers');
const repo = require('../../services/rhIdeia/trainingRepository');

module.exports = (pool) => {
  const router = express.Router({ mergeParams: true });
  applyCommonMiddleware(router, pool);

  router.get('/home', async (req, res) => {
    const orgId = req.iriOrganizationId;
    const userId = req.user.id || req.user.userId;
    const manageAll = req.iriCanManage;

    try {
      await repo.expireDueAssignments(pool, orgId);

      const vis = buildVisibilityClause({
        alias: 'a',
        orgParamIndex: 1,
        userEstablishmentIds: req.iriUserEstablishmentIds,
        manageAll,
      });
      const annParams = [orgId];
      const annWhere = applyVisibilityToWhere(
        ['a.is_active = TRUE', '(a.expires_at IS NULL OR a.expires_at > NOW())'],
        vis,
        annParams
      );

      const [announcements, trainings] = await Promise.all([
        pool.query(
          `SELECT a.id, a.title, a.published_at, a.requires_ack, a.priority,
                  r.read_at, r.acked_at,
                  (a.requires_ack = TRUE AND r.acked_at IS NULL) AS pending_ack
             FROM iri_announcements a
             LEFT JOIN iri_announcement_reads r
               ON r.announcement_id = a.id AND r.user_id = $${annParams.length + 1}
            WHERE ${annWhere.join(' AND ')}
            ORDER BY a.published_at DESC
            LIMIT 15`,
          [...annParams, userId]
        ),
        repo.listMyTrainings(pool, {
          organizationId: orgId,
          userId,
          userEstablishmentIds: req.iriUserEstablishmentIds,
          status: null,
        }),
      ]);

      const pendingTrainings = trainings.filter((t) =>
        ['pendente', 'em_andamento', 'vencido'].includes(t.status)
      );

      return res.json({
        success: true,
        data: {
          comunicados: announcements.rows,
          comunicados_sem_ciencia: announcements.rows.filter((r) => r.pending_ack),
          treinamentos_pendentes: pendingTrainings.slice(0, 10),
          can_manage: req.iriCanManage,
        },
      });
    } catch (err) {
      console.error(`[iri] home organization_id=${orgId}:`, err.message);
      return res.status(500).json({ success: false, message: 'Falha ao carregar início.' });
    }
  });

  return router;
};
