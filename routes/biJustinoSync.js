const express = require('express');
const authenticateToken = require('../middleware/auth');
const { requireSuperAdmin } = require('../middleware/requireSuperAdmin');
const { canReadBiJustino } = require('../services/biJustino/access');
const { listSources, findSource } = require('../services/biJustino/sourceCatalog');
const { readAction } = require('../services/biJustino/appsScriptClient');
const { latestSnapshot, saveSnapshot } = require('../services/biJustino/snapshotStore');
const { listDataMap } = require('../services/biJustino/dataMap');
const { loadLiveFacts } = require('../services/biJustino/liveFacts');
const { loadZigOverview } = require('../services/biJustino/zigOverview');
const { peekZigPainel, warmZigPainel } = require('../services/biJustino/zigPainel');

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
      const [live, overview] = await Promise.all([
        loadLiveFacts(pool),
        loadZigOverview(pool, process.env),
      ]);
      delete live.placeIds;
      warmZigPainel(process.env);
      const extra = peekZigPainel();
      const serie = extra.value || {};
      const zig = {
        ...overview,
        serieMes: serie.serieMes || [],
        serieAno: serie.serieAno || [],
        custos: serie.custos || [],
        horario: serie.horario || null,
        bilheteria: serie.bilheteria || [],
        ranking: serie.ranking || null,
        cmvZig: serie.cmv || [],
        zigCarregando: extra.carregando,
      };
      const mapa = listDataMap();
      console.log('[bi-justino] leitura ao vivo', {
        establishment: 'Seu Justino',
        reservas: live.hoje.reservas,
        pessoas: live.hoje.pessoas,
        checkins: live.hoje.checkins,
        zig: zig && zig.disponivel ? 'ok' : (zig && zig.motivo) || 'ausente',
      });
      return res.json({
        ok: true,
        updatedAt: new Date().toISOString(),
        ...live,
        zig,
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
