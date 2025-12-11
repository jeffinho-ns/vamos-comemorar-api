// Script para executar migração do sistema de permissões por estabelecimento
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

async function runMigration() {
  let pool;
  
  try {
    // Configuração do banco de dados
    const connectionString = process.env.DATABASE_URL || 
      'postgresql://agilizaidb_user:9leBZwUgynZN5pnHPsqEJDW1tkE6LWjZ@dpg-d4bmh07diees73db68cg-a.oregon-postgres.render.com/agilizaidb?sslmode=prefer';
    
    pool = new Pool({
      connectionString: connectionString,
      ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
    });

    console.log('🔗 Conectando ao banco de dados...');
    
    // Testar conexão
    await pool.query('SELECT NOW()');
    console.log('✅ Conectado ao banco de dados');

    // Ler arquivo de migração
    const migrationPath = path.join(__dirname, '../migrations/create_establishment_permissions_system_postgresql.sql');
    console.log('📖 Lendo arquivo de migração:', migrationPath);
    
    if (!fs.existsSync(migrationPath)) {
      throw new Error(`Arquivo de migração não encontrado: ${migrationPath}`);
    }
    
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    console.log('📝 Arquivo lido com sucesso!');

    // Executar migração
    console.log('🚀 Executando migração...');
    await pool.query(migrationSQL);
    console.log('✅ Migração executada com sucesso!');

    // Verificar tabelas criadas
    console.log('\n🔍 Verificando tabelas criadas...');
    const tablesResult = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_name LIKE '%permission%'
      ORDER BY table_name
    `);
    
    console.log('\n📊 Tabelas criadas:');
    tablesResult.rows.forEach(row => {
      console.log(`   ✅ ${row.table_name}`);
    });

    // Verificar permissões inseridas
    console.log('\n🔍 Verificando permissões inseridas...');
    const permissionsResult = await pool.query(`
      SELECT 
        uep.id,
        uep.user_email,
        uep.establishment_id,
        p.name as establishment_name,
        uep.can_edit_os,
        uep.can_edit_operational_detail,
        uep.can_view_os,
        uep.can_download_os,
        uep.is_active
      FROM user_establishment_permissions uep
      LEFT JOIN places p ON uep.establishment_id = p.id
      ORDER BY uep.user_email, uep.establishment_id
    `);
    
    console.log(`\n📊 Permissões inseridas: ${permissionsResult.rows.length}`);
    permissionsResult.rows.forEach(perm => {
      console.log(`   ✅ ${perm.user_email} → ${perm.establishment_name || `ID ${perm.establishment_id}`} (Editar OS: ${perm.can_edit_os}, Ver OS: ${perm.can_view_os})`);
    });

    console.log('\n🎉 Migração concluída com sucesso!');
    console.log('💡 Agora você pode:');
    console.log('   1. Acessar /admin/permissions para gerenciar permissões');
    console.log('   2. As permissões serão carregadas automaticamente do banco de dados');
    console.log('   3. Use a API /api/establishment-permissions para gerenciar via código');
    
  } catch (error) {
    console.error('\n❌ Erro ao executar migração:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  } finally {
    if (pool) {
      await pool.end();
      console.log('\n🔌 Conexão com banco fechada');
    }
  }
}

// Executar migração
runMigration();

