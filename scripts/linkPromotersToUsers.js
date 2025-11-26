// Script para vincular user_id aos promoters
const pool = require('../config/database');

async function linkPromotersToUsers() {
  const client = await pool.connect();
  
  try {
    console.log('🔗 Vinculando promoters aos usuários...\n');
    
    // Verificar se coluna user_id existe
    const columnCheck = await client.query(
      `SELECT column_name 
       FROM information_schema.columns 
       WHERE table_schema = 'meu_backup_db' 
       AND table_name = 'promoters' 
       AND column_name = 'user_id'`
    );
    
    if (columnCheck.rows.length === 0) {
      console.log('⚠️ Coluna user_id não existe na tabela promoters.');
      console.log('   Criando coluna user_id...');
      
      try {
        await client.query(`
          ALTER TABLE promoters 
          ADD COLUMN user_id INTEGER NULL
        `);
        console.log('✅ Coluna user_id criada com sucesso!');
      } catch (alterError) {
        console.error('❌ Erro ao criar coluna user_id:', alterError.message);
        return;
      }
    }
    
    // Buscar todos os promoters
    const promoters = await client.query(
      'SELECT promoter_id, email FROM promoters WHERE email IS NOT NULL'
    );
    
    console.log(`📋 Encontrados ${promoters.rows.length} promoters para vincular\n`);
    
    let linked = 0;
    let notFound = 0;
    
    for (const promoter of promoters.rows) {
      try {
        // Buscar usuário pelo email
        const userResult = await client.query(
          'SELECT id FROM users WHERE email = $1 LIMIT 1',
          [promoter.email]
        );
        
        if (userResult.rows.length > 0) {
          const userId = userResult.rows[0].id;
          
          // Vincular user_id ao promoter
          await client.query(
            'UPDATE promoters SET user_id = $1 WHERE promoter_id = $2',
            [userId, promoter.promoter_id]
          );
          
          console.log(`✅ Promoter ${promoter.promoter_id} (${promoter.email}) → User ${userId}`);
          linked++;
        } else {
          console.log(`⚠️ Usuário não encontrado para ${promoter.email}`);
          notFound++;
        }
      } catch (error) {
        console.error(`❌ Erro ao vincular promoter ${promoter.promoter_id}:`, error.message);
      }
    }
    
    console.log(`\n📊 Resumo:`);
    console.log(`   ✅ Vinculados: ${linked}`);
    console.log(`   ⚠️ Não encontrados: ${notFound}`);
    
  } catch (error) {
    console.error('❌ Erro durante vinculação:', error);
    throw error;
  } finally {
    client.release();
  }
}

linkPromotersToUsers()
  .then(() => {
    console.log('\n✅ Script executado com sucesso!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Erro ao executar script:', error);
    process.exit(1);
  });

