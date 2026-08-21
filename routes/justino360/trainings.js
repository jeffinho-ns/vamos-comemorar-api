'use strict';

/**
 * Justino360 — Treinamentos (LMS operacional do Seu Justino).
 *
 * Ciclo: gestão cria o curso → atribui à equipe → a pessoa abre o conteúdo e
 * marca conclusão → se o curso tem `validity_days`, a conclusão expira e a
 * atribuição volta a cobrar reciclagem (`vencido`).
 *
 * Regras puras ficam em `services/justino360/trainingRules.js` e o SQL em
 * `services/justino360/trainingRepository.js` — aqui é só a camada HTTP.
 */
const express = require('express');
const { applyCommonMiddleware, requireManage, writeAudit } = require('./middleware');
const repo = require('../../services/justino360/trainingRepository');
const payloads = require('../../services/justino360/trainingPayload');
const {
  ROLE_KEYS,
  TRAINING_STATUSES,
  INVALID_ROLE_MESSAGE,
  INVALID_STATUS_MESSAGE,
  pickRoleKey,
  pickStatus,
  daysUntilExpiry,
  summarizeAssignments,
} = require('../../services/justino360/trainingRules');
const { optionalStr, parseId, parseBoolean } = require('../../validators/justino360Validator');

/** Varredura de vencimento antes de qualquer leitura; nunca derruba a rota. */
async function sweepExpired(pool, establishmentId) {
  try {
    const expired = await repo.expireDueAssignments(pool, establishmentId);
    if (expired > 0) {
      console.log(
        `[j360] treinamentos vencidos por validade (establishment_id=${establishmentId}): ${expired}`
      );
    }
  } catch (err) {
    console.error(
      `[j360] varredura de validade (establishment_id=${establishmentId}):`,
      err.message
    );
  }
}

module.exports = (pool) => {
  const router = express.Router({ mergeParams: true });
  applyCommonMiddleware(router, pool);

  /** Metadados dos selects da UI — evita duplicar whitelist no front. */
  router.get('/trainings/meta', (req, res) => {
    return res.json({
      success: true,
      data: {
        role_keys: ROLE_KEYS,
        statuses: TRAINING_STATUSES,
        can_manage: req.j360CanManage,
      },
    });
  });

  /** Equipe elegível para atribuição (com a situação atual no curso). */
  router.get('/trainings/team', requireManage, async (req, res) => {
    const trainingId = parseId(req.query.training_id);
    try {
      const rows = await repo.listTeam(pool, {
        establishmentId: req.j360EstablishmentId,
        trainingId,
      });
      return res.json({ success: true, data: rows });
    } catch (err) {
      console.error(
        `[j360] training team (establishment_id=${req.j360EstablishmentId}):`,
        err.message
      );
      return res.status(500).json({ success: false, message: 'Falha ao listar a equipe.' });
    }
  });

  /** Lista cursos com progresso. Filtros: role_key, status, q, scope. */
  router.get('/trainings', async (req, res) => {
    const roleKey = pickRoleKey(req.query.role_key);
    if (!roleKey.ok) return res.status(400).json({ success: false, message: INVALID_ROLE_MESSAGE });
    const status = pickStatus(req.query.status);
    if (!status.ok) return res.status(400).json({ success: false, message: INVALID_STATUS_MESSAGE });

    await sweepExpired(pool, req.j360EstablishmentId);
    try {
      const rows = await repo.listTrainings(pool, {
        establishmentId: req.j360EstablishmentId,
        roleKey: roleKey.value,
        status: status.value,
        q: optionalStr(req.query.q, 200),
        scope: String(req.query.scope || 'active').trim().toLowerCase(),
      });
      return res.json({
        success: true,
        data: rows,
        meta: { can_manage: req.j360CanManage },
      });
    } catch (err) {
      console.error(
        `[j360] trainings list (establishment_id=${req.j360EstablishmentId}):`,
        err.message
      );
      return res.status(500).json({ success: false, message: 'Falha ao listar treinamentos.' });
    }
  });

  /** Detalhe do curso. A lista de quem foi atribuído é só para a gestão. */
  router.get('/trainings/:id', async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: 'ID inválido.' });
    await sweepExpired(pool, req.j360EstablishmentId);
    try {
      const training = await repo.getTraining(pool, {
        establishmentId: req.j360EstablishmentId,
        id,
      });
      if (!training) {
        return res.status(404).json({ success: false, message: 'Treinamento não encontrado.' });
      }
      const assignments = req.j360CanManage ? await repo.listAssignments(pool, id) : [];
      return res.json({
        success: true,
        data: {
          ...training,
          ...summarizeAssignments(assignments),
          assignments: assignments.map((a) => ({
            ...a,
            days_until_expiry: daysUntilExpiry(a.expires_at),
          })),
          can_manage: req.j360CanManage,
        },
      });
    } catch (err) {
      console.error(
        `[j360] training get (training_id=${id}, establishment_id=${req.j360EstablishmentId}):`,
        err.message
      );
      return res.status(500).json({ success: false, message: 'Falha ao carregar treinamento.' });
    }
  });

  router.post('/trainings', requireManage, async (req, res) => {
    const payload = payloads.parseCreatePayload(req.body);
    if (!payload.ok) return res.status(400).json({ success: false, message: payload.message });

    const actorUserId = req.user.id || req.user.userId;
    try {
      const training = await repo.insertTraining(pool, {
        establishmentId: req.j360EstablishmentId,
        createdBy: actorUserId,
        ...payload.value,
      });
      await writeAudit(pool, {
        establishmentId: req.j360EstablishmentId,
        entityType: 'training',
        entityId: training.id,
        action: 'create',
        actorUserId,
        payload: {
          role_key: payload.value.roleKey,
          validity_days: payload.value.validityDays,
        },
      });
      return res.status(201).json({ success: true, data: training });
    } catch (err) {
      console.error(
        `[j360] training create (establishment_id=${req.j360EstablishmentId}):`,
        err.message
      );
      return res.status(500).json({ success: false, message: 'Falha ao criar treinamento.' });
    }
  });

  /** Edição de metadados e arquivamento (`is_active = false`). */
  router.patch('/trainings/:id', requireManage, async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: 'ID inválido.' });

    const payload = payloads.parseUpdatePayload(req.body);
    if (!payload.ok) return res.status(400).json({ success: false, message: payload.message });

    try {
      const training = await repo.updateTraining(pool, {
        establishmentId: req.j360EstablishmentId,
        id,
        sets: payload.sets,
        params: payload.params,
      });
      if (!training) {
        return res.status(404).json({ success: false, message: 'Treinamento não encontrado.' });
      }
      await writeAudit(pool, {
        establishmentId: req.j360EstablishmentId,
        entityType: 'training',
        entityId: id,
        action: req.body.is_active === false ? 'archive' : 'update',
        actorUserId: req.user.id || req.user.userId,
      });
      return res.json({ success: true, data: training });
    } catch (err) {
      console.error(
        `[j360] training update (training_id=${id}, establishment_id=${req.j360EstablishmentId}):`,
        err.message
      );
      return res.status(500).json({ success: false, message: 'Falha ao atualizar treinamento.' });
    }
  });

  /** Atribuição em lote. `reassign: true` força reciclagem de quem está em dia. */
  router.post('/trainings/:id/assign', requireManage, async (req, res) => {
    const trainingId = parseId(req.params.id);
    const ids = Array.isArray(req.body.user_ids) ? req.body.user_ids : [];
    const single = parseId(req.body.user_id);
    const userIds = [...new Set([...ids.map(parseId), single].filter(Boolean))];
    if (!trainingId || userIds.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: 'Informe o treinamento e ao menos uma pessoa.' });
    }

    // Data inválida vira 400 aqui em vez de estourar o cast no Postgres.
    const dueAt = optionalStr(req.body.due_at, 40);
    if (dueAt && Number.isNaN(new Date(dueAt).getTime())) {
      return res.status(400).json({ success: false, message: 'Prazo inválido.' });
    }

    const actorUserId = req.user.id || req.user.userId;
    try {
      const training = await repo.getTraining(pool, {
        establishmentId: req.j360EstablishmentId,
        id: trainingId,
      });
      if (!training) {
        return res.status(404).json({ success: false, message: 'Treinamento não encontrado.' });
      }
      const outcome = await repo.assignUsers(pool, {
        establishmentId: req.j360EstablishmentId,
        trainingId,
        userIds,
        dueAt,
        force: parseBoolean(req.body.reassign, false),
      });
      if (outcome.skipped.length > 0) {
        console.warn(
          `[j360] assign ignorou usuários sem vínculo ativo ` +
            `(establishment_id=${req.j360EstablishmentId}, training_id=${trainingId}): ` +
            outcome.skipped.join(',')
        );
      }
      if (outcome.rows.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Nenhuma das pessoas selecionadas tem acesso ativo ao Justino360.',
        });
      }
      await writeAudit(pool, {
        establishmentId: req.j360EstablishmentId,
        entityType: 'training',
        entityId: trainingId,
        action: 'assign',
        actorUserId,
        payload: {
          created: outcome.created,
          reset: outcome.reset,
          kept: outcome.kept,
          skipped: outcome.skipped,
        },
      });
      return res.status(201).json({
        success: true,
        data: outcome.rows,
        meta: {
          created: outcome.created,
          reset: outcome.reset,
          kept: outcome.kept,
          skipped: outcome.skipped,
        },
      });
    } catch (err) {
      console.error(
        `[j360] training assign (training_id=${trainingId}, establishment_id=${req.j360EstablishmentId}):`,
        err.message
      );
      return res.status(500).json({ success: false, message: 'Falha ao atribuir treinamento.' });
    }
  });

  /** Abrir o conteúdo marca "em andamento" sem exigir conclusão. */
  router.post('/trainings/:id/start', async (req, res) => {
    const trainingId = parseId(req.params.id);
    if (!trainingId) return res.status(400).json({ success: false, message: 'ID inválido.' });
    try {
      const training = await repo.getTraining(pool, {
        establishmentId: req.j360EstablishmentId,
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
      console.error(
        `[j360] training start (training_id=${trainingId}, establishment_id=${req.j360EstablishmentId}):`,
        err.message
      );
      return res.status(500).json({ success: false, message: 'Falha ao iniciar treinamento.' });
    }
  });

  /**
   * Conclusão. A pessoa conclui o dela; a gestão pode registrar por outra
   * (treinamento presencial) mandando `user_id`.
   */
  router.post('/trainings/:id/complete', async (req, res) => {
    const trainingId = parseId(req.params.id);
    if (!trainingId) return res.status(400).json({ success: false, message: 'ID inválido.' });
    const actorUserId = req.user.id || req.user.userId;
    const targetUserId = parseId(req.body.user_id) || actorUserId;
    if (targetUserId !== actorUserId && !req.j360CanManage) {
      return res
        .status(403)
        .json({ success: false, message: 'Só a gestão pode concluir por outra pessoa.' });
    }
    try {
      const training = await repo.getTraining(pool, {
        establishmentId: req.j360EstablishmentId,
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
        establishmentId: req.j360EstablishmentId,
        entityType: 'training',
        entityId: trainingId,
        action: 'complete',
        actorUserId,
        payload: {
          user_id: targetUserId,
          result: assignment.result,
          expires_at: assignment.expires_at,
        },
      });
      return res.json({
        success: true,
        data: { ...assignment, days_until_expiry: daysUntilExpiry(assignment.expires_at) },
      });
    } catch (err) {
      console.error(
        `[j360] training complete (training_id=${trainingId}, user_id=${targetUserId}, ` +
          `establishment_id=${req.j360EstablishmentId}):`,
        err.message
      );
      return res.status(500).json({ success: false, message: 'Falha ao concluir treinamento.' });
    }
  });

  router.get('/my-trainings', async (req, res) => {
    const status = pickStatus(req.query.status);
    if (!status.ok) return res.status(400).json({ success: false, message: INVALID_STATUS_MESSAGE });
    await sweepExpired(pool, req.j360EstablishmentId);
    try {
      const rows = await repo.listMyTrainings(pool, {
        establishmentId: req.j360EstablishmentId,
        userId: req.user.id || req.user.userId,
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
      console.error(
        `[j360] my-trainings (establishment_id=${req.j360EstablishmentId}):`,
        err.message
      );
      return res.status(500).json({ success: false, message: 'Falha ao listar meus treinamentos.' });
    }
  });

  return router;
};
