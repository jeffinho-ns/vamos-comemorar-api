#!/usr/bin/env node
/**
 * 1. Verifica se a coluna can_create_edit_reservations existe
 * 2. Se não existir, aplica a migração
 * 3. Executa o script add-reserva-rooftop-users.js
 */
const pool = require('../config/database');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

async function main() {
  const client = await pool.connect();
  try {
    // 1. Verificar se a coluna existe
    const colCheck = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'user_establishment_permissions' AND column_name = 'can_create_edit_reservations'
    `);

    if (colCheck.rows.length === 0) {
      console.log('📋 Coluna can_create_edit_reservations não encontrada. Aplicando migração...');
      const migrationPath = path.join(__dirname, '../migrations/add_can_create_edit_reservations_postgresql.sql');
      const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
      await client.query(migrationSQL);
      console.log('✅ Migração aplicada com sucesso.');
    } else {
      console.log('✅ Coluna can_create_edit_reservations já existe. Migração não necessária.');
    }
  } finally {
    client.release();
  }

  // 2. Executar script de usuários
  console.log('\n🚀 Executando script add-reserva-rooftop-users.js...\n');
  const result = spawnSync('node', ['scripts/add-reserva-rooftop-users.js'], {
    cwd: path.join(__dirname, '..'),
    stdio: 'inherit',
  });
  process.exit(result.status);
}

main().catch((err) => {
  console.error('❌ Erro:', err.message);
  process.exit(1);
});
