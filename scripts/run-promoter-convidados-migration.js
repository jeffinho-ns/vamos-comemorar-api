// Script para rodar a migration da tabela promoter_convidados
const fs = require('fs');
const path = require('path');
const pool = require('../config/database');

async function runMigration() {
  try {
    console.log('🔄 Iniciando migration da tabela promoter_convidados...');
    
    // Ler o arquivo SQL
    const sqlFile = path.join(__dirname, '../migrations/create_promoter_convidados_table.sql');
    const sql = fs.readFileSync(sqlFile, 'utf8');
    
    // Dividir por comandos SQL (separados por ponto e vírgula)
    const commands = sql
      .split(';')
      .map(cmd => cmd.trim())
      .filter(cmd => cmd.length > 0 && !cmd.startsWith('--'));
    
    console.log(`📋 Encontrados ${commands.length} comando(s) SQL`);
    
    // Executar cada comando
    for (let i = 0; i < commands.length; i++) {
      const command = commands[i];
      console.log(`\n▶️  Executando comando ${i + 1}/${commands.length}...`);
      
      try {
        await pool.execute(command);
        console.log(`✅ Comando ${i + 1} executado com sucesso`);
      } catch (error) {
        // Ignorar erros de "já existe"
        if (error.code === 'ER_TABLE_EXISTS_ERROR' || error.code === 'ER_DUP_KEYNAME') {
          console.log(`⚠️  Comando ${i + 1} - Objeto já existe, pulando...`);
        } else {
          console.error(`❌ Erro no comando ${i + 1}:`, error.message);
          throw error;
        }
      }
    }
    
    console.log('\n🎉 Migration concluída com sucesso!');
    console.log('\n📋 Tabela criada: promoter_convidados');
    
    // Verificar se a tabela foi criada
    const [tables] = await pool.execute(
      "SHOW TABLES LIKE 'promoter_convidados'"
    );
    
    if (tables.length > 0) {
      console.log('✅ Verificação: Tabela promoter_convidados existe no banco');
      
      // Mostrar estrutura da tabela
      const [columns] = await pool.execute(
        'DESCRIBE promoter_convidados'
      );
      
      console.log('\n📊 Estrutura da tabela:');
      console.table(columns.map(col => ({
        Campo: col.Field,
        Tipo: col.Type,
        Null: col.Null,
        Key: col.Key,
        Default: col.Default
      })));
    } else {
      console.error('❌ ERRO: Tabela não foi criada!');
    }
    
  } catch (error) {
    console.error('❌ Erro ao executar migration:', error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

runMigration();






