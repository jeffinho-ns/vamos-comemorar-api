const mysql = require('mysql2/promise');

// Configuração do banco de dados
const dbConfig = {
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'u621081794_vamos'
};

async function debugCamarote101() {
  const connection = await mysql.createConnection(dbConfig);
  
  try {
    console.log('🔍 Verificando camarote ID 101...\n');
    
    // Verificar se o camarote existe
    const [camarotes] = await connection.execute('SELECT * FROM camarotes WHERE id = ?', [101]);
    
    if (camarotes.length === 0) {
      console.log('❌ Camarote ID 101 NÃO EXISTE!');
      
      // Listar camarotes disponíveis
      const [allCamarotes] = await connection.execute('SELECT id, nome_camarote, id_place FROM camarotes ORDER BY id');
      console.log('\n📋 Camarotes disponíveis:');
      allCamarotes.forEach(c => {
        console.log(`  - ID: ${c.id}, Nome: ${c.nome_camarote}, Place: ${c.id_place}`);
      });
      
      return;
    }
    
    console.log('✅ Camarote ID 101 EXISTE:');
    console.log('📋 Dados do camarote:', camarotes[0]);
    
    // Verificar se há reservas para este camarote
    const [reservas] = await connection.execute('SELECT * FROM reservas_camarote WHERE id_camarote = ?', [101]);
    console.log(`\n📊 Reservas para camarote 101: ${reservas.length}`);
    
    // Testar inserção com dados reais
    console.log('\n🧪 Testando inserção com dados reais...');
    const testData = {
      id_camarote: 101,
      id_evento: null,
      nome_cliente: 'JEFFERSON TEIXEIRA DE LIMA',
      telefone: '11999999999',
      cpf_cnpj: '12345678901',
      email: 'teste@teste.com',
      data_nascimento: null,
      maximo_pessoas: 10,
      entradas_unisex_free: 0,
      entradas_masculino_free: 0,
      entradas_feminino_free: 0,
      valor_camarote: 100.00,
      valor_consumacao: 50.00,
      valor_pago: 0.00,
      valor_sinal: 0.00,
      prazo_sinal_dias: 0,
      solicitado_por: 'Admin',
      observacao: 'Teste via script',
      status_reserva: 'reservado',
      tag: '',
      hora_reserva: null
    };
    
    console.log('📤 Dados de teste:', testData);
    
    // Tentar inserir na tabela reservas primeiro
    console.log('\n📝 Inserindo na tabela reservas...');
    const [reservaResult] = await connection.execute(
      'INSERT INTO reservas (user_id, evento_id, tipo_reserva, nome_lista, data_reserva, quantidade_convidados, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [1, testData.id_evento, 'CAMAROTE', testData.nome_cliente, new Date(), testData.maximo_pessoas, 'ATIVA']
    );
    const reservaId = reservaResult.insertId;
    console.log(`✅ Reserva criada com ID: ${reservaId}`);
    
    // Tentar inserir na tabela reservas_camarote
    console.log('\n📝 Inserindo na tabela reservas_camarote...');
    const [camaroteResult] = await connection.execute(
      `INSERT INTO reservas_camarote (
        id_reserva, id_camarote, nome_cliente, telefone, cpf_cnpj, email, data_nascimento,
        maximo_pessoas, entradas_unisex_free, entradas_masculino_free, entradas_feminino_free,
        valor_camarote, valor_consumacao, valor_pago, valor_sinal, prazo_sinal_dias,
        solicitado_por, observacao, status_reserva, tag, hora_reserva
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        reservaId, testData.id_camarote, testData.nome_cliente, testData.telefone, testData.cpf_cnpj, testData.email, testData.data_nascimento,
        testData.maximo_pessoas, testData.entradas_unisex_free, testData.entradas_masculino_free, testData.entradas_feminino_free,
        testData.valor_camarote, testData.valor_consumacao, testData.valor_pago, testData.valor_sinal, testData.prazo_sinal_dias,
        testData.solicitado_por, testData.observacao, testData.status_reserva, testData.tag, testData.hora_reserva
      ]
    );
    console.log(`✅ Reserva de camarote criada com ID: ${camaroteResult.insertId}`);
    
    // Limpar dados de teste
    console.log('\n🧹 Limpando dados de teste...');
    await connection.execute('DELETE FROM reservas_camarote WHERE id = ?', [camaroteResult.insertId]);
    await connection.execute('DELETE FROM reservas WHERE id = ?', [reservaId]);
    console.log('✅ Dados de teste removidos');
    
  } catch (error) {
    console.error('❌ Erro durante o teste:', error);
    console.error('Stack trace:', error.stack);
  } finally {
    await connection.end();
  }
}

debugCamarote101(); 