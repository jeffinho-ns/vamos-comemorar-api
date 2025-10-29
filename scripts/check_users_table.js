const mysql = require('mysql2/promise');

// Configuração do banco de dados
const dbConfig = {
  host: '193.203.175.55',
  user: 'u621081794_vamos',
  password: '@123Mudar!@',
  database: 'u621081794_vamos'
};

async function checkUsersTable() {
  let connection;
  
  try {
    console.log('🔍 Verificando estrutura da tabela de usuários...');
    connection = await mysql.createConnection(dbConfig);
    
    // Verificar estrutura da tabela users
    const [columns] = await connection.execute(`
      DESCRIBE users
    `);
    
    console.log('\n📋 Estrutura da tabela users:');
    columns.forEach(column => {
      console.log(`  - ${column.Field} (${column.Type}) ${column.Null === 'NO' ? 'NOT NULL' : 'NULL'} ${column.Key ? column.Key : ''}`);
    });
    
    // Verificar se há usuários
    const [users] = await connection.execute(`
      SELECT * FROM users LIMIT 3
    `);
    
    console.log(`\n👥 Usuários encontrados: ${users.length}`);
    if (users.length > 0) {
      console.log('\n📋 Primeiro usuário:');
      Object.keys(users[0]).forEach(key => {
        console.log(`  ${key}: ${users[0][key]}`);
      });
    }
    
  } catch (error) {
    console.error('❌ Erro:', error);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

checkUsersTable();














