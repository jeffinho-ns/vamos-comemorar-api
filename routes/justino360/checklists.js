'use strict';

const express = require('express');
const { applyCommonMiddleware, requireManage, writeAudit } = require('./middleware');
const {
  registerNonConformity,
  validateAnswer,
  syncRunStatus,
} = require('../../services/justino360/checklistFlow');
const {
  str,
  optionalStr,
  parseId,
  parseBoolean,
  validatePriority,
  validateRunItemStatus,
} = require('../../validators/justino360Validator');

module.exports = (pool) => {
  const router = express.Router({ mergeParams: true });
  applyCommonMiddleware(router, pool);

  router.get('/checklist-templates', async (req, res) => {
    try {
      const sectorId = parseId(req.query.sector_id);
      const params = [req.j360EstablishmentId];
      let sql = `
        SELECT t.*, s.name AS sector_name, s.key AS sector_key,
               (SELECT COUNT(*)::int FROM j360_checklist_template_items i WHERE i.template_id = t.id AND i.is_active) AS items_count
          FROM j360_checklist_templates t
          LEFT JOIN j360_sectors s ON s.id = t.sector_id
         WHERE t.establishment_id = $1 AND t.is_active = TRUE`;
      if (sectorId) {
        params.push(sectorId);
        sql += ` AND t.sector_id = $${params.length}`;
      }
      sql += ' ORDER BY s.sort_order NULLS LAST, t.name';
      const result = await pool.query(sql, params);
      return res.json({ success: true, data: result.rows });
    } catch (err) {
      console.error('[j360] templates list:', err.message);
      return res.status(500).json({ success: false, message: 'Falha ao listar checklists.' });
    }
  });

  router.get('/checklist-templates/:id', async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: 'ID inválido.' });
    try {
      const tpl = await pool.query(
        `SELECT t.*, s.name AS sector_name
           FROM j360_checklist_templates t
           LEFT JOIN j360_sectors s ON s.id = t.sector_id
          WHERE t.id = $1 AND t.establishment_id = $2`,
        [id, req.j360EstablishmentId]
      );
      if (!tpl.rows[0]) return res.status(404).json({ success: false, message: 'Template não encontrado.' });
      const items = await pool.query(
        `SELECT * FROM j360_checklist_template_items
          WHERE template_id = $1 AND is_active = TRUE
          ORDER BY sort_order, id`,
        [id]
      );
      return res.json({ success: true, data: { ...tpl.rows[0], items: items.rows } });
    } catch (err) {
      console.error('[j360] template get:', err.message);
      return res.status(500).json({ success: false, message: 'Falha ao carregar template.' });
    }
  });

  router.post('/checklist-templates', requireManage, async (req, res) => {
    const name = str(req.body.name, 200);
    if (!name) return res.status(400).json({ success: false, message: 'Nome obrigatório.' });
    const sectorId = parseId(req.body.sector_id);
    const shiftType = str(req.body.shift_type || 'abertura', 40);
    const description = optionalStr(req.body.description, 2000);
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const ins = await client.query(
        `INSERT INTO j360_checklist_templates
          (establishment_id, sector_id, name, description, shift_type, created_by)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [req.j360EstablishmentId, sectorId, name, description, shiftType, req.user.id || req.user.userId]
      );
      const template = ins.rows[0];
      for (let i = 0; i < items.length; i++) {
        const title = str(items[i].title || items[i], 300);
        if (!title) continue;
        await client.query(
          `INSERT INTO j360_checklist_template_items (template_id, title, description, requires_photo, sort_order)
           VALUES ($1,$2,$3,$4,$5)`,
          [template.id, title, optionalStr(items[i].description, 1000), Boolean(items[i].requires_photo), i + 1]
        );
      }
      await client.query('COMMIT');
      await writeAudit(pool, {
        establishmentId: req.j360EstablishmentId,
        entityType: 'checklist_template',
        entityId: template.id,
        action: 'create',
        actorUserId: req.user.id || req.user.userId,
      });
      return res.status(201).json({ success: true, data: template });
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('[j360] template create:', err.message);
      return res.status(500).json({ success: false, message: 'Falha ao criar template.' });
    } finally {
      client.release();
    }
  });

  router.post('/checklist-runs', async (req, res) => {
    const templateId = parseId(req.body.template_id);
    if (!templateId) return res.status(400).json({ success: false, message: 'template_id obrigatório.' });
    const runDate = str(req.body.run_date || new Date().toISOString().slice(0, 10), 10);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const tpl = await client.query(
        `SELECT * FROM j360_checklist_templates WHERE id = $1 AND establishment_id = $2 AND is_active = TRUE`,
        [templateId, req.j360EstablishmentId]
      );
      if (!tpl.rows[0]) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, message: 'Template não encontrado.' });
      }
      // Reaproveita a execução do dia em vez de duplicar quando o time clica "Iniciar" de novo.
      const existing = await client.query(
        `SELECT * FROM j360_checklist_runs
          WHERE establishment_id = $1 AND template_id = $2 AND run_date = $3
            AND status = 'em_andamento'
          ORDER BY started_at DESC LIMIT 1`,
        [req.j360EstablishmentId, templateId, runDate]
      );
      if (existing.rows[0]) {
        await client.query('COMMIT');
        return res.json({ success: true, data: existing.rows[0], reused: true });
      }
      const items = await client.query(
        `SELECT * FROM j360_checklist_template_items WHERE template_id = $1 AND is_active = TRUE ORDER BY sort_order`,
        [templateId]
      );
      const run = await client.query(
        `INSERT INTO j360_checklist_runs
          (establishment_id, template_id, sector_id, run_date, started_by)
         VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [
          req.j360EstablishmentId,
          templateId,
          tpl.rows[0].sector_id,
          runDate,
          req.user.id || req.user.userId,
        ]
      );
      for (const item of items.rows) {
        await client.query(
          `INSERT INTO j360_checklist_run_items (run_id, template_item_id, title, sort_order)
           VALUES ($1,$2,$3,$4)`,
          [run.rows[0].id, item.id, item.title, item.sort_order]
        );
      }
      await client.query('COMMIT');
      await writeAudit(pool, {
        establishmentId: req.j360EstablishmentId,
        entityType: 'checklist_run',
        entityId: run.rows[0].id,
        action: 'start',
        actorUserId: req.user.id || req.user.userId,
        payload: { template_id: templateId, run_date: runDate },
      });
      return res.status(201).json({ success: true, data: run.rows[0] });
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('[j360] run create:', err.message);
      return res.status(500).json({ success: false, message: 'Falha ao iniciar checklist.' });
    } finally {
      client.release();
    }
  });

  router.get('/checklist-runs', async (req, res) => {
    const date = str(req.query.date || new Date().toISOString().slice(0, 10), 10);
    try {
      const result = await pool.query(
        `SELECT r.*, t.name AS template_name, s.name AS sector_name,
                (SELECT COUNT(*)::int FROM j360_checklist_run_items i WHERE i.run_id = r.id) AS total_items,
                (SELECT COUNT(*)::int FROM j360_checklist_run_items i WHERE i.run_id = r.id AND i.status <> 'pendente') AS answered_items,
                (SELECT COUNT(*)::int FROM j360_checklist_run_items i WHERE i.run_id = r.id AND i.status = 'nao_ok') AS nao_ok_count
           FROM j360_checklist_runs r
           JOIN j360_checklist_templates t ON t.id = r.template_id
           LEFT JOIN j360_sectors s ON s.id = r.sector_id
          WHERE r.establishment_id = $1 AND r.run_date = $2
          ORDER BY r.started_at DESC`,
        [req.j360EstablishmentId, date]
      );
      return res.json({ success: true, data: result.rows });
    } catch (err) {
      console.error('[j360] runs list:', err.message);
      return res.status(500).json({ success: false, message: 'Falha ao listar execuções.' });
    }
  });

  router.get('/checklist-runs/:id', async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: 'ID inválido.' });
    try {
      const run = await pool.query(
        `SELECT r.*, t.name AS template_name, s.name AS sector_name
           FROM j360_checklist_runs r
           JOIN j360_checklist_templates t ON t.id = r.template_id
           LEFT JOIN j360_sectors s ON s.id = r.sector_id
          WHERE r.id = $1 AND r.establishment_id = $2`,
        [id, req.j360EstablishmentId]
      );
      if (!run.rows[0]) return res.status(404).json({ success: false, message: 'Execução não encontrada.' });
      const items = await pool.query(
        `SELECT i.*,
                COALESCE(ti.requires_photo, FALSE) AS requires_photo,
                u.name AS answered_by_name,
                inc.id AS incident_id,
                inc.status AS incident_status,
                tk.id AS task_id,
                tk.status AS task_status
           FROM j360_checklist_run_items i
           LEFT JOIN j360_checklist_template_items ti ON ti.id = i.template_item_id
           LEFT JOIN users u ON u.id = i.answered_by
           LEFT JOIN LATERAL (
             SELECT id, status FROM j360_incidents
              WHERE checklist_run_item_id = i.id AND status <> 'cancelada'
              ORDER BY created_at DESC LIMIT 1
           ) inc ON TRUE
           LEFT JOIN LATERAL (
             SELECT id, status FROM j360_tasks
              WHERE origin = 'ocorrencia' AND origin_id = inc.id
              ORDER BY created_at DESC LIMIT 1
           ) tk ON TRUE
          WHERE i.run_id = $1
          ORDER BY i.sort_order, i.id`,
        [id]
      );
      const answered = items.rows.filter((i) => i.status !== 'pendente').length;
      return res.json({
        success: true,
        data: {
          ...run.rows[0],
          items: items.rows,
          total_items: items.rows.length,
          answered_items: answered,
          nao_ok_count: items.rows.filter((i) => i.status === 'nao_ok').length,
          can_manage: req.j360CanManage,
          can_validate: req.j360CanValidate,
        },
      });
    } catch (err) {
      console.error('[j360] run get:', err.message);
      return res.status(500).json({ success: false, message: 'Falha ao carregar execução.' });
    }
  });

  router.patch('/checklist-run-items/:id', async (req, res) => {
    const id = parseId(req.params.id);
    const status = validateRunItemStatus(req.body.status);
    if (!id || !status || status === 'pendente') {
      return res.status(400).json({ success: false, message: 'ID e status (ok|nao_ok|na) obrigatórios.' });
    }
    const observation = optionalStr(req.body.observation, 2000);
    const evidenceUrl = optionalStr(req.body.evidence_url, 1000);
    // Em NÃO OK a ocorrência e a tarefa são o comportamento padrão do fluxo Isa:
    // o cliente só precisa mandar `false` explícito para desligar.
    const createIncident = parseBoolean(req.body.create_incident, true);
    const createTask = parseBoolean(req.body.create_task, true);
    const priority = req.body.priority === undefined ? 'alta' : validatePriority(req.body.priority);
    const assignedTo = parseId(req.body.assigned_to);
    const dueAt = optionalStr(req.body.due_at, 40);
    const actorId = req.user.id || req.user.userId;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const itemQ = await client.query(
        `SELECT i.*, r.establishment_id, r.sector_id, r.id AS run_id, r.status AS run_status,
                COALESCE(ti.requires_photo, FALSE) AS requires_photo
           FROM j360_checklist_run_items i
           JOIN j360_checklist_runs r ON r.id = i.run_id
           LEFT JOIN j360_checklist_template_items ti ON ti.id = i.template_item_id
          WHERE i.id = $1 AND r.establishment_id = $2
          FOR UPDATE OF i`,
        [id, req.j360EstablishmentId]
      );
      if (!itemQ.rows[0]) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, message: 'Item não encontrado.' });
      }
      const item = itemQ.rows[0];
      const finalObservation = observation || item.observation;
      const finalEvidence = evidenceUrl || item.evidence_url;

      const invalid = validateAnswer({
        status,
        requiresPhoto: item.requires_photo,
        observation: finalObservation,
        evidenceUrl: finalEvidence,
      });
      if (invalid) {
        await client.query('ROLLBACK');
        return res.status(invalid.status).json({ success: false, message: invalid.message });
      }

      const updated = await client.query(
        `UPDATE j360_checklist_run_items
            SET status = $1, observation = COALESCE($2, observation),
                evidence_url = COALESCE($3, evidence_url),
                answered_by = $4, answered_at = NOW()
          WHERE id = $5 RETURNING *`,
        [status, observation, evidenceUrl, actorId, id]
      );

      let incident = null;
      let task = null;
      if (status === 'nao_ok' && createIncident) {
        const created = await registerNonConformity(client, {
          establishmentId: req.j360EstablishmentId,
          runItemId: id,
          sectorId: item.sector_id,
          itemTitle: item.title,
          observation: finalObservation,
          evidenceUrl: finalEvidence,
          priority,
          assignedTo,
          dueAt,
          actorId,
          createTask,
        });
        incident = created.incident;
        task = created.task;
      }

      const { runStatus, pendingCount } = await syncRunStatus(client, {
        runId: item.run_id,
        currentStatus: item.run_status,
        actorId,
      });

      await client.query('COMMIT');
      await writeAudit(pool, {
        establishmentId: req.j360EstablishmentId,
        entityType: 'checklist_run_item',
        entityId: id,
        action: `answer_${status}`,
        actorUserId: actorId,
        payload: {
          run_id: item.run_id,
          incident_id: incident?.id || null,
          task_id: task?.id || null,
          has_evidence: Boolean(finalEvidence),
        },
      });
      return res.json({
        success: true,
        data: {
          item: updated.rows[0],
          incident,
          task,
          run_status: runStatus,
          pending_items: pendingCount,
        },
      });
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(
        `[j360] run item patch (establishment_id=${req.j360EstablishmentId}, item_id=${id}):`,
        err.message
      );
      return res.status(500).json({ success: false, message: 'Falha ao responder item.' });
    } finally {
      client.release();
    }
  });

  return router;
};
