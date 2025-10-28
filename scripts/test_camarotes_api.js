const mysql = require('mysql2/promise');

// Configuração do banco de dados
const dbConfig = {
  host: '193.203.175.55',
  user: 'u621081794_vamos',
  password: '@123Mudar!@',
  database: 'u621081794_vamos'
};

async function testCamarotesAPI() {
  let connection;
  
  try {
    console.log('🔗 Conectando ao banco de dados...');
    connection = await mysql.createConnection(dbConfig);
    console.log('✅ Conectado com sucesso!');
    
    // Testar endpoint GET /api/reservas/camarotes/:id_place
    console.log('🔍 Testando consulta de camarotes para High Line (id_place = 7)...');
    
    const [camarotes] = await connection.execute(`
      SELECT 
          c.id, 
          c.nome_camarote, 
          c.capacidade_maxima, 
          c.status,
          rc.id AS reserva_camarote_id,
          rc.nome_cliente,
          rc.entradas_unisex_free,
          rc.entradas_masculino_free,
          rc.entradas_feminino_free,
          rc.valor_camarote,
          rc.valor_consumacao,
          rc.valor_pago,
          rc.status_reserva
      FROM camarotes c
      LEFT JOIN reservas_camarote rc ON c.id = rc.id_camarote AND rc.status_reserva != 'disponivel'
      WHERE c.id_place = ?
      ORDER BY c.nome_camarote
    `, [7]);
    
    console.log('📋 Camarotes encontrados para High Line:');
    camarotes.forEach((camarote, index) => {
      console.log(`  ${index + 1}. ${camarote.nome_camarote} (Capacidade: ${camarote.capacidade_maxima}, Status: ${camarote.status})`);
    });
    
    console.log(`\n📊 Total: ${camarotes.length} camarotes`);
    
    // Testar outros estabelecimentos
    console.log('\n🔍 Testando outros estabelecimentos...');
    
    const establishments = [
      { id: 1, name: 'Seu Justino' },
      { id: 4, name: 'Oh Freguês' },
      { id: 8, name: 'Pracinha do Seu Justino' }
    ];
    
    for (const establishment of establishments) {
      const [estCamarotes] = await connection.execute(`
        SELECT COUNT(*) as total FROM camarotes WHERE id_place = ?
      `, [establishment.id]);
      
      console.log(`  - ${establishment.name}: ${estCamarotes[0].total} camarotes`);
    }
    
  } catch (error) {
    console.error('❌ Erro ao testar API:', error);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
      console.log('\n🔗 Conexão encerrada');
    }
  }
}

testCamarotesAPI();













