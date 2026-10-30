'use strict';

const express = require('express');
const { canReadBiJustino } = require('../../services/biJustino/access');
const { gravarNaPlanilha } = require('../../services/biJustino/espelho/escrita');
const { ESCRITAS, chavesDe } = require('../../services/biJustino/operacao/escritas');
const { podeAprovarBiJustino } = require('../../services/biJustino/sistema/aprovacao');
const { lerSobDemanda } = require('../../services/biJustino/sistema/sobDemanda');
const { obterPdf, infoPdf } = require('../../services/biJustino/sistema/pdfPlanilha');
const { deArquivo, middleware: uploadMiddleware, erroMulter } = require('../../services/biJustino/sistema/uploadBase64');

const LOG = '[bi-justino]';
const ESTAB = 'Seu Justino';

function logErro(mensagem, extra) {
  console.error(`${LOG} ${mensagem}`, { establishment: ESTAB, ...(extra || {}) });
}

/**
 * Rotas da área Gerente Operador / Eventos / Reservas / Auditoria Operacional / Histórico /
 * Documentações / Manual / Contatos do BI Seu Justino. Montadas em /api/bi (autenticação no router pai).
 */
module.exports = (pool) => {
  const router = express.Router();

  async function acesso(req, res, precisaAprovar) {
    const allowed = await canReadBiJustino(pool, req.user);
    if (!allowed) {
      res.status(403).json({ ok: false, error: 'acesso_negado' });
      return false;
    }
    if (precisaAprovar) {
      const aprova = await podeAprovarBiJustino(pool, req.user);
      if (!aprova) {
        res.status(403).json({ ok: false, error: 'somente_diretoria' });
        return false;
      }
    }
    return true;
  }

  function corpoEscrita(req, def) {
    const body = { ...(req.body || {}) };
    if (!def.multipart) return body;
    const arq = deArquivo(req.file);
    if (!arq.erro) {
      body.fileBase64 = arq.fileBase64;
      if (!body.fileName) body.fileName = arq.fileName;
      if (!body.mimeType) body.mimeType = arq.mimeType;
    }
    return body;
  }

  function montarEscrita(def) {
    const extras = def.multipart ? [uploadMiddleware(), erroMulter] : [];
    router.post(def.caminho, ...extras, async (req, res) => {
      try {
        if (!(await acesso(req, res, def.aprovacao))) return undefined;
        const validado = def.validar(corpoEscrita(req, def));
        if (validado.erro) return res.status(400).json({ ok: false, error: validado.erro });
        const recoletar = chavesDe(def, validado.payload);
        const r = await gravarNaPlanilha(pool, process.env, { action: def.action, payload: validado.payload, recoletar });
        if (!r.ok) return res.status(502).json({ ok: false, error: r.erro });
        if (r.resposta && r.resposta.ok === false) {
          return res.status(409).json({ ok: false, error: r.resposta.error || r.resposta.code || 'recusado_pela_planilha' });
        }
        if (def.sobDemanda) {
          const idAlvo = validado.payload[def.sobDemanda.campoId];
          lerSobDemanda(pool, process.env, { ...def.sobDemanda, id: idAlvo, forcar: true }).catch(() => null);
        }
        console.log(`${LOG} escrita ${def.action}`, { establishment: ESTAB, caminho: def.caminho, user: req.user && req.user.id });
        const { ok, ...resto } = r.resposta || {};
        void ok;
        return res.json({ ok: true, ...resto });
      } catch (err) {
        logErro(`falha em ${def.action}`, { message: err && err.message ? err.message : String(err) });
        return res.status(500).json({ ok: false, error: 'falha_ao_gravar' });
      }
    });
  }

  ESCRITAS.forEach(montarEscrita);

  // GET /api/bi/justino/operacao/permissoes → o front esconde botões de Diretoria
  router.get('/justino/operacao/permissoes', async (req, res) => {
    try {
      if (!(await acesso(req, res, false))) return undefined;
      const diretoria = await podeAprovarBiJustino(pool, req.user);
      return res.json({ ok: true, diretoria });
    } catch (err) {
      logErro('falha ao ler permissões', { message: err && err.message ? err.message : String(err) });
      return res.status(500).json({ ok: false, error: 'falha_na_leitura' });
    }
  });

  function montarSobDemanda(caminho, action, campoId) {
    router.get(caminho, async (req, res) => {
      try {
        if (!(await acesso(req, res, false))) return undefined;
        const forcar = String(req.query.forcar || '') === '1';
        const r = await lerSobDemanda(pool, process.env, { action, campoId, id: req.params.id, forcar });
        if (!r.ok) return res.status(r.erro === 'id_invalido' ? 400 : 502).json({ ok: false, error: r.erro });
        const itens = r.payload && Array.isArray(r.payload.items) ? r.payload.items : [];
        return res.json({ ok: true, items: itens, capturedAt: r.capturedAt, origem: r.origem, aviso: r.aviso });
      } catch (err) {
        logErro(`falha em ${action}`, { message: err && err.message ? err.message : String(err) });
        return res.status(500).json({ ok: false, error: 'falha_na_leitura' });
      }
    });
  }

  // GET /api/bi/justino/eventos/interacoes/:id  |  GET /api/bi/justino/auditoria-op/evidencias/:id
  montarSobDemanda('/justino/eventos/interacoes/:id', 'getEventoInteracoes', 'eventoId');
  montarSobDemanda('/justino/auditoria-op/evidencias/:id', 'getAuditoriaOpEvidencias', 'itemId');

  function montarPdf(base, qual, nomeArquivo) {
    router.get(`${base}/info`, async (req, res) => {
      try {
        if (!(await acesso(req, res, false))) return undefined;
        const r = await infoPdf(pool, process.env, qual);
        if (!r.ok) return res.status(502).json({ ok: false, error: r.erro });
        return res.json({ ok: true, totalBytes: r.totalBytes, updatedAt: r.updatedAt, copia: r.copia, aviso: r.aviso });
      } catch (err) {
        logErro(`falha na info do PDF ${qual}`, { message: err && err.message ? err.message : String(err) });
        return res.status(500).json({ ok: false, error: 'falha_na_leitura' });
      }
    });
    router.get(`${base}/pdf`, async (req, res) => {
      try {
        if (!(await acesso(req, res, false))) return undefined;
        const r = await obterPdf(pool, process.env, qual);
        if (!r.ok) return res.status(r.erro === 'pdf_grande_demais' ? 413 : 502).json({ ok: false, error: r.erro });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${nomeArquivo}"`);
        res.setHeader('Cache-Control', 'private, max-age=300');
        res.setHeader('X-Bi-Origem', r.origem);
        return res.send(r.bytes);
      } catch (err) {
        logErro(`falha ao servir PDF ${qual}`, { message: err && err.message ? err.message : String(err) });
        return res.status(500).json({ ok: false, error: 'falha_na_leitura' });
      }
    });
  }

  // GET /api/bi/justino/documentos/manual/{info,pdf}  |  GET /api/bi/justino/eventos/pacotes/{info,pdf}
  montarPdf('/justino/documentos/manual', 'manual', 'manual-operacional-seu-justino.pdf');
  montarPdf('/justino/eventos/pacotes', 'pacotes', 'pacotes-seu-justino.pdf');

  return router;
};
