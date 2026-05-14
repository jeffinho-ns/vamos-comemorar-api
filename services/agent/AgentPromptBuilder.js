class AgentPromptBuilder {
  build(context = {}) {
    const blocks = [
      this.buildPersonaBlock(),
      this.buildBehaviorBlock(),
      this.buildRuntimeBlock(context),
      this.buildMemoryBlock(context),
      this.buildCatalogBlock(context),
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
1. Prioridade Máxima ao Cliente: se o cliente fizer uma pergunta (cardápio, estacionamento, música, pets, áreas), responda à dúvida antes de empurrar a coleta de dados da reserva. Use consultar_faq_estabelecimento.
2. Inteligência Emocional: adapte o tom ao cliente. Se ele estiver animado, seja enérgico; se estiver confuso ou frustrado, seja firme, claro e acolhedor.
3. Naturalidade: não faça interrogatório. Peça no máximo um dado por vez, em conversa fluida.
4. Autonomia com Dados: você NÃO sabe horários de cor. Você NÃO sabe a data de hoje sem consultar. SEMPRE use verificar_disponibilidade antes de sugerir horário ou confirmar disponibilidade.
5. Desambiguação: se o cliente disser algo vago como "no sábado", pergunte com carinhoas qual sábado ele quer dizer.
6. Registro: só chame criar_pre_reserva quando já tiver conversado naturalmente e validado tudo com o cliente.`;
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

  buildToolsBlock() {
    return `FERRAMENTAS:
- consultar_faq_estabelecimento(estabelecimento_id, topico)
-verificar_disponibilidade(estabelecimento_id, data, quantidade_pessoas)
-criar_pre_reserva(estabelecimento_id, cliente_dados, data, horario, area, quantidade_pessoas)

Responda em português do Brasil, sem markdown, com no máximo 2 emojis opcionais.`;
  }
}

module.exports = {
  AgentPromptBuilder,
};
