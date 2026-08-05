#!/usr/bin/env node
// Adiciona coluna valor_entrada em gift_rules (valor de entrada para regra de promoter).
// Uso: node scripts/run_valor_entrada_migration.js

const { Pool } = require('pg');
require('dotenv').config();

const { requireDatabaseUrl } = require('../config/resolveDatabaseUrl');
const connectionString = requireDatabaseUrl();

const pool = new Pool({
  connectionString,
  ssl: connectionString && connectionString.includes('render.com') ? { rejectUnauthorized: false } : undefined,
});

async function run() {
  const client = await pool.connect();
  try {
    console.log('🔄 Executando migração: valor_entrada em gift_rules...\n');

    await client.query('SET search_path TO meu_backup_db, public');
    await client.query(`
      ALTER TABLE gift_rules
        ADD COLUMN IF NOT EXISTS valor_entrada NUMERIC(10,2) NOT NULL DEFAULT 0
    `);
    console.log('✅ gift_rules.valor_entrada');

    console.log('\n✅ Migração concluída.');
  } catch (err) {
    console.error('❌ Erro na migração:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
