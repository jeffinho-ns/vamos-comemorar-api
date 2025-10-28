// Script para corrigir links dos promoters
const pool = require('../config/database');

async function fixPromoterLinks() {
  try {
    console.log('🔧 Iniciando correção dos links dos promoters...');
    
    // Buscar todos os promoters com link antigo
    const [promoters] = await pool.execute(
      `SELECT promoter_id, codigo_identificador, link_convite 
       FROM promoters 
       WHERE link_convite LIKE '%vamoscomemorar.vercel.app%' 
          OR link_convite LIKE '%vamos-comemorar.com.br%'`
    );
    
    console.log(`📋 Encontrados ${promoters.length} promoter(s) para corrigir`);
    
    if (promoters.length === 0) {
      console.log('✅ Nenhum link precisa ser corrigido!');
      process.exit(0);
    }
    
    // Atualizar cada promoter
    for (const promoter of promoters) {
      const newLink = `https://www.agilizaiapp.com.br/promoter/${promoter.codigo_identificador}`;
      
      await pool.execute(
        'UPDATE promoters SET link_convite = ? WHERE promoter_id = ?',
        [newLink, promoter.promoter_id]
      );
      
      console.log(`✅ Corrigido: ${promoter.link_convite} -> ${newLink}`);
    }
    
    console.log(`\n🎉 ${promoters.length} link(s) corrigido(s) com sucesso!`);
    
  } catch (error) {
    console.error('❌ Erro ao corrigir links:', error);
  } finally {
    process.exit(0);
  }
}

fixPromoterLinks();





