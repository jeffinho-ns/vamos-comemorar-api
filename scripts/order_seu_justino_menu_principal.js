#!/usr/bin/env node
/**
 * Define ordem das subcategorias e itens do "Menu Principal" do bar Seu Justino.
 * Uso: node scripts/order_seu_justino_menu_principal.js
 */
require('dotenv').config();
const pool = require('../config/database');

// Nomes exatamente como estão no banco (bar 1, categoria Menu Principal)
const SUBcategories = [
  'Para Dividir',
  'Nossos incríveis bolinhos',
  'Entrada na brasa',
  'Braseiro brasileiro - Cortes nobres',
  'Acompanhamentos - Braseiro',
  'Principais',
  'Lanches',
  'Saladas',
  'Sobremesas',
  'Feijoada',
];

const ITEMS_BY_SUBCATEGORY = {
  'Para Dividir': [
    'Fritas do Justa',
    'Fritas Trufadas',
    'Pastel de Cupim',
    'Pastel de Mix de Queijos',
    'Isca de Frango',
    'Camarão empanado',
    'Dadinho de Tapioca ',
    'Torresmo do Justa',
  ],
  'Nossos incríveis bolinhos': [
    'Coxinha Supreme',
    'Bolinho Caipira',
    'Bolinho do Renato',
    'Bolinho do Julio',
    'Bolovo',
    'Bolinho da Vovó',
    'Bolinho de Feijoada',
  ],
  'Entrada na brasa': [
    'Provoleta',
    'Pão de Alho do Justa',
    'Sandubinha do Coração',
  ],
  'Braseiro brasileiro - Cortes nobres': [
    'Picanha Las Piedras - Uruguaia',
    'Chorizo',
    'Ancho',
    'Fraldinha Red',
    'Galeto',
    'Legumes',
  ],
  'Acompanhamentos - Braseiro': [
    'Arroz Branco',
    'Arroz de Brócolis',
    'Arroz Biro-Biro',
    'Mix de Folhas',
    'Vinagrete',
    'Fritas do Justa',
    'Salada de Maionese',
    'Feijão',
    'Farofa do Justa',
    'Farofa do chefe',
    'Batata Rústica',
    'Mandioca Frita',
  ],
  'Principais': [
    'Filé a Parmegiana',
    'Frango a Parmegiana',
    'Beringela a Parmegiana',
    'Medalhão Osvaldo Aranha',
    'Risoto de Parmesão e Filé Mignon',
    'Rigatoni ao Ragu',
    'Risoto do Mar',
    'Linguini ao mar',
    'Camarão cremoso do Justa',
  ],
  'Lanches': [
    'Wagyu do Justa',
    'Muu Burguer',
    'Sobrecoxa crocante',
    'Vegetariano',
  ],
  'Saladas': [
    'Salada do mar',
    'Ceviche de banana da terra',
    'Salada Caprese',
  ],
  'Sobremesas': [
    'Potinho de Nutella',
    'Potinho Banoffe',
    'Mini Churros',
    'Petit Gateau',
    'Banauê',
  ],
  'Feijoada': [],
};

function normalize(str) {
  if (!str || typeof str !== 'string') return '';
  let s = str.trim().toLowerCase().replace(/\s+/g, ' ');
  // Normalizar acentos (NFC) e remover caracteres combinados para comparar com o banco
  s = s.normalize('NFD').replace(/\p{M}/gu, '');
  return s;
}

async function run() {
  const client = await pool.connect();
  try {
    // 1) Bar "Seu Justino" (nome exato para não pegar "Pracinha do Seu Justino")
    const barRes = await client.query(
      `SELECT id, name FROM bars WHERE name = $1`,
      ['Seu Justino']
    );
    if (!barRes.rows.length) {
      console.error('Bar "Seu Justino" não encontrado.');
      process.exit(1);
    }
    const bar = barRes.rows[0];
    const barId = bar.id;
    console.log('Bar:', bar.name, '(id:', barId, ')');

    // 2) Categoria "Menu Principal"
    const catRes = await client.query(
      `SELECT id, name FROM menu_categories WHERE barid = $1 AND name ILIKE $2`,
      [barId, '%Menu Principal%']
    );
    if (!catRes.rows.length) {
      console.error('Categoria "Menu Principal" não encontrada para este bar.');
      process.exit(1);
    }
    const category = catRes.rows[0];
    const categoryId = category.id;
    console.log('Categoria:', category.name, '(id:', categoryId, ')');

    // 3) Subcategorias no banco (para mapear nome exato)
    const subcatsRes = await client.query(
      `SELECT DISTINCT subcategory FROM menu_items
       WHERE barid = $1 AND categoryid = $2 AND subcategory IS NOT NULL AND TRIM(subcategory) != ''`,
      [barId, categoryId]
    );
    const dbSubcatMap = new Map();
    subcatsRes.rows.forEach((r) => {
      const s = (r.subcategory || '').trim();
      dbSubcatMap.set(normalize(s), s);
    });

    // 4) Ordem das subcategorias
    for (let i = 0; i < SUBcategories.length; i++) {
      const name = SUBcategories[i];
      const key = normalize(name);
      const dbName = dbSubcatMap.get(key) || name;
      const upd = await client.query(
        `UPDATE menu_items SET subcategory_order = $1
         WHERE barid = $2 AND categoryid = $3 AND TRIM(subcategory) = $4`,
        [i, barId, categoryId, dbName]
      );
      console.log('  subcategory_order', i, ':', dbName, '(' + (upd.rowCount || 0) + ' itens)');
    }

    // 5) Ordem dos itens dentro de cada subcategoria (chave = subcategoria + nome para itens em mais de uma)
    const itemsInCategory = await client.query(
      `SELECT id, name, subcategory FROM menu_items
       WHERE barid = $1 AND categoryid = $2 AND deleted_at IS NULL`,
      [barId, categoryId]
    );
    const keyToId = new Map();
    itemsInCategory.rows.forEach((row) => {
      const k = normalize((row.subcategory || '')) + '\t' + normalize(row.name);
      if (!keyToId.has(k)) keyToId.set(k, row.id);
    });

    const updatedIds = new Set();
    for (const [subcatName, itemNames] of Object.entries(ITEMS_BY_SUBCATEGORY)) {
      const key = normalize(subcatName);
      const dbSubcat = dbSubcatMap.get(key) || subcatName;
      for (let i = 0; i < itemNames.length; i++) {
        const itemName = itemNames[i];
        const rowKey = normalize(dbSubcat) + '\t' + normalize(itemName);
        const id = keyToId.get(rowKey);
        if (id) {
          await client.query(`UPDATE menu_items SET "order" = $1 WHERE id = $2`, [i, id]);
          updatedIds.add(Number(id));
        } else {
          console.warn('  Item não encontrado:', JSON.stringify(itemName), 'em', dbSubcat);
        }
      }
      console.log('  itens ordenados em', dbSubcat + ':', itemNames.length);
    }
    // Itens da categoria que não estão na lista: ordem alta para aparecer no final
    const allIds = itemsInCategory.rows.map((r) => Number(r.id));
    const toEnd = allIds.filter((id) => !updatedIds.has(id));
    if (toEnd.length) {
      await client.query(
        `UPDATE menu_items SET "order" = 999 WHERE id = ANY($1::int[])`,
        [toEnd]
      );
      console.log('  itens não listados enviados ao final:', toEnd.length);
    }

    // Itens que estão na subcategoria mas não na lista: manter ordem alta para não quebrar
    console.log('Concluído.');
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
