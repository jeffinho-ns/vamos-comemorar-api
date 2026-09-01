'use strict';

const express = require('express');
const { applyCommonMiddleware, requireManage, writeAudit } = require('./middleware');
const repo = require('../../services/rhIdeia/trainingRepository');
const payloads = require('../../services/rhIdeia/trainingPayload');
const {
  ROLE_KEYS,
  TRAINING_STATUSES,
  INVALID_ROLE_MESSAGE,
  INVALID_STATUS_MESSAGE,
  pickRoleKey,
  pickStatus,
  daysUntilExpiry,
  summarizeAssignments,
} = require('../../services/rhIdeia/trainingRules');
const { optionalStr, parseId, parseBoolean, parseEstablishmentId } = require('../../validators/rhIdeiaValidator');

async function sweepExpired(pool, organizationId) {
  try {
    const expired = await repo.expireDueAssignments(pool, organizationId);
    if (expired > 0) {
      console.log(`[iri] treinamentos vencidos organization_id=${organizationId}: ${expired}`);
    }
  } catch (err) {
    console.error(`[iri] varredura validade organization_id=${organizationId}:`, err.message);
  }
}

module.exports = (pool) => {
  const router = express.Router({ mergeParams: true });
  applyCommonMiddleware(router, pool);

  router.get('/trainings/team', requireManage, async (req, res) => {
    const trainingId = parseId(req.query.training_id);
    const establishmentId =
      parseEstablishmentId(req.query.establishment_id) || req.iriEstablishmentFilter;
    try {
      const rows = await repo.listTeam(pool, {
        organizationId: req.iriOrganizationId,
        establishmentId,
        trainingId,
      });
      return res.json({ success: true, data: rows });
    } catch (err) {
      console.error(`[iri] training team organization_id=${req.iriOrganizationId}:`, err.message);
      return res.status(500).json({ success: false, message: 'Falha ao listar a equipe.' });
    }
  });

  router.get('/trainings', async (req, res) => {
    const roleKey = pickRoleKey(req.query.role_key);
    if (!roleKey.ok) return res.status(400).json({ success: false, message: INVALID_ROLE_MESSAGE });
    const status = pickStatus(req.query.status);
    if (!status.ok) return res.status(400).json({ success: false, message: INVALID_STATUS_MESSAGE });

    await sweepExpired(pool, req.iriOrganizationId);
    try {
      const rows = await repo.listTrainings(pool, {
        organizationId: req.iriOrganizationId,
        establishmentFilter: req.iriEstablishmentFilter,
        roleKey: roleKey.value,
        status: status.value,
        q: optionalStr(req.query.q, 200),
        scope: String(req.query.scope || 'active').trim().toLowerCase(),
      });
      return res.json({ success: true, data: rows, meta: { can_manage: req.iriCanManage } });
    } catch (err) {
      console.error(`[iri] trainings list organization_id=${req.iriOrganizationId}:`, err.message);
      return res.status(500).json({ success: false, message: 'Falha ao listar treinamentos.' });
    }
  });

  router.get('/trainings/:id', async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: 'ID inválido.' });
    await sweepExpired(pool, req.iriOrganizationId);
    try {
      const training = await repo.getTraining(pool, { organizationId: req.iriOrganizationId, id });
      if (!training) {
        return res.status(404).json({ success: false, message: 'Treinamento não encontrado.' });
      }
      const assignments = req.iriCanManage ? await repo.listAssignments(pool, id) : [];
      return res.json({
        success: true,
        data: {
          ...training,
          ...summarizeAssignments(assignments),
          assignments: assignments.map((a) => ({
            ...a,
            days_until_expiry: daysUntilExpiry(a.expires_at),
          })),
          can_manage: req.iriCanManage,
        },
      });
    } catch (err) {
      console.error(`[iri] training get id=${id}:`, err.message);
      return res.status(500).json({ success: false, message: 'Falha ao carregar treinamento.' });
    }
  });

  router.post('/trainings', requireManage, async (req, res) => {
    const payload = payloads.parseCreatePayload(req.body);
    if (!payload.ok) return res.status(400).json({ success: false, message: payload.message });

    const actorUserId = req.user.id || req.user.userId;
    try {
      const training = await repo.insertTraining(pool, {
        organizationId: req.iriOrganizationId,
        createdBy: actorUserId,
        ...payload.value,
      });
      await writeAudit(pool, {
        organizationId: req.iriOrganizationId,
        establishmentId: payload.value.establishmentId,
        entityType: 'training',
        entityId: training.id,
        action: 'create',
        actorUserId,
      });
      return res.status(201).json({ success: true, data: training });
    } catch (err) {
      console.error(`[iri] training create organization_id=${req.iriOrganizationId}:`, err.message);
      return res.status(500).json({ success: false, message: 'Falha ao criar treinamento.' });
    }
  });

  router.patch('/trainings/:id', requireManage, async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: 'ID inválido.' });

    const payload = payloads.parseUpdatePayload(req.body);
    if (!payload.ok) return res.status(400).json({ success: false, message: payload.message });

    try {
      const training = await repo.updateTraining(pool, {
        organizationId: req.iriOrganizationId,
        id,
        sets: payload.sets,
        params: payload.params,
      });
      if (!training) {
        return res.status(404).json({ success: false, message: 'Treinamento não encontrado.' });
      }
      await writeAudit(pool, {
        organizationId: req.iriOrganizationId,
        establishmentId: training.establishment_id,
        entityType: 'training',
        entityId: id,
        action: 'update',
        actorUserId: req.user.id || req.user.userId,
      });
      return res.json({ success: true, data: training });
    } catch (err) {
      console.error(`[iri] training update id=${id}:`, err.message);
      return res.status(500).json({ success: false, message: 'Falha ao atualizar treinamento.' });
    }
  });

  router.post('/trainings/:id/assign', requireManage, async (req, res) => {
    const trainingId = parseId(req.params.id);
    if (!trainingId) return res.status(400).json({ success: false, message: 'ID inválido.' });

    const assignAll = parseBoolean(req.body.assign_all, false);
    const establishmentId =
      parseEstablishmentId(req.body.establishment_id) || req.iriEstablishmentFilter;

    const ids = Array.isArray(req.body.user_ids) ? req.body.user_ids : [];
    const single = parseId(req.body.user_id);
    const userIds = [...new Set([...ids.map(parseId), single].filter(Boolean))];

    if (!assignAll && userIds.length === 0) {
      return res.status(400).json({ success: false, message: 'Informe user_ids ou assign_all=true.' });
    }

    const dueAt = optionalStr(req.body.due_at, 40);
    if (dueAt && Number.isNaN(new Date(dueAt).getTime())) {
      return res.status(400).json({ success: false, message: 'Prazo inválido.' });
    }

    const actorUserId = req.user.id || req.user.userId;
    try {
      const training = await repo.getTraining(pool, {
        organizationId: req.iriOrganizationId,
        id: trainingId,
      });
      if (!training) {
        return res.status(404).json({ success: false, message: 'Treinamento não encontrado.' });
      }

      const outcome = assignAll
        ? await repo.assignAllEligible(pool, {
            organizationId: req.iriOrganizationId,
            establishmentId,
            trainingId,
            dueAt,
            force: parseBoolean(req.body.reassign, false),
          })
        : await repo.assignUsers(pool, {
            organizationId: req.iriOrganizationId,
            establishmentId,
            trainingId,
            userIds,
            dueAt,
            force: parseBoolean(req.body.reassign, false),
          });

      if (outcome.rows.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Nenhuma pessoa elegível encontrada para atribuição.',
        });
      }

      await writeAudit(pool, {
        organizationId: req.iriOrganizationId,
        establishmentId,
        entityType: 'training',
        entityId: trainingId,
        action: 'assign',
        actorUserId,
        payload: { created: outcome.created, reset: outcome.reset, skipped: outcome.skipped },
      });

      return res.status(201).json({
        success: true,
        data: outcome.rows,
        meta: outcome,
      });
    } catch (err) {
      console.error(`[iri] training assign id=${trainingId}:`, err.message);
      return res.status(500).json({ success: false, message: 'Falha ao atribuir treinamento.' });
    }
  });

  router.post('/trainings/:id/start', async (req, res) => {
    const trainingId = parseId(req.params.id);
    if (!trainingId) return res.status(400).json({ success: false, message: 'ID inválido.' });
    try {
      const training = await repo.getTraining(pool, {
        organizationId: req.iriOrganizationId,
        id: trainingId,
      });
      if (!training) {
        return res.status(404).json({ success: false, message: 'Treinamento não encontrado.' });
      }
      const assignment = await repo.startAssignment(pool, {
        trainingId,
        userId: req.user.id || req.user.userId,
      });
      return res.json({ success: true, data: assignment });
    } catch (err) {
      console.error(`[iri] training start id=${trainingId}:`, err.message);
      return res.status(500).json({ success: false, message: 'Falha ao iniciar treinamento.' });
    }
  });

  router.post('/trainings/:id/complete', async (req, res) => {
    const trainingId = parseId(req.params.id);
    if (!trainingId) return res.status(400).json({ success: false, message: 'ID inválido.' });

    const actorUserId = req.user.id || req.user.userId;
    const targetUserId = parseId(req.body.user_id) || actorUserId;
    if (targetUserId !== actorUserId && !req.iriCanManage) {
      return res.status(403).json({ success: false, message: 'Só a gestão pode concluir por outra pessoa.' });
    }

    try {
      const training = await repo.getTraining(pool, {
        organizationId: req.iriOrganizationId,
        id: trainingId,
      });
      if (!training) {
        return res.status(404).json({ success: false, message: 'Treinamento não encontrado.' });
      }
      const assignment = await repo.completeAssignment(pool, {
        trainingId,
        userId: targetUserId,
        result: optionalStr(req.body.result, 80) || 'concluido',
        validityDays: training.validity_days,
      });
      await writeAudit(pool, {
        organizationId: req.iriOrganizationId,
        establishmentId: training.establishment_id,
        entityType: 'training',
        entityId: trainingId,
        action: 'complete',
        actorUserId,
        payload: { user_id: targetUserId },
      });
      return res.json({
        success: true,
        data: { ...assignment, days_until_expiry: daysUntilExpiry(assignment.expires_at) },
      });
    } catch (err) {
      console.error(`[iri] training complete id=${trainingId}:`, err.message);
      return res.status(500).json({ success: false, message: 'Falha ao concluir treinamento.' });
    }
  });

  router.get('/my-trainings', async (req, res) => {
    const status = pickStatus(req.query.status);
    if (!status.ok) return res.status(400).json({ success: false, message: INVALID_STATUS_MESSAGE });

    await sweepExpired(pool, req.iriOrganizationId);
    try {
      const rows = await repo.listMyTrainings(pool, {
        organizationId: req.iriOrganizationId,
        userId: req.user.id || req.user.userId,
        userEstablishmentIds: req.iriUserEstablishmentIds,
        status: status.value,
      });
      return res.json({
        success: true,
        data: rows.map((row) => ({
          ...row,
          days_until_expiry: daysUntilExpiry(row.expires_at),
        })),
      });
    } catch (err) {
      console.error(`[iri] my-trainings organization_id=${req.iriOrganizationId}:`, err.message);
      return res.status(500).json({ success: false, message: 'Falha ao listar meus treinamentos.' });
    }
  });

  void ROLE_KEYS;
  void TRAINING_STATUSES;

  return router;
};
