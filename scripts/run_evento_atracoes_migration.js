const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Configuração do banco de dados PostgreSQL
const connectionString = process.env.DATABASE_URL || 'postgresql://agilizaidb_user:9leBZwUgynZN5pnHPsqEJDW1tkE6LWjZ@dpg-d4bmh07diees73db68cg-a.oregon-postgres.render.com/agilizaidb?sslmode=prefer';

const pool = new Pool({
  connectionString: connectionString,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

async function runMigration() {
  const client = await pool.connect();
  
  try {
    console.log('🚀 INICIANDO MIGRAÇÃO: evento_atracoes');
    console.log('=====================================');
    
    // Definir search_path
    await client.query(`SET search_path TO meu_backup_db, public`);
    console.log('✅ Search path definido');
    
    // Ler arquivo SQL
    console.log('📖 Lendo arquivo de migração...');
    const migrationPath = path.join(__dirname, '..', 'migrations', 'create_evento_atracoes_table.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    console.log('✅ Arquivo lido com sucesso');
    
    // Executar migração
    console.log('🚀 Executando migração...');
    
    // Executar o SQL completo de uma vez (PostgreSQL suporta múltiplos comandos)
    try {
      await client.query(migrationSQL);
      console.log('✅ Migração executada com sucesso');
    } catch (error) {
      // Se falhar, tentar executar comandos separadamente
      console.log('⚠️  Erro ao executar SQL completo, tentando comandos separados...');
      console.log('   Erro:', error.message);
      
      // Executar apenas o CREATE TABLE primeiro
      const createTableMatch = migrationSQL.match(/CREATE TABLE[^;]+;/is);
      if (createTableMatch) {
        try {
          await client.query(createTableMatch[0]);
          console.log('   ✅ Tabela criada');
        } catch (err) {
          if (err.message.includes('already exists')) {
            console.log('   ⚠️  Tabela já existe');
          } else {
            throw err;
          }
        }
      }
      
      // Depois executar o resto
      const restOfSQL = migrationSQL.replace(/CREATE TABLE[^;]+;/is, '');
      try {
        await client.query(restOfSQL);
        console.log('   ✅ Resto da migração executado');
      } catch (err) {
        // Ignorar erros de "não existe" para DROP TRIGGER
        if (err.message.includes('does not exist') && restOfSQL.includes('DROP TRIGGER')) {
          console.log('   ⚠️  Trigger não existe (ignorado)');
        } else {
          throw err;
        }
      }
    }
    
    // Commit
    await client.query('COMMIT');
    console.log('✅ Transação commitada');
    
    // Verificar se a tabela foi criada
    console.log('🔍 Verificando resultado...');
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'meu_backup_db' 
        AND table_name = 'evento_atracoes'
      )
    `);
    
    if (tableCheck.rows[0].exists) {
      console.log('✅ Tabela evento_atracoes criada com sucesso!');
      
      // Verificar estrutura
      const structure = await client.query(`
        SELECT 
          column_name,
          data_type,
          is_nullable,
          column_default
        FROM information_schema.columns
        WHERE table_schema = 'meu_backup_db'
        AND table_name = 'evento_atracoes'
        ORDER BY ordinal_position
      `);
      
      console.log('\n📋 Estrutura da tabela:');
      structure.rows.forEach(col => {
        console.log(`   - ${col.column_name}: ${col.data_type} ${col.is_nullable === 'NO' ? 'NOT NULL' : 'NULL'} ${col.column_default ? `DEFAULT ${col.column_default}` : ''}`);
      });
      
      // Verificar índices
      const indexes = await client.query(`
        SELECT indexname, indexdef
        FROM pg_indexes
        WHERE schemaname = 'meu_backup_db'
        AND tablename = 'evento_atracoes'
      `);
      
      if (indexes.rows.length > 0) {
        console.log('\n📊 Índices criados:');
        indexes.rows.forEach(idx => {
          console.log(`   - ${idx.indexname}`);
        });
      }
      
      // Verificar trigger
      const triggers = await client.query(`
        SELECT trigger_name, event_manipulation, event_object_table
        FROM information_schema.triggers
        WHERE trigger_schema = 'meu_backup_db'
        AND event_object_table = 'evento_atracoes'
      `);
      
      if (triggers.rows.length > 0) {
        console.log('\n⚡ Triggers criados:');
        triggers.rows.forEach(trg => {
          console.log(`   - ${trg.trigger_name} (${trg.event_manipulation})`);
        });
      }
      
    } else {
      console.log('❌ Erro: Tabela não foi criada');
      throw new Error('Tabela evento_atracoes não foi criada');
    }
    
    console.log('\n=====================================');
    console.log('🎉 MIGRAÇÃO CONCLUÍDA COM SUCESSO!');
    console.log('=====================================');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('\n❌ ERRO na migração:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
    console.log('🔌 Conexão encerrada');
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  runMigration();
}

module.exports = runMigration;

