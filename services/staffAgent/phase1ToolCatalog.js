/**
 * Catálogo oficial — Staff Agent Fase 1 (Groq + tools).
 *
 * Escopo: leitura + atalhos leves. Nenhuma tool aqui cria reserva, bloqueia
 * dia, altera horário, usuário/cargo ou config da IA do cliente.
 *
 * Contrato de execução (obrigatório em produção):
 * 1. Auth = usuário logado (JWT/sessão). Nunca service-account “solto”.
 * 2. establishment_id SEMPRE da sessão / escopo UEP — nunca inventado pelo LLM.
 * 3. Write tools: dry-run (preview) → confirmação humana → apply.
 * 4. Feature flag por casa (ex.: STAFF_AGENT_PHASE1_ESTABLISHMENT_IDS).
 * 5. Auditoria: user_id, tool, args, preview/apply, resultado.
 *
 * Provider sugerido: Groq (openai/gpt-oss-120b; fallback qwen/qwen3.6-27b).
 * WhatsApp do cliente permanece em OpenAI gpt-5.5.
 *
 * Este arquivo é a fonte da verdade da Fase 1. Implementação futura:
 * services/staffAgent/* consome getPhase1ToolDefinitions() / executePhase1Tool().
 */

'use strict';

/** @typedef {'low'|'medium'|'high'|'critical'} RiskLevel */

/**
 * @typedef {Object} StaffToolArg
 * @property {string} name
 * @property {'string'|'number'|'boolean'|'integer'} type
 * @property {string} description
 * @property {boolean} [required]
 * @property {string[]} [enum]
 */

/**
 * @typedef {Object} StaffToolDef
 * @property {string} name
 * @property {string} description
 * @property {StaffToolArg[]} args
 * @property {boolean} requiresConfirmation
 * @property {boolean} isWrite
 * @property {RiskLevel} risk
 * @property {string[]} minRbac
 * @property {string[]} [minUepAny]
 * @property {string[]} minRoles
 * @property {string} apiHint
 * @property {string[]} exampleUtterances
 */

const PHASE = 1;
const PHASE_LABEL = 'leitura_e_atalhos_leves';

/** Feature flag env: CSV de establishment_ids. Vazio = desligado. */
const FEATURE_FLAG_ENV = 'STAFF_AGENT_PHASE1_ESTABLISHMENT_IDS';

/** @type {StaffToolDef[]} */
const PHASE1_TOOLS = [
  {
    name: 'briefing_turno',
    description:
      'Resumo operacional do dia para a casa da sessão: reservas confirmadas, waitlist, bloqueios, handoffs WhatsApp se houver permissão.',
    args: [
      {
        name: 'date',
        type: 'string',
        description: 'Data ISO YYYY-MM-DD. Default: hoje (timezone da casa).',
        required: false,
      },
    ],
    requiresConfirmation: false,
    isWrite: false,
    risk: 'low',
    minRbac: ['reservas:read'],
    minUepAny: ['can_manage_reservations', 'can_create_edit_reservations'],
    minRoles: ['recepcao', 'hostess', 'gerente', 'admin', 'account_admin'],
    apiHint: 'GET /api/restaurant-reservations/stats/dashboard + waitlist + blocks',
    exampleUtterances: [
      'Como está o dia de hoje?',
      'Briefing do Highline para amanhã',
      'Resumo do turno',
    ],
  },
  {
    name: 'buscar_reservas',
    description:
      'Lista ou filtra reservas da casa. Aceita nome, telefone, status, área e janela de horário em prosa já resolvida em args estruturados.',
    args: [
      { name: 'date', type: 'string', description: 'YYYY-MM-DD', required: true },
      { name: 'client_name', type: 'string', description: 'Nome parcial do cliente', required: false },
      { name: 'client_phone', type: 'string', description: 'Telefone normalizado', required: false },
      {
        name: 'status',
        type: 'string',
        description: 'Status canônico da reserva',
        required: false,
        enum: ['NOVA', 'CONFIRMADA', 'CHECKED_IN', 'SEATED', 'CANCELADA', 'NO_SHOW', 'COMPLETED'],
      },
      { name: 'area_name', type: 'string', description: 'Nome da área (Highline: canônico)', required: false },
      { name: 'without_checkin', type: 'boolean', description: 'Só confirmadas sem check-in', required: false },
      { name: 'limit', type: 'integer', description: 'Máx. resultados (default 20, teto 50)', required: false },
    ],
    requiresConfirmation: false,
    isWrite: false,
    risk: 'medium',
    minRbac: ['reservas:read'],
    minUepAny: ['can_manage_reservations', 'can_create_edit_reservations'],
    minRoles: ['recepcao', 'hostess', 'gerente', 'admin', 'account_admin'],
    apiHint: 'GET /api/restaurant-reservations',
    exampleUtterances: [
      'Reservas confirmadas do rooftop sem check-in',
      'Tem reserva no nome João Silva hoje?',
      'Listar reservas das 22h',
    ],
  },
  {
    name: 'checar_capacidade',
    description:
      'Consulta capacidade restante da casa/área na data (mesma lógica do painel). Não altera nada.',
    args: [
      { name: 'date', type: 'string', description: 'YYYY-MM-DD', required: true },
      { name: 'area_id', type: 'integer', description: 'ID da área (opcional)', required: false },
      { name: 'party_size', type: 'integer', description: 'Tamanho do grupo a simular', required: false },
    ],
    requiresConfirmation: false,
    isWrite: false,
    risk: 'low',
    minRbac: ['reservas:read'],
    minUepAny: ['can_manage_reservations', 'can_create_edit_reservations'],
    minRoles: ['recepcao', 'hostess', 'gerente', 'admin', 'account_admin'],
    apiHint: 'GET /api/restaurant-reservations/capacity/check',
    exampleUtterances: [
      'Cabe uma mesa de 8 no Deck amanhã?',
      'Quanto falta de capacidade hoje?',
    ],
  },
  {
    name: 'listar_espera',
    description: 'Lista a waitlist do dia para a casa da sessão.',
    args: [
      { name: 'date', type: 'string', description: 'YYYY-MM-DD', required: true },
      {
        name: 'status',
        type: 'string',
        description: 'Filtro de status',
        required: false,
        enum: ['AGUARDANDO', 'CHAMADO', 'ATENDIDO', 'CANCELADO'],
      },
    ],
    requiresConfirmation: false,
    isWrite: false,
    risk: 'medium',
    minRbac: ['reservas:read'],
    minUepAny: ['can_manage_reservations', 'can_create_edit_reservations'],
    minRoles: ['recepcao', 'hostess', 'gerente', 'admin', 'account_admin'],
    apiHint: 'GET /api/waitlist',
    exampleUtterances: [
      'Quem está na lista de espera?',
      'Waitlist do rooftop hoje',
    ],
  },
  {
    name: 'chamar_espera',
    description:
      'Marca um registro da waitlist como chamado. Ação leve de porta; ainda assim exige confirmação na UI.',
    args: [
      { name: 'waitlist_id', type: 'integer', description: 'ID do registro na waitlist', required: true },
      { name: 'note', type: 'string', description: 'Nota opcional para a equipe', required: false },
    ],
    requiresConfirmation: true,
    isWrite: true,
    risk: 'medium',
    minRbac: ['reservas:update'],
    minUepAny: ['can_manage_reservations', 'can_create_edit_reservations'],
    minRoles: ['recepcao', 'gerente', 'admin', 'account_admin'],
    apiHint: 'PUT /api/waitlist/:id/call',
    exampleUtterances: [
      'Chamar o próximo da espera',
      'Chamar a Maria da waitlist',
    ],
  },
  {
    name: 'listar_itens_cardapio',
    description:
      'Busca itens/categorias do cardápio da casa (barId da sessão) por nome. Usado antes de pausar.',
    args: [
      { name: 'query', type: 'string', description: 'Nome parcial do item ou categoria', required: true },
      { name: 'include_paused', type: 'boolean', description: 'Incluir invisíveis/pausados', required: false },
    ],
    requiresConfirmation: false,
    isWrite: false,
    risk: 'low',
    minRbac: ['cardapio:read'],
    minUepAny: ['can_view_cardapio', 'can_edit_cardapio', 'can_create_cardapio'],
    minRoles: ['recepcao', 'gerente', 'admin', 'account_admin', 'promoter'],
    apiHint: 'GET /api/cardapio (items filtrados no serviço)',
    exampleUtterances: [
      'Tem item caipirinha no cardápio?',
      'Quais drinks estão pausados?',
    ],
  },
  {
    name: 'pausar_item_cardapio',
    description:
      'Pausa (oculta) UM item do cardápio. Fase 1: apenas um item por vez. Sem imagem. Preview obrigatório.',
    args: [
      { name: 'item_id', type: 'integer', description: 'ID do item', required: true },
      {
        name: 'mode',
        type: 'string',
        description: 'permanent = visible false agora; scheduled = pausa com janela',
        required: false,
        enum: ['permanent', 'scheduled'],
      },
      { name: 'starts_at', type: 'string', description: 'ISO datetime se scheduled', required: false },
      { name: 'ends_at', type: 'string', description: 'ISO datetime se scheduled', required: false },
    ],
    requiresConfirmation: true,
    isWrite: true,
    risk: 'medium',
    minRbac: ['cardapio:update'],
    minUepAny: ['can_edit_cardapio'],
    minRoles: ['recepcao', 'gerente', 'admin', 'account_admin'],
    apiHint: 'PATCH visibility ou POST /api/cardapio/pause-schedules/apply (1 item)',
    exampleUtterances: [
      'Pausar a caipirinha',
      'Tirar o burger do cardápio até as 23h',
    ],
  },
  {
    name: 'reativar_item_cardapio',
    description: 'Reativa (torna visível) UM item previamente pausado. Preview obrigatório.',
    args: [
      { name: 'item_id', type: 'integer', description: 'ID do item', required: true },
    ],
    requiresConfirmation: true,
    isWrite: true,
    risk: 'medium',
    minRbac: ['cardapio:update'],
    minUepAny: ['can_edit_cardapio'],
    minRoles: ['recepcao', 'gerente', 'admin', 'account_admin'],
    apiHint: 'POST /api/cardapio/pause-schedules/clear-for-items ou visibility true',
    exampleUtterances: [
      'Reativar a caipirinha',
      'Voltar o burger no cardápio',
    ],
  },
  {
    name: 'resumir_conversa_whatsapp',
    description:
      'Gera resumo curto da conversa WhatsApp (para takeover). Não envia mensagem ao cliente.',
    args: [
      { name: 'wa_id', type: 'string', description: 'ID da conversa WhatsApp', required: true },
      { name: 'max_messages', type: 'integer', description: 'Janela de msgs (default 20, teto 40)', required: false },
    ],
    requiresConfirmation: false,
    isWrite: false,
    risk: 'medium',
    minRbac: [],
    minUepAny: ['can_manage_whatsapp'],
    minRoles: ['recepcao', 'gerente', 'admin', 'account_admin'],
    apiHint: 'GET transcript via /api/admin/whatsapp + LLM summary (Groq)',
    exampleUtterances: [
      'Resumir essa conversa',
      'O que o cliente pediu antes do handoff?',
    ],
  },
  {
    name: 'sugerir_resposta_whatsapp',
    description:
      'Rascunha resposta no compose. NÃO envia. Staff edita e envia manualmente (padrão já usado no inbox).',
    args: [
      { name: 'wa_id', type: 'string', description: 'ID da conversa', required: true },
      { name: 'intent_hint', type: 'string', description: 'Tom/objetivo opcional (ex.: remarcar)', required: false },
    ],
    requiresConfirmation: false,
    isWrite: false,
    risk: 'medium',
    minRbac: [],
    minUepAny: ['can_manage_whatsapp'],
    minRoles: ['recepcao', 'gerente', 'admin', 'account_admin'],
    apiHint: 'LLM draft only — UI preenche textarea; send continua humano',
    exampleUtterances: [
      'Sugerir uma resposta',
      'Rascunhar que vamos remarcar para sábado',
    ],
  },
];

/** Tools explicitamente FORA da Fase 1 (documentação anti-scope-creep). */
const PHASE1_EXCLUDED = [
  'criar_reserva',
  'editar_reserva',
  'cancelar_reserva',
  'bloquear_agenda',
  'reativar_bloqueio',
  'ajustar_horarios',
  'criar_usuario',
  'alterar_cargo',
  'atualizar_uep',
  'pausar_categoria_inteira',
  'enviar_mensagem_whatsapp',
  'campanha_whatsapp',
  'configurar_ia_cliente',
  'alterar_politica_capacidade',
];

function getPhase1ToolDefinitions() {
  return PHASE1_TOOLS.map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: {
        type: 'object',
        properties: Object.fromEntries(
          tool.args.map((arg) => [
            arg.name,
            {
              type: arg.type === 'integer' ? 'integer' : arg.type,
              description: arg.description,
              ...(arg.enum ? { enum: arg.enum } : {}),
            },
          ])
        ),
        required: tool.args.filter((a) => a.required).map((a) => a.name),
      },
    },
  }));
}

function getPhase1ToolByName(name) {
  const key = String(name || '').trim();
  return PHASE1_TOOLS.find((t) => t.name === key) || null;
}

function listPhase1WriteTools() {
  return PHASE1_TOOLS.filter((t) => t.isWrite);
}

function getPhase1Meta() {
  return {
    phase: PHASE,
    label: PHASE_LABEL,
    featureFlagEnv: FEATURE_FLAG_ENV,
    toolCount: PHASE1_TOOLS.length,
    writeToolCount: listPhase1WriteTools().length,
    excluded: PHASE1_EXCLUDED,
    providerHint: 'groq',
    modelHint: 'openai/gpt-oss-120b',
  };
}

module.exports = {
  PHASE,
  PHASE_LABEL,
  FEATURE_FLAG_ENV,
  PHASE1_TOOLS,
  PHASE1_EXCLUDED,
  getPhase1ToolDefinitions,
  getPhase1ToolByName,
  listPhase1WriteTools,
  getPhase1Meta,
};
