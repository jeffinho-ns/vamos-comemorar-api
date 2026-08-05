// Script para executar a migração de regras de brindes para promoters (versão corrigida)
const { Pool } = require('pg');
require('dotenv').config();

const { requireDatabaseUrl } = require('../config/resolveDatabaseUrl');
const connectionString = requireDatabaseUrl();

const pool = new Pool({
  connectionString: connectionString,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  ssl: { rejectUnauthorized: false }
});

async function runMigration() {
  const client = await pool.connect();
  
  try {
    console.log('🔄 Iniciando migração de regras de brindes para promoters...');
    
    // Definir search_path
    await client.query(`SET search_path TO meu_backup_db, public`);
    console.log('✅ Search path definido\n');
    
    // Comandos SQL em ordem de execução
    const commands = [
      // 1. Adicionar coluna tipo_beneficiario
      {
        name: 'Adicionar coluna tipo_beneficiario',
        sql: `
          ALTER TABLE gift_rules 
          ADD COLUMN IF NOT EXISTS tipo_beneficiario VARCHAR(20) DEFAULT 'ANIVERSARIO' 
          CHECK (tipo_beneficiario IN ('ANIVERSARIO', 'PROMOTER'));
        `
      },
      // 2. Atualizar registros existentes
      {
        name: 'Atualizar registros existentes',
        sql: `
          UPDATE gift_rules 
          SET tipo_beneficiario = 'ANIVERSARIO' 
          WHERE tipo_beneficiario IS NULL;
        `
      },
      // 3. Criar índice para tipo_beneficiario
      {
        name: 'Criar índice idx_gift_rules_tipo_beneficiario',
        sql: `
          CREATE INDEX IF NOT EXISTS idx_gift_rules_tipo_beneficiario 
          ON gift_rules(tipo_beneficiario);
        `
      },
      // 4. Criar tabela promoter_gifts
      {
        name: 'Criar tabela promoter_gifts',
        sql: `
          CREATE TABLE IF NOT EXISTS promoter_gifts (
            id SERIAL PRIMARY KEY,
            promoter_id INTEGER NOT NULL,
            evento_id INTEGER NOT NULL,
            gift_rule_id INTEGER NOT NULL,
            status VARCHAR(20) DEFAULT 'LIBERADO' CHECK (status IN ('LIBERADO', 'ENTREGUE', 'CANCELADO')),
            checkins_count INTEGER NOT NULL,
            liberado_em TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
            entregue_em TIMESTAMP NULL DEFAULT NULL,
            CONSTRAINT fk_promoter_gift_promoter FOREIGN KEY (promoter_id) REFERENCES promoters(promoter_id) ON DELETE CASCADE,
            CONSTRAINT fk_promoter_gift_evento FOREIGN KEY (evento_id) REFERENCES eventos(id) ON DELETE CASCADE,
            CONSTRAINT fk_promoter_gift_rule FOREIGN KEY (gift_rule_id) REFERENCES gift_rules(id) ON DELETE CASCADE
          );
        `
      },
      // 5. Criar índices para promoter_gifts
      {
        name: 'Criar índices da tabela promoter_gifts',
        sql: `
          CREATE INDEX IF NOT EXISTS idx_promoter_gifts_promoter ON promoter_gifts(promoter_id);
          CREATE INDEX IF NOT EXISTS idx_promoter_gifts_evento ON promoter_gifts(evento_id);
          CREATE INDEX IF NOT EXISTS idx_promoter_gifts_gift_rule ON promoter_gifts(gift_rule_id);
          CREATE INDEX IF NOT EXISTS idx_promoter_gifts_status ON promoter_gifts(status);
        `
      },
      // 6. Criar índice único
      {
        name: 'Criar índice único uq_promoter_gift',
        sql: `
          CREATE UNIQUE INDEX IF NOT EXISTS uq_promoter_gift_promoter_evento_rule 
          ON promoter_gifts(promoter_id, evento_id, gift_rule_id) 
          WHERE status != 'CANCELADO';
        `
      }
    ];
    
    console.log(`📝 Executando ${commands.length} comandos...\n`);
    
    for (let i = 0; i < commands.length; i++) {
      const cmd = commands[i];
      try {
        await client.query(cmd.sql);
        console.log(`✅ [${i + 1}/${commands.length}] ${cmd.name}`);
      } catch (error) {
        // Ignorar erros de "já existe"
        if (error.code === '42P07' || error.code === '42710' || error.message.includes('already exists')) {
          console.log(`⚠️  [${i + 1}/${commands.length}] ${cmd.name} - já existe (ignorado)`);
        } else {
          console.error(`❌ [${i + 1}/${commands.length}] ${cmd.name}`);
          console.error('   Erro:', error.message);
          throw error;
        }
      }
    }
    
    console.log('\n✅ Migração concluída com sucesso!');
    
    // Verificar resultados
    console.log('\n🔍 Verificando resultados...');
    
    // Verificar coluna
    const colCheck = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_schema = 'meu_backup_db' 
      AND table_name = 'gift_rules' 
      AND column_name = 'tipo_beneficiario'
    `);
    console.log(`   ${colCheck.rows.length > 0 ? '✅' : '❌'} Coluna tipo_beneficiario: ${colCheck.rows.length > 0 ? 'existe' : 'NÃO existe'}`);
    
    // Verificar tabela
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'meu_backup_db' 
        AND table_name = 'promoter_gifts'
      )
    `);
    console.log(`   ${tableCheck.rows[0].exists ? '✅' : '❌'} Tabela promoter_gifts: ${tableCheck.rows[0].exists ? 'existe' : 'NÃO existe'}`);
    
  } catch (error) {
    console.error('\n❌ Erro na migração:', error);
    console.error('   Mensagem:', error.message);
    console.error('   Código:', error.code);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration()
  .then(() => {
    console.log('\n🎉 Script finalizado!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Erro fatal:', error.message);
    process.exit(1);
  });

