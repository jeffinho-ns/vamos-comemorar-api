'use strict';

/**
 * Resumo de fim de expediente — visão do líder (casa ou setor).
 * Mount: GET /api/rh-ideia/playbook/shift-summary
 */
const express = require('express');
const { applyCommonMiddleware } = require('./middleware');
const {
  PLAYBOOK_VERSION,
  PASSING_SCORE,
  findRole,
  isLeaderRole,
} = require('../../services/rhIdeia/playbookRoles');
const { canSeeTeamMember } = require('../../services/rhIdeia/playbookAccess');
const repo = require('../../services/rhIdeia/playbookRepository');

const PENDING_LIMIT = 12;
const TZ = 'America/Sao_Paulo';

function fail(res, status, message) {
  return res.status(status).json({ success: false, data: null, message });
}

async function contextOrFail(pool, req, res) {
  try {
    return await repo.loadContext(pool, req);
  } catch (err) {
    if (err.code === '42P01') {
      fail(res, 503, 'Manual ainda não migrado. Rode a migration do playbook.');
      return null;
    }
    console.error('[iri] playbook shift:', err.message);
    fail(res, 500, 'Falha ao carregar o resumo do expediente.');
    return null;
  }
}

function todaySaoPaulo() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
}

function roleLabel(roleKey) {
  return findRole(roleKey)?.label || String(roleKey || '');
}

function isManualComplete(row) {
  const chaptersOk =
    Number(row.chapters_required || 0) === 0 ||
    Number(row.chapters_read || 0) >= Number(row.chapters_required || 0);
  const termOk = Boolean(row.term_accepted);
  const quizOk =
    Boolean(row.quiz_passed) ||
    (row.quiz_score != null && Number(row.quiz_score) >= PASSING_SCORE);
  return chaptersOk && termOk && quizOk;
}

/**
 * Contagem Justino360 com tolerância a tabela ausente (42P01).
 * Retorna undefined se a tabela não existir.
 */
async function safeCount(pool, sql, params) {
  try {
    const { rows } = await pool.query(sql, params);
    return Number(rows[0]?.c || 0);
  } catch (err) {
    if (err.code === '42P01') return undefined;
    throw err;
  }
}

async function loadJustino360Counts(pool, { establishmentId, sectorKey }) {
  const today = todaySaoPaulo();
  const params = [establishmentId, today];
  let sectorJoin = '';
  let sectorFilter = '';

  if (sectorKey) {
    params.push(sectorKey);
    sectorJoin = `LEFT JOIN j360_sectors s ON s.id = t.sector_id AND s.establishment_id = t.establishment_id`;
    sectorFilter = ` AND s.key = $3`;
  }

  const checklists = await safeCount(
    pool,
    `SELECT COUNT(*)::int AS c
       FROM j360_checklist_runs t
       ${sectorJoin}
      WHERE t.establishment_id = $1
        AND t.run_date = $2::date
        AND t.status = 'concluido'
        ${sectorFilter}`,
    params
  );

  const tarefas = await safeCount(
    pool,
    `SELECT COUNT(*)::int AS c
       FROM j360_tasks t
       ${sectorJoin}
      WHERE t.establishment_id = $1
        AND t.status IN ('concluida', 'validada')
        AND t.completed_at IS NOT NULL
        AND (t.completed_at AT TIME ZONE 'America/Sao_Paulo')::date = $2::date
        ${sectorFilter}`,
    params
  );

  const ocorrenciasAbertas = await safeCount(
    pool,
    sectorKey
      ? `SELECT COUNT(*)::int AS c
           FROM j360_incidents t
           LEFT JOIN j360_sectors s ON s.id = t.sector_id AND s.establishment_id = t.establishment_id
          WHERE t.establishment_id = $1
            AND t.status IN ('aberta', 'em_andamento', 'aguardando')
            AND s.key = $2`
      : `SELECT COUNT(*)::int AS c
           FROM j360_incidents t
          WHERE t.establishment_id = $1
            AND t.status IN ('aberta', 'em_andamento', 'aguardando')`,
    sectorKey ? [establishmentId, sectorKey] : [establishmentId]
  );

  const justino360 = {};
  if (checklists !== undefined) justino360.checklists_concluidos = checklists;
  if (tarefas !== undefined) justino360.tarefas_concluidas = tarefas;
  if (ocorrenciasAbertas !== undefined) justino360.ocorrencias_abertas = ocorrenciasAbertas;
  return justino360;
}

module.exports = (pool) => {
  const router = express.Router({ mergeParams: true });
  applyCommonMiddleware(router, pool);

  router.get('/playbook/shift-summary', async (req, res) => {
    const ctx = await contextOrFail(pool, req, res);
    if (!ctx) return undefined;

    const leader = ctx.scope.seesAll || (ctx.profile && isLeaderRole(ctx.profile.role_key));
    if (!leader) {
      return fail(res, 403, 'Resumo do expediente é do líder e do RH.');
    }

    let establishmentId = null;
    let sectorKey = null;
    let sectorName = null;
    let establishmentName = null;

    if (ctx.scope.seesAll) {
      establishmentId =
        req.iriEstablishmentFilter ||
        Number(req.query.establishment_id) ||
        null;
      if (!establishmentId || !Number.isFinite(establishmentId)) {
        return fail(res, 422, 'Informe establishment_id para o resumo da casa.');
      }
      establishmentId = Number(establishmentId);
    } else {
      if (!ctx.profile?.establishment_id) {
        return fail(res, 422, 'Sua função ainda não foi cadastrada pelo RH.');
      }
      establishmentId = Number(ctx.profile.establishment_id);
      if (ctx.profile.role_key !== 'gerente') {
        sectorKey = ctx.profile.sector_key || null;
        sectorName = ctx.profile.sector_name || null;
      }
    }

    try {
      const estRow = await pool.query(
        `SELECT id, name FROM establishments WHERE id = $1 AND organization_id = $2`,
        [establishmentId, ctx.organizationId]
      );
      if (!estRow.rows[0]) {
        return fail(res, 404, 'Casa não encontrada nesta organização.');
      }
      establishmentName = estRow.rows[0].name;

      const { rows } = await pool.query(
        `SELECT p.user_id, u.name AS user_name, p.role_key, p.establishment_id, e.name AS establishment_name,
                s.key AS sector_key, s.name AS sector_name,
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
                ) AS quiz_passed
           FROM iri_employee_profiles p
           JOIN users u ON u.id = p.user_id
           JOIN establishments e ON e.id = p.establishment_id
           LEFT JOIN iri_sectors s ON s.id = p.sector_id
          WHERE p.organization_id = $1
            AND p.establishment_id = $3`,
        [ctx.organizationId, PLAYBOOK_VERSION, establishmentId]
      );

      const visible = rows.filter((member) =>
        canSeeTeamMember({ seesAll: ctx.scope.seesAll, actor: ctx.profile, member })
      );

      const pendingAll = visible
        .filter((row) => !isManualComplete(row))
        .map((row) => ({
          user_id: row.user_id,
          name: row.user_name || '',
          role_label: roleLabel(row.role_key),
        }));

      const justino360 = await loadJustino360Counts(pool, {
        establishmentId,
        sectorKey,
      });

      return res.json({
        success: true,
        data: {
          establishment_name: establishmentName,
          sector_name: sectorName,
          justino360,
          manual_pendente: pendingAll.slice(0, PENDING_LIMIT),
          manual_pendente_total: pendingAll.length,
          fechado_em: todaySaoPaulo(),
        },
        message: null,
      });
    } catch (err) {
      console.error(
        `[iri] shift-summary organization_id=${ctx.organizationId} establishment_id=${establishmentId}:`,
        err.message
      );
      return fail(res, 500, 'Falha ao montar o resumo do expediente.');
    }
  });

  return router;
};
