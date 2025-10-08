const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');

// Configuração do banco de dados
const dbConfig = {
  host: '193.203.175.55',
  user: 'u621081794_vamos',
  password: '@123Mudar!@',
  database: 'u621081794_vamos'
};

async function createTestUser() {
  let connection;
  
  try {
    console.log('🔧 Criando usuário de teste...');
    connection = await mysql.createConnection(dbConfig);
    
    // Verificar se o usuário já existe
    const [existingUsers] = await connection.execute(`
      SELECT id FROM users WHERE email = 'admin@teste.com'
    `);
    
    if (existingUsers.length > 0) {
      console.log('✅ Usuário de teste já existe!');
      
      // Atualizar senha para garantir que seja conhecida
      const hashedPassword = await bcrypt.hash('123456', 10);
      await connection.execute(`
        UPDATE users 
        SET password = ?, role = 'admin' 
        WHERE email = 'admin@teste.com'
      `, [hashedPassword]);
      
      console.log('✅ Senha atualizada para: 123456');
    } else {
      // Criar novo usuário de teste
      const hashedPassword = await bcrypt.hash('123456', 10);
      
      await connection.execute(`
        INSERT INTO users (
          name, email, cpf, password, telefone, role, 
          sexo, data_nascimento, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
      `, [
        'Admin Teste',
        'admin@teste.com',
        '123.456.789-00',
        hashedPassword,
        '11999999999',
        'admin',
        'Masculino',
        '1990-01-01'
      ]);
      
      console.log('✅ Usuário de teste criado!');
      console.log('📧 Email: admin@teste.com');
      console.log('🔑 Senha: 123456');
    }
    
    // Testar login
    console.log('\n🔍 Testando login...');
    const [users] = await connection.execute(`
      SELECT id, name, email, role FROM users WHERE email = 'admin@teste.com'
    `);
    
    if (users.length > 0) {
      const user = users[0];
      console.log(`✅ Usuário encontrado: ${user.name} (ID: ${user.id}, Role: ${user.role})`);
    }
    
  } catch (error) {
    console.error('❌ Erro:', error);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

createTestUser();
