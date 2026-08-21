'use strict';

const express = require('express');
const { applyCommonMiddleware, writeAudit } = require('./middleware');
const {
  str,
  optionalStr,
  parseId,
  parseBoolean,
  validatePriority,
  validateIncidentStatus,
} = require('../../validators/justino360Validator');

module.exports = (pool) => {
  const router = express.Router({ mergeParams: true });
  applyCommonMiddleware(router, pool);

  router.get('/incidents', async (req, res) => {
    const status = validateIncidentStatus(req.query.status);
    const openOnly = parseBoolean(req.query.open, false);
    const sectorId = parseId(req.query.sector_id);
    const params = [req.j360EstablishmentId];
    let sql = `
      SELECT i.*, s.name AS sector_name,
             au.name AS assigned_to_name,
             cu.name AS created_by_name,
             ri.title AS checklist_item_title
        FROM j360_incidents i
        LEFT JOIN j360_sectors s ON s.id = i.sector_id
        LEFT JOIN users au ON au.id = i.assigned_to
        LEFT JOIN users cu ON cu.id = i.created_by
        LEFT JOIN j360_checklist_run_items ri ON ri.id = i.checklist_run_item_id
       WHERE i.establishment_id = $1`;
    if (status) {
      params.push(status);
      sql += ` AND i.status = $${params.length}`;
    }
    if (openOnly) {
      sql += ` AND i.status IN ('aberta','em_andamento','aguardando')`;
    }
    if (sectorId) {
      params.push(sectorId);
      sql += ` AND i.sector_id = $${params.length}`;
    }
    sql += ' ORDER BY i.created_at DESC LIMIT 200';
    try {
      const result = await pool.query(sql, params);
      return res.json({ success: true, data: result.rows });
    } catch (err) {
      console.error('[j360] incidents list:', err.message);
      return res.status(500).json({ success: false, message: 'Falha ao listar ocorrências.' });
    }
  });

  router.post('/incidents', async (req, res) => {
    const title = str(req.body.title, 300);
    if (!title) return res.status(400).json({ success: false, message: 'Título obrigatório.' });
    try {
      const result = await pool.query(
        `INSERT INTO j360_incidents
          (establishment_id, sector_id, asset_id, title, description, category, priority,
           evidence_url, assigned_to, due_at, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
        [
          req.j360EstablishmentId,
          parseId(req.body.sector_id),
          parseId(req.body.asset_id),
          title,
          optionalStr(req.body.description, 4000),
          str(req.body.category || 'operacional', 80),
          validatePriority(req.body.priority),
          optionalStr(req.body.evidence_url, 1000),
          parseId(req.body.assigned_to),
          optionalStr(req.body.due_at, 40),
          req.user.id || req.user.userId,
        ]
      );
      const incident = result.rows[0];
      let task = null;
      if (parseBoolean(req.body.create_task, true)) {
        const tk = await pool.query(
          `INSERT INTO j360_tasks
            (establishment_id, sector_id, origin, origin_id, title, description, priority,
             assigned_to, due_at, evidence_url, created_by)
           VALUES ($1,$2,'ocorrencia',$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
          [
            req.j360EstablishmentId,
            incident.sector_id,
            incident.id,
            `Resolver: ${title}`,
            incident.description,
            incident.priority,
            incident.assigned_to,
            incident.due_at,
            incident.evidence_url,
            req.user.id || req.user.userId,
          ]
        );
        task = tk.rows[0];
      }
      await writeAudit(pool, {
        establishmentId: req.j360EstablishmentId,
        entityType: 'incident',
        entityId: incident.id,
        action: 'create',
        actorUserId: req.user.id || req.user.userId,
      });
      return res.status(201).json({ success: true, data: { incident, task } });
    } catch (err) {
      console.error('[j360] incident create:', err.message);
      return res.status(500).json({ success: false, message: 'Falha ao criar ocorrência.' });
    }
  });

  router.patch('/incidents/:id', async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: 'ID inválido.' });
    const status = validateIncidentStatus(req.body.status);
    const solution = optionalStr(req.body.solution, 4000);
    if (status === 'solucionada' && (!solution || solution.length < 3)) {
      return res.status(400).json({
        success: false,
        message: 'Descreva a solução aplicada para encerrar a ocorrência.',
      });
    }
    try {
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
      if (req.body.solution !== undefined) push('solution', solution);
      if (req.body.evidence_url !== undefined) push('evidence_url', optionalStr(req.body.evidence_url, 1000));
      if (status) {
        push('status', status);
        if (status === 'solucionada') {
          push('resolved_by', req.user.id || req.user.userId);
          fields.push('resolved_at = NOW()');
        }
      }
      fields.push('updated_at = NOW()');
      params.push(id, req.j360EstablishmentId);
      const result = await pool.query(
        `UPDATE j360_incidents SET ${fields.join(', ')}
          WHERE id = $${params.length - 1} AND establishment_id = $${params.length}
          RETURNING *`,
        params
      );
      if (!result.rows[0]) return res.status(404).json({ success: false, message: 'Ocorrência não encontrada.' });
      // Fecha o loop: ocorrência resolvida encerra as tarefas que ainda estavam abertas por causa dela.
      if (status === 'solucionada') {
        await pool.query(
          `UPDATE j360_tasks
              SET status = 'concluida', completed_at = COALESCE(completed_at, NOW()), updated_at = NOW()
            WHERE establishment_id = $1 AND origin = 'ocorrencia' AND origin_id = $2
              AND status IN ('aberta','em_andamento','aguardando')`,
          [req.j360EstablishmentId, id]
        );
      }
      await writeAudit(pool, {
        establishmentId: req.j360EstablishmentId,
        entityType: 'incident',
        entityId: id,
        action: status ? `status_${status}` : 'update',
        actorUserId: req.user.id || req.user.userId,
      });
      return res.json({ success: true, data: result.rows[0] });
    } catch (err) {
      console.error('[j360] incident patch:', err.message);
      return res.status(500).json({ success: false, message: 'Falha ao atualizar ocorrência.' });
    }
  });

  return router;
};
