'use strict';

const express = require('express');
const authenticateToken = require('../middleware/auth');
const tenantMiddleware = require('../tenancy/tenantMiddleware');
const { requireAccountAdmin } = require('../tenancy/requireAccountAdmin');
const billing = require('../billing/billingService');

module.exports = (pool) => {
  const router = express.Router();

  router.use(authenticateToken);
  router.use(tenantMiddleware());
  router.use(requireAccountAdmin());

  function orgId(req) {
    return req.orgAdminContext?.organizationId ?? req.tenant?.primaryOrganizationId ?? null;
  }

  router.get('/roles', async (req, res) => {
    try {
      const organizationId = orgId(req);
      if (!organizationId) {
        return res.status(403).json({ success: false, error: 'Organização não identificada.' });
      }
      const roles = await billing.listOrganizationRoles(pool, organizationId);
      res.json({ success: true, data: roles });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/establishments', async (req, res) => {
    try {
      const organizationId = orgId(req);
      if (!organizationId) {
        return res.status(403).json({ success: false, error: 'Organização não identificada.' });
      }
      const establishments = await billing.listOrganizationEstablishments(pool, organizationId);
      res.json({ success: true, data: establishments });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/memberships', async (req, res) => {
    try {
      const organizationId = orgId(req);
      if (!organizationId) {
        return res.status(403).json({ success: false, error: 'Organização não identificada.' });
      }
      const memberships = await billing.listOrganizationMemberships(pool, organizationId);
      res.json({ success: true, data: memberships });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/memberships', async (req, res) => {
    try {
      const organizationId = orgId(req);
      if (!organizationId) {
        return res.status(403).json({ success: false, error: 'Organização não identificada.' });
      }
      const membership = await billing.createOrganizationMembership(
        pool,
        organizationId,
        req.body,
        req.user.id,
      );
      res.status(201).json({ success: true, data: membership });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  router.patch('/memberships/:id', async (req, res) => {
    try {
      const organizationId = orgId(req);
      if (!organizationId) {
        return res.status(403).json({ success: false, error: 'Organização não identificada.' });
      }
      const membership = await billing.updateOrganizationMembership(
        pool,
        organizationId,
        Number(req.params.id),
        req.body,
        req.user.id,
      );
      res.json({ success: true, data: membership });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  return router;
};
