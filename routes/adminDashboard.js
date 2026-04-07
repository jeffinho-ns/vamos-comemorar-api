const express = require('express');
const authenticateToken = require('../middleware/auth');
const authorizeRoles = require('../middleware/authorize');
const {
  getActionLogsViewerContext,
  assertEstablishmentFilterAllowed,
} = require('../middleware/logAccessHelpers');

const DASHBOARD_ROLES = [
  'admin',
  'gerente',
  'promoter',
  'promoter-list',
  'recepção',
  'recepcao',
  'atendente',
];

function mondayStart(d) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function sundayEnd(weekStart) {
  const end = new Date(weekStart);
  end.setDate(weekStart.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

async function establishmentLabel(pool, establishmentId) {
  const bar = await pool.query('SELECT name FROM bars WHERE id = $1 LIMIT 1', [
    establishmentId,
  ]);
  if (bar.rows[0]?.name) return bar.rows[0].name;
  const place = await pool.query('SELECT name FROM places WHERE id = $1 LIMIT 1', [
    establishmentId,
  ]);
  return place.rows[0]?.name || `Estabelecimento #${establishmentId}`;
}

module.exports = (pool) => {
  const router = express.Router();

  /**
   * GET /api/v1/admin-dashboard/announcements
   * Comunicados globais (establishment_id NULL) ou por estabelecimento.
   */
  router.get(
    '/announcements',
    authenticateToken,
    authorizeRoles(...DASHBOARD_ROLES),
    async (req, res) => {
      try {
        const ctx = await getActionLogsViewerContext(pool, req);
        const filterCheck = assertEstablishmentFilterAllowed(ctx, req.query.establishment_id);
        if (!filterCheck.ok) {
          return res.status(filterCheck.status).json({
            success: false,
            error: filterCheck.error,
          });
        }

        let query = `
          SELECT id, establishment_id, title, body, footer_label, sort_order, created_at
          FROM intranet_announcements
          WHERE is_active = TRUE
        `;
        const params = [];
        let i = 1;

        if (filterCheck.establishmentId != null) {
          query += ` AND (establishment_id IS NULL OR establishment_id = $${i++})`;
          params.push(filterCheck.establishmentId);
        } else if (!ctx.superAdmin) {
          if (!ctx.establishmentIds.length) {
            query += ` AND establishment_id IS NULL`;
          } else {
            query += ` AND (establishment_id IS NULL OR establishment_id = ANY($${i++}::int[]))`;
            params.push(ctx.establishmentIds);
          }
        }

        query += ` ORDER BY sort_order ASC, id DESC LIMIT 20`;

        const result = await pool.query(query, params);
        return res.json({ success: true, announcements: result.rows });
      } catch (err) {
        if (err.code === '42P01') {
          return res.json({ success: true, announcements: [] });
        }
        console.error('Erro em /admin-dashboard/announcements:', err);
        return res.status(500).json({
          success: false,
          error: 'Erro ao carregar comunicados',
        });
      }
    },
  );

  /**
   * GET /api/v1/admin-dashboard/weekly-progress
   * Heurística via action_logs: eventos, cardápio, reservas na semana corrente (seg–dom).
   */
  router.get(
    '/weekly-progress',
    authenticateToken,
    authorizeRoles(...DASHBOARD_ROLES),
    async (req, res) => {
      try {
        const ctx = await getActionLogsViewerContext(pool, req);
        const filterCheck = assertEstablishmentFilterAllowed(ctx, req.query.establishment_id);
        if (!filterCheck.ok) {
          return res.status(filterCheck.status).json({
            success: false,
            error: filterCheck.error,
          });
        }

        const weekStart = mondayStart(new Date());
        const weekEnd = sundayEnd(weekStart);

        let targetIds = [];
        if (filterCheck.establishmentId != null) {
          targetIds = [filterCheck.establishmentId];
        } else if (ctx.superAdmin) {
          if (req.query.establishment_ids) {
            targetIds = String(req.query.establishment_ids)
              .split(',')
              .map((x) => parseInt(x.trim(), 10))
              .filter((n) => !Number.isNaN(n));
          }
        } else if (!ctx.superAdmin) {
          targetIds = [...ctx.establishmentIds];
        }

        if (!targetIds.length) {
          return res.json({ success: true, week_start: weekStart.toISOString(), items: [] });
        }

        const progressSql = `
          SELECT
            EXISTS (
              SELECT 1 FROM action_logs al
              WHERE al.establishment_id = $1
                AND al.created_at >= $2 AND al.created_at <= $3
                AND (
                  al.request_url ILIKE '%/admin/eventos%'
                  OR al.request_url ILIKE '%/api/v1/eventos%'
                  OR al.action_description ILIKE '%evento%'
                  OR al.resource_type ILIKE '%event%'
                )
            ) AS task_events,
            EXISTS (
              SELECT 1 FROM action_logs al
              WHERE al.establishment_id = $1
                AND al.created_at >= $2 AND al.created_at <= $3
                AND (
                  al.request_url ILIKE '%/cardapio%'
                  OR al.action_description ILIKE '%cardápio%'
                  OR al.action_description ILIKE '%cardapio%'
                )
            ) AS task_cardapio,
            EXISTS (
              SELECT 1 FROM action_logs al
              WHERE al.establishment_id = $1
                AND al.created_at >= $2 AND al.created_at <= $3
                AND (
                  al.request_url ILIKE '%restaurant-reservations%'
                  OR al.request_url ILIKE '%/reservas%'
                  OR al.request_url ILIKE '%large-reservations%'
                  OR al.action_description ILIKE '%reserva%'
                )
            ) AS task_reservas
        `;

        const items = [];
        for (const eid of targetIds) {
          if (!ctx.superAdmin && !ctx.establishmentIds.includes(eid)) {
            continue;
          }
          const r = await pool.query(progressSql, [eid, weekStart, weekEnd]);
          const row = r.rows[0] || {};
          const done = [row.task_events, row.task_cardapio, row.task_reservas].filter(
            Boolean,
          ).length;
          const pct = Math.round((done / 3) * 100);
          const name = await establishmentLabel(pool, eid);
          items.push({
            establishment_id: eid,
            establishment_name: name,
            percent: pct,
            tasks: {
              eventos_semana: !!row.task_events,
              cardapio: !!row.task_cardapio,
              reservas: !!row.task_reservas,
            },
          });
        }

        return res.json({
          success: true,
          week_start: weekStart.toISOString(),
          week_end: weekEnd.toISOString(),
          items,
        });
      } catch (err) {
        console.error('Erro em /admin-dashboard/weekly-progress:', err);
        return res.status(500).json({
          success: false,
          error: 'Erro ao carregar progresso semanal',
        });
      }
    },
  );

  return router;
};
