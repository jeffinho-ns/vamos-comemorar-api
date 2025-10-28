const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

// Configuração do banco
const dbConfig = {
  host: process.env.DB_HOST || 'sql11.freemysqlhosting.net',
  user: process.env.DB_USER || 'u621081794_vamos',
  password: process.env.DB_PASSWORD || 'VamosComemorar2024!',
  database: process.env.DB_NAME || 'u621081794_vamos',
  port: process.env.DB_PORT || 3306,
  charset: 'utf8mb4'
};

async function runMigration() {
  let connection;
  
  try {
    console.log('🚀 INICIANDO MIGRAÇÃO: promoter_eventos');
    console.log('=====================================');
    
    // Conectar ao banco
    console.log('1️⃣ Conectando ao banco de dados...');
    connection = await mysql.createConnection(dbConfig);
    console.log('✅ Conexão estabelecida');
    
    // Ler arquivo SQL
    console.log('2️⃣ Lendo arquivo de migração...');
    const sqlFile = path.join(__dirname, 'create_promoter_eventos_table.sql');
    const sqlContent = fs.readFileSync(sqlFile, 'utf8');
    console.log('✅ Arquivo lido com sucesso');
    
    // Executar migração
    console.log('3️⃣ Executando migração...');
    const statements = sqlContent.split(';').filter(stmt => stmt.trim());
    
    for (const statement of statements) {
      if (statement.trim()) {
        await connection.execute(statement);
        console.log('✅ Statement executado');
      }
    }
    
    console.log('4️⃣ Verificando resultado...');
    
    // Verificar se tabela foi criada
    const [tables] = await connection.execute(
      "SHOW TABLES LIKE 'promoter_eventos'"
    );
    
    if (tables.length > 0) {
      console.log('✅ Tabela promoter_eventos criada com sucesso!');
      
      // Verificar estrutura
      const [structure] = await connection.execute(
        "DESCRIBE promoter_eventos"
      );
      console.log('📋 Estrutura da tabela:');
      structure.forEach(col => {
        console.log(`   - ${col.Field}: ${col.Type} ${col.Null === 'NO' ? 'NOT NULL' : 'NULL'}`);
      });
      
      // Verificar dados migrados
      const [count] = await connection.execute(
        "SELECT COUNT(*) as total FROM promoter_eventos"
      );
      console.log(`📊 Total de relacionamentos criados: ${count[0].total}`);
      
      // Mostrar alguns exemplos
      const [examples] = await connection.execute(`
        SELECT 
          pe.id,
          p.nome as promoter_nome,
          e.nome_do_evento as evento_nome,
          pe.data_evento,
          pe.funcao,
          pe.status
        FROM promoter_eventos pe
        JOIN promoters p ON pe.promoter_id = p.promoter_id
        JOIN eventos e ON pe.evento_id = e.id
        ORDER BY pe.created_at DESC
        LIMIT 5
      `);
      
      if (examples.length > 0) {
        console.log('📋 Exemplos de relacionamentos criados:');
        examples.forEach(ex => {
          console.log(`   - ${ex.promoter_nome} → ${ex.evento_nome} (${ex.data_evento}) [${ex.funcao}]`);
        });
      }
      
    } else {
      console.log('❌ Erro: Tabela não foi criada');
    }
    
    console.log('=====================================');
    console.log('🎉 MIGRAÇÃO CONCLUÍDA COM SUCESSO!');
    
  } catch (error) {
    console.error('❌ ERRO na migração:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
      console.log('🔌 Conexão encerrada');
    }
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  runMigration();
}

module.exports = runMigration;


