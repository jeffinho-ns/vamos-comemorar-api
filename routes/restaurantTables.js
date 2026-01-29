// routes/restaurantTables.js

const express = require('express');
const router = express.Router();

module.exports = (pool) => {
  // Tabela restaurant_tables já deve existir no PostgreSQL
  async function ensureTablesSchema() {
    // Schema já existe no PostgreSQL
  }

  // Lista mesas (opcionalmente por área)
  router.get('/', async (req, res) => {
    try {
      await ensureTablesSchema();
      const { area_id } = req.query;
      const where = [];
      const params = [];
      let paramIndex = 1;
      if (area_id) {
        where.push(`area_id = $${paramIndex++}`);
        params.push(area_id);
      }
      const query = `
        SELECT * FROM restaurant_tables
        ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
        ORDER BY area_id ASC, CAST(table_number AS INTEGER) ASC, table_number ASC
      `;
      const rowsResult = await pool.query(query, params);
      const rows = rowsResult.rows;
      res.json({ success: true, tables: rows });
    } catch (error) {
      console.error('❌ Erro ao listar mesas:', error);
      res.status(500).json({ success: false, error: 'Erro interno do servidor' });
    }
  });

  // Disponibilidade das mesas de uma área por data
  router.get('/:areaId/availability', async (req, res) => {
    try {
      await ensureTablesSchema();
      const { areaId } = req.params;
      const { date, establishment_id } = req.query;
      if (!date) {
        return res.status(400).json({ success: false, error: 'Parâmetro obrigatório: date (YYYY-MM-DD)' });
      }

      const tablesResult = await pool.query(
        'SELECT * FROM restaurant_tables WHERE area_id = $1 AND is_active = TRUE ORDER BY CAST(table_number AS INTEGER) ASC, table_number ASC',
        [areaId]
      );
      const tables = tablesResult.rows;

      // Busca reservas do dia para as mesas da área
      // IMPORTANTE: Justino/Pracinha são RESTAURANTES (reservas por algumas horas, não dia todo)
      // Highline é BALADA (reservas bloqueiam o dia todo)
      // Para Justino/Pracinha, o frontend calcula por overlap de horário (2h)
      // Este endpoint só marca como reservada se houver reserva ATIVA (não cancelada/finalizada)
      let reservedQuery = `SELECT table_number FROM restaurant_reservations
         WHERE reservation_date = $1 AND area_id = $2`;
      let reservedParams = [date, areaId];
      if (establishment_id) {
        reservedQuery += ' AND (establishment_id = $3 OR establishment_id IS NULL)';
        reservedParams.push(establishment_id);
      }
      // Filtrar apenas status que realmente bloqueiam a mesa
      reservedQuery += ` AND status NOT IN (
        'CANCELADA', 'CANCELED', 'CANCELLED',
        'COMPLETED', 'CONCLUIDA', 'CONCLUÍDA', 'FINALIZADA', 'FINALIZED',
        'NO_SHOW', 'NO-SHOW'
      )`;
      const reservedRowsResult = await pool.query(reservedQuery, reservedParams);
      const reservedRows = reservedRowsResult.rows;

      const reservedSet = new Set(reservedRows.map(r => String(r.table_number)));
      const data = tables.map(t => ({
        ...t,
        // Justino/Pracinha são RESTAURANTES: frontend calcula por overlap de horário (2h)
        // Highline é BALADA: bloqueio do dia todo quando há reserva confirmada
        is_reserved: (establishment_id && (establishment_id === 1 || establishment_id === 8))
          ? false  // Justino/Pracinha (restaurantes): frontend calcula por overlap de horário
          : reservedSet.has(String(t.table_number))  // Highline/outros (baladas): bloqueio do dia todo
      }));

      res.json({ success: true, date, area_id: Number(areaId), tables: data });
    } catch (error) {
      console.error('❌ Erro ao checar disponibilidade de mesas:', error);
      res.status(500).json({ success: false, error: 'Erro interno do servidor' });
    }
  });

  // Criar mesa
  router.post('/', async (req, res) => {
    try {
      await ensureTablesSchema();
      const { area_id, table_number, capacity, table_type, description, is_active } = req.body;
      if (!area_id || !table_number) {
        return res.status(400).json({ success: false, error: 'Campos obrigatórios: area_id, table_number' });
      }
      const result = await pool.query(
        `INSERT INTO restaurant_tables (area_id, table_number, capacity, table_type, description, is_active)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [area_id, String(table_number), capacity || 2, table_type || null, description || null, is_active ?? 1]
      );
      const rowResult = await pool.query('SELECT * FROM restaurant_tables WHERE id = $1', [result.rows[0].id]);
      const row = rowResult.rows;
      res.status(201).json({ success: true, table: row[0] });
    } catch (error) {
      console.error('❌ Erro ao criar mesa:', error);
      res.status(500).json({ success: false, error: 'Erro interno do servidor' });
    }
  });

  // Atualizar mesa
  router.put('/:id', async (req, res) => {
    try {
      await ensureTablesSchema();
      const { id } = req.params;
      const { area_id, table_number, capacity, table_type, description, is_active } = req.body;

      const updates = [];
      const params = [];
      let paramIndex = 1;
      if (area_id !== undefined) { updates.push(`area_id = $${paramIndex++}`); params.push(area_id); }
      if (table_number !== undefined) { updates.push(`table_number = $${paramIndex++}`); params.push(String(table_number)); }
      if (capacity !== undefined) { updates.push(`capacity = $${paramIndex++}`); params.push(capacity); }
      if (table_type !== undefined) { updates.push(`table_type = $${paramIndex++}`); params.push(table_type); }
      if (description !== undefined) { updates.push(`description = $${paramIndex++}`); params.push(description); }
      if (is_active !== undefined) { updates.push(`is_active = $${paramIndex++}`); params.push(is_active); }
      updates.push('updated_at = CURRENT_TIMESTAMP');
      params.push(id);

      await pool.query(`UPDATE restaurant_tables SET ${updates.join(', ')} WHERE id = $${paramIndex}`, params);
      const rowResult = await pool.query('SELECT * FROM restaurant_tables WHERE id = $1', [id]);
      const row = rowResult.rows;
      res.json({ success: true, table: row[0] });
    } catch (error) {
      console.error('❌ Erro ao atualizar mesa:', error);
      res.status(500).json({ success: false, error: 'Erro interno do servidor' });
    }
  });

  // Deletar mesa
  router.delete('/:id', async (req, res) => {
    try {
      await ensureTablesSchema();
      const { id } = req.params;
      await pool.query('DELETE FROM restaurant_tables WHERE id = $1', [id]);
      res.json({ success: true });
    } catch (error) {
      console.error('❌ Erro ao deletar mesa:', error);
      res.status(500).json({ success: false, error: 'Erro interno do servidor' });
    }
  });

  // C. LIBERAÇÃO MANUAL DE MESA (EXCLUSIVO HIGHLINE DECK)
  // Esta rota cancela reservas confirmadas de uma mesa específica em uma data para liberação manual
  router.patch('/:tableNumber/force-available', async (req, res) => {
    try {
      await ensureTablesSchema();
      const { tableNumber } = req.params;
      const { date, area_id } = req.query;

      if (!date || !area_id) {
        return res.status(400).json({ 
          success: false, 
          error: 'Parâmetros obrigatórios: date (YYYY-MM-DD) e area_id' 
        });
      }

      // Buscar todas as reservas confirmadas da mesa na data especificada
      // Mesas podem ser múltiplas (separadas por vírgula), então precisamos verificar
      const reservedQuery = `
        SELECT id, table_number, client_name, reservation_time, status 
        FROM restaurant_reservations
        WHERE reservation_date = $1 
          AND area_id = $2 
          AND status = 'CONFIRMADA'
          AND (
            table_number = $3 
            OR table_number LIKE $4 
            OR table_number LIKE $5 
            OR table_number LIKE $6
          )
      `;
      
      const tableNumStr = String(tableNumber);
      const params = [
        date,
        area_id,
        tableNumStr,
        `${tableNumStr},%`,  // Mesa no início
        `%,${tableNumStr}`,  // Mesa no final
        `%,${tableNumStr},%` // Mesa no meio
      ];

      const reservedResult = await pool.query(reservedQuery, params);
      const reservations = reservedResult.rows;

      if (reservations.length === 0) {
        return res.json({ 
          success: true, 
          message: 'Nenhuma reserva confirmada encontrada para esta mesa nesta data',
          cancelled_count: 0
        });
      }

      // Cancelar todas as reservas encontradas
      const reservationIds = reservations.map(r => r.id);
      
      if (reservationIds.length > 0) {
        // Construir query com placeholders para cada ID
        const placeholders = reservationIds.map((_, index) => `$${index + 1}`).join(',');
        const cancelQuery = `
          UPDATE restaurant_reservations
          SET status = 'CANCELADA',
              updated_at = CURRENT_TIMESTAMP,
              notes = COALESCE(notes || E'\\n', '') || E'\\n[LIBERAÇÃO MANUAL] Mesa liberada manualmente pelo admin em ' || CURRENT_TIMESTAMP::text
          WHERE id IN (${placeholders})
        `;

        await pool.query(cancelQuery, reservationIds);
      }

      console.log(`✅ [LIBERAÇÃO MANUAL] ${reservationIds.length} reserva(s) cancelada(s) para mesa ${tableNumber} na data ${date}`);

      res.json({ 
        success: true, 
        message: `Mesa ${tableNumber} liberada com sucesso`,
        cancelled_count: reservationIds.length,
        cancelled_reservations: reservations.map(r => ({
          id: r.id,
          client_name: r.client_name,
          reservation_time: r.reservation_time
        }))
      });
    } catch (error) {
      console.error('❌ Erro ao liberar mesa manualmente:', error);
      res.status(500).json({ success: false, error: 'Erro interno do servidor' });
    }
  });

  return router;
};






























