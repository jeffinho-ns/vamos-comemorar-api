'use strict';

/**
 * Justino360 — inventário de ativos (freezer, chopeira, câmara fria…).
 * Chamados de manutenção ficam em routes/justino360/maintenance.js.
 */
const express = require('express');
const { applyCommonMiddleware, requireManage, writeAudit } = require('./middleware');
const {
  str,
  optionalStr,
  parseId,
  parseBoolean,
} = require('../../validators/justino360Validator');
const { MAINTENANCE_OPEN_STATUSES } = require('../../services/justino360/constants');

const ASSET_COLUMNS = `
  a.id, a.establishment_id, a.sector_id, a.name, a.code, a.location,
  a.manufacturer, a.notes, a.next_maintenance_at, a.is_active, a.created_at`;

module.exports = (pool) => {
  const router = express.Router({ mergeParams: true });
  applyCommonMiddleware(router, pool);

  const actor = (req) => req.user.id || req.user.userId;

  router.get('/assets', async (req, res) => {
    const params = [req.j360EstablishmentId, MAINTENANCE_OPEN_STATUSES];
    let sql = `
      SELECT ${ASSET_COLUMNS},
             s.name AS sector_name,
             (SELECT COUNT(*)::int FROM j360_asset_maintenance m
               WHERE m.asset_id = a.id AND m.status = ANY($2::text[])) AS open_tickets,
             (SELECT MAX(m.performed_at) FROM j360_asset_maintenance m
               WHERE m.asset_id = a.id AND m.performed_at IS NOT NULL) AS last_maintenance_at
        FROM j360_assets a
        LEFT JOIN j360_sectors s ON s.id = a.sector_id
       WHERE a.establishment_id = $1`;

    if (!parseBoolean(req.query.include_inactive, false)) {
      sql += ' AND a.is_active = TRUE';
    }
    const sectorId = parseId(req.query.sector_id);
    if (sectorId) {
      params.push(sectorId);
      sql += ` AND a.sector_id = $${params.length}`;
    }
    const search = optionalStr(req.query.q, 120);
    if (search) {
      params.push(`%${search}%`);
      sql += ` AND (a.name ILIKE $${params.length} OR a.code ILIKE $${params.length}
                    OR a.location ILIKE $${params.length})`;
    }
    sql += ' ORDER BY s.sort_order NULLS LAST, a.name LIMIT 300';

    try {
      const result = await pool.query(sql, params);
      return res.json({ success: true, data: result.rows });
    } catch (err) {
      console.error(`[j360] assets list est=${req.j360EstablishmentId}:`, err.message);
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
        actorUserId: actor(req),
      });
      return res.status(201).json({ success: true, data: result.rows[0] });
    } catch (err) {
      console.error(`[j360] asset create est=${req.j360EstablishmentId}:`, err.message);
      return res.status(500).json({ success: false, message: 'Falha ao cadastrar equipamento.' });
    }
  });

  router.patch('/assets/:id', requireManage, async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: 'ID inválido.' });
    const fields = [];
    const params = [];
    const push = (col, val) => {
      params.push(val);
      fields.push(`${col} = $${params.length}`);
    };
    if (req.body.name !== undefined) {
      const name = str(req.body.name, 200);
      if (!name) return res.status(400).json({ success: false, message: 'Nome obrigatório.' });
      push('name', name);
    }
    if (req.body.sector_id !== undefined) push('sector_id', parseId(req.body.sector_id));
    if (req.body.code !== undefined) push('code', optionalStr(req.body.code, 80));
    if (req.body.location !== undefined) push('location', optionalStr(req.body.location, 200));
    if (req.body.manufacturer !== undefined) {
      push('manufacturer', optionalStr(req.body.manufacturer, 200));
    }
    if (req.body.notes !== undefined) push('notes', optionalStr(req.body.notes, 2000));
    if (req.body.next_maintenance_at !== undefined) {
      push('next_maintenance_at', optionalStr(req.body.next_maintenance_at, 10));
    }
    if (req.body.is_active !== undefined) push('is_active', parseBoolean(req.body.is_active, true));
    if (fields.length === 0) {
      return res.status(400).json({ success: false, message: 'Nada para atualizar.' });
    }
    fields.push('updated_at = NOW()');
    params.push(id, req.j360EstablishmentId);

    try {
      const result = await pool.query(
        `UPDATE j360_assets SET ${fields.join(', ')}
          WHERE id = $${params.length - 1} AND establishment_id = $${params.length}
          RETURNING *`,
        params
      );
      if (!result.rows[0]) {
        return res.status(404).json({ success: false, message: 'Equipamento não encontrado.' });
      }
      await writeAudit(pool, {
        establishmentId: req.j360EstablishmentId,
        entityType: 'asset',
        entityId: id,
        action: 'update',
        actorUserId: actor(req),
      });
      return res.json({ success: true, data: result.rows[0] });
    } catch (err) {
      console.error(`[j360] asset patch asset_id=${id}:`, err.message);
      return res.status(500).json({ success: false, message: 'Falha ao atualizar equipamento.' });
    }
  });

  /** Detalhe com histórico de manutenção e as ocorrências ligadas ao ativo. */
  router.get('/assets/:id', async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: 'ID inválido.' });
    try {
      const asset = await pool.query(
        `SELECT ${ASSET_COLUMNS}, s.name AS sector_name
           FROM j360_assets a
           LEFT JOIN j360_sectors s ON s.id = a.sector_id
          WHERE a.id = $1 AND a.establishment_id = $2`,
        [id, req.j360EstablishmentId]
      );
      if (!asset.rows[0]) {
        return res.status(404).json({ success: false, message: 'Equipamento não encontrado.' });
      }
      const [maintenance, incidents] = await Promise.all([
        pool.query(
          `SELECT m.*, cu.name AS created_by_name, pu.name AS performed_by_name
             FROM j360_asset_maintenance m
             LEFT JOIN users cu ON cu.id = m.created_by
             LEFT JOIN users pu ON pu.id = m.performed_by
            WHERE m.asset_id = $1 AND m.establishment_id = $2
            ORDER BY m.created_at DESC
            LIMIT 100`,
          [id, req.j360EstablishmentId]
        ),
        pool.query(
          `SELECT i.id, i.title, i.status, i.priority, i.created_at, i.resolved_at, i.solution
             FROM j360_incidents i
            WHERE i.asset_id = $1 AND i.establishment_id = $2
            ORDER BY i.created_at DESC
            LIMIT 50`,
          [id, req.j360EstablishmentId]
        ),
      ]);
      return res.json({
        success: true,
        data: {
          asset: asset.rows[0],
          maintenance: maintenance.rows,
          incidents: incidents.rows,
          can_manage: req.j360CanManage,
        },
      });
    } catch (err) {
      console.error(`[j360] asset detail asset_id=${id}:`, err.message);
      return res.status(500).json({ success: false, message: 'Falha ao carregar equipamento.' });
    }
  });

  return router;
};
