// Script para buscar promoter por nome ou email parcial
const pool = require('../config/database');

async function searchPromoter(searchTerm) {
  const client = await pool.connect();
  
  try {
    console.log(`🔍 Buscando promoters com termo: "${searchTerm}"...\n`);
    
    // Buscar por nome, email ou código
    const result = await client.query(
      `SELECT 
        promoter_id, 
        nome, 
        apelido,
        email, 
        telefone, 
        whatsapp,
        codigo_identificador,
        status,
        ativo,
        tipo_categoria,
        establishment_id,
        created_at
      FROM promoters 
      WHERE 
        LOWER(nome) LIKE LOWER($1) OR
        LOWER(email) LIKE LOWER($1) OR
        LOWER(codigo_identificador) LIKE LOWER($1)
      ORDER BY nome ASC`,
      [`%${searchTerm}%`]
    );
    
    if (result.rows.length === 0) {
      console.log(`❌ Nenhum promoter encontrado com o termo "${searchTerm}".`);
      return;
    }
    
    console.log(`✅ Encontrados ${result.rows.length} promoter(s):\n`);
    
    result.rows.forEach((promoter, index) => {
      console.log(`${index + 1}. ${promoter.nome}`);
      console.log(`   ID: ${promoter.promoter_id}`);
      console.log(`   Email: ${promoter.email}`);
      console.log(`   Apelido: ${promoter.apelido || 'Não informado'}`);
      console.log(`   Telefone: ${promoter.telefone || 'Não informado'}`);
      console.log(`   WhatsApp: ${promoter.whatsapp || 'Não informado'}`);
      console.log(`   Código: ${promoter.codigo_identificador || 'Não informado'}`);
      console.log(`   Status: ${promoter.status}`);
      console.log(`   Ativo: ${promoter.ativo ? 'Sim' : 'Não'}`);
      console.log(`   Categoria: ${promoter.tipo_categoria || 'Não informado'}`);
      console.log(`   Criado em: ${promoter.created_at || 'Não informado'}`);
      console.log('');
    });
    
    // Verificar usuários relacionados
    console.log(`\n🔍 Verificando usuários relacionados...\n`);
    
    for (const promoter of result.rows) {
      if (promoter.email) {
        const userResult = await client.query(
          'SELECT id, name, email, role FROM users WHERE email = $1',
          [promoter.email]
        );
        
        if (userResult.rows.length > 0) {
          console.log(`✅ Usuário encontrado para ${promoter.email}:`);
          console.log(`   User ID: ${userResult.rows[0].id}`);
          console.log(`   Nome: ${userResult.rows[0].name}`);
          console.log(`   Role: ${userResult.rows[0].role}`);
        } else {
          console.log(`⚠️  Nenhum usuário encontrado para ${promoter.email}`);
        }
        console.log('');
      }
    }
    
  } catch (error) {
    console.error('❌ Erro ao buscar promoter:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Executar o script
const searchTerm = process.argv[2] || 'highline';

if (!searchTerm) {
  console.log('❌ Por favor, forneça um termo de busca.');
  console.log('   Uso: node scripts/searchPromoter.js "termo"');
  process.exit(1);
}

searchPromoter(searchTerm)
  .then(() => {
    console.log('\n✅ Busca concluída!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Erro ao executar script:', error);
    process.exit(1);
  });


