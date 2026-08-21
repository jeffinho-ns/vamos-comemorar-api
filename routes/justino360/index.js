'use strict';

/**
 * Justino360 — API de operação do Seu Justino (concepção Isa)
 * Mount: /api/justino360
 */
const express = require('express');

module.exports = (pool) => {
  const router = express.Router({ mergeParams: true });

  router.get('/health', (_req, res) => {
    res.json({
      success: true,
      module: 'justino360',
      credit: 'Justino360 · concepção Isa',
    });
  });

  router.use(require('./dashboard')(pool));
  router.use(require('./checklists')(pool));
  router.use(require('./incidents')(pool));
  router.use(require('./tasks')(pool));
  router.use(require('./documents')(pool));
  router.use(require('./announcements')(pool));
  router.use(require('./trainings')(pool));
  router.use(require('./calendar')(pool));
  router.use(require('./meetings')(pool));
  router.use(require('./assets')(pool));
  router.use(require('./maintenance')(pool));
  router.use(require('./upload')(pool));
  router.use(require('./ai')(pool));

  return router;
};
