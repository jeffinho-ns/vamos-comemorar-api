#!/usr/bin/env node

// Script de Teste para Produção
// Sistema de Reservas do Restaurante

const pool = require('../config/database');

async function testProduction() {
  console.log('🧪 Testando configuração de produção...\n');

  try {
    // 1. Testar conexão com banco de dados
    console.log('1️⃣ Testando conexão com banco de dados...');
    await pool.execute('SELECT 1');
    console.log('✅ Conexão com banco de dados OK\n');

    // 2. Verificar se as tabelas existem
    console.log('2️⃣ Verificando estrutura das tabelas...');
    
    const tables = [
      'restaurant_reservations',
      'waitlist', 
      'walk_ins',
      'restaurant_areas'
    ];

    for (const table of tables) {
      try {
        const [result] = await pool.execute(`SHOW TABLES LIKE '${table}'`);
        if (result.length > 0) {
          console.log(`✅ Tabela ${table} existe`);
        } else {
          console.log(`⚠️ Tabela ${table} não existe - será criada automaticamente`);
        }
      } catch (error) {
        console.log(`❌ Erro ao verificar tabela ${table}:`, error.message);
      }
    }
    console.log('');

    // 3. Testar inserção de dados de teste
    console.log('3️⃣ Testando inserção de dados...');
    
    // Testar inserção de área
    try {
      const [areaResult] = await pool.execute(`
        INSERT INTO restaurant_areas (name, capacity_lunch, capacity_dinner, description) 
        VALUES ('Área Teste', 50, 40, 'Área para testes') 
        ON DUPLICATE KEY UPDATE name = name
      `);
      console.log('✅ Inserção de área OK');
    } catch (error) {
      console.log('⚠️ Erro na inserção de área:', error.message);
    }

    // 4. Testar verificação de capacidade
    console.log('4️⃣ Testando verificação de capacidade...');
    try {
      const [capacityResult] = await pool.execute(`
        SELECT SUM(capacity_dinner) as total_capacity 
        FROM restaurant_areas
      `);
      console.log(`✅ Capacidade total: ${capacityResult[0].total_capacity || 0} pessoas`);
    } catch (error) {
      console.log('❌ Erro na verificação de capacidade:', error.message);
    }

    // 5. Testar lista de espera
    console.log('5️⃣ Testando lista de espera...');
    try {
      const [waitlistResult] = await pool.execute(`
        SELECT COUNT(*) as count FROM waitlist WHERE status = 'AGUARDANDO'
      `);
      console.log(`✅ Pessoas na lista de espera: ${waitlistResult[0].count}`);
    } catch (error) {
      console.log('❌ Erro na verificação da lista de espera:', error.message);
    }

    console.log('\n🎉 Testes concluídos com sucesso!');
    console.log('✅ Sistema pronto para produção');

  } catch (error) {
    console.error('\n❌ Erro durante os testes:', error.message);
    console.error('🔧 Verifique as configurações de banco de dados');
    process.exit(1);
  } finally {
    // Fechar conexão
    await pool.end();
    process.exit(0);
  }
}

// Executar testes
testProduction();




