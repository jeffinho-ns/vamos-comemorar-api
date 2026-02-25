#!/usr/bin/env node
/**
 * Executa a migration add_subcategory_order_to_menu_items.sql
 * Uso: node scripts/run_subcategory_order_migration.js
 * Requer: .env com DATABASE_URL ou usa a connection string padrão do config
 */
require('dotenv').config();
const pool = require('../config/database');
const fs = require('fs');
const path = require('path');

async function runMigration() {
  const client = await pool.connect();
  try {
    console.log('🔄 Iniciando migration: subcategory_order em menu_items...');

    // 1) Adicionar coluna se não existir (PostgreSQL 9.5+)
    await client.query(`
      ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS subcategory_order INTEGER NULL
    `);
    console.log('✅ Coluna subcategory_order verificada/adicionada.');

    // 2) Comentário (pode falhar se tabela estiver em outro schema; ignorar erro)
    try {
      await client.query(`
        COMMENT ON COLUMN menu_items.subcategory_order IS 'Ordem da subcategoria dentro da categoria. Usado apenas pelo reorder de subcategorias; a coluna "order" é a ordem do item.'
      `);
    } catch (e) {
      console.warn('⚠️ Comentário não aplicado (pode ser schema):', e.message);
    }

    // 3) Backfill
    const updateResult = await client.query(`
      UPDATE menu_items
      SET subcategory_order = "order"
      WHERE subcategory IS NOT NULL AND subcategory != '' AND TRIM(subcategory) != ''
        AND subcategory_order IS NULL
    `);
    console.log('✅ Backfill: ' + (updateResult.rowCount || 0) + ' linha(s) atualizada(s).');

    // 4) Índice
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_menu_items_subcategory_order
      ON menu_items(categoryid, subcategory_order NULLS LAST, "order")
    `);
    console.log('✅ Índice idx_menu_items_subcategory_order criado/verificado.');

    console.log('✅ Migration concluída com sucesso.');
  } catch (err) {
    console.error('❌ Erro na migration:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration().catch(() => process.exit(1));
