'use strict';

const express = require('express');

/**
 * Rotas de escrita do BI Seu Justino — área marketing.
 * Montadas em /api/bi (autenticação já vem do router pai). Use services/biJustino/espelho/escrita.gravarNaPlanilha
 * e informe em `recoletar` as chaves do catálogo que a escrita afeta.
 */
module.exports = (pool) => {
  const router = express.Router();
  void pool;
  return router;
};
