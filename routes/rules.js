// Em routes/rules.js

const express = require('express');
// Precisamos do { mergeParams: true } para que este router consiga
// acessar parâmetros da URL que foram definidos antes dele (como o :eventId)
const router = express.Router({ mergeParams: true });

const auth = require('../middleware/auth');
const authorizeRoles = require('../middleware/authorize');

module.exports = (pool) => {


    

  /**
   * @route   POST /api/events/:eventId/rules
   * @desc    Cria uma nova regra para um evento específico
   * @access  Private (Admin, Gerente)
   */
  router.post('/', auth, authorizeRoles('admin', 'gerente'), async (req, res) => {
    // O eventId vem dos parâmetros da URL, graças ao mergeParams
    const { eventId } = req.params;
    const { tipo_regra, valor_regra, descricao, valor_extra } = req.body;

    if (!tipo_regra || !valor_regra || !descricao) {
      return res.status(400).json({ message: 'Os campos tipo_regra, valor_regra e descricao são obrigatórios.' });
    }

    try {
      const sql = `
        INSERT INTO regras_evento 
          (evento_id, tipo_regra, valor_regra, descricao, valor_extra) 
        VALUES ($1, $2, $3, $4, $5) RETURNING id
      `;
      
      const result = await pool.query(sql, [
        eventId,
        tipo_regra,
        valor_regra,
        descricao,
        valor_extra || null
      ]);

      const newRuleId = result.rows[0].id;
      const newRuleResult = await pool.query('SELECT * FROM regras_evento WHERE id = $1', [newRuleId]);

      res.status(201).json(newRuleResult.rows[0]);

    } catch (error) {
      console.error(`Erro ao criar regra para o evento ${eventId}:`, error);
      res.status(500).json({ error: 'Erro ao criar a regra.' });
    }
  });

  
    // ===================================================================
  // --- NOVAS ROTAS ADICIONADAS ABAIXO ---
  // ===================================================================

  /**
   * @route   GET /api/events/:eventId/rules
   * @desc    Lista TODAS as regras (ativas e inativas) de um evento. Para o Dashboard.
   * @access  Private (Admin, Gerente)
   */
  router.get('/', auth, authorizeRoles('admin', 'gerente'), async (req, res) => {
    const { eventId } = req.params;
    try {
      const result = await pool.query('SELECT * FROM regras_evento WHERE evento_id = $1', [eventId]);
      res.status(200).json(result.rows);
    } catch (error) {
      console.error(`Erro ao buscar regras para o evento ${eventId}:`, error);
      res.status(500).json({ error: 'Erro ao buscar regras.' });
    }
  });


  /**
   * @route   GET /api/events/:eventId/rules/public
   * @desc    Lista apenas as regras ATIVAS de um evento. Para o App do Cliente.
   * @access  Private (Qualquer usuário logado)
   */
  router.get('/public', auth, async (req, res) => {
    const { eventId } = req.params;
    try {
      const sql = "SELECT * FROM regras_evento WHERE evento_id = $1 AND status = 'ATIVA'";
      const result = await pool.query(sql, [eventId]);
      res.status(200).json(result.rows);
    } catch (error){
      console.error(`Erro ao buscar regras públicas para o evento ${eventId}:`, error);
      res.status(500).json({ error: 'Erro ao buscar regras.' });
    }
  });




  return router;
};