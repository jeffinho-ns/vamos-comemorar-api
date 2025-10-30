const mysql = require('mysql2/promise');

// Configuração do banco
const dbConfig = {
  host: process.env.DB_HOST || 'sql11.freemysqlhosting.net',
  user: process.env.DB_USER || 'u621081794_vamos',
  password: process.env.DB_PASSWORD || 'VamosComemorar2024!',
  database: process.env.DB_NAME || 'u621081794_vamos',
  port: process.env.DB_PORT || 3306,
  charset: 'utf8mb4'
};

async function checkTable() {
  let connection;
  
  try {
    console.log('🔍 VERIFICANDO TABELA PROMOTER_EVENTOS');
    console.log('=====================================');
    
    // Conectar ao banco
    console.log('1️⃣ Conectando ao banco de dados...');
    connection = await mysql.createConnection(dbConfig);
    console.log('✅ Conexão estabelecida');
    
    // Verificar se tabela existe
    console.log('2️⃣ Verificando se tabela promoter_eventos existe...');
    const [tables] = await connection.execute(
      "SHOW TABLES LIKE 'promoter_eventos'"
    );
    
    if (tables.length === 0) {
      console.log('❌ Tabela promoter_eventos NÃO existe!');
      console.log('📋 Executando criação da tabela...');
      
      // Criar tabela
      const createTableSQL = `
        CREATE TABLE IF NOT EXISTS \`promoter_eventos\` (
          \`id\` INT(11) NOT NULL AUTO_INCREMENT,
          \`promoter_id\` INT(11) NOT NULL,
          \`evento_id\` INT(11) NOT NULL,
          \`data_evento\` DATE NOT NULL COMMENT 'Data específica do evento (para eventos semanais)',
          \`status\` ENUM('ativo', 'inativo', 'cancelado') DEFAULT 'ativo',
          \`funcao\` ENUM('responsavel', 'co-promoter', 'backup') DEFAULT 'responsavel',
          \`observacoes\` TEXT DEFAULT NULL,
          \`created_at\` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
          \`updated_at\` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`),
          UNIQUE KEY \`unique_promoter_evento_data\` (\`promoter_id\`, \`evento_id\`, \`data_evento\`),
          INDEX \`idx_promoter_id\` (\`promoter_id\`),
          INDEX \`idx_evento_id\` (\`evento_id\`),
          INDEX \`idx_data_evento\` (\`data_evento\`),
          INDEX \`idx_status\` (\`status\`),
          FOREIGN KEY (\`promoter_id\`) REFERENCES \`promoters\`(\`promoter_id\`) ON DELETE CASCADE,
          FOREIGN KEY (\`evento_id\`) REFERENCES \`eventos\`(\`id\`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        COMMENT='Relacionamento entre promoters e eventos com suporte a múltiplos promoters por evento';
      `;
      
      await connection.execute(createTableSQL);
      console.log('✅ Tabela promoter_eventos criada com sucesso!');
      
    } else {
      console.log('✅ Tabela promoter_eventos existe!');
    }
    
    // Verificar estrutura da tabela
    console.log('3️⃣ Verificando estrutura da tabela...');
    const [structure] = await connection.execute(
      "DESCRIBE promoter_eventos"
    );
    console.log('📋 Estrutura da tabela:');
    structure.forEach(col => {
      console.log(`   - ${col.Field}: ${col.Type} ${col.Null === 'NO' ? 'NOT NULL' : 'NULL'}`);
    });
    
    // Verificar dados existentes
    console.log('4️⃣ Verificando dados existentes...');
    const [count] = await connection.execute(
      "SELECT COUNT(*) as total FROM promoter_eventos"
    );
    console.log(`📊 Total de relacionamentos: ${count[0].total}`);
    
    // Verificar promoters disponíveis
    console.log('5️⃣ Verificando promoters disponíveis...');
    const [promoters] = await connection.execute(
      "SELECT promoter_id, nome, status, ativo FROM promoters WHERE ativo = TRUE LIMIT 5"
    );
    console.log(`📋 Promoters ativos encontrados: ${promoters.length}`);
    promoters.forEach(p => {
      console.log(`   - ID ${p.promoter_id}: ${p.nome} (status: ${p.status}, ativo: ${p.ativo})`);
    });
    
    // Verificar eventos disponíveis
    console.log('6️⃣ Verificando eventos disponíveis...');
    const [eventos] = await connection.execute(
      "SELECT id, nome_do_evento, tipo_evento FROM eventos LIMIT 5"
    );
    console.log(`📋 Eventos encontrados: ${eventos.length}`);
    eventos.forEach(e => {
      console.log(`   - ID ${e.id}: ${e.nome_do_evento} (tipo: ${e.tipo_evento})`);
    });
    
    console.log('=====================================');
    console.log('🎉 VERIFICAÇÃO CONCLUÍDA!');
    
  } catch (error) {
    console.error('❌ ERRO na verificação:', error.message);
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
  checkTable();
}

module.exports = checkTable;






