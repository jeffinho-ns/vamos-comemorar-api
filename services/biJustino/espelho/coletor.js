'use strict';

const { missingCredentialNames, readBootstrap, readActions } = require('../appsScriptClient');
const snapshotStore = require('../snapshotStore');
const { emitBiLiveChanged } = require('../../../utils/biLiveRealtime');
const { listarLeituras, leiturasPorRitmo, encontrarLeitura, fonteDaChave } = require('./catalogo');

/** O Apps Script corta o bootstrap em 50 chamadas e 90 s; lotes menores cabem com folga. */
const TAMANHO_LOTE = 18;
const TIMEOUT_LOTE_MS = 110000;
const GUARDAR_COPIAS = 3;

let emAndamento = null;

/** O bootstrap do Apps Script só aceita /^get[A-Za-z]+$/ — ações com dígito (get99Food) vão por chamada direta. */
function cabeNoLote(leitura) {
  return /^get[A-Za-z]+$/.test(leitura.action);
}

function emLotes(lista, tamanho) {
  const lotes = [];
  for (let i = 0; i < lista.length; i += tamanho) lotes.push(lista.slice(i, i + tamanho));
  return lotes;
}

function chaveDoResultado(lote, indice, item) {
  const pedido = lote[indice];
  if (pedido && pedido.action === item.action) return pedido.chave;
  const achado = lote.find((l) => l.action === item.action && JSON.stringify(l.payload || {}) === JSON.stringify(item.payload || {}));
  return achado ? achado.chave : null;
}

async function podarAntigas(pool, source) {
  await pool.query(
    `DELETE FROM bi_source_snapshots
      WHERE source = $1
        AND id NOT IN (
          SELECT id FROM bi_source_snapshots WHERE source = $1 ORDER BY captured_at DESC LIMIT $2
        )`,
    [source, GUARDAR_COPIAS],
  ).catch(() => null);
}

async function gravarLote(pool, store, lote, results) {
  let gravadas = 0;
  for (let i = 0; i < results.length; i += 1) {
    const item = results[i];
    if (!item || !item.r || item.r.ok === false) continue;
    const chave = chaveDoResultado(lote, i, item);
    if (!chave) continue;
    const source = fonteDaChave(chave);
    await store.saveSnapshot(pool, { source, action: item.action, payload: item.r });
    if (typeof store.podar === 'function') await store.podar(pool, source);
    else await podarAntigas(pool, source);
    gravadas += 1;
  }
  return gravadas;
}

/**
 * Baixa as leituras pedidas (ou todas) para o banco.
 * @param {object} pool
 * @param {object} env
 * @param {{ modo?: 'completo'|'rapido'|'lento', chaves?: string[], store?, readBootstrap?, fetchImpl?, emit?: boolean }} deps
 */
async function coletarEspelho(pool, env, deps) {
  const options = deps || {};
  const sourceEnv = env || process.env;
  if (missingCredentialNames(sourceEnv).length) return { ok: false, motivo: 'credenciais_ausentes' };
  if (emAndamento) return emAndamento;

  const store = options.store || snapshotStore;
  const ler = options.readBootstrap || readBootstrap;
  const lerDireto = options.readActions || readActions;
  const leituras = Array.isArray(options.chaves) && options.chaves.length
    ? options.chaves.map(encontrarLeitura).filter(Boolean)
    : (options.modo === 'rapido' || options.modo === 'lento' ? leiturasPorRitmo(options.modo) : listarLeituras());
  const avulsas = leituras.filter((l) => !cabeNoLote(l));

  emAndamento = (async () => {
    let gravadas = 0;
    let falhas = 0;
    if (avulsas.length) {
      try {
        const respostas = await lerDireto(avulsas.map((l) => ({ action: l.action, payload: l.payload || {} })), sourceEnv, options.fetchImpl, 30000);
        const results = respostas.map((r, i) => ({ action: avulsas[i].action, payload: avulsas[i].payload || {}, r }));
        gravadas += await gravarLote(pool, store, avulsas, results);
      } catch (err) {
        falhas += 1;
      }
    }
    for (const lote of emLotes(leituras.filter(cabeNoLote), TAMANHO_LOTE)) {
      try {
        const results = await ler(
          lote.map((l) => ({ action: l.action, payload: l.payload || {} })),
          sourceEnv,
          options.fetchImpl,
          options.timeoutMs || TIMEOUT_LOTE_MS,
        );
        gravadas += await gravarLote(pool, store, lote, results);
      } catch (err) {
        falhas += 1;
        console.error('[bi-justino] espelho: lote falhou', {
          establishment: 'Seu Justino',
          code: err && err.code ? err.code : 'falha_na_coleta',
          acoes: lote.map((l) => l.chave).join(','),
        });
      }
    }
    if (gravadas && options.emit !== false) emitBiLiveChanged('planilha');
    console.log('[bi-justino] espelho da planilha', {
      establishment: 'Seu Justino',
      modo: options.modo || (options.chaves ? 'chaves' : 'completo'),
      pedidas: leituras.length,
      gravadas,
      lotesComFalha: falhas,
    });
    return { ok: true, pedidas: leituras.length, gravadas, falhas };
  })().finally(() => { emAndamento = null; });

  return emAndamento;
}

module.exports = {
  coletarEspelho,
  emLotes,
  TAMANHO_LOTE,
};
