'use strict';

const express = require('express');
const { applyCommonMiddleware, requireManage, writeAudit } = require('./middleware');
const { str, optionalStr, parseId } = require('../../validators/justino360Validator');

module.exports = (pool) => {
  const router = express.Router({ mergeParams: true });
  applyCommonMiddleware(router, pool);

  router.get('/assets', async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT a.*, s.name AS sector_name,
                (SELECT COUNT(*)::int FROM j360_asset_maintenance m
                  WHERE m.asset_id = a.id AND m.status IN ('aberta','em_andamento')) AS open_tickets
           FROM j360_assets a
           LEFT JOIN j360_sectors s ON s.id = a.sector_id
          WHERE a.establishment_id = $1 AND a.is_active = TRUE
          ORDER BY a.name`,
        [req.j360EstablishmentId]
      );
      return res.json({ success: true, data: result.rows });
    } catch (err) {
      console.error('[j360] assets:', err.message);
      return res.status(500).json({ success: false, message: 'Falha ao listar equipamentos.' });
    }
  });

  router.post('/assets', requireManage, async (req, res) => {
    const name = str(req.body.name, 200);
    if (!name) return res.status(400).json({ success: false, message: 'Nome obrigatório.' });
    try {
      const result = await pool.query(
        `INSERT INTO j360_assets
          (establishment_id, sector_id, name, code, location, manufacturer, notes, next_maintenance_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [
          req.j360EstablishmentId,
          parseId(req.body.sector_id),
          name,
          optionalStr(req.body.code, 80),
          optionalStr(req.body.location, 200),
          optionalStr(req.body.manufacturer, 200),
          optionalStr(req.body.notes, 2000),
          optionalStr(req.body.next_maintenance_at, 10),
        ]
      );
      await writeAudit(pool, {
        establishmentId: req.j360EstablishmentId,
        entityType: 'asset',
        entityId: result.rows[0].id,
        action: 'create',
        actorUserId: req.user.id || req.user.userId,
      });
      return res.status(201).json({ success: true, data: result.rows[0] });
    } catch (err) {
      console.error('[j360] asset create:', err.message);
      return res.status(500).json({ success: false, message: 'Falha ao cadastrar equipamento.' });
    }
  });

  router.get('/assets/:id/maintenance', async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: 'ID inválido.' });
    try {
      const result = await pool.query(
        `SELECT * FROM j360_asset_maintenance
          WHERE asset_id = $1 AND establishment_id = $2
          ORDER BY created_at DESC`,
        [id, req.j360EstablishmentId]
      );
      return res.json({ success: true, data: result.rows });
    } catch (err) {
      console.error('[j360] maintenance list:', err.message);
      return res.status(500).json({ success: false, message: 'Falha ao listar manutenções.' });
    }
  });

  router.post('/assets/:id/maintenance', async (req, res) => {
    const assetId = parseId(req.params.id);
    const title = str(req.body.title, 300);
    if (!assetId || !title) {
      return res.status(400).json({ success: false, message: 'asset e título obrigatórios.' });
    }
    try {
      const asset = await pool.query(
        `SELECT id FROM j360_assets WHERE id = $1 AND establishment_id = $2`,
        [assetId, req.j360EstablishmentId]
      );
      if (!asset.rows[0]) return res.status(404).json({ success: false, message: 'Equipamento não encontrado.' });
      const result = await pool.query(
        `INSERT INTO j360_asset_maintenance
          (asset_id, establishment_id, kind, title, description, status, evidence_url, due_at, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [
          assetId,
          req.j360EstablishmentId,
          str(req.body.kind || 'corretiva', 40),
          title,
          optionalStr(req.body.description, 4000),
          str(req.body.status || 'aberta', 40),
          optionalStr(req.body.evidence_url, 1000),
          optionalStr(req.body.due_at, 40),
          req.user.id || req.user.userId,
        ]
      );
      return res.status(201).json({ success: true, data: result.rows[0] });
    } catch (err) {
      console.error('[j360] maintenance create:', err.message);
      return res.status(500).json({ success: false, message: 'Falha ao abrir chamado.' });
    }
  });

  router.patch('/maintenance/:id', async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: 'ID inválido.' });
    try {
      const status = optionalStr(req.body.status, 40);
      const result = await pool.query(
        `UPDATE j360_asset_maintenance
            SET status = COALESCE($1, status),
                evidence_url = COALESCE($2, evidence_url),
                description = COALESCE($3, description),
                performed_by = CASE WHEN $1 IN ('concluida','concluido') THEN $4 ELSE performed_by END,
                performed_at = CASE WHEN $1 IN ('concluida','concluido') THEN NOW() ELSE performed_at END
          WHERE id = $5 AND establishment_id = $6
          RETURNING *`,
        [
          status,
          optionalStr(req.body.evidence_url, 1000),
          optionalStr(req.body.description, 4000),
          req.user.id || req.user.userId,
          id,
          req.j360EstablishmentId,
        ]
      );
      if (!result.rows[0]) return res.status(404).json({ success: false, message: 'Chamado não encontrado.' });
      return res.json({ success: true, data: result.rows[0] });
    } catch (err) {
      console.error('[j360] maintenance patch:', err.message);
      return res.status(500).json({ success: false, message: 'Falha ao atualizar chamado.' });
    }
  });

  router.get('/maintenance-metrics', async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT
           COUNT(*) FILTER (WHERE status IN ('aberta','em_andamento'))::int AS abertos,
           COUNT(*) FILTER (WHERE status IN ('concluida','concluido'))::int AS concluidos,
           AVG(EXTRACT(EPOCH FROM (performed_at - created_at)) / 3600)
             FILTER (WHERE performed_at IS NOT NULL)::numeric(10,1) AS tempo_medio_horas
         FROM j360_asset_maintenance
         WHERE establishment_id = $1`,
        [req.j360EstablishmentId]
      );
      return res.json({ success: true, data: result.rows[0] });
    } catch (err) {
      console.error('[j360] maintenance metrics:', err.message);
      return res.status(500).json({ success: false, message: 'Falha ao carregar indicadores.' });
    }
  });

  return router;
};
