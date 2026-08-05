// scripts/verify_executive_events_tables.js
// Script para verificar se as tabelas do sistema de Executive Events foram criadas

const { Pool } = require('pg');
require('dotenv').config();
const { requireDatabaseUrl } = require('../config/resolveDatabaseUrl');

async function verifyTables() {
  let pool;
  
  try {
    console.log('🔍 Verificando tabelas do sistema de Executive Events...\n');

    const connectionString = requireDatabaseUrl();
    
    pool = new Pool({
      connectionString: connectionString,
      ssl: connectionString.includes('render.com') ? { rejectUnauthorized: false } : undefined,
    });

    // Verificar em todos os schemas
    const schemas = ['meu_backup_db', 'public'];
    const tablesToCheck = ['executive_events', 'event_settings', 'event_items', 'event_seals'];

    for (const schema of schemas) {
      console.log(`\n📂 Verificando schema: ${schema}`);
      console.log('='.repeat(50));
      
      for (const tableName of tablesToCheck) {
        try {
          // Verificar se a tabela existe
          const result = await pool.query(`
            SELECT EXISTS (
              SELECT FROM information_schema.tables 
              WHERE table_schema = $1 
              AND table_name = $2
            ) as exists
          `, [schema, tableName]);

          const exists = result.rows[0]?.exists || false;
          
          if (exists) {
            console.log(`  ✅ Tabela '${tableName}' existe`);
            
            // Contar registros
            try {
              const countResult = await pool.query(`SELECT COUNT(*) as count FROM ${schema}.${tableName}`);
              const count = countResult.rows[0]?.count || 0;
              console.log(`     📊 Registros: ${count}`);
              
              // Mostrar estrutura
              const structureResult = await pool.query(`
                SELECT column_name, data_type, is_nullable
                FROM information_schema.columns
                WHERE table_schema = $1 AND table_name = $2
                ORDER BY ordinal_position
              `, [schema, tableName]);
              
              if (structureResult.rows.length > 0) {
                console.log(`     📋 Colunas (${structureResult.rows.length}):`);
                structureResult.rows.forEach(col => {
                  console.log(`        - ${col.column_name} (${col.data_type})`);
                });
              }
            } catch (e) {
              console.log(`     ⚠️  Erro ao verificar estrutura: ${e.message}`);
            }
          } else {
            console.log(`  ❌ Tabela '${tableName}' NÃO existe`);
          }
        } catch (error) {
          console.log(`  ⚠️  Erro ao verificar '${tableName}': ${error.message}`);
        }
      }
    }

    // Verificar função
    console.log('\n📂 Verificando função update_updated_at_column()');
    console.log('='.repeat(50));
    try {
      const functionResult = await pool.query(`
        SELECT proname, pronargs, prorettype::regtype
        FROM pg_proc 
        WHERE proname = 'update_updated_at_column'
      `);
      
      if (functionResult.rows.length > 0) {
        console.log('  ✅ Função existe');
        functionResult.rows.forEach(func => {
          console.log(`     Nome: ${func.proname}`);
          console.log(`     Argumentos: ${func.pronargs}`);
          console.log(`     Retorno: ${func.prorettype}`);
        });
      } else {
        console.log('  ❌ Função NÃO existe');
      }
    } catch (error) {
      console.log(`  ⚠️  Erro ao verificar função: ${error.message}`);
    }

    // Verificar triggers
    console.log('\n📂 Verificando triggers');
    console.log('='.repeat(50));
    try {
      const triggerResult = await pool.query(`
        SELECT trigger_name, event_object_table, action_timing, event_manipulation
        FROM information_schema.triggers
        WHERE trigger_name LIKE '%executive_events%' OR trigger_name LIKE '%event_settings%'
      `);
      
      if (triggerResult.rows.length > 0) {
        console.log(`  ✅ Encontrados ${triggerResult.rows.length} trigger(s):`);
        triggerResult.rows.forEach(trigger => {
          console.log(`     - ${trigger.trigger_name} em ${trigger.event_object_table}`);
        });
      } else {
        console.log('  ⚠️  Nenhum trigger encontrado');
      }
    } catch (error) {
      console.log(`  ⚠️  Erro ao verificar triggers: ${error.message}`);
    }

    console.log('\n' + '='.repeat(50));
    console.log('✅ Verificação concluída!\n');

  } catch (error) {
    console.error('\n❌ ERRO:', error.message);
    process.exit(1);
  } finally {
    if (pool) {
      await pool.end();
    }
  }
}

verifyTables();

