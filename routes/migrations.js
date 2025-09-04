// routes/migrations.js

const express = require('express');
const router = express.Router();

module.exports = (pool) => {
  /**
   * @route   POST /api/migrations/run
   * @desc    Executa migrações pendentes
   * @access  Private (Admin)
   */
  router.post('/run', async (req, res) => {
    try {
      console.log('🔄 Iniciando execução de migrações...');
      
      // Verificar se a tabela restaurant_reservations existe
      const [tables] = await pool.execute("SHOW TABLES LIKE 'restaurant_reservations'");
      if (tables.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Tabela restaurant_reservations não existe'
        });
      }
      
      // Verificar se o campo establishment_id já existe
      const [columns] = await pool.execute('DESCRIBE restaurant_reservations');
      const hasEstablishmentId = columns.some(col => col.Field === 'establishment_id');
      
      if (hasEstablishmentId) {
        return res.json({
          success: true,
          message: 'Migração já foi executada - campo establishment_id já existe'
        });
      }
      
      // Executar migração
      console.log('📝 Adicionando campo establishment_id...');
      await pool.execute(`
        ALTER TABLE restaurant_reservations 
        ADD COLUMN establishment_id INT DEFAULT 1 AFTER id
      `);
      
      console.log('📝 Criando índice...');
      await pool.execute(`
        CREATE INDEX idx_restaurant_reservations_establishment_id 
        ON restaurant_reservations(establishment_id)
      `);
      
      console.log('📝 Atualizando registros existentes...');
      await pool.execute(`
        UPDATE restaurant_reservations 
        SET establishment_id = 1 
        WHERE establishment_id IS NULL
      `);
      
      console.log('✅ Migração executada com sucesso!');
      
      res.json({
        success: true,
        message: 'Migração executada com sucesso - campo establishment_id adicionado'
      });
      
    } catch (error) {
      console.error('❌ Erro ao executar migração:', error);
      res.status(500).json({
        success: false,
        error: 'Erro ao executar migração: ' + error.message
      });
    }
  });
  
  /**
   * @route   GET /api/migrations/status
   * @desc    Verifica status das migrações
   * @access  Private (Admin)
   */
  router.get('/status', async (req, res) => {
    try {
      // Verificar se a tabela restaurant_reservations existe
      const [tables] = await pool.execute("SHOW TABLES LIKE 'restaurant_reservations'");
      if (tables.length === 0) {
        return res.json({
          success: true,
          tableExists: false,
          establishmentIdExists: false,
          message: 'Tabela restaurant_reservations não existe'
        });
      }
      
      // Verificar se o campo establishment_id existe
      const [columns] = await pool.execute('DESCRIBE restaurant_reservations');
      const hasEstablishmentId = columns.some(col => col.Field === 'establishment_id');
      
      res.json({
        success: true,
        tableExists: true,
        establishmentIdExists: hasEstablishmentId,
        message: hasEstablishmentId ? 'Migração já executada' : 'Migração pendente'
      });
      
    } catch (error) {
      console.error('❌ Erro ao verificar status da migração:', error);
      res.status(500).json({
        success: false,
        error: 'Erro ao verificar status: ' + error.message
      });
    }
  });
  
  return router;
};
