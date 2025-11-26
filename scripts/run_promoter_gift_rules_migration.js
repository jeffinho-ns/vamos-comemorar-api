// Script para executar a migração de regras de brindes para promoters
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function runMigration() {
  const client = await pool.connect();
  
  try {
    console.log('🔄 Iniciando migração de regras de brindes para promoters...');
    
    // Ler o arquivo SQL
    const migrationPath = path.join(__dirname, '../migrations/add_promoter_gift_rules.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');
    
    // Executar cada comando SQL separadamente
    const commands = sql
      .split(';')
      .map(cmd => cmd.trim())
      .filter(cmd => cmd.length > 0 && !cmd.startsWith('--'));
    
    for (const command of commands) {
      if (command.trim()) {
        try {
          await client.query(command);
          console.log('✅ Comando executado com sucesso');
        } catch (error) {
          // Ignorar erros de "já existe" ou "não encontrado" se for apenas aviso
          if (error.message.includes('already exists') || error.message.includes('does not exist')) {
            console.log('⚠️  Aviso (ignorado):', error.message);
          } else {
            throw error;
          }
        }
      }
    }
    
    console.log('✅ Migração concluída com sucesso!');
  } catch (error) {
    console.error('❌ Erro na migração:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration()
  .then(() => {
    console.log('🎉 Script finalizado!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Erro fatal:', error);
    process.exit(1);
  });

