'use strict';

const express = require('express');
const { applyCommonMiddleware, requireManage, writeAudit } = require('./middleware');
const { str, optionalStr, parseId, validatePriority } = require('../../validators/justino360Validator');

module.exports = (pool) => {
  const router = express.Router({ mergeParams: true });
  applyCommonMiddleware(router, pool);

  router.get('/meetings', async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT m.*,
                (SELECT COUNT(*)::int FROM j360_meeting_decisions d WHERE d.meeting_id = m.id) AS decisions_count
           FROM j360_meetings m
          WHERE m.establishment_id = $1
          ORDER BY m.meeting_at DESC
          LIMIT 100`,
        [req.j360EstablishmentId]
      );
      return res.json({ success: true, data: result.rows });
    } catch (err) {
      console.error('[j360] meetings:', err.message);
      return res.status(500).json({ success: false, message: 'Falha ao listar reuniões.' });
    }
  });

  router.get('/meetings/:id', async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: 'ID inválido.' });
    try {
      const meeting = await pool.query(
        `SELECT * FROM j360_meetings WHERE id = $1 AND establishment_id = $2`,
        [id, req.j360EstablishmentId]
      );
      if (!meeting.rows[0]) return res.status(404).json({ success: false, message: 'Reunião não encontrada.' });
      const decisions = await pool.query(
        `SELECT d.*, t.title AS task_title, t.status AS task_status
           FROM j360_meeting_decisions d
           LEFT JOIN j360_tasks t ON t.id = d.task_id
          WHERE d.meeting_id = $1
          ORDER BY d.id`,
        [id]
      );
      return res.json({ success: true, data: { ...meeting.rows[0], decisions: decisions.rows } });
    } catch (err) {
      console.error('[j360] meeting get:', err.message);
      return res.status(500).json({ success: false, message: 'Falha ao carregar reunião.' });
    }
  });

  router.post('/meetings', requireManage, async (req, res) => {
    const title = str(req.body.title, 300);
    if (!title) return res.status(400).json({ success: false, message: 'Título obrigatório.' });
    const decisions = Array.isArray(req.body.decisions) ? req.body.decisions : [];
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
          optionalStr(req.body.meeting_at, 40),
          optionalStr(req.body.attendees, 2000),
          optionalStr(req.body.minutes, 20000),
          req.user.id || req.user.userId,
        ]
      );
      const createdDecisions = [];
      for (const d of decisions) {
        const decisionText = str(d.decision || d.text || d, 2000);
        if (!decisionText) continue;
        let taskId = null;
        if (d.create_task !== false) {
          const task = await client.query(
            `INSERT INTO j360_tasks
              (establishment_id, sector_id, origin, origin_id, title, description, priority,
               assigned_to, due_at, created_by)
             VALUES ($1,$2,'reuniao',$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
            [
              req.j360EstablishmentId,
              parseId(d.sector_id),
              meeting.rows[0].id,
              str(d.task_title || decisionText, 300),
              decisionText,
              validatePriority(d.priority),
              parseId(d.assigned_to),
              optionalStr(d.due_at, 40),
              req.user.id || req.user.userId,
            ]
          );
          taskId = task.rows[0].id;
        }
        const dec = await client.query(
          `INSERT INTO j360_meeting_decisions (meeting_id, decision, task_id)
           VALUES ($1,$2,$3) RETURNING *`,
          [meeting.rows[0].id, decisionText, taskId]
        );
        createdDecisions.push(dec.rows[0]);
      }
      await client.query('COMMIT');
      await writeAudit(pool, {
        establishmentId: req.j360EstablishmentId,
        entityType: 'meeting',
        entityId: meeting.rows[0].id,
        action: 'create',
        actorUserId: req.user.id || req.user.userId,
      });
      return res.status(201).json({
        success: true,
        data: { ...meeting.rows[0], decisions: createdDecisions },
      });
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('[j360] meeting create:', err.message);
      return res.status(500).json({ success: false, message: 'Falha ao salvar reunião.' });
    } finally {
      client.release();
    }
  });

  return router;
};
