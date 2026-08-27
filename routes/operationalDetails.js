// routes/operationalDetails.js

const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const optionalAuth = require('../middleware/optionalAuth');
const { emitOperationalDetailChanged } = require('../utils/osRealtime');
const {
  resolveActorScope,
  canAccessOperationalEstablishment,
  sqlEstablishmentInScope,
} = require('../tenancy/orgIsolation');

/**
 * Campos de divulgação exibidos na página pública /reservar.
 * Tudo que é contrato, PII do artista ou financeiro fica fora.
 */
const PUBLIC_DETAIL_FIELDS = [
  'id',
  'event_id',
  'establishment_id',
  'establishment_name',
  'event_date',
  'event_name',
  'artistic_attraction',
  'show_schedule',
  'ticket_prices',
  'promotions',
  'visual_reference_url',
  'is_active',
];

/** Realtime é opcional: nunca deve falhar a requisição. */
function notifyOsChange(params) {
  try {
    emitOperationalDetailChanged(params);
  } catch (error) {
    console.warn('[operationalDetails] realtime indisponível:', error.message);
  }
}

function publicOperationalDetail(row) {
  if (!row) return row;
  const out = {};
  for (const field of PUBLIC_DETAIL_FIELDS) {
    if (field in row) out[field] = row[field];
  }
  return out;
}

module.exports = (pool) => {
  /**
   * @route   POST /api/v1/operational-details
   * @desc    Cria um novo detalhe operacional
   * @access  Private (Admin/Marketing)
   */
  router.post('/', auth, async (req, res) => {
    try {
      // Tabela operational_details já deve existir no PostgreSQL

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

      if (establishment_id) {
        const actor = await resolveActorScope(pool, req.user);
        if (!canAccessOperationalEstablishment(actor, establishment_id)) {
          return res.status(403).json({
            success: false,
            error: 'Estabelecimento fora do escopo da organização',
          });
        }
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

      // Verificar se já existe um detalhe para esta data E este tipo de OS
      // Verificar se a coluna os_type existe antes de usar
      let existingResult;
      try {
        existingResult = await pool.query(
          'SELECT id FROM operational_details WHERE event_date = $1 AND (os_type = $2 OR os_type IS NULL)',
          [event_date, os_type]
        );
      } catch (error) {
        // Se os_type não existe, verificar apenas por data
        if (error.code === '42703') {
          existingResult = await pool.query(
            'SELECT id FROM operational_details WHERE event_date = $1',
            [event_date]
          );
        } else {
          throw error;
        }
      }

      if (existingResult.rows.length > 0) {
        return res.status(400).json({
          success: false,
          error: `Já existe um detalhe operacional para esta data. Use PUT para atualizar.`
        });
      }

      // Verificar quais colunas existem na tabela
      const columnsResult = await pool.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'operational_details' 
        AND table_schema = 'meu_backup_db'
        ORDER BY ordinal_position
      `);
      
      const existingColumns = columnsResult.rows.map(row => row.column_name);
      console.log('📊 Colunas existentes na tabela:', existingColumns);

      // Mapear campos para valores
      const fieldMap = {
        os_type: os_type || null,
        os_number: os_number || null,
        event_id: event_id || null,
        establishment_id: establishment_id || null,
        event_date: event_date,
        artistic_attraction: artistic_attraction || '',
        show_schedule: show_schedule || null,
        ticket_prices: ticket_prices || '',
        promotions: promotions || null,
        visual_reference_url: visual_reference_url || null,
        admin_notes: admin_notes || null,
        operational_instructions: operational_instructions || null,
        is_active: is_active !== undefined ? (is_active ? 1 : 0) : 1,
        contractor_name: contractor_name || null,
        contractor_cnpj: contractor_cnpj || null,
        contractor_address: contractor_address || null,
        contractor_legal_responsible: contractor_legal_responsible || null,
        contractor_legal_cpf: contractor_legal_cpf || null,
        contractor_phone: contractor_phone || null,
        contractor_email: contractor_email || null,
        artist_artistic_name: artist_artistic_name || null,
        artist_full_name: artist_full_name || null,
        artist_cpf_cnpj: artist_cpf_cnpj || null,
        artist_address: artist_address || null,
        artist_phone: artist_phone || null,
        artist_email: artist_email || null,
        artist_responsible_name: artist_responsible_name || null,
        artist_bank_name: artist_bank_name || null,
        artist_bank_agency: artist_bank_agency || null,
        artist_bank_account: artist_bank_account || null,
        artist_bank_account_type: artist_bank_account_type || null,
        event_name: event_name || null,
        event_location_address: event_location_address || null,
        event_presentation_date: event_presentation_date || null,
        event_presentation_time: event_presentation_time || null,
        event_duration: event_duration || null,
        event_soundcheck_time: event_soundcheck_time || null,
        event_structure_offered: event_structure_offered || null,
        event_equipment_provided_by_contractor: event_equipment_provided_by_contractor || null,
        event_equipment_brought_by_artist: event_equipment_brought_by_artist || null,
        financial_total_value: financial_total_value || null,
        financial_payment_method: financial_payment_method || null,
        financial_payment_conditions: financial_payment_conditions || null,
        financial_discounts_or_fees: financial_discounts_or_fees || null,
        general_penalties: general_penalties || null,
        general_transport_responsibility: general_transport_responsibility || null,
        general_image_rights: general_image_rights || null,
        contractor_signature: contractor_signature || null,
        artist_signature: artist_signature || null,
        provider_name: provider_name || null,
        provider_cpf_cnpj: provider_cpf_cnpj || null,
        provider_address: provider_address || null,
        provider_responsible_name: provider_responsible_name || null,
        provider_responsible_contact: provider_responsible_contact || null,
        provider_bank_name: provider_bank_name || null,
        provider_bank_agency: provider_bank_agency || null,
        provider_bank_account: provider_bank_account || null,
        provider_bank_account_type: provider_bank_account_type || null,
        service_type: service_type || null,
        service_professionals_count: service_professionals_count || null,
        service_materials_included: service_materials_included || null,
        service_start_date: service_start_date || null,
        service_start_time: service_start_time || null,
        service_end_date: service_end_date || null,
        service_end_time: service_end_time || null,
        service_setup_location: service_setup_location || null,
        service_technical_responsible: service_technical_responsible || null,
        commercial_total_value: commercial_total_value || null,
        commercial_payment_method: commercial_payment_method || null,
        commercial_payment_deadline: commercial_payment_deadline || null,
        commercial_cancellation_policy: commercial_cancellation_policy || null,
        commercial_additional_costs: commercial_additional_costs || null,
        general_damage_responsibility: general_damage_responsibility || null,
        general_conduct_rules: general_conduct_rules || null,
        general_insurance: general_insurance || null,
        provider_signature: provider_signature || null
      };

      // Filtrar apenas campos que existem na tabela (excluindo id, created_at, updated_at)
      const columnsToInsert = existingColumns.filter(col => 
        !['id', 'created_at', 'updated_at'].includes(col) && fieldMap.hasOwnProperty(col)
      );
      
      // Construir query dinamicamente
      const placeholders = columnsToInsert.map((_, index) => `$${index + 1}`).join(', ');
      const query = `
        INSERT INTO operational_details (${columnsToInsert.join(', ')})
        VALUES (${placeholders})
        RETURNING id
      `;

      // Preparar valores na ordem correta
      const values = columnsToInsert.map(col => fieldMap[col]);

      console.log('📊 Query construída:', {
        columns: columnsToInsert.length,
        columnsList: columnsToInsert,
        valuesCount: values.length,
        event_date,
        artistic_attraction,
        ticket_prices,
        os_type,
        establishment_id
      });

      const result = await pool.query(query, values);

      notifyOsChange({
        establishmentId: establishment_id,
        action: 'created',
        detailId: result.rows[0].id,
        osType: os_type,
        date: event_date,
        projectName: artistic_attraction,
      });

      res.status(201).json({
        success: true,
        message: 'Detalhe operacional criado com sucesso',
        id: result.rows[0].id
      });

    } catch (error) {
      console.error('❌ Erro ao criar detalhe operacional:', error);
      console.error('❌ Stack trace:', error.stack);
      console.error('❌ Código do erro:', error.code);
      console.error('❌ Detalhes do erro:', error.detail);
      console.error('❌ Dados recebidos:', {
        os_type: req.body.os_type,
        event_date: req.body.event_date,
        artistic_attraction: req.body.artistic_attraction,
        ticket_prices: req.body.ticket_prices,
        establishment_id: req.body.establishment_id
      });
      
      // Verificar se é erro de coluna não encontrada
      if (error.code === '42703' || error.message?.includes('column') || error.message?.includes('does not exist')) {
        return res.status(500).json({
          success: false,
          error: 'Erro: Alguma coluna não existe na tabela. Verifique se a migration foi executada.',
          details: error.message,
          hint: 'Execute a migration add_os_type_fields.sql no banco de dados PostgreSQL'
        });
      }
      
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor',
        details: error.message,
        code: error.code,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
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
      const actor = await resolveActorScope(pool, req.user);

      if (establishment_id && !canAccessOperationalEstablishment(actor, establishment_id)) {
        return res.status(404).json({ success: false, error: 'Não encontrado' });
      }
      
      let query = `
        SELECT 
          od.*,
          p.name as establishment_name,
          COALESCE(od.event_name, e.nome_do_evento) as event_name
        FROM operational_details od
        LEFT JOIN places p ON od.establishment_id = p.id
        LEFT JOIN eventos e ON od.event_id = e.id
        WHERE 1=1
      `;
      
      const params = [];
      let paramIndex = 1;

      const scopeSql = sqlEstablishmentInScope(actor, 'od.establishment_id', paramIndex);
      query += scopeSql.sql;
      params.push(...scopeSql.params);
      paramIndex = scopeSql.nextIndex;
      
      if (establishment_id) {
        query += ` AND od.establishment_id = $${paramIndex++}`;
        params.push(establishment_id);
      }
      
      if (event_date) {
        query += ` AND od.event_date = $${paramIndex++}`;
        params.push(event_date);
      }
      
      if (is_active !== undefined) {
        query += ` AND od.is_active = $${paramIndex++}`;
        params.push(is_active === 'true' || is_active === '1' ? 1 : 0);
      }
      
      query += ` ORDER BY od.event_date DESC`;
      
      if (limit) {
        query += ` LIMIT $${paramIndex++}`;
        params.push(parseInt(limit));
        
        if (offset) {
          query += ` OFFSET $${paramIndex++}`;
          params.push(parseInt(offset));
        }
      }
      
      const detailsResult = await pool.query(query, params);
      // Garantir que event_date seja uma string no formato YYYY-MM-DD
      const details = detailsResult.rows.map(row => {
        if (row.event_date) {
          // Se for um objeto Date, converter para string
          if (row.event_date instanceof Date) {
            row.event_date = row.event_date.toISOString().split('T')[0];
          } else if (typeof row.event_date === 'string' && row.event_date.includes('T')) {
            // Se já for string com hora, remover a hora
            row.event_date = row.event_date.split('T')[0];
          }
        }
        return row;
      });
      
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
   * @access  Público, mas anônimo recebe só os campos de divulgação.
   *          Contrato, dados bancários e cachê exigem token.
   */
  router.get('/date/:date', optionalAuth, async (req, res) => {
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
        WHERE od.event_date = $1 AND od.is_active = TRUE
        ORDER BY od.updated_at DESC
        LIMIT 1
      `;
      
      const detailsResult = await pool.query(query, [date]);
      
      if (detailsResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Nenhum detalhe operacional encontrado para esta data'
        });
      }
      
      res.json({
        success: true,
        data: req.user
          ? detailsResult.rows[0]
          : publicOperationalDetail(detailsResult.rows[0])
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
          COALESCE(od.event_name, e.nome_do_evento) as event_name
        FROM operational_details od
        LEFT JOIN places p ON od.establishment_id = p.id
        LEFT JOIN eventos e ON od.event_id = e.id
        WHERE od.id = $1
      `;
      
      const detailsResult = await pool.query(query, [id]);
      
      if (detailsResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Detalhe operacional não encontrado'
        });
      }

      const actor = await resolveActorScope(pool, req.user);
      if (!canAccessOperationalEstablishment(actor, detailsResult.rows[0].establishment_id)) {
        return res.status(404).json({
          success: false,
          error: 'Detalhe operacional não encontrado'
        });
      }
      
      // Garantir que event_date seja uma string no formato YYYY-MM-DD
      const detail = detailsResult.rows[0];
      if (detail.event_date) {
        if (detail.event_date instanceof Date) {
          detail.event_date = detail.event_date.toISOString().split('T')[0];
        } else if (typeof detail.event_date === 'string' && detail.event_date.includes('T')) {
          detail.event_date = detail.event_date.split('T')[0];
        }
      }
      
      res.json({
        success: true,
        data: detail
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
      const existingResult = await pool.query(
        'SELECT id, establishment_id FROM operational_details WHERE id = $1',
        [id]
      );

      if (existingResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Detalhe operacional não encontrado'
        });
      }

      const actor = await resolveActorScope(pool, req.user);
      const existingEstId = existingResult.rows[0].establishment_id;
      if (!canAccessOperationalEstablishment(actor, existingEstId)) {
        return res.status(404).json({
          success: false,
          error: 'Detalhe operacional não encontrado'
        });
      }
      if (
        establishment_id != null &&
        establishment_id !== '' &&
        !canAccessOperationalEstablishment(actor, establishment_id)
      ) {
        return res.status(404).json({
          success: false,
          error: 'Estabelecimento não encontrado'
        });
      }

      // Se a data está sendo alterada, verificar se já existe outro registro com essa data
      if (event_date) {
        const dateConflictResult = await pool.query(
          'SELECT id FROM operational_details WHERE event_date = $1 AND id != $2',
          [event_date, id]
        );

        if (dateConflictResult.rows.length > 0) {
          return res.status(400).json({
            success: false,
            error: 'Já existe outro detalhe operacional para esta data'
          });
        }
      }

      const updateFields = [];
      const updateValues = [];
      let paramIndex = 1;

      // Campos básicos
      if (os_type !== undefined) {
        updateFields.push(`os_type = $${paramIndex++}`);
        updateValues.push(os_type || null);
      }
      if (os_number !== undefined) {
        updateFields.push(`os_number = $${paramIndex++}`);
        updateValues.push(os_number || null);
      }
      if (event_id !== undefined) {
        updateFields.push(`event_id = $${paramIndex++}`);
        updateValues.push(event_id || null);
      }
      if (establishment_id !== undefined) {
        updateFields.push(`establishment_id = $${paramIndex++}`);
        updateValues.push(establishment_id || null);
      }
      if (event_date !== undefined) {
        updateFields.push(`event_date = $${paramIndex++}`);
        updateValues.push(event_date);
      }
      if (artistic_attraction !== undefined) {
        updateFields.push(`artistic_attraction = $${paramIndex++}`);
        updateValues.push(artistic_attraction);
      }
      if (show_schedule !== undefined) {
        updateFields.push(`show_schedule = $${paramIndex++}`);
        updateValues.push(show_schedule || null);
      }
      if (ticket_prices !== undefined) {
        updateFields.push(`ticket_prices = $${paramIndex++}`);
        updateValues.push(ticket_prices);
      }
      if (promotions !== undefined) {
        updateFields.push(`promotions = $${paramIndex++}`);
        updateValues.push(promotions || null);
      }
      if (visual_reference_url !== undefined) {
        updateFields.push(`visual_reference_url = $${paramIndex++}`);
        updateValues.push(visual_reference_url || null);
      }
      if (admin_notes !== undefined) {
        updateFields.push(`admin_notes = $${paramIndex++}`);
        updateValues.push(admin_notes || null);
      }
      if (operational_instructions !== undefined) {
        updateFields.push(`operational_instructions = $${paramIndex++}`);
        updateValues.push(operational_instructions || null);
      }
      if (is_active !== undefined) {
        updateFields.push(`is_active = $${paramIndex++}`);
        updateValues.push(is_active ? 1 : 0);
      }
      
      // Campos de Artista
      if (contractor_name !== undefined) { updateFields.push(`contractor_name = $${paramIndex++}`); updateValues.push(contractor_name || null); }
      if (contractor_cnpj !== undefined) { updateFields.push(`contractor_cnpj = $${paramIndex++}`); updateValues.push(contractor_cnpj || null); }
      if (contractor_address !== undefined) { updateFields.push(`contractor_address = $${paramIndex++}`); updateValues.push(contractor_address || null); }
      if (contractor_legal_responsible !== undefined) { updateFields.push(`contractor_legal_responsible = $${paramIndex++}`); updateValues.push(contractor_legal_responsible || null); }
      if (contractor_legal_cpf !== undefined) { updateFields.push(`contractor_legal_cpf = $${paramIndex++}`); updateValues.push(contractor_legal_cpf || null); }
      if (contractor_phone !== undefined) { updateFields.push(`contractor_phone = $${paramIndex++}`); updateValues.push(contractor_phone || null); }
      if (contractor_email !== undefined) { updateFields.push(`contractor_email = $${paramIndex++}`); updateValues.push(contractor_email || null); }
      if (artist_artistic_name !== undefined) { updateFields.push(`artist_artistic_name = $${paramIndex++}`); updateValues.push(artist_artistic_name || null); }
      if (artist_full_name !== undefined) { updateFields.push(`artist_full_name = $${paramIndex++}`); updateValues.push(artist_full_name || null); }
      if (artist_cpf_cnpj !== undefined) { updateFields.push(`artist_cpf_cnpj = $${paramIndex++}`); updateValues.push(artist_cpf_cnpj || null); }
      if (artist_address !== undefined) { updateFields.push(`artist_address = $${paramIndex++}`); updateValues.push(artist_address || null); }
      if (artist_phone !== undefined) { updateFields.push(`artist_phone = $${paramIndex++}`); updateValues.push(artist_phone || null); }
      if (artist_email !== undefined) { updateFields.push(`artist_email = $${paramIndex++}`); updateValues.push(artist_email || null); }
      if (artist_responsible_name !== undefined) { updateFields.push(`artist_responsible_name = $${paramIndex++}`); updateValues.push(artist_responsible_name || null); }
      if (artist_bank_name !== undefined) { updateFields.push(`artist_bank_name = $${paramIndex++}`); updateValues.push(artist_bank_name || null); }
      if (artist_bank_agency !== undefined) { updateFields.push(`artist_bank_agency = $${paramIndex++}`); updateValues.push(artist_bank_agency || null); }
      if (artist_bank_account !== undefined) { updateFields.push(`artist_bank_account = $${paramIndex++}`); updateValues.push(artist_bank_account || null); }
      if (artist_bank_account_type !== undefined) { updateFields.push(`artist_bank_account_type = $${paramIndex++}`); updateValues.push(artist_bank_account_type || null); }
      if (event_name !== undefined) { updateFields.push(`event_name = $${paramIndex++}`); updateValues.push(event_name || null); }
      if (event_location_address !== undefined) { updateFields.push(`event_location_address = $${paramIndex++}`); updateValues.push(event_location_address || null); }
      if (event_presentation_date !== undefined) { updateFields.push(`event_presentation_date = $${paramIndex++}`); updateValues.push(event_presentation_date || null); }
      if (event_presentation_time !== undefined) { updateFields.push(`event_presentation_time = $${paramIndex++}`); updateValues.push(event_presentation_time || null); }
      if (event_duration !== undefined) { updateFields.push(`event_duration = $${paramIndex++}`); updateValues.push(event_duration || null); }
      if (event_soundcheck_time !== undefined) { updateFields.push(`event_soundcheck_time = $${paramIndex++}`); updateValues.push(event_soundcheck_time || null); }
      if (event_structure_offered !== undefined) { updateFields.push(`event_structure_offered = $${paramIndex++}`); updateValues.push(event_structure_offered || null); }
      if (event_equipment_provided_by_contractor !== undefined) { updateFields.push(`event_equipment_provided_by_contractor = $${paramIndex++}`); updateValues.push(event_equipment_provided_by_contractor || null); }
      if (event_equipment_brought_by_artist !== undefined) { updateFields.push(`event_equipment_brought_by_artist = $${paramIndex++}`); updateValues.push(event_equipment_brought_by_artist || null); }
      if (financial_total_value !== undefined) { updateFields.push(`financial_total_value = $${paramIndex++}`); updateValues.push(financial_total_value || null); }
      if (financial_payment_method !== undefined) { updateFields.push(`financial_payment_method = $${paramIndex++}`); updateValues.push(financial_payment_method || null); }
      if (financial_payment_conditions !== undefined) { updateFields.push(`financial_payment_conditions = $${paramIndex++}`); updateValues.push(financial_payment_conditions || null); }
      if (financial_discounts_or_fees !== undefined) { updateFields.push(`financial_discounts_or_fees = $${paramIndex++}`); updateValues.push(financial_discounts_or_fees || null); }
      if (general_penalties !== undefined) { updateFields.push(`general_penalties = $${paramIndex++}`); updateValues.push(general_penalties || null); }
      if (general_transport_responsibility !== undefined) { updateFields.push(`general_transport_responsibility = $${paramIndex++}`); updateValues.push(general_transport_responsibility || null); }
      if (general_image_rights !== undefined) { updateFields.push(`general_image_rights = $${paramIndex++}`); updateValues.push(general_image_rights || null); }
      if (contractor_signature !== undefined) { updateFields.push(`contractor_signature = $${paramIndex++}`); updateValues.push(contractor_signature || null); }
      if (artist_signature !== undefined) { updateFields.push(`artist_signature = $${paramIndex++}`); updateValues.push(artist_signature || null); }
      
      // Campos de Bar/Fornecedor
      if (provider_name !== undefined) { updateFields.push(`provider_name = $${paramIndex++}`); updateValues.push(provider_name || null); }
      if (provider_cpf_cnpj !== undefined) { updateFields.push(`provider_cpf_cnpj = $${paramIndex++}`); updateValues.push(provider_cpf_cnpj || null); }
      if (provider_address !== undefined) { updateFields.push(`provider_address = $${paramIndex++}`); updateValues.push(provider_address || null); }
      if (provider_responsible_name !== undefined) { updateFields.push(`provider_responsible_name = $${paramIndex++}`); updateValues.push(provider_responsible_name || null); }
      if (provider_responsible_contact !== undefined) { updateFields.push(`provider_responsible_contact = $${paramIndex++}`); updateValues.push(provider_responsible_contact || null); }
      if (provider_bank_name !== undefined) { updateFields.push(`provider_bank_name = $${paramIndex++}`); updateValues.push(provider_bank_name || null); }
      if (provider_bank_agency !== undefined) { updateFields.push(`provider_bank_agency = $${paramIndex++}`); updateValues.push(provider_bank_agency || null); }
      if (provider_bank_account !== undefined) { updateFields.push(`provider_bank_account = $${paramIndex++}`); updateValues.push(provider_bank_account || null); }
      if (provider_bank_account_type !== undefined) { updateFields.push(`provider_bank_account_type = $${paramIndex++}`); updateValues.push(provider_bank_account_type || null); }
      if (service_type !== undefined) { updateFields.push(`service_type = $${paramIndex++}`); updateValues.push(service_type || null); }
      if (service_professionals_count !== undefined) { updateFields.push(`service_professionals_count = $${paramIndex++}`); updateValues.push(service_professionals_count || null); }
      if (service_materials_included !== undefined) { updateFields.push(`service_materials_included = $${paramIndex++}`); updateValues.push(service_materials_included || null); }
      if (service_start_date !== undefined) { updateFields.push(`service_start_date = $${paramIndex++}`); updateValues.push(service_start_date || null); }
      if (service_start_time !== undefined) { updateFields.push(`service_start_time = $${paramIndex++}`); updateValues.push(service_start_time || null); }
      if (service_end_date !== undefined) { updateFields.push(`service_end_date = $${paramIndex++}`); updateValues.push(service_end_date || null); }
      if (service_end_time !== undefined) { updateFields.push(`service_end_time = $${paramIndex++}`); updateValues.push(service_end_time || null); }
      if (service_setup_location !== undefined) { updateFields.push(`service_setup_location = $${paramIndex++}`); updateValues.push(service_setup_location || null); }
      if (service_technical_responsible !== undefined) { updateFields.push(`service_technical_responsible = $${paramIndex++}`); updateValues.push(service_technical_responsible || null); }
      if (commercial_total_value !== undefined) { updateFields.push(`commercial_total_value = $${paramIndex++}`); updateValues.push(commercial_total_value || null); }
      if (commercial_payment_method !== undefined) { updateFields.push(`commercial_payment_method = $${paramIndex++}`); updateValues.push(commercial_payment_method || null); }
      if (commercial_payment_deadline !== undefined) { updateFields.push(`commercial_payment_deadline = $${paramIndex++}`); updateValues.push(commercial_payment_deadline || null); }
      if (commercial_cancellation_policy !== undefined) { updateFields.push(`commercial_cancellation_policy = $${paramIndex++}`); updateValues.push(commercial_cancellation_policy || null); }
      if (commercial_additional_costs !== undefined) { updateFields.push(`commercial_additional_costs = $${paramIndex++}`); updateValues.push(commercial_additional_costs || null); }
      if (general_damage_responsibility !== undefined) { updateFields.push(`general_damage_responsibility = $${paramIndex++}`); updateValues.push(general_damage_responsibility || null); }
      if (general_conduct_rules !== undefined) { updateFields.push(`general_conduct_rules = $${paramIndex++}`); updateValues.push(general_conduct_rules || null); }
      if (general_insurance !== undefined) { updateFields.push(`general_insurance = $${paramIndex++}`); updateValues.push(general_insurance || null); }
      if (provider_signature !== undefined) { updateFields.push(`provider_signature = $${paramIndex++}`); updateValues.push(provider_signature || null); }

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
        WHERE id = $${paramIndex}
      `;

      await pool.query(query, updateValues);

      notifyOsChange({
        establishmentId: establishment_id || existingEstId,
        action: 'updated',
        detailId: Number(id),
        osType: os_type,
        date: event_date,
        projectName: artistic_attraction,
      });

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
      const existingResult = await pool.query(
        'SELECT id, establishment_id FROM operational_details WHERE id = $1',
        [id]
      );

      if (existingResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Detalhe operacional não encontrado'
        });
      }

      const actor = await resolveActorScope(pool, req.user);
      if (!canAccessOperationalEstablishment(actor, existingResult.rows[0].establishment_id)) {
        return res.status(404).json({
          success: false,
          error: 'Detalhe operacional não encontrado'
        });
      }

      await pool.query('DELETE FROM operational_details WHERE id = $1', [id]);

      notifyOsChange({
        establishmentId: existingResult.rows[0].establishment_id,
        action: 'deleted',
        detailId: Number(id),
      });

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

