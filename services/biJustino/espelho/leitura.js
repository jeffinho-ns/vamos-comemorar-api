'use strict';

const snapshotStore = require('../snapshotStore');
const { aplicarProjecaoMarketing } = require('../projecaoMarketing');
const { carregarUnidas } = require('../reservasUnidas');
const { listarLeituras, fonteDaChave } = require('./catalogo');

const PREFIXO = 'planilha:';

function docsDe(bruto) {
  if (!bruto) return [];
  if (Array.isArray(bruto)) return bruto;
  if (typeof bruto !== 'object') return [];
  if (Array.isArray(bruto.docs)) return bruto.docs;
  if (Array.isArray(bruto.items)) return bruto.items;
  if (Array.isArray(bruto.mkPlans)) return bruto.mkPlans;
  if (bruto.payload) return docsDe(bruto.payload);
  return [];
}

function entradaDeLinha(linha) {
  if (!linha || !linha.date) return null;
  if (linha.values && typeof linha.values === 'object') return linha;
  const values = {};
  Object.keys(linha).forEach((chave) => {
    if (chave.startsWith('mk') && chave !== 'mkNote') values[chave] = linha[chave];
  });
  return {
    date: String(linha.date).slice(0, 10),
    values,
    notes: { mkNote: linha.mkNote || (linha.notes && linha.notes.mkNote) || '' },
    submittedByName: linha.submittedByName || '',
    submittedAt: linha.submittedAt || '',
  };
}

function misturarMkPlans(espelhoPayload, localPayload, zigPayload) {
  const daPlanilha = docsDe(espelhoPayload);
  const doZig = daPlanilha.length ? daPlanilha : docsDe(zigPayload);
  const aplicado = aplicarProjecaoMarketing({ mkPlans: doZig }, localPayload || {});
  return { ok: true, docs: aplicado.mkPlans || [] };
}

function misturarEntradasMarketing(espelhoPayload, envioPayload, zigPayload) {
  const mapa = new Map();
  const colocar = (lista) => {
    (lista || []).forEach((item) => {
      const doc = entradaDeLinha(item);
      if (doc) mapa.set(doc.date, doc);
    });
  };
  colocar(docsDe(zigPayload && zigPayload.lancamentos && zigPayload.lancamentos.marketing));
  colocar(docsDe(espelhoPayload));
  colocar(envioPayload && envioPayload.docs);
  const docs = [...mapa.values()].sort((a, b) => b.date.localeCompare(a.date));
  return { ok: true, docs };
}

async function completarEspelho(pool, dados, chaves, store) {
  const lista = chaves || [];
  const saida = { ...dados };
  if (lista.includes('getMkPlans')) {
    const local = await store.latestPayload(pool, 'mk_plans').catch(() => null);
    const precisaZig = !docsDe(saida.getMkPlans && saida.getMkPlans.payload).length;
    const zig = precisaZig ? await store.latestPayload(pool, 'faturamento_zig').catch(() => null) : null;
    const payload = misturarMkPlans(
      saida.getMkPlans && saida.getMkPlans.payload,
      local && local.payload,
      zig && zig.payload,
    );
    if (payload.docs.length || saida.getMkPlans || (local && local.payload)) {
      saida.getMkPlans = {
        payload,
        capturedAt: (saida.getMkPlans && saida.getMkPlans.capturedAt)
          || (local && local.captured_at)
          || (zig && zig.captured_at),
      };
    }
  }
  if (lista.includes('getEntries:marketing')) {
    const envio = await store.latestPayload(pool, 'envio_marketing').catch(() => null);
    const precisaZig = !docsDe(saida['getEntries:marketing'] && saida['getEntries:marketing'].payload).length;
    const zig = precisaZig ? await store.latestPayload(pool, 'faturamento_zig').catch(() => null) : null;
    const payload = misturarEntradasMarketing(
      saida['getEntries:marketing'] && saida['getEntries:marketing'].payload,
      envio && envio.payload,
      zig && zig.payload,
    );
    if (payload.docs.length || saida['getEntries:marketing']) {
      saida['getEntries:marketing'] = {
        payload,
        capturedAt: (saida['getEntries:marketing'] && saida['getEntries:marketing'].capturedAt)
          || (envio && envio.captured_at)
          || (zig && zig.captured_at),
      };
    }
  }
  if (lista.includes('getReservationEntries') || lista.includes('getReservations')) {
    try {
      const unidas = await carregarUnidas(pool, {
        store,
        dionisioPayload: saida.getReservationEntries && saida.getReservationEntries.payload,
      });
      const capturedAt = (saida.getReservationEntries && saida.getReservationEntries.capturedAt)
        || (saida.getReservations && saida.getReservations.capturedAt)
        || new Date().toISOString();
      if (lista.includes('getReservationEntries') && (unidas.items.length || saida.getReservationEntries)) {
        saida.getReservationEntries = { payload: { ok: true, items: unidas.items }, capturedAt };
      }
      if (lista.includes('getReservations') && (unidas.docs.length || saida.getReservations)) {
        saida.getReservations = { payload: { ok: true, docs: unidas.docs }, capturedAt };
      }
    } catch (err) {
      console.warn('[bi-justino] não deu para unir reservas Agilizaiapp + Dionísio', {
        establishment: 'Seu Justino',
        message: err && err.message ? err.message : String(err),
      });
    }
  }
  return saida;
}

function chavesValidas(pedidas) {
  const conhecidas = new Set(listarLeituras().map((l) => l.chave));
  return (pedidas || [])
    .map((c) => String(c || '').trim())
    .filter((c) => c && (conhecidas.has(c) || /^get[A-Za-z]+(:[A-Za-z0-9_-]+)?$/.test(c)));
}

/**
 * Lê do banco a última cópia de cada chave pedida.
 * @returns {Promise<Record<string, { payload: object, capturedAt: string }>>}
 */
async function lerEspelho(pool, chaves, deps) {
  const store = (deps && deps.store) || snapshotStore;
  const lista = chavesValidas(chaves);
  if (!lista.length) return {};
  await store.ensureTable(pool);
  const fontes = lista.map(fonteDaChave);
  const result = await pool.query(
    `SELECT DISTINCT ON (source) source, payload, captured_at
       FROM bi_source_snapshots
      WHERE source = ANY($1::text[])
      ORDER BY source, captured_at DESC`,
    [fontes],
  );
  const saida = {};
  for (const row of result.rows) {
    const chave = String(row.source).slice(PREFIXO.length);
    saida[chave] = { payload: row.payload, capturedAt: row.captured_at };
  }
  return completarEspelho(pool, saida, lista, store);
}

/** Quais chaves do catálogo ainda não têm cópia no banco. */
async function chavesSemCopia(pool, deps) {
  const store = (deps && deps.store) || snapshotStore;
  await store.ensureTable(pool);
  const todas = listarLeituras().map((l) => l.chave);
  const result = await pool.query(
    `SELECT DISTINCT source FROM bi_source_snapshots WHERE source LIKE $1`,
    [`${PREFIXO}%`],
  );
  const presentes = new Set(result.rows.map((r) => String(r.source).slice(PREFIXO.length)));
  return todas.filter((c) => !presentes.has(c));
}

module.exports = {
  lerEspelho,
  chavesSemCopia,
  chavesValidas,
  docsDe,
  misturarMkPlans,
  misturarEntradasMarketing,
};
