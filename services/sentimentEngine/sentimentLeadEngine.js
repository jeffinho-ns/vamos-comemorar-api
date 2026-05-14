function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function analyzeSentimentLead(messageText, state = {}) {
  const text = normalizeText(messageText);
  let emotionalState = 'neutro';
  let leadTemperature = 'medium';

  if (
    /\b(impaciente|demora|demorou|rapido|rapida|urgente|urgencia|hoje mesmo|agora|serio|seria|pelo amor)\b/.test(
      text
    )
  ) {
    emotionalState = 'impaciente';
    leadTemperature = 'high';
  } else if (
    /\b(entusiasm|animad|empolgad|festa|comemor|ansios|top|show|massa|perfeito|maravilh)\b/.test(
      text
    )
  ) {
    emotionalState = 'entusiasmado';
    leadTemperature = 'high';
  } else if (
    /\b(confus|nao entendi|não entendi|como funciona|duvida|dúvida|perdido|perdida|nao sei|não sei)\b/.test(
      text
    )
  ) {
    emotionalState = 'confuso';
    leadTemperature = 'low';
  }

  if (/\b(só olhando|so olhando|talvez|depois|mais tarde|sem pressa|curios)\b/.test(text)) {
    leadTemperature = 'low';
  }

  if (
    /\b(quero reservar|fechar|confirmar|vamos|bora|pode reservar|fazer reserva|garantir|mesa)\b/.test(
      text
    )
  ) {
    leadTemperature = 'high';
  }

  if (Number(state?.retryCount) >= 2) {
    emotionalState = emotionalState === 'entusiasmado' ? emotionalState : 'impaciente';
  }

  return {
    emotionalState,
    leadTemperature,
    leadType: inferLeadType(text, state),
  };
}

function inferLeadType(text, state = {}) {
  if (/\baniversari/.test(text) || state?.collectedFields?.is_birthday) return 'birthday';
  if (/\b(grupo grande|muita gente|20 pessoas|30 pessoas|40 pessoas|50 pessoas)\b/.test(text)) {
    return 'large_group';
  }
  if (leadTemperatureFromText(text) === 'high') return 'hot';
  if (/\b(talvez|depois|só olhando|so olhando)\b/.test(text)) return 'indecisive';
  return 'curious';
}

function leadTemperatureFromText(text) {
  if (/\b(quero reservar|fechar|confirmar|vamos|bora)\b/.test(text)) return 'high';
  if (/\b(talvez|depois|só olhando|so olhando)\b/.test(text)) return 'low';
  return 'medium';
}

function buildPromptToneInstructions({ emotionalState, leadTemperature } = {}) {
  const chunks = [];
  if (emotionalState === 'impaciente') {
    chunks.push('Cliente impaciente: resposta curta, direta e com próximo passo único.');
  } else if (emotionalState === 'entusiasmado') {
    chunks.push('Cliente entusiasmado: celebre com energia, mas mantenha objetividade comercial.');
  } else if (emotionalState === 'confuso') {
    chunks.push('Cliente confuso: explique em uma frase simples e faça só uma pergunta por vez.');
  }

  if (leadTemperature === 'high') {
    chunks.push('Lead quente: conduza para fechamento sem enrolar.');
  } else if (leadTemperature === 'low') {
    chunks.push('Lead frio: acolha, gere valor e convide com leveza para o próximo passo.');
  }

  return chunks.join(' ');
}

module.exports = {
  analyzeSentimentLead,
  buildPromptToneInstructions,
};
