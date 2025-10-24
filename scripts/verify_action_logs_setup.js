// Script para verificar se o sistema de logs está configurado corretamente
const mysql = require('mysql2/promise');

const dbConfig = {
  host: '193.203.175.55',
  user: 'u621081794_vamos',
  password: '@123Mudar!@',
  database: 'u621081794_vamos'
};

async function verifySetup() {
  let connection;
  
  try {
    console.log('🔗 Conectando ao banco de dados...\n');
    connection = await mysql.createConnection(dbConfig);
    
    // 1. Verificar se a tabela action_logs existe
    console.log('📋 Verificando tabela action_logs...');
    const [tables] = await connection.execute(`
      SHOW TABLES LIKE 'action_logs'
    `);
    
    if (tables.length === 0) {
      console.log('❌ Tabela action_logs NÃO EXISTE!');
      console.log('   Execute: node scripts/run_action_logs_migration.js\n');
      return;
    }
    
    console.log('✅ Tabela action_logs existe!\n');
    
    // 2. Verificar estrutura da tabela
    console.log('📊 Estrutura da tabela:');
    const [columns] = await connection.execute(`DESCRIBE action_logs`);
    columns.forEach(col => {
      console.log(`   - ${col.Field} (${col.Type})`);
    });
    console.log('');
    
    // 3. Verificar se há dados
    const [countResult] = await connection.execute(`
      SELECT COUNT(*) as total FROM action_logs
    `);
    console.log(`📈 Total de logs registrados: ${countResult[0].total}\n`);
    
    // 4. Mostrar últimos 5 logs (se houver)
    if (countResult[0].total > 0) {
      console.log('📝 Últimos 5 logs:');
      const [recentLogs] = await connection.execute(`
        SELECT id, user_name, user_role, action_type, created_at 
        FROM action_logs 
        ORDER BY created_at DESC 
        LIMIT 5
      `);
      
      recentLogs.forEach(log => {
        console.log(`   ${log.id} - ${log.user_name} (${log.user_role}) - ${log.action_type} - ${log.created_at}`);
      });
      console.log('');
    }
    
    console.log('✅ Sistema de logs configurado corretamente!\n');
    console.log('🌐 Rota da API: /api/action-logs');
    console.log('🔑 Acesso: Apenas admin');
    console.log('📍 URL completa: https://vamos-comemorar-api.onrender.com/api/action-logs\n');
    
  } catch (error) {
    console.error('❌ Erro:', error.message);
  } finally {
    if (connection) {
      await connection.end();
    }
    console.log('🔐 Conexão encerrada.');
  }
}

verifySetup();






