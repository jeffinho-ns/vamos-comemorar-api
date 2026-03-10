const express = require('express');
const authenticateToken = require('../middleware/auth');

module.exports = (pool) => {
  const router = express.Router();

  // Garante que a tabela de bloqueios exista (útil em ambientes onde a migration ainda não rodou)
  const ensureBlocksTableExists = async () => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS restaurant_reservation_blocks (
        id SERIAL PRIMARY KEY,
        establishment_id INT NOT NULL,
        area_id INT NULL,
        start_datetime TIMESTAMP NOT NULL,
        end_datetime   TIMESTAMP NOT NULL,
        reason TEXT NOT NULL,
        recurrence_type VARCHAR(20) NOT NULL DEFAULT 'none',
        recurrence_weekday SMALLINT NULL,
        max_people_capacity INT NULL,
        created_by INT NULL REFERENCES users(id),
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_reservation_blocks_estab_date
        ON restaurant_reservation_blocks (establishment_id, start_datetime, end_datetime);
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_reservation_blocks_area
        ON restaurant_reservation_blocks (area_id);
    `);
  };

  // Lista bloqueios com filtros opcionais
  // IMPORTANTE: rota pública (sem autenticação) para permitir que o frontend
  // da página /reservar oculte horários bloqueados. Os dados expostos aqui
  // não incluem informações sensíveis de usuário.
  router.get('/', async (req, res) => {
    try {
      const { establishment_id, date } = req.query;
      const params = [];
      let where = 'WHERE 1=1';

      if (establishment_id) {
        params.push(establishment_id);
        where += ` AND establishment_id = $${params.length}`;
      }

      if (date) {
        // Bloqueios que tocam o dia informado
        params.push(date);
        params.push(date);
        where += ` AND start_datetime::date <= $${params.length - 1}
                   AND end_datetime::date >= $${params.length}`;
      }

      let result;
      try {
        result = await pool.query(
          `SELECT * FROM restaurant_reservation_blocks ${where}
           ORDER BY start_datetime ASC`,
          params
        );
      } catch (error) {
        // Se a tabela não existir (erro 42P01), cria e tenta de novo
        if (error.code === '42P01') {
          console.warn('Tabela restaurant_reservation_blocks não encontrada. Criando automaticamente...');
          await ensureBlocksTableExists();
          result = await pool.query(
            `SELECT * FROM restaurant_reservation_blocks ${where}
             ORDER BY start_datetime ASC`,
            params
          );
        } else {
          throw error;
        }
      }

      res.json({ success: true, blocks: result.rows });
    } catch (error) {
      console.error('❌ Erro ao buscar bloqueios de agenda:', error);
      res.status(500).json({ success: false, error: 'Erro interno do servidor' });
    }
  });

  // Cria um novo bloqueio
  router.post('/', authenticateToken, async (req, res) => {
    try {
      const {
        establishment_id,
        area_id,
        start_datetime,
        end_datetime,
        reason,
        recurrence_type = 'none',
        recurrence_weekday = null,
        max_people_capacity = null,
      } = req.body;

      if (!establishment_id || !start_datetime || !end_datetime || !reason) {
        return res.status(400).json({
          success: false,
          error: 'Campos obrigatórios: establishment_id, start_datetime, end_datetime, reason',
        });
      }

      const userId = req.user?.id || null;

      let result;
      try {
        result = await pool.query(
          `INSERT INTO restaurant_reservation_blocks (
            establishment_id, area_id, start_datetime, end_datetime,
            reason, recurrence_type, recurrence_weekday, max_people_capacity, created_by
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
          RETURNING *`,
          [
            establishment_id,
            area_id || null,
            start_datetime,
            end_datetime,
            reason,
            recurrence_type,
            recurrence_weekday,
            max_people_capacity,
            userId,
          ]
        );
      } catch (error) {
        // Se a tabela não existir (erro 42P01), cria e tenta de novo
        if (error.code === '42P01') {
          console.warn('Tabela restaurant_reservation_blocks não encontrada. Criando automaticamente...');
          await ensureBlocksTableExists();
          result = await pool.query(
            `INSERT INTO restaurant_reservation_blocks (
              establishment_id, area_id, start_datetime, end_datetime,
              reason, recurrence_type, recurrence_weekday, max_people_capacity, created_by
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
            RETURNING *`,
            [
              establishment_id,
              area_id || null,
              start_datetime,
              end_datetime,
              reason,
              recurrence_type,
              recurrence_weekday,
              max_people_capacity,
              userId,
            ]
          );
        } else {
          throw error;
        }
      }

      res.status(201).json({ success: true, block: result.rows[0] });
    } catch (error) {
      console.error('❌ Erro ao criar bloqueio de agenda:', error);
      res.status(500).json({ success: false, error: 'Erro interno do servidor' });
    }
  });

  // Atualiza um bloqueio existente
  router.put('/:id', authenticateToken, async (req, res) => {
    try {
      const { id } = req.params;
      const {
        area_id,
        start_datetime,
        end_datetime,
        reason,
        recurrence_type,
        recurrence_weekday,
        max_people_capacity,
      } = req.body;

      const fields = [];
      const params = [];
      let idx = 1;

      const addField = (name, value) => {
        fields.push(`${name} = $${idx}`);
        params.push(value);
        idx += 1;
      };

      if (area_id !== undefined) addField('area_id', area_id);
      if (start_datetime !== undefined) addField('start_datetime', start_datetime);
      if (end_datetime !== undefined) addField('end_datetime', end_datetime);
      if (reason !== undefined) addField('reason', reason);
      if (recurrence_type !== undefined) addField('recurrence_type', recurrence_type);
      if (recurrence_weekday !== undefined) addField('recurrence_weekday', recurrence_weekday);
      if (max_people_capacity !== undefined) addField('max_people_capacity', max_people_capacity);

      if (!fields.length) {
        return res.status(400).json({ success: false, error: 'Nenhum campo para atualizar' });
      }

      params.push(id);

      await pool.query(
        `UPDATE restaurant_reservation_blocks
         SET ${fields.join(', ')}
         WHERE id = $${idx}`,
        params
      );

      res.json({ success: true });
    } catch (error) {
      console.error('❌ Erro ao atualizar bloqueio de agenda:', error);
      res.status(500).json({ success: false, error: 'Erro interno do servidor' });
    }
  });

  // Remove um bloqueio
  router.delete('/:id', authenticateToken, async (req, res) => {
    try {
      const { id } = req.params;
      await pool.query('DELETE FROM restaurant_reservation_blocks WHERE id = $1', [id]);
      res.json({ success: true });
    } catch (error) {
      console.error('❌ Erro ao deletar bloqueio de agenda:', error);
      res.status(500).json({ success: false, error: 'Erro interno do servidor' });
    }
  });

  return router;
};

