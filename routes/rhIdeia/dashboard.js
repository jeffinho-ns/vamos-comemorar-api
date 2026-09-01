'use strict';

const express = require('express');
const { applyCommonMiddleware } = require('./middleware');
const { parseEstablishmentId } = require('../../validators/rhIdeiaValidator');

module.exports = (pool) => {
  const router = express.Router({ mergeParams: true });
  applyCommonMiddleware(router, pool);

  router.get('/dashboard', async (req, res) => {
    const orgId = req.iriOrganizationId;
    const estFilter = parseEstablishmentId(req.query.establishment_id) || req.iriEstablishmentFilter;
    const userId = req.user.id || req.user.userId || 0;

    const params = [orgId];
    let estClause = '';
    if (estFilter) {
      params.push(estFilter);
      estClause = ` AND (establishment_id IS NULL OR establishment_id = $${params.length})`;
    }

    try {
      const [
        activeAnnouncements,
        pendingAcks,
        activeTrainings,
        pendingAssignments,
        expiredAssignments,
        docsCurrent,
        byEstablishment,
      ] = await Promise.all([
        pool.query(
          `SELECT COUNT(*)::int AS c FROM iri_announcements
            WHERE organization_id = $1 AND is_active = TRUE${estClause}`,
          params
        ),
        pool.query(
          `SELECT COUNT(*)::int AS c
             FROM iri_announcements a
            WHERE a.organization_id = $1 AND a.is_active = TRUE AND a.requires_ack = TRUE${estClause.replace(/establishment_id/g, 'a.establishment_id')}
              AND NOT EXISTS (
                SELECT 1 FROM iri_announcement_reads r
                 WHERE r.announcement_id = a.id AND r.acked_at IS NOT NULL
              )`,
          params
        ),
        pool.query(
          `SELECT COUNT(*)::int AS c FROM iri_trainings
            WHERE organization_id = $1 AND is_active = TRUE${estClause}`,
          params
        ),
        pool.query(
          `SELECT COUNT(*)::int AS c
             FROM iri_training_assignments ta
             JOIN iri_trainings t ON t.id = ta.training_id
            WHERE t.organization_id = $1 AND ta.status IN ('pendente','em_andamento')${estClause.replace(/establishment_id/g, 't.establishment_id')}`,
          params
        ),
        pool.query(
          `SELECT COUNT(*)::int AS c
             FROM iri_training_assignments ta
             JOIN iri_trainings t ON t.id = ta.training_id
            WHERE t.organization_id = $1 AND ta.status = 'vencido'${estClause.replace(/establishment_id/g, 't.establishment_id')}`,
          params
        ),
        pool.query(
          `SELECT COUNT(*)::int AS c FROM iri_documents
            WHERE organization_id = $1 AND is_current = TRUE${estClause}`,
          params
        ),
        pool.query(
          `SELECT e.id, e.name,
                  COUNT(DISTINCT a.id) FILTER (WHERE a.is_active) AS comunicados_ativos,
                  COUNT(DISTINCT r.id) FILTER (WHERE r.acked_at IS NOT NULL) AS ciencias,
                  COUNT(DISTINCT ta.id) FILTER (WHERE ta.status IN ('pendente','em_andamento','vencido')) AS treinamentos_pendentes
             FROM establishments e
             LEFT JOIN iri_announcements a
               ON a.organization_id = e.organization_id
              AND (a.establishment_id IS NULL OR a.establishment_id = e.id)
             LEFT JOIN iri_announcement_reads r ON r.announcement_id = a.id
             LEFT JOIN iri_trainings t
               ON t.organization_id = e.organization_id
              AND (t.establishment_id IS NULL OR t.establishment_id = e.id)
             LEFT JOIN iri_training_assignments ta ON ta.training_id = t.id
            WHERE e.organization_id = $1
            GROUP BY e.id, e.name
            ORDER BY e.name`,
          [orgId]
        ),
      ]);

      const myPendingAck = await pool.query(
        `SELECT COUNT(*)::int AS c
           FROM iri_announcements a
           LEFT JOIN iri_announcement_reads r
             ON r.announcement_id = a.id AND r.user_id = $2
          WHERE a.organization_id = $1 AND a.is_active = TRUE
            AND a.requires_ack = TRUE AND r.acked_at IS NULL`,
        [orgId, userId]
      );

      return res.json({
        success: true,
        data: {
          comunicados_ativos: activeAnnouncements.rows[0].c,
          comunicados_sem_ciencia_total: pendingAcks.rows[0].c,
          meus_comunicados_sem_ciencia: myPendingAck.rows[0].c,
          treinamentos_ativos: activeTrainings.rows[0].c,
          atribuicoes_pendentes: pendingAssignments.rows[0].c,
          atribuicoes_vencidas: expiredAssignments.rows[0].c,
          documentos_vigentes: docsCurrent.rows[0].c,
          por_unidade: byEstablishment.rows,
          establishment_filter: estFilter,
          can_manage: req.iriCanManage,
          can_validate: req.iriCanValidate,
        },
      });
    } catch (err) {
      console.error(`[iri] dashboard organization_id=${orgId}:`, err.message);
      return res.status(500).json({ success: false, message: 'Falha ao carregar dashboard.' });
    }
  });

  return router;
};
