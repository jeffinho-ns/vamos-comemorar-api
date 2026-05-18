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
  entrada: 'valores_entrada',
  entradas: 'valores_entrada',
  preco: 'valores_entrada',
  precos: 'valores_entrada',
  valores: 'valores_entrada',
  aniversario: 'beneficios_aniversario',
  aniversarios: 'beneficios_aniversario',
  niver: 'beneficios_aniversario',
  vantagens_aniversariante: 'beneficios_aniversario',
  beneficios_aniversariante: 'beneficios_aniversario',
  area: 'areas_mesas_camarotes_diferenca',
  areas: 'areas_mesas_camarotes_diferenca',
  camarote: 'areas_mesas_camarotes_diferenca',
  camarotes: 'areas_mesas_camarotes_diferenca',
  mesa: 'areas_mesas_camarotes_diferenca',
  mesas: 'areas_mesas_camarotes_diferenca',
  pets: 'pet',
  bolo: 'regras_bolo',
  instagram: 'redes_sociais_fotos',
  fotos: 'redes_sociais_fotos',
  menu: 'cardapio',
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
  return /\b(aniversari|aniversariante|niver|beneficio|beneficios|vantagem|vantagens|comemorar|festa de anivers)\b/.test(
    normalized
  );
}

function looksLikeEntryPricingQuestion(text) {
  const normalized = normalizeInboundText(text);
  return /\b(entrada|entradas|vip|consome|consumacao|ingresso|preco|precos|valor|valores|lista)\b/.test(
    normalized
  );
}

function looksLikeOperatingHoursQuestion(text) {
  const normalized = normalizeInboundText(text);
  if (/\bhor[aá]ri|horarios?\b|funcionamento\b/.test(normalized)) return true;
  return /\b(abre|abrem|fecha|fecham|aberto|fechado)\b/.test(normalized);
}

function looksLikeMusicStyleQuestion(text) {
  const normalized = normalizeInboundText(text);
  return /\b(musica|dj|house|open format|brasilidades|programacao)\b/.test(normalized);
}

function detectFaqTopicsFromUserText(text) {
  const normalized = normalizeInboundText(text);
  if (!normalized) return [];

  const topics = [];

  if (looksLikeBirthdayBenefitsQuestion(text)) {
    topics.push('beneficios_aniversario');
  }
  if (looksLikeOperatingHoursQuestion(text) || looksLikeMusicStyleQuestion(text)) {
    topics.push('dias_horarios_funcionamento');
  }
  if (looksLikeEntryPricingQuestion(text)) {
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
  if (/\b(camarote|rooftop|bangalo|lounge)\b/.test(normalized)) {
    topics.push('areas_mesas_camarotes_diferenca');
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

  return /\b(como funciona|me conta|me fala|quais? sao|o que tem|informac|duvida)\b/.test(
    normalized
  );
}

function looksLikeReservationPushOnly(text) {
  const normalized = normalizeInboundText(text);
  return /\b(reservar|fazer reserva|quero reserva|nova reserva)\b/.test(normalized);
}

module.exports = {
  canonicalizeAdminFaqTopic,
  normalizeTopicKey,
  detectFaqTopicsFromUserText,
  isInformationalFaqTurn,
  looksLikeBirthdayBenefitsQuestion,
  looksLikeOperatingHoursQuestion,
  looksLikeEntryPricingQuestion,
  looksLikeReservationPushOnly,
};
