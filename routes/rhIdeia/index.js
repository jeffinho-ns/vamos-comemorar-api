'use strict';

/**
 * Ideia RH — API people ops Grupo Ideia Um
 * Mount: /api/rh-ideia
 */
const express = require('express');

module.exports = (pool) => {
  const router = express.Router({ mergeParams: true });

  router.get('/health', (_req, res) => {
    res.json({
      success: true,
      module: 'rh_ideia',
      credit: 'Ideia RH · Grupo Ideia Um',
    });
  });

  router.use(require('./home')(pool));
  router.use(require('./sectors')(pool));
  router.use(require('./dashboard')(pool));
  router.use(require('./announcements')(pool));
  router.use(require('./documents')(pool));
  router.use(require('./trainings')(pool));
  router.use(require('./establishments')(pool));
  router.use(require('./upload')(pool));

  return router;
};
