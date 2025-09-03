// routes/reports.js

const express = require('express');
const router = express.Router();

module.exports = (pool) => {
  /**
   * @route   GET /api/reports/reservations
   * @desc    Gera relatórios de reservas com filtros opcionais
   * @access  Private
   */
  router.get('/reservations', async (req, res) => {
    try {
      const { 
        start_date, 
        end_date, 
        type = 'custom',
        area_id,
        status 
      } = req.query;
      
      let startDate, endDate;
      
      // Definir período baseado no tipo
      const today = new Date();
      switch (type) {
        case 'daily':
          startDate = endDate = today.toISOString().split('T')[0];
          break;
        case 'weekly':
          const startOfWeek = new Date(today);
          startOfWeek.setDate(today.getDate() - today.getDay());
          startDate = startOfWeek.toISOString().split('T')[0];
          endDate = today.toISOString().split('T')[0];
          break;
        case 'monthly':
          const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
          startDate = startOfMonth.toISOString().split('T')[0];
          endDate = today.toISOString().split('T')[0];
          break;
        case 'custom':
        default:
          startDate = start_date || today.toISOString().split('T')[0];
          endDate = end_date || today.toISOString().split('T')[0];
          break;
      }
      
      // Query base para reservas
      let query = `
        SELECT 
          rr.*,
          ra.name as area_name,
          u.name as created_by_name
        FROM restaurant_reservations rr
        LEFT JOIN restaurant_areas ra ON rr.area_id = ra.id
        LEFT JOIN users u ON rr.created_by = u.id
        WHERE rr.reservation_date BETWEEN ? AND ?
      `;
      
      const params = [startDate, endDate];
      
      if (area_id) {
        query += ` AND rr.area_id = ?`;
        params.push(area_id);
      }
      
      if (status) {
        query += ` AND rr.status = ?`;
        params.push(status);
      }
      
      query += ` ORDER BY rr.reservation_date DESC, rr.reservation_time DESC`;
      
      const [reservations] = await pool.execute(query, params);
      
      // Estatísticas gerais
      const [stats] = await pool.execute(`
        SELECT 
          COUNT(*) as total_reservations,
          COUNT(CASE WHEN status = 'CONFIRMADA' THEN 1 END) as confirmed_reservations,
          COUNT(CASE WHEN status = 'CANCELADA' THEN 1 END) as cancelled_reservations,
          COUNT(CASE WHEN status = 'NO_SHOW' THEN 1 END) as no_show_reservations,
          COUNT(CASE WHEN status = 'CONCLUIDA' THEN 1 END) as completed_reservations,
          SUM(number_of_people) as total_people,
          AVG(number_of_people) as avg_people_per_reservation
        FROM restaurant_reservations 
        WHERE reservation_date BETWEEN ? AND ?
        ${area_id ? 'AND area_id = ?' : ''}
        ${status ? 'AND status = ?' : ''}
      `, params);
      
      // Estatísticas por área
      const [areaStats] = await pool.execute(`
        SELECT 
          ra.name as area_name,
          COUNT(rr.id) as reservation_count,
          SUM(rr.number_of_people) as total_people,
          COUNT(CASE WHEN rr.status = 'CONFIRMADA' THEN 1 END) as confirmed_count,
          COUNT(CASE WHEN rr.status = 'CANCELADA' THEN 1 END) as cancelled_count
        FROM restaurant_areas ra
        LEFT JOIN restaurant_reservations rr ON ra.id = rr.area_id 
          AND rr.reservation_date BETWEEN ? AND ?
          ${area_id ? 'AND rr.area_id = ?' : ''}
          ${status ? 'AND rr.status = ?' : ''}
        WHERE ra.is_active = 1
        GROUP BY ra.id, ra.name
        ORDER BY reservation_count DESC
      `, params);
      
      // Estatísticas por origem
      const [originStats] = await pool.execute(`
        SELECT 
          origin,
          COUNT(*) as count,
          SUM(number_of_people) as total_people
        FROM restaurant_reservations 
        WHERE reservation_date BETWEEN ? AND ?
        ${area_id ? 'AND area_id = ?' : ''}
        ${status ? 'AND status = ?' : ''}
        GROUP BY origin
        ORDER BY count DESC
      `, params);
      
      // Estatísticas por dia da semana
      const [dayStats] = await pool.execute(`
        SELECT 
          DAYNAME(reservation_date) as day_name,
          DAYOFWEEK(reservation_date) as day_number,
          COUNT(*) as count,
          AVG(number_of_people) as avg_people
        FROM restaurant_reservations 
        WHERE reservation_date BETWEEN ? AND ?
        ${area_id ? 'AND area_id = ?' : ''}
        ${status ? 'AND status = ?' : ''}
        GROUP BY DAYOFWEEK(reservation_date), DAYNAME(reservation_date)
        ORDER BY day_number
      `, params);
      
      res.json({
        success: true,
        report: {
          period: {
            start_date: startDate,
            end_date: endDate,
            type: type
          },
          reservations: reservations,
          statistics: {
            general: stats[0],
            by_area: areaStats,
            by_origin: originStats,
            by_day: dayStats
          }
        }
      });
      
    } catch (error) {
      console.error('❌ Erro ao gerar relatório de reservas:', error);
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor'
      });
    }
  });

  /**
   * @route   GET /api/reports/walk-ins
   * @desc    Gera relatórios de passantes
   * @access  Private
   */
  router.get('/walk-ins', async (req, res) => {
    try {
      const { 
        start_date, 
        end_date, 
        area_id,
        status 
      } = req.query;
      
      const today = new Date();
      const startDate = start_date || today.toISOString().split('T')[0];
      const endDate = end_date || today.toISOString().split('T')[0];
      
      // Query para passantes
      let query = `
        SELECT 
          wi.*,
          ra.name as area_name,
          u.name as created_by_name
        FROM walk_ins wi
        LEFT JOIN restaurant_areas ra ON wi.area_id = ra.id
        LEFT JOIN users u ON wi.created_by = u.id
        WHERE DATE(wi.arrival_time) BETWEEN ? AND ?
      `;
      
      const params = [startDate, endDate];
      
      if (area_id) {
        query += ` AND wi.area_id = ?`;
        params.push(area_id);
      }
      
      if (status) {
        query += ` AND wi.status = ?`;
        params.push(status);
      }
      
      query += ` ORDER BY wi.arrival_time DESC`;
      
      const [walkIns] = await pool.execute(query, params);
      
      // Estatísticas de passantes
      const [stats] = await pool.execute(`
        SELECT 
          COUNT(*) as total_walk_ins,
          COUNT(CASE WHEN status = 'ATIVO' THEN 1 END) as active_walk_ins,
          COUNT(CASE WHEN status = 'FINALIZADO' THEN 1 END) as completed_walk_ins,
          COUNT(CASE WHEN status = 'CANCELADO' THEN 1 END) as cancelled_walk_ins,
          SUM(number_of_people) as total_people,
          AVG(number_of_people) as avg_people_per_walk_in
        FROM walk_ins 
        WHERE DATE(arrival_time) BETWEEN ? AND ?
        ${area_id ? 'AND area_id = ?' : ''}
        ${status ? 'AND status = ?' : ''}
      `, params);
      
      res.json({
        success: true,
        report: {
          period: {
            start_date: startDate,
            end_date: endDate
          },
          walkIns: walkIns,
          statistics: stats[0]
        }
      });
      
    } catch (error) {
      console.error('❌ Erro ao gerar relatório de passantes:', error);
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor'
      });
    }
  });

  /**
   * @route   GET /api/reports/waitlist
   * @desc    Gera relatórios da lista de espera
   * @access  Private
   */
  router.get('/waitlist', async (req, res) => {
    try {
      const { 
        start_date, 
        end_date, 
        status 
      } = req.query;
      
      const today = new Date();
      const startDate = start_date || today.toISOString().split('T')[0];
      const endDate = end_date || today.toISOString().split('T')[0];
      
      // Query para lista de espera
      let query = `
        SELECT 
          wl.*
        FROM waitlist wl
        WHERE DATE(wl.created_at) BETWEEN ? AND ?
      `;
      
      const params = [startDate, endDate];
      
      if (status) {
        query += ` AND wl.status = ?`;
        params.push(status);
      }
      
      query += ` ORDER BY wl.created_at DESC`;
      
      const [waitlist] = await pool.execute(query, params);
      
      // Estatísticas da lista de espera
      const [stats] = await pool.execute(`
        SELECT 
          COUNT(*) as total_entries,
          COUNT(CASE WHEN status = 'AGUARDANDO' THEN 1 END) as waiting_entries,
          COUNT(CASE WHEN status = 'CHAMADO' THEN 1 END) as called_entries,
          COUNT(CASE WHEN status = 'ATENDIDO' THEN 1 END) as served_entries,
          COUNT(CASE WHEN status = 'CANCELADO' THEN 1 END) as cancelled_entries,
          AVG(estimated_wait_time) as avg_wait_time,
          AVG(number_of_people) as avg_people_per_entry
        FROM waitlist 
        WHERE DATE(created_at) BETWEEN ? AND ?
        ${status ? 'AND status = ?' : ''}
      `, params);
      
      res.json({
        success: true,
        report: {
          period: {
            start_date: startDate,
            end_date: endDate
          },
          waitlist: waitlist,
          statistics: stats[0]
        }
      });
      
    } catch (error) {
      console.error('❌ Erro ao gerar relatório da lista de espera:', error);
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor'
      });
    }
  });

  /**
   * @route   GET /api/reports/dashboard
   * @desc    Gera estatísticas para o dashboard
   * @access  Private
   */
  router.get('/dashboard', async (req, res) => {
    try {
      const today = new Date().toISOString().split('T')[0];
      
      // Estatísticas gerais
      const [generalStats] = await pool.execute(`
        SELECT 
          (SELECT COUNT(*) FROM restaurant_reservations) as total_reservations,
          (SELECT COUNT(*) FROM restaurant_reservations WHERE reservation_date = ?) as today_reservations,
          (SELECT COUNT(*) FROM walk_ins WHERE status = 'ATIVO') as active_walk_ins,
          (SELECT COUNT(*) FROM waitlist WHERE status = 'AGUARDANDO') as waitlist_count
      `, [today]);
      
      // Taxa de ocupação hoje
      const [occupancyStats] = await pool.execute(`
        SELECT 
          (COUNT(CASE WHEN status IN ('CONFIRMADA', 'CONCLUIDA') THEN 1 END) * 100.0 / COUNT(*)) as occupancy_rate
        FROM restaurant_reservations 
        WHERE reservation_date = ?
      `, [today]);
      
      // Reservas recentes
      const [recentReservations] = await pool.execute(`
        SELECT 
          rr.*,
          ra.name as area_name
        FROM restaurant_reservations rr
        LEFT JOIN restaurant_areas ra ON rr.area_id = ra.id
        ORDER BY rr.created_at DESC
        LIMIT 5
      `);
      
      // Passantes recentes
      const [recentWalkIns] = await pool.execute(`
        SELECT 
          wi.*,
          ra.name as area_name
        FROM walk_ins wi
        LEFT JOIN restaurant_areas ra ON wi.area_id = ra.id
        ORDER BY wi.arrival_time DESC
        LIMIT 5
      `);
      
      res.json({
        success: true,
        dashboard: {
          stats: {
            ...generalStats[0],
            occupancyRate: Math.round(occupancyStats[0].occupancy_rate || 0)
          },
          recentReservations: recentReservations,
          recentWalkIns: recentWalkIns
        }
      });
      
    } catch (error) {
      console.error('❌ Erro ao gerar estatísticas do dashboard:', error);
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor'
      });
    }
  });

  return router;
};
