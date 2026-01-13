// scripts/run_birthday_reservation_price_fields_migration.js
// Script para executar a migração que adiciona campos de preço e dados completos nas reservas de aniversário

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();

async function runMigration() {
  let pool;
  
  try {
    console.log('🚀 INICIANDO MIGRAÇÃO: Campos de Preço e Dados Completos para Reservas de Aniversário');
    console.log('====================================================\n');

    // Conectar ao banco de dados
    console.log('🔗 Conectando ao banco de dados PostgreSQL...');
    
    const connectionString = process.env.DATABASE_URL || 
      'postgresql://agilizaidb_user:9leBZwUgynZN5pnHPsqEJDW1tkE6LWjZ@dpg-d4bmh07diees73db68cg-a.oregon-postgres.render.com/agilizaidb?sslmode=prefer';
    
    pool = new Pool({
      connectionString: connectionString,
      ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
    });

    // Testar conexão
    await pool.query('SELECT 1');
    console.log('✅ Conectado ao banco de dados com sucesso!\n');

    // Definir search_path
    await pool.query(`SET search_path TO meu_backup_db, public`);
    console.log('✅ Search path definido: meu_backup_db, public\n');

    // Ler o arquivo de migração
    const migrationPath = path.join(__dirname, '../migrations/add_birthday_reservation_price_fields.sql');
    console.log('📖 Lendo arquivo de migração...');
    console.log(`   Caminho: ${migrationPath}\n`);
    
    if (!fs.existsSync(migrationPath)) {
      throw new Error(`Arquivo de migração não encontrado: ${migrationPath}`);
    }

    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    console.log('✅ Arquivo de migração lido com sucesso!\n');

    // Executar a migração
    console.log('📝 Executando migração SQL...\n');
    
    // Executar o SQL completo
    await pool.query(migrationSQL);
    
    console.log('✅ Migração executada com sucesso!\n');

    // Verificar se os campos foram criados
    console.log('🔍 Verificando se os campos foram criados...\n');
    
    const checkQuery = `
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'birthday_reservations'
      AND column_name IN ('decoracao_preco', 'decoracao_imagem', 'bebidas_completas', 'comidas_completas')
      ORDER BY column_name;
    `;
    
    const result = await pool.query(checkQuery);
    
    if (result.rows.length > 0) {
      console.log('✅ Campos encontrados na tabela:');
      result.rows.forEach(row => {
        console.log(`   - ${row.column_name}: ${row.data_type} (nullable: ${row.is_nullable})`);
      });
    } else {
      console.log('⚠️ Nenhum dos novos campos foi encontrado. Verifique se a tabela existe e se o schema está correto.');
    }
    
    console.log('\n✅ Migração concluída com sucesso!');
    console.log('====================================================\n');

  } catch (error) {
    console.error('\n❌ ERRO durante a migração:');
    console.error('====================================================');
    console.error('Mensagem:', error.message);
    console.error('Stack:', error.stack);
    console.error('====================================================\n');
    process.exit(1);
  } finally {
    if (pool) {
      await pool.end();
      console.log('🔌 Conexão com o banco de dados encerrada.');
    }
  }
}

// Executar a migração
if (require.main === module) {
  runMigration()
    .then(() => {
      console.log('✅ Script finalizado com sucesso!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Erro fatal:', error);
      process.exit(1);
    });
}

module.exports = { runMigration };

