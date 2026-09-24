'use strict';

const express = require('express');
const { applyCommonMiddleware } = require('./middleware');
const { PLAYBOOK_VERSION, isLeaderRole } = require('../../services/rhIdeia/playbookRoles');
const { canSeeTeamMember } = require('../../services/rhIdeia/playbookAccess');
const { POINTS, awardOnce } = require('../../services/rhIdeia/playbookPoints');
const repo = require('../../services/rhIdeia/playbookRepository');

function fail(res, status, message) {
  return res.status(status).json({ success: false, message });
}

async function contextOrFail(pool, req, res) {
  try {
    return await repo.loadContext(pool, req);
  } catch (err) {
    if (err.code === '42P01') {
      fail(res, 503, 'Manual ainda não migrado. Rode a migration do playbook.');
      return null;
    }
    console.error('[iri] playbook ops:', err.message);
    fail(res, 500, 'Falha ao carregar o manual.');
    return null;
  }
}

module.exports = (pool) => {
  const router = express.Router({ mergeParams: true });
  applyCommonMiddleware(router, pool);

  router.get('/playbook/team', async (req, res) => {
    const ctx = await contextOrFail(pool, req, res);
    if (!ctx) return undefined;
    const leader = ctx.scope.seesAll || (ctx.profile && isLeaderRole(ctx.profile.role_key));
    if (!leader) return fail(res, 403, 'Painel da equipe é do líder e do RH.');
    const { rows } = await pool.query(
      `SELECT p.user_id, u.name AS user_name, p.role_key, p.establishment_id, e.name AS establishment_name,
              s.key AS sector_key,
              (SELECT COUNT(*)::int FROM iri_playbook_chapters c
                WHERE c.organization_id = p.organization_id
                  AND c.establishment_id = p.establishment_id
                  AND c.is_current = TRUE AND c.version = $2
                  AND (c.audience = 'common' OR (c.audience = 'role' AND p.role_key = ANY(c.visible_roles)))
              ) AS chapters_required,
              (SELECT COUNT(*)::int FROM iri_playbook_reads r
                JOIN iri_playbook_chapters c ON c.id = r.chapter_id
                WHERE r.user_id = p.user_id AND r.version = $2 AND c.is_current = TRUE
                  AND c.establishment_id = p.establishment_id
                  AND (c.audience = 'common' OR (c.audience = 'role' AND p.role_key = ANY(c.visible_roles)))
              ) AS chapters_read,
              EXISTS (
                SELECT 1 FROM iri_playbook_terms t
                 WHERE t.user_id = p.user_id AND t.version = $2
              ) AS term_accepted,
              (SELECT MAX(a.score) FROM iri_playbook_attempts a
                WHERE a.user_id = p.user_id AND a.version = $2) AS quiz_score,
              EXISTS (
                SELECT 1 FROM iri_playbook_attempts a
                 WHERE a.user_id = p.user_id AND a.version = $2 AND a.passed = TRUE
              ) AS quiz_passed,
              (SELECT COALESCE(SUM(l.points), 0)::int FROM iri_point_ledger l
                WHERE l.organization_id = p.organization_id AND l.user_id = p.user_id) AS points
         FROM iri_employee_profiles p
         JOIN users u ON u.id = p.user_id
         JOIN establishments e ON e.id = p.establishment_id
         LEFT JOIN iri_sectors s ON s.id = p.sector_id
        WHERE p.organization_id = $1`,
      [ctx.organizationId, PLAYBOOK_VERSION]
    );
    const data = rows.filter((member) =>
      canSeeTeamMember({ seesAll: ctx.scope.seesAll, actor: ctx.profile, member })
    );
    return res.json({ success: true, data });
  });

  router.get('/playbook/checklists', async (req, res) => {
    const ctx = await contextOrFail(pool, req, res);
    if (!ctx?.profile) return fail(res, 422, 'Sua função ainda não foi cadastrada pelo RH.');
    const checklist = await pool.query(
      `SELECT id, title, role_key FROM iri_playbook_checklists
        WHERE organization_id = $1 AND establishment_id = $2 AND role_key = $3 AND version = $4`,
      [ctx.organizationId, ctx.profile.establishment_id, ctx.profile.role_key, PLAYBOOK_VERSION]
    );
    if (!checklist.rows[0]) return res.json({ success: true, data: null });
    const items = await pool.query(
      `SELECT id, label, sort_order FROM iri_playbook_checklist_items
        WHERE checklist_id = $1 ORDER BY sort_order`,
      [checklist.rows[0].id]
    );
    const run = await pool.query(
      `SELECT id, status, run_date FROM iri_playbook_checklist_runs
        WHERE checklist_id = $1 AND user_id = $2 AND run_date = CURRENT_DATE`,
      [checklist.rows[0].id, ctx.userId]
    );
    return res.json({
      success: true,
      data: { ...checklist.rows[0], items: items.rows, today: run.rows[0] || null },
    });
  });

  router.post('/playbook/checklists/today', async (req, res) => {
    const ctx = await contextOrFail(pool, req, res);
    if (!ctx?.profile) return fail(res, 422, 'Sua função ainda não foi cadastrada pelo RH.');
    const itemIds = Array.isArray(req.body?.item_ids) ? req.body.item_ids.map(Number) : [];
    const checklist = await pool.query(
      `SELECT id FROM iri_playbook_checklists
        WHERE organization_id = $1 AND establishment_id = $2 AND role_key = $3 AND version = $4`,
      [ctx.organizationId, ctx.profile.establishment_id, ctx.profile.role_key, PLAYBOOK_VERSION]
    );
    if (!checklist.rows[0]) return fail(res, 404, 'Checklist desta função não existe.');
    const existing = await pool.query(
      `SELECT id, status FROM iri_playbook_checklist_runs
        WHERE checklist_id = $1 AND user_id = $2 AND run_date = CURRENT_DATE`,
      [checklist.rows[0].id, ctx.userId]
    );
    if (existing.rows[0]?.status === 'conferido') {
      return fail(res, 409, 'O líder já conferiu o checklist de hoje.');
    }
    const run = existing.rows[0]
      ? existing.rows[0]
      : (
          await pool.query(
            `INSERT INTO iri_playbook_checklist_runs (checklist_id, user_id, status)
             VALUES ($1, $2, 'entregue') RETURNING id, status`,
            [checklist.rows[0].id, ctx.userId]
          )
        ).rows[0];
    await pool.query(`DELETE FROM iri_playbook_checklist_ticks WHERE run_id = $1`, [run.id]);
    for (const itemId of itemIds) {
      await pool.query(
        `INSERT INTO iri_playbook_checklist_ticks (run_id, item_id)
         SELECT $1, id FROM iri_playbook_checklist_items
          WHERE id = $2 AND checklist_id = $3
         ON CONFLICT DO NOTHING`,
        [run.id, itemId, checklist.rows[0].id]
      );
    }
    return res.json({ success: true, data: { id: run.id, status: 'entregue' } });
  });

  router.post('/playbook/checklist-runs/:id/confirm', async (req, res) => {
    const ctx = await contextOrFail(pool, req, res);
    if (!ctx) return undefined;
    const runId = Number(req.params.id);
    const { rows } = await pool.query(
      `SELECT r.id, r.user_id, r.status, c.establishment_id, p.role_key, s.key AS sector_key
         FROM iri_playbook_checklist_runs r
         JOIN iri_playbook_checklists c ON c.id = r.checklist_id
         JOIN iri_employee_profiles p
           ON p.user_id = r.user_id AND p.organization_id = c.organization_id
         LEFT JOIN iri_sectors s ON s.id = p.sector_id
        WHERE r.id = $1 AND c.organization_id = $2`,
      [runId, ctx.organizationId]
    );
    const run = rows[0];
    if (!run) return fail(res, 404, 'Checklist não encontrado.');
    const allowed = canSeeTeamMember({
      seesAll: ctx.scope.seesAll,
      actor: ctx.profile,
      member: run,
    });
    if (!allowed || run.user_id === ctx.userId) {
      return fail(res, 403, 'Quem confere é o líder da área, não a própria pessoa.');
    }
    if (run.status === 'conferido') return res.json({ success: true, data: { id: run.id, status: 'conferido' } });
    await pool.query(
      `UPDATE iri_playbook_checklist_runs
          SET status = 'conferido', confirmed_by = $2, confirmed_at = NOW()
        WHERE id = $1`,
      [run.id, ctx.userId]
    );
    await awardOnce(pool, {
      organizationId: ctx.organizationId,
      establishmentId: run.establishment_id,
      userId: run.user_id,
      source: 'checklist',
      points: POINTS.checklist,
      evidenceType: 'checklist_run',
      evidenceId: run.id,
      createdBy: ctx.userId,
    });
    await awardOnce(pool, {
      organizationId: ctx.organizationId,
      establishmentId: run.establishment_id,
      userId: ctx.userId,
      source: 'checklist_lider',
      points: POINTS.checklist_lider,
      evidenceType: 'checklist_run',
      evidenceId: run.id,
      createdBy: ctx.userId,
    });
    return res.json({ success: true, data: { id: run.id, status: 'conferido' } });
  });

  router.get('/playbook/checklist-runs', async (req, res) => {
    const ctx = await contextOrFail(pool, req, res);
    if (!ctx) return undefined;
    if (!ctx.scope.seesAll && !(ctx.profile && isLeaderRole(ctx.profile.role_key))) {
      return fail(res, 403, 'Fila de checklist é do líder e do RH.');
    }
    const { rows } = await pool.query(
      `SELECT r.id, r.user_id, r.status, r.run_date, u.name AS user_name,
              p.role_key, p.establishment_id, s.key AS sector_key
         FROM iri_playbook_checklist_runs r
         JOIN iri_playbook_checklists c ON c.id = r.checklist_id
         JOIN iri_employee_profiles p ON p.user_id = r.user_id AND p.organization_id = c.organization_id
         JOIN users u ON u.id = r.user_id
         LEFT JOIN iri_sectors s ON s.id = p.sector_id
        WHERE c.organization_id = $1 AND r.status = 'entregue'
        ORDER BY r.run_date DESC
        LIMIT 200`,
      [ctx.organizationId]
    );
    const data = rows.filter((member) =>
      canSeeTeamMember({ seesAll: ctx.scope.seesAll, actor: ctx.profile, member })
    );
    return res.json({ success: true, data });
  });

  return router;
};
