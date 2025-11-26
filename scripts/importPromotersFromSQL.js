// Script para importar promoters do arquivo SQL
const pool = require('../config/database');
const bcrypt = require('bcryptjs');

const promoters = [
  {
    promoter_id: 24,
    nome: 'Dorsa',
    email: 'reservas@highlinrbar.com.br',
    telefone: '(11) 3032-2934',
    status: 'Ativo',
    apelido: 'Dorsa',
    codigo_identificador: 'dorsa',
    tipo_categoria: 'Standard',
    comissao_percentual: 5.00,
    link_convite: 'https://www.agilizaiapp.com.br/promoter/dorsa',
    data_cadastro: '2025-11-05',
    observacoes: 'Com nome nalista:\nAté as 22H - VIP\n22:00 - 00:30 - R$ 40 seco ou R$ 120 consome\napós às 00:30 - R$ 50 seco ou R$ 150 consome',
    establishment_id: 7,
    foto_url: '',
    whatsapp: '1130322934',
    instagram: '',
    user_id: 106,
    ativo: true
  },
  {
    promoter_id: 25,
    nome: 'Enrico Budriesi',
    email: 'reserva@highlinebar.com.br',
    telefone: '(11) 3032-2934',
    status: 'Ativo',
    apelido: 'Budriesi',
    codigo_identificador: 'enrico',
    tipo_categoria: 'Standard',
    comissao_percentual: 5.00,
    link_convite: 'https://www.agilizaiapp.com.br/promoter/enrico',
    data_cadastro: '2025-11-05',
    observacoes: 'Com nome nalista:\nAté as 22H - VIP\n22:00 - 00:30 - R$ 40 seco ou R$ 120 consome\napós às 00:30 - R$ 50 seco ou R$ 150 consom',
    establishment_id: 7,
    foto_url: '',
    whatsapp: '1130322934',
    instagram: '',
    user_id: 107,
    ativo: true
  },
  {
    promoter_id: 26,
    nome: 'Luiz Palma',
    email: 'reserve@highlinebar.com.br',
    telefone: '(11) 3032-2934',
    status: 'Ativo',
    apelido: 'palma',
    codigo_identificador: 'palma',
    tipo_categoria: 'Standard',
    comissao_percentual: 5.00,
    link_convite: 'https://www.agilizaiapp.com.br/promoter/palma',
    data_cadastro: '2025-11-05',
    observacoes: 'Com nome nalista:\nAté as 22H - VIP\n22:00 - 00:30 - R$ 40 seco ou R$ 120 consome\napós às 00:30 - R$ 50 seco ou R$ 150 consome',
    establishment_id: 7,
    foto_url: '',
    whatsapp: '1130322934',
    instagram: '',
    user_id: 108,
    ativo: true
  },
  {
    promoter_id: 27,
    nome: 'F. Lima',
    email: 'reservas@highlinebar.com',
    telefone: '(11) 3032-2934',
    status: 'Ativo',
    apelido: 'Flima',
    codigo_identificador: 'flima',
    tipo_categoria: 'Standard',
    comissao_percentual: 5.00,
    link_convite: 'https://www.agilizaiapp.com.br/promoter/flima',
    data_cadastro: '2025-11-05',
    observacoes: 'Com nome nalista:\nAté as 22H - VIP\n22:00 - 00:30 - R$ 40 seco ou R$ 120 consome\napós às 00:30 - R$ 50 seco ou R$ 150 consome',
    establishment_id: 7,
    foto_url: '',
    whatsapp: '1130322934',
    instagram: '',
    user_id: 109,
    ativo: true
  },
  {
    promoter_id: 28,
    nome: 'Lugui Diniz',
    email: 'reservas@highline.com.br',
    telefone: '(11) 3032-2934',
    status: 'Ativo',
    apelido: 'Lugui',
    codigo_identificador: 'lugui',
    tipo_categoria: 'Standard',
    comissao_percentual: 5.00,
    link_convite: 'https://www.agilizaiapp.com.br/promoter/lugui',
    data_cadastro: '2025-11-05',
    observacoes: 'Com nome nalista:\nAté as 22H - VIP\n22:00 - 00:30 - R$ 40 seco ou R$ 120 consome\napós às 00:30 - R$ 50 seco ou R$ 150 consom',
    establishment_id: 7,
    foto_url: '',
    whatsapp: '1130322934',
    instagram: '',
    user_id: 110,
    ativo: true
  },
  {
    promoter_id: 29,
    nome: 'Sapienza',
    email: 'reserva@highline.com.br',
    telefone: '(11) 3032-2934',
    status: 'Ativo',
    apelido: 'Sapienza',
    codigo_identificador: 'sapienza',
    tipo_categoria: 'Standard',
    comissao_percentual: 5.00,
    link_convite: 'https://www.agilizaiapp.com.br/promoter/sapienza',
    data_cadastro: '2025-11-05',
    observacoes: 'Com nome nalista:\nAté as 22H - VIP\n22:00 - 00:30 - R$ 40 seco ou R$ 120 consome\napós às 00:30 - R$ 50 seco ou R$ 150 consome',
    establishment_id: 7,
    foto_url: '',
    whatsapp: '1130322934',
    instagram: '',
    user_id: 111,
    ativo: true
  },
  {
    promoter_id: 30,
    nome: 'Sumas Soundsystem',
    email: 'reserv@highlinebar.com.br',
    telefone: '(11) 3032-2934',
    status: 'Ativo',
    apelido: 'Soundsystem',
    codigo_identificador: 'soundsystem',
    tipo_categoria: 'Standard',
    comissao_percentual: 5.00,
    link_convite: 'https://www.agilizaiapp.com.br/promoter/soundsystem',
    data_cadastro: '2025-11-05',
    observacoes: 'Com nome nalista:\nAté as 22H - VIP\n22:00 - 00:30 - R$ 40 seco ou R$ 120 consome\napós às 00:30 - R$ 50 seco ou R$ 150 consome',
    establishment_id: 7,
    foto_url: '',
    whatsapp: '1130322934',
    instagram: '',
    user_id: 112,
    ativo: true
  },
  {
    promoter_id: 31,
    nome: 'Tieri',
    email: 'reserves@highlinebar.com.br',
    telefone: '(11) 3032-2934',
    status: 'Ativo',
    apelido: 'Tieri',
    codigo_identificador: 'tieri',
    tipo_categoria: 'Standard',
    comissao_percentual: 5.00,
    link_convite: 'https://www.agilizaiapp.com.br/promoter/tieri',
    data_cadastro: '2025-11-05',
    observacoes: 'Com nome nalista:\nAté as 22H - VIP\n22:00 - 00:30 - R$ 40 seco ou R$ 120 consome\napós às 00:30 - R$ 50 seco ou R$ 150 consome',
    establishment_id: 7,
    foto_url: '',
    whatsapp: '1130322934',
    instagram: '',
    user_id: 113,
    ativo: true
  },
  {
    promoter_id: 32,
    nome: 'Unissex',
    email: 'listas@highlinebar.com.br',
    telefone: '(11) 3032-2934',
    status: 'Ativo',
    apelido: 'Unissex',
    codigo_identificador: 'unisex',
    tipo_categoria: 'Standard',
    comissao_percentual: 5.00,
    link_convite: 'https://www.agilizaiapp.com.br/promoter/unisex',
    data_cadastro: '2025-11-05',
    observacoes: 'Com nome nalista:\nAté as 22H - VIP\n22:00 - 00:30 - R$ 40 seco ou R$ 120 consome\napós às 00:30 - R$ 50 seco ou R$ 150 consome',
    establishment_id: 7,
    foto_url: '',
    whatsapp: '1130322934',
    instagram: '',
    user_id: 114,
    ativo: true
  }
];

async function importPromoters() {
  const client = await pool.connect();
  
  try {
    console.log('🚀 Iniciando importação de promoters...\n');
    
    let created = 0;
    let updated = 0;
    let skipped = 0;
    let usersCreated = 0;
    
    for (const promoterData of promoters) {
      try {
        await client.query('BEGIN');
        
        console.log(`📋 Processando: ${promoterData.nome} (${promoterData.email})`);
        
        // Verificar se promoter já existe
        const existingPromoter = await client.query(
          'SELECT promoter_id FROM promoters WHERE promoter_id = $1 OR email = $2',
          [promoterData.promoter_id, promoterData.email]
        );
        
        // Verificar/criar usuário
        let userId = promoterData.user_id;
        const defaultPassword = 'Promoter@2025';
        const hashedPassword = await bcrypt.hash(defaultPassword, 10);
        
        const existingUser = await client.query(
          'SELECT id FROM users WHERE id = $1 OR email = $2',
          [promoterData.user_id, promoterData.email]
        );
        
        if (existingUser.rows.length === 0) {
          // Criar usuário - usar ON CONFLICT para evitar erro se ID já existir
          const tempCpf = `00000000${String(promoterData.promoter_id).padStart(3, '0')}`;
          try {
            const userResult = await client.query(
              `INSERT INTO users (id, name, email, password, role, telefone, cpf)
               VALUES ($1, $2, $3, $4, 'promoter', $5, $6)
               RETURNING id`,
              [promoterData.user_id, promoterData.nome, promoterData.email, hashedPassword, promoterData.telefone || null, tempCpf]
            );
            userId = userResult.rows[0].id;
            usersCreated++;
            console.log(`   ✅ Usuário criado: ID ${userId}`);
          } catch (userError) {
            // Se falhar por conflito de ID, tentar atualizar
            if (userError.code === '23505') {
              await client.query(
                `UPDATE users SET 
                  name = $1, 
                  email = $2, 
                  role = 'promoter', 
                  password = $3, 
                  telefone = $4
                WHERE id = $5`,
                [promoterData.nome, promoterData.email, hashedPassword, promoterData.telefone || null, promoterData.user_id]
              );
              userId = promoterData.user_id;
              console.log(`   ✅ Usuário atualizado: ID ${userId}`);
            } else {
              throw userError;
            }
          }
        } else {
          // Atualizar usuário existente
          const existingUserId = existingUser.rows[0].id;
          await client.query(
            `UPDATE users SET 
              name = $1, 
              email = $2, 
              role = 'promoter', 
              password = $3, 
              telefone = $4
            WHERE id = $5`,
            [promoterData.nome, promoterData.email, hashedPassword, promoterData.telefone || null, existingUserId]
          );
          userId = existingUserId;
          console.log(`   ✅ Usuário atualizado: ID ${userId}`);
        }
        
        if (existingPromoter.rows.length > 0) {
          // Atualizar promoter existente
          await client.query(
            `UPDATE promoters SET
              nome = $1,
              email = $2,
              telefone = $3,
              status = $4,
              apelido = $5,
              codigo_identificador = $6,
              tipo_categoria = $7,
              comissao_percentual = $8,
              link_convite = $9,
              data_cadastro = $10,
              observacoes = $11,
              establishment_id = $12,
              foto_url = $13,
              whatsapp = $14,
              instagram = $15,
              ativo = $16
            WHERE promoter_id = $17`,
            [
              promoterData.nome,
              promoterData.email,
              promoterData.telefone,
              promoterData.status,
              promoterData.apelido,
              promoterData.codigo_identificador,
              promoterData.tipo_categoria,
              promoterData.comissao_percentual,
              promoterData.link_convite,
              promoterData.data_cadastro,
              promoterData.observacoes,
              promoterData.establishment_id,
              promoterData.foto_url || null,
              promoterData.whatsapp || null,
              promoterData.instagram || null,
              promoterData.ativo,
              promoterData.promoter_id
            ]
          );
          updated++;
          console.log(`   ✅ Promoter atualizado: ID ${promoterData.promoter_id}`);
        } else {
          // Inserir novo promoter
          try {
            const insertResult = await client.query(
              `INSERT INTO promoters (
                promoter_id, nome, email, telefone, status, apelido, codigo_identificador,
                tipo_categoria, comissao_percentual, link_convite, data_cadastro, observacoes,
                establishment_id, foto_url, whatsapp, instagram, ativo
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
              RETURNING promoter_id`,
              [
                promoterData.promoter_id,
                promoterData.nome,
                promoterData.email,
                promoterData.telefone,
                promoterData.status,
                promoterData.apelido,
                promoterData.codigo_identificador,
                promoterData.tipo_categoria,
                promoterData.comissao_percentual,
                promoterData.link_convite,
                promoterData.data_cadastro,
                promoterData.observacoes,
                promoterData.establishment_id,
                promoterData.foto_url || null,
                promoterData.whatsapp || null,
                promoterData.instagram || null,
                promoterData.ativo
              ]
            );
            if (insertResult.rows.length > 0) {
              created++;
              console.log(`   ✅ Promoter criado: ID ${promoterData.promoter_id}`);
            }
          } catch (insertError) {
            if (insertError.code === '23505') {
              // Conflito de chave única, tentar atualizar
              await client.query(
                `UPDATE promoters SET
                  nome = $1,
                  email = $2,
                  telefone = $3,
                  status = $4,
                  apelido = $5,
                  codigo_identificador = $6,
                  tipo_categoria = $7,
                  comissao_percentual = $8,
                  link_convite = $9,
                  data_cadastro = $10,
                  observacoes = $11,
                  establishment_id = $12,
                  foto_url = $13,
                  whatsapp = $14,
                  instagram = $15,
                  ativo = $16
                WHERE promoter_id = $17`,
                [
                  promoterData.nome,
                  promoterData.email,
                  promoterData.telefone,
                  promoterData.status,
                  promoterData.apelido,
                  promoterData.codigo_identificador,
                  promoterData.tipo_categoria,
                  promoterData.comissao_percentual,
                  promoterData.link_convite,
                  promoterData.data_cadastro,
                  promoterData.observacoes,
                  promoterData.establishment_id,
                  promoterData.foto_url || null,
                  promoterData.whatsapp || null,
                  promoterData.instagram || null,
                  promoterData.ativo,
                  promoterData.promoter_id
                ]
              );
              updated++;
              console.log(`   ✅ Promoter atualizado (conflito resolvido): ID ${promoterData.promoter_id}`);
            } else {
              throw insertError;
            }
          }
        }
        
        // Tentar vincular user_id se a coluna existir
        try {
          await client.query(
            'UPDATE promoters SET user_id = $1 WHERE promoter_id = $2',
            [userId, promoterData.promoter_id]
          );
          console.log(`   ✅ User ID ${userId} vinculado ao promoter ${promoterData.promoter_id}`);
        } catch (userLinkError) {
          // Coluna user_id pode não existir, ignorar
          console.log(`   ⚠️ Não foi possível vincular user_id (coluna pode não existir)`);
        }
        
        await client.query('COMMIT');
        console.log('');
        
      } catch (error) {
        await client.query('ROLLBACK');
        console.error(`   ❌ Erro ao processar ${promoterData.nome}:`, error.message);
        skipped++;
      }
    }
    
    console.log('\n🎉 Importação concluída!');
    console.log(`\n📊 Resumo:`);
    console.log(`   ✅ Promoters criados: ${created}`);
    console.log(`   🔄 Promoters atualizados: ${updated}`);
    console.log(`   ⚠️ Promoters ignorados: ${skipped}`);
    console.log(`   👤 Usuários criados: ${usersCreated}`);
    console.log(`\n💡 Todos os promoters podem fazer login com:`);
    console.log(`   Senha padrão: Promoter@2025`);
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Erro durante a importação:', error);
    throw error;
  } finally {
    client.release();
  }
}

importPromoters()
  .then(() => {
    console.log('\n✅ Script executado com sucesso!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Erro ao executar script:', error);
    process.exit(1);
  });

