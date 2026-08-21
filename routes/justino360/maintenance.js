'use strict';

/**
 * Justino360 — chamados de manutenção dos ativos (corretiva, preventiva, inspeção).
 * Inventário de equipamentos fica em routes/justino360/assets.js.
 */
const express = require('express');
const { applyCommonMiddleware, writeAudit } = require('./middleware');
const {
  str,
  optionalStr,
  parseId,
  parseBoolean,
  validateMaintenanceKind,
  validateMaintenanceStatus,
} = require('../../validators/justino360Validator');
const {
  MAINTENANCE_OPEN_STATUSES,
  MAINTENANCE_DONE_STATUSES,
} = require('../../services/justino360/constants');
const {
  isDoneStatus,
  validateOpening,
  validateCompletion,
  summarizeMaintenanceMetrics,
} = require('../../services/justino360/maintenance');

module.exports = (pool) => {
  const router = express.Router({ mergeParams: true });
  applyCommonMiddleware(router, pool);

  const actor = (req) => req.user.id || req.user.userId;

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
      console.error(`[j360] maintenance list asset_id=${id}:`, err.message);
      return res.status(500).json({ success: false, message: 'Falha ao listar manutenções.' });
    }
  });

  router.post('/assets/:id/maintenance', async (req, res) => {
    const assetId = parseId(req.params.id);
    const title = str(req.body.title, 300);
    if (!assetId || !title) {
      return res.status(400).json({ success: false, message: 'Equipamento e título obrigatórios.' });
    }
    const requested = validateMaintenanceStatus(req.body.status);
    const opening = validateOpening({ status: requested });
    if (opening) return res.status(opening.status).json({ success: false, message: opening.message });

    try {
      const asset = await pool.query(
        `SELECT id FROM j360_assets WHERE id = $1 AND establishment_id = $2`,
        [assetId, req.j360EstablishmentId]
      );
      if (!asset.rows[0]) {
        return res.status(404).json({ success: false, message: 'Equipamento não encontrado.' });
      }
      const result = await pool.query(
        `INSERT INTO j360_asset_maintenance
          (asset_id, establishment_id, kind, title, description, status, evidence_url, due_at, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [
          assetId,
          req.j360EstablishmentId,
          validateMaintenanceKind(req.body.kind),
          title,
          optionalStr(req.body.description, 4000),
          requested || 'aberta',
          optionalStr(req.body.evidence_url, 1000),
          optionalStr(req.body.due_at, 40),
          actor(req),
        ]
      );
      await writeAudit(pool, {
        establishmentId: req.j360EstablishmentId,
        entityType: 'asset_maintenance',
        entityId: result.rows[0].id,
        action: 'create',
        actorUserId: actor(req),
        payload: { asset_id: assetId, kind: result.rows[0].kind },
      });
      return res.status(201).json({ success: true, data: result.rows[0] });
    } catch (err) {
      console.error(
        `[j360] maintenance create est=${req.j360EstablishmentId} asset_id=${assetId}:`,
        err.message
      );
      return res.status(500).json({ success: false, message: 'Falha ao abrir chamado.' });
    }
  });

  /** Fila de chamados: `?open=1` traz só os pendentes. */
  router.get('/maintenance', async (req, res) => {
    const params = [req.j360EstablishmentId];
    let sql = `
      SELECT m.*, a.name AS asset_name, a.location AS asset_location,
             s.name AS sector_name,
             cu.name AS created_by_name, pu.name AS performed_by_name
        FROM j360_asset_maintenance m
        JOIN j360_assets a ON a.id = m.asset_id
        LEFT JOIN j360_sectors s ON s.id = a.sector_id
        LEFT JOIN users cu ON cu.id = m.created_by
        LEFT JOIN users pu ON pu.id = m.performed_by
       WHERE m.establishment_id = $1`;

    if (parseBoolean(req.query.open, false)) {
      params.push(MAINTENANCE_OPEN_STATUSES);
      sql += ` AND m.status = ANY($${params.length}::text[])`;
    } else {
      const status = validateMaintenanceStatus(req.query.status);
      if (status) {
        params.push(isDoneStatus(status) ? MAINTENANCE_DONE_STATUSES : [status]);
        sql += ` AND m.status = ANY($${params.length}::text[])`;
      }
    }
    const assetId = parseId(req.query.asset_id);
    if (assetId) {
      params.push(assetId);
      sql += ` AND m.asset_id = $${params.length}`;
    }
    sql += ' ORDER BY m.due_at NULLS LAST, m.created_at DESC LIMIT 200';

    try {
      const result = await pool.query(sql, params);
      return res.json({ success: true, data: result.rows });
    } catch (err) {
      console.error(`[j360] maintenance queue est=${req.j360EstablishmentId}:`, err.message);
      return res.status(500).json({ success: false, message: 'Falha ao listar chamados.' });
    }
  });

  router.patch('/maintenance/:id', async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: 'ID inválido.' });
    const status = validateMaintenanceStatus(req.body.status);
    const evidenceUrl = optionalStr(req.body.evidence_url, 1000);

    try {
      const current = await pool.query(
        `SELECT id, asset_id, status, evidence_url FROM j360_asset_maintenance
          WHERE id = $1 AND establishment_id = $2`,
        [id, req.j360EstablishmentId]
      );
      const row = current.rows[0];
      if (!row) return res.status(404).json({ success: false, message: 'Chamado não encontrado.' });

      const blocked = validateCompletion({
        status,
        evidenceUrl,
        currentEvidenceUrl: row.evidence_url,
      });
      if (blocked) {
        return res.status(blocked.status).json({ success: false, message: blocked.message });
      }

      const concluding = isDoneStatus(status);
      const result = await pool.query(
        `UPDATE j360_asset_maintenance
            SET status = COALESCE($1, status),
                evidence_url = COALESCE($2, evidence_url),
                description = COALESCE($3, description),
                resolution = COALESCE($4, resolution),
                due_at = COALESCE($5, due_at),
                performed_by = CASE WHEN $6 THEN $7 ELSE performed_by END,
                performed_at = CASE WHEN $6 THEN NOW() ELSE performed_at END
          WHERE id = $8 AND establishment_id = $9
          RETURNING *`,
        [
          concluding ? 'concluida' : status,
          evidenceUrl,
          optionalStr(req.body.description, 4000),
          optionalStr(req.body.resolution, 4000),
          optionalStr(req.body.due_at, 40),
          concluding,
          actor(req),
          id,
          req.j360EstablishmentId,
        ]
      );
      await writeAudit(pool, {
        establishmentId: req.j360EstablishmentId,
        entityType: 'asset_maintenance',
        entityId: id,
        action: status ? `status_${concluding ? 'concluida' : status}` : 'update',
        actorUserId: actor(req),
        payload: { asset_id: row.asset_id },
      });
      return res.json({ success: true, data: result.rows[0] });
    } catch (err) {
      console.error(
        `[j360] maintenance patch est=${req.j360EstablishmentId} maintenance_id=${id}:`,
        err.message
      );
      return res.status(500).json({ success: false, message: 'Falha ao atualizar chamado.' });
    }
  });

  router.get('/maintenance-metrics', async (req, res) => {
    const est = req.j360EstablishmentId;
    try {
      const [totals, byKind] = await Promise.all([
        pool.query(
          `SELECT
             COUNT(*) FILTER (WHERE status = ANY($2::text[]))::int AS abertos,
             COUNT(*) FILTER (WHERE status = 'em_andamento')::int AS em_andamento,
             COUNT(*) FILTER (WHERE status = ANY($3::text[]))::int AS concluidos,
             COUNT(*) FILTER (
               WHERE status = ANY($3::text[]) AND performed_at >= NOW() - INTERVAL '30 days'
             )::int AS concluidos_30d,
             ROUND(
               (AVG(EXTRACT(EPOCH FROM (performed_at - created_at)) / 3600)
                  FILTER (WHERE performed_at IS NOT NULL))::numeric,
               1
             ) AS tempo_medio_horas,
             (SELECT COUNT(*)::int FROM j360_assets a
               WHERE a.establishment_id = $1 AND a.is_active = TRUE
                 AND a.next_maintenance_at IS NOT NULL
                 AND a.next_maintenance_at < CURRENT_DATE) AS preventivas_vencidas
           FROM j360_asset_maintenance
          WHERE establishment_id = $1`,
          [est, MAINTENANCE_OPEN_STATUSES, MAINTENANCE_DONE_STATUSES]
        ),
        pool.query(
          `SELECT kind,
                  COUNT(*) FILTER (WHERE status = ANY($2::text[]))::int AS abertos,
                  COUNT(*) FILTER (WHERE status = ANY($3::text[]))::int AS concluidos
             FROM j360_asset_maintenance
            WHERE establishment_id = $1
            GROUP BY kind
            ORDER BY kind`,
          [est, MAINTENANCE_OPEN_STATUSES, MAINTENANCE_DONE_STATUSES]
        ),
      ]);
      return res.json({
        success: true,
        data: summarizeMaintenanceMetrics(totals.rows[0], byKind.rows),
      });
    } catch (err) {
      console.error(`[j360] maintenance metrics est=${est}:`, err.message);
      return res.status(500).json({ success: false, message: 'Falha ao carregar indicadores.' });
    }
  });

  return router;
};
