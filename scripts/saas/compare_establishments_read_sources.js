'use strict';

/**
 * Compara leitura legacy (places/bars) vs establishments (adapter Fase 7).
 *
 * Uso:
 *   node scripts/saas/compare_establishments_read_sources.js
 *   node scripts/saas/compare_establishments_read_sources.js --api
 *
 * --api  também compara GET https://api... (requer API no ar; usa legacy por padrão)
 */

const pool = require('../../config/database');
const {
  listPlacesFromEstablishments,
  listBarsFromEstablishments,
} = require('../../services/establishmentLegacyAdapter');

const API_URL =
  process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'https://api.agilizaiapp.com.br';

function normalizePlace(row) {
  return {
    id: Number(row.id),
    slug: row.slug ?? null,
    name: row.name ?? null,
    email: row.email ?? null,
    visible: row.visible ?? null,
    status: row.status ?? null,
  };
}

function normalizeBar(row) {
  return {
    id: Number(row.id),
    slug: row.slug ?? null,
    name: row.name ?? null,
    logourl: row.logourl || row.logoUrl || null,
    address: row.address ?? null,
  };
}

function diffLists(label, legacyRows, estRows, normalize) {
  const legacyMap = new Map(legacyRows.map((r) => [Number(r.id), normalize(r)]));
  const estMap = new Map(estRows.map((r) => [Number(r.id), normalize(r)]));

  const onlyLegacy = [];
  const onlyEst = [];
  const mismatches = [];

  for (const [id, leg] of legacyMap) {
    const est = estMap.get(id);
    if (!est) {
      onlyLegacy.push(id);
      continue;
    }
    const keys = new Set([...Object.keys(leg), ...Object.keys(est)]);
    const diff = {};
    for (const k of keys) {
      const a = leg[k];
      const b = est[k];
      if (String(a ?? '') !== String(b ?? '')) diff[k] = { legacy: a, establishments: b };
    }
    if (Object.keys(diff).length > 0) mismatches.push({ id, diff });
  }

  for (const id of estMap.keys()) {
    if (!legacyMap.has(id)) onlyEst.push(id);
  }

  console.log(`\n=== ${label} ===`);
  console.log(`Legacy: ${legacyRows.length} | Establishments: ${estRows.length}`);
  if (onlyLegacy.length) console.log(`Só em legacy: ${onlyLegacy.join(', ')}`);
  if (onlyEst.length) console.log(`Só em establishments: ${onlyEst.join(', ')}`);
  if (mismatches.length === 0 && onlyLegacy.length === 0 && onlyEst.length === 0) {
    console.log('✅ Paridade OK (campos-chave)');
  } else if (mismatches.length) {
    console.log(`⚠️ ${mismatches.length} divergência(s):`);
    mismatches.slice(0, 10).forEach((m) => {
      console.log(`  id=${m.id}`, JSON.stringify(m.diff));
    });
    if (mismatches.length > 10) console.log(`  ... +${mismatches.length - 10} mais`);
  }

  return {
    ok: mismatches.length === 0 && onlyLegacy.length === 0 && onlyEst.length === 0,
    onlyLegacy,
    onlyEst,
    mismatches,
  };
}

async function compareDb() {
  const client = await pool.connect();
  try {
    const placesLegacy = (
      await client.query(`
        SELECT id, slug, name, email, description, logo, street, number,
               latitude, longitude, status, visible
        FROM places ORDER BY id
      `)
    ).rows;

    const barsLegacy = (await client.query(`SELECT * FROM bars ORDER BY id`)).rows;

    const placesEst = await listPlacesFromEstablishments(client);
    const barsEst = await listBarsFromEstablishments(pool);

    const placesResult = diffLists('places', placesLegacy, placesEst, normalizePlace);
    const barsResult = diffLists('bars', barsLegacy, barsEst, normalizeBar);

    const views = await client.query(`
      SELECT table_name FROM information_schema.views
      WHERE table_schema = 'meu_backup_db'
        AND table_name IN ('places_compat', 'bars_compat')
      ORDER BY table_name
    `);
    console.log('\n=== Views compat (013) ===');
    console.log(views.rows.length ? views.rows.map((r) => r.table_name).join(', ') : 'não encontradas');

    return placesResult.ok && barsResult.ok;
  } finally {
    client.release();
  }
}

async function compareApi() {
  console.log('\n=== API GET (modo deploy atual) ===');
  const [placesRes, barsRes] = await Promise.all([
    fetch(`${API_URL}/api/places`),
    fetch(`${API_URL}/api/bars`),
  ]);
  if (!placesRes.ok || !barsRes.ok) {
    console.log(`places: ${placesRes.status} | bars: ${barsRes.status}`);
    return;
  }
  const placesBody = await placesRes.json();
  const barsBody = await barsRes.json();
  const places = Array.isArray(placesBody) ? placesBody : placesBody.data || [];
  const bars = Array.isArray(barsBody) ? barsBody : [];
  console.log(`GET /api/places → ${places.length} itens`);
  console.log(`GET /api/bars → ${bars.length} itens`);
  console.log(
    'Para testar establishments na API: ESTABLISHMENTS_READ_SOURCE=establishments + redeploy',
  );
}

async function main() {
  const withApi = process.argv.includes('--api');
  try {
    const ok = await compareDb();
    if (withApi) await compareApi();
    process.exitCode = ok ? 0 : 1;
  } catch (err) {
    console.error(err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
