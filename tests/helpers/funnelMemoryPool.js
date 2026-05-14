const { randomUUID } = require('crypto');

function createFunnelMemoryPool() {
  const conversations = new Map();
  const messages = [];
  const states = new Map();
  const funnelEvents = [];
  let conversationSeq = 1;
  let messageSeq = 1;
  let stateSeq = 1;

  function conversationRow(id) {
    return conversations.get(id);
  }

  async function query(sql, params = []) {
    const normalized = String(sql || '').replace(/\s+/g, ' ').trim();

    if (normalized.includes('INSERT INTO conversation_funnel_events')) {
      funnelEvents.push({
        event_type: params[0],
        conversation_id: params[1],
        session_id: params[2],
        wa_id: params[3],
        establishment_id: params[4],
        step: params[5],
        previous_step: params[6],
        retry_count: params[7],
        payload: JSON.parse(params[8] || '{}'),
      });
      return { rows: [{ id: funnelEvents.length, occurred_at: new Date() }] };
    }

    if (normalized.includes('FROM conversation_state WHERE conversation_id')) {
      const row = states.get(Number(params[0]));
      return { rows: row ? [row] : [] };
    }

    if (normalized.includes('INSERT INTO conversation_state')) {
      const conversationId = Number(params[0]);
      const waId = params[1];
      const missingFields = JSON.parse(params[2] || '[]');
      const reservationContext = JSON.parse(params[3] || '{}');
      const existing = states.get(conversationId);
      const row = existing || {
        id: stateSeq++,
        session_id: randomUUID(),
        conversation_id: conversationId,
        wa_id: waId,
        current_step: 'greeting',
        completed_steps: '[]',
        retry_count: 0,
        collected_fields: '{}',
        missing_fields: JSON.stringify(missingFields),
        reservation_context: JSON.stringify(reservationContext),
        last_question: null,
        last_intent: null,
        handoff_recommended: false,
        emotional_state: null,
        lead_temperature: null,
        lead_type: null,
        followup_status: 'none',
        abandoned_at: null,
        last_followup_at: null,
        recovery_attempts: 0,
        state_version: 1,
        updated_at: new Date(),
        created_at: new Date(),
      };
      row.wa_id = waId;
      row.updated_at = new Date();
      states.set(conversationId, row);
      return { rows: [row] };
    }

    if (normalized.startsWith('UPDATE conversation_state')) {
      const conversationId = Number(params[params.length - 1]);
      const row = states.get(conversationId);
      if (!row) return { rows: [] };

      const setClause = normalized.match(/SET (.+?) WHERE/i)?.[1] || '';
      const assignments = setClause.split(',').map((part) => part.trim());
      let paramIndex = 0;

      for (const assignment of assignments) {
        if (assignment.includes('state_version = conversation_state.state_version + 1')) continue;
        if (assignment.includes('updated_at = NOW()')) {
          row.updated_at = new Date();
          continue;
        }

        const column = assignment.split('=')[0].trim();
        const value = params[paramIndex++];
        if (column === 'current_step') row.current_step = value;
        if (column === 'completed_steps') row.completed_steps = value;
        if (column === 'retry_count') row.retry_count = value;
        if (column === 'collected_fields') row.collected_fields = value;
        if (column === 'missing_fields') row.missing_fields = value;
        if (column === 'reservation_context') row.reservation_context = value;
        if (column === 'last_question') row.last_question = value;
        if (column === 'last_intent') row.last_intent = value;
        if (column === 'handoff_recommended') row.handoff_recommended = value;
        if (column === 'emotional_state') row.emotional_state = value;
        if (column === 'lead_temperature') row.lead_temperature = value;
        if (column === 'lead_type') row.lead_type = value;
        if (column === 'followup_status') row.followup_status = value;
        if (column === 'abandoned_at') row.abandoned_at = value;
        if (column === 'last_followup_at') row.last_followup_at = value;
        if (column === 'recovery_attempts') row.recovery_attempts = value;
      }

      row.state_version = Number(row.state_version || 1) + 1;
      states.set(conversationId, row);
      return { rows: [row] };
    }

    if (normalized.includes('FROM restaurant_areas')) {
      return {
        rows: [{ id: 10, name: 'Salão', establishment_id: 1 }],
      };
    }

    if (normalized.includes('FROM places') || normalized.includes('FROM bars')) {
      return {
        rows: [{ id: 1, name: 'Estabelecimento Teste' }],
      };
    }

    if (normalized.includes('FROM customer_operational_profile')) {
      return { rows: [] };
    }

  if (normalized.includes('INSERT INTO whatsapp_conversations')) {
      const waId = params[0];
      const existing = [...conversations.values()].find((row) => row.wa_id === waId);
      if (existing) {
        return { rows: [existing] };
      }
      const row = {
        id: conversationSeq++,
        wa_id: waId,
        contact_name: params[1] || null,
        establishment_id: params[2] || null,
        establishment_name: 'Estabelecimento Teste',
        human_takeover_until: null,
        updated_at: new Date(),
        created_at: new Date(),
      };
      conversations.set(row.id, row);
      return { rows: [row] };
    }

    if (normalized.includes('INSERT INTO whatsapp_messages')) {
      const row = {
        id: messageSeq++,
        conversation_id: params[0],
        direction: params[1],
        body: params[2],
        intent: params[4] || null,
        created_at: new Date(),
      };
      messages.push(row);
      return { rows: [row] };
    }

    if (normalized.includes('FROM whatsapp_messages')) {
      return { rows: messages.filter((row) => row.conversation_id === Number(params[0])) };
    }

    if (normalized.includes('FROM whatsapp_conversations WHERE wa_id')) {
      const row = [...conversations.values()].find((item) => item.wa_id === params[0]);
      return { rows: row ? [row] : [] };
    }

    if (normalized.includes('UPDATE whatsapp_conversations')) {
      const row = [...conversations.values()].find((item) => item.wa_id === params[params.length - 1]);
      if (row && params[0] !== undefined) {
        row.establishment_id = Number(params[0]);
      }
      return { rows: [row] };
    }

    if (normalized.includes('INSERT INTO whatsapp_contacts')) {
      return { rows: [{ id: 1 }] };
    }

    if (normalized.includes('SELECT human_takeover_until')) {
      return { rows: [{ human_takeover_until: null }] };
    }

    if (normalized.includes('UPDATE whatsapp_messages SET intent')) {
      return { rows: [] };
    }

    return { rows: [] };
  }

  return {
    query,
    getState(conversationId) {
      return states.get(Number(conversationId));
    },
    getFunnelEvents() {
      return [...funnelEvents];
    },
    conversationRow,
  };
}

module.exports = {
  createFunnelMemoryPool,
};
