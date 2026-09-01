#!/usr/bin/env node
'use strict';

/**
 * Separa Reserva Rooftop (place 9) de Reserva Pinheiros + clone cardápio + UEP.
 * Uso: DATABASE_URL=... node scripts/run_split_reserva_rooftop_pinheiros_migration.js
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('../config/database');

const ROOFTOP_PLACE_ID = 9;
const ROOFTOP_BAR_ID = 5;

async function tableExists(client, tableName) {
  const { rows } = await client.query(
    `SELECT 1 FROM information_schema.tables
      WHERE table_schema IN ('public', 'meu_backup_db') AND table_name = $1 LIMIT 1`,
    [tableName],
  );
  return rows.length > 0;
}

async function getTableColumns(client, tableName) {
  const { rows } = await client.query(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1`,
    [tableName],
  );
  return new Set(rows.map((r) => r.column_name));
}

async function cloneBarTheme(client, sourceBarId, targetBarId) {
  const cols = await getTableColumns(client, 'bars');
  const skip = new Set(['id', 'name', 'slug']);
  const copyCols = [
    'description',
    'address',
    'logourl',
    'coverimageurl',
    'coverimages',
    'rating',
    'reviewscount',
    'latitude',
    'longitude',
    'amenities',
    'popupimageurl',
    'facebook',
    'instagram',
    'whatsapp',
    'menu_category_bg_color',
    'menu_category_text_color',
    'menu_subcategory_bg_color',
    'menu_subcategory_text_color',
    'mobile_sidebar_bg_color',
    'mobile_sidebar_text_color',
    'custom_seals',
    'partner_logos',
    'menu_display_style',
  ].filter((c) => cols.has(c));

  if (copyCols.length === 0) return;

  const setClause = copyCols.map((c) => `${c} = src.${c}`).join(', ');
  await client.query(
    `UPDATE bars dst SET ${setClause}
       FROM bars src
      WHERE src.id = $1 AND dst.id = $2`,
    [sourceBarId, targetBarId],
  );
}

async function cloneCardapio(client, sourceBarId, targetBarId) {
  if (!(await tableExists(client, 'menu_categories')) || !(await tableExists(client, 'menu_items'))) {
    console.log('   ⚠ Tabelas menu_categories/menu_items não encontradas — pulando cardápio.');
    return { categories: 0, items: 0 };
  }

  const existing = await client.query(
    'SELECT COUNT(*)::int AS c FROM menu_categories WHERE barid = $1',
    [targetBarId],
  );
  if (existing.rows[0].c > 0) {
    const items = await client.query(
      'SELECT COUNT(*)::int AS c FROM menu_items WHERE barid = $1',
      [targetBarId],
    );
    console.log(
      `   Cardápio Pinheiros já existe (${existing.rows[0].c} categorias, ${items.rows[0].c} itens) — pulando clone.`,
    );
    return { categories: existing.rows[0].c, items: items.rows[0].c };
  }

  const itemCols = await getTableColumns(client, 'menu_items');
  const catCols = await getTableColumns(client, 'menu_categories');

  const catSelectCols = ['id', 'name', '"order"'];
  if (catCols.has('organization_id')) catSelectCols.push('organization_id');

  const { rows: categories } = await client.query(
    `SELECT ${catSelectCols.join(', ')} FROM menu_categories WHERE barid = $1 ORDER BY id`,
    [sourceBarId],
  );

  const catMap = new Map();
  for (const cat of categories) {
    const fields = ['barid', 'name', '"order"'];
    const values = [targetBarId, cat.name, cat.order];
    if (catCols.has('organization_id') && cat.organization_id != null) {
      fields.push('organization_id');
      values.push(cat.organization_id);
    }
    const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
    const ins = await client.query(
      `INSERT INTO menu_categories (${fields.join(', ')}) VALUES (${placeholders}) RETURNING id`,
      values,
    );
    catMap.set(cat.id, ins.rows[0].id);
  }

  const itemSelectCols = [
    'name',
    'description',
    'price',
    'imageurl',
    'categoryid',
    'subcategory',
    '"order"',
  ];
  if (itemCols.has('visible')) itemSelectCols.push('visible');
  if (itemCols.has('seals')) itemSelectCols.push('seals');
  if (itemCols.has('organization_id')) itemSelectCols.push('organization_id');

  const { rows: items } = await client.query(
    `SELECT ${itemSelectCols.join(', ')} FROM menu_items WHERE barid = $1 ORDER BY id`,
    [sourceBarId],
  );

  let insertedItems = 0;
  for (const item of items) {
    const newCatId = catMap.get(item.categoryid);
    if (!newCatId) continue;

    const fields = [
      'name',
      'description',
      'price',
      'imageurl',
      'categoryid',
      'barid',
      'subcategory',
      '"order"',
    ];
    const values = [
      item.name,
      item.description,
      item.price,
      item.imageurl,
      newCatId,
      targetBarId,
      item.subcategory,
      item.order,
    ];

    if (itemCols.has('visible')) {
      fields.push('visible');
      values.push(item.visible !== false && item.visible !== 0);
    }
    if (itemCols.has('seals')) {
      fields.push('seals');
      values.push(item.seals);
    }
    if (itemCols.has('organization_id') && item.organization_id != null) {
      fields.push('organization_id');
      values.push(item.organization_id);
    }

    const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
    await client.query(
      `INSERT INTO menu_items (${fields.join(', ')}) VALUES (${placeholders})`,
      values,
    );
    insertedItems += 1;
  }

  return { categories: categories.length, items: insertedItems };
}

async function copyUepRooftopToPinheiros(client, rooftopPlaceId, pinheirosPlaceId) {
  const cols = await getTableColumns(client, 'user_establishment_permissions');
  const skip = new Set([
    'id',
    'establishment_id',
    'created_at',
    'updated_at',
  ]);
  const copyCols = [...cols].filter(
    (c) => !skip.has(c) && c !== 'user_id' && c !== 'user_email',
  );

  const selectCols = copyCols
    .map((c) => `uep.${c}`)
    .join(', ');

  const insertCols = ['user_id', 'user_email', 'establishment_id', ...copyCols];
  const conflictMeta = new Set(['is_active', 'updated_at']);
  const conflictSets = copyCols
    .filter((c) => !conflictMeta.has(c))
    .map((c) => `${c} = EXCLUDED.${c}`)
    .concat(['is_active = TRUE', 'updated_at = CURRENT_TIMESTAMP'])
    .join(', ');

  const sql = `
    INSERT INTO user_establishment_permissions (${insertCols.join(', ')})
    SELECT uep.user_id, uep.user_email, $2::int, ${selectCols}
      FROM user_establishment_permissions uep
     WHERE uep.establishment_id = $1 AND uep.is_active = TRUE
    ON CONFLICT (user_id, establishment_id) DO UPDATE SET ${conflictSets}
  `;

  const result = await client.query(sql, [rooftopPlaceId, pinheirosPlaceId]);
  return result.rowCount || 0;
}

async function resolveIds(client) {
  const { rows } = await client.query(
    `SELECT p.id AS place_id, p.slug AS place_slug, b.id AS bar_id, e.id AS est_id
       FROM places p
       LEFT JOIN establishments e ON e.legacy_place_id = p.id
       LEFT JOIN bars b ON b.id = e.legacy_bar_id
      WHERE p.slug IN ('reserva-rooftop', 'reserva-pinheiros')
      ORDER BY p.slug`,
  );
  const rooftop = rows.find((r) => r.place_slug === 'reserva-rooftop');
  const pinheiros = rows.find((r) => r.place_slug === 'reserva-pinheiros');
  return { rooftop, pinheiros, rows };
}

async function main() {
  const sqlPath = path.join(
    __dirname,
    '../migrations/2026-09-02_split_reserva_rooftop_pinheiros_postgresql.sql',
  );
  const sql = fs.readFileSync(sqlPath, 'utf8');
  const client = await pool.connect();

  try {
    console.log('▶ Aplicando migration SQL…');
    await client.query('BEGIN');
    await client.query(sql);

    const { pinheiros } = await resolveIds(client);
    if (!pinheiros?.place_id || !pinheiros?.bar_id) {
      throw new Error('Place/bar Pinheiros não encontrado após migration.');
    }

    console.log('▶ Clonando tema visual do bar…');
    await cloneBarTheme(client, ROOFTOP_BAR_ID, pinheiros.bar_id);

    console.log('▶ Clonando cardápio bar 5 → Pinheiros…');
    const cardapio = await cloneCardapio(client, ROOFTOP_BAR_ID, pinheiros.bar_id);
    console.log(`   ${cardapio.categories} categorias, ${cardapio.items} itens.`);

    console.log('▶ Copiando UEP Rooftop (9) → Pinheiros…');
    const uepCount = await copyUepRooftopToPinheiros(
      client,
      ROOFTOP_PLACE_ID,
      pinheiros.place_id,
    );
    console.log(`   ${uepCount} permissões replicadas/atualizadas.`);

    await client.query('COMMIT');

    const { rows } = await resolveIds(client);
    console.log('\n✅ Migration concluída.\n');
    console.table(rows);
    console.log(
      `\nIDs Pinheiros (hardcoded em reservaEstablishmentIds / reservaEstablishments): place=${pinheiros.place_id}, bar=${pinheiros.bar_id}`,
    );
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('❌', err.message);
  process.exit(1);
});
