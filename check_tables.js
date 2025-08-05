const mysql = require('mysql2/promise');

// Configuração do banco de produção (substitua pelos dados corretos)
const dbConfig = {
  host: 'localhost', // ou seu host de produção
  user: 'root', // seu usuário
  password: '', // sua senha
  database: 'u621081794_vamos' // seu banco
};

async function checkTables() {
  const connection = await mysql.createConnection(dbConfig);
  
  try {
    console.log('🔍 Verificando tabelas no banco de dados...\n');
    
    // Listar todas as tabelas
    const [tables] = await connection.execute('SHOW TABLES');
    console.log('📋 Tabelas existentes:');
    tables.forEach(table => {
      const tableName = Object.values(table)[0];
      console.log(`  - ${tableName}`);
    });
    
    // Verificar tabelas específicas
    const requiredTables = [
      'reservas_camarote',
      'camarotes', 
      'reservas',
      'camarote_convidados'
    ];
    
    console.log('\n🎯 Verificando tabelas necessárias:');
    for (const tableName of requiredTables) {
      const [exists] = await connection.execute('SHOW TABLES LIKE ?', [tableName]);
      if (exists.length > 0) {
        console.log(`  ✅ ${tableName} - EXISTE`);
        
        // Verificar estrutura
        const [columns] = await connection.execute('DESCRIBE ??', [tableName]);
        console.log(`    📊 Colunas: ${columns.length}`);
      } else {
        console.log(`  ❌ ${tableName} - NÃO EXISTE`);
      }
    }
    
    // Verificar se há dados nas tabelas
    console.log('\n📊 Verificando dados nas tabelas:');
    
    const [camarotesCount] = await connection.execute('SELECT COUNT(*) as count FROM camarotes');
    console.log(`  - Camarotes: ${camarotesCount[0].count} registros`);
    
    const [reservasCount] = await connection.execute('SELECT COUNT(*) as count FROM reservas');
    console.log(`  - Reservas: ${reservasCount[0].count} registros`);
    
    const [reservasCamaroteCount] = await connection.execute('SELECT COUNT(*) as count FROM reservas_camarote');
    console.log(`  - Reservas Camarote: ${reservasCamaroteCount[0].count} registros`);
    
    // Testar inserção simples
    console.log('\n🧪 Testando inserção na tabela reservas...');
    try {
      const [result] = await connection.execute(
        'INSERT INTO reservas (user_id, tipo_reserva, nome_lista, data_reserva, quantidade_convidados, status) VALUES (?, ?, ?, ?, ?, ?)',
        [1, 'TESTE', 'Teste API', new Date(), 5, 'ATIVA']
      );
      console.log(`  ✅ Inserção na tabela reservas: OK (ID: ${result.insertId})`);
      
      // Limpar teste
      await connection.execute('DELETE FROM reservas WHERE id = ?', [result.insertId]);
      console.log('  🧹 Teste removido');
      
    } catch (error) {
      console.error(`  ❌ Erro na inserção na tabela reservas:`, error.message);
    }
    
  } catch (error) {
    console.error('❌ Erro ao conectar/verificar banco:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    await connection.end();
  }
}

checkTables(); 