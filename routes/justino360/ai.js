'use strict';

/**
 * Justino360 IA — rascunhos de checklist/POP e resumos.
 * Modelo homologado: gpt-5.5
 */
const express = require('express');
const OpenAI = require('openai');
const { applyCommonMiddleware, requireManage } = require('./middleware');
const { str, optionalStr } = require('../../validators/justino360Validator');

const MODEL = process.env.JUSTINO360_AI_MODEL || 'gpt-5.5';

function getClient() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  return new OpenAI({ apiKey: key });
}

async function chatJson(system, user) {
  const client = getClient();
  if (!client) {
    return { ok: false, message: 'OPENAI_API_KEY não configurada.' };
  }
  const completion = await client.chat.completions.create({
    model: MODEL,
    temperature: 0.3,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  });
  const raw = completion.choices?.[0]?.message?.content || '{}';
  try {
    return { ok: true, data: JSON.parse(raw) };
  } catch {
    return { ok: true, data: { raw } };
  }
}

module.exports = (pool) => {
  const router = express.Router({ mergeParams: true });
  applyCommonMiddleware(router, pool);

  router.post('/ai/generate-checklist', requireManage, async (req, res) => {
    const instruction = str(req.body.instruction, 4000);
    const sector = str(req.body.sector || 'operação', 80);
    if (!instruction) {
      return res.status(400).json({ success: false, message: 'Instrução obrigatória.' });
    }
    try {
      const result = await chatJson(
        `Você é assistente operacional do restaurante Seu Justino (São Paulo).
Gere um checklist prático em JSON: {"name":"...","shift_type":"abertura|fechamento|rotina|inspecao","items":[{"title":"...","requires_photo":false}]}.
Itens curtos, em português, alinhados a bar/restaurante. Não invente setores que não existam.
Responda só JSON.`,
        `Setor: ${sector}\nPedido: ${instruction}`
      );
      if (!result.ok) return res.status(503).json({ success: false, message: result.message });
      return res.json({ success: true, data: result.data, model: MODEL });
    } catch (err) {
      console.error('[j360] ai checklist:', err.message);
      return res.status(500).json({ success: false, message: 'Falha ao gerar checklist.' });
    }
  });

  router.post('/ai/generate-pop', requireManage, async (req, res) => {
    const instruction = str(req.body.instruction, 4000);
    const roleKey = str(req.body.role_key || 'equipe', 80);
    if (!instruction) {
      return res.status(400).json({ success: false, message: 'Instrução obrigatória.' });
    }
    try {
      const result = await chatJson(
        `Você escreve POPs (Procedimentos Operacionais Padrão) para o Seu Justino.
Retorne JSON: {"title":"...","role_key":"...","body":"texto do POP em prosa clara"}.
Tom humano e objetivo. Português do Brasil. Só JSON.`,
        `Função: ${roleKey}\nPedido: ${instruction}`
      );
      if (!result.ok) return res.status(503).json({ success: false, message: result.message });
      return res.json({ success: true, data: result.data, model: MODEL });
    } catch (err) {
      console.error('[j360] ai pop:', err.message);
      return res.status(500).json({ success: false, message: 'Falha ao gerar POP.' });
    }
  });

  router.post('/ai/summarize', requireManage, async (req, res) => {
    const text = str(req.body.text || req.body.minutes || '', 20000);
    const kind = str(req.body.kind || 'ata', 40);
    if (!text) return res.status(400).json({ success: false, message: 'Texto obrigatório.' });
    try {
      const result = await chatJson(
        `Resuma conteúdo operacional do Seu Justino.
JSON: {"summary":"...","action_items":[{"decision":"...","suggested_task":"..."}]}.
Só JSON.`,
        `Tipo: ${kind}\n\n${text}`
      );
      if (!result.ok) return res.status(503).json({ success: false, message: result.message });
      return res.json({ success: true, data: result.data, model: MODEL });
    } catch (err) {
      console.error('[j360] ai summarize:', err.message);
      return res.status(500).json({ success: false, message: 'Falha ao resumir.' });
    }
  });

  router.get('/ai/recurring-insights', requireManage, async (req, res) => {
    try {
      const recurring = await pool.query(
        `SELECT title, category, COUNT(*)::int AS times,
                MAX(created_at) AS last_seen
           FROM j360_incidents
          WHERE establishment_id = $1
            AND created_at >= NOW() - INTERVAL '60 days'
          GROUP BY title, category
         HAVING COUNT(*) >= 2
          ORDER BY times DESC
          LIMIT 15`,
        [req.j360EstablishmentId]
      );
      if (recurring.rows.length === 0) {
        return res.json({
          success: true,
          data: { insights: [], items: [], note: 'Sem recorrências suficientes nos últimos 60 dias.' },
        });
      }
      const client = getClient();
      if (!client) {
        return res.json({
          success: true,
          data: {
            items: recurring.rows,
            insights: recurring.rows.map(
              (r) => `"${r.title}" apareceu ${r.times}x — investigar causa raiz.`
            ),
          },
        });
      }
      const result = await chatJson(
        `Analista de operação do Seu Justino. Dado problemas recorrentes, sugira ações.
JSON: {"insights":["..."],"suggested_actions":[{"title":"...","why":"..."}]}`,
        JSON.stringify(recurring.rows)
      );
      return res.json({
        success: true,
        data: {
          items: recurring.rows,
          ...(result.ok ? result.data : { insights: [] }),
        },
        model: MODEL,
      });
    } catch (err) {
      console.error('[j360] ai recurring:', err.message);
      return res.status(500).json({ success: false, message: 'Falha ao analisar recorrência.' });
    }
  });

  void optionalStr;
  return router;
};
