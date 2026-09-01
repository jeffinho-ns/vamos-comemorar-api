'use strict';

const express = require('express');
const { applyCommonMiddleware } = require('./middleware');

module.exports = (pool) => {
  const router = express.Router({ mergeParams: true });
  applyCommonMiddleware(router, pool);

  router.get('/establishments', async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT e.id, e.name, e.slug, e.legacy_place_id, e.legacy_bar_id, e.status
           FROM establishments e
          WHERE e.organization_id = $1
          ORDER BY e.name`,
        [req.iriOrganizationId]
      );
      return res.json({ success: true, data: result.rows });
    } catch (err) {
      console.error(`[iri] establishments organization_id=${req.iriOrganizationId}:`, err.message);
      return res.status(500).json({ success: false, message: 'Falha ao listar unidades.' });
    }
  });

  return router;
};
