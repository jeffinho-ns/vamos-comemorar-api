'use strict';

const express = require('express');
const { applyCommonMiddleware } = require('./middleware');
const { PASSING_SCORE, PLAYBOOK_VERSION } = require('../../services/rhIdeia/playbookRoles');
const { canSeeTeamMember } = require('../../services/rhIdeia/playbookAccess');
const repo = require('../../services/rhIdeia/playbookRepository');

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
    console.error(`[iri] playbook attention organization_id=${req.iriOrganizationId}:`, err.message);
    fail(res, 500, 'Falha ao carregar as dicas do turno.');
    return null;
  }
}

function tip(id, title, body, href, label) {
  return { id, title, body, href, label };
}

const GENERAL_TIPS = [
  tip(
    'manual',
    'Manual da função',
    'Cada pessoa lê só o capítulo do próprio cargo. Na primeira visita, a leitura, o termo e a prova de 14 em 20 liberam o restante da área.',
    '/rh-ideia/manual',
    'Abrir o manual'
  ),
  tip(
    'justino360',
    'Operação e people ops',
    'O checklist, a foto e a ocorrência do turno ficam no Justino360. O padrão da função fica na área do colaborador.',
    '/justino360',
    'Abrir o Justino360'
  ),
  tip(
    'capacidade',
    'Capacidade da casa',
    'Camarote, área VIP e rooftop só seguem depois de conferir se ainda cabe gente naquele espaço.',
    '/admin/restaurant-reservations',
    'Ver reservas'
  ),
  tip(
    'ronda-geral',
    'Ronda do líder',
    'Uma passagem pela casa por dia, registrada na equipe, entra na pontuação do mês junto com a prova e o checklist confirmado por outra pessoa.',
    '/rh-ideia/equipe',
    'Minha equipe'
  ),
  tip(
    'whatsapp',
    'Atendimento no WhatsApp',
    'Uma pergunta por vez, em texto corrido. O cliente não recebe lista nem formulário.',
    '/admin/guia',
    'Guia interno'
  ),
];

function buildQuizTip(status) {
  if (status.sees_all) return null;
  if (!status.blocked && status.quiz_passed) return null;

  if (status.reason === 'sem_ficha') {
    return tip(
      'manual-bloqueado',
      'Seu manual ainda está aberto',
      'Sua ficha de cargo ainda não foi publicada. Peça ao RH para vincular casa, setor e função.',
      '/rh-ideia/manual',
      'Continuar o manual'
    );
  }

  if (status.quiz_passed === false) {
    const score = status.quiz_score;
    const body =
      score != null && Number(score) < PASSING_SCORE
        ? `Sua prova ficou em ${score}/20. É preciso acertar pelo menos ${PASSING_SCORE} para liberar o restante da área.`
        : `A prova do manual ainda não foi concluída. São 20 questões e a nota mínima é ${PASSING_SCORE}.`;
    return tip(
      'prova',
      'Prova do manual pendente',
      body,
      '/rh-ideia/manual/prova',
      'Fazer a prova'
    );
  }

  if (status.blocked) {
    return tip(
      'manual-bloqueado',
      'Seu manual ainda está aberto',
      'Falta concluir a leitura, o termo de confidencialidade ou a prova. O restante da área espera essa etapa.',
      '/rh-ideia/manual',
      'Continuar o manual'
    );
  }

  return null;
}

async function checklistAttentionTip(pool, ctx, leaderView) {
  const establishmentId = ctx.profile?.establishment_id || null;

  if (leaderView) {
    const params = [ctx.organizationId];
    let establishmentClause = '';
    if (establishmentId && !ctx.scope.seesAll) {
      params.push(establishmentId);
      establishmentClause = ` AND c.establishment_id = $${params.length}`;
    }
    const { rows } = await pool.query(
      `SELECT r.id, r.user_id, r.status, r.run_date, u.name AS user_name,
              p.role_key, p.establishment_id, s.key AS sector_key
         FROM iri_playbook_checklist_runs r
         JOIN iri_playbook_checklists c ON c.id = r.checklist_id
         JOIN iri_employee_profiles p
           ON p.user_id = r.user_id AND p.organization_id = c.organization_id
         JOIN users u ON u.id = r.user_id
         LEFT JOIN iri_sectors s ON s.id = p.sector_id
        WHERE c.organization_id = $1
          AND r.run_date = CURRENT_DATE
          AND r.status = 'entregue'
          ${establishmentClause}
        ORDER BY r.id
        LIMIT 50`,
      params
    );
    const pending = rows.filter((member) =>
      canSeeTeamMember({ seesAll: ctx.scope.seesAll, actor: ctx.profile, member })
    );
    if (pending.length === 0) return null;
    const names = pending
      .slice(0, 3)
      .map((row) => row.user_name)
      .filter(Boolean);
    const extra = pending.length > 3 ? ` e mais ${pending.length - 3}` : '';
    const who = names.length > 0 ? `${names.join(', ')}${extra}` : `${pending.length} pessoa(s)`;
    return tip(
      'checklist-equipe',
      'Checklist aguardando confirmação',
      `Há checklist do dia na fila sem confirmação: ${who}. Quem confere é o líder da área.`,
      '/rh-ideia/equipe',
      'Confirmar na equipe'
    );
  }

  if (!ctx.profile) return null;

  const checklist = await pool.query(
    `SELECT id FROM iri_playbook_checklists
      WHERE organization_id = $1 AND establishment_id = $2 AND role_key = $3 AND version = $4
      LIMIT 1`,
    [ctx.organizationId, ctx.profile.establishment_id, ctx.profile.role_key, PLAYBOOK_VERSION]
  );
  if (!checklist.rows[0]) return null;

  const run = await pool.query(
    `SELECT id, status FROM iri_playbook_checklist_runs
      WHERE checklist_id = $1 AND user_id = $2 AND run_date = CURRENT_DATE`,
    [checklist.rows[0].id, ctx.userId]
  );
  const today = run.rows[0] || null;
  if (today?.status === 'conferido') return null;

  const body = today
    ? 'Seu checklist de hoje já foi entregue, mas ainda falta a confirmação de outra pessoa.'
    : 'O checklist do dia ainda não foi confirmado por outra pessoa. Entregue o seu e peça a conferência do líder.';
  return tip(
    'checklist-proprio',
    'Checklist do dia pendente',
    body,
    '/rh-ideia',
    'Abrir o checklist'
  );
}

async function rondaAttentionTip(pool, ctx, isLeader) {
  if (!isLeader || !ctx.profile) return null;

  const { rows } = await pool.query(
    `SELECT id FROM iri_leader_events
      WHERE organization_id = $1
        AND establishment_id = $2
        AND leader_user_id = $3
        AND kind = 'ronda'
        AND event_date = CURRENT_DATE
      LIMIT 1`,
    [ctx.organizationId, ctx.profile.establishment_id, ctx.userId]
  );
  if (rows[0]) return null;

  return tip(
    'ronda',
    'Ronda do dia ainda não feita',
    'Registre uma passagem pela casa hoje. A ronda do líder entra na pontuação do mês.',
    '/rh-ideia/equipe',
    'Registrar ronda'
  );
}

module.exports = (pool) => {
  const router = express.Router({ mergeParams: true });
  applyCommonMiddleware(router, pool);

  router.get('/playbook/attention', async (req, res) => {
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

      const leaderView = Boolean(status.is_leader) || Boolean(ctx.scope.seesAll);
      const tips = [];

      const quizTip = buildQuizTip(status);
      if (quizTip) tips.push(quizTip);

      const checklistTip = await checklistAttentionTip(pool, ctx, leaderView);
      if (checklistTip) tips.push(checklistTip);

      const rondaTip = await rondaAttentionTip(pool, ctx, Boolean(status.is_leader));
      if (rondaTip) tips.push(rondaTip);

      const usedIds = new Set(tips.map((item) => item.id));
      for (const general of GENERAL_TIPS) {
        if (usedIds.has(general.id)) continue;
        if (general.id === 'ronda-geral' && tips.some((item) => item.id === 'ronda')) continue;
        if (general.id === 'manual' && tips.some((item) => item.id === 'prova' || item.id === 'manual-bloqueado')) {
          continue;
        }
        tips.push(general);
      }

      return res.json({
        success: true,
        data: { tips },
        message: null,
      });
    } catch (err) {
      console.error(
        `[iri] playbook attention organization_id=${ctx.organizationId} user_id=${ctx.userId}:`,
        err.message
      );
      return fail(res, 500, 'Falha ao montar as dicas do turno.');
    }
  });

  return router;
};
