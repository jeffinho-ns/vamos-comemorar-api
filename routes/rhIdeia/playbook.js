'use strict';

const express = require('express');
const { applyCommonMiddleware, requireManage, writeAudit } = require('./middleware');
const { PLAYBOOK_VERSION, PLAYBOOK_ROLES, findRole, PASSING_SCORE } = require('../../services/rhIdeia/playbookRoles');
const { canReadChapter, canSeeAnswerKey } = require('../../services/rhIdeia/playbookAccess');
const { publicQuestions, gradeAttempt } = require('../../services/rhIdeia/playbookQuizBank');
const { POINTS, awardOnce } = require('../../services/rhIdeia/playbookPoints');
const { seedPlaybook } = require('../../services/rhIdeia/playbookSeed');
const repo = require('../../services/rhIdeia/playbookRepository');

function userIdOf(req) {
  return req.user.id || req.user.userId;
}

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
    console.error(`[iri] playbook organization_id=${req.iriOrganizationId}:`, err.message);
    fail(res, 500, 'Falha ao carregar o manual.');
    return null;
  }
}

module.exports = (pool) => {
  const router = express.Router({ mergeParams: true });
  applyCommonMiddleware(router, pool);

  router.get('/playbook/roles', (_req, res) => {
    res.json({ success: true, data: PLAYBOOK_ROLES });
  });

  router.post('/playbook/seed', requireManage, async (req, res) => {
    try {
      const seeded = await seedPlaybook(pool, req.iriOrganizationId);
      if (!seeded.ok) return fail(res, 422, seeded.message);
      return res.json({ success: true, data: seeded });
    } catch (err) {
      console.error(`[iri] playbook seed organization_id=${req.iriOrganizationId}:`, err.message);
      return fail(res, 500, 'Falha ao publicar o manual.');
    }
  });

  router.get('/playbook/status', async (req, res) => {
    const ctx = await contextOrFail(pool, req, res);
    if (!ctx) return undefined;
    try {
      const status = await repo.buildStatus(pool, {
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        seesAll: ctx.scope.seesAll,
        profile: ctx.profile,
        chapters: ctx.chapters,
      });
      return res.json({ success: true, data: status });
    } catch (err) {
      console.error(`[iri] playbook status organization_id=${ctx.organizationId}:`, err.message);
      return fail(res, 500, 'Falha ao consultar o manual.');
    }
  });

  router.get('/playbook/chapters', async (req, res) => {
    const ctx = await contextOrFail(pool, req, res);
    if (!ctx) return undefined;
    const rows = repo.visibleChapters(ctx.chapters, {
      seesAll: ctx.scope.seesAll,
      profile: ctx.profile,
    });
    const reads = ctx.profile ? await repo.readIdsForUser(pool, ctx.userId) : new Set();
    const data = rows.map((chapter) => ({
      id: chapter.id,
      slug: chapter.slug,
      part: chapter.part,
      title: chapter.title,
      body: chapter.body,
      version: chapter.version,
      read: reads.has(chapter.id),
    }));
    return res.json({
      success: true,
      data,
      meta: { sees_all: ctx.scope.seesAll, watermark: ctx.profile?.user_name || req.user?.name || '' },
    });
  });

  router.post('/playbook/chapters/:id/read', async (req, res) => {
    const ctx = await contextOrFail(pool, req, res);
    if (!ctx) return undefined;
    const chapterId = Number(req.params.id);
    const chapter = ctx.chapters.find((item) => item.id === chapterId);
    if (!chapter || !canReadChapter({ seesAll: ctx.scope.seesAll, profile: ctx.profile, chapter })) {
      return fail(res, 404, 'Capítulo não encontrado.');
    }
    await pool.query(
      `INSERT INTO iri_playbook_reads (chapter_id, user_id, version)
       VALUES ($1, $2, $3)
       ON CONFLICT (chapter_id, user_id, version) DO NOTHING`,
      [chapter.id, ctx.userId, chapter.version]
    );
    await writeAudit(pool, {
      organizationId: ctx.organizationId,
      establishmentId: ctx.profile?.establishment_id,
      entityType: 'playbook_chapter',
      entityId: chapter.id,
      action: 'read',
      actorUserId: ctx.userId,
    });
    return res.json({ success: true, data: { id: chapter.id, read: true } });
  });

  router.post('/playbook/term', async (req, res) => {
    const ctx = await contextOrFail(pool, req, res);
    if (!ctx?.profile) return fail(res, 422, 'Sua função ainda não foi cadastrada pelo RH.');
    await pool.query(
      `INSERT INTO iri_playbook_terms (organization_id, establishment_id, user_id, version)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (organization_id, user_id, version) DO NOTHING`,
      [ctx.organizationId, ctx.profile.establishment_id, ctx.userId, PLAYBOOK_VERSION]
    );
    await writeAudit(pool, {
      organizationId: ctx.organizationId,
      establishmentId: ctx.profile.establishment_id,
      entityType: 'playbook_term',
      entityId: ctx.userId,
      action: 'accept',
      actorUserId: ctx.userId,
      payload: { version: PLAYBOOK_VERSION },
    });
    return res.json({ success: true, data: { accepted: true } });
  });

  router.get('/playbook/quiz', async (req, res) => {
    const ctx = await contextOrFail(pool, req, res);
    if (!ctx?.profile && !ctx?.scope.seesAll) return fail(res, 422, 'Sua função ainda não foi cadastrada pelo RH.');
    const { rows } = await pool.query(
      `SELECT id, slug, sort_order, prompt, options
         FROM iri_playbook_questions
        WHERE organization_id = $1 AND version = $2
        ORDER BY sort_order`,
      [ctx.organizationId, PLAYBOOK_VERSION]
    );
    return res.json({
      success: true,
      data: publicQuestions(rows),
      meta: { passing_score: PASSING_SCORE, total: rows.length },
    });
  });

  router.post('/playbook/quiz', async (req, res) => {
    const ctx = await contextOrFail(pool, req, res);
    if (!ctx?.profile) return fail(res, 422, 'Sua função ainda não foi cadastrada pelo RH.');
    const submitted = Array.isArray(req.body?.answers) ? req.body.answers : [];
    const { rows } = await pool.query(
      `SELECT q.slug, k.correct_index AS correct
         FROM iri_playbook_questions q
         JOIN iri_playbook_answer_keys k ON k.question_id = q.id
        WHERE q.organization_id = $1 AND q.version = $2`,
      [ctx.organizationId, PLAYBOOK_VERSION]
    );
    const result = gradeAttempt(rows, submitted);
    const saved = await pool.query(
      `INSERT INTO iri_playbook_attempts
        (organization_id, establishment_id, user_id, version, score, total, passed)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, score, total, passed`,
      [
        ctx.organizationId,
        ctx.profile.establishment_id,
        ctx.userId,
        PLAYBOOK_VERSION,
        result.score,
        result.total,
        result.passed,
      ]
    );
    if (result.passed) {
      await awardOnce(pool, {
        organizationId: ctx.organizationId,
        establishmentId: ctx.profile.establishment_id,
        userId: ctx.userId,
        source: 'prova',
        points: POINTS.prova,
        evidenceType: 'quiz_version',
        evidenceId: PLAYBOOK_VERSION,
        createdBy: ctx.userId,
      });
    }
    return res.json({ success: true, data: saved.rows[0] });
  });

  router.get('/playbook/quiz/key', async (req, res) => {
    const ctx = await contextOrFail(pool, req, res);
    if (!ctx) return undefined;
    if (!canSeeAnswerKey({ seesAll: ctx.scope.seesAll, profile: ctx.profile })) {
      return fail(res, 403, 'O gabarito fica com o líder e com o RH.');
    }
    const { rows } = await pool.query(
      `SELECT q.slug, q.prompt, q.options, k.correct_index
         FROM iri_playbook_questions q
         JOIN iri_playbook_answer_keys k ON k.question_id = q.id
        WHERE q.organization_id = $1 AND q.version = $2
        ORDER BY q.sort_order`,
      [ctx.organizationId, PLAYBOOK_VERSION]
    );
    const data = rows.map((row) => ({
      slug: row.slug,
      prompt: row.prompt,
      answer: row.options[row.correct_index] || null,
    }));
    return res.json({ success: true, data });
  });

  router.get('/playbook/candidates', async (req, res) => {
    const ctx = await contextOrFail(pool, req, res);
    if (!ctx?.scope.seesAll) return fail(res, 403, 'Só o RH cadastra função.');
    const { rows } = await pool.query(
      `SELECT DISTINCT u.id, u.name, u.email
         FROM users u
         JOIN user_establishment_permissions uep ON uep.user_id = u.id AND uep.is_active = TRUE
         JOIN establishments e ON e.id = uep.establishment_id
        WHERE e.organization_id = $1
        ORDER BY u.name NULLS LAST
        LIMIT 500`,
      [ctx.organizationId]
    );
    return res.json({ success: true, data: rows });
  });

  router.get('/playbook/profiles', async (req, res) => {
    const ctx = await contextOrFail(pool, req, res);
    if (!ctx?.scope.seesAll) return fail(res, 403, 'Só o RH lista as fichas.');
    const { rows } = await pool.query(
      `SELECT p.user_id, p.establishment_id, p.role_key, p.sector_id,
              u.name AS user_name, u.email AS user_email, e.name AS establishment_name, s.name AS sector_name
         FROM iri_employee_profiles p
         JOIN users u ON u.id = p.user_id
         JOIN establishments e ON e.id = p.establishment_id
         LEFT JOIN iri_sectors s ON s.id = p.sector_id
        WHERE p.organization_id = $1
        ORDER BY u.name NULLS LAST`,
      [ctx.organizationId]
    );
    return res.json({ success: true, data: rows });
  });

  router.post('/playbook/profiles', async (req, res) => {
    const ctx = await contextOrFail(pool, req, res);
    if (!ctx?.scope.seesAll) return fail(res, 403, 'Só o RH cadastra função.');
    const role = findRole(req.body?.role_key);
    const targetUserId = Number(req.body?.user_id);
    const establishmentId = Number(req.body?.establishment_id);
    if (!role || !targetUserId || !establishmentId) {
      return fail(res, 400, 'Informe pessoa, unidade e função do manual.');
    }
    const house = await pool.query(
      `SELECT id FROM establishments WHERE id = $1 AND organization_id = $2`,
      [establishmentId, ctx.organizationId]
    );
    if (!house.rows[0]) return fail(res, 422, 'Unidade fora do Grupo Ideia.');
    const sector = await pool.query(
      `SELECT id FROM iri_sectors WHERE organization_id = $1 AND key = $2`,
      [ctx.organizationId, role.sector]
    );
    const saved = await pool.query(
      `INSERT INTO iri_employee_profiles
        (organization_id, user_id, establishment_id, sector_id, role_key)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (organization_id, user_id)
       DO UPDATE SET establishment_id = EXCLUDED.establishment_id,
                     sector_id = EXCLUDED.sector_id,
                     role_key = EXCLUDED.role_key,
                     updated_at = NOW()
       RETURNING user_id, establishment_id, role_key, sector_id`,
      [ctx.organizationId, targetUserId, establishmentId, sector.rows[0]?.id || null, role.key]
    );
    await writeAudit(pool, {
      organizationId: ctx.organizationId,
      establishmentId,
      entityType: 'employee_profile',
      entityId: targetUserId,
      action: 'assign_role',
      actorUserId: userIdOf(req),
      payload: { role_key: role.key },
    });
    return res.json({ success: true, data: saved.rows[0] });
  });

  return router;
};
