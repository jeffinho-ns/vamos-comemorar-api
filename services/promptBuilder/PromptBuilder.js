const {
  getFieldsForStep,
  getStepPrompt,
  COLLECT_BUNDLE_STEP,
  OBSERVATIONS_STEP,
} = require('../stateManager/conversationSteps');

const JSON_OUTPUT_RULES = `Responda APENAS um JSON válido:
{
  "action": "COLLECT_DATA" | "PROCESS_RESERVATION" | "REFUSE_MINOR" | "falar_com_humano",
  "params": object,
  "missing_fields": string[],
  "suggested_reply": string
}
Não invente disponibilidade, preços ou regras. Use tools quando precisar consultar horários ou exceções.
Não prometa reserva salva antes do sistema confirmar.
Não use REFUSE_MINOR sem data de nascimento explícita indicando menor de 18 anos.
Não use falar_com_humano para dúvidas de esclarecimento sobre estabelecimento, área, horário ou dados.
Não diga que a casa está fechada sem consultar checkAvailability para o estabelecimento e data corretos.
Não pergunte novamente um dado que já consta em "Já coletado".`;

class PromptBuilder {
  build(context = {}) {
    const step = String(context.conversationStep || 'greeting').trim();
    const blocks = [
      this.buildBasePersona(context),
      this.buildEmotionalToneBlock(context),
      this.buildOperationalMemoryBlock(context),
      this.buildStateBlock(context),
      this.buildStepBlock(step, context),
      JSON_OUTPUT_RULES,
    ];
    return blocks.filter(Boolean).join('\n\n');
  }

  buildBasePersona(context) {
    const establishmentName = context.lockedEstablishmentName
      ? ` Estabelecimento fixo: ${context.lockedEstablishmentName}.`
      : '';
    return `Você é a Host Digital do Agilizaiapp no WhatsApp. Tom premium, humano e objetivo em português do Brasil.${establishmentName}`;
  }

  buildOperationalMemoryBlock(context) {
    const summary = String(context.operationalProfileSummary || '').trim();
    if (!summary) return '';
    return `MEMÓRIA OPERACIONAL DO CLIENTE:\n${summary}`;
  }

  buildEmotionalToneBlock(context) {
    const tone = String(context.toneInstructions || '').trim();
    const emotionalState = context.emotionalState ? `Estado emocional: ${context.emotionalState}.` : '';
    const leadTemperature = context.leadTemperature ? `Temperatura do lead: ${context.leadTemperature}.` : '';
    if (!tone && !emotionalState && !leadTemperature) return '';
    return `AJUSTE DE TOM:\n${[emotionalState, leadTemperature, tone].filter(Boolean).join(' ')}`;
  }

  buildStateBlock(context) {
    const missing = Array.isArray(context.missingFields) ? context.missingFields.join(', ') : '';
    const collected = context.collectedFieldsSummary
      ? String(context.collectedFieldsSummary)
      : '';
    const nextField = context.nextFieldLabel ? `Próximo dado necessário: ${context.nextFieldLabel}.` : '';
    return `ESTADO ATUAL:\n- Passo: ${context.conversationStep || 'greeting'}\n- Pendentes: ${missing || '(nenhum)'}\n- Já coletado: ${collected || '(nada confirmado)'}\n${nextField}`;
  }

  buildStepBlock(step, context) {
    switch (step) {
      case 'establishment':
        return this.buildEstablishmentStep(context);
      case COLLECT_BUNDLE_STEP:
        return this.buildCollectBundleStep(context);
      case OBSERVATIONS_STEP:
        return this.buildObservationsStep(context);
      case 'date':
        return this.buildDateStep(context);
      case 'time':
        return this.buildTimeStep(context);
      case 'party_size':
        return this.buildPartySizeStep(context);
      case 'area':
        return this.buildAreaStep(context);
      case 'identity':
        return this.buildIdentityStep(context);
      case 'confirm_summary':
        return this.buildConfirmStep(context);
      default:
        return this.buildGreetingStep(context);
    }
  }

  buildGreetingStep() {
    return `OBJETIVO DO TURNO:\n- Acolher e iniciar a reserva.\n- Peça os dados em um único bloco (não interrogatório campo a campo).\n${getStepPrompt('greeting')}`;
  }

  buildCollectBundleStep(context) {
    const prompt = getStepPrompt(COLLECT_BUNDLE_STEP, context.collectedFieldsParsed || {}, {
      establishmentName: context.lockedEstablishmentName,
      lockedEstablishmentId: context.lockedEstablishmentId,
    });
    return `OBJETIVO DO TURNO:\n- Extrair da mensagem do cliente todos os campos que ele enviar (data, horário, pessoas, nome, e-mail, nascimento, área).\n- Não peça um campo por vez; se faltar algo, use suggested_reply repetindo o bloco só com o que ainda falta.\n- Não use PROCESS_RESERVATION até observações serem perguntadas.\n\nMENSAGEM SUGERIDA:\n${prompt}`;
  }

  buildObservationsStep() {
    return `OBJETIVO DO TURNO:\n- Perguntar se há observações para o painel (aniversário, preferência de mesa, etc.).\n- Se o cliente disser que não tem, grave reservation_notes vazio e avance.\n- Depois use PROCESS_RESERVATION se todos os campos obrigatórios estiverem ok.\n\n${getStepPrompt(OBSERVATIONS_STEP)}`;
  }

  buildEstablishmentStep(context) {
    const lockedId = Number(context.lockedEstablishmentId);
    if (Number.isFinite(lockedId) && lockedId > 0) {
      return `OBJETIVO DO TURNO:\n- Estabelecimento já fixado (ID ${lockedId}).\n- Não pergunte a casa novamente; preencha establishment_id=${lockedId}.`;
    }
    return `OBJETIVO DO TURNO:\n- Identificar establishment_id.\nESTABELECIMENTOS:\n${context.establishmentsBlock || '(carregar no servidor)'}`;
  }

  buildDateStep(context) {
    const dateBlock = String(context.reservationDateBlock || '').trim();
    const dateRules = dateBlock
      ? `${dateBlock}\n`
      : '- Se o cliente disser dia da semana relativo (sexta, essa sexta, próximo sábado), confirme o dia em DD/MM antes de seguir.\n';
    return `OBJETIVO DO TURNO:\n- Extrair reservation_date em YYYY-MM-DD.\n- Use America/Sao_Paulo.\n${dateRules}- Se o cliente perguntar disponibilidade, chame checkAvailability antes de responder.\nEstabelecimento: ${context.lockedEstablishmentId || 'ainda não definido'}.`;
  }

  buildTimeStep(context) {
    return `OBJETIVO DO TURNO:\n- Extrair reservation_time em HH:mm.\n- Se houver dúvida de janela, chame checkAvailability com a data já coletada.\nData coletada: ${context.collectedReservationDate || 'pendente'}.`;
  }

  buildPartySizeStep() {
    return `OBJETIVO DO TURNO:\n- Extrair quantidade_convidados inteiro.\n- Se o cliente usar termos aproximados ("umas 10"), confirme o número exato na suggested_reply.`;
  }

  buildAreaStep(context) {
    return `OBJETIVO DO TURNO:\n- Escolher area_id com base na descrição do cliente.\nÁREAS:\n${context.areasBlock || '(carregar no servidor)'}`;
  }

  buildIdentityStep() {
    return `OBJETIVO DO TURNO:\n- Coletar client_name, client_email e data_nascimento.\n- data_nascimento em YYYY-MM-DD.\n- Se menor de 18, use REFUSE_MINOR.`;
  }

  buildConfirmStep(context) {
    return `OBJETIVO DO TURNO:\n- Revisar dados coletados e só usar PROCESS_RESERVATION se todos os campos obrigatórios estiverem consistentes.\nResumo: ${context.collectedFieldsSummary || '(vazio)'}`;
  }
}

module.exports = {
  PromptBuilder,
};
