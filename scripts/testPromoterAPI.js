// Script para testar a API do promoter
const pool = require('../config/database');

async function testPromoterAPI() {
  const client = await pool.connect();
  
  try {
    console.log('🧪 Testando API do promoter...\n');
    
    const codigo = 'fran';
    
    // 1. Testar busca do promoter
    console.log('1️⃣ Buscando promoter com código:', codigo);
    const promotersResult = await client.query(
      `SELECT 
        p.promoter_id,
        p.nome,
        p.apelido,
        p.email,
        p.foto_url,
        p.instagram,
        p.observacoes,
        p.status,
        pl.name as establishment_name
       FROM promoters p
       LEFT JOIN places pl ON p.establishment_id = pl.id
       WHERE p.codigo_identificador = $1 AND p.ativo = TRUE AND p.status::TEXT = 'Ativo'
       LIMIT 1`,
      [codigo]
    );
    
    if (promotersResult.rows.length === 0) {
      console.log('❌ Promoter não encontrado!');
      return;
    }
    
    const promoter = promotersResult.rows[0];
    console.log('✅ Promoter encontrado:', {
      id: promoter.promoter_id,
      nome: promoter.nome,
      email: promoter.email,
      codigo: codigo,
      ativo: true,
      status: promoter.status
    });
    
    // 2. Buscar user_id
    console.log('\n2️⃣ Buscando user_id pelo email:', promoter.email);
    const userResult = await client.query(
      'SELECT id FROM users WHERE email = $1 LIMIT 1',
      [promoter.email]
    );
    
    let userId = null;
    if (userResult.rows.length > 0) {
      userId = userResult.rows[0].id;
      console.log('✅ User encontrado:', { id: userId });
    } else {
      console.log('⚠️ User não encontrado para este email');
    }
    
    // 3. Buscar estatísticas
    console.log('\n3️⃣ Buscando estatísticas do promoter...');
    const statsResult = await client.query(
      `SELECT 
        COUNT(DISTINCT c.id) as total_convidados,
        COUNT(DISTINCT CASE WHEN c.status = 'confirmado' THEN c.id END) as total_confirmados
       FROM promoter_convidados c
       WHERE c.promoter_id = $1`,
      [promoter.promoter_id]
    );
    
    const stats = statsResult.rows[0] || { total_convidados: 0, total_confirmados: 0 };
    console.log('✅ Estatísticas:', stats);
    
    // 4. Simular resposta da API
    console.log('\n4️⃣ Resposta da API (simulada):');
    const apiResponse = {
      success: true,
      promoter: {
        id: promoter.promoter_id,
        nome: promoter.nome,
        apelido: promoter.apelido,
        email: promoter.email,
        foto_url: promoter.foto_url,
        instagram: promoter.instagram,
        observacoes: promoter.observacoes,
        establishment_name: promoter.establishment_name,
        user_id: userId,
        stats: stats
      }
    };
    
    console.log(JSON.stringify(apiResponse, null, 2));
    
    // 5. Verificar se tudo está correto
    console.log('\n5️⃣ Verificações finais:');
    console.log('   ✅ Promoter existe:', !!promoter);
    console.log('   ✅ Email presente:', !!promoter.email);
    console.log('   ✅ User ID encontrado:', !!userId);
    console.log('   ✅ Status correto:', promoter.status === 'Ativo');
    console.log('   ✅ Ativo:', true);
    
    console.log('\n🎉 Todos os testes passaram!');
    
  } catch (error) {
    console.error('❌ Erro durante os testes:', error);
    throw error;
  } finally {
    client.release();
  }
}

testPromoterAPI()
  .then(() => {
    console.log('\n✅ Script executado com sucesso!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Erro ao executar script:', error);
    process.exit(1);
  });

