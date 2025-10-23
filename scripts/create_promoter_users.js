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

// Lista de promoters a serem criados
const promoters = [
  {
    name: 'Regiane Brunno',
    email: 'regianebrunno@gmail.com',
    password: 'Promoter@2024' // Senha padrão - deve ser alterada após o primeiro login
  },
  {
    name: 'Franciely Mendes',
    email: 'franciely.mendes@ideiaum.com.br',
    password: 'Promoter@2024'
  },
  {
    name: 'Coordenadora Reservas',
    email: 'coordenadora.reservas@ideiaum.com.br',
    password: 'Promoter@2024'
  }
];

async function createPromoterUsers() {
  const connection = await pool.getConnection();
  
  try {
    console.log('🔧 Iniciando criação de usuários promoters...\n');
    
    for (const promoter of promoters) {
      console.log(`📋 Processando: ${promoter.email}`);
      
      // Verificar se usuário já existe
      const [existingUsers] = await connection.query(`
        SELECT id, email, role FROM users WHERE email = ?
      `, [promoter.email]);
      
      if (existingUsers.length > 0) {
        console.log(`ℹ️  Usuário já existe: ${existingUsers[0].email} (Role: ${existingUsers[0].role})`);
        
        // Atualizar para garantir que está como promoter e atualizar senha
        const hashedPassword = await bcrypt.hash(promoter.password, 10);
        await connection.query(`
          UPDATE users 
          SET password = ?, name = ?, role = 'promoter'
          WHERE email = ?
        `, [hashedPassword, promoter.name, promoter.email]);
        
        console.log(`✅ Usuário atualizado para role 'promoter' e senha redefinida`);
      } else {
        // Criar novo usuário
        const hashedPassword = await bcrypt.hash(promoter.password, 10);
        const [result] = await connection.query(`
          INSERT INTO users (name, email, password, role, created_at) 
          VALUES (?, ?, ?, 'promoter', NOW())
        `, [promoter.name, promoter.email, hashedPassword]);
        
        console.log(`✅ Usuário criado com sucesso! ID: ${result.insertId}`);
      }
      
      console.log(''); // Linha em branco para melhor legibilidade
    }
    
    // Listar todos os usuários promoters
    console.log('\n📊 Resumo - Todos os usuários com role "promoter":');
    console.log('─'.repeat(80));
    const [allPromoters] = await connection.query(`
      SELECT id, name, email, role, created_at FROM users WHERE role = 'promoter'
    `);
    
    if (allPromoters.length > 0) {
      allPromoters.forEach(user => {
        console.log(`ID: ${user.id} | Nome: ${user.name} | Email: ${user.email} | Criado em: ${user.created_at}`);
      });
    } else {
      console.log('Nenhum promoter encontrado.');
    }
    console.log('─'.repeat(80));
    
    console.log('\n✨ Processo concluído!');
    console.log('\n📝 IMPORTANTE: A senha padrão para todos os usuários é: Promoter@2024');
    console.log('   Recomenda-se que os usuários alterem a senha no primeiro acesso.\n');
    
  } catch (error) {
    console.error('❌ Erro ao criar usuários promoters:', error);
  } finally {
    connection.release();
    await pool.end();
  }
}

createPromoterUsers();





