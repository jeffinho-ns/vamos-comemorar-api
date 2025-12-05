// Script para verificar e corrigir login de promoter específico
const pool = require('../config/database');
const bcrypt = require('bcryptjs');

async function fixPromoterLogin(email) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    console.log(`🔍 Verificando promoter com email: ${email}...\n`);
    
    // 1. Buscar o promoter pelo email
    const promoterResult = await client.query(
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
        establishment_id
      FROM promoters 
      WHERE email = $1`,
      [email]
    );
    
    if (promoterResult.rows.length === 0) {
      console.log(`❌ Promoter com email "${email}" não encontrado no banco de dados.`);
      return;
    }
    
    const promoter = promoterResult.rows[0];
    console.log(`✅ Promoter encontrado:`);
    console.log(`   ID: ${promoter.promoter_id}`);
    console.log(`   Nome: ${promoter.nome}`);
    console.log(`   Apelido: ${promoter.apelido || 'Não informado'}`);
    console.log(`   Email: ${promoter.email}`);
    console.log(`   Telefone: ${promoter.telefone || 'Não informado'}`);
    console.log(`   WhatsApp: ${promoter.whatsapp || 'Não informado'}`);
    console.log(`   Código Identificador: ${promoter.codigo_identificador || 'Não informado'}`);
    console.log(`   Status: ${promoter.status}`);
    console.log(`   Ativo: ${promoter.ativo}`);
    console.log(`   Categoria: ${promoter.tipo_categoria || 'Não informado'}`);
    console.log(`   Establishment ID: ${promoter.establishment_id || 'Não informado'}`);
    
    // 2. Verificar se o promoter está ativo e com status correto
    let needsUpdate = false;
    const updates = [];
    
    if (!promoter.ativo) {
      console.log(`\n⚠️  Promoter está inativo. Ativando...`);
      updates.push('ativo = TRUE');
      needsUpdate = true;
    }
    
    if (promoter.status !== 'Ativo') {
      console.log(`\n⚠️  Status do promoter é "${promoter.status}". Alterando para "Ativo"...`);
      updates.push(`status = 'Ativo'`);
      needsUpdate = true;
    }
    
    if (needsUpdate) {
      await client.query(
        `UPDATE promoters SET ${updates.join(', ')} WHERE promoter_id = $1`,
        [promoter.promoter_id]
      );
      console.log(`✅ Promoter atualizado!`);
    }
    
    // 3. Verificar se existe usuário com este email
    console.log(`\n🔍 Verificando usuário na tabela users...`);
    const userResult = await client.query(
      'SELECT id, name, email, role, telefone FROM users WHERE email = $1',
      [email]
    );
    
    let userId;
    const defaultPassword = 'Promoter@2025';
    const hashedPassword = await bcrypt.hash(defaultPassword, 10);
    
    if (userResult.rows.length === 0) {
      // Criar novo usuário
      console.log(`\n✨ Criando novo usuário...`);
      
      // Gerar um CPF temporário baseado no ID do promoter
      const tempCpf = `00000000${String(promoter.promoter_id).padStart(3, '0')}`;
      
      const newUserResult = await client.query(
        `INSERT INTO users (name, email, password, role, telefone, cpf)
         VALUES ($1, $2, $3, 'promoter', $4, $5)
         RETURNING id`,
        [promoter.nome, promoter.email, hashedPassword, promoter.telefone || null, tempCpf]
      );
      
      userId = newUserResult.rows[0].id;
      console.log(`✅ Usuário criado com sucesso! ID: ${userId}`);
    } else {
      // Atualizar usuário existente
      userId = userResult.rows[0].id;
      console.log(`\n🔄 Usuário já existe com ID: ${userId}`);
      console.log(`   Nome atual: ${userResult.rows[0].name}`);
      console.log(`   Role atual: ${userResult.rows[0].role}`);
      
      // Verificar se precisa atualizar
      if (userResult.rows[0].role !== 'promoter') {
        console.log(`   ⚠️  Role atual é "${userResult.rows[0].role}". Alterando para "promoter"...`);
      }
      
      // Verificar se o usuário tem CPF
      const userCheck = await client.query('SELECT cpf FROM users WHERE id = $1', [userId]);
      const currentCpf = userCheck.rows[0]?.cpf;
      const tempCpf = currentCpf || `00000000${String(promoter.promoter_id).padStart(3, '0')}`;
      
      await client.query(
        `UPDATE users SET 
          name = $1, 
          role = 'promoter', 
          password = $2, 
          telefone = $3,
          cpf = $4
        WHERE id = $5`,
        [promoter.nome, hashedPassword, promoter.telefone || null, tempCpf, userId]
      );
      
      console.log(`✅ Usuário atualizado com sucesso!`);
    }
    
    // 4. Verificar se a coluna user_id existe e vincular
    let hasUserIdColumn = false;
    try {
      const columnCheck = await client.query(
        `SELECT column_name 
         FROM information_schema.columns 
         WHERE table_name = 'promoters' 
         AND column_name = 'user_id'
         LIMIT 1`
      );
      hasUserIdColumn = columnCheck.rows.length > 0;
    } catch (e) {
      console.log('⚠️  Não foi possível verificar se a coluna user_id existe');
    }
    
    if (hasUserIdColumn) {
      const currentUserId = promoter.user_id;
      if (currentUserId !== userId) {
        console.log(`\n🔗 Vinculando user_id ${userId} ao promoter ${promoter.promoter_id}...`);
        
        await client.query(
          'UPDATE promoters SET user_id = $1 WHERE promoter_id = $2',
          [userId, promoter.promoter_id]
        );
        
        console.log(`✅ Vinculação realizada com sucesso!`);
      } else {
        console.log(`\n✅ Promoter já está vinculado ao usuário correto.`);
      }
    }
    
    // 5. Verificar código identificador
    if (!promoter.codigo_identificador) {
      console.log(`\n⚠️  Promoter não possui código identificador. Gerando...`);
      
      const nomeSlug = promoter.nome.toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]/g, '-')
        .replace(/-+/g, '-')
        .substring(0, 20);
      const timestamp = Date.now().toString().slice(-6);
      const codigoGerado = `${nomeSlug}-${timestamp}`;
      
      await client.query(
        'UPDATE promoters SET codigo_identificador = $1 WHERE promoter_id = $2',
        [codigoGerado, promoter.promoter_id]
      );
      
      console.log(`✅ Código identificador gerado: ${codigoGerado}`);
    }
    
    await client.query('COMMIT');
    
    console.log(`\n🎉 Processo concluído com sucesso!`);
    console.log(`\n📋 Resumo:`);
    console.log(`   Promoter: ${promoter.nome}`);
    console.log(`   Email: ${promoter.email}`);
    console.log(`   User ID: ${userId}`);
    console.log(`   Código Identificador: ${promoter.codigo_identificador || 'Gerado'}`);
    console.log(`   Status: Ativo`);
    console.log(`   Senha padrão: ${defaultPassword}`);
    console.log(`\n💡 O promoter pode fazer login com:`);
    console.log(`   Email: ${promoter.email}`);
    console.log(`   Senha: ${defaultPassword}`);
    console.log(`\n⚠️  IMPORTANTE: Após o primeiro login, altere a senha!`);
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Erro ao corrigir login do promoter:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Executar o script
const email = process.argv[2] || 'reservas@highlinebar.com.br';

if (!email) {
  console.log('❌ Por favor, forneça o email do promoter.');
  console.log('   Uso: node scripts/fixPromoterLogin.js "email@exemplo.com"');
  process.exit(1);
}

fixPromoterLogin(email)
  .then(() => {
    console.log('\n✅ Script executado com sucesso!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Erro ao executar script:', error);
    process.exit(1);
  });





