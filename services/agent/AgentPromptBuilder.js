/**
 * Prompt do agente conversacional — versão enxuta para reduzir tokens.
 * Conteúdo estático (cacheável) separado do dinâmico (FAQ, funil, memória).
 */

class AgentPromptBuilder {
  build(context = {}) {
    return [this.buildStatic(context), this.buildDynamic(context)].filter(Boolean).join('\n\n');
  }

  /** Prefixo estável — maximiza Prompt Caching da OpenAI. */
  buildStatic(context = {}) {
    return [
      this.buildPersonaBlock(),
      this.buildScopeNoticeBlock(context),
      this.buildBehaviorBlock(),
    ]
      .filter(Boolean)
      .join('\n\n');
  }

  /** Sufixo dinâmico — FAQ, funil, regras operacionais, memória. */
  buildDynamic(context = {}) {
    const blocks = [
      this.buildFaqKnowledgeBlock(context),
      this.buildReservationDateBlock(context),
      this.buildReservationFunnelBlock(context),
      this.buildOperatingRulesBlock(context),
      this.buildRuntimeBlock(context),
      this.buildMemoryBlock(context),
      this.buildCatalogBlock(context),
      this.buildLockedEstablishmentBlock(context),
    ];
    return blocks.filter(Boolean).join('\n\n');
  }

  buildPersonaBlock() {
    return `Você é a anfitriã digital de uma casa noturna no WhatsApp — host real, simpática, português do Brasil.

PRIORIDADE: o bloco "TREINAMENTO DA IA — REGRAS DA CASA" é a única fonte factual. Se contradizer seu conhecimento geral, a BASE vence. Sem cobertura na base: "Boa, deixa eu confirmar com a equipe e te respondo já." Não invente horários, preços ou regras.

TOM: mensagens curtas (1-3 frases), prosa corrida, uma pergunta por vez. NUNCA listas numeradas, bullets ou formulário. Concierge premium — humano no WhatsApp, não e-mail corporativo.`;
  }

  buildScopeNoticeBlock(context) {
    const id = Number(context.lockedEstablishmentId);
    const name = String(context.lockedEstablishmentName || '').trim();
    if (!Number.isFinite(id) || id <= 0) {
      return 'ESCOPO: estabelecimento não identificado — confirme em qual casa o cliente quer reservar antes de fatos operacionais.';
    }
    if (id === 7) {
      return 'ESCOPO: HighLine (id=7). Use regras e base cadastradas para esta casa.';
    }
    return `ESCOPO: "${name || 'estabelecimento'}" (id=${id}). Ignore menções a Highline se não forem desta casa.`;
  }

  buildBehaviorBlock() {
    return `COMPORTAMENTO:
- Tom WhatsApp: "você", "fechado", "show", "beleza". PROIBIDO: "Caro X", "Prezado", "Atenciosamente", "Equipe Vamos Comemorar", markdown, bullets, dados em linhas separadas.
- Responda dúvidas factuais com a BASE antes de coletar dados de reserva.
- Coleta progressiva: data+horário+pessoas → área → nome+e-mail+nascimento. Máx. 3 dados por mensagem, em frase corrida.
- Ecoe saudação do cliente. Não repita pergunta já respondida.
- Datas: use HOJE (America/Sao_Paulo) como referência; nunca anos passados.
- Highline (id=7): só áreas oficiais (Área Deck Frente/Esquerdo/Direito, Área Bar; Rooftop só se pedir camarote/VIP). NUNCA "Bar Central", "Terraço", "Balcão", "Área VIP" genérica.
- Com todos os dados obrigatórios, chame criar_pre_reserva na mesma interação. Não finja confirmação sem ok=true da tool.
- Grupos 7-60: uma reserva com múltiplas mesas. >60 ou B2B: handoff humano.
- Use tools na mesma interação — não diga "vou verificar" sem chamar a ferramenta.`;
  }

  buildFaqKnowledgeBlock(context) {
    const block = String(context.faqKnowledgeBlock || '').trim();
    if (block) return block;
    return [
      'TREINAMENTO DA IA — REGRAS DA CASA:',
      '(BASE VAZIA — não responda fatos sobre a casa; diga que vai confirmar com a equipe.)',
    ].join('\n');
  }

  buildReservationDateBlock(context) {
    const block = String(context.reservationDateBlock || '').trim();
    return block || '';
  }

  buildReservationFunnelBlock(context) {
    const block = String(context.reservationFunnelBlock || '').trim();
    return block || '';
  }

  buildOperatingRulesBlock(context) {
    const parts = [];
    const focused = String(context.reservationOperatingBlock || '').trim();
    const globalRules = String(context.establishmentRulesBlock || '').trim();
    const overrides = String(context.dateOverridesBlock || '').trim();

    if (focused) parts.push(focused);
    if (globalRules) parts.push(`RESUMO GLOBAL:\n${globalRules}`);
    if (overrides) parts.push(`EXCEÇÕES DE DATA:\n${overrides}`);
    return parts.join('\n\n');
  }

  buildRuntimeBlock(context) {
    const lines = [];
    if (context.referenceDate) {
      lines.push(`Hoje: ${context.referenceDate} (America/Sao_Paulo).`);
    }
    if (context.emotionalState) lines.push(`Cliente: ${context.emotionalState}.`);
    if (context.leadTemperature) lines.push(`Lead: ${context.leadTemperature}.`);
    if (context.toneInstructions) lines.push(String(context.toneInstructions));
    if (context.operationalProfileSummary) {
      lines.push(`Perfil: ${context.operationalProfileSummary}`);
    }
    return lines.length ? `CONTEXTO:\n${lines.join('\n')}` : '';
  }

  buildMemoryBlock(context) {
    const summary = String(context.contextSummary || '').trim();
    const working = context.workingStateSummary
      ? String(context.workingStateSummary).trim()
      : '';
    const parts = [];
    if (summary) parts.push(summary);
    if (working) parts.push(working);
    return parts.length ? `MEMÓRIA:\n${parts.join('\n')}` : '';
  }

  buildCatalogBlock(context) {
    if (!context.establishmentsBlock) return '';
    return `ESTABELECIMENTOS:\n${context.establishmentsBlock}`;
  }

  buildLockedEstablishmentBlock(context) {
    const id = Number(context.lockedEstablishmentId);
    if (!Number.isFinite(id) || id <= 0) return '';
    const name = context.lockedEstablishmentName ? ` (${context.lockedEstablishmentName})` : '';
    return `CASA ATIVA: id ${id}${name}.`;
  }
}

module.exports = {
  AgentPromptBuilder,
};
