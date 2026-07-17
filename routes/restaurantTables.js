// routes/restaurantTables.js

const express = require('express');
const router = express.Router();
const optionalAuth = require('../middleware/optionalAuth');
const tenantMiddleware = require('../tenancy/tenantMiddleware');
const requireModule = require('../tenancy/requireModule');
const reservasPermissionMiddleware = require('../tenancy/reservasPermissionMiddleware');
const establishmentRules = require('../services/establishmentRules');

module.exports = (pool) => {
  // Segurança consistente com restaurant-areas. Anônimo (formulário público /reservar)
  // continua passando em GET (requireModule/reservasPermission liberam sem token);
  // POST/PUT/DELETE exigem permissão fina quando autenticado.
  router.use(optionalAuth);
  router.use(tenantMiddleware());
  router.use(requireModule('reservas'));
  router.use(reservasPermissionMiddleware);

  // Tabela restaurant_tables já deve existir no PostgreSQL
  async function ensureTablesSchema() {
    // Schema já existe no PostgreSQL
  }

  // Lista mesas (opcionalmente por área e/ou estabelecimento)
  router.get('/', async (req, res) => {
    try {
      await ensureTablesSchema();
      const { area_id, establishment_id } = req.query;
      const where = [];
      const params = [];
      let paramIndex = 1;
      if (area_id) {
        where.push(`rt.area_id = $${paramIndex++}`);
        params.push(area_id);
      }
      if (establishment_id) {
        // Mesas próprias do estabelecimento OU mesas legadas cuja área é visível ao estabelecimento.
        where.push(
          `(rt.establishment_id = $${paramIndex} OR rt.establishment_id IS NULL)`,
        );
        params.push(establishment_id);
        paramIndex += 1;
      }
      const query = `
        SELECT rt.* FROM restaurant_tables rt
        ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
        ORDER BY rt.area_id ASC, CAST(rt.table_number AS INTEGER) ASC, rt.table_number ASC
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
      let overlapBlocking = false;
      if (establishment_id) {
        const estRules = await establishmentRules.getEstablishmentRules(
          pool,
          Number(establishment_id),
        );
        overlapBlocking = establishmentRules.usesTableOverlapBlocking(estRules);
      }
      const data = tables.map(t => ({
        ...t,
        is_reserved: overlapBlocking
          ? false
          : reservedSet.has(String(t.table_number)),
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
      const { area_id, table_number, capacity, table_type, description, is_active, establishment_id } = req.body;
      if (!area_id || !table_number) {
        return res.status(400).json({ success: false, error: 'Campos obrigatórios: area_id, table_number' });
      }

      // Deriva establishment_id da área quando não informado (mantém consistência).
      let establishmentIdNumber =
        establishment_id != null && String(establishment_id).trim() !== ''
          ? Number(establishment_id)
          : null;
      const areaResult = await pool.query(
        'SELECT id, establishment_id FROM restaurant_areas WHERE id = $1',
        [area_id],
      );
      const area = areaResult.rows[0];
      if (!area) {
        return res.status(400).json({ success: false, error: 'area_id inválido' });
      }
      if (establishmentIdNumber == null && area.establishment_id != null) {
        establishmentIdNumber = Number(area.establishment_id);
      }
      // Não permite criar mesa em área legada compartilhada (evita afetar outras casas).
      if (area.establishment_id == null) {
        return res.status(403).json({
          success: false,
          error: 'Não é possível adicionar mesas a uma área padrão do sistema. Crie uma área própria do estabelecimento.',
        });
      }
      // Evita duplicidade de número de mesa na mesma área.
      const dup = await pool.query(
        'SELECT id FROM restaurant_tables WHERE area_id = $1 AND table_number = $2 AND is_active = TRUE',
        [area_id, String(table_number)],
      );
      if (dup.rows.length > 0) {
        return res.status(400).json({ success: false, error: 'Já existe uma mesa com este número nesta área' });
      }

      const isActiveValue = is_active === 0 || is_active === false || is_active === '0' ? false : true;
      const result = await pool.query(
        `INSERT INTO restaurant_tables (area_id, table_number, capacity, table_type, description, is_active, establishment_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [area_id, String(table_number), capacity || 2, table_type || null, description || null, isActiveValue, establishmentIdNumber]
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

      // Protege mesas legadas compartilhadas (Highline/Justino usam área legada).
      const currentResult = await pool.query(
        'SELECT id, establishment_id FROM restaurant_tables WHERE id = $1',
        [id],
      );
      const current = currentResult.rows[0];
      if (!current) {
        return res.status(404).json({ success: false, error: 'Mesa não encontrada' });
      }
      if (current.establishment_id == null) {
        return res.status(403).json({
          success: false,
          error: 'Esta é uma mesa padrão do sistema (compartilhada) e não pode ser editada.',
        });
      }

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
      const currentResult = await pool.query(
        'SELECT id, establishment_id FROM restaurant_tables WHERE id = $1',
        [id],
      );
      const current = currentResult.rows[0];
      if (!current) {
        return res.status(404).json({ success: false, error: 'Mesa não encontrada' });
      }
      if (current.establishment_id == null) {
        return res.status(403).json({
          success: false,
          error: 'Esta é uma mesa padrão do sistema (compartilhada) e não pode ser excluída.',
        });
      }
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






























