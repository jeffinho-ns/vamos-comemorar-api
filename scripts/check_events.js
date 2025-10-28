const mysql = require('mysql2/promise');

// Configuração do banco de dados
const dbConfig = {
  host: '193.203.175.55',
  user: 'u621081794_vamos',
  password: '@123Mudar!@',
  database: 'u621081794_vamos'
};

async function checkEvents() {
  let connection;
  
  try {
    console.log('🔍 Verificando eventos disponíveis...');
    connection = await mysql.createConnection(dbConfig);
    
    const [events] = await connection.execute(`
      SELECT id, nome_do_evento, data_do_evento, casa_do_evento 
      FROM eventos 
      ORDER BY id 
      LIMIT 10
    `);
    
    console.log(`📋 Eventos encontrados: ${events.length}`);
    events.forEach(event => {
      console.log(`  - ID: ${event.id}, Nome: ${event.nome_do_evento}, Data: ${event.data_do_evento}, Casa: ${event.casa_do_evento}`);
    });
    
    if (events.length === 0) {
      console.log('\n🔧 Criando evento de teste...');
      
      await connection.execute(`
        INSERT INTO eventos (
          casa_do_evento, nome_do_evento, data_do_evento, hora_do_evento,
          local_do_evento, categoria, mesas, valor_da_mesa, brinde,
          numero_de_convidados, descricao, valor_da_entrada, observacao,
          tipo_evento, dia_da_semana, id_place, criado_por
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        'High Line',
        'Evento de Teste',
        '2024-12-31',
        '20:00:00',
        'High Line - Vila Madalena',
        'Festa',
        10,
        0.00,
        'Teste',
        100,
        'Evento de teste para reservas de camarotes',
        50.00,
        'Evento criado automaticamente',
        'Festa',
        'Terça',
        7, // ID do High Line
        68 // ID do usuário admin
      ]);
      
      console.log('✅ Evento de teste criado!');
    }
    
  } catch (error) {
    console.error('❌ Erro:', error);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

checkEvents();











