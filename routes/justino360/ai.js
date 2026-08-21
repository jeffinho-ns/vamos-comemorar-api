'use strict';

/**
 * Justino360 IA — rascunhos de checklist/POP, resumo de ata e insights de
 * recorrência. Exclusivo do Seu Justino; o gate de estabelecimento e permissão
 * vem de `applyCommonMiddleware` + `requireManage`.
 *
 * Contrato de resposta (estável para a UI em todos os endpoints):
 *   sucesso: { success: true, data: {...}, meta: { model, ai_enabled, source, generated_at } }
 *   falha:   { success: false, code, message }
 *
 * Sem OPENAI_API_KEY: geração devolve 503 com code `ai_disabled` e a tela mostra
 * aviso amigável. `recurring-insights` continua respondendo com dado real
 * agregado (fallback determinístico) — não quebra.
 *
 * Isolamento: não importa nada de `services/agent/*` nem do `aiService` legado.
 */
const express = require('express');
const rateLimit = require('express-rate-limit');
const { applyCommonMiddleware, requireManage } = require('./middleware');
const { str } = require('../../validators/justino360Validator');
const {
  getModel,
  isEnabled,
  requestJson,
  AI_DISABLED,
} = require('../../services/justino360/aiClient');
const {
  normalizeChecklist,
  normalizePop,
  normalizeSummary,
  normalizeInsights,
  buildFallbackInsights,
} = require('../../services/justino360/aiNormalizer');
const {
  checklistSystemPrompt,
  popSystemPrompt,
  summarySystemPrompt,
  insightsSystemPrompt,
} = require('../../services/justino360/aiPrompts');

const MIN_INSTRUCTION = 8;
const MAX_INSTRUCTION = 4000;
const MIN_TEXT = 40;
const MAX_TEXT = 20000;

const SUMMARY_KINDS = ['ata', 'relatorio', 'laudo', 'ocorrencia', 'treinamento', 'outro'];

/**
 * Chamada de IA custa tempo e dinheiro: teto por IP bem abaixo do limite geral
 * da API. Mantém o envelope `{ success, message }` que a UI já entende.
 */
const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.JUSTINO360_AI_RATE_LIMIT || 12),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    code: 'rate_limited',
    message: 'Muitas gerações em sequência. Aguarde um minuto e tente de novo.',
  },
});

function meta(source) {
  return {
    model: getModel(),
    ai_enabled: isEnabled(),
    source,
    generated_at: new Date().toISOString(),
  };
}

function aiContext(req) {
  return {
    establishmentId: req.j360EstablishmentId,
    route: req.path,
    userId: req.user?.id || req.user?.userId || null,
  };
}

function failAi(res, result) {
  return res.status(result.status).json({
    success: false,
    code: result.code,
    message: result.message,
    ...(result.code === AI_DISABLED ? { ai_enabled: false } : {}),
  });
}

/** Instrução de geração: mesma validação para checklist e POP. */
function readInstruction(body) {
  const instruction = str(body?.instruction, MAX_INSTRUCTION);
  if (!instruction) {
    return { ok: false, message: 'Descreva o que a IA deve gerar.' };
  }
  if (instruction.length < MIN_INSTRUCTION) {
    return {
      ok: false,
      message: `Instrução muito curta (mínimo ${MIN_INSTRUCTION} caracteres).`,
    };
  }
  return { ok: true, value: instruction };
}

function oneOf(value, allowed, fallback) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();
  return allowed.includes(normalized) ? normalized : fallback;
}

module.exports = (pool) => {
  const router = express.Router({ mergeParams: true });
  applyCommonMiddleware(router, pool);

  /** Estado da IA para a UI decidir o que habilitar (não expõe a chave). */
  router.get('/ai/status', (req, res) => {
    return res.json({
      success: true,
      data: {
        ai_enabled: isEnabled(),
        model: getModel(),
        can_manage: Boolean(req.j360CanManage),
      },
      meta: meta('config'),
    });
  });

  router.post('/ai/generate-checklist', requireManage, aiLimiter, async (req, res) => {
    const instruction = readInstruction(req.body);
    if (!instruction.ok) {
      return res.status(400).json({ success: false, code: 'invalid_input', message: instruction.message });
    }
    const sector = str(req.body.sector || 'operação', 80);

    const result = await requestJson({
      system: checklistSystemPrompt(),
      user: `Setor: ${sector}\nPedido: ${instruction.value}`,
      maxOutputTokens: 2500,
      context: aiContext(req),
    });
    if (!result.ok) return failAi(res, result);

    const data = normalizeChecklist(result.data, { fallbackName: `Checklist ${sector}` });
    if (data.items.length === 0) {
      console.error(
        `[j360][ai] checklist sem itens establishment_id=${req.j360EstablishmentId} sector=${sector}`
      );
      return res.status(502).json({
        success: false,
        code: 'ai_empty_result',
        message: 'A IA não devolveu itens. Detalhe melhor o pedido e tente de novo.',
      });
    }
    return res.json({ success: true, data: { ...data, sector }, meta: meta('ai') });
  });

  router.post('/ai/generate-pop', requireManage, aiLimiter, async (req, res) => {
    const instruction = readInstruction(req.body);
    if (!instruction.ok) {
      return res.status(400).json({ success: false, code: 'invalid_input', message: instruction.message });
    }
    // Texto livre no prompt; a normalização devolve só role_key da whitelist.
    const roleHint = str(req.body.role_key || req.body.role_hint || '', 80);

    const result = await requestJson({
      system: popSystemPrompt(),
      user: `Função alvo: ${roleHint || 'equipe em geral'}\nPedido: ${instruction.value}`,
      maxOutputTokens: 3000,
      context: aiContext(req),
    });
    if (!result.ok) return failAi(res, result);

    const data = normalizePop(result.data, { roleHint });
    if (!data.body) {
      console.error(`[j360][ai] pop sem corpo establishment_id=${req.j360EstablishmentId}`);
      return res.status(502).json({
        success: false,
        code: 'ai_empty_result',
        message: 'A IA não devolveu o texto do POP. Tente novamente.',
      });
    }
    return res.json({ success: true, data, meta: meta('ai') });
  });

  router.post('/ai/summarize', requireManage, aiLimiter, async (req, res) => {
    const text = str(req.body.text || req.body.minutes || '', MAX_TEXT);
    if (!text) {
      return res.status(400).json({ success: false, code: 'invalid_input', message: 'Cole o texto a resumir.' });
    }
    if (text.length < MIN_TEXT) {
      return res.status(400).json({
        success: false,
        code: 'invalid_input',
        message: `Texto muito curto para resumir (mínimo ${MIN_TEXT} caracteres).`,
      });
    }
    const kind = oneOf(req.body.kind, SUMMARY_KINDS, 'ata');

    const result = await requestJson({
      system: summarySystemPrompt(),
      user: `Tipo: ${kind}\n\n${text}`,
      maxOutputTokens: 2500,
      context: aiContext(req),
    });
    if (!result.ok) return failAi(res, result);

    const data = normalizeSummary(result.data);
    if (!data.summary) {
      console.error(`[j360][ai] summarize sem resumo establishment_id=${req.j360EstablishmentId} kind=${kind}`);
      return res.status(502).json({
        success: false,
        code: 'ai_empty_result',
        message: 'A IA não devolveu um resumo. Tente novamente.',
      });
    }
    return res.json({ success: true, data: { ...data, kind }, meta: meta('ai') });
  });

  /**
   * Recorrência real de j360_incidents nos últimos N dias. Sem chave de IA a
   * resposta continua útil: números agregados + leitura determinística.
   */
  router.get('/ai/recurring-insights', requireManage, async (req, res) => {
    const days = Math.min(Math.max(Number(req.query.days) || 60, 7), 180);
    const minTimes = Math.min(Math.max(Number(req.query.min_times) || 2, 2), 10);

    let rows;
    try {
      const recurring = await pool.query(
        `SELECT i.title, i.category, s.name AS sector_name,
                COUNT(*)::int AS times,
                MAX(i.created_at) AS last_seen,
                COUNT(*) FILTER (WHERE i.status IN ('aberta','em_andamento','aguardando'))::int AS still_open
           FROM j360_incidents i
           LEFT JOIN j360_sectors s ON s.id = i.sector_id
          WHERE i.establishment_id = $1
            AND i.status <> 'cancelada'
            AND i.created_at >= NOW() - MAKE_INTERVAL(days => $2::int)
          GROUP BY i.title, i.category, s.name
         HAVING COUNT(*) >= $3
          ORDER BY times DESC, last_seen DESC
          LIMIT 15`,
        [req.j360EstablishmentId, days, minTimes]
      );
      rows = recurring.rows;
    } catch (err) {
      console.error(
        `[j360][ai] recurring query establishment_id=${req.j360EstablishmentId} days=${days}: ${err.message}`
      );
      return res.status(500).json({
        success: false,
        code: 'db_error',
        message: 'Falha ao carregar as ocorrências recorrentes.',
      });
    }

    const base = { items: rows, window_days: days, min_times: minTimes };

    if (rows.length === 0) {
      return res.json({
        success: true,
        data: {
          ...base,
          insights: [],
          suggested_actions: [],
          note: `Sem recorrências (${minTimes}x ou mais) nos últimos ${days} dias.`,
        },
        meta: meta('empty'),
      });
    }

    if (!isEnabled()) {
      return res.json({
        success: true,
        data: {
          ...base,
          ...buildFallbackInsights(rows),
          note: 'Análise estatística — IA generativa indisponível no servidor.',
        },
        meta: meta('fallback'),
      });
    }

    const result = await requestJson({
      system: insightsSystemPrompt(),
      user: JSON.stringify(rows),
      maxOutputTokens: 1800,
      context: aiContext(req),
    });
    if (!result.ok) {
      // Erro de IA não pode cegar o gestor: devolve o dado real com a leitura simples.
      return res.json({
        success: true,
        data: {
          ...base,
          ...buildFallbackInsights(rows),
          note: `${result.message} Mostrando a leitura estatística.`,
        },
        meta: meta('fallback'),
      });
    }

    return res.json({
      success: true,
      data: { ...base, ...normalizeInsights(result.data) },
      meta: meta('ai'),
    });
  });

  return router;
};
