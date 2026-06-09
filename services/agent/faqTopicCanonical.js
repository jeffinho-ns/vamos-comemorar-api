/**
 * Tópicos canônicos da base de conhecimento (establishment_faq).
 * Devem coincidir com as rotas em agentTools.js (RICH_FAQ_TOPIC_ROUTES / LEGACY_FAQ_ALIASES).
 */

const ADMIN_TOPIC_CANONICAL = {
  horario: 'dias_horarios_funcionamento',
  horarios: 'dias_horarios_funcionamento',
  funcionamento: 'dias_horarios_funcionamento',
  horario_funcionamento: 'dias_horarios_funcionamento',
  horario_de_funcionamento: 'dias_horarios_funcionamento',
  dias_horarios: 'dias_horarios_funcionamento',
  como_que_funciona_aos_sabados: 'dias_horarios_funcionamento',
  sabados: 'dias_horarios_funcionamento',
  qual_e_a_data_da_comemoracao: 'dias_horarios_funcionamento',

  entrada: 'valores_entrada',
  entradas: 'valores_entrada',
  preco: 'valores_entrada',
  precos: 'valores_entrada',
  valores: 'valores_entrada',
  cover: 'valores_entrada',
  ingresso: 'valores_entrada',
  ingressos: 'valores_entrada',

  consumo: 'consumacao',
  consumacao: 'consumacao',

  aniversario: 'beneficios_aniversario',
  aniversarios: 'beneficios_aniversario',
  niver: 'beneficios_aniversario',
  vantagens_aniversariante: 'beneficios_aniversario',
  beneficios_aniversariante: 'beneficios_aniversario',
  vai_ser_alguma_comemoracao: 'beneficios_aniversario',

  area: 'areas_mesas_camarotes_diferenca',
  areas: 'areas_mesas_camarotes_diferenca',
  reserva_areas: 'reserva_areas_operacional_highline',
  areas_reserva: 'reserva_areas_operacional_highline',
  lista_espera: 'reserva_areas_operacional_highline',
  camarote: 'areas_mesas_camarotes_diferenca',
  camarotes: 'areas_mesas_camarotes_diferenca',
  mesa: 'areas_mesas_camarotes_diferenca',
  mesas: 'areas_mesas_camarotes_diferenca',
  subareas: 'subareas_canonicas_highline',
  subarea: 'subareas_canonicas_highline',
  deck: 'subareas_canonicas_highline',
  rooftop: 'subareas_canonicas_highline',

  pet: 'pet',
  pets: 'pet',
  cachorro: 'pet',
  animal: 'pet',
  animais: 'pet',

  bolo: 'regras_bolo',
  bolos: 'regras_bolo',
  instagram: 'redes_sociais_fotos',
  fotos: 'redes_sociais_fotos',
  redes_sociais: 'redes_sociais_fotos',
  menu: 'cardapio',
  cardapios: 'cardapio',

  // Comportamento / tom — todas as variações apontam para tom_atendimento_humano
  tom: 'tom_atendimento_humano',
  tom_de_voz: 'tom_atendimento_humano',
  tom_de_voz_e_atendimento: 'tom_atendimento_humano',
  estilo_atendimento: 'tom_atendimento_humano',
  emoji: 'tom_atendimento_humano',
  emojis: 'tom_atendimento_humano',

  // Coleta de dados — todas as variações apontam para o protocolo progressivo.
  coleta_dados: 'coleta_dados_progressiva_reserva',
  coletar_dados: 'coleta_dados_progressiva_reserva',
  solicitacao_de_dados: 'coleta_dados_progressiva_reserva',
  solicitacao_de_dados_de_reserva: 'coleta_dados_progressiva_reserva',
  template_reserva: 'coleta_dados_progressiva_reserva',
  campos_reserva: 'coleta_dados_progressiva_reserva',

  // Horário de corte para segurar mesa
  horario_corte: 'horario_corte_chegada_reserva',
  qual_horario_pretendem_chegar_na_casa: 'horario_corte_chegada_reserva',
  horario_chegada: 'horario_corte_chegada_reserva',
  corte_reserva: 'horario_corte_chegada_reserva',

  // Internos
  sao_quantos_convidados: 'coleta_dados_progressiva_reserva',
  quantidade_convidados: 'coleta_dados_progressiva_reserva',
  grupo_grande: 'reserva_grupos_grandes_highline',
  grupos_grandes: 'reserva_grupos_grandes_highline',
  reserva_grande: 'reserva_grupos_grandes_highline',
  mesa_grande: 'reserva_grupos_grandes_highline',

  // Capacidade
  capacidade: 'capacidade_diaria_highline',
  lotacao: 'capacidade_diaria_highline',

  // Valor x caução
  caucao: 'valor_entrada_vs_caucao',
  taxa_reserva: 'valor_entrada_vs_caucao',

  // Duplicidade
  duplicidade: 'controle_duplicidade_reservas',
  duplicada: 'controle_duplicidade_reservas',
  duplicadas: 'controle_duplicidade_reservas',
};

function normalizeTopicKey(topic) {
  return String(topic || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_');
}

function canonicalizeAdminFaqTopic(topic) {
  const normalized = normalizeTopicKey(topic);
  if (!normalized) return '';
  return ADMIN_TOPIC_CANONICAL[normalized] || normalized;
}

function normalizeInboundText(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function looksLikeBirthdayBenefitsQuestion(text) {
  const normalized = normalizeInboundText(text);
  return /\b(aniversari|aniversariante|niver|beneficio|beneficios|vantagem|vantagens)\b/.test(
    normalized
  ) || /\b(festa de anivers|reserva de anivers|comemorar (meu |o )?anivers|vou comemorar|e aniversario|e aniversário)\b/.test(
    normalized
  );
}

function looksLikeEntryPricingQuestion(text) {
  const normalized = normalizeInboundText(text);
  return /\b(entrada|entradas|vip|consome|consumacao|ingresso|preco|precos|valor|valores|lista)\b/.test(
    normalized
  );
}

function looksLikeSaturdayQuestion(text) {
  const normalized = normalizeInboundText(text);
  return /\bsabad[oa]s?\b/.test(normalized);
}

function looksLikeOperatingHoursQuestion(text) {
  const normalized = normalizeInboundText(text);
  if (looksLikeSaturdayQuestion(text)) return true;
  if (/\bhor[aá]ri|horarios?\b|funcionamento\b/.test(normalized)) return true;
  return /\b(abre|abrem|fecha|fecham|aberto|fechado)\b/.test(normalized);
}

function looksLikeMusicStyleQuestion(text) {
  const normalized = normalizeInboundText(text);
  return /\b(musica|dj|house|open format|brasilidades|programacao)\b/.test(normalized);
}

function extractPartySizeFromText(text) {
  const normalized = normalizeInboundText(text);
  if (!normalized) return null;

  const direct = normalized.match(/\b(\d{1,3})\s*(pessoas?|convidados?|gente|amigos?)\b/);
  if (direct) {
    const n = Number(direct[1]);
    if (n > 0 && n <= 200) return n;
  }
  const somos = normalized.match(/\b(somos|serao|seremos|vamos ser)\s*(\d{1,3})\b/);
  if (somos) {
    const n = Number(somos[2]);
    if (n > 0 && n <= 200) return n;
  }
  const grupo = normalized.match(/\bgrupo\s*(?:de|com)?\s*(\d{1,3})\b/);
  if (grupo) {
    const n = Number(grupo[1]);
    if (n > 0 && n <= 200) return n;
  }
  return null;
}

function detectFaqTopicsFromUserText(text) {
  const normalized = normalizeInboundText(text);
  if (!normalized) return [];

  const topics = [];
  const partySize = extractPartySizeFromText(text);
  if (Number.isFinite(partySize) && partySize >= 16) {
    topics.push('reserva_grupos_grandes_highline');
  }
  if (
    /\b(grupo grande|grupos grandes|muita gente|mesa grande|reserva grande)\b/.test(normalized)
  ) {
    topics.push('reserva_grupos_grandes_highline');
  }

  if (looksLikeBirthdayBenefitsQuestion(text)) {
    topics.push('beneficios_aniversario');
  }
  if (looksLikeOperatingHoursQuestion(text) || looksLikeMusicStyleQuestion(text)) {
    topics.push('dias_horarios_funcionamento');
  }
  if (looksLikeEntryPricingQuestion(text) || looksLikeSaturdayQuestion(text)) {
    topics.push('valores_entrada');
  }
  if (/\b(bolo|doces?)\b/.test(normalized) && /\b(lev|levar|traz|pode)\b/.test(normalized)) {
    topics.push('regras_bolo');
  }
  if (/\b(estacionamento|valet)\b/.test(normalized)) {
    topics.push('estacionamento');
  }
  if (/\b(cardapio|menu)\b/.test(normalized)) {
    topics.push('cardapio');
  }
  if (/\b(pet|cachorro|animal)\b/.test(normalized)) {
    topics.push('pet');
  }
  if (
    /\b(camarote|camarotes|bangalo|lounge vip|area vip|pacote vip|vip consum)\b/.test(normalized) ||
    (/\b(camarote|vip)\b/.test(normalized) && /\b(valor|preco|quanto|consum)\b/.test(normalized))
  ) {
    topics.push('areas_mesas_camarotes_diferenca');
  }
  if (
    /\b(deck|lista de espera|hostess|mesa disponivel|mesas disponiveis|qual area|onde sentar|subarea)\b/.test(
      normalized
    )
  ) {
    topics.push('reserva_areas_operacional_highline');
  }
  if (/\b(instagram|fotos?|ambiente)\b/.test(normalized)) {
    topics.push('redes_sociais_fotos');
  }
  if (/\b(dress|traje|vestimenta)\b/.test(normalized)) {
    topics.push('dress_code');
  }

  return [...new Set(topics)];
}

function isInformationalFaqTurn(text) {
  const normalized = normalizeInboundText(text);
  if (!normalized) return false;

  if (detectFaqTopicsFromUserText(text).length > 0) return true;

  if (/\b(como funciona|me conta|me fala|quais? sao|o que tem|informac|duvida)\b/.test(normalized)) {
    return true;
  }
  if (looksLikeSaturdayQuestion(text)) return true;
  return false;
}

function looksLikeReservationPushOnly(text) {
  const normalized = normalizeInboundText(text);
  return /\b(reservar|fazer reserva|quero reserva|nova reserva)\b/.test(normalized);
}

/** Une tópicos detectados na mensagem atual e no histórico recente do usuário. */
function detectFaqTopicsFromConversation(messageHistory = [], currentText = '') {
  const texts = [
    String(currentText || '').trim(),
    ...(messageHistory || [])
      .filter((m) => m?.role === 'user')
      .map((m) => String(m.content || '').trim())
      .slice(-4),
  ].filter(Boolean);

  const topics = [];
  for (const text of texts) {
    for (const topic of detectFaqTopicsFromUserText(text)) {
      if (!topics.includes(topic)) topics.push(topic);
    }
  }
  return topics;
}

module.exports = {
  canonicalizeAdminFaqTopic,
  normalizeTopicKey,
  extractPartySizeFromText,
  detectFaqTopicsFromUserText,
  detectFaqTopicsFromConversation,
  isInformationalFaqTurn,
  looksLikeBirthdayBenefitsQuestion,
  looksLikeOperatingHoursQuestion,
  looksLikeSaturdayQuestion,
  looksLikeEntryPricingQuestion,
  looksLikeReservationPushOnly,
};
