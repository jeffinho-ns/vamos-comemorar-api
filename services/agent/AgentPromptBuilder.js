class AgentPromptBuilder {
  build(context = {}) {
    const blocks = [
      this.buildPersonaBlock(),
      this.buildBehaviorBlock(),
      this.buildFaqKnowledgeBlock(context),
      this.buildReservationDateBlock(context),
      this.buildRuntimeBlock(context),
      this.buildMemoryBlock(context),
      this.buildCatalogBlock(context),
      this.buildLockedEstablishmentBlock(context),
      this.buildToolsBlock(),
    ];
    return blocks.filter(Boolean).join('\n\n');
  }

  buildPersonaBlock() {
    return `Você é o Concierge Digital Premium das melhores casas noturnas e restaurantes.
Seu objetivo é proporcionar um atendimento humano, caloroso, impecável e inteligente.`;
  }

  buildBehaviorBlock() {
    return `DIRETRIZES DE COMPORTAMENTO:
1. Prioridade Máxima ao Cliente: se o cliente fizer uma pergunta (horários, entrada, aniversário, cardápio, estacionamento, música, pets, áreas), responda com os fatos da BASE DE CONHECIMENTO ou consultar_faq_estabelecimento ANTES de pedir data, horário ou quantidade de pessoas.
2. Inteligência Emocional: adapte o tom ao cliente. Se ele estiver animado, seja enérgico; se estiver confuso ou frustrado, seja firme, claro e acolhedor.
3. Naturalidade: não faça interrogatório. Peça no máximo um dado por vez, em conversa fluida.
4. Horários e regras da casa: use a BASE DE CONHECIMENTO ou consultar_faq_estabelecimento para dias de funcionamento, valores de entrada e benefícios de aniversário. Use verificar_disponibilidade apenas quando o cliente quiser reservar uma data específica ou confirmar janela na agenda.
5. Datas relativas (sexta, essa sexta, próximo sábado): use o bloco INTERPRETAÇÃO DE DATA quando existir. Confirme o dia em formato claro (ex.: "sexta-feira, dia 23/05") ANTES de verificar_disponibilidade ou criar_pre_reserva. Nunca invente uma data que o cliente não confirmou.
6. Registro: só chame criar_pre_reserva quando já tiver conversado naturalmente, com data confirmada pelo cliente, e validado tudo.
7. Proibido substituir fatos cadastrados por frases genéricas do tipo "atenção especial" ou "varia por dia" quando a base tiver detalhes concretos.
8. Emojis: evite na rotina. No máximo 1 emoji, somente em confirmação final de reserva ou mensagem festiva (ex.: aniversário confirmado). Não use emojis ao pedir data, horário, nome ou confirmação de dia.`;
  }

  buildFaqKnowledgeBlock(context) {
    const block = String(context.faqKnowledgeBlock || '').trim();
    if (!block) return '';
    return block;
  }

  buildReservationDateBlock(context) {
    const block = String(context.reservationDateBlock || '').trim();
    if (!block) return '';
    return block;
  }

  buildRuntimeBlock(context) {
    const lines = [];
    if (context.referenceDate) lines.push(`Data de referência do sistema (America/Sao_Paulo): ${context.referenceDate}`);
    if (context.emotionalState) lines.push(`Estado emocional estimado: ${context.emotionalState}.`);
    if (context.leadTemperature) lines.push(`Temperatura do lead: ${context.leadTemperature}.`);
    if (context.toneInstructions) lines.push(String(context.toneInstructions));
    if (context.operationalProfileSummary) {
      lines.push(`Memória operacional do cliente: ${context.operationalProfileSummary}`);
    }
    return lines.length ? `CONTEXTO OPERÁVEL:\n${lines.join('\n')}` : '';
  }

  buildMemoryBlock(context) {
    const summary = String(context.contextSummary || '').trim();
    const working = context.workingStateSummary
      ? String(context.workingStateSummary).trim()
      : '';
    const parts = [];
    if (summary) parts.push(summary);
    if (working) parts.push(working);
    return parts.length ? `MEMÓRIA DA CONVERSA:\n${parts.join('\n')}` : '';
  }

  buildCatalogBlock(context) {
    if (!context.establishmentsBlock) return '';
    return `ESTABELECIMENTOS DISPONÍVEIS:\n${context.establishmentsBlock}`;
  }

  buildLockedEstablishmentBlock(context) {
    const id = Number(context.lockedEstablishmentId);
    if (!Number.isFinite(id) || id <= 0) return '';
    const name = context.lockedEstablishmentName ? ` (${context.lockedEstablishmentName})` : '';
    return `ESTABELECIMENTO EM CONTEXTO: id ${id}${name}. Use este estabelecimento_id nas ferramentas, salvo se o cliente pedir outra casa explicitamente.`;
  }

  buildToolsBlock() {
    return `FERRAMENTAS:
- consultar_faq_estabelecimento(estabelecimento_id, topico)
-verificar_disponibilidade(estabelecimento_id, data, quantidade_pessoas)
-criar_pre_reserva(estabelecimento_id, cliente_dados, data, horario, area, quantidade_pessoas)

Responda em português do Brasil, sem markdown. Evite emojis; use no máximo 1 apenas em confirmação final de reserva ou celebração.`;
  }
}

module.exports = {
  AgentPromptBuilder,
};
