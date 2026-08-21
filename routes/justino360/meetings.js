'use strict';

/**
 * Justino360 — Reuniões, atas e decisões que viram tarefa.
 *
 * A regra do módulo: decisão de reunião que não vira tarefa com responsável e
 * prazo é decisão esquecida. Por isso cada decisão gera, por padrão, uma tarefa
 * com `origin = 'reuniao'` e `origin_id = meeting_id`, dentro da mesma
 * transação da ata — ou salva tudo, ou não salva nada.
 *
 * O resumo automático da ata por IA é fase 6; aqui é tudo determinístico.
 */
const express = require('express');
const { applyCommonMiddleware, requireManage, writeAudit } = require('./middleware');
const {
  str,
  optionalStr,
  parseId,
  parseBoolean,
  parseTimestamp,
  validatePriority,
} = require('../../validators/justino360Validator');

const DECISION_MAX = 2000;

const DECISIONS_SQL = `
  SELECT d.id, d.meeting_id, d.decision, d.task_id, d.created_at,
         t.title AS task_title, t.status AS task_status, t.priority AS task_priority,
         t.due_at AS task_due_at, t.sector_id AS task_sector_id,
         s.name AS task_sector_name,
         au.name AS task_assigned_to_name,
         (t.due_at IS NOT NULL AND t.due_at < NOW()
           AND t.status IN ('aberta','em_andamento','aguardando')) AS task_is_overdue
    FROM j360_meeting_decisions d
    LEFT JOIN j360_tasks t ON t.id = d.task_id
    LEFT JOIN j360_sectors s ON s.id = t.sector_id
    LEFT JOIN users au ON au.id = t.assigned_to
   WHERE d.meeting_id = $1
   ORDER BY d.id`;

/** Aceita `"texto"`, `{ decision }` ou `{ text }` — o front antigo mandava string. */
function readDecisionText(raw) {
  if (typeof raw === 'string') return str(raw, DECISION_MAX);
  if (!raw || typeof raw !== 'object') return '';
  return str(raw.decision || raw.text || '', DECISION_MAX);
}

module.exports = (pool) => {
  const router = express.Router({ mergeParams: true });
  applyCommonMiddleware(router, pool);

  /** Só aceita setor da própria casa — nunca id de outro estabelecimento. */
  async function resolveSectorId(establishmentId, rawId) {
    const sectorId = parseId(rawId);
    if (!sectorId) return null;
    const { rows } = await pool.query(
      `SELECT id FROM j360_sectors WHERE id = $1 AND establishment_id = $2`,
      [sectorId, establishmentId]
    );
    return rows[0]?.id || null;
  }

  /**
   * Grava uma decisão e, quando pedido, a tarefa correspondente.
   * Precisa rodar dentro de uma transação (recebe o client, não o pool).
   */
  async function insertDecision(client, { establishmentId, meetingId, raw, actorUserId }) {
    const decisionText = readDecisionText(raw);
    if (!decisionText) return null;

    const dueAt = parseTimestamp(raw?.due_at);
    if (!dueAt.ok) {
      const error = new Error('Prazo da decisão inválido.');
      error.statusCode = 400;
      throw error;
    }

    let taskId = null;
    if (parseBoolean(raw?.create_task, true)) {
      const sectorId = await resolveSectorId(establishmentId, raw?.sector_id);
      const task = await client.query(
        `INSERT INTO j360_tasks
          (establishment_id, sector_id, origin, origin_id, title, description, priority,
           assigned_to, due_at, created_by)
         VALUES ($1,$2,'reuniao',$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [
          establishmentId,
          sectorId,
          meetingId,
          str(raw?.task_title || decisionText, 300),
          decisionText,
          validatePriority(raw?.priority),
          parseId(raw?.assigned_to),
          dueAt.value,
          actorUserId,
        ]
      );
      taskId = task.rows[0].id;
    }

    const inserted = await client.query(
      `INSERT INTO j360_meeting_decisions (meeting_id, decision, task_id)
       VALUES ($1,$2,$3) RETURNING *`,
      [meetingId, decisionText, taskId]
    );
    return inserted.rows[0];
  }

  router.get('/meetings', async (req, res) => {
    const from = parseTimestamp(req.query.from);
    const to = parseTimestamp(req.query.to);
    if (!from.ok || !to.ok) {
      return res.status(400).json({ success: false, message: 'Período inválido.' });
    }
    const params = [req.j360EstablishmentId];
    const where = ['m.establishment_id = $1'];
    if (from.value) {
      params.push(from.value);
      where.push(`m.meeting_at >= $${params.length}`);
    }
    if (to.value) {
      params.push(to.value);
      where.push(`m.meeting_at <= $${params.length}`);
    }

    try {
      const result = await pool.query(
        `SELECT m.*, u.name AS created_by_name,
                (SELECT COUNT(*)::int FROM j360_meeting_decisions d
                  WHERE d.meeting_id = m.id) AS decisions_count,
                (SELECT COUNT(*)::int FROM j360_meeting_decisions d
                   JOIN j360_tasks t ON t.id = d.task_id
                  WHERE d.meeting_id = m.id
                    AND t.status IN ('aberta','em_andamento','aguardando')) AS tasks_open,
                (SELECT COUNT(*)::int FROM j360_meeting_decisions d
                   JOIN j360_tasks t ON t.id = d.task_id
                  WHERE d.meeting_id = m.id
                    AND t.status IN ('concluida','validada')) AS tasks_done
           FROM j360_meetings m
           LEFT JOIN users u ON u.id = m.created_by
          WHERE ${where.join(' AND ')}
          ORDER BY m.meeting_at DESC
          LIMIT 100`,
        params
      );
      return res.json({
        success: true,
        data: result.rows,
        meta: { can_manage: req.j360CanManage },
      });
    } catch (err) {
      console.error(
        `[j360] meetings list (establishment_id=${req.j360EstablishmentId}):`,
        err.message
      );
      return res.status(500).json({ success: false, message: 'Falha ao listar reuniões.' });
    }
  });

  /**
   * Equipe elegível como responsável de uma decisão.
   * Precisa vir antes de `/meetings/:id` — senão "assignees" cai no :id.
   * Fonte: UEP ativa da própria casa (por id ou por e-mail cadastrado).
   */
  router.get('/meetings/assignees', requireManage, async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT DISTINCT u.id, u.name, u.email, u.role::text AS role
           FROM user_establishment_permissions uep
           JOIN users u
             ON u.id = uep.user_id
             OR (uep.user_email IS NOT NULL AND LOWER(u.email) = LOWER(uep.user_email))
          WHERE uep.establishment_id = $1 AND uep.is_active = TRUE
          ORDER BY u.name
          LIMIT 300`,
        [req.j360EstablishmentId]
      );
      return res.json({ success: true, data: result.rows });
    } catch (err) {
      console.error(
        `[j360] meeting assignees (establishment_id=${req.j360EstablishmentId}):`,
        err.message
      );
      return res.status(500).json({ success: false, message: 'Falha ao listar a equipe.' });
    }
  });

  router.get('/meetings/:id', async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: 'ID inválido.' });
    try {
      const meeting = await pool.query(
        `SELECT m.*, u.name AS created_by_name
           FROM j360_meetings m
           LEFT JOIN users u ON u.id = m.created_by
          WHERE m.id = $1 AND m.establishment_id = $2`,
        [id, req.j360EstablishmentId]
      );
      if (!meeting.rows[0]) {
        return res.status(404).json({ success: false, message: 'Reunião não encontrada.' });
      }
      const decisions = await pool.query(DECISIONS_SQL, [id]);
      return res.json({
        success: true,
        data: { ...meeting.rows[0], decisions: decisions.rows },
        meta: { can_manage: req.j360CanManage },
      });
    } catch (err) {
      console.error(
        `[j360] meeting get (meeting_id=${id}, establishment_id=${req.j360EstablishmentId}):`,
        err.message
      );
      return res.status(500).json({ success: false, message: 'Falha ao carregar reunião.' });
    }
  });

  router.post('/meetings', requireManage, async (req, res) => {
    const title = str(req.body.title, 300);
    if (!title) return res.status(400).json({ success: false, message: 'Título é obrigatório.' });
    const meetingAt = parseTimestamp(req.body.meeting_at);
    if (!meetingAt.ok) {
      return res.status(400).json({ success: false, message: 'Data da reunião inválida.' });
    }
    const decisions = Array.isArray(req.body.decisions) ? req.body.decisions : [];
    const actorUserId = req.user.id || req.user.userId;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const meeting = await client.query(
        `INSERT INTO j360_meetings
          (establishment_id, title, meeting_at, attendees, minutes, created_by)
         VALUES ($1,$2,COALESCE($3::timestamptz, NOW()),$4,$5,$6) RETURNING *`,
        [
          req.j360EstablishmentId,
          title,
          meetingAt.value,
          optionalStr(req.body.attendees, 2000),
          optionalStr(req.body.minutes, 20000),
          actorUserId,
        ]
      );
      const meetingId = meeting.rows[0].id;
      for (const raw of decisions) {
        await insertDecision(client, {
          establishmentId: req.j360EstablishmentId,
          meetingId,
          raw,
          actorUserId,
        });
      }
      await client.query('COMMIT');

      const saved = await pool.query(DECISIONS_SQL, [meetingId]);
      await writeAudit(pool, {
        establishmentId: req.j360EstablishmentId,
        entityType: 'meeting',
        entityId: meetingId,
        action: 'create',
        actorUserId,
        payload: { decisions: saved.rows.length },
      });
      return res.status(201).json({
        success: true,
        data: { ...meeting.rows[0], decisions: saved.rows },
      });
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      if (err.statusCode === 400) {
        return res.status(400).json({ success: false, message: err.message });
      }
      console.error(
        `[j360] meeting create (establishment_id=${req.j360EstablishmentId}):`,
        err.message
      );
      return res.status(500).json({ success: false, message: 'Falha ao salvar reunião.' });
    } finally {
      client.release();
    }
  });

  /** Edição da ata (título, data, presentes, texto). Decisões não mudam aqui. */
  router.patch('/meetings/:id', requireManage, async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: 'ID inválido.' });

    const sets = [];
    const params = [];
    const push = (column, value) => {
      params.push(value);
      sets.push(`${column} = $${params.length}`);
    };

    if (req.body.title !== undefined) {
      const title = str(req.body.title, 300);
      if (!title) return res.status(400).json({ success: false, message: 'Título é obrigatório.' });
      push('title', title);
    }
    if (req.body.meeting_at !== undefined) {
      const meetingAt = parseTimestamp(req.body.meeting_at);
      if (!meetingAt.ok || !meetingAt.value) {
        return res.status(400).json({ success: false, message: 'Data da reunião inválida.' });
      }
      push('meeting_at', meetingAt.value);
    }
    if (req.body.attendees !== undefined) push('attendees', optionalStr(req.body.attendees, 2000));
    if (req.body.minutes !== undefined) push('minutes', optionalStr(req.body.minutes, 20000));

    if (sets.length === 0) {
      return res.status(400).json({ success: false, message: 'Nenhum campo para atualizar.' });
    }
    sets.push('updated_at = NOW()');
    params.push(id, req.j360EstablishmentId);

    try {
      const result = await pool.query(
        `UPDATE j360_meetings SET ${sets.join(', ')}
          WHERE id = $${params.length - 1} AND establishment_id = $${params.length}
          RETURNING *`,
        params
      );
      if (!result.rows[0]) {
        return res.status(404).json({ success: false, message: 'Reunião não encontrada.' });
      }
      await writeAudit(pool, {
        establishmentId: req.j360EstablishmentId,
        entityType: 'meeting',
        entityId: id,
        action: 'update',
        actorUserId: req.user.id || req.user.userId,
      });
      return res.json({ success: true, data: result.rows[0] });
    } catch (err) {
      console.error(
        `[j360] meeting update (meeting_id=${id}, establishment_id=${req.j360EstablishmentId}):`,
        err.message
      );
      return res.status(500).json({ success: false, message: 'Falha ao atualizar reunião.' });
    }
  });

  /** Decisão registrada depois do encontro (também gera tarefa). */
  router.post('/meetings/:id/decisions', requireManage, async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: 'ID inválido.' });
    if (!readDecisionText(req.body)) {
      return res.status(400).json({ success: false, message: 'Texto da decisão é obrigatório.' });
    }
    const actorUserId = req.user.id || req.user.userId;

    const client = await pool.connect();
    try {
      const exists = await client.query(
        `SELECT id FROM j360_meetings WHERE id = $1 AND establishment_id = $2`,
        [id, req.j360EstablishmentId]
      );
      if (!exists.rows[0]) {
        return res.status(404).json({ success: false, message: 'Reunião não encontrada.' });
      }
      await client.query('BEGIN');
      const decision = await insertDecision(client, {
        establishmentId: req.j360EstablishmentId,
        meetingId: id,
        raw: req.body,
        actorUserId,
      });
      await client.query('COMMIT');
      await writeAudit(pool, {
        establishmentId: req.j360EstablishmentId,
        entityType: 'meeting',
        entityId: id,
        action: 'decision_add',
        actorUserId,
        payload: { decision_id: decision?.id || null, task_id: decision?.task_id || null },
      });
      const refreshed = await pool.query(DECISIONS_SQL, [id]);
      return res.status(201).json({ success: true, data: refreshed.rows });
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      if (err.statusCode === 400) {
        return res.status(400).json({ success: false, message: err.message });
      }
      console.error(
        `[j360] meeting decision add (meeting_id=${id}, establishment_id=${req.j360EstablishmentId}):`,
        err.message
      );
      return res.status(500).json({ success: false, message: 'Falha ao registrar decisão.' });
    } finally {
      client.release();
    }
  });

  return router;
};
