// Script para verificar e adicionar colunas entrada_tipo e entrada_valor na tabela guests
// Execute: node scripts/check_and_add_entrada_fields.js

const pool = require('../config/database');

async function checkAndAddFields() {
  console.log('🔍 Verificando colunas entrada_tipo e entrada_valor na tabela guests...\n');
  
  const client = await pool.connect();
  
  try {
    // Verificar se as colunas existem
    const checkColumns = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_schema = current_schema()
      AND table_name = 'guests' 
      AND column_name IN ('entrada_tipo', 'entrada_valor')
    `);
    
    console.log(`📊 Colunas encontradas: ${checkColumns.rows.length}/2`);
    checkColumns.rows.forEach(col => {
      console.log(`   - ${col.column_name} (${col.data_type}, nullable: ${col.is_nullable})`);
    });
    
    // Verificar se precisa adicionar entrada_tipo
    const hasEntradaTipo = checkColumns.rows.some(col => col.column_name === 'entrada_tipo');
    if (!hasEntradaTipo) {
      console.log('\n➕ Adicionando coluna entrada_tipo...');
      await client.query(`
        ALTER TABLE guests 
        ADD COLUMN entrada_tipo VARCHAR(20) DEFAULT NULL
      `);
      console.log('   ✅ Coluna entrada_tipo adicionada');
    }
    
    // Verificar se precisa adicionar entrada_valor
    const hasEntradaValor = checkColumns.rows.some(col => col.column_name === 'entrada_valor');
    if (!hasEntradaValor) {
      console.log('\n➕ Adicionando coluna entrada_valor...');
      await client.query(`
        ALTER TABLE guests 
        ADD COLUMN entrada_valor DECIMAL(10,2) DEFAULT NULL
      `);
      console.log('   ✅ Coluna entrada_valor adicionada');
    }
    
    // Criar índices se não existirem
    console.log('\n📇 Verificando índices...');
    try {
      await client.query(`CREATE INDEX IF NOT EXISTS idx_guests_entrada_tipo ON guests(entrada_tipo)`);
      console.log('   ✅ Índice idx_guests_entrada_tipo criado/verificado');
    } catch (e) {
      console.log('   ⚠️  Erro ao criar índice entrada_tipo:', e.message);
    }
    
    try {
      await client.query(`CREATE INDEX IF NOT EXISTS idx_guests_entrada_valor ON guests(entrada_valor)`);
      console.log('   ✅ Índice idx_guests_entrada_valor criado/verificado');
    } catch (e) {
      console.log('   ⚠️  Erro ao criar índice entrada_valor:', e.message);
    }
    
    // Verificar novamente
    const finalCheck = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_schema = current_schema()
      AND table_name = 'guests' 
      AND column_name IN ('entrada_tipo', 'entrada_valor')
    `);
    
    console.log(`\n✅ Verificação final: ${finalCheck.rows.length}/2 colunas encontradas`);
    finalCheck.rows.forEach(col => {
      console.log(`   ✅ ${col.column_name} (${col.data_type})`);
    });
    
    if (finalCheck.rows.length === 2) {
      console.log('\n🎉 Todas as colunas estão presentes! O endpoint de check-in deve funcionar agora.');
    } else {
      console.log('\n⚠️  Algumas colunas ainda não foram criadas. Verifique manualmente.');
    }
    
  } catch (error) {
    console.error('\n❌ Erro ao verificar/adicionar colunas:', error);
    console.error('Stack trace:', error.stack);
    throw error;
  } finally {
    client.release();
  }
}

// Executar
checkAndAddFields()
  .then(() => {
    console.log('\n✅ Processo finalizado com sucesso!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Falha no processo:', error);
    process.exit(1);
  });
