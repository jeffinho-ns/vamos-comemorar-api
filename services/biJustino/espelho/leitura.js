'use strict';

const snapshotStore = require('../snapshotStore');
const { listarLeituras, fonteDaChave } = require('./catalogo');

const PREFIXO = 'planilha:';

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
  return saida;
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
};
