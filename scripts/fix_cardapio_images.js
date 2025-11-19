// Script para corrigir URLs de imagens no cardápio após migração para PostgreSQL
const { Pool } = require('pg');
require('dotenv').config();

// Usar DATABASE_URL se disponível (produção), senão usar string hardcoded
const connectionString = process.env.DATABASE_URL || 'postgresql://agilizaidb_user:9leBZwUgynZN5pnHPsqEJDW1tkE6LWjZ@dpg-d4bmh07diees73db68cg-a.oregon-postgres.render.com/agilizaidb?sslmode=prefer';

const pool = new Pool({
  connectionString: connectionString,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

async function fixImages() {
  const client = await pool.connect();
  
  try {
    // Definir search_path
    await client.query(`SET search_path TO meu_backup_db, public`);
    console.log('✅ Conectado ao banco de dados');
    console.log('🔍 Verificando URLs de imagens...');
    
    // 1. Verificar itens com URLs completas
    const checkItems = await client.query(`
      SELECT COUNT(*) as count 
      FROM menu_items 
      WHERE imageUrl LIKE 'https://grupoideiaum.com.br/cardapio-agilizaiapp/%'
         OR imageUrl LIKE 'http://grupoideiaum.com.br/cardapio-agilizaiapp/%'
         OR (imageUrl LIKE '/%' AND imageUrl IS NOT NULL)
    `);
    console.log(`📊 Itens com URLs que precisam correção: ${checkItems.rows[0].count}`);
    
    // 2. Corrigir URLs completas dos itens
    console.log('🔧 Corrigindo URLs dos itens...');
    const updateItems1 = await client.query(`
      UPDATE menu_items 
      SET imageUrl = SUBSTRING(imageUrl FROM LENGTH('https://grupoideiaum.com.br/cardapio-agilizaiapp/') + 1)
      WHERE imageUrl LIKE 'https://grupoideiaum.com.br/cardapio-agilizaiapp/%'
      RETURNING id, name, imageUrl
    `);
    console.log(`✅ ${updateItems1.rowCount} itens corrigidos (https)`);
    
    const updateItems2 = await client.query(`
      UPDATE menu_items 
      SET imageUrl = SUBSTRING(imageUrl FROM LENGTH('http://grupoideiaum.com.br/cardapio-agilizaiapp/') + 1)
      WHERE imageUrl LIKE 'http://grupoideiaum.com.br/cardapio-agilizaiapp/%'
      RETURNING id, name, imageUrl
    `);
    console.log(`✅ ${updateItems2.rowCount} itens corrigidos (http)`);
    
    // 3. Remover barras iniciais dos itens
    const updateItems3 = await client.query(`
      UPDATE menu_items 
      SET imageUrl = SUBSTRING(imageUrl FROM 2)
      WHERE imageUrl LIKE '/%' AND LENGTH(imageUrl) > 1
      RETURNING id, name, imageUrl
    `);
    console.log(`✅ ${updateItems3.rowCount} itens corrigidos (removida barra inicial)`);
    
    // 4. Verificar bares
    const checkBars = await client.query(`
      SELECT COUNT(*) as count 
      FROM bars 
      WHERE logoUrl LIKE 'https://grupoideiaum.com.br/cardapio-agilizaiapp/%'
         OR coverImageUrl LIKE 'https://grupoideiaum.com.br/cardapio-agilizaiapp/%'
         OR (logoUrl LIKE '/%' AND logoUrl IS NOT NULL)
         OR (coverImageUrl LIKE '/%' AND coverImageUrl IS NOT NULL)
    `);
    console.log(`📊 Bares com URLs que precisam correção: ${checkBars.rows[0].count}`);
    
    // 5. Corrigir logoUrl dos bares
    const updateBars1 = await client.query(`
      UPDATE bars 
      SET logoUrl = SUBSTRING(logoUrl FROM LENGTH('https://grupoideiaum.com.br/cardapio-agilizaiapp/') + 1)
      WHERE logoUrl LIKE 'https://grupoideiaum.com.br/cardapio-agilizaiapp/%'
      RETURNING id, name, logoUrl
    `);
    console.log(`✅ ${updateBars1.rowCount} logos corrigidos`);
    
    // 6. Corrigir coverImageUrl dos bares
    const updateBars2 = await client.query(`
      UPDATE bars 
      SET coverImageUrl = SUBSTRING(coverImageUrl FROM LENGTH('https://grupoideiaum.com.br/cardapio-agilizaiapp/') + 1)
      WHERE coverImageUrl LIKE 'https://grupoideiaum.com.br/cardapio-agilizaiapp/%'
      RETURNING id, name, coverImageUrl
    `);
    console.log(`✅ ${updateBars2.rowCount} capas corrigidas`);
    
    // 7. Corrigir popupImageUrl dos bares
    const updateBars3 = await client.query(`
      UPDATE bars 
      SET popupImageUrl = SUBSTRING(popupImageUrl FROM LENGTH('https://grupoideiaum.com.br/cardapio-agilizaiapp/') + 1)
      WHERE popupImageUrl LIKE 'https://grupoideiaum.com.br/cardapio-agilizaiapp/%'
      RETURNING id, name, popupImageUrl
    `);
    console.log(`✅ ${updateBars3.rowCount} popups corrigidos`);
    
    // 8. Remover barras iniciais dos bares
    const updateBars4 = await client.query(`
      UPDATE bars 
      SET logoUrl = SUBSTRING(logoUrl FROM 2)
      WHERE logoUrl LIKE '/%' AND LENGTH(logoUrl) > 1
      RETURNING id, name
    `);
    console.log(`✅ ${updateBars4.rowCount} logos corrigidos (barra inicial)`);
    
    const updateBars5 = await client.query(`
      UPDATE bars 
      SET coverImageUrl = SUBSTRING(coverImageUrl FROM 2)
      WHERE coverImageUrl LIKE '/%' AND LENGTH(coverImageUrl) > 1
      RETURNING id, name
    `);
    console.log(`✅ ${updateBars5.rowCount} capas corrigidas (barra inicial)`);
    
    const updateBars6 = await client.query(`
      UPDATE bars 
      SET popupImageUrl = SUBSTRING(popupImageUrl FROM 2)
      WHERE popupImageUrl LIKE '/%' AND LENGTH(popupImageUrl) > 1
      RETURNING id, name
    `);
    console.log(`✅ ${updateBars6.rowCount} popups corrigidos (barra inicial)`);
    
    // 9. Relatório final
    const reportItems = await client.query(`
      SELECT 
        COUNT(*) FILTER (WHERE imageUrl IS NOT NULL AND imageUrl != '') as com_imagem,
        COUNT(*) FILTER (WHERE imageUrl IS NULL OR imageUrl = '') as sem_imagem,
        COUNT(*) as total
      FROM menu_items
    `);
    const report = reportItems.rows[0];
    console.log('\n📊 Relatório Final:');
    console.log(`   Total de itens: ${report.total}`);
    console.log(`   Itens com imagem: ${report.com_imagem} (${(report.com_imagem / report.total * 100).toFixed(1)}%)`);
    console.log(`   Itens sem imagem: ${report.sem_imagem} (${(report.sem_imagem / report.total * 100).toFixed(1)}%)`);
    
    const reportBars = await client.query(`
      SELECT 
        COUNT(*) FILTER (WHERE logoUrl IS NOT NULL AND logoUrl != '') as com_logo,
        COUNT(*) FILTER (WHERE coverImageUrl IS NOT NULL AND coverImageUrl != '') as com_capa,
        COUNT(*) as total
      FROM bars
    `);
    const reportBar = reportBars.rows[0];
    console.log(`\n📊 Relatório de Bares:`);
    console.log(`   Total de bares: ${reportBar.total}`);
    console.log(`   Bares com logo: ${reportBar.com_logo}`);
    console.log(`   Bares com capa: ${reportBar.com_capa}`);
    
    console.log('\n✅ Correção concluída com sucesso!');
    
  } catch (error) {
    console.error('❌ Erro ao corrigir imagens:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

fixImages()
  .then(() => {
    console.log('🎉 Script executado com sucesso!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Erro fatal:', error);
    process.exit(1);
  });

