// Script para executar a migração de correção de id_place dos eventos
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

async function runMigration() {
  let connection;
  
  try {
    // Configuração do banco de dados - usando variáveis de ambiente ou valores do database.js
    const dbConfig = {
      host: process.env.DB_HOST || '193.203.175.55',
      user: process.env.DB_USER || 'u621081794_vamos',
      password: process.env.DB_PASSWORD || '@123Mudar!@',
      database: process.env.DB_NAME || 'u621081794_vamos',
      multipleStatements: true // Importante para executar múltiplos comandos SQL
    };

    console.log('🔗 Conectando ao banco de dados...');
    connection = await mysql.createConnection(dbConfig);
    console.log('✅ Conectado ao banco de dados');

    // Ler o arquivo de migração
    const migrationPath = path.join(__dirname, '../migrations/habilitar-eventos-para-listas.sql');
    
    if (!fs.existsSync(migrationPath)) {
      throw new Error(`Arquivo de migração não encontrado: ${migrationPath}`);
    }
    
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    console.log('📝 Arquivo de migração carregado');

    console.log('🚀 Executando migração...');
    console.log('   - Corrigindo id_place dos eventos');
    console.log('   - Vinculando eventos ao HighLine (id_place = 7)');
    console.log('   - Habilitando listas para eventos do HighLine');
    console.log('   - Criando Lista da Casa para eventos sem listas');
    
    // Executar a migração
    await connection.query(migrationSQL);
    
    console.log('✅ Migração executada com sucesso!');
    
    // Verificar resultados
    console.log('\n📊 Verificando resultados...');
    
    // Verificar eventos do HighLine
    const [eventosHighLine] = await connection.execute(`
      SELECT 
        e.id,
        e.nome_do_evento,
        e.casa_do_evento,
        e.id_place,
        COALESCE(p.name, b.name) as establishment_name,
        e.usado_para_listas
      FROM eventos e
      LEFT JOIN places p ON e.id_place = p.id
      LEFT JOIN bars b ON e.id_place = b.id
      WHERE e.id_place = 7
      ORDER BY e.id
    `);
    
    console.log(`\n✅ Eventos do HighLine encontrados: ${eventosHighLine.length}`);
    eventosHighLine.forEach(e => {
      console.log(`   - Evento ${e.id}: ${e.nome_do_evento} (id_place: ${e.id_place}, usado_para_listas: ${e.usado_para_listas})`);
    });
    
    // Verificar listas criadas
    const [listas] = await connection.execute(`
      SELECT 
        l.lista_id,
        l.evento_id,
        e.nome_do_evento,
        l.nome,
        l.tipo,
        COUNT(lc.lista_convidado_id) as total_convidados
      FROM listas l
      JOIN eventos e ON l.evento_id = e.id
      LEFT JOIN listas_convidados lc ON l.lista_id = lc.lista_id
      WHERE e.id_place = 7
      GROUP BY l.lista_id
      ORDER BY l.evento_id
    `);
    
    console.log(`\n✅ Listas criadas para eventos do HighLine: ${listas.length}`);
    listas.forEach(l => {
      console.log(`   - Lista ${l.lista_id} (${l.nome} - ${l.tipo}): Evento ${l.evento_id} - ${l.nome_do_evento} - ${l.total_convidados} convidados`);
    });
    
    console.log('\n🎉 Migração concluída com sucesso!');
    console.log('💡 Agora você pode acessar /admin/checkins e selecionar o HighLine');
    console.log('💡 O evento 28 deve aparecer e mostrar a Lista da Casa');
    
  } catch (error) {
    console.error('\n❌ Erro ao executar migração:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
      console.log('\n🔌 Conexão com banco fechada');
    }
  }
}

// Executar migração
runMigration();

