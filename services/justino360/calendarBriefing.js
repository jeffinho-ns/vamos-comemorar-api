'use strict';

/**
 * Justino360 — tradução de agenda de Marketing para linguagem de operação.
 *
 * O Marketing cadastra "campanha de chopp dobrado". A operação precisa saber
 * o que isso significa na prática para o bar, a cozinha e o salão. Este módulo
 * gera esse briefing de forma determinística (sem IA — isso é fase 6).
 */

const EVENT_TYPES = [
  'evento',
  'campanha',
  'promocao',
  'gravacao',
  'corporativo',
  'cardapio',
  'outro',
];

const EVENT_TYPE_LABELS = {
  evento: 'Evento',
  campanha: 'Campanha de marketing',
  promocao: 'Promoção',
  gravacao: 'Gravação / conteúdo',
  corporativo: 'Evento corporativo',
  cardapio: 'Mudança de cardápio',
  outro: 'Ação operacional',
};

/** Impacto padrão, usado quando o tipo do evento não tem nota específica. */
const DEFAULT_IMPACT = {
  gerencia: 'Acompanhar a operação de perto e destravar o que travar.',
  salao: 'Reforçar equipe, montagem e atenção ao tempo de atendimento.',
  bar: 'Revisar estoque, gelo e produção antecipada.',
  cozinha: 'Ajustar mise en place e produção ao volume esperado.',
  caixa: 'Conferir procedimentos de cobrança e fechamento.',
  limpeza: 'Reforçar rondas de banheiros e salão.',
  manutencao: 'Checar infraestrutura, som e climatização antes de abrir.',
  marketing: 'Acompanhar ativação, materiais e registro de conteúdo.',
};

/** Notas específicas por tipo — só o que muda em relação ao padrão. */
const IMPACT_BY_TYPE = {
  campanha: {
    gerencia: 'Alinhar a equipe sobre a campanha antes do turno abrir.',
    salao: 'Equipe precisa saber explicar a campanha ao cliente na mesa.',
    bar: 'Alta procura pelos itens da campanha — subir estoque e produção.',
    cozinha: 'Preparar os itens divulgados com folga de produção.',
    caixa: 'Conferir se a campanha está corretamente lançada no sistema.',
    limpeza: 'Movimento acima da média — aumentar frequência das rondas.',
    manutencao: 'Garantir equipamentos dos itens em campanha funcionando.',
    marketing: 'Monitorar resultado da campanha e recolher feedback da equipe.',
  },
  promocao: {
    gerencia: 'Validar regra da promoção e limites antes de liberar.',
    salao: 'Saber de cor a regra da promoção (o que vale e o que não vale).',
    bar: 'Estoque reforçado dos itens promocionais.',
    cozinha: 'Produção extra dos itens em promoção.',
    caixa: 'Promoção lançada no sistema — conferir desconto e comanda.',
    limpeza: 'Fluxo maior de público: reforçar rondas.',
    manutencao: 'Sem impacto direto — atenção a chamados durante o pico.',
    marketing: 'Conferir material no ponto de venda e nas redes.',
  },
  gravacao: {
    gerencia: 'Definir área da gravação e combinar com a equipe.',
    salao: 'Ambiente e mesas impecáveis — atenção ao enquadramento.',
    bar: 'Bancada organizada e produtos com etiqueta virada para frente.',
    cozinha: 'Pratos com apresentação de foto e tempo combinado com a produção.',
    caixa: 'Sem impacto direto — evitar circulação na área da gravação.',
    limpeza: 'Limpeza reforçada antes e durante a gravação.',
    manutencao: 'Iluminação, som e tomadas conferidos antes da equipe chegar.',
    marketing: 'Conduzir a gravação, roteiro e liberação de imagem.',
  },
  corporativo: {
    gerencia: 'Contrato fechado — conferir escopo, horários e responsável do cliente.',
    salao: 'Montagem conforme contrato e atendimento dedicado ao grupo.',
    bar: 'Pacote de bebidas do contrato separado e conferido.',
    cozinha: 'Menu fechado do evento — produção conforme número de pessoas.',
    caixa: 'Faturamento do evento é separado da operação do dia.',
    limpeza: 'Ambiente pronto antes da chegada e ronda durante o evento.',
    manutencao: 'Som, projeção e climatização testados antes do evento.',
    marketing: 'Registro do evento apenas se autorizado pelo cliente.',
  },
  cardapio: {
    gerencia: 'Treinar a equipe no cardápio novo antes de aplicar.',
    salao: 'Estudar itens novos, preços e o que saiu do cardápio.',
    bar: 'Novas fichas técnicas e insumos conferidos.',
    cozinha: 'Fichas técnicas atualizadas e degustação com a equipe.',
    caixa: 'Preços e itens atualizados no sistema.',
    limpeza: 'Sem impacto direto.',
    manutencao: 'Verificar equipamentos exigidos pelos itens novos.',
    marketing: 'Atualizar cardápio digital, fotos e redes.',
  },
};

function labelForType(eventType) {
  return EVENT_TYPE_LABELS[eventType] || EVENT_TYPE_LABELS.outro;
}

/**
 * Nota de impacto de um setor para um tipo de evento.
 * @param {string} eventType
 * @param {string} sectorKey chave do setor em j360_sectors
 */
function impactForSector(eventType, sectorKey) {
  const specific = IMPACT_BY_TYPE[eventType];
  if (specific && specific[sectorKey]) return specific[sectorKey];
  return DEFAULT_IMPACT[sectorKey] || 'Atenção operacional neste dia.';
}

/**
 * Briefing completo do evento, uma linha por setor impactado.
 * @param {{ eventType: string, sectors: Array<{key: string, name: string}> }} params
 * @returns {string} texto pronto para a equipe (vazio se não houver setor)
 */
function buildBriefing({ eventType, sectors }) {
  if (!Array.isArray(sectors) || sectors.length === 0) return '';
  const type = EVENT_TYPES.includes(eventType) ? eventType : 'outro';
  const header = `${labelForType(type)} — impacto por setor:`;
  const lines = sectors.map((s) => `${s.name}: ${impactForSector(type, s.key)}`);
  return [header, ...lines].join('\n');
}

/**
 * Briefing recalculado só quando ele é gerenciado pelo sistema: se o texto
 * salvo é exatamente o gerado pelos valores antigos, refaz com os novos.
 * Briefing escrito à mão pelo gestor nunca é sobrescrito.
 * @returns {string|null} novo texto, ou null para manter o que está salvo
 */
function regenerateIfAuto({ storedBriefing, previous, next }) {
  const oldAuto = buildBriefing(previous);
  const isAuto = !storedBriefing || String(storedBriefing).trim() === oldAuto.trim();
  return isAuto ? buildBriefing(next) : null;
}

module.exports = {
  EVENT_TYPES,
  EVENT_TYPE_LABELS,
  labelForType,
  impactForSector,
  buildBriefing,
  regenerateIfAuto,
};
