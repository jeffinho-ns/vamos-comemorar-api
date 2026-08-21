'use strict';

const express = require('express');
const { applyCommonMiddleware, writeAudit } = require('./middleware');
const {
  str,
  optionalStr,
  parseId,
  parseBoolean,
  validatePriority,
  validateTaskStatus,
} = require('../../validators/justino360Validator');

module.exports = (pool) => {
  const router = express.Router({ mergeParams: true });
  applyCommonMiddleware(router, pool);

  router.get('/tasks', async (req, res) => {
    const status = validateTaskStatus(req.query.status);
    const mine = parseBoolean(req.query.mine, false);
    const openOnly = parseBoolean(req.query.open, false);
    const overdue = parseBoolean(req.query.overdue, false);
    const params = [req.j360EstablishmentId];
    let sql = `
      SELECT t.*, s.name AS sector_name,
             au.name AS assigned_to_name,
             (t.due_at IS NOT NULL AND t.due_at < NOW()
               AND t.status IN ('aberta','em_andamento','aguardando')) AS is_overdue
        FROM j360_tasks t
        LEFT JOIN j360_sectors s ON s.id = t.sector_id
        LEFT JOIN users au ON au.id = t.assigned_to
       WHERE t.establishment_id = $1`;
    if (status) {
      params.push(status);
      sql += ` AND t.status = $${params.length}`;
    }
    if (openOnly) {
      sql += ` AND t.status IN ('aberta','em_andamento','aguardando')`;
    }
    if (overdue) {
      sql += ` AND t.due_at IS NOT NULL AND t.due_at < NOW()
               AND t.status IN ('aberta','em_andamento','aguardando')`;
    }
    if (mine) {
      params.push(req.user.id || req.user.userId);
      sql += ` AND t.assigned_to = $${params.length}`;
    }
    sql += ' ORDER BY t.due_at NULLS LAST, t.created_at DESC LIMIT 200';
    try {
      const result = await pool.query(sql, params);
      return res.json({ success: true, data: result.rows });
    } catch (err) {
      console.error('[j360] tasks list:', err.message);
      return res.status(500).json({ success: false, message: 'Falha ao listar tarefas.' });
    }
  });

  router.post('/tasks', async (req, res) => {
    const title = str(req.body.title, 300);
    if (!title) return res.status(400).json({ success: false, message: 'Título obrigatório.' });
    try {
      const result = await pool.query(
        `INSERT INTO j360_tasks
          (establishment_id, sector_id, origin, origin_id, title, description, priority,
           assigned_to, due_at, evidence_url, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
        [
          req.j360EstablishmentId,
          parseId(req.body.sector_id),
          str(req.body.origin || 'manual', 40),
          parseId(req.body.origin_id),
          title,
          optionalStr(req.body.description, 4000),
          validatePriority(req.body.priority),
          parseId(req.body.assigned_to),
          optionalStr(req.body.due_at, 40),
          optionalStr(req.body.evidence_url, 1000),
          req.user.id || req.user.userId,
        ]
      );
      await writeAudit(pool, {
        establishmentId: req.j360EstablishmentId,
        entityType: 'task',
        entityId: result.rows[0].id,
        action: 'create',
        actorUserId: req.user.id || req.user.userId,
      });
      return res.status(201).json({ success: true, data: result.rows[0] });
    } catch (err) {
      console.error('[j360] task create:', err.message);
      return res.status(500).json({ success: false, message: 'Falha ao criar tarefa.' });
    }
  });

  router.patch('/tasks/:id', async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: 'ID inválido.' });
    const status = validateTaskStatus(req.body.status);
    if (status === 'validada' && !req.j360CanValidate && !req.j360CanManage) {
      return res.status(403).json({ success: false, message: 'Permissão de validação necessária.' });
    }
    try {
      // Quem não é gestão só mexe no que é seu, e nunca reatribui tarefa.
      if (!req.j360CanManage) {
        const actorId = req.user.id || req.user.userId;
        const owned = await pool.query(
          `SELECT 1 FROM j360_tasks
            WHERE id = $1 AND establishment_id = $2
              AND (assigned_to = $3 OR created_by = $3)`,
          [id, req.j360EstablishmentId, actorId]
        );
        if (!owned.rows[0]) {
          return res.status(403).json({
            success: false,
            message: 'Você só pode atualizar tarefas atribuídas a você.',
          });
        }
        if (req.body.assigned_to !== undefined) {
          return res.status(403).json({
            success: false,
            message: 'Somente a gestão pode reatribuir tarefas.',
          });
        }
      }
      const fields = [];
      const params = [];
      const push = (col, val) => {
        params.push(val);
        fields.push(`${col} = $${params.length}`);
      };
      if (req.body.title !== undefined) push('title', str(req.body.title, 300));
      if (req.body.description !== undefined) push('description', optionalStr(req.body.description, 4000));
      if (req.body.priority !== undefined) push('priority', validatePriority(req.body.priority));
      if (req.body.assigned_to !== undefined) push('assigned_to', parseId(req.body.assigned_to));
      if (req.body.due_at !== undefined) push('due_at', optionalStr(req.body.due_at, 40));
      if (req.body.evidence_url !== undefined) push('evidence_url', optionalStr(req.body.evidence_url, 1000));
      if (status) {
        push('status', status);
        if (status === 'concluida') fields.push('completed_at = NOW()');
        if (status === 'validada') {
          push('validated_by', req.user.id || req.user.userId);
          fields.push('validated_at = NOW()');
          if (!fields.some((f) => f.startsWith('completed_at'))) fields.push('completed_at = COALESCE(completed_at, NOW())');
        }
      }
      fields.push('updated_at = NOW()');
      params.push(id, req.j360EstablishmentId);
      const result = await pool.query(
        `UPDATE j360_tasks SET ${fields.join(', ')}
          WHERE id = $${params.length - 1} AND establishment_id = $${params.length}
          RETURNING *`,
        params
      );
      if (!result.rows[0]) return res.status(404).json({ success: false, message: 'Tarefa não encontrada.' });
      await writeAudit(pool, {
        establishmentId: req.j360EstablishmentId,
        entityType: 'task',
        entityId: id,
        action: status ? `status_${status}` : 'update',
        actorUserId: req.user.id || req.user.userId,
      });
      return res.json({ success: true, data: result.rows[0] });
    } catch (err) {
      console.error('[j360] task patch:', err.message);
      return res.status(500).json({ success: false, message: 'Falha ao atualizar tarefa.' });
    }
  });

  return router;
};
