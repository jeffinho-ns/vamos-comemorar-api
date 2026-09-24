'use strict';

const express = require('express');
const { applyCommonMiddleware, writeAudit } = require('./middleware');
const { EVAL_CRITERIA, isLeaderRole } = require('../../services/rhIdeia/playbookRoles');
const { canSeeTeamMember } = require('../../services/rhIdeia/playbookAccess');
const { POINTS, awardOnce } = require('../../services/rhIdeia/playbookPoints');
const { awardOperationalMonth } = require('../../services/rhIdeia/opsWeek');
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
    console.error('[iri] playbook score:', err.message);
    fail(res, 500, 'Falha ao carregar a pontuação.');
    return null;
  }
}

function parseScores(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const scores = {};
  for (const key of EVAL_CRITERIA) {
    const value = Number(raw[key]);
    if (!Number.isInteger(value) || value < 1 || value > 5) return null;
    scores[key] = value;
  }
  return scores;
}

function monthRange(yearMonth) {
  if (!/^\d{4}-\d{2}$/.test(yearMonth || '')) return null;
  const [year, month] = yearMonth.split('-').map(Number);
  const end = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
  return { start: `${yearMonth}-01`, end };
}

module.exports = (pool) => {
  const router = express.Router({ mergeParams: true });
  applyCommonMiddleware(router, pool);

  router.post('/playbook/evaluations', async (req, res) => {
    const ctx = await contextOrFail(pool, req, res);
    if (!ctx) return undefined;
    const office = ctx.scope.seesAll;
    const leader = Boolean(ctx.profile && isLeaderRole(ctx.profile.role_key));
    if (!office && !leader) {
      return fail(res, 403, 'Quem avalia é o líder da área ou o RH.');
    }
    const subjectUserId = Number(req.body?.subject_user_id);
    const scores = parseScores(req.body?.scores);
    if (!subjectUserId || !scores) return fail(res, 400, 'Informe a pessoa e as 12 notas de 1 a 5.');
    if (subjectUserId === ctx.userId) return fail(res, 422, 'A avaliação não é autoavaliação.');
    const subject = await repo.loadProfile(pool, ctx.organizationId, subjectUserId);
    const inTeam = subject && canSeeTeamMember({ seesAll: office, actor: ctx.profile, member: subject });
    if (!subject || !inTeam) {
      return fail(res, 403, 'Essa pessoa não está na sua equipe.');
    }
    const saved = await pool.query(
      `INSERT INTO iri_evaluations
        (organization_id, establishment_id, subject_user_id, leader_user_id, period_start, period_end, scores, strengths, improve)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)
       RETURNING id`,
      [
        ctx.organizationId,
        subject.establishment_id,
        subjectUserId,
        ctx.userId,
        req.body?.period_start || null,
        req.body?.period_end || null,
        JSON.stringify(scores),
        req.body?.strengths || null,
        req.body?.improve || null,
      ]
    );
    await awardOnce(pool, {
      organizationId: ctx.organizationId,
      establishmentId: subject.establishment_id,
      userId: ctx.userId,
      source: 'avaliacao',
      points: POINTS.avaliacao,
      evidenceType: 'evaluation',
      evidenceId: saved.rows[0].id,
      createdBy: ctx.userId,
    });
    return res.json({ success: true, data: { id: saved.rows[0].id } });
  });

  router.get('/playbook/evaluations', async (req, res) => {
    const ctx = await contextOrFail(pool, req, res);
    if (!ctx) return undefined;
    const { rows } = await pool.query(
      `SELECT ev.id, ev.subject_user_id, ev.leader_user_id, ev.period_start, ev.period_end,
              ev.scores, ev.strengths, ev.improve, ev.created_at,
              su.name AS subject_name, p.establishment_id, p.role_key, s.key AS sector_key
         FROM iri_evaluations ev
         JOIN users su ON su.id = ev.subject_user_id
         JOIN iri_employee_profiles p
           ON p.user_id = ev.subject_user_id AND p.organization_id = ev.organization_id
         LEFT JOIN iri_sectors s ON s.id = p.sector_id
        WHERE ev.organization_id = $1
        ORDER BY ev.created_at DESC
        LIMIT 200`,
      [ctx.organizationId]
    );
    const data = rows.filter((row) => {
      if (row.subject_user_id === ctx.userId) return true;
      return canSeeTeamMember({ seesAll: ctx.scope.seesAll, actor: ctx.profile, member: row });
    });
    return res.json({ success: true, data });
  });

  router.post('/playbook/events', async (req, res) => {
    const ctx = await contextOrFail(pool, req, res);
    if (!ctx) return undefined;
    if (!ctx.profile || !isLeaderRole(ctx.profile.role_key)) {
      return fail(res, 403, 'Treino, ronda e padrinho são do líder.');
    }
    const kind = String(req.body?.kind || '');
    if (!['padrinho', 'treino', 'ronda'].includes(kind)) return fail(res, 400, 'Tipo de registro inválido.');
    const subjectUserId = Number(req.body?.subject_user_id) || null;
    if (kind === 'padrinho') {
      const subject = subjectUserId ? await repo.loadProfile(pool, ctx.organizationId, subjectUserId) : null;
      if (!subject || !canSeeTeamMember({ seesAll: false, actor: ctx.profile, member: subject })) {
        return fail(res, 403, 'O padrinho é um colega do seu setor.');
      }
      const dup = await pool.query(
        `SELECT id FROM iri_leader_events
          WHERE organization_id = $1 AND kind = 'padrinho' AND subject_user_id = $2`,
        [ctx.organizationId, subjectUserId]
      );
      if (dup.rows[0]) return fail(res, 409, 'Essa pessoa já tem padrinho registrado.');
    } else {
      const dup = await pool.query(
        `SELECT id FROM iri_leader_events
          WHERE leader_user_id = $1 AND kind = $2 AND event_date = CURRENT_DATE`,
        [ctx.userId, kind]
      );
      if (dup.rows[0]) return fail(res, 409, 'Esse registro já foi feito hoje.');
    }
    const saved = await pool.query(
      `INSERT INTO iri_leader_events
        (organization_id, establishment_id, leader_user_id, kind, subject_user_id, note)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [ctx.organizationId, ctx.profile.establishment_id, ctx.userId, kind, subjectUserId, req.body?.note || null]
    );
    const pointsUser = kind === 'padrinho' ? subjectUserId : ctx.userId;
    await awardOnce(pool, {
      organizationId: ctx.organizationId,
      establishmentId: ctx.profile.establishment_id,
      userId: pointsUser,
      source: kind,
      points: POINTS[kind],
      evidenceType: 'leader_event',
      evidenceId: saved.rows[0].id,
      createdBy: ctx.userId,
    });
    await writeAudit(pool, {
      organizationId: ctx.organizationId,
      establishmentId: ctx.profile.establishment_id,
      entityType: 'leader_event',
      entityId: saved.rows[0].id,
      action: kind,
      actorUserId: ctx.userId,
    });
    return res.json({ success: true, data: { id: saved.rows[0].id } });
  });

  router.get('/playbook/points', async (req, res) => {
    const ctx = await contextOrFail(pool, req, res);
    if (!ctx) return undefined;
    const { rows } = await pool.query(
      `SELECT l.id, l.user_id, u.name AS user_name, l.source, l.points, l.note, l.created_at,
              p.establishment_id, p.role_key, s.key AS sector_key
         FROM iri_point_ledger l
         JOIN users u ON u.id = l.user_id
         LEFT JOIN iri_employee_profiles p
           ON p.user_id = l.user_id AND p.organization_id = l.organization_id
         LEFT JOIN iri_sectors s ON s.id = p.sector_id
        WHERE l.organization_id = $1
        ORDER BY l.created_at DESC
        LIMIT 300`,
      [ctx.organizationId]
    );
    const data = rows.filter((row) => {
      if (row.user_id === ctx.userId) return true;
      if (!row.role_key) return ctx.scope.seesAll;
      return canSeeTeamMember({ seesAll: ctx.scope.seesAll, actor: ctx.profile, member: row });
    });
    return res.json({ success: true, data });
  });

  router.post('/playbook/rewards/close', async (req, res) => {
    const ctx = await contextOrFail(pool, req, res);
    if (!ctx) return undefined;
    if (!ctx.scope.seesAll) return fail(res, 403, 'O fechamento da premiação é do RH.');
    const yearMonth = String(req.body?.year_month || '');
    const range = monthRange(yearMonth);
    const establishmentId = Number(req.body?.establishment_id);
    if (!range || !establishmentId) return fail(res, 400, 'Informe o mês e a unidade.');

    let operacao = { aberturas: 0, fechamentos: 0, pontos_novos: 0 };
    try {
      operacao = await awardOperationalMonth(pool, {
        organizationId: ctx.organizationId,
        establishmentId,
        start: range.start,
        end: range.end,
        createdBy: ctx.userId,
      });
    } catch (err) {
      if (err.code !== '42P01') {
        console.error(
          `[iri] rewards close organization_id=${ctx.organizationId} establishment_id=${establishmentId}:`,
          err.message
        );
        return fail(res, 500, 'Falha ao lançar os pontos de abertura e fechamento.');
      }
    }

    const ranking = await pool.query(
      `SELECT l.user_id, u.name AS user_name, p.role_key, COALESCE(SUM(l.points), 0)::int AS points
         FROM iri_point_ledger l
         JOIN users u ON u.id = l.user_id
         JOIN iri_employee_profiles p
           ON p.user_id = l.user_id AND p.organization_id = l.organization_id
        WHERE l.organization_id = $1
          AND l.establishment_id = $2
          AND l.created_at >= $3::date
          AND l.created_at < $4::date
          AND p.role_key IN ('gerente', 'chefe_fila', 'chefe_cozinha', 'chefe_bar')
        GROUP BY l.user_id, u.name, p.role_key
        ORDER BY points DESC, u.name`,
      [ctx.organizationId, establishmentId, range.start, range.end]
    );
    const saved = await pool.query(
      `INSERT INTO iri_reward_closes
        (organization_id, establishment_id, year_month, closed_by, note, snapshot)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)
       ON CONFLICT (organization_id, establishment_id, year_month)
       DO UPDATE SET closed_by = EXCLUDED.closed_by, note = EXCLUDED.note,
                     snapshot = EXCLUDED.snapshot, closed_at = NOW()
       RETURNING id, year_month, snapshot, note, closed_at`,
      [
        ctx.organizationId,
        establishmentId,
        yearMonth,
        ctx.userId,
        req.body?.note || null,
        JSON.stringify({ ranking: ranking.rows, operacao }),
      ]
    );
    return res.json({ success: true, data: saved.rows[0] });
  });

  router.get('/playbook/rewards', async (req, res) => {
    const ctx = await contextOrFail(pool, req, res);
    if (!ctx) return undefined;
    if (!ctx.scope.seesAll) return fail(res, 403, 'O histórico de premiação é do RH.');
    const { rows } = await pool.query(
      `SELECT id, establishment_id, year_month, note, snapshot, closed_at
         FROM iri_reward_closes
        WHERE organization_id = $1
        ORDER BY year_month DESC
        LIMIT 24`,
      [ctx.organizationId]
    );
    return res.json({ success: true, data: rows });
  });

  return router;
};
