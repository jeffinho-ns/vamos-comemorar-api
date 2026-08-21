'use strict';

const express = require('express');
const { applyCommonMiddleware, requireManage, writeAudit } = require('./middleware');
const { str, optionalStr, parseId } = require('../../validators/justino360Validator');

module.exports = (pool) => {
  const router = express.Router({ mergeParams: true });
  applyCommonMiddleware(router, pool);

  router.get('/trainings', async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT t.*,
                (SELECT COUNT(*)::int FROM j360_training_assignments a WHERE a.training_id = t.id) AS assigned_count,
                (SELECT COUNT(*)::int FROM j360_training_assignments a WHERE a.training_id = t.id AND a.status = 'concluido') AS completed_count
           FROM j360_trainings t
          WHERE t.establishment_id = $1 AND t.is_active = TRUE
          ORDER BY t.title`,
        [req.j360EstablishmentId]
      );
      return res.json({ success: true, data: result.rows });
    } catch (err) {
      console.error('[j360] trainings:', err.message);
      return res.status(500).json({ success: false, message: 'Falha ao listar treinamentos.' });
    }
  });

  router.post('/trainings', requireManage, async (req, res) => {
    const title = str(req.body.title, 300);
    if (!title) return res.status(400).json({ success: false, message: 'Título obrigatório.' });
    try {
      const result = await pool.query(
        `INSERT INTO j360_trainings
          (establishment_id, title, description, role_key, content_url, content_body,
           validity_days, is_mandatory, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [
          req.j360EstablishmentId,
          title,
          optionalStr(req.body.description, 4000),
          optionalStr(req.body.role_key, 80),
          optionalStr(req.body.content_url, 1000),
          optionalStr(req.body.content_body, 20000),
          parseId(req.body.validity_days),
          req.body.is_mandatory !== false,
          req.user.id || req.user.userId,
        ]
      );
      await writeAudit(pool, {
        establishmentId: req.j360EstablishmentId,
        entityType: 'training',
        entityId: result.rows[0].id,
        action: 'create',
        actorUserId: req.user.id || req.user.userId,
      });
      return res.status(201).json({ success: true, data: result.rows[0] });
    } catch (err) {
      console.error('[j360] training create:', err.message);
      return res.status(500).json({ success: false, message: 'Falha ao criar treinamento.' });
    }
  });

  router.post('/trainings/:id/assign', requireManage, async (req, res) => {
    const trainingId = parseId(req.params.id);
    const userIds = Array.isArray(req.body.user_ids) ? req.body.user_ids.map(parseId).filter(Boolean) : [];
    const userId = parseId(req.body.user_id);
    if (userId) userIds.push(userId);
    if (!trainingId || userIds.length === 0) {
      return res.status(400).json({ success: false, message: 'training e user_ids obrigatórios.' });
    }
    try {
      const tpl = await pool.query(
        `SELECT * FROM j360_trainings WHERE id = $1 AND establishment_id = $2`,
        [trainingId, req.j360EstablishmentId]
      );
      if (!tpl.rows[0]) return res.status(404).json({ success: false, message: 'Treinamento não encontrado.' });
      const rows = [];
      for (const uid of userIds) {
        const r = await pool.query(
          `INSERT INTO j360_training_assignments (training_id, user_id, due_at, status)
           VALUES ($1, $2, $3, 'pendente')
           ON CONFLICT (training_id, user_id) DO UPDATE SET status = 'pendente', assigned_at = NOW()
           RETURNING *`,
          [trainingId, uid, optionalStr(req.body.due_at, 40)]
        );
        rows.push(r.rows[0]);
      }
      return res.status(201).json({ success: true, data: rows });
    } catch (err) {
      console.error('[j360] training assign:', err.message);
      return res.status(500).json({ success: false, message: 'Falha ao atribuir treinamento.' });
    }
  });

  router.post('/trainings/:id/complete', async (req, res) => {
    const trainingId = parseId(req.params.id);
    const userId = req.user.id || req.user.userId;
    if (!trainingId) return res.status(400).json({ success: false, message: 'ID inválido.' });
    try {
      const training = await pool.query(
        `SELECT * FROM j360_trainings WHERE id = $1 AND establishment_id = $2`,
        [trainingId, req.j360EstablishmentId]
      );
      if (!training.rows[0]) return res.status(404).json({ success: false, message: 'Treinamento não encontrado.' });
      const validity = training.rows[0].validity_days;
      const result = await pool.query(
        `INSERT INTO j360_training_assignments (training_id, user_id, status, completed_at, result, expires_at)
         VALUES ($1, $2, 'concluido', NOW(), $3,
           CASE WHEN $4::int IS NOT NULL THEN NOW() + ($4 || ' days')::interval ELSE NULL END)
         ON CONFLICT (training_id, user_id) DO UPDATE
           SET status = 'concluido', completed_at = NOW(), result = EXCLUDED.result,
               expires_at = EXCLUDED.expires_at
         RETURNING *`,
        [trainingId, userId, optionalStr(req.body.result, 80) || 'concluido', validity]
      );
      return res.json({ success: true, data: result.rows[0] });
    } catch (err) {
      console.error('[j360] training complete:', err.message);
      return res.status(500).json({ success: false, message: 'Falha ao concluir treinamento.' });
    }
  });

  router.get('/my-trainings', async (req, res) => {
    const userId = req.user.id || req.user.userId;
    try {
      const result = await pool.query(
        `SELECT ta.*, t.title, t.description, t.content_url, t.content_body, t.is_mandatory, t.role_key
           FROM j360_training_assignments ta
           JOIN j360_trainings t ON t.id = ta.training_id
          WHERE t.establishment_id = $1 AND ta.user_id = $2
          ORDER BY ta.status, ta.due_at NULLS LAST`,
        [req.j360EstablishmentId, userId]
      );
      return res.json({ success: true, data: result.rows });
    } catch (err) {
      console.error('[j360] my-trainings:', err.message);
      return res.status(500).json({ success: false, message: 'Falha ao listar meus treinamentos.' });
    }
  });

  return router;
};
