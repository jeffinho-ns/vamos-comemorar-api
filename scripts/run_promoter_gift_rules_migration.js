// Script para executar a migração de regras de brindes para promoters
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Usar a mesma configuração do config/database.js
const connectionString = process.env.DATABASE_URL || 'postgresql://agilizaidb_user:9leBZwUgynZN5pnHPsqEJDW1tkE6LWjZ@dpg-d4bmh07diees73db68cg-a.oregon-postgres.render.com/agilizaidb?sslmode=prefer';

const pool = new Pool({
  connectionString: connectionString,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

async function runMigration() {
  const client = await pool.connect();
  
  try {
    console.log('🔄 Iniciando migração de regras de brindes para promoters...');
    
    // Definir search_path igual ao config/database.js
    try {
      await client.query(`SET search_path TO meu_backup_db, public`);
      console.log('✅ Search path definido: meu_backup_db, public');
    } catch (e) {
      console.warn('⚠️  Aviso ao definir search_path:', e.message);
      // Continuar mesmo se não conseguir definir o search_path
    }
    
    // Ler o arquivo SQL
    const migrationPath = path.join(__dirname, '../migrations/add_promoter_gift_rules.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');
    
    // Executar cada comando SQL separadamente
    // Dividir por ponto-e-vírgula, mas manter comentários e blocos completos
    const commands = sql
      .split(/;(?=\s*(?:--|$|\n))/)
      .map(cmd => cmd.trim())
      .filter(cmd => cmd.length > 0 && !cmd.match(/^\s*--/));
    
    console.log(`📝 Total de comandos a executar: ${commands.length}`);
    
    for (let i = 0; i < commands.length; i++) {
      const command = commands[i];
      if (command.trim() && !command.match(/^\s*--/)) {
        try {
          // Remover comentários inline
          const cleanCommand = command.split('--')[0].trim();
          if (cleanCommand) {
            await client.query(cleanCommand);
            console.log(`✅ Comando ${i + 1}/${commands.length} executado com sucesso`);
          }
        } catch (error) {
          // Ignorar erros de "já existe" ou "não encontrado" se for apenas aviso
          if (error.message.includes('already exists') || 
              error.message.includes('does not exist') ||
              error.message.includes('duplicate') ||
              error.code === '42P07' || // relation already exists
              error.code === '42710') { // duplicate object
            console.log(`⚠️  Aviso (ignorado) no comando ${i + 1}:`, error.message.split('\n')[0]);
          } else {
            console.error(`❌ Erro no comando ${i + 1}:`, error.message);
            console.error('Comando:', cleanCommand.substring(0, 100) + '...');
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

