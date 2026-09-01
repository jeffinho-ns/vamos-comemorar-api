'use strict';

const express = require('express');
const { applyCommonMiddleware } = require('./middleware');

module.exports = (pool) => {
  const router = express.Router({ mergeParams: true });
  applyCommonMiddleware(router, pool);

  router.get('/sectors', async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT id, key, name, sort_order, is_active
           FROM iri_sectors
          WHERE organization_id = $1 AND is_active = TRUE
          ORDER BY sort_order, name`,
        [req.iriOrganizationId]
      );
      return res.json({ success: true, data: result.rows });
    } catch (err) {
      console.error(`[iri] sectors organization_id=${req.iriOrganizationId}:`, err.message);
      return res.status(500).json({ success: false, message: 'Falha ao listar setores.' });
    }
  });

  return router;
};
