const { Pool } = require('pg');
require('dotenv').config();

// Usar a mesma configuração de conexão que o servidor usa
const connectionString = process.env.DATABASE_URL || 'postgresql://agilizaidb_user:9leBZwUgynZN5pnHPsqEJDW1tkE6LWjZ@dpg-d4bmh07diees73db68cg-a.oregon-postgres.render.com/agilizaidb?sslmode=prefer';

const pool = new Pool({
  connectionString: connectionString,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000, // Aumentado para 10 segundos
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
});

async function setAnalistaReservaPermissions() {
  let client;
  try {
    console.log('🔍 Tentando conectar ao banco de dados...\n');
    console.log('📍 Connection String:', connectionString.replace(/:[^:@]+@/, ':****@')); // Ocultar senha
    
    // Testar conexão
    client = await pool.connect();
    console.log('✅ Conexão estabelecida com sucesso!\n');
    
    // Definir search_path
    await client.query(`SET search_path TO meu_backup_db, public`);
    console.log('✅ Schema configurado: meu_backup_db\n');
    
    console.log('🔍 Configurando permissões para analista@reserva.com...\n');

    // 1. Buscar o ID do usuário
    const userResult = await pool.query(
      'SELECT id, email, name FROM users WHERE email = $1',
      ['analista@reserva.com']
    );

    if (userResult.rows.length === 0) {
      console.log('❌ Usuário analista@reserva.com não encontrado');
      return;
    }

    const user = userResult.rows[0];
    console.log(`✅ Usuário encontrado: ${user.name} (ID: ${user.id}, Email: ${user.email})\n`);

    // 2. Buscar o ID do estabelecimento "Reserva Rooftop"
    const establishmentResult = await pool.query(
      `SELECT id, name FROM places WHERE LOWER(name) LIKE '%reserva%rooftop%' OR LOWER(name) LIKE '%rooftop%'`
    );

    if (establishmentResult.rows.length === 0) {
      console.log('❌ Estabelecimento "Reserva Rooftop" não encontrado');
      return;
    }

    const establishment = establishmentResult.rows[0];
    console.log(`✅ Estabelecimento encontrado: ${establishment.name} (ID: ${establishment.id})\n`);

    // 3. Verificar se já existem permissões para este usuário
    const existingPermissionsResult = await pool.query(
      'SELECT * FROM user_establishment_permissions WHERE user_id = $1',
      [user.id]
    );

    console.log(`📊 Permissões existentes: ${existingPermissionsResult.rows.length}\n`);

    // 4. Remover todas as permissões existentes deste usuário (para garantir que veja apenas Reserva Rooftop)
    if (existingPermissionsResult.rows.length > 0) {
      console.log('🗑️  Removendo permissões existentes...');
      await pool.query(
        'DELETE FROM user_establishment_permissions WHERE user_id = $1',
        [user.id]
      );
      console.log('✅ Permissões antigas removidas\n');
    }

    // 5. Criar permissão apenas para Reserva Rooftop com acesso completo
    console.log('➕ Criando permissão para Reserva Rooftop...');
    await pool.query(
      `INSERT INTO user_establishment_permissions (
        user_id, user_email, establishment_id,
        can_edit_os, can_edit_operational_detail,
        can_view_os, can_download_os, can_view_operational_detail,
        can_create_os, can_create_operational_detail,
        can_manage_reservations, can_manage_checkins, can_view_reports,
        is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      ON CONFLICT (user_id, establishment_id) DO UPDATE SET
        can_edit_os = $4,
        can_edit_operational_detail = $5,
        can_view_os = $6,
        can_download_os = $7,
        can_view_operational_detail = $8,
        can_create_os = $9,
        can_create_operational_detail = $10,
        can_manage_reservations = $11,
        can_manage_checkins = $12,
        can_view_reports = $13,
        is_active = $14,
        updated_at = CURRENT_TIMESTAMP`,
      [
        user.id,
        user.email,
        establishment.id,
        true,  // can_edit_os
        true,  // can_edit_operational_detail
        true,  // can_view_os
        true,  // can_download_os
        true,  // can_view_operational_detail
        true,  // can_create_os
        true,  // can_create_operational_detail
        true,  // can_manage_reservations
        true,  // can_manage_checkins
        true,  // can_view_reports
        true   // is_active
      ]
    );

    console.log('✅ Permissão criada/atualizada com sucesso!\n');

    // 6. Verificar permissões finais
    const finalPermissionsResult = await pool.query(
      `SELECT 
        uep.*,
        COALESCE(p.name, b.name) as establishment_name
      FROM user_establishment_permissions uep
      LEFT JOIN places p ON uep.establishment_id = p.id
      LEFT JOIN bars b ON uep.establishment_id = b.id
      WHERE uep.user_id = $1 AND uep.is_active = TRUE`,
      [user.id]
    );

    console.log('📋 Permissões finais do usuário:');
    console.log('================================\n');
    finalPermissionsResult.rows.forEach((perm) => {
      console.log(`Estabelecimento: ${perm.establishment_name} (ID: ${perm.establishment_id})`);
      console.log(`  - Editar OS: ${perm.can_edit_os ? '✅' : '❌'}`);
      console.log(`  - Editar Detalhes Operacionais: ${perm.can_edit_operational_detail ? '✅' : '❌'}`);
      console.log(`  - Visualizar OS: ${perm.can_view_os ? '✅' : '❌'}`);
      console.log(`  - Baixar OS: ${perm.can_download_os ? '✅' : '❌'}`);
      console.log(`  - Visualizar Detalhes Operacionais: ${perm.can_view_operational_detail ? '✅' : '❌'}`);
      console.log(`  - Criar OS: ${perm.can_create_os ? '✅' : '❌'}`);
      console.log(`  - Criar Detalhes Operacionais: ${perm.can_create_operational_detail ? '✅' : '❌'}`);
      console.log(`  - Gerenciar Reservas: ${perm.can_manage_reservations ? '✅' : '❌'}`);
      console.log(`  - Gerenciar Check-ins: ${perm.can_manage_checkins ? '✅' : '❌'}`);
      console.log(`  - Visualizar Relatórios: ${perm.can_view_reports ? '✅' : '❌'}`);
      console.log('');
    });

    console.log('✅ Configuração concluída!');
    console.log(`\n📌 O usuário ${user.email} agora tem acesso APENAS ao estabelecimento "${establishment.name}"`);

  } catch (error) {
    console.error('❌ Erro ao configurar permissões:', error);
    console.error('📋 Detalhes do erro:', error.message);
    if (error.code) {
      console.error('📋 Código do erro:', error.code);
    }
    throw error;
  } finally {
    if (client) {
      client.release();
    }
    await pool.end();
  }
}

setAnalistaReservaPermissions()
  .then(() => {
    console.log('\n✅ Script executado com sucesso!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Erro ao executar script:', error);
    process.exit(1);
  });
