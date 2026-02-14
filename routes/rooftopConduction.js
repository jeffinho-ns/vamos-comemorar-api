// routes/rooftopConduction.js
// Condução do Fluxo Rooftop: GET lista de conduzidos, POST confirmar (idempotente)

const express = require('express');
const auth = require('../middleware/auth');
const authorize = require('../middleware/authorize');

module.exports = (pool) => {
  const router = express.Router();

  const allowedRoles = ['admin', 'gerente', 'hostess', 'promoter', 'recepção', 'recepcao'];

  /**
   * GET /api/rooftop/conduction
   * Query: establishment_id, flow_date (YYYY-MM-DD)
   * Response: { conduced_ids: string[] }
   */
  router.get('/conduction', auth, authorize(...allowedRoles), async (req, res) => {
    try {
      const establishment_id = req.query.establishment_id;
      const flow_date = req.query.flow_date;

      if (!establishment_id || !flow_date) {
        return res.status(400).json({
          message: 'Parâmetros obrigatórios: establishment_id, flow_date',
          error: 'MISSING_PARAMS',
        });
      }

      const result = await pool.query(
        `SELECT queue_item_id FROM rooftop_conduction
         WHERE establishment_id = $1 AND flow_date = $2::DATE
         ORDER BY conducted_at ASC`,
        [establishment_id, flow_date],
      );

      const conduced_ids = (result.rows || []).map((r) => r.queue_item_id);

      return res.status(200).json({ conduced_ids });
    } catch (err) {
      console.error('❌ [GET /rooftop/conduction]', err.message);
      return res.status(500).json({
        message: err.message || 'Erro ao listar conduções',
        error: 'SERVER_ERROR',
      });
    }
  });

  /**
   * POST /api/rooftop/conduction
   * Body: establishment_id, flow_date, queue_item_id, entity_type, entity_id, guest_list_id?, reservation_id?
   * Idempotente: upsert por (establishment_id, flow_date, queue_item_id)
   */
  router.post('/conduction', auth, authorize(...allowedRoles), async (req, res) => {
    try {
      const {
        establishment_id,
        flow_date,
        queue_item_id,
        entity_type,
        entity_id,
        guest_list_id,
        reservation_id,
      } = req.body;

      if (!establishment_id || !flow_date || !queue_item_id || entity_type == null || entity_id == null) {
        return res.status(400).json({
          message: 'Campos obrigatórios: establishment_id, flow_date, queue_item_id, entity_type, entity_id',
          error: 'MISSING_BODY',
        });
      }

      const conducted_by = req.user?.email || req.user?.name || `user_${req.user?.id || 'unknown'}`;

      await pool.query(
        `INSERT INTO rooftop_conduction (
          establishment_id, flow_date, queue_item_id, entity_type, entity_id,
          guest_list_id, reservation_id, conducted_by
        ) VALUES ($1, $2::DATE, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (establishment_id, flow_date, queue_item_id)
        DO UPDATE SET
          entity_type = EXCLUDED.entity_type,
          entity_id = EXCLUDED.entity_id,
          guest_list_id = EXCLUDED.guest_list_id,
          reservation_id = EXCLUDED.reservation_id,
          conducted_at = CURRENT_TIMESTAMP,
          conducted_by = EXCLUDED.conducted_by`,
        [
          establishment_id,
          flow_date,
          String(queue_item_id).slice(0, 128),
          String(entity_type),
          Number(entity_id),
          guest_list_id != null ? Number(guest_list_id) : null,
          reservation_id != null ? Number(reservation_id) : null,
          conducted_by,
        ],
      );

      return res.status(200).json({});
    } catch (err) {
      console.error('❌ [POST /rooftop/conduction]', err.message);
      return res.status(500).json({
        message: err.message || 'Erro ao confirmar condução',
        error: 'SERVER_ERROR',
      });
    }
  });

  return router;
};
