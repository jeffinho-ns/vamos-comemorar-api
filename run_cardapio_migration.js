const fs = require('fs');
const path = require('path');
const pool = require('./config/database');

async function runCardapioMigration() {
  try {
    console.log('🚀 Iniciando migração da tabela cardapio_images...');
    
    // Ler o arquivo SQL
    const sqlFile = path.join(__dirname, 'migrations', 'create_cardapio_images_table.sql');
    const sql = fs.readFileSync(sqlFile, 'utf8');
    
    // Dividir o SQL em comandos separados
    const commands = sql.split(';').filter(cmd => cmd.trim());
    
    // Executar cada comando
    for (let i = 0; i < commands.length; i++) {
      const command = commands[i].trim();
      if (command) {
        console.log(`📝 Executando comando ${i + 1}/${commands.length}...`);
        await pool.execute(command);
      }
    }
    
    console.log('✅ Migração concluída com sucesso!');
    console.log('📋 Tabela cardapio_images criada/atualizada');
    
    // Verificar se a tabela foi criada
    const [rows] = await pool.execute('SHOW TABLES LIKE "cardapio_images"');
    if (rows.length > 0) {
      console.log('✅ Tabela cardapio_images existe no banco de dados');
      
      // Verificar estrutura da tabela
      const [columns] = await pool.execute('DESCRIBE cardapio_images');
      console.log('📊 Estrutura da tabela:');
      columns.forEach(col => {
        console.log(`  - ${col.Field}: ${col.Type} ${col.Null === 'NO' ? 'NOT NULL' : 'NULL'}`);
      });
      
      // Contar registros
      const [count] = await pool.execute('SELECT COUNT(*) as total FROM cardapio_images');
      console.log(`📈 Total de registros: ${count[0].total}`);
      
    } else {
      console.log('❌ Erro: Tabela não foi criada');
    }
    
  } catch (error) {
    console.error('❌ Erro na migração:', error);
  } finally {
    process.exit(0);
  }
}

// Executar migração
runCardapioMigration(); 