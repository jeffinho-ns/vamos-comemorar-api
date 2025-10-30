// Script de diagnóstico do sistema de promoters
const pool = require('../config/database');

async function diagnose() {
  try {
    console.log('🔍 DIAGNÓSTICO DO SISTEMA DE PROMOTERS\n');
    console.log('=' .repeat(60));
    
    // 1. Verificar tabela promoters
    console.log('\n1️⃣ Verificando tabela PROMOTERS...');
    const [promotersTable] = await pool.execute("SHOW TABLES LIKE 'promoters'");
    
    if (promotersTable.length === 0) {
      console.log('❌ Tabela promoters NÃO EXISTE!');
      return;
    }
    console.log('✅ Tabela promoters existe');
    
    // Verificar colunas da tabela promoters
    console.log('\n📋 Colunas da tabela promoters:');
    const [promotersColumns] = await pool.execute('DESCRIBE promoters');
    const columnNames = promotersColumns.map(c => c.Field);
    console.log(columnNames.join(', '));
    
    // Verificar colunas necessárias
    const requiredColumns = ['codigo_identificador', 'ativo', 'status'];
    console.log('\n🔍 Verificando colunas obrigatórias:');
    requiredColumns.forEach(col => {
      if (columnNames.includes(col)) {
        console.log(`✅ ${col}`);
      } else {
        console.log(`❌ ${col} - FALTANDO!`);
      }
    });
    
    // 2. Verificar tabela promoter_convidados
    console.log('\n\n2️⃣ Verificando tabela PROMOTER_CONVIDADOS...');
    const [convidadosTable] = await pool.execute("SHOW TABLES LIKE 'promoter_convidados'");
    
    if (convidadosTable.length === 0) {
      console.log('❌ Tabela promoter_convidados NÃO EXISTE!');
      console.log('💡 SOLUÇÃO: Execute o comando:');
      console.log('   npm run migrate-promoter-convidados');
    } else {
      console.log('✅ Tabela promoter_convidados existe');
      
      // Verificar colunas
      const [convidadosColumns] = await pool.execute('DESCRIBE promoter_convidados');
      console.log('\n📋 Colunas da tabela promoter_convidados:');
      console.log(convidadosColumns.map(c => c.Field).join(', '));
    }
    
    // 3. Verificar promoters cadastrados
    console.log('\n\n3️⃣ Verificando PROMOTERS CADASTRADOS...');
    const [promoters] = await pool.execute(
      'SELECT promoter_id, nome, codigo_identificador, link_convite, ativo, status FROM promoters LIMIT 10'
    );
    
    if (promoters.length === 0) {
      console.log('⚠️  Nenhum promoter cadastrado');
    } else {
      console.log(`✅ ${promoters.length} promoter(s) encontrado(s):\n`);
      promoters.forEach(p => {
        console.log(`   ID: ${p.promoter_id}`);
        console.log(`   Nome: ${p.nome}`);
        console.log(`   Código: ${p.codigo_identificador || 'NÃO DEFINIDO'}`);
        console.log(`   Link: ${p.link_convite || 'NÃO DEFINIDO'}`);
        console.log(`   Status: ${p.status} | Ativo: ${p.ativo ? 'SIM' : 'NÃO'}`);
        console.log('   ' + '-'.repeat(50));
      });
    }
    
    // 4. Testar busca pública
    if (promoters.length > 0 && promoters[0].codigo_identificador) {
      console.log('\n\n4️⃣ Testando BUSCA PÚBLICA...');
      const testCodigo = promoters[0].codigo_identificador;
      console.log(`🔍 Testando com código: ${testCodigo}`);
      
      const [testResult] = await pool.execute(
        `SELECT 
          p.promoter_id,
          p.nome,
          p.apelido,
          p.foto_url,
          p.instagram,
          p.observacoes,
          p.status,
          pl.name as establishment_name,
          pl.tipo as establishment_tipo
         FROM promoters p
         LEFT JOIN places pl ON p.establishment_id = pl.id
         WHERE p.codigo_identificador = ? AND p.ativo = TRUE AND p.status = 'Ativo'
         LIMIT 1`,
        [testCodigo]
      );
      
      if (testResult.length > 0) {
        console.log('✅ Busca pública funcionando!');
        console.log('   Promoter encontrado:', testResult[0].nome);
      } else {
        console.log('❌ Busca pública NÃO funcionou!');
        console.log('💡 Verifique se o promoter está ativo e com status "Ativo"');
      }
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('✅ Diagnóstico concluído!\n');
    
  } catch (error) {
    console.error('\n❌ ERRO durante diagnóstico:', error);
    console.error('Stack:', error.stack);
  } finally {
    process.exit(0);
  }
}

diagnose();







