// Script para verificar o estado do banco de dados remoto
const pool = require('../config/database');

async function checkRemoteDB() {
  console.log('🔍 VERIFICANDO BANCO DE DADOS REMOTO\n');
  console.log('=' .repeat(70));
  
  try {
    // 1. Testar conexão
    console.log('\n1️⃣ Testando conexão com o banco...');
    await pool.execute('SELECT 1');
    console.log('✅ Conexão OK');
    
    // 2. Verificar tabela promoters
    console.log('\n2️⃣ Verificando tabela PROMOTERS...');
    const [promotersExists] = await pool.execute(
      "SELECT COUNT(*) as count FROM information_schema.TABLES WHERE TABLE_NAME = 'promoters' AND TABLE_SCHEMA = DATABASE()"
    );
    
    if (promotersExists[0].count > 0) {
      console.log('✅ Tabela promoters existe');
      
      // Contar promoters
      const [promotersCount] = await pool.execute('SELECT COUNT(*) as total FROM promoters');
      console.log(`   Total de promoters: ${promotersCount[0].total}`);
      
      // Mostrar últimos 3 promoters
      const [lastPromoters] = await pool.execute(
        'SELECT promoter_id, nome, codigo_identificador, ativo, status FROM promoters ORDER BY promoter_id DESC LIMIT 3'
      );
      
      console.log('\n   📋 Últimos promoters cadastrados:');
      lastPromoters.forEach(p => {
        console.log(`   - ID ${p.promoter_id}: ${p.nome} (código: ${p.codigo_identificador || 'NULL'}, status: ${p.status}, ativo: ${p.ativo})`);
      });
    } else {
      console.log('❌ Tabela promoters NÃO existe!');
    }
    
    // 3. Verificar tabela promoter_convidados
    console.log('\n3️⃣ Verificando tabela PROMOTER_CONVIDADOS...');
    const [convidadosExists] = await pool.execute(
      "SELECT COUNT(*) as count FROM information_schema.TABLES WHERE TABLE_NAME = 'promoter_convidados' AND TABLE_SCHEMA = DATABASE()"
    );
    
    if (convidadosExists[0].count > 0) {
      console.log('✅ Tabela promoter_convidados existe');
      
      const [convidadosCount] = await pool.execute('SELECT COUNT(*) as total FROM promoter_convidados');
      console.log(`   Total de convidados: ${convidadosCount[0].total}`);
    } else {
      console.log('❌ Tabela promoter_convidados NÃO existe!');
      console.log('\n   🔧 AÇÃO NECESSÁRIA:');
      console.log('   Execute este SQL no phpMyAdmin:');
      console.log('   (Veja o arquivo migrations/EXECUTE_THIS_FIRST.sql)');
    }
    
    // 4. Verificar tabela places
    console.log('\n4️⃣ Verificando tabela PLACES...');
    const [placesExists] = await pool.execute(
      "SELECT COUNT(*) as count FROM information_schema.TABLES WHERE TABLE_NAME = 'places' AND TABLE_SCHEMA = DATABASE()"
    );
    
    if (placesExists[0].count > 0) {
      console.log('✅ Tabela places existe');
      const [placesCount] = await pool.execute('SELECT COUNT(*) as total FROM places');
      console.log(`   Total de estabelecimentos: ${placesCount[0].total}`);
    } else {
      console.log('❌ Tabela places NÃO existe!');
    }
    
    // 5. Testar query específica de busca de promoter
    if (promotersExists[0].count > 0) {
      console.log('\n5️⃣ Testando QUERY de busca pública...');
      
      const [testPromoter] = await pool.execute(
        'SELECT codigo_identificador FROM promoters WHERE codigo_identificador IS NOT NULL LIMIT 1'
      );
      
      if (testPromoter.length > 0) {
        const testCodigo = testPromoter[0].codigo_identificador;
        console.log(`   Testando com código: ${testCodigo}`);
        
        try {
          const [result] = await pool.execute(
            `SELECT 
              p.promoter_id,
              p.nome,
              p.apelido,
              p.foto_url,
              p.instagram,
              p.observacoes,
              p.status,
              pl.name as establishment_name
             FROM promoters p
             LEFT JOIN places pl ON p.establishment_id = pl.id
             WHERE p.codigo_identificador = ? AND p.ativo = TRUE AND p.status = 'Ativo'
             LIMIT 1`,
            [testCodigo]
          );
          
          if (result.length > 0) {
            console.log('   ✅ Query funcionou! Promoter encontrado:', result[0].nome);
          } else {
            console.log('   ⚠️  Query não retornou resultados');
            console.log('   Verifique se o promoter está ativo e com status "Ativo"');
          }
        } catch (queryError) {
          console.log('   ❌ Erro na query:', queryError.message);
          console.log('   SQL:', queryError.sql);
        }
      }
    }
    
    // 6. Verificar nome do banco
    console.log('\n6️⃣ Informações do banco:');
    const [dbInfo] = await pool.execute('SELECT DATABASE() as db_name, VERSION() as version');
    console.log(`   Nome do banco: ${dbInfo[0].db_name}`);
    console.log(`   Versão MySQL: ${dbInfo[0].version}`);
    
    console.log('\n' + '='.repeat(70));
    console.log('✅ Verificação concluída!\n');
    
  } catch (error) {
    console.error('\n❌ ERRO:', error.message);
    console.error('Stack:', error.stack);
    
    if (error.code === 'PROTOCOL_CONNECTION_LOST') {
      console.error('\n💡 Solução: Conexão perdida. Verifique:');
      console.error('   - Credenciais do banco no arquivo .env');
      console.error('   - Se o banco está online');
    } else if (error.code === 'ER_ACCESS_DENIED_ERROR') {
      console.error('\n💡 Solução: Acesso negado. Verifique:');
      console.error('   - Usuário e senha no arquivo .env');
      console.error('   - Permissões do usuário no banco');
    }
  } finally {
    process.exit(0);
  }
}

checkRemoteDB();

