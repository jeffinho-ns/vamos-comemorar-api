// routes/restaurantTables.js

const express = require('express');
const router = express.Router();

module.exports = (pool) => {
  // Garante que a tabela restaurant_tables exista
  async function ensureTablesSchema() {
    const [tables] = await pool.execute("SHOW TABLES LIKE 'restaurant_tables'");
    if (tables.length === 0) {
      await pool.execute(`
        CREATE TABLE restaurant_tables (
          id int(11) NOT NULL AUTO_INCREMENT,
          area_id int(11) NOT NULL,
          table_number varchar(50) NOT NULL,
          capacity int(11) NOT NULL DEFAULT 2,
          table_type varchar(50) DEFAULT NULL,
          description text DEFAULT NULL,
          is_active tinyint(1) DEFAULT 1,
          created_at timestamp NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          UNIQUE KEY uniq_area_table (area_id, table_number),
          KEY idx_area_id (area_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    }
  }

  // Lista mesas (opcionalmente por área)
  router.get('/', async (req, res) => {
    try {
      await ensureTablesSchema();
      const { area_id } = req.query;
      const where = [];
      const params = [];
      if (area_id) {
        where.push('area_id = ?');
        params.push(area_id);
      }
      const query = `
        SELECT * FROM restaurant_tables
        ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
        ORDER BY area_id ASC, CAST(table_number AS UNSIGNED) ASC, table_number ASC
      `;
      const [rows] = await pool.execute(query, params);
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

      const [tables] = await pool.execute(
        'SELECT * FROM restaurant_tables WHERE area_id = ? AND is_active = 1 ORDER BY CAST(table_number AS UNSIGNED) ASC, table_number ASC',
        [areaId]
      );

      // Busca reservas do dia para as mesas da área (bloqueia o dia todo)
      const [reservedRows] = await pool.execute(
        `SELECT table_number FROM restaurant_reservations
         WHERE reservation_date = ? AND area_id = ?
         ${establishment_id ? 'AND (establishment_id = ? OR establishment_id IS NULL)' : ''}
         AND status NOT IN ('CANCELADA')`,
        establishment_id ? [date, areaId, establishment_id] : [date, areaId]
      );

      const reservedSet = new Set(reservedRows.map(r => String(r.table_number)));
      const data = tables.map(t => ({
        ...t,
        is_reserved: reservedSet.has(String(t.table_number))
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
      const [result] = await pool.execute(
        `INSERT INTO restaurant_tables (area_id, table_number, capacity, table_type, description, is_active)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [area_id, String(table_number), capacity || 2, table_type || null, description || null, is_active ?? 1]
      );
      const [row] = await pool.execute('SELECT * FROM restaurant_tables WHERE id = ?', [result.insertId]);
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
      if (area_id !== undefined) { updates.push('area_id = ?'); params.push(area_id); }
      if (table_number !== undefined) { updates.push('table_number = ?'); params.push(String(table_number)); }
      if (capacity !== undefined) { updates.push('capacity = ?'); params.push(capacity); }
      if (table_type !== undefined) { updates.push('table_type = ?'); params.push(table_type); }
      if (description !== undefined) { updates.push('description = ?'); params.push(description); }
      if (is_active !== undefined) { updates.push('is_active = ?'); params.push(is_active); }
      updates.push('updated_at = CURRENT_TIMESTAMP');
      params.push(id);

      await pool.execute(`UPDATE restaurant_tables SET ${updates.join(', ')} WHERE id = ?`, params);
      const [row] = await pool.execute('SELECT * FROM restaurant_tables WHERE id = ?', [id]);
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
      await pool.execute('DELETE FROM restaurant_tables WHERE id = ?', [id]);
      res.json({ success: true });
    } catch (error) {
      console.error('❌ Erro ao deletar mesa:', error);
      res.status(500).json({ success: false, error: 'Erro interno do servidor' });
    }
  });

  return router;
};

























