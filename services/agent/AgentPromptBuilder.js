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
      this.buildPersonaBlock(context),
      this.buildScopeNoticeBlock(context),
      this.buildBehaviorBlock(context),
    ]
      .filter(Boolean)
      .join('\n\n');
  }

  /** Sufixo dinâmico — FAQ, funil, regras operacionais, memória. */
  buildDynamic(context = {}) {
    const blocks = [
      this.buildFaqKnowledgeBlock(context),
      this.buildExternalLinksBlock(context),
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

  buildExternalLinksBlock(context = {}) {
    const block = String(context.externalLinksBlock || '').trim();
    return block || '';
  }

  buildPersonaBlock(context = {}) {
    const settings = this.getAssistantSettings(context);

    // Esta regra é INEGOCIÁVEL e vale com ou sem config customizada por casa.
    const factPriority =
      'PRIORIDADE: o bloco "TREINAMENTO DA IA — REGRAS DA CASA" é a única fonte factual. Se contradizer seu conhecimento geral, a BASE vence. Sem cobertura na base: "Boa, deixa eu confirmar com a equipe e te respondo já." Não invente horários, preços ou regras.';

    if (!settings) {
      return `Você é a anfitriã digital de uma casa noturna no WhatsApp — host real, simpática, português do Brasil.

${factPriority}

TOM: mensagens curtas (1-3 frases), prosa corrida, uma pergunta por vez. NUNCA listas numeradas, bullets ou formulário. Concierge premium — humano no WhatsApp, não e-mail corporativo.`;
    }

    return [this.buildCustomIdentityLine(settings), factPriority, this.buildCustomToneLine(settings)]
      .filter(Boolean)
      .join('\n\n');
  }

  /** Config de identidade/personalidade por estabelecimento (ou null = padrão). */
  getAssistantSettings(context = {}) {
    const settings = context.assistantSettings;
    if (!settings || typeof settings !== 'object') return null;
    if (!settings.is_active) return null;
    return settings;
  }

  buildCustomIdentityLine(settings) {
    const roleByGender = {
      feminino: 'a anfitriã digital',
      masculino: 'o anfitrião digital',
      neutro: 'o host digital',
    };
    const role = roleByGender[settings.gender] || roleByGender.feminino;
    const name = settings.assistant_name ? `${settings.assistant_name}, ` : '';
    return `Você é ${name}${role} de uma casa noturna no WhatsApp — host real, português do Brasil.`;
  }

  buildCustomToneLine(settings) {
    const parts = [];

    const toneText = {
      amigavel: 'Tom amigável e caloroso, próximo do cliente.',
      neutro: 'Tom neutro e objetivo, cordial sem exageros.',
      formal: 'Tom mais polido e profissional, mas ainda natural no WhatsApp — nunca e-mail corporativo.',
    };
    parts.push(toneText[settings.tone] || toneText.amigavel);

    const sizeText = {
      curta: 'Respostas bem curtas (1-2 frases).',
      media: 'Respostas curtas (1-3 frases).',
      longa: 'Respostas mais completas quando ajudar, sem virar texto longo.',
    };
    parts.push(sizeText[settings.response_size] || sizeText.media);

    parts.push(settings.use_emojis ? 'Pode usar emojis com moderação.' : 'Não use emojis.');
    parts.push(
      settings.use_bullets
        ? 'Pode usar listas/bullets curtos quando organizar informações.'
        : 'NUNCA listas numeradas, bullets ou formulário; use prosa corrida.'
    );

    if (settings.use_greeting) {
      parts.push(
        settings.greet_when_already_greeted
          ? 'Cumprimente o cliente, mesmo que já tenha havido saudação antes.'
          : 'Cumprimente o cliente no início, mas não repita saudação se já cumprimentou antes.'
      );
    } else {
      parts.push('Vá direto ao ponto, sem saudações longas.');
    }

    if (settings.slang_intensity === 'nunca') {
      parts.push('Evite gírias.');
    } else if (settings.slang_text) {
      const intensityLabel = {
        leve: 'de forma leve',
        moderado: 'de forma moderada',
        intenso: 'à vontade',
      };
      const how = intensityLabel[settings.slang_intensity] || intensityLabel.leve;
      parts.push(`Use ${how} as gírias/expressões da casa: ${settings.slang_text}`);
    }

    return `TOM: ${parts.join(' ')}`;
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

  buildBehaviorBlock(context = {}) {
    const base = `COMPORTAMENTO:
- Tom WhatsApp: "você", "fechado", "show", "beleza". PROIBIDO: "Caro X", "Prezado", "Atenciosamente", "Equipe Vamos Comemorar", markdown, bullets, dados em linhas separadas.
- Responda dúvidas factuais com a BASE antes de coletar dados de reserva.
- Coleta progressiva: data+horário+pessoas → área → nome+e-mail+nascimento. Máx. 3 dados por mensagem, em frase corrida.
- Ecoe saudação do cliente. Não repita pergunta já respondida.
- Datas: use HOJE (America/Sao_Paulo) como referência; nunca anos passados.
- Highline (id=7): só áreas oficiais (Área Deck Frente/Esquerdo/Direito, Área Bar; Rooftop só se pedir camarote/VIP). NUNCA "Bar Central", "Terraço", "Balcão", "Área VIP" genérica.
- Com todos os dados obrigatórios, chame criar_pre_reserva na mesma interação. Não finja confirmação sem ok=true da tool.
- Grupos 7-60: uma reserva com múltiplas mesas (mesma área do painel; pode juntar subáreas do Deck/Rooftop). >60 ou B2B: handoff humano.
- Use tools na mesma interação — não diga "vou verificar" sem chamar a ferramenta.`;

    const settings = this.getAssistantSettings(context);
    if (!settings) return base;

    const lines = [];
    const rules = Array.isArray(settings.custom_rules) ? settings.custom_rules : [];
    rules.forEach((rule) => lines.push(`- ${rule}`));
    this.buildBehaviorConfigLines(settings.behavior_config).forEach((line) => lines.push(`- ${line}`));

    if (!lines.length) return base;
    return `${base}

REGRAS DA CASA (definidas pelo estabelecimento):
${lines.join('\n')}`;
  }

  /** Converte os toggles da aba "Comportamento" em instruções de prompt. */
  buildBehaviorConfigLines(behaviorConfig) {
    const cfg = behaviorConfig && typeof behaviorConfig === 'object' ? behaviorConfig : {};
    const lines = [];
    const flagMap = {
      nao_informar_reservas: 'Não dê informações nem confirme reservas; encaminhe para a equipe.',
      bloquear_visita_sem_reserva:
        'Não confirme visita/entrada sem reserva; oriente o cliente a reservar antes.',
      bloquear_info_menu:
        'Não envie informações detalhadas do cardápio; ofereça o link oficial quando houver.',
      evitar_palavra_evento: 'Evite a palavra "evento"; prefira "programação" ou a data.',
      chamar_humano_insistencia:
        'Se o cliente insistir para finalizar algo que você não consegue, acione um humano.',
      chamar_humano_erro: 'Em erro técnico ou dúvida fora do seu alcance, acione atendimento humano.',
      chamar_humano_fora_area: 'Pedidos fora da sua área de atuação: encaminhe para um humano.',
      considerar_figurinhas: 'Considere figurinhas e reações do cliente como interação válida.',
      ignorar_comentarios_instagram: 'Ignore comentários do Instagram; responda só mensagens diretas.',
    };
    Object.entries(flagMap).forEach(([key, text]) => {
      if (cfg[key] === true) lines.push(text);
    });

    const handoffMessage = String(cfg.mensagem_atendimento_humano || '').trim();
    if (handoffMessage) {
      lines.push(`Ao encaminhar para atendimento humano, use uma mensagem como: "${handoffMessage}".`);
    }

    const afterHours = String(cfg.fora_horario_comportamento || '').trim();
    if (afterHours && afterHours !== 'padrao') {
      lines.push(`Fora do horário de atendimento, comportamento: ${afterHours}.`);
    }

    return lines;
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
