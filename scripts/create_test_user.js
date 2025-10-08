const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');

const pool = mysql.createPool({
  host: '193.203.175.55',
  user: 'u621081794_vamos',
  password: '@123Mudar!@',
  database: 'u621081794_vamos',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

async function createTestUser() {
  const connection = await pool.getConnection();
  
  try {
    console.log('🔧 Criando usuário de teste...');
    
    // Verificar se usuário já existe
    const [existingUsers] = await connection.query(`
      SELECT id, email FROM users WHERE email = ?
    `, ['admin@teste.com']);
    
    if (existingUsers.length > 0) {
      console.log('ℹ️ Usuário já existe:', existingUsers[0]);
      
      // Atualizar senha para garantir que está correta
      const hashedPassword = await bcrypt.hash('123456', 10);
      await connection.query(`
        UPDATE users 
        SET password = ?, name = 'Admin Teste', role = 'admin'
        WHERE email = ?
      `, [hashedPassword, 'admin@teste.com']);
      
      console.log('✅ Senha do usuário atualizada');
    } else {
      // Criar novo usuário
      const hashedPassword = await bcrypt.hash('123456', 10);
      const [result] = await connection.query(`
        INSERT INTO users (name, email, password, role, created_at) 
        VALUES (?, ?, ?, ?, NOW())
      `, ['Admin Teste', 'admin@teste.com', hashedPassword, 'admin']);
      
      console.log('✅ Usuário criado com ID:', result.insertId);
    }
    
    // Testar login
    console.log('\n🔍 Testando login...');
    const [users] = await connection.query(`
      SELECT id, name, email, password, role FROM users WHERE email = ?
    `, ['admin@teste.com']);
    
    if (users.length > 0) {
      const user = users[0];
      console.log('📋 Dados do usuário:');
      console.log(`   ID: ${user.id}`);
      console.log(`   Nome: ${user.name}`);
      console.log(`   Email: ${user.email}`);
      console.log(`   Role: ${user.role}`);
      
      // Verificar se a senha está correta
      const passwordMatch = await bcrypt.compare('123456', user.password);
      console.log(`   Senha válida: ${passwordMatch ? '✅' : '❌'}`);
    }
    
  } catch (error) {
    console.error('❌ Erro:', error);
  } finally {
    connection.release();
    await pool.end();
  }
}

createTestUser();