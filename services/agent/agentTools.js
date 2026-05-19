const businessRulesEngine = require('../businessRulesEngine');
const {
  buildReservationBodyFromParams,
  createReservationInternal,
  buildGuestListSecondMessage,
  ageFromIsoDate,
  normalizeCanonicalEstablishmentId,
} = require('../whatsappReservationService');
const { getCardapioUrlByEstablishmentId, loadActiveRestaurantAreas } = require('../conversationEngine/helpers');

const DEFAULT_FAQ = {
  estacionamento:
    'A orientação de estacionamento pode variar conforme o dia e o evento. Posso confirmar com a equipe da casa no dia da reserva.',
  pet: 'A política de pets pode variar conforme a casa e o evento. Posso confirmar com a equipe no dia da reserva.',
  musica:
    'A programação musical pode variar conforme evento e operação do dia. Posso alinhar o estilo do dia quando você confirmar a data.',
  cardapio: 'Posso te enviar o cardápio digital da casa escolhida.',
  crianca:
    'Para reservar conosco é necessário ter 18 anos ou mais. A data de nascimento é usada apenas para confirmar a idade.',
};

function normalizeTopic(topic) {
  return String(topic || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_');
}

/** Rotas ricas (ex.: Highline). Ordem importa: primeira correspondência vence. */
const RICH_FAQ_TOPIC_ROUTES = [
  {
    slug: 'dias_horarios_funcionamento',
    keywords: ['horario', 'horarios', 'funcionamento', 'dias', 'aberto', 'fecha', 'fechado', 'fechamento'],
    fallbacks: [
      'dias_horarios_funcionamento',
      'horario_funcionamento',
      'horario',
      'horarios',
      'funcionamento',
    ],
  },
  {
    slug: 'valores_entrada',
    keywords: [
      'valores',
      'entrada',
      'entradas',
      'preco',
      'precos',
      'vip',
      'lista',
      'consumacao',
      'ingresso',
      'ingressos',
    ],
    fallbacks: ['valores_entrada'],
  },
  {
    slug: 'beneficios_aniversario',
    keywords: [
      'aniversario',
      'aniversarios',
      'niver',
      'bday',
      'comemoracao',
      'beneficios',
      'vantagens',
    ],
    fallbacks: ['beneficios_aniversario', 'aniversarios', 'aniversario'],
  },
  {
    slug: 'regras_bolo',
    keywords: ['bolo', 'doce', 'doces', 'sobremesa', 'sobremesas'],
    fallbacks: ['regras_bolo'],
  },
  {
    slug: 'redes_sociais_fotos',
    keywords: ['fotos', 'foto', 'instagram', 'insta', 'local', 'conhecer', 'vibe'],
    fallbacks: ['redes_sociais_fotos'],
  },
  {
    slug: 'areas_mesas_camarotes_diferenca',
    keywords: [
      'mesa',
      'mesas',
      'camarote',
      'camarotes',
      'rooftop',
      'area',
      'areas',
      'espaco',
      'espacos',
      'lounge',
      'bangalo',
    ],
    fallbacks: ['areas_mesas_camarotes_diferenca', 'areas', 'area'],
  },
];

const LEGACY_FAQ_ALIASES = {
  pet: ['pet', 'pets'],
  pets: ['pets', 'pet'],
  musica: ['musica'],
  cardapio: ['cardapio', 'menu'],
  menu: ['cardapio', 'menu'],
  crianca: ['crianca', 'criancas', 'menor', 'menores'],
  criancas: ['crianca', 'criancas', 'menor', 'menores'],
  horario: [
    'dias_horarios_funcionamento',
    'horario_funcionamento',
    'horario',
    'horarios',
    'funcionamento',
  ],
  horarios: [
    'dias_horarios_funcionamento',
    'horario_funcionamento',
    'horario',
    'horarios',
    'funcionamento',
  ],
  funcionamento: [
    'dias_horarios_funcionamento',
    'horario_funcionamento',
    'horario',
    'funcionamento',
  ],
  horario_funcionamento: [
    'dias_horarios_funcionamento',
    'horario_funcionamento',
    'horario',
    'funcionamento',
  ],
  estacionamento: ['estacionamento', 'valet', 'estacionar'],
  valet: ['estacionamento', 'valet'],
  dress_code: ['dress_code', 'traje', 'vestimenta'],
  aniversario: ['beneficios_aniversario', 'aniversarios', 'aniversario'],
  aniversarios: ['beneficios_aniversario', 'aniversarios', 'aniversario'],
  area: ['areas_mesas_camarotes_diferenca', 'areas', 'area'],
  areas: ['areas_mesas_camarotes_diferenca', 'areas', 'area'],
};

function topicMatchesKeyword(normalized, keyword) {
  const token = String(keyword || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (!normalized || !token) return false;
  if (normalized === token) return true;
  if (normalized.includes(token)) return true;
  return normalized.split('_').some((segment) => segment === token || segment.startsWith(token));
}

function matchRichFaqSlug(normalized) {
  if (!normalized) return null;
  for (const route of RICH_FAQ_TOPIC_ROUTES) {
    if (route.keywords.some((keyword) => topicMatchesKeyword(normalized, keyword))) {
      return route.slug;
    }
  }
  return null;
}

function getRichFaqCandidates(normalized) {
  const slug = matchRichFaqSlug(normalized);
  if (!slug) return [];
  const route = RICH_FAQ_TOPIC_ROUTES.find((entry) => entry.slug === slug);
  return route?.fallbacks?.length ? route.fallbacks : [slug];
}

function buildFaqTopicCandidates(topic) {
  const normalized = normalizeTopic(topic);
  if (!normalized) return [];

  const richCandidates = getRichFaqCandidates(normalized);
  if (richCandidates.length > 0) {
    return [...new Set(richCandidates.filter(Boolean))];
  }

  const legacyCandidates = LEGACY_FAQ_ALIASES[normalized] || [normalized];
  return [...new Set(legacyCandidates.filter(Boolean))];
}

async function loadActiveAreas(pool, establishmentId) {
  try {
    return await loadActiveRestaurantAreas(pool, establishmentId);
  } catch (error) {
    console.warn('[agentTools] falha ao carregar áreas:', error.message);
    return [];
  }
}

function getAgentToolDefinitions() {
  return [
    {
      type: 'function',
      function: {
        name: 'consultar_faq_estabelecimento',
        description:
          'Consulta regras operacionais do estabelecimento (estacionamento, pet, música, cardápio, criança, etc.). Use antes de responder dúvidas factuais.',
        parameters: {
          type: 'object',
          properties: {
            estabelecimento_id: { type: 'integer' },
            topico: {
              type: 'string',
              description:
                'Tema operacional: estacionamento, pet, musica, cardapio, crianca, dias_horarios_funcionamento, valores_entrada, beneficios_aniversario, regras_bolo, redes_sociais_fotos, areas_mesas_camarotes_diferenca, ou sinônimos (horário, entrada, aniversário, bolo, instagram, camarote, etc.).',
            },
          },
          required: ['estabelecimento_id', 'topico'],
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'verificar_disponibilidade',
        description:
          'Consulta horários e áreas disponíveis no sistema para uma data. Use somente após o cliente confirmar o dia (ex.: "sim, essa sexta dia 23/05"). Nunca invente horários ou disponibilidade sem chamar esta função.',
        parameters: {
          type: 'object',
          properties: {
            estabelecimento_id: { type: 'integer' },
            data: {
              type: 'string',
              description:
                'YYYY-MM-DD já confirmado com o cliente. Se ele disse apenas "sexta" ou "essa sexta", confirme o dia antes de chamar.',
            },
            quantidade_pessoas: { type: 'integer' },
          },
          required: ['estabelecimento_id', 'data'],
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'criar_pre_reserva',
        description:
          'Registra a pré-reserva no sistema somente após coletar naturalmente os dados com o cliente e confirmar a data (dia da semana + DD/MM).',
        parameters: {
          type: 'object',
          properties: {
            estabelecimento_id: { type: 'integer' },
            data: {
              type: 'string',
              description: 'YYYY-MM-DD confirmado explicitamente com o cliente.',
            },
            horario: { type: 'string', description: 'HH:mm' },
            area: { type: 'string', description: 'Nome ou id da área' },
            cliente_dados: {
              type: 'object',
              properties: {
                nome: { type: 'string' },
                email: { type: 'string' },
                data_nascimento: { type: 'string', description: 'YYYY-MM-DD' },
              },
              required: ['nome', 'email', 'data_nascimento'],
            },
            quantidade_pessoas: { type: 'integer' },
          },
          required: [
            'estabelecimento_id',
            'cliente_dados',
            'data',
            'horario',
            'area',
            'quantidade_pessoas',
          ],
          additionalProperties: false,
        },
      },
    },
  ];
}

async function consultarFaqEstabelecimento(pool, args = {}) {
  const establishmentId = Number(normalizeCanonicalEstablishmentId(args.estabelecimento_id));
  const topicCandidates = buildFaqTopicCandidates(args.topico);
  const topic = topicCandidates[0] || null;
  if (!Number.isFinite(establishmentId) || establishmentId <= 0 || !topic) {
    return { ok: false, error: 'estabelecimento_id e topico são obrigatórios.' };
  }

  let answer = null;
  let matchedTopic = topic;
  try {
    let bestRow = null;
    for (const candidate of topicCandidates) {
      const result = await pool.query(
        `SELECT topic, answer, updated_at
           FROM establishment_faq
          WHERE establishment_id = $1
            AND topic = $2
            AND is_active = TRUE
          LIMIT 1`,
        [establishmentId, candidate]
      );
      const row = result.rows[0];
      if (!row?.answer) continue;
      const updatedAt = row.updated_at ? new Date(row.updated_at).getTime() : 0;
      if (!bestRow || updatedAt > bestRow.updatedAt) {
        bestRow = {
          answer: row.answer,
          topic: row.topic || candidate,
          updatedAt,
        };
      }
    }
    if (bestRow) {
      answer = bestRow.answer;
      matchedTopic = bestRow.topic;
    }
  } catch (_error) {
    answer = null;
  }

  if (!answer) {
    answer = DEFAULT_FAQ[topic] || DEFAULT_FAQ[matchedTopic] || null;
  }

  if (topic === 'cardapio' || matchedTopic === 'cardapio') {
    const cardapioUrl = getCardapioUrlByEstablishmentId(establishmentId);
    if (cardapioUrl) {
      answer = `O cardápio digital está em ${cardapioUrl}`;
    }
  }

  if (!answer) {
    return {
      ok: false,
      establishment_id: establishmentId,
      topic: matchedTopic,
      error: 'Não encontrei orientação cadastrada para este tópico. Posso confirmar com a equipe da casa.',
    };
  }

  return {
    ok: true,
    establishment_id: establishmentId,
    topic: matchedTopic,
    answer,
  };
}

async function verificarDisponibilidade(pool, args = {}) {
  const establishmentId = Number(normalizeCanonicalEstablishmentId(args.estabelecimento_id));
  const reservationDate = String(args.data || '').slice(0, 10);
  const partySize = Number(args.quantidade_pessoas);

  if (!Number.isFinite(establishmentId) || establishmentId <= 0 || !reservationDate) {
    return { ok: false, error: 'estabelecimento_id e data são obrigatórios.' };
  }

  const override = await businessRulesEngine.getDateOverride(pool, establishmentId, reservationDate);
  if (override && override.is_open === false) {
    return {
      ok: true,
      estabelecimento_id: establishmentId,
      reservation_date: reservationDate,
      quantidade_pessoas: Number.isFinite(partySize) ? partySize : null,
      is_open: false,
      windows: [],
      areas: [],
      note: override.note || null,
    };
  }

  const windows = await businessRulesEngine.getOperatingWindowsForDate(
    pool,
    establishmentId,
    reservationDate
  );
  const areas = await loadActiveAreas(pool, establishmentId);
  const partyValidation = Number.isFinite(partySize)
    ? businessRulesEngine.validateReservationPartySize({
        establishment_id: establishmentId,
        quantidade_convidados: partySize,
      })
    : { ok: true };

  return {
    ok: true,
    estabelecimento_id: establishmentId,
    reservation_date: reservationDate,
    quantidade_pessoas: Number.isFinite(partySize) ? partySize : null,
    is_open: windows.length > 0,
    windows,
    areas: areas.map((area) => ({ id: area.id, name: area.name })),
    override: override || null,
    party_size_allowed: partyValidation.ok,
    party_size_message: partyValidation.ok ? null : partyValidation.message,
  };
}

async function resolveAreaId(pool, establishmentId, areaValue) {
  const areas = await loadActiveAreas(pool, establishmentId);
  const numeric = Number(areaValue);
  if (Number.isFinite(numeric) && numeric > 0) {
    const allowed = areas.find((area) => Number(area.id) === numeric);
    return allowed ? numeric : null;
  }

  const normalized = String(areaValue || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  const match = areas.find((area) =>
    String(area.name || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .includes(normalized)
  );
  return match ? Number(match.id) : null;
}

async function criarPreReserva(pool, args = {}, runtimeContext = {}) {
  const establishmentId = normalizeCanonicalEstablishmentId(args.estabelecimento_id);
  const reservationDate = String(args.data || '').slice(0, 10);
  const reservationTime = String(args.horario || '').trim();
  const partySize = Number(args.quantidade_pessoas);
  const cliente = args.cliente_dados || {};
  const waId = runtimeContext.waId;

  if (!Number.isFinite(establishmentId) || establishmentId <= 0 || !reservationDate || !reservationTime) {
    return { ok: false, error: 'Dados obrigatórios para pré-reserva.' };
  }

  const areaId = await resolveAreaId(pool, establishmentId, args.area);
  if (!areaId) {
    return { ok: false, error: 'Área inválida ou não encontrada para este estabelecimento.' };
  }

  const age = ageFromIsoDate(cliente.data_nascimento);
  if (age !== null && age < 18) {
    return { ok: false, error: 'Reservas exigem +18 anos.' };
  }

  const params = {
    establishment_id: establishmentId,
    client_name: cliente.nome,
    client_email: cliente.email,
    data_nascimento: cliente.data_nascimento,
    quantidade_convidados: partySize,
    reservation_date: reservationDate,
    reservation_time: reservationTime,
    area_id: areaId,
  };

  const body = buildReservationBodyFromParams(params, waId, { notes: 'Origem: WhatsApp (Agente IA)' });
  const created = await createReservationInternal(body);
  if (!created.success) {
    return { ok: false, error: created.error || 'Falha ao registrar pré-reserva.' };
  }

  const reservationRow = created.data?.reservation || created.data || {};
  const guestListLink = created.data?.guest_list_link || null;

  return {
    ok: true,
    pre_reserva: {
      establishment_id: establishmentId,
      reservation_date: reservationDate,
      reservation_time: reservationTime,
      quantidade_pessoas: partySize,
      area_id: areaId,
      cliente: {
        nome: cliente.nome,
        email: cliente.email,
        data_nascimento: cliente.data_nascimento,
      },
      reservation_id: reservationRow.id || null,
    },
    guest_list_link: guestListLink,
    reservation: reservationRow,
  };
}

async function executeAgentToolCall(pool, toolCall, runtimeContext = {}) {
  const toolName = toolCall?.function?.name;
  let args = {};
  try {
    args = JSON.parse(toolCall?.function?.arguments || '{}');
  } catch (_error) {
    args = {};
  }

  if (toolName === 'consultar_faq_estabelecimento') {
    return consultarFaqEstabelecimento(pool, args);
  }
  if (toolName === 'verificar_disponibilidade') {
    return verificarDisponibilidade(pool, args);
  }
  if (toolName === 'criar_pre_reserva') {
    return criarPreReserva(pool, args, runtimeContext);
  }

  return { ok: false, error: `Tool desconhecida: ${toolName}` };
}

module.exports = {
  getAgentToolDefinitions,
  executeAgentToolCall,
  consultarFaqEstabelecimento,
  verificarDisponibilidade,
  criarPreReserva,
  normalizeTopic,
  buildFaqTopicCandidates,
  matchRichFaqSlug,
};
