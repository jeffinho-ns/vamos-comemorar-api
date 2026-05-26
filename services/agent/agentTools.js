const businessRulesEngine = require('../businessRulesEngine');
const {
  getZonedParts,
  toIsoDate,
  isDateInPastComparedToReference,
  isDateTooFarInFuture,
} = require('../../nlp/dateResolver');
const {
  checkCapacityViaInternalApi,
  buildAgentReservationOperatingBlock,
} = require('./reservationOperatingContext');
const {
  buildReservationBodyFromParams,
  createReservationInternal,
  buildGuestListSecondMessage,
  ageFromIsoDate,
  normalizeCanonicalEstablishmentId,
} = require('../whatsappReservationService');
const { getCardapioUrlByEstablishmentId, loadActiveRestaurantAreas } = require('../conversationEngine/helpers');
const {
  isHighlineEstablishment,
  resolveHighlineSubarea,
  consultHighlineReservationAreas,
  findAvailableTableInSubarea,
  findCombinedTablesInSubareaForGroup,
  STANDARD_SUBAREA_KEYS,
  HIGHLINE_SUBAREAS,
} = require('./highlineReservationAreas');
const {
  buildNotesFromReservationArgs,
  buildNotesFromWaitlistArgs,
} = require('./operationalNotes');

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
  {
    slug: 'reserva_areas_operacional_highline',
    keywords: [
      'deck',
      'hostess',
      'lista_de_espera',
      'lista espera',
      'mesa_disponivel',
      'mesas_disponiveis',
      'qual_area',
      'onde_sentar',
      'subarea',
      'bistro',
      'vista',
    ],
    fallbacks: ['reserva_areas_operacional_highline'],
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

/**
 * Para o Highline, NUNCA expor os nomes genéricos do banco
 * (Área Coberta, Área Descoberta, Área VIP, Balcão, Terraço).
 * Devolve apenas o vocabulário oficial do painel /admin/restaurant-reservations:
 * Deck (Frente/Esquerdo/Direito), Bar Central e Rooftop sob pedido.
 */
function buildHighlineAreasSummary({ partySize = null } = {}) {
  const labels = HIGHLINE_SUBAREAS
    .filter((sub) => STANDARD_SUBAREA_KEYS.has(sub.key))
    .map((sub) => ({ id: sub.area_id, name: sub.label }));
  labels.push({
    id: null,
    name: 'Rooftop (mesa em pacote/camarote — somente sob pedido do cliente)',
  });
  return labels;
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
                'Tema operacional: estacionamento, pet, musica, cardapio, crianca, dias_horarios_funcionamento, valores_entrada, beneficios_aniversario, regras_bolo, redes_sociais_fotos, areas_mesas_camarotes_diferenca, reserva_areas_operacional_highline (Highline: mesas do painel), ou sinônimos.',
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
          'Consulta agenda, capacidade e áreas no mesmo backend do painel /admin/restaurant-reservations (horários semanais, exceções, bloqueios, lotação). Use após o cliente confirmar o dia. Nunca invente vaga ou horário sem esta ferramenta.',
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
            horario: {
              type: 'string',
              description: 'HH:mm opcional — refine capacidade e turno (ex.: Rooftop).',
            },
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
            observacoes: {
              type: 'string',
              description:
                'Texto para o campo notes do painel: área que o cliente pediu, pedidos especiais, alternativas oferecidas, etc.',
            },
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
    {
      type: 'function',
      function: {
        name: 'consultar_areas_mesa_reserva',
        description:
          'Highline: consulta mesas livres por subárea (mesma lógica dos modais Nova/Editar Reserva em /admin/restaurant-reservations) e sugere a área ideal para o tamanho do grupo. Use quando o cliente perguntar sobre áreas ou antes de criar_pre_reserva no Highline.',
        parameters: {
          type: 'object',
          properties: {
            estabelecimento_id: { type: 'integer' },
            data: { type: 'string', description: 'YYYY-MM-DD confirmado com o cliente' },
            quantidade_pessoas: { type: 'integer' },
            area_preferida: {
              type: 'string',
              description:
                'Opcional: label da subárea (ex.: Área Deck - Frente, Área Rooftop - Bistrô).',
            },
            contexto_cliente: {
              type: 'string',
              description:
                'Trecho da mensagem do cliente (para saber se perguntou camarote/VIP).',
            },
          },
          required: ['estabelecimento_id', 'data', 'quantidade_pessoas'],
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'criar_lista_espera',
        description:
          'Registra o cliente na Lista de Espera do Sistema de Reservas (painel admin) quando todas as áreas/mesas estiverem cheias no Highline. Explique que a Equipe de Hostess alocará quando houver vaga.',
        parameters: {
          type: 'object',
          properties: {
            estabelecimento_id: { type: 'integer' },
            data: { type: 'string', description: 'YYYY-MM-DD' },
            horario: { type: 'string', description: 'HH:mm opcional' },
            quantidade_pessoas: { type: 'integer' },
            area_preferida: { type: 'string', description: 'Subárea desejada (opcional)' },
            cliente_dados: {
              type: 'object',
              properties: {
                nome: { type: 'string' },
                email: { type: 'string' },
                telefone: { type: 'string' },
              },
              required: ['nome'],
            },
            observacoes: {
              type: 'string',
              description:
                'Notes do painel: área desejada, motivo da espera, pedidos do cliente, o que foi combinado na conversa.',
            },
          },
          required: ['estabelecimento_id', 'data', 'quantidade_pessoas', 'cliente_dados'],
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

function getReferenceDateIso() {
  const today = getZonedParts();
  return toIsoDate(today.year, today.month, today.day);
}

async function verificarDisponibilidade(pool, args = {}) {
  const establishmentId = Number(normalizeCanonicalEstablishmentId(args.estabelecimento_id));
  const reservationDate = String(args.data || '').slice(0, 10);
  const partySize = Number(args.quantidade_pessoas);
  const reservationTime = String(args.horario || '').trim();
  const referenceDateIso = getReferenceDateIso();

  if (!Number.isFinite(establishmentId) || establishmentId <= 0 || !reservationDate) {
    return { ok: false, error: 'estabelecimento_id e data são obrigatórios.' };
  }

  if (isDateInPastComparedToReference(reservationDate, referenceDateIso)) {
    return {
      ok: false,
      error: `A data ${reservationDate} está no passado (hoje é ${referenceDateIso}). Use a data correta no formato YYYY-MM-DD.`,
    };
  }

  if (isDateTooFarInFuture(reservationDate, referenceDateIso, 11)) {
    console.warn(
      `[agentTools] verificar_disponibilidade rejeitado por data >11 meses: ${reservationDate} (hoje ${referenceDateIso})`
    );
    return {
      ok: false,
      error: `A data ${reservationDate} está muito longe (mais de 11 meses à frente de hoje ${referenceDateIso}). Confirme a data correta com o cliente — provavelmente houve erro de ano (alucinação do modelo). Use o calendário do sistema, NUNCA o seu treinamento.`,
    };
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
      fonte: 'restaurant_reservation_date_overrides',
    };
  }

  const windows = await businessRulesEngine.getOperatingWindowsForDate(
    pool,
    establishmentId,
    reservationDate
  );
  const areas = isHighlineEstablishment(establishmentId)
    ? buildHighlineAreasSummary({ partySize })
    : await loadActiveAreas(pool, establishmentId);
  const partyValidation = Number.isFinite(partySize)
    ? businessRulesEngine.validateReservationPartySize({
        establishment_id: establishmentId,
        quantidade_convidados: partySize,
      })
    : { ok: true };

  let capacity = null;
  if (partySize > 0 || reservationTime) {
    capacity = await checkCapacityViaInternalApi({
      establishmentId,
      reservationDate,
      partySize: Number.isFinite(partySize) ? partySize : 0,
      reservationTime: reservationTime || null,
    });
  }

  let operatingSummary = '';
  try {
    operatingSummary = await buildAgentReservationOperatingBlock(
      pool,
      establishmentId,
      '',
      reservationDate
    );
  } catch (_error) {
    operatingSummary = '';
  }

  const capacityData = capacity?.ok ? capacity.capacity : null;
  const canReserveByCapacity =
    capacityData == null ? null : capacityData.canMakeReservation !== false;

  return {
    ok: true,
    estabelecimento_id: establishmentId,
    reservation_date: reservationDate,
    horario_consultado: reservationTime || null,
    quantidade_pessoas: Number.isFinite(partySize) ? partySize : null,
    is_open: windows.length > 0,
    windows: windows.map((w) => (typeof w === 'string' ? { label: w } : w)),
    areas: areas.map((area) => ({ id: area.id, name: area.name })),
    areas_canonicas_highline: isHighlineEstablishment(establishmentId)
      ? 'No HighLine só ofereça Deck (Frente/Esquerdo/Direito) e Bar Central. Rooftop apenas se o cliente pedir camarote/VIP. NÃO cite "Área Coberta", "Área Descoberta", "Área VIP", "Balcão" ou "Terraço".'
      : null,
    override: override || null,
    party_size_allowed: partyValidation.ok,
    party_size_message: partyValidation.ok ? null : partyValidation.message,
    capacidade: capacityData
      ? {
          total: capacityData.totalCapacity,
          ocupacao_atual: capacityData.currentPeople,
          vagas_disponiveis: capacityData.availableCapacity,
          pode_reservar: canReserveByCapacity,
          lista_espera_no_horario: !!capacityData.hasWaitlist,
          turno_rooftop: capacityData.rooftopShift || null,
        }
      : null,
    painel_resumo: operatingSummary ? operatingSummary.slice(0, 2500) : null,
    fonte: 'admin_restaurant_reservations + capacity.check',
  };
}

async function resolveDefaultReservationSlot(pool, establishmentId, reservationDate, partySize) {
  if (isHighlineEstablishment(establishmentId)) {
    const preferredKeys = ['deck-frente', 'deck-esquerdo', 'deck-direito', 'bar'];
    for (const key of preferredKeys) {
      if (!STANDARD_SUBAREA_KEYS.has(key)) continue;
      const subarea = HIGHLINE_SUBAREAS.find((item) => item.key === key);
      if (!subarea) continue;
      const slot = await findAvailableTableInSubarea(
        pool,
        subarea,
        reservationDate,
        partySize,
        establishmentId
      );
      if (slot) return slot;
    }
    return null;
  }

  const areas = await loadActiveAreas(pool, establishmentId);
  if (!areas.length) return null;
  const first = areas[0];
  return {
    area_id: Number(first.id),
    label: String(first.name || '').trim() || null,
    table_number: null,
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

/**
 * Detecta se já existe reserva ativa do mesmo telefone (waId) no mesmo
 * estabelecimento. Evita o caso "Carlos LL — 10 reservas idênticas para o
 * mesmo cliente". Diferencia dois cenários:
 *   - duplicateExact: mesma data + mesmo horário → bloqueia recriação.
 *   - duplicateRecent: outras reservas confirmadas nas últimas 24h →
 *     permite registrar, mas marca observação para o admin investigar.
 */
async function detectReservationDuplicates(pool, { establishmentId, waId, reservationDate, reservationTime }) {
  const phone = String(waId || '').replace(/\D/g, '');
  if (!phone) {
    return { duplicateExact: null, duplicateRecent: [] };
  }

  const exactResult = await pool.query(
    `SELECT id, reservation_date, reservation_time, status, created_at, number_of_people
       FROM restaurant_reservations
      WHERE establishment_id = $1
        AND regexp_replace(COALESCE(client_phone, ''), '\\D', '', 'g') = $2
        AND reservation_date = $3
        AND LEFT(COALESCE(reservation_time::text, ''), 5) = LEFT($4, 5)
        AND UPPER(COALESCE(status, '')) NOT IN ('CANCELLED','CANCELED','CANCELADA','NO_SHOW','NO-SHOW')
      ORDER BY created_at DESC
      LIMIT 1`,
    [Number(establishmentId), phone, reservationDate, String(reservationTime || '').slice(0, 5)]
  );

  const recentResult = await pool.query(
    `SELECT id, reservation_date, reservation_time, status, created_at
       FROM restaurant_reservations
      WHERE establishment_id = $1
        AND regexp_replace(COALESCE(client_phone, ''), '\\D', '', 'g') = $2
        AND created_at >= NOW() - INTERVAL '24 hours'
        AND UPPER(COALESCE(status, '')) NOT IN ('CANCELLED','CANCELED','CANCELADA','NO_SHOW','NO-SHOW')
      ORDER BY created_at DESC
      LIMIT 5`,
    [Number(establishmentId), phone]
  );

  return {
    duplicateExact: exactResult.rows[0] || null,
    duplicateRecent: recentResult.rows || [],
  };
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

  let duplicateInfo = { duplicateExact: null, duplicateRecent: [] };
  try {
    duplicateInfo = await detectReservationDuplicates(pool, {
      establishmentId,
      waId,
      reservationDate,
      reservationTime,
    });
  } catch (dupError) {
    console.warn('[agentTools] falha ao checar duplicidade de reserva:', dupError.message);
  }

  if (duplicateInfo.duplicateExact) {
    const existing = duplicateInfo.duplicateExact;
    console.warn(
      `[agentTools] reserva duplicada bloqueada waId=${waId} establishment_id=${establishmentId} existing_id=${existing.id}`
    );
    return {
      ok: false,
      duplicate: true,
      duplicate_reservation_id: existing.id,
      error:
        'Esse cliente já tem reserva confirmada nessa mesma data/horário (id ' +
        existing.id +
        '). NÃO crie outra. Avise o cliente de forma natural que ele já tá com reserva e pergunte se quer mudar alguma coisa — se ele quiser alterar (data/horário/pessoas), use a equipe humana.',
    };
  }

  const referenceDateIso = getReferenceDateIso();
  if (isDateInPastComparedToReference(reservationDate, referenceDateIso)) {
    return {
      ok: false,
      error: `A data ${reservationDate} está no passado (hoje é ${referenceDateIso}).`,
    };
  }

  if (isDateTooFarInFuture(reservationDate, referenceDateIso, 11)) {
    console.warn(
      `[agentTools] criar_pre_reserva REJEITADO por data alucinada >11 meses: ${reservationDate} (hoje ${referenceDateIso}) waId=${waId}`
    );
    return {
      ok: false,
      error: `A data ${reservationDate} está muito longe (mais de 11 meses à frente de hoje ${referenceDateIso}). Quase certamente é alucinação de ano do modelo. Reconfirma a data com o cliente usando o calendário do sistema antes de criar a reserva.`,
    };
  }

  let areaId = null;
  let tableNumber = null;
  let areaLabel = String(args.area || '').trim();
  let combinedTablesInfo = null;

  if (isHighlineEstablishment(establishmentId)) {
    const subarea = resolveHighlineSubarea(args.area) || resolveHighlineSubarea(areaLabel);
    if (subarea) {
      const slot = await findAvailableTableInSubarea(
        pool,
        subarea,
        reservationDate,
        partySize,
        establishmentId
      );
      if (slot) {
        areaId = slot.area_id;
        tableNumber = slot.table_number;
        areaLabel = slot.label;
      } else {
        // Nenhuma mesa única comporta o grupo — tenta combinar múltiplas mesas
        // da mesma subárea (mesma feature "Reservar múltiplas mesas" do modal
        // /admin/restaurant-reservations). É UMA reserva só com várias mesas.
        const combo = await findCombinedTablesInSubareaForGroup(
          pool,
          subarea,
          reservationDate,
          partySize,
          establishmentId
        ).catch((err) => {
          console.warn('[agentTools] falha ao combinar mesas:', err.message);
          return null;
        });

        if (combo) {
          areaId = combo.area_id;
          tableNumber = combo.table_number; // ex.: "5,6,7"
          areaLabel = combo.label;
          combinedTablesInfo = {
            mesas_count: combo.mesas_count,
            table_numbers: combo.table_numbers,
            total_capacity: combo.total_capacity,
          };
        } else {
          const snapshot = await consultHighlineReservationAreas(pool, {
            estabelecimento_id: establishmentId,
            data: reservationDate,
            quantidade_pessoas: partySize,
            area_preferida: subarea.label,
          });
          if (snapshot.todas_areas_cheias) {
            return {
              ok: false,
              error:
                'Todas as áreas estão sem mesa livre para esse grupo. Use criar_lista_espera e informe a Equipe de Hostess.',
              todas_areas_cheias: true,
            };
          }
          const alt = snapshot.area_recomendada?.label;
          return {
            ok: false,
            error: alt
              ? `A ${subarea.label} está cheia (incluindo combinação de mesas). Há vaga em ${alt} — confirme com o cliente ou use criar_lista_espera se recusar.`
              : `A ${subarea.label} está cheia para essa data (mesmo combinando mesas). Consulte consultar_areas_mesa_reserva ou lista de espera.`,
          };
        }
      }
    }
  }

  if (!areaId) {
    areaId = await resolveAreaId(pool, establishmentId, args.area);
  }
  if (!areaId) {
    const defaultSlot = await resolveDefaultReservationSlot(
      pool,
      establishmentId,
      reservationDate,
      partySize
    );
    if (defaultSlot?.area_id) {
      areaId = defaultSlot.area_id;
      tableNumber = defaultSlot.table_number || tableNumber;
      areaLabel = defaultSlot.label || areaLabel;
    }
  }
  if (!areaId) {
    return {
      ok: false,
      error:
        'Área inválida ou sem mesa disponível. Confirme a área com o cliente ou use consultar_areas_mesa_reserva / lista de espera.',
    };
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

  const notes = buildNotesFromReservationArgs(args, {
    area_confirmada: areaLabel,
    mesa: tableNumber,
  });

  let finalNotes = notes;

  if (combinedTablesInfo) {
    const mesaText = combinedTablesInfo.mesas_count === 1 ? 'mesa' : 'mesas';
    const obsCombo = `${combinedTablesInfo.mesas_count} ${mesaText} combinadas (${combinedTablesInfo.table_numbers.join(', ')}) — capacidade total ${combinedTablesInfo.total_capacity} pessoas. Reserva única usando feature "múltiplas mesas" do painel.`;
    finalNotes = finalNotes ? `${obsCombo} | ${finalNotes}` : obsCombo;
  }

  const recentByPhone = (duplicateInfo.duplicateRecent || []).filter(
    (row) => Number(row.id) !== Number(duplicateInfo.duplicateExact?.id || 0)
  );
  if (recentByPhone.length >= 2) {
    const alerta = `ALERTA ADMIN: este telefone já criou ${recentByPhone.length + 1} reservas no estabelecimento nas últimas 24h (possível duplicação/loop da IA). Verificar antes de confirmar.`;
    finalNotes = finalNotes ? `${finalNotes} | ${alerta}` : alerta;
    console.warn(
      `[agentTools] ALERTA reservas em sequência waId=${waId} establishment_id=${establishmentId} recent_count=${recentByPhone.length + 1}`
    );
  }

  const body = buildReservationBodyFromParams(
    { ...params, table_number: tableNumber },
    waId,
    { notes: finalNotes }
  );
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
      area_label: areaLabel || null,
      table_number: tableNumber,
      mesas_combinadas: combinedTablesInfo || null,
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

async function criarListaEspera(pool, args = {}, runtimeContext = {}) {
  const establishmentId = Number(normalizeCanonicalEstablishmentId(args.estabelecimento_id));
  const preferredDate = String(args.data || '').slice(0, 10);
  const partySize = Number(args.quantidade_pessoas);
  const cliente = args.cliente_dados || {};
  const preferredTime = String(args.horario || '').trim() || null;
  const waId = runtimeContext.waId;

  if (!Number.isFinite(establishmentId) || establishmentId <= 0 || !preferredDate) {
    return { ok: false, error: 'estabelecimento_id e data são obrigatórios.' };
  }
  if (!cliente.nome) {
    return { ok: false, error: 'cliente_dados.nome é obrigatório.' };
  }
  if (!isHighlineEstablishment(establishmentId)) {
    return {
      ok: false,
      error: 'criar_lista_espera via WhatsApp está configurado para o Highline.',
    };
  }

  const subarea = args.area_preferida ? resolveHighlineSubarea(args.area_preferida) : null;

  let positionQuery =
    "SELECT COUNT(*)::int AS count FROM waitlist WHERE status = 'AGUARDANDO' AND establishment_id = $1 AND preferred_date = $2";
  const positionParams = [establishmentId, preferredDate];
  if (preferredTime) {
    positionQuery += ' AND preferred_time = $3';
    positionParams.push(preferredTime);
  } else {
    positionQuery += ' AND preferred_time IS NULL';
  }
  const positionResult = await pool.query(positionQuery, positionParams);
  const position = (Number(positionResult.rows[0]?.count) || 0) + 1;
  const estimatedWaitTime = (position - 1) * 15;

  const notes = buildNotesFromWaitlistArgs(args, {
    area_resolvida: subarea?.label || String(args.area_preferida || '').trim() || null,
  });

  const insertResult = await pool.query(
    `INSERT INTO waitlist (
       establishment_id, preferred_date, preferred_area_id, preferred_table_number,
       client_name, client_phone, client_email, number_of_people,
       preferred_time, status, position, estimated_wait_time, notes, has_bistro_table
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'AGUARDANDO',$10,$11,$12,FALSE)
     RETURNING id, position, preferred_date, preferred_time, status`,
    [
      establishmentId,
      preferredDate,
      subarea?.area_id || null,
      null,
      String(cliente.nome).trim(),
      cliente.telefone
        ? String(cliente.telefone).replace(/\D/g, '')
        : waId
          ? String(waId).replace(/\D/g, '')
          : null,
      cliente.email ? String(cliente.email).trim() : null,
      Number.isFinite(partySize) && partySize > 0 ? partySize : null,
      preferredTime,
      position,
      estimatedWaitTime,
      notes,
    ]
  );

  const row = insertResult.rows[0];
  return {
    ok: true,
    lista_espera: {
      id: row.id,
      position: row.position,
      preferred_date: row.preferred_date,
      preferred_time: row.preferred_time,
      status: row.status,
      area_preferida: subarea?.label || null,
    },
    mensagem_hostess:
      'Esse dia tá cheio, mas já te coloquei na lista de espera. Assim que liberar uma mesa, eu te aviso por aqui mesmo e a equipe te recebe na portaria.',
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
  if (toolName === 'consultar_areas_mesa_reserva') {
    return consultHighlineReservationAreas(pool, args);
  }
  if (toolName === 'criar_lista_espera') {
    return criarListaEspera(pool, args, runtimeContext);
  }

  return { ok: false, error: `Tool desconhecida: ${toolName}` };
}

module.exports = {
  getAgentToolDefinitions,
  executeAgentToolCall,
  consultarFaqEstabelecimento,
  verificarDisponibilidade,
  criarPreReserva,
  criarListaEspera,
  consultHighlineReservationAreas,
  resolveDefaultReservationSlot,
  normalizeTopic,
  buildFaqTopicCandidates,
  matchRichFaqSlug,
};
