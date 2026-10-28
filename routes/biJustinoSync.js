const express = require('express');
const authenticateToken = require('../middleware/auth');
const { requireSuperAdmin } = require('../middleware/requireSuperAdmin');
const { canReadBiJustino } = require('../services/biJustino/access');
const { listSources, findSource } = require('../services/biJustino/sourceCatalog');
const { readAction } = require('../services/biJustino/appsScriptClient');
const { latestSnapshot, saveSnapshot } = require('../services/biJustino/snapshotStore');
const { listDataMap } = require('../services/biJustino/dataMap');
const { loadLiveFacts } = require('../services/biJustino/liveFacts');
const { loadZigOverview, scheduleZigSync } = require('../services/biJustino/zigOverview');
const { loadDre } = require('../services/biJustino/dreSharepoint');
const { loadNovidades } = require('../services/biJustino/painelNovidades');
const { coletarAbertura } = require('../services/biJustino/bootstrapColeta');

function precisaGravar(bloco) {
  return Boolean(bloco && !bloco.disponivel && bloco.motivo === 'aguardando_coleta');
}

async function gravarSeVazio(blocos) {
  const tarefas = blocos.filter(Boolean);
  if (!tarefas.length) return;
  await Promise.race([
    Promise.all(tarefas.map((tarefa) => Promise.resolve(tarefa).catch(() => null))),
    new Promise((resolve) => setTimeout(resolve, 8000)),
  ]);
}

module.exports = (pool) => {
  const router = express.Router();
  router.use(authenticateToken);

  router.get('/justino/fontes', requireSuperAdmin, async (req, res) => {
    try {
      const fontes = await Promise.all(listSources(process.env).map(async (source) => {
        const last = await latestSnapshot(pool, source.id).catch(() => null);
        return {
          ...source,
          ultimaCopia: last ? {
            id: last.id,
            capturedAt: last.captured_at,
            bytes: Number(last.bytes) || 0,
          } : null,
        };
      }));
      return res.json({ ok: true, establishment: 'Seu Justino', fontes });
    } catch (err) {
      console.error('[bi-justino] falha ao listar fontes', {
        message: err && err.message ? err.message : String(err),
      });
      return res.status(500).json({ ok: false, error: 'falha_ao_listar_fontes' });
    }
  });

  router.post('/justino/coletar', requireSuperAdmin, async (req, res) => {
    const sourceId = req.body && req.body.source ? String(req.body.source) : 'faturamento_zig';
    const source = findSource(sourceId);
    if (!source) {
      return res.status(400).json({ ok: false, error: 'fonte_desconhecida' });
    }
    if (!source.coletavel || !source.action) {
      return res.status(409).json({
        ok: false,
        error: 'fonte_ainda_nao_coletavel',
        source: source.id,
      });
    }

    try {
      const payload = await readAction(source.action, process.env);
      const saved = await saveSnapshot(pool, {
        source: source.id,
        action: source.action,
        payload,
      });
      console.log('[bi-justino] copia gravada', {
        establishment: 'Seu Justino',
        source: source.id,
        action: source.action,
        snapshot_id: saved.id,
      });
      return res.json({
        ok: true,
        source: source.id,
        action: source.action,
        snapshotId: saved.id,
        capturedAt: saved.captured_at,
      });
    } catch (err) {
      const code = err && err.code ? err.code : 'falha_na_coleta';
      const status = code === 'credenciais_ausentes' ? 503 : 502;
      console.error('[bi-justino] falha na coleta', {
        establishment: 'Seu Justino',
        source: source.id,
        code,
      });
      return res.status(status).json({
        ok: false,
        error: code,
        missing: err && err.missing ? err.missing : undefined,
      });
    }
  });

  router.get('/justino/ao-vivo', async (req, res) => {
    try {
      const allowed = await canReadBiJustino(pool, req.user);
      if (!allowed) {
        return res.status(403).json({ ok: false, error: 'acesso_negado' });
      }
      const live = await loadLiveFacts(pool);
      let [zig, dre, novidades] = await Promise.all([
        loadZigOverview(pool, process.env),
        loadDre(pool, process.env),
        loadNovidades(pool, process.env),
      ]);
      const abrirPlanilha = precisaGravar(dre) || precisaGravar(novidades);
      await gravarSeVazio([
        precisaGravar(zig) ? scheduleZigSync(pool, process.env, abrirPlanilha ? { pularPainel: true } : undefined) : null,
        abrirPlanilha ? coletarAbertura(pool, process.env) : null,
      ]);
      if (precisaGravar(zig) || precisaGravar(dre) || precisaGravar(novidades)) {
        [zig, dre, novidades] = await Promise.all([
          loadZigOverview(pool, process.env),
          loadDre(pool, process.env),
          loadNovidades(pool, process.env),
        ]);
      }
      delete live.placeIds;
      const mapa = listDataMap();
      console.log('[bi-justino] leitura ao vivo', {
        establishment: 'Seu Justino',
        reservas: live.hoje.reservas,
        pessoas: live.hoje.pessoas,
        checkins: live.hoje.checkins,
        zig: zig && zig.disponivel ? 'ok' : (zig && zig.motivo) || 'ausente',
        dre: dre && dre.disponivel ? 'ok' : (dre && dre.motivo) || 'ausente',
        novidades: novidades && novidades.disponivel ? 'ok' : (novidades && novidades.motivo) || 'ausente',
      });
      return res.json({
        ok: true,
        updatedAt: new Date().toISOString(),
        ...live,
        zig,
        dre,
        novidades,
        mapa,
      });
    } catch (err) {
      console.error('[bi-justino] falha na leitura ao vivo', {
        establishment: 'Seu Justino',
        message: err && err.message ? err.message : String(err),
      });
      return res.status(500).json({ ok: false, error: 'falha_na_leitura' });
    }
  });

  return router;
};
