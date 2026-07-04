'use strict';

const optionalAuth = require('../middleware/optionalAuth');
const {
  getEstablishmentRules,
  listOperationalMappings,
  getCardapioBarId,
} = require('../services/establishmentRules');

module.exports = (pool) => {
  const router = require('express').Router();

  router.get('/rules', optionalAuth, async (req, res) => {
    try {
      const id = Number(req.query.establishment_id);
      if (!Number.isFinite(id) || id <= 0) {
        return res.status(400).json({ success: false, error: 'establishment_id é obrigatório.' });
      }
      const rules = await getEstablishmentRules(pool, id);
      return res.json({
        success: true,
        data: {
          establishmentId: id,
          profile: rules.profile,
          reservations: rules.reservations || {},
          cardapio: { barId: getCardapioBarId(rules, id) },
          events: rules.events || {},
          operationalAliases: rules.operationalAliases || [],
        },
      });
    } catch (err) {
      console.error('[establishment-rules]', err.message);
      return res.status(500).json({ success: false, error: 'Erro ao carregar regras.' });
    }
  });

  router.get('/cardapio-mappings', optionalAuth, async (req, res) => {
    try {
      const mappings = await listOperationalMappings(pool);
      return res.json({ success: true, data: mappings });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
};
