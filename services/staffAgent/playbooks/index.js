'use strict';

/**
 * Manual interno compacto do Staff Agent (modo guia).
 *
 * Economia: NÃO injeta o projeto inteiro. Só o playbook correspondente ao
 * pedido entra no prompt (~200–400 tokens). Atualize este arquivo quando
 * mudar rota/UX no admin — é a "base de estudo" do build.
 */

/** @typedef {{ id: string, title: string, route: string, canTool?: string|null, steps: string[], tips?: string[], match: RegExp[] }} Playbook */

/** @type {Playbook[]} */
const PLAYBOOKS = [
  {
    id: 'criar_item_cardapio',
    title: 'Criar item no cardápio',
    route: '/admin/cardapio',
    canTool: null,
    match: [
      /\b(criar|cadastrar|adicionar|novo|nova)\b.{0,40}\b(item|prato|drink|produto|comida)\b/,
      /\b(item|prato|drink|produto)\b.{0,30}\b(novo|nova)\b/,
      /\bcardapio\b.{0,40}\b(criar|adicionar|cadastrar|novo)\b/,
    ],
    steps: [
      'Confirme com o colaborador qual estabelecimento (casa) ele quer usar — a do seletor do chat deve ser a mesma da tela.',
      'Peça para abrir o menu Cardápio (/admin/cardapio) e selecionar a casa certa no topo.',
      'Indique ir na categoria desejada e clicar em Adicionar Item (ou equivalente).',
      'Oriente a preencher Nome, Preço (ou Sob Consulta) e Descrição.',
      'Confirme Estabelecimento + Categoria (+ subcategoria se existir).',
      'Opcional: imagem pela Galeria, ordem de exibição, adicionais.',
      'Peça para Salvar e confirme se o item apareceu na lista.',
    ],
    tips: [
      'Pausar ou reativar item o Agent já faz pelo chat — não use este guia para isso.',
      'Sem permissão can_create_cardapio a tela bloqueia; oriente a pedir ao gerente.',
    ],
  },
  {
    id: 'editar_item_cardapio',
    title: 'Editar item do cardápio',
    route: '/admin/cardapio',
    canTool: null,
    match: [
      /\b(editar|alterar|mudar|atualizar)\b.{0,40}\b(item|prato|drink|produto|preco|preço|descricao|descrição)\b/,
      /\b(preco|preço|nome|foto)\b.{0,30}\b(item|prato|drink)\b/,
    ],
    steps: [
      'Confirme a casa e peça para abrir /admin/cardapio com o estabelecimento certo.',
      'Oriente a buscar o item (filtro ativo/pausado se precisar).',
      'Abrir o item → Editar.',
      'Alterar só o que pediram (nome, preço, descrição, categoria, imagem).',
      'Salvar e conferir na lista.',
    ],
    tips: [
      'Se for só esconder/mostrar o item, use pausar/reativar pelo chat.',
    ],
  },
  {
    id: 'criar_reserva',
    title: 'Criar reserva',
    route: '/admin/restaurant-reservations',
    canTool: null,
    match: [
      /\b(criar|abrir|fazer|lancar|lançar|montar|nova|novo)\b.{0,40}\breserv/,
      /\breserv\w*\b.{0,20}\b(nova|novo|criar)\b/,
    ],
    steps: [
      'Confirme a casa no seletor do chat e na página Sistema de Reservas (/admin/restaurant-reservations).',
      'Clicar no dia no calendário ou em Nova Reserva.',
      'Preencher Nome*, Telefone, Data*, Horário*, Área*, Nº de pessoas*.',
      'Highline/Justino: escolher subárea se a tela pedir (Deck, Rooftop, Lounge…).',
      'Observações / origem se precisar → Salvar.',
      'Se a capacidade estiver cheia, o sistema pode mandar para waitlist — avise o colaborador.',
    ],
    tips: [
      'O Agent ainda não cria reserva pelo chat; só busca e briefing.',
      'Precisa de can_create_edit_reservations.',
    ],
  },
  {
    id: 'editar_reserva',
    title: 'Editar ou cancelar reserva',
    route: '/admin/restaurant-reservations',
    canTool: null,
    match: [
      /\b(editar|alterar|mudar|remarcar|cancelar|excluir)\b.{0,40}\breserv/,
      /\breserv\w*\b.{0,30}\b(editar|cancelar|remarcar)\b/,
    ],
    steps: [
      'Abrir /admin/restaurant-reservations com a casa certa.',
      'Localizar a reserva no dia/lista (pode pedir nome ou telefone).',
      'Abrir → Editar: ajustar horário, área, mesa, pessoas ou status.',
      'Para cancelar: usar cancelar/excluir com confirmação (libera mesa).',
      'Salvar e conferir na lista.',
    ],
    tips: ['Check-in na porta tem guia próprio se for só marcar presença.'],
  },
  {
    id: 'checkin_reserva',
    title: 'Check-in de reserva',
    route: '/admin/restaurant-reservations',
    canTool: null,
    match: [
      /\b(check[\s-]?in|checkin)\b.{0,40}\breserv/,
      /\b(fazer|marcar)\b.{0,20}\b(check[\s-]?in|checkin)\b/,
      /\bchegou\b.{0,30}\b(cliente|reserva|mesa)\b/,
    ],
    steps: [
      'Abrir Sistema de Reservas com a casa e a data certas.',
      'Localizar a reserva (nome/telefone).',
      'Clicar em Check-in.',
      'Se houver lista de convidados, marcar dono/convidados conforme a casa.',
    ],
    tips: ['Eventos/listas (não reserva de mesa) → /admin/checkins.'],
  },
  {
    id: 'criar_waitlist',
    title: 'Lista de espera (criar / alocar)',
    route: '/admin/restaurant-reservations',
    canTool: null,
    match: [
      /\b(criar|adicionar|colocar|entrar)\b.{0,40}\b(espera|waitlist|fila)\b/,
      /\b(lista de espera|waitlist)\b.{0,30}\b(nova|criar|adicionar|alocar)\b/,
      /\balocar\b.{0,30}\b(espera|waitlist|mesa)\b/,
    ],
    steps: [
      'Casa + data em /admin/restaurant-reservations.',
      'Abrir Lista de espera → Adicionar (ou quando a capacidade estiver cheia).',
      'Nome*, pessoas (máx. 10), telefone, horário preferido, área se pedir.',
      'Salvar. Depois: editar, Chamar (o Agent também chama pelo chat) ou alocar mesa quando liberar.',
    ],
    tips: ['Só chamar quem já está na fila → o Agent faz com a tool chamar_espera.'],
  },
  {
    id: 'enviar_whatsapp',
    title: 'Assumir e enviar WhatsApp',
    route: '/admin/whatsapp',
    canTool: null,
    match: [
      /\b(enviar|mandar|responder)\b.{0,40}\b(whats?app|mensagem|cliente)\b/,
      /\b(assumir|takeover|pegar)\b.{0,30}\b(conversa|atendimento|whats?app)\b/,
      /\bwhats?app\b.{0,30}\b(enviar|mandar|assumir)\b/,
    ],
    steps: [
      'Abrir Atendimento WhatsApp (/admin/whatsapp).',
      'Selecionar a conversa (filtrar pela casa se precisar).',
      'Assumir conversa (takeover humano).',
      'Escrever no compose — o Agent pode só sugerir rascunho, não envia.',
      'Clicar Enviar. Campanhas ficam na aba Campanhas (fora deste guia).',
    ],
    tips: ['Resumir conversa / sugerir resposta o Agent já faz; enviar é sempre humano.'],
  },
  {
    id: 'checkin_evento',
    title: 'Check-in de evento / lista',
    route: '/admin/checkins',
    canTool: null,
    match: [
      /\b(check[\s-]?in|checkin)\b.{0,40}\b(evento|lista|convidad|tablet)\b/,
      /\b(lista de convidados|guest list)\b/,
      /\bfluxo\s+rooftop\b/,
    ],
    steps: [
      'Abrir Check-ins (/admin/checkins) e selecionar o estabelecimento.',
      'Escolher o evento do dia.',
      'Entrar na lista ou no tablet e marcar check-ins.',
      'Highline Rooftop: usar Fluxo Rooftop se aparecer o atalho.',
    ],
    tips: ['Reserva de mesa na porta → guia checkin_reserva, não este.'],
  },
  {
    id: 'editar_os_artista',
    title: 'Editar OS (dados sensíveis)',
    route: '/admin/detalhes-operacionais',
    canTool: null,
    match: [
      /\b(editar|completar|preencher)\b.{0,40}\b(os|o\.?\s?s\.?|ordem de servico|ordem de serviço)\b.{0,40}\b(cach[eê]|banco|cpf|cnpj|contrato)\b/,
      /\b(cach[eê]|dados bancarios|dados bancários|cpf|cnpj)\b.{0,40}\b(os|ordem)\b/,
    ],
    steps: [
      'Abrir /admin/detalhes-operacionais com a casa certa.',
      'Na lista de OS Artista, abrir a OS do dia/projeto.',
      'Editar: contrato, CPF/CNPJ, bancários, cachê (o Agent não coleta isso na criação).',
      'Salvar.',
    ],
    tips: [
      'Criar OS nova → o Agent faz pelo chat (criar_os_artista).',
    ],
  },
  {
    id: 'criar_usuario',
    title: 'Criar usuário / permissões',
    route: '/admin/users',
    canTool: null,
    match: [
      /\b(criar|cadastrar|adicionar|novo)\b.{0,40}\b(usuario|usuário|colaborador|funcionario|funcionário)\b/,
      /\b(permissao|permissão|uep|cargo)\b.{0,40}\b(usuario|usuário|liberar)\b/,
    ],
    steps: [
      'Abrir Usuários (/admin/users) → Novo usuário.',
      'Nome, e-mail, senha, cargo.',
      'Marcar estabelecimentos e flags UEP (reservas, cardápio, WhatsApp, OS…).',
      'Criar usuário. Cargos elevados só super admin.',
    ],
    tips: ['Só quem gerencia usuários da org consegue concluir.'],
  },
];

function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function getPlaybookById(id) {
  return PLAYBOOKS.find((p) => p.id === id) || null;
}

/**
 * Detecta playbook pelo texto. Retorna null se nenhum bater.
 * @param {string} text
 * @returns {Playbook|null}
 */
function detectPlaybookIntent(text) {
  const t = normalize(text);
  if (!t) return null;

  // Pausar/reativar cardápio → tools, não guia de criar/editar
  if (
    /\b(paus\w*|reativ\w*|ativ\w*)\b/.test(t) &&
    /\b(item|prato|drink|cardapio|produto)\b/.test(t)
  ) {
    return null;
  }

  for (const pb of PLAYBOOKS) {
    for (const re of pb.match) {
      if (re.test(t)) return pb;
    }
  }
  return null;
}

/** Índice curto (~tokens baixos) para o system prompt principal. */
function formatPlaybookIndex() {
  return PLAYBOOKS.map((p) => `- ${p.id}: ${p.title} → ${p.route}`).join('\n');
}

/**
 * Bloco compacto de UM playbook para injetar no modo guia.
 * @param {Playbook} pb
 * @param {{ stepIndex?: number, houseName?: string }} [state]
 */
function formatPlaybookForPrompt(pb, state = {}) {
  const stepIndex = Number.isFinite(state.stepIndex) ? state.stepIndex : 0;
  const lines = [
    `GUIA ATIVO: ${pb.title} (id=${pb.id})`,
    `Rota no admin: ${pb.route}`,
    state.houseName ? `Casa em foco: ${state.houseName}` : null,
    `Passo atual sugerido (0-based): ${stepIndex} de ${pb.steps.length - 1}`,
    'Passos:',
    ...pb.steps.map((s, i) => `${i + 1}. ${s}`),
  ].filter(Boolean);
  if (pb.tips?.length) {
    lines.push('Dicas: ' + pb.tips.join(' | '));
  }
  return lines.join('\n');
}

function listPlaybookIds() {
  return PLAYBOOKS.map((p) => p.id);
}

module.exports = {
  PLAYBOOKS,
  getPlaybookById,
  detectPlaybookIntent,
  formatPlaybookIndex,
  formatPlaybookForPrompt,
  listPlaybookIds,
};
