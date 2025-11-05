// routes/operationalDetails.js

const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');

module.exports = (pool) => {
  /**
   * @route   POST /api/v1/operational-details
   * @desc    Cria um novo detalhe operacional
   * @access  Private (Admin/Marketing)
   */
  router.post('/', auth, async (req, res) => {
    try {
      // Verificar se a tabela existe, se não, criar
      try {
        const [tables] = await pool.execute("SHOW TABLES LIKE 'operational_details'");
        
        if (tables.length === 0) {
          console.log('📝 Criando tabela operational_details...');
          
          await pool.execute(`
            CREATE TABLE operational_details (
              id INT(11) NOT NULL AUTO_INCREMENT,
              event_id INT(11) DEFAULT NULL,
              establishment_id INT(11) DEFAULT NULL,
              event_date DATE NOT NULL,
              artistic_attraction VARCHAR(255) NOT NULL,
              show_schedule TEXT DEFAULT NULL,
              ticket_prices TEXT NOT NULL,
              promotions TEXT DEFAULT NULL,
              visual_reference_url VARCHAR(255) DEFAULT NULL,
              admin_notes TEXT DEFAULT NULL,
              operational_instructions TEXT DEFAULT NULL,
              is_active BOOLEAN DEFAULT 1,
              created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
              updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
              PRIMARY KEY (id),
              UNIQUE KEY unique_event_date (event_date),
              KEY idx_establishment_id (establishment_id),
              KEY idx_event_id (event_id),
              KEY idx_event_date (event_date),
              KEY idx_is_active (is_active)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
          `);
          
          console.log('✅ Tabela operational_details criada com sucesso!');
        }
      } catch (tableError) {
        console.log('⚠️ Erro ao verificar/criar tabela operational_details:', tableError.message);
      }

      const {
        os_type,
        os_number,
        event_id,
        establishment_id,
        event_date,
        artistic_attraction,
        show_schedule,
        ticket_prices,
        promotions,
        visual_reference_url,
        admin_notes,
        operational_instructions,
        is_active = true,
        // Campos de Artista
        contractor_name,
        contractor_cnpj,
        contractor_address,
        contractor_legal_responsible,
        contractor_legal_cpf,
        contractor_phone,
        contractor_email,
        artist_artistic_name,
        artist_full_name,
        artist_cpf_cnpj,
        artist_address,
        artist_phone,
        artist_email,
        artist_responsible_name,
        artist_bank_name,
        artist_bank_agency,
        artist_bank_account,
        artist_bank_account_type,
        event_name,
        event_location_address,
        event_presentation_date,
        event_presentation_time,
        event_duration,
        event_soundcheck_time,
        event_structure_offered,
        event_equipment_provided_by_contractor,
        event_equipment_brought_by_artist,
        financial_total_value,
        financial_payment_method,
        financial_payment_conditions,
        financial_discounts_or_fees,
        general_penalties,
        general_transport_responsibility,
        general_image_rights,
        contractor_signature,
        artist_signature,
        // Campos de Bar/Fornecedor
        provider_name,
        provider_cpf_cnpj,
        provider_address,
        provider_responsible_name,
        provider_responsible_contact,
        provider_bank_name,
        provider_bank_agency,
        provider_bank_account,
        provider_bank_account_type,
        service_type,
        service_professionals_count,
        service_materials_included,
        service_start_date,
        service_start_time,
        service_end_date,
        service_end_time,
        service_setup_location,
        service_technical_responsible,
        commercial_total_value,
        commercial_payment_method,
        commercial_payment_deadline,
        commercial_cancellation_policy,
        commercial_additional_costs,
        general_damage_responsibility,
        general_conduct_rules,
        general_insurance,
        provider_signature
      } = req.body;

      // Validações
      if (!event_date) {
        return res.status(400).json({
          success: false,
          error: 'Data do evento é obrigatória'
        });
      }

      if (!artistic_attraction) {
        return res.status(400).json({
          success: false,
          error: 'Atrativo artístico é obrigatório'
        });
      }

      if (!ticket_prices) {
        return res.status(400).json({
          success: false,
          error: 'Informações de preços são obrigatórias'
        });
      }

      // Verificar se já existe um detalhe para esta data
      const [existing] = await pool.execute(
        'SELECT id FROM operational_details WHERE event_date = ?',
        [event_date]
      );

      if (existing.length > 0) {
        return res.status(400).json({
          success: false,
          error: 'Já existe um detalhe operacional para esta data. Use PUT para atualizar.'
        });
      }

      const query = `
        INSERT INTO operational_details (
          os_type, os_number, event_id, establishment_id, event_date, artistic_attraction,
          show_schedule, ticket_prices, promotions, visual_reference_url,
          admin_notes, operational_instructions, is_active,
          contractor_name, contractor_cnpj, contractor_address, contractor_legal_responsible,
          contractor_legal_cpf, contractor_phone, contractor_email,
          artist_artistic_name, artist_full_name, artist_cpf_cnpj, artist_address,
          artist_phone, artist_email, artist_responsible_name,
          artist_bank_name, artist_bank_agency, artist_bank_account, artist_bank_account_type,
          event_name, event_location_address, event_presentation_date, event_presentation_time,
          event_duration, event_soundcheck_time, event_structure_offered,
          event_equipment_provided_by_contractor, event_equipment_brought_by_artist,
          financial_total_value, financial_payment_method, financial_payment_conditions,
          financial_discounts_or_fees, general_penalties, general_transport_responsibility,
          general_image_rights, contractor_signature, artist_signature,
          provider_name, provider_cpf_cnpj, provider_address, provider_responsible_name,
          provider_responsible_contact, provider_bank_name, provider_bank_agency,
          provider_bank_account, provider_bank_account_type, service_type,
          service_professionals_count, service_materials_included, service_start_date,
          service_start_time, service_end_date, service_end_time, service_setup_location,
          service_technical_responsible, commercial_total_value, commercial_payment_method,
          commercial_payment_deadline, commercial_cancellation_policy, commercial_additional_costs,
          general_damage_responsibility, general_conduct_rules, general_insurance, provider_signature
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const [result] = await pool.execute(query, [
        os_type || null,
        os_number || null,
        event_id || null,
        establishment_id || null,
        event_date,
        artistic_attraction || '',
        show_schedule || null,
        ticket_prices || '',
        promotions || null,
        visual_reference_url || null,
        admin_notes || null,
        operational_instructions || null,
        is_active ? 1 : 0,
        // Campos de Artista
        contractor_name || null,
        contractor_cnpj || null,
        contractor_address || null,
        contractor_legal_responsible || null,
        contractor_legal_cpf || null,
        contractor_phone || null,
        contractor_email || null,
        artist_artistic_name || null,
        artist_full_name || null,
        artist_cpf_cnpj || null,
        artist_address || null,
        artist_phone || null,
        artist_email || null,
        artist_responsible_name || null,
        artist_bank_name || null,
        artist_bank_agency || null,
        artist_bank_account || null,
        artist_bank_account_type || null,
        event_name || null,
        event_location_address || null,
        event_presentation_date || null,
        event_presentation_time || null,
        event_duration || null,
        event_soundcheck_time || null,
        event_structure_offered || null,
        event_equipment_provided_by_contractor || null,
        event_equipment_brought_by_artist || null,
        financial_total_value || null,
        financial_payment_method || null,
        financial_payment_conditions || null,
        financial_discounts_or_fees || null,
        general_penalties || null,
        general_transport_responsibility || null,
        general_image_rights || null,
        contractor_signature || null,
        artist_signature || null,
        // Campos de Bar/Fornecedor
        provider_name || null,
        provider_cpf_cnpj || null,
        provider_address || null,
        provider_responsible_name || null,
        provider_responsible_contact || null,
        provider_bank_name || null,
        provider_bank_agency || null,
        provider_bank_account || null,
        provider_bank_account_type || null,
        service_type || null,
        service_professionals_count || null,
        service_materials_included || null,
        service_start_date || null,
        service_start_time || null,
        service_end_date || null,
        service_end_time || null,
        service_setup_location || null,
        service_technical_responsible || null,
        commercial_total_value || null,
        commercial_payment_method || null,
        commercial_payment_deadline || null,
        commercial_cancellation_policy || null,
        commercial_additional_costs || null,
        general_damage_responsibility || null,
        general_conduct_rules || null,
        general_insurance || null,
        provider_signature || null
      ]);

      res.status(201).json({
        success: true,
        message: 'Detalhe operacional criado com sucesso',
        id: result.insertId
      });

    } catch (error) {
      console.error('❌ Erro ao criar detalhe operacional:', error);
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor'
      });
    }
  });

  /**
   * @route   GET /api/v1/operational-details
   * @desc    Lista todos os detalhes operacionais com filtros opcionais
   * @access  Private (Admin/Marketing)
   */
  router.get('/', auth, async (req, res) => {
    try {
      const { establishment_id, event_date, is_active, limit, offset } = req.query;
      
      let query = `
        SELECT 
          od.*,
          p.name as establishment_name,
          e.nome_do_evento as event_name
        FROM operational_details od
        LEFT JOIN places p ON od.establishment_id = p.id
        LEFT JOIN eventos e ON od.event_id = e.id
        WHERE 1=1
      `;
      
      const params = [];
      
      if (establishment_id) {
        query += ` AND od.establishment_id = ?`;
        params.push(establishment_id);
      }
      
      if (event_date) {
        query += ` AND od.event_date = ?`;
        params.push(event_date);
      }
      
      if (is_active !== undefined) {
        query += ` AND od.is_active = ?`;
        params.push(is_active === 'true' || is_active === '1' ? 1 : 0);
      }
      
      query += ` ORDER BY od.event_date DESC`;
      
      if (limit) {
        query += ` LIMIT ?`;
        params.push(parseInt(limit));
        
        if (offset) {
          query += ` OFFSET ?`;
          params.push(parseInt(offset));
        }
      }
      
      const [details] = await pool.execute(query, params);
      
      res.json({
        success: true,
        data: details
      });
      
    } catch (error) {
      console.error('❌ Erro ao buscar detalhes operacionais:', error);
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor'
      });
    }
  });

  /**
   * @route   GET /api/v1/operational-details/date/:date
   * @desc    Busca o detalhe operacional mais recente para uma data específica
   * @access  Public (para uso no front-end de reservas)
   */
  router.get('/date/:date', async (req, res) => {
    try {
      const { date } = req.params;
      
      // Validar formato da data (YYYY-MM-DD)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({
          success: false,
          error: 'Formato de data inválido. Use YYYY-MM-DD'
        });
      }

      const query = `
        SELECT 
          od.*,
          p.name as establishment_name
        FROM operational_details od
        LEFT JOIN places p ON od.establishment_id = p.id
        WHERE od.event_date = ? AND od.is_active = 1
        ORDER BY od.updated_at DESC
        LIMIT 1
      `;
      
      const [details] = await pool.execute(query, [date]);
      
      if (details.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Nenhum detalhe operacional encontrado para esta data'
        });
      }
      
      res.json({
        success: true,
        data: details[0]
      });
      
    } catch (error) {
      console.error('❌ Erro ao buscar detalhe operacional por data:', error);
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor'
      });
    }
  });

  /**
   * @route   GET /api/v1/operational-details/:id
   * @desc    Busca um detalhe operacional específico
   * @access  Private (Admin/Marketing)
   */
  router.get('/:id', auth, async (req, res) => {
    try {
      const { id } = req.params;
      
      const query = `
        SELECT 
          od.*,
          p.name as establishment_name,
          e.nome_do_evento as event_name
        FROM operational_details od
        LEFT JOIN places p ON od.establishment_id = p.id
        LEFT JOIN eventos e ON od.event_id = e.id
        WHERE od.id = ?
      `;
      
      const [details] = await pool.execute(query, [id]);
      
      if (details.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Detalhe operacional não encontrado'
        });
      }
      
      res.json({
        success: true,
        data: details[0]
      });
      
    } catch (error) {
      console.error('❌ Erro ao buscar detalhe operacional:', error);
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor'
      });
    }
  });

  /**
   * @route   PUT /api/v1/operational-details/:id
   * @desc    Atualiza um detalhe operacional existente
   * @access  Private (Admin/Marketing)
   */
  router.put('/:id', auth, async (req, res) => {
    try {
      const { id } = req.params;
      const {
        os_type,
        os_number,
        event_id,
        establishment_id,
        event_date,
        artistic_attraction,
        show_schedule,
        ticket_prices,
        promotions,
        visual_reference_url,
        admin_notes,
        operational_instructions,
        is_active,
        // Campos de Artista
        contractor_name,
        contractor_cnpj,
        contractor_address,
        contractor_legal_responsible,
        contractor_legal_cpf,
        contractor_phone,
        contractor_email,
        artist_artistic_name,
        artist_full_name,
        artist_cpf_cnpj,
        artist_address,
        artist_phone,
        artist_email,
        artist_responsible_name,
        artist_bank_name,
        artist_bank_agency,
        artist_bank_account,
        artist_bank_account_type,
        event_name,
        event_location_address,
        event_presentation_date,
        event_presentation_time,
        event_duration,
        event_soundcheck_time,
        event_structure_offered,
        event_equipment_provided_by_contractor,
        event_equipment_brought_by_artist,
        financial_total_value,
        financial_payment_method,
        financial_payment_conditions,
        financial_discounts_or_fees,
        general_penalties,
        general_transport_responsibility,
        general_image_rights,
        contractor_signature,
        artist_signature,
        // Campos de Bar/Fornecedor
        provider_name,
        provider_cpf_cnpj,
        provider_address,
        provider_responsible_name,
        provider_responsible_contact,
        provider_bank_name,
        provider_bank_agency,
        provider_bank_account,
        provider_bank_account_type,
        service_type,
        service_professionals_count,
        service_materials_included,
        service_start_date,
        service_start_time,
        service_end_date,
        service_end_time,
        service_setup_location,
        service_technical_responsible,
        commercial_total_value,
        commercial_payment_method,
        commercial_payment_deadline,
        commercial_cancellation_policy,
        commercial_additional_costs,
        general_damage_responsibility,
        general_conduct_rules,
        general_insurance,
        provider_signature
      } = req.body;

      // Verificar se o registro existe
      const [existing] = await pool.execute(
        'SELECT id FROM operational_details WHERE id = ?',
        [id]
      );

      if (existing.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Detalhe operacional não encontrado'
        });
      }

      // Se a data está sendo alterada, verificar se já existe outro registro com essa data
      if (event_date) {
        const [dateConflict] = await pool.execute(
          'SELECT id FROM operational_details WHERE event_date = ? AND id != ?',
          [event_date, id]
        );

        if (dateConflict.length > 0) {
          return res.status(400).json({
            success: false,
            error: 'Já existe outro detalhe operacional para esta data'
          });
        }
      }

      const updateFields = [];
      const updateValues = [];

      // Campos básicos
      if (os_type !== undefined) {
        updateFields.push('os_type = ?');
        updateValues.push(os_type || null);
      }
      if (os_number !== undefined) {
        updateFields.push('os_number = ?');
        updateValues.push(os_number || null);
      }
      if (event_id !== undefined) {
        updateFields.push('event_id = ?');
        updateValues.push(event_id || null);
      }
      if (establishment_id !== undefined) {
        updateFields.push('establishment_id = ?');
        updateValues.push(establishment_id || null);
      }
      if (event_date !== undefined) {
        updateFields.push('event_date = ?');
        updateValues.push(event_date);
      }
      if (artistic_attraction !== undefined) {
        updateFields.push('artistic_attraction = ?');
        updateValues.push(artistic_attraction);
      }
      if (show_schedule !== undefined) {
        updateFields.push('show_schedule = ?');
        updateValues.push(show_schedule || null);
      }
      if (ticket_prices !== undefined) {
        updateFields.push('ticket_prices = ?');
        updateValues.push(ticket_prices);
      }
      if (promotions !== undefined) {
        updateFields.push('promotions = ?');
        updateValues.push(promotions || null);
      }
      if (visual_reference_url !== undefined) {
        updateFields.push('visual_reference_url = ?');
        updateValues.push(visual_reference_url || null);
      }
      if (admin_notes !== undefined) {
        updateFields.push('admin_notes = ?');
        updateValues.push(admin_notes || null);
      }
      if (operational_instructions !== undefined) {
        updateFields.push('operational_instructions = ?');
        updateValues.push(operational_instructions || null);
      }
      if (is_active !== undefined) {
        updateFields.push('is_active = ?');
        updateValues.push(is_active ? 1 : 0);
      }
      
      // Campos de Artista
      if (contractor_name !== undefined) { updateFields.push('contractor_name = ?'); updateValues.push(contractor_name || null); }
      if (contractor_cnpj !== undefined) { updateFields.push('contractor_cnpj = ?'); updateValues.push(contractor_cnpj || null); }
      if (contractor_address !== undefined) { updateFields.push('contractor_address = ?'); updateValues.push(contractor_address || null); }
      if (contractor_legal_responsible !== undefined) { updateFields.push('contractor_legal_responsible = ?'); updateValues.push(contractor_legal_responsible || null); }
      if (contractor_legal_cpf !== undefined) { updateFields.push('contractor_legal_cpf = ?'); updateValues.push(contractor_legal_cpf || null); }
      if (contractor_phone !== undefined) { updateFields.push('contractor_phone = ?'); updateValues.push(contractor_phone || null); }
      if (contractor_email !== undefined) { updateFields.push('contractor_email = ?'); updateValues.push(contractor_email || null); }
      if (artist_artistic_name !== undefined) { updateFields.push('artist_artistic_name = ?'); updateValues.push(artist_artistic_name || null); }
      if (artist_full_name !== undefined) { updateFields.push('artist_full_name = ?'); updateValues.push(artist_full_name || null); }
      if (artist_cpf_cnpj !== undefined) { updateFields.push('artist_cpf_cnpj = ?'); updateValues.push(artist_cpf_cnpj || null); }
      if (artist_address !== undefined) { updateFields.push('artist_address = ?'); updateValues.push(artist_address || null); }
      if (artist_phone !== undefined) { updateFields.push('artist_phone = ?'); updateValues.push(artist_phone || null); }
      if (artist_email !== undefined) { updateFields.push('artist_email = ?'); updateValues.push(artist_email || null); }
      if (artist_responsible_name !== undefined) { updateFields.push('artist_responsible_name = ?'); updateValues.push(artist_responsible_name || null); }
      if (artist_bank_name !== undefined) { updateFields.push('artist_bank_name = ?'); updateValues.push(artist_bank_name || null); }
      if (artist_bank_agency !== undefined) { updateFields.push('artist_bank_agency = ?'); updateValues.push(artist_bank_agency || null); }
      if (artist_bank_account !== undefined) { updateFields.push('artist_bank_account = ?'); updateValues.push(artist_bank_account || null); }
      if (artist_bank_account_type !== undefined) { updateFields.push('artist_bank_account_type = ?'); updateValues.push(artist_bank_account_type || null); }
      if (event_name !== undefined) { updateFields.push('event_name = ?'); updateValues.push(event_name || null); }
      if (event_location_address !== undefined) { updateFields.push('event_location_address = ?'); updateValues.push(event_location_address || null); }
      if (event_presentation_date !== undefined) { updateFields.push('event_presentation_date = ?'); updateValues.push(event_presentation_date || null); }
      if (event_presentation_time !== undefined) { updateFields.push('event_presentation_time = ?'); updateValues.push(event_presentation_time || null); }
      if (event_duration !== undefined) { updateFields.push('event_duration = ?'); updateValues.push(event_duration || null); }
      if (event_soundcheck_time !== undefined) { updateFields.push('event_soundcheck_time = ?'); updateValues.push(event_soundcheck_time || null); }
      if (event_structure_offered !== undefined) { updateFields.push('event_structure_offered = ?'); updateValues.push(event_structure_offered || null); }
      if (event_equipment_provided_by_contractor !== undefined) { updateFields.push('event_equipment_provided_by_contractor = ?'); updateValues.push(event_equipment_provided_by_contractor || null); }
      if (event_equipment_brought_by_artist !== undefined) { updateFields.push('event_equipment_brought_by_artist = ?'); updateValues.push(event_equipment_brought_by_artist || null); }
      if (financial_total_value !== undefined) { updateFields.push('financial_total_value = ?'); updateValues.push(financial_total_value || null); }
      if (financial_payment_method !== undefined) { updateFields.push('financial_payment_method = ?'); updateValues.push(financial_payment_method || null); }
      if (financial_payment_conditions !== undefined) { updateFields.push('financial_payment_conditions = ?'); updateValues.push(financial_payment_conditions || null); }
      if (financial_discounts_or_fees !== undefined) { updateFields.push('financial_discounts_or_fees = ?'); updateValues.push(financial_discounts_or_fees || null); }
      if (general_penalties !== undefined) { updateFields.push('general_penalties = ?'); updateValues.push(general_penalties || null); }
      if (general_transport_responsibility !== undefined) { updateFields.push('general_transport_responsibility = ?'); updateValues.push(general_transport_responsibility || null); }
      if (general_image_rights !== undefined) { updateFields.push('general_image_rights = ?'); updateValues.push(general_image_rights || null); }
      if (contractor_signature !== undefined) { updateFields.push('contractor_signature = ?'); updateValues.push(contractor_signature || null); }
      if (artist_signature !== undefined) { updateFields.push('artist_signature = ?'); updateValues.push(artist_signature || null); }
      
      // Campos de Bar/Fornecedor
      if (provider_name !== undefined) { updateFields.push('provider_name = ?'); updateValues.push(provider_name || null); }
      if (provider_cpf_cnpj !== undefined) { updateFields.push('provider_cpf_cnpj = ?'); updateValues.push(provider_cpf_cnpj || null); }
      if (provider_address !== undefined) { updateFields.push('provider_address = ?'); updateValues.push(provider_address || null); }
      if (provider_responsible_name !== undefined) { updateFields.push('provider_responsible_name = ?'); updateValues.push(provider_responsible_name || null); }
      if (provider_responsible_contact !== undefined) { updateFields.push('provider_responsible_contact = ?'); updateValues.push(provider_responsible_contact || null); }
      if (provider_bank_name !== undefined) { updateFields.push('provider_bank_name = ?'); updateValues.push(provider_bank_name || null); }
      if (provider_bank_agency !== undefined) { updateFields.push('provider_bank_agency = ?'); updateValues.push(provider_bank_agency || null); }
      if (provider_bank_account !== undefined) { updateFields.push('provider_bank_account = ?'); updateValues.push(provider_bank_account || null); }
      if (provider_bank_account_type !== undefined) { updateFields.push('provider_bank_account_type = ?'); updateValues.push(provider_bank_account_type || null); }
      if (service_type !== undefined) { updateFields.push('service_type = ?'); updateValues.push(service_type || null); }
      if (service_professionals_count !== undefined) { updateFields.push('service_professionals_count = ?'); updateValues.push(service_professionals_count || null); }
      if (service_materials_included !== undefined) { updateFields.push('service_materials_included = ?'); updateValues.push(service_materials_included || null); }
      if (service_start_date !== undefined) { updateFields.push('service_start_date = ?'); updateValues.push(service_start_date || null); }
      if (service_start_time !== undefined) { updateFields.push('service_start_time = ?'); updateValues.push(service_start_time || null); }
      if (service_end_date !== undefined) { updateFields.push('service_end_date = ?'); updateValues.push(service_end_date || null); }
      if (service_end_time !== undefined) { updateFields.push('service_end_time = ?'); updateValues.push(service_end_time || null); }
      if (service_setup_location !== undefined) { updateFields.push('service_setup_location = ?'); updateValues.push(service_setup_location || null); }
      if (service_technical_responsible !== undefined) { updateFields.push('service_technical_responsible = ?'); updateValues.push(service_technical_responsible || null); }
      if (commercial_total_value !== undefined) { updateFields.push('commercial_total_value = ?'); updateValues.push(commercial_total_value || null); }
      if (commercial_payment_method !== undefined) { updateFields.push('commercial_payment_method = ?'); updateValues.push(commercial_payment_method || null); }
      if (commercial_payment_deadline !== undefined) { updateFields.push('commercial_payment_deadline = ?'); updateValues.push(commercial_payment_deadline || null); }
      if (commercial_cancellation_policy !== undefined) { updateFields.push('commercial_cancellation_policy = ?'); updateValues.push(commercial_cancellation_policy || null); }
      if (commercial_additional_costs !== undefined) { updateFields.push('commercial_additional_costs = ?'); updateValues.push(commercial_additional_costs || null); }
      if (general_damage_responsibility !== undefined) { updateFields.push('general_damage_responsibility = ?'); updateValues.push(general_damage_responsibility || null); }
      if (general_conduct_rules !== undefined) { updateFields.push('general_conduct_rules = ?'); updateValues.push(general_conduct_rules || null); }
      if (general_insurance !== undefined) { updateFields.push('general_insurance = ?'); updateValues.push(general_insurance || null); }
      if (provider_signature !== undefined) { updateFields.push('provider_signature = ?'); updateValues.push(provider_signature || null); }

      if (updateFields.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Nenhum campo para atualizar'
        });
      }

      updateValues.push(id);

      const query = `
        UPDATE operational_details 
        SET ${updateFields.join(', ')}
        WHERE id = ?
      `;

      await pool.execute(query, updateValues);

      res.json({
        success: true,
        message: 'Detalhe operacional atualizado com sucesso'
      });

    } catch (error) {
      console.error('❌ Erro ao atualizar detalhe operacional:', error);
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor'
      });
    }
  });

  /**
   * @route   DELETE /api/v1/operational-details/:id
   * @desc    Exclui um detalhe operacional
   * @access  Private (Admin/Marketing)
   */
  router.delete('/:id', auth, async (req, res) => {
    try {
      const { id } = req.params;

      // Verificar se o registro existe
      const [existing] = await pool.execute(
        'SELECT id FROM operational_details WHERE id = ?',
        [id]
      );

      if (existing.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Detalhe operacional não encontrado'
        });
      }

      await pool.execute('DELETE FROM operational_details WHERE id = ?', [id]);

      res.json({
        success: true,
        message: 'Detalhe operacional excluído com sucesso'
      });

    } catch (error) {
      console.error('❌ Erro ao excluir detalhe operacional:', error);
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor'
      });
    }
  });

  return router;
};

