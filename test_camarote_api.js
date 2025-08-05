const mysql = require('mysql2/promise');

// Configuração do banco de dados
const dbConfig = {
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'u621081794_vamos'
};

async function testCamaroteAPI() {
  const connection = await mysql.createConnection(dbConfig);
  
  try {
    console.log('🔍 Testando estrutura da tabela reservas_camarote...');
    
    // Verificar se a tabela existe
    const [tables] = await connection.execute('SHOW TABLES LIKE "reservas_camarote"');
    if (tables.length === 0) {
      console.error('❌ Tabela reservas_camarote não existe!');
      return;
    }
    console.log('✅ Tabela reservas_camarote existe');
    
    // Verificar estrutura da tabela
    const [columns] = await connection.execute('DESCRIBE reservas_camarote');
    console.log('📋 Estrutura da tabela:');
    columns.forEach(col => {
      console.log(`  - ${col.Field}: ${col.Type} ${col.Null === 'YES' ? '(NULL)' : '(NOT NULL)'} ${col.Default ? `DEFAULT ${col.Default}` : ''}`);
    });
    
    // Verificar se há camarotes disponíveis
    const [camarotes] = await connection.execute('SELECT * FROM camarotes LIMIT 5');
    console.log(`\n🎯 Camarotes disponíveis: ${camarotes.length}`);
    camarotes.forEach(c => {
      console.log(`  - ID: ${c.id}, Nome: ${c.nome_camarote}, Status: ${c.status}`);
    });
    
    // Testar inserção de dados
    console.log('\n🧪 Testando inserção de dados...');
    const testData = {
      id_camarote: camarotes[0]?.id || 1,
      id_evento: null,
      nome_cliente: 'Teste API',
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

testCamaroteAPI(); 