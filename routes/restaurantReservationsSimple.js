// routes/restaurantReservationsSimple.js

const express = require('express');
const router = express.Router();

module.exports = (pool) => {
  /**
   * @route   POST /api/restaurant-reservations
   * @desc    Cria uma nova reserva
   * @access  Private
   */
  router.post('/', async (req, res) => {
    console.log('📥 Dados recebidos na API:', JSON.stringify(req.body, null, 2));
    
    const {
      client_name,
      client_phone,
      client_email,
      reservation_date,
      reservation_time,
      number_of_people,
      area_id,
      table_number,
      status = 'NOVA',
      origin = 'PESSOAL',
      notes,
      created_by
    } = req.body;
    
    // Validações básicas
    if (!client_name || !reservation_date || !reservation_time || !area_id) {
      return res.status(400).json({
        success: false,
        error: 'Campos obrigatórios: client_name, reservation_date, reservation_time, area_id'
      });
    }
    
    // Retornar dados mock para teste
    console.log('📝 Retornando dados mock para teste');
    
    const mockReservation = {
      id: Date.now(), // ID temporário
      client_name,
      client_phone,
      client_email,
      reservation_date,
      reservation_time,
      number_of_people,
      area_id,
      table_number,
      status,
      origin,
      notes,
      created_by,
      establishment_name: 'Estabelecimento Padrão',
      area_name: 'Área Padrão',
      created_by_name: 'Admin',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    res.status(201).json({
      success: true,
      message: 'Reserva criada com sucesso (dados temporários)',
      reservation: mockReservation
    });
  });

  /**
   * @route   GET /api/restaurant-reservations
   * @desc    Lista todas as reservas do restaurante
   * @access  Private
   */
  router.get('/', async (req, res) => {
    console.log('📥 Buscando reservas...');
    
    // Retornar dados mock para teste
    const mockReservations = [
      {
        id: 1,
        client_name: 'João Silva',
        client_phone: '11999999999',
        client_email: 'joao@teste.com',
        reservation_date: '2024-01-15',
        reservation_time: '19:00',
        number_of_people: 2,
        area_id: 1,
        table_number: '1',
        status: 'NOVA',
        origin: 'PESSOAL',
        notes: 'Reserva de teste',
        created_by: 1,
        establishment_name: 'Estabelecimento Padrão',
        area_name: 'Área Padrão',
        created_by_name: 'Admin',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    ];
    
    res.json({
      success: true,
      reservations: mockReservations
    });
  });

  return router;
};











