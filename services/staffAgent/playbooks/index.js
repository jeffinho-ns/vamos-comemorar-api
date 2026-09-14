'use strict';

/**
 * Manual interno do Staff Agent (modo guia).
 *
 * Fonte da verdade das rotas/botões do admin. Atualize este arquivo quando a UX mudar.
 * Economia: só o playbook do pedido entra no prompt (~400–700 tokens), nunca o repo inteiro.
 */

/** @typedef {{ id: string, title: string, route: string, menu?: string, buttons?: string[], fields?: string[], steps: string[], tips?: string[], agentInstead?: string, match: RegExp[] }} Playbook */

/** @type {Playbook[]} */
const PLAYBOOKS = [
  {
    id: 'criar_item_cardapio',
    title: 'Criar item no cardápio',
    route: '/admin/cardapio',
    menu: 'Cardápio',
    buttons: ['Adicionar Item', 'Galeria', 'Salvar'],
    fields: [
      'Nome do Item',
      'Preço (ou marcar Sob Consulta)',
      'Descrição',
      'Estabelecimento',
      'Categoria',
      'Subcategoria (opcional)',
      'Nome do arquivo da imagem / Galeria',
      'Ordem',
    ],
    match: [
      /\b(criar|cadastrar|adicionar|novo|nova)\b.{0,40}\b(item|prato|drink|produto|comida)\b/,
      /\b(item|prato|drink|produto)\b.{0,30}\b(novo|nova)\b/,
      /\bcardapio\b.{0,40}\b(criar|adicionar|cadastrar|novo)\b/,
    ],
    steps: [
      'Confirme a casa: o seletor do chat e o estabelecimento na página Cardápio precisam ser o mesmo.',
      'Peça para abrir o menu Cardápio (rota /admin/cardapio) e selecionar a casa no topo.',
      'Na categoria certa, clicar no botão "Adicionar Item" (abre o modal com título Adicionar Item).',
      'Preencher "Nome do Item" e "Preço". Se não tiver preço fixo, marcar "Sob Consulta".',
      'Preencher "Descrição". Escolher Estabelecimento + Categoria (e Subcategoria se aparecer).',
      'Imagem (opcional): campo "Nome do arquivo da imagem do item" ou botão "Galeria". Ajustar "Ordem" se quiser.',
      'Clicar "Salvar" e conferir se o item apareceu na lista da categoria.',
    ],
    tips: [
      'Precisa da permissão "Criar Cardápio" (can_create_cardapio). Sem isso a tela bloqueia — oriente a pedir ao gerente.',
      'Se der erro de sessão/token, pedir login de novo e tentar Salvar outra vez.',
    ],
    agentInstead:
      'Para só esconder/mostrar um item já existente, use o chat: “pausar X” / “reativar X” (o Agent executa).',
  },
  {
    id: 'editar_item_cardapio',
    title: 'Editar item do cardápio',
    route: '/admin/cardapio',
    menu: 'Cardápio',
    buttons: ['Editar', 'Galeria', 'Salvar'],
    fields: [
      'Nome do Item',
      'Preço / Sob Consulta',
      'Descrição',
      'Categoria',
      'Imagem',
      'Ordem',
    ],
    match: [
      /\b(editar|alterar|mudar|atualizar)\b.{0,40}\b(item|prato|drink|produto|preco|preço|descricao|descrição)\b/,
      /\b(preco|preço|nome|foto)\b.{0,30}\b(item|prato|drink)\b/,
    ],
    steps: [
      'Abrir /admin/cardapio com a casa certa.',
      'Localizar o item (filtro ativo/pausado ou busca). Abrir → modal "Editar Item".',
      'Alterar só o que pediram (nome, preço, descrição, categoria, imagem, ordem).',
      'Clicar "Salvar" e conferir na lista.',
    ],
    tips: ['Permissão "Editar Cardápio" (can_edit_cardapio).'],
    agentInstead: 'Pausar/reativar sem editar campos → pelo chat do Agent.',
  },
  {
    id: 'criar_reserva',
    title: 'Criar reserva',
    route: '/admin/restaurant-reservations',
    menu: 'Sistema de Reservas',
    buttons: ['Nova Reserva', 'Salvar'],
    fields: [
      'Nome do cliente *',
      'Telefone',
      'Data *',
      'Horário *',
      'Área *',
      'Número de pessoas *',
      'Mesa (quando aparecer)',
      'Subárea (Highline/Justino: Deck, Rooftop, Lounge…)',
      'Observações / origem',
    ],
    match: [
      /\b(criar|abrir|fazer|lancar|lançar|montar|nova|novo)\b.{0,40}\breserv/,
      /\breserv\w*\b.{0,20}\b(nova|novo|criar)\b/,
    ],
    steps: [
      'Confirme a casa no seletor do chat e no topo de Sistema de Reservas (/admin/restaurant-reservations).',
      'Clicar no dia no calendário OU no botão "Nova Reserva".',
      'No modal: preencher Nome*, Telefone, Data*, Horário*, Área*, Nº de pessoas*.',
      'Highline / Seu Justino: escolher subárea se a tela pedir (Deck, Rooftop, Lounge, Quintal…).',
      'Observações se precisar → Salvar.',
      'Se a capacidade estiver cheia ou já houver espera no horário, o sistema pode mandar para a Lista de Espera — avise e ofereça o guia de waitlist.',
    ],
    tips: [
      'Permissão "Criar/editar reservas" (can_create_edit_reservations). Só "Gerenciar reservas" não cria.',
      'Não use /admin/reservas (legado) — o fluxo certo é restaurant-reservations.',
    ],
    agentInstead:
      'O Agent busca reservas e faz briefing, mas ainda NÃO cria reserva pelo chat.',
  },
  {
    id: 'editar_reserva',
    title: 'Editar ou cancelar reserva',
    route: '/admin/restaurant-reservations',
    menu: 'Sistema de Reservas',
    buttons: ['Editar', 'Cancelar', 'Salvar', 'Check-in'],
    fields: ['Horário', 'Área', 'Mesa', 'Pessoas', 'Status', 'Observações'],
    match: [
      /\b(editar|alterar|mudar|remarcar|cancelar|excluir)\b.{0,40}\breserv/,
      /\breserv\w*\b.{0,30}\b(editar|cancelar|remarcar)\b/,
    ],
    steps: [
      'Abrir Sistema de Reservas com a casa e a data certas.',
      'Localizar a reserva (lista/calendário; peça nome ou telefone se precisar).',
      'Abrir a reserva → Editar: ajustar horário, área, mesa, pessoas ou status.',
      'Para cancelar: usar cancelar/excluir e confirmar (libera mesa).',
      'Salvar e conferir na lista do dia.',
    ],
    tips: ['Check-in na porta é outro fluxo (botão Check-in) — não misturar com editar dados.'],
    agentInstead: 'Listar/filtrar reservas o Agent já faz (“reservas do rooftop sem check-in”).',
  },
  {
    id: 'checkin_reserva',
    title: 'Check-in de reserva (porta)',
    route: '/admin/restaurant-reservations',
    menu: 'Sistema de Reservas',
    buttons: ['Check-in', 'Check-in Dono'],
    fields: [],
    match: [
      /\b(check[\s-]?in|checkin)\b.{0,40}\breserv/,
      /\b(fazer|marcar)\b.{0,20}\b(check[\s-]?in|checkin)\b/,
      /\bchegou\b.{0,30}\b(cliente|reserva|mesa)\b/,
    ],
    steps: [
      'Abrir Sistema de Reservas (/admin/restaurant-reservations) com a casa e a data de hoje (ou do evento).',
      'Localizar a reserva pelo nome ou telefone.',
      'Clicar no botão "Check-in" da reserva.',
      'Se for lista de convidados, usar "Check-in Dono" / check-in do convidado conforme a linha.',
      'Confirmar a mensagem de sucesso na tela.',
    ],
    tips: [
      'Eventos/listas (não mesa de restaurante) → /admin/checkins.',
      'Quem só gerencia reservas costuma conseguir check-in mesmo sem criar/editar.',
    ],
  },
  {
    id: 'criar_waitlist',
    title: 'Lista de espera (criar / editar / alocar)',
    route: '/admin/restaurant-reservations',
    menu: 'Sistema de Reservas → aba Lista de Espera',
    buttons: ['Lista de Espera', 'Adicionar à Lista', 'Chamar', 'Alocar', 'Salvar'],
    fields: [
      'Nome do Cliente *',
      'Telefone',
      'E-mail (opcional)',
      'Número de Pessoas * (máx. 10)',
      'Horário Preferido',
      'Área / subárea (quando a casa pedir)',
    ],
    match: [
      /\b(criar|adicionar|colocar|entrar)\b.{0,40}\b(espera|waitlist|fila)\b/,
      /\b(lista de espera|waitlist)\b.{0,30}\b(nova|criar|adicionar|alocar)\b/,
      /\balocar\b.{0,30}\b(espera|waitlist|mesa)\b/,
    ],
    steps: [
      'Em Sistema de Reservas, selecionar a casa e a data.',
      'Abrir a aba "Lista de Espera".',
      'Clicar "Adicionar à Lista" (abre o modal de waitlist).',
      'Preencher Nome*, Nº de pessoas* (até 10), Telefone, Horário preferido, Área se pedir → Salvar.',
      'Depois: editar a linha, "Chamar" o cliente, ou alocar mesa quando liberar.',
    ],
    tips: ['Justino pode exigir waitlist se já houver gente na fila no mesmo horário.'],
    agentInstead:
      'Ver quem está na espera e "chamar" alguém o Agent já faz pelo chat. Criar/alocar ainda é na tela.',
  },
  {
    id: 'bloquear_agenda_avancado',
    title: 'Bloquear agenda (faixa / recorrência)',
    route: '/admin/restaurant-reservations',
    menu: 'Sistema de Reservas',
    buttons: ['Bloquear Agenda', 'Confirmar', 'Liberar'],
    fields: [
      'Data início / fim',
      'Horários (opcional)',
      'Área ou casa inteira',
      'Motivo',
      'Recorrência semanal (se existir na UI)',
    ],
    match: [
      /\b(bloquear|fecha|fechar)\b.{0,40}\b(varios|vários|semana|recorr|periodo|período|faixa)\b/,
      /\bbloquear agenda\b/,
      /\brecorrencia|recorrência\b.{0,20}\b(bloque|agenda)\b/,
    ],
    steps: [
      'Abrir Sistema de Reservas com a casa certa.',
      'Clicar "Bloquear Agenda".',
      'Preencher datas, horários, área (ou casa inteira) e motivo. Recorrência só se a UI oferecer.',
      'Confirmar. O dia/faixa fica marcado no calendário; dá para liberar depois pelos detalhes do bloqueio.',
    ],
    tips: [
      'Bloquear UM dia (ou uma área/horário simples) → preferir o chat do Agent (“bloqueia o dia 20/09”).',
      'Bloquear NÃO cancela reservas já feitas — só impede novas.',
    ],
    agentInstead: 'Dia único / área / faixa simples → Agent com bloquear_dia_agenda.',
  },
  {
    id: 'enviar_whatsapp',
    title: 'Assumir e enviar WhatsApp',
    route: '/admin/whatsapp',
    menu: 'Atendimento',
    buttons: ['Assumir conversa', 'Assumir pra mim', 'Enviar'],
    fields: ['Caixa de texto do compose (mensagem)', 'Anexo de imagem (opcional)'],
    match: [
      /\b(enviar|mandar|responder)\b.{0,40}\b(whats?app|mensagem|cliente)\b/,
      /\b(assumir|takeover|pegar)\b.{0,30}\b(conversa|atendimento|whats?app)\b/,
      /\bwhats?app\b.{0,30}\b(enviar|mandar|assumir)\b/,
    ],
    steps: [
      'Abrir Atendimento (/admin/whatsapp). Filtrar pela casa se a lista misturar.',
      'Clicar na conversa do cliente.',
      'Se a IA ainda estiver no controle, clicar "Assumir conversa" (ou "Assumir pra mim").',
      'Escrever no compose. O Agent pode sugerir rascunho, mas NÃO envia sozinho.',
      'Clicar Enviar (Enter também envia quando o compose está liberado).',
      'Campanhas em massa ficam na aba "Campanhas" — outro fluxo.',
    ],
    tips: ['Precisa de can_manage_whatsapp. Sem assumir, o envio humano fica bloqueado.'],
    agentInstead: 'Resumir conversa e sugerir resposta → Agent. Enviar → sempre humano nesta tela.',
  },
  {
    id: 'checkin_evento',
    title: 'Check-in de evento / lista',
    route: '/admin/checkins',
    menu: 'Check-ins',
    buttons: ['Check-in', 'Fluxo Rooftop (atalho Highline/Pinheiros quando existir)'],
    fields: ['Seletor de estabelecimento', 'Lista de eventos do dia'],
    match: [
      /\b(check[\s-]?in|checkin)\b.{0,40}\b(evento|lista|convidad|tablet)\b/,
      /\b(lista de convidados|guest list)\b/,
      /\bfluxo\s+rooftop\b/,
    ],
    steps: [
      'Abrir Check-ins (/admin/checkins) e selecionar o estabelecimento.',
      'Escolher o evento do dia na lista.',
      'Entrar na lista / tablet e marcar os check-ins um a um.',
      'Se for fluxo Rooftop/Pinheiros e o atalho aparecer, usar /admin/checkins/rooftop-fluxo.',
    ],
    tips: [
      'Permissão "Gerenciar check-ins". Sítio Ilha fica fora deste módulo.',
      'Reserva de mesa na porta → guia checkin_reserva, não este.',
    ],
  },
  {
    id: 'editar_os_artista',
    title: 'Editar OS (contrato, cachê, bancários)',
    route: '/admin/detalhes-operacionais',
    menu: 'Detalhes Operacionais',
    buttons: ['Editar', 'Salvar', 'Nova OS de Artista/Banda/DJ (só se for criar)'],
    fields: [
      'Contrato / dados sensíveis',
      'CPF/CNPJ',
      'Dados bancários',
      'Cachê',
      'Preços / promoções (detalhes por data, opcional)',
    ],
    match: [
      /\b(editar|completar|preencher)\b.{0,40}\b(os|o\.?\s?s\.?|ordem de servico|ordem de serviço)\b/,
      /\b(cach[eê]|dados bancarios|dados bancários|cpf|cnpj|contrato)\b/,
    ],
    steps: [
      'Abrir /admin/detalhes-operacionais e selecionar a casa.',
      'Na seção OS de Artista/Banda/DJ, abrir a OS do projeto/data.',
      'Clicar Editar e preencher contrato, CPF/CNPJ, bancários e cachê (o Agent nunca pede isso no chat).',
      'Salvar. Opcional: complementar "Detalhes por data" (preços, promoções) na lista abaixo.',
      'Status Ativo: só o que está ativo aparece no formulário público de reservas.',
    ],
    tips: ['Criar OS → preferir o chat do Agent. Esta tela é para completar o sensível.'],
    agentInstead:
      'Criar/listar OS pelo chat. Ex.: “crie OS 31/08 projeto X das 17h às 05h”.',
  },
  {
    id: 'criar_usuario',
    title: 'Criar usuário e permissões',
    route: '/admin/users',
    menu: 'Usuários (People & Ops)',
    buttons: ['Novo usuário', 'Criar usuário', 'Salvar alterações'],
    fields: [
      'Nome',
      'E-mail',
      'Senha',
      'Cargo',
      'Estabelecimentos marcados',
      'Flags UEP por casa (Gerenciar reservas, Criar/editar reservas, Check-ins, Cardápio, WhatsApp, OS…)',
    ],
    match: [
      /\b(criar|cadastrar|adicionar|novo)\b.{0,40}\b(usuario|usuário|colaborador|funcionario|funcionário)\b/,
      /\b(permissao|permissão|uep|cargo)\b.{0,40}\b(usuario|usuário|liberar)\b/,
    ],
    steps: [
      'Abrir Usuários (/admin/users) → botão "Novo usuário".',
      'Preencher Nome, e-mail, senha e cargo.',
      'Marcar os estabelecimentos que a pessoa vai atender.',
      'Ligar as flags UEP necessárias (ex.: Criar Cardápio, Criar/editar reservas, Assumir WhatsApp, Criar OS).',
      'Clicar "Criar usuário". Para alguém que já existe: abrir → ajustar → "Salvar alterações".',
    ],
    tips: [
      'Gerente geral gerencia acessos por casa, mas não define admin/gerente local (isso é super admin).',
      'Sem a flag certa, a pessoa vê a tela mas não consegue salvar — revise UEP se “não consigo criar item”.',
    ],
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

function detectPlaybookIntent(text) {
  const t = normalize(text);
  if (!t) return null;

  if (
    /\b(paus\w*|reativ\w*|ativ\w*)\b/.test(t) &&
    /\b(item|prato|drink|cardapio|produto)\b/.test(t)
  ) {
    return null;
  }

  // "crie uma OS" → tool, não guia de editar OS
  if (
    /\b(criar|abrir|montar|gerar|cadastrar|lancar|lançar|registrar|emitir|fazer)\b/.test(t) &&
    (/\bOS\b/.test(String(text || '')) ||
      /\bo\.\s?s\b/.test(t) ||
      /\bord(em|ens) de servico\b/.test(t))
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

function formatPlaybookIndex() {
  return PLAYBOOKS.map((p) => `- ${p.id}: ${p.title} → ${p.route}`).join('\n');
}

/**
 * Bloco compacto mas completo o bastante para guiar com nomes reais da UI.
 * @param {Playbook} pb
 * @param {{ stepIndex?: number, houseName?: string }} [state]
 */
function formatPlaybookForPrompt(pb, state = {}) {
  const stepIndex = Number.isFinite(state.stepIndex) ? state.stepIndex : 0;
  const lines = [
    `GUIA ATIVO: ${pb.title} (id=${pb.id})`,
    `Menu: ${pb.menu || '—'} | Rota: ${pb.route}`,
    state.houseName ? `Casa em foco: ${state.houseName}` : null,
    pb.buttons?.length ? `Botões exatos da UI: ${pb.buttons.join(' · ')}` : null,
    pb.fields?.length ? `Campos do formulário: ${pb.fields.join(' · ')}` : null,
    `Passo atual sugerido (0-based): ${stepIndex} de ${pb.steps.length - 1}`,
    'Passos:',
    ...pb.steps.map((s, i) => `${i + 1}. ${s}`),
  ].filter(Boolean);

  if (pb.tips?.length) lines.push('Atenção: ' + pb.tips.join(' | '));
  if (pb.agentInstead) lines.push(`O Agent já faz (não use este guia): ${pb.agentInstead}`);

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
