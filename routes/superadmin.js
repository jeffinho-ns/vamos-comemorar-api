'use strict';

const express = require('express');
const { superAdminRouter } = require('../middleware/requireSuperAdmin');
const billing = require('../billing/billingService');

module.exports = (pool) => {
  const router = express.Router();
  superAdminRouter(router);

  router.get('/dashboard', async (req, res) => {
    try {
      const metrics = await billing.getDashboardMetrics(pool);
      res.json({ success: true, data: metrics });
    } catch (err) {
      console.error('[superadmin/dashboard]', err.message);
      res.status(500).json({ success: false, error: 'Erro ao carregar dashboard.' });
    }
  });

  router.get('/plans', async (req, res) => {
    try {
      const plans = await billing.listPlans(pool);
      res.json({ success: true, data: plans });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/organizations', async (req, res) => {
    try {
      const organizations = await billing.listOrganizations(pool);
      res.json({ success: true, data: organizations });
    } catch (err) {
      console.error('[superadmin/organizations]', err.message);
      res.status(500).json({ success: false, error: 'Erro ao listar organizações.' });
    }
  });

  router.post('/organizations', async (req, res) => {
    try {
      const result = await billing.provisionOrganization(pool, req.body, req.user.id);
      res.status(201).json({ success: true, data: result });
    } catch (err) {
      console.error('[superadmin/organizations POST]', err.message);
      res.status(400).json({ success: false, error: err.message });
    }
  });

  router.get('/organizations/:id', async (req, res) => {
    try {
      const detail = await billing.getOrganizationDetail(pool, Number(req.params.id));
      if (!detail) return res.status(404).json({ success: false, error: 'Organização não encontrada.' });
      res.json({ success: true, data: detail });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.patch('/organizations/:id', async (req, res) => {
    try {
      const org = await billing.updateOrganization(
        pool,
        Number(req.params.id),
        req.body,
        req.user.id,
      );
      if (!org) return res.status(404).json({ success: false, error: 'Organização não encontrada.' });
      res.json({ success: true, data: org });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  router.put('/organizations/:id/plan', async (req, res) => {
    try {
      const { planKey } = req.body;
      if (!planKey) return res.status(400).json({ success: false, error: 'planKey é obrigatório.' });
      const result = await billing.changePlan(pool, Number(req.params.id), planKey, req.user.id);
      res.json({ success: true, data: result });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  router.put('/organizations/:id/modules/:moduleKey', async (req, res) => {
    try {
      const isEnabled = req.body.is_enabled !== false;
      await billing.setOrganizationModule(
        pool,
        Number(req.params.id),
        req.params.moduleKey,
        isEnabled,
        req.user.id,
      );
      res.json({ success: true });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  router.post('/organizations/:id/past-due', async (req, res) => {
    try {
      await billing.markSubscriptionPastDue(pool, Number(req.params.id), req.user.id);
      res.json({ success: true });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  router.post('/organizations/:id/invoices', async (req, res) => {
    try {
      const invoice = await billing.createInvoice(
        pool,
        { ...req.body, organizationId: Number(req.params.id) },
        req.user.id,
      );
      res.status(201).json({ success: true, data: invoice });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  router.post('/invoices/:id/payments', async (req, res) => {
    try {
      const result = await billing.recordManualPayment(
        pool,
        Number(req.params.id),
        req.body,
        req.user.id,
      );
      res.json({ success: true, data: result });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  return router;
};
