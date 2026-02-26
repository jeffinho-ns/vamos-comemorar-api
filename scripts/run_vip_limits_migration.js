#!/usr/bin/env node
// Executa a migração add_vip_limits_and_vip_tipo_postgresql.sql
// Uso: node scripts/run_vip_limits_migration.js

const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const connectionString = process.env.DATABASE_URL
  || process.env.POSTGRES_URL
  || 'postgresql://agilizaidb_user:9leBZwUgynZN5pnHPsqEJDW1tkE6LWjZ@dpg-d4bmh07diees73db68cg-a.oregon-postgres.render.com/agilizaidb?sslmode=prefer';

if (!connectionString) {
  console.error('❌ DATABASE_URL não definida. Configure no .env');
  process.exit(1);
}

const pool = new Pool({
  connectionString,
  ssl: connectionString && connectionString.includes('render.com') ? { rejectUnauthorized: false } : undefined
});

async function run() {
  const client = await pool.connect();
  try {
    console.log('🔄 Executando migração: VIP limits e vip_tipo...\n');

    // 1. gift_rules
    await client.query(`
      ALTER TABLE gift_rules
        ADD COLUMN IF NOT EXISTS vip_m_limit INTEGER NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS vip_f_limit INTEGER NOT NULL DEFAULT 0
    `);
    console.log('✅ gift_rules: vip_m_limit, vip_f_limit');

    // 2. promoter_convidados (tentar com e sem schema)
    try {
      await client.query(`SET search_path TO meu_backup_db, public`);
      await client.query(`ALTER TABLE promoter_convidados ADD COLUMN IF NOT EXISTS vip_tipo VARCHAR(1) NULL`);
      console.log('✅ promoter_convidados.vip_tipo (schema meu_backup_db)');
    } catch (e) {
      if (e.code === '42P01') {
        await client.query(`SET search_path TO public`);
        await client.query(`ALTER TABLE promoter_convidados ADD COLUMN IF NOT EXISTS vip_tipo VARCHAR(1) NULL`);
        console.log('✅ promoter_convidados.vip_tipo (schema public)');
      } else {
        throw e;
      }
    }

    // 3. listas_convidados (schema meu_backup_db usado pela API)
    try {
      await client.query(`ALTER TABLE meu_backup_db.listas_convidados ADD COLUMN IF NOT EXISTS vip_tipo VARCHAR(1) NULL`);
      console.log('✅ meu_backup_db.listas_convidados.vip_tipo');
    } catch (e) {
      if (e.code === '42P01' || (e.message && e.message.includes('does not exist'))) {
        await client.query(`SET search_path TO meu_backup_db, public`);
        await client.query(`ALTER TABLE listas_convidados ADD COLUMN IF NOT EXISTS vip_tipo VARCHAR(1) NULL`);
        console.log('✅ listas_convidados.vip_tipo (via search_path)');
      } else {
        throw e;
      }
    }

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
