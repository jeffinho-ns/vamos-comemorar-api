'use strict';

const express = require('express');
const { applyCommonMiddleware } = require('./middleware');
const repo = require('../../services/rhIdeia/playbookRepository');
const {
  resolveOpsScope,
  loadWeekBoard,
  resolvePeopleScope,
  loadWeekPeople,
  weekRange,
} = require('../../services/rhIdeia/opsWeek');

function fail(res, status, message) {
  return res.status(status).json({ success: false, data: null, message });
}

module.exports = (pool) => {
  const router = express.Router({ mergeParams: true });
  applyCommonMiddleware(router, pool);

  router.get('/playbook/week-board', async (req, res) => {
    let ctx;
    try {
      ctx = await repo.loadContext(pool, req);
    } catch (err) {
      if (err.code === '42P01') return fail(res, 503, 'Manual ainda não migrado.');
      console.error(`[iri] week-board organization_id=${req.iriOrganizationId}:`, err.message);
      return fail(res, 500, 'Falha ao carregar o quadro da semana.');
    }

    const scope = resolveOpsScope(ctx, req.query);
    if (scope.error) return fail(res, scope.error.status, scope.error.message);

    try {
      const house = await pool.query(
        `SELECT id, name FROM establishments WHERE id = $1 AND organization_id = $2`,
        [scope.establishmentId, ctx.organizationId]
      );
      if (!house.rows[0]) return fail(res, 404, 'Casa não encontrada nesta organização.');

      const board = await loadWeekBoard(pool, {
        establishmentId: scope.establishmentId,
        sectorKey: scope.sectorKey,
        start: req.query.start,
      });

      return res.json({
        success: true,
        data: {
          establishment_name: house.rows[0].name,
          sector_name: scope.sectorName,
          ...board,
        },
        message: null,
      });
    } catch (err) {
      if (err.code === '42P01') {
        return res.json({
          success: true,
          data: {
            establishment_name: null,
            sector_name: scope.sectorName,
            start: null,
            end: null,
            days: [],
            sectors: [],
          },
          message: null,
        });
      }
      console.error(
        `[iri] week-board organization_id=${ctx.organizationId} establishment_id=${scope.establishmentId}:`,
        err.message
      );
      return fail(res, 500, 'Falha ao montar o quadro da semana.');
    }
  });

  router.get('/playbook/week-people', async (req, res) => {
    let ctx;
    try {
      ctx = await repo.loadContext(pool, req);
    } catch (err) {
      if (err.code === '42P01') return fail(res, 503, 'Manual ainda não migrado.');
      console.error(`[iri] week-people organization_id=${req.iriOrganizationId}:`, err.message);
      return fail(res, 500, 'Falha ao carregar a progressão da semana.');
    }

    const scope = resolvePeopleScope(ctx, req.query);
    if (scope.error) return fail(res, scope.error.status, scope.error.message);

    try {
      const board = await loadWeekPeople(pool, {
        organizationId: ctx.organizationId,
        establishmentId: scope.establishmentId,
        sectorKey: scope.sectorKey,
        userId: scope.userId,
        start: req.query.start,
      });
      return res.json({
        success: true,
        data: { sees_all: Boolean(ctx.scope.seesAll), ...board },
        message: null,
      });
    } catch (err) {
      if (err.code === '42P01') {
        const range = weekRange(req.query.start);
        return res.json({
          success: true,
          data: { sees_all: Boolean(ctx.scope.seesAll), ...range, people: [] },
          message: null,
        });
      }
      console.error(`[iri] week-people organization_id=${ctx.organizationId}:`, err.message);
      return fail(res, 500, 'Falha ao montar a progressão da semana.');
    }
  });

  return router;
};
