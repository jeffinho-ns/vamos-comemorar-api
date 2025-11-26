// Script para executar a migração do sistema de brindes (versão corrigida)
// Execute: node scripts/run_gift_rules_migration_fixed.js

const pool = require('../config/database');

async function runMigration() {
  console.log('🚀 Iniciando migração do sistema de brindes...\n');
  
  const client = await pool.connect();
  
  try {
    // Verificar se as tabelas já existem
    const checkTables = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_name IN ('gift_rules', 'guest_list_gifts')
    `);
    
    if (checkTables.rows.length === 2) {
      console.log('✅ As tabelas já existem! Não é necessário executar a migração.');
      console.log('   Tabelas encontradas:');
      checkTables.rows.forEach(row => {
        console.log(`   - ${row.table_name}`);
      });
      return;
    }
    
    console.log('📝 Criando tabelas e estruturas...\n');
    
    // 1. Criar tabela gift_rules
    console.log('⏳ 1. Criando tabela gift_rules...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS gift_rules (
        id SERIAL PRIMARY KEY,
        establishment_id INTEGER NOT NULL,
        evento_id INTEGER NULL DEFAULT NULL,
        descricao VARCHAR(255) NOT NULL,
        checkins_necessarios INTEGER NOT NULL,
        status VARCHAR(20) DEFAULT 'ATIVA' CHECK (status IN ('ATIVA', 'INATIVA')),
        created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('   ✅ Tabela gift_rules criada\n');
    
    // 2. Criar índices para gift_rules
    console.log('⏳ 2. Criando índices para gift_rules...');
    await client.query(`CREATE INDEX IF NOT EXISTS idx_gift_rules_establishment ON gift_rules(establishment_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_gift_rules_evento ON gift_rules(evento_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_gift_rules_status ON gift_rules(status)`);
    console.log('   ✅ Índices criados\n');
    
    // 3. Criar função para trigger de updated_at
    console.log('⏳ 3. Criando função para trigger updated_at...');
    await client.query(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
          NEW.updated_at = CURRENT_TIMESTAMP;
          RETURN NEW;
      END;
      $$ language 'plpgsql'
    `);
    console.log('   ✅ Função criada\n');
    
    // 4. Criar trigger para gift_rules
    console.log('⏳ 4. Criando trigger para gift_rules...');
    await client.query(`DROP TRIGGER IF EXISTS update_gift_rules_updated_at ON gift_rules`);
    await client.query(`
      CREATE TRIGGER update_gift_rules_updated_at
          BEFORE UPDATE ON gift_rules
          FOR EACH ROW
          EXECUTE FUNCTION update_updated_at_column()
    `);
    console.log('   ✅ Trigger criado\n');
    
    // 5. Criar tabela guest_list_gifts
    console.log('⏳ 5. Criando tabela guest_list_gifts...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS guest_list_gifts (
        id SERIAL PRIMARY KEY,
        guest_list_id INTEGER NOT NULL,
        gift_rule_id INTEGER NOT NULL,
        status VARCHAR(20) DEFAULT 'LIBERADO' CHECK (status IN ('LIBERADO', 'ENTREGUE', 'CANCELADO')),
        checkins_count INTEGER NOT NULL,
        liberado_em TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
        entregue_em TIMESTAMP NULL DEFAULT NULL,
        CONSTRAINT fk_gift_guest_list FOREIGN KEY (guest_list_id) REFERENCES guest_lists(id) ON DELETE CASCADE,
        CONSTRAINT fk_gift_rule FOREIGN KEY (gift_rule_id) REFERENCES gift_rules(id) ON DELETE CASCADE
      )
    `);
    console.log('   ✅ Tabela guest_list_gifts criada\n');
    
    // 6. Criar índices para guest_list_gifts
    console.log('⏳ 6. Criando índices para guest_list_gifts...');
    await client.query(`CREATE INDEX IF NOT EXISTS idx_guest_list_gifts_guest_list ON guest_list_gifts(guest_list_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_guest_list_gifts_gift_rule ON guest_list_gifts(gift_rule_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_guest_list_gifts_status ON guest_list_gifts(status)`);
    console.log('   ✅ Índices criados\n');
    
    // 7. Criar índice único para evitar duplicatas
    console.log('⏳ 7. Criando índice único...');
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_guest_list_gift_rule_status 
      ON guest_list_gifts(guest_list_id, gift_rule_id) 
      WHERE status != 'CANCELADO'
    `);
    console.log('   ✅ Índice único criado\n');
    
    // Verificar se as tabelas foram criadas
    console.log('🔍 Verificando tabelas criadas...');
    const verifyTables = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_name IN ('gift_rules', 'guest_list_gifts')
    `);
    
    console.log(`\n✅ Migração concluída com sucesso!`);
    console.log(`📊 Tabelas criadas: ${verifyTables.rows.length}/2`);
    verifyTables.rows.forEach(row => {
      console.log(`   ✅ ${row.table_name}`);
    });
    
    if (verifyTables.rows.length === 2) {
      console.log('\n🎉 Sistema de brindes pronto para uso!');
      console.log('\n📋 Próximos passos:');
      console.log('   1. Recarregue a página /admin/restaurant-reservations');
      console.log('   2. Vá em Configurações → Gerenciamento de Brindes');
      console.log('   3. Crie uma regra de brinde');
      console.log('   4. Teste o sistema fazendo check-ins\n');
    } else {
      console.log('\n⚠️  Algumas tabelas podem não ter sido criadas. Verifique manualmente.');
    }
    
  } catch (error) {
    console.error('\n❌ Erro ao executar migração:', error.message);
    console.error('Código do erro:', error.code);
    if (error.detail) {
      console.error('Detalhes:', error.detail);
    }
    console.error('\nStack trace:', error.stack);
    throw error;
  } finally {
    client.release();
  }
}

// Executar migração
runMigration()
  .then(() => {
    console.log('\n✅ Processo finalizado com sucesso!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Falha na migração:', error);
    process.exit(1);
  });
