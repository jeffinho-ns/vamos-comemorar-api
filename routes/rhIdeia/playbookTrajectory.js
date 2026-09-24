'use strict';

const express = require('express');
const { applyCommonMiddleware } = require('./middleware');
const { findRole, PASSING_SCORE, PLAYBOOK_VERSION } = require('../../services/rhIdeia/playbookRoles');
const { canSeeTeamMember } = require('../../services/rhIdeia/playbookAccess');
const repo = require('../../services/rhIdeia/playbookRepository');

function fail(res, status, message) {
  return res.status(status).json({ success: false, data: null, message });
}

const SOURCE_LABEL = {
  prova: 'Prova',
  checklist: 'Checklist',
  checklist_lider: 'Checklist conferido',
  avaliacao: 'Avaliação',
  padrinho: 'Padrinho',
  treino: 'Treino',
  ronda: 'Ronda',
  abertura: 'Abertura',
  fechamento: 'Fechamento',
};

module.exports = (pool) => {
  const router = express.Router({ mergeParams: true });
  applyCommonMiddleware(router, pool);

  router.get('/playbook/trajectory/:userId', async (req, res) => {
    const userId = Number(req.params.userId);
    if (!Number.isFinite(userId) || userId <= 0) return fail(res, 400, 'Pessoa inválida.');

    let ctx;
    try {
      ctx = await repo.loadContext(pool, req);
    } catch (err) {
      console.error(`[iri] trajectory organization_id=${req.iriOrganizationId}:`, err.message);
      return fail(res, 500, 'Falha ao abrir a trajetória.');
    }

    try {
      const person = await pool.query(
        `SELECT p.user_id, u.name AS user_name, p.role_key, p.establishment_id,
                e.name AS establishment_name, s.key AS sector_key, s.name AS sector_name,
                (SELECT COUNT(*)::int FROM iri_playbook_chapters c
                  WHERE c.organization_id = p.organization_id
                    AND c.establishment_id = p.establishment_id
                    AND c.is_current = TRUE AND c.version = $3
                    AND (c.audience = 'common' OR (c.audience = 'role' AND p.role_key = ANY(c.visible_roles)))
                ) AS chapters_required,
                (SELECT COUNT(*)::int FROM iri_playbook_reads r
                  JOIN iri_playbook_chapters c ON c.id = r.chapter_id
                  WHERE r.user_id = p.user_id AND r.version = $3 AND c.is_current = TRUE
                    AND c.establishment_id = p.establishment_id
                    AND (c.audience = 'common' OR (c.audience = 'role' AND p.role_key = ANY(c.visible_roles)))
                ) AS chapters_read,
                EXISTS (
                  SELECT 1 FROM iri_playbook_terms t
                   WHERE t.user_id = p.user_id AND t.version = $3
                ) AS term_accepted,
                (SELECT MAX(a.score) FROM iri_playbook_attempts a
                  WHERE a.user_id = p.user_id AND a.version = $3) AS quiz_score,
                EXISTS (
                  SELECT 1 FROM iri_playbook_attempts a
                   WHERE a.user_id = p.user_id AND a.version = $3 AND a.passed = TRUE
                ) AS quiz_passed
           FROM iri_employee_profiles p
           JOIN users u ON u.id = p.user_id
           JOIN establishments e ON e.id = p.establishment_id
           LEFT JOIN iri_sectors s ON s.id = p.sector_id
          WHERE p.organization_id = $1 AND p.user_id = $2`,
        [ctx.organizationId, userId, PLAYBOOK_VERSION]
      );
      const row = person.rows[0];
      if (!row) return fail(res, 404, 'Pessoa não encontrada nesta organização.');

      const self = Number(ctx.userId) === userId;
      const allowed =
        self ||
        canSeeTeamMember({ seesAll: ctx.scope.seesAll, actor: ctx.profile, member: row });
      if (!allowed) return fail(res, 404, 'Pessoa não encontrada nesta organização.');

      const points = await pool.query(
        `SELECT source, SUM(points)::int AS points, COUNT(*)::int AS times,
                to_char(created_at AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM') AS year_month
           FROM iri_point_ledger
          WHERE organization_id = $1 AND user_id = $2
          GROUP BY source, year_month
          ORDER BY year_month DESC, source`,
        [ctx.organizationId, userId]
      );

      let marks = [];
      try {
        const ops = await pool.query(
          `SELECT r.run_date, t.shift_type, sec.name AS sector_name
             FROM j360_checklist_runs r
             JOIN j360_checklist_templates t ON t.id = r.template_id
             LEFT JOIN j360_sectors sec ON sec.id = COALESCE(r.sector_id, t.sector_id)
            WHERE COALESCE(r.completed_by, r.started_by) = $1
              AND r.establishment_id = $2
              AND r.status = 'concluido'
              AND t.shift_type IN ('abertura', 'fechamento')
              AND r.run_date >= (CURRENT_DATE - INTERVAL '120 days')
            ORDER BY r.run_date DESC
            LIMIT 80`,
          [userId, row.establishment_id]
        );
        marks = ops.rows.map((item) => ({
          date: String(item.run_date).slice(0, 10),
          label: `${item.shift_type === 'fechamento' ? 'Fechou' : 'Abriu'} ${item.sector_name || 'setor'}`,
        }));
      } catch (err) {
        if (err.code !== '42P01') throw err;
      }

      const quizScore = row.quiz_score == null ? null : Number(row.quiz_score);
      return res.json({
        success: true,
        data: {
          user_id: row.user_id,
          name: row.user_name,
          role_label: findRole(row.role_key)?.label || row.role_key,
          establishment_name: row.establishment_name,
          sector_name: row.sector_name,
          chapters_read: row.chapters_read,
          chapters_required: row.chapters_required,
          term_accepted: Boolean(row.term_accepted),
          quiz_score: quizScore,
          quiz_passed: Boolean(row.quiz_passed) || (quizScore != null && quizScore >= PASSING_SCORE),
          points: points.rows.map((item) => ({
            year_month: item.year_month,
            source: item.source,
            source_label: SOURCE_LABEL[item.source] || item.source,
            points: item.points,
            times: item.times,
          })),
          marks,
        },
        message: null,
      });
    } catch (err) {
      console.error(`[iri] trajectory user_id=${userId}:`, err.message);
      return fail(res, 500, 'Falha ao montar a trajetória.');
    }
  });

  router.post('/playbook/rewards/grant', async (req, res) => {
    let ctx;
    try {
      ctx = await repo.loadContext(pool, req);
    } catch (err) {
      console.error('[iri] reward grant:', err.message);
      return fail(res, 500, 'Falha ao registrar a bonificação.');
    }
    if (!ctx.scope.seesAll) return fail(res, 403, 'A bonificação é do RH.');

    const establishmentId = Number(req.body?.establishment_id);
    const userId = Number(req.body?.user_id);
    const yearMonth = String(req.body?.year_month || '');
    const status = String(req.body?.status || '');
    if (!/^\d{4}-\d{2}$/.test(yearMonth)) return fail(res, 400, 'Informe o mês.');
    if (!['concedido', 'nao_desta_vez'].includes(status)) return fail(res, 400, 'Decisão inválida.');
    if (!establishmentId || !userId) return fail(res, 400, 'Informe a casa e a pessoa.');

    try {
      const saved = await pool.query(
        `INSERT INTO iri_reward_grants
          (organization_id, establishment_id, year_month, user_id, status, note, decided_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (organization_id, establishment_id, year_month, user_id)
         DO UPDATE SET status = EXCLUDED.status, note = EXCLUDED.note,
                       decided_by = EXCLUDED.decided_by, decided_at = NOW()
         RETURNING user_id, year_month, status, note, decided_at`,
        [
          ctx.organizationId,
          establishmentId,
          yearMonth,
          userId,
          status,
          req.body?.note || null,
          ctx.userId,
        ]
      );
      return res.json({ success: true, data: saved.rows[0], message: null });
    } catch (err) {
      if (err.code === '42P01') {
        return fail(res, 503, 'Rode a migration das bonificações.');
      }
      console.error(`[iri] reward grant organization_id=${ctx.organizationId}:`, err.message);
      return fail(res, 500, 'Falha ao registrar a bonificação.');
    }
  });

  return router;
};
