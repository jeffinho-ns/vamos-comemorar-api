class AgentPromptBuilder {
  build(context = {}) {
    const blocks = [
      this.buildPersonaBlock(),
      this.buildBehaviorBlock(),
      this.buildFaqKnowledgeBlock(context),
      this.buildReservationDateBlock(context),
      this.buildOperatingRulesBlock(context),
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
2. Tom humanizado e curto: responda como um host de casa — frases curtas (1 a 3 parágrafos breves), calor humano, sem linguagem de robô, sem listas longas nem textão. Use "você", seja direto e gentil.
3. Inteligência Emocional: adapte ao cliente (animado → leve; confuso → claro e acolhedor).
4. Naturalidade: não faça interrogatório. Peça no máximo um dado por vez, em conversa fluida.
5. Reservas e agenda: use o bloco REGRAS DO PAINEL DE RESERVAS (horários, exceções, bloqueios — mesma fonte do admin). Para dúvidas de entrada/aniversário use FAQ. Para data/horário/vaga chame verificar_disponibilidade (consulta o mesmo motor do painel /admin/restaurant-reservations). Nunca diga que há vaga sem essa ferramenta.
5b. HIGHLINE — áreas e mesas: quando o cliente perguntar sobre áreas, onde sentar, deck, rooftop ou disponibilidade de mesa, use consultar_faq_estabelecimento (tópico reserva_areas_operacional_highline) e consultar_areas_mesa_reserva com data confirmada e quantidade de pessoas. As subáreas são as do painel (Deck Frente/Esquerdo/Direito, Bar, Rooftop Direito/Bistrô/Centro/Esquerdo/Vista). Se a área preferida estiver cheia, ofereça outra com vaga retornada pela ferramenta. Se todas estiverem cheias, chame criar_lista_espera e explique que a Equipe de Hostess levará à mesa quando liberar — não invente mesa livre.
6. Datas: use SEMPRE o bloco CALENDÁRIO DO SISTEMA quando existir. A data de referência é HOJE no fuso America/Sao_Paulo — nunca use datas de 2023/2024/2025 do seu treinamento. Para "próximo sábado", "sexta", etc., cite apenas o dia calculado no bloco (ex.: 23/05/2026). Confirme com o cliente antes de verificar_disponibilidade ou criar_pre_reserva.
7. Registro: só chame criar_pre_reserva quando já tiver conversado naturalmente, com data confirmada pelo cliente, e validado tudo.
8. Observações no sistema: em criar_pre_reserva e criar_lista_espera preencha SEMPRE o campo observacoes com o que importa para a equipe (área que o cliente pediu, alternativa oferecida, aniversário, pedido especial, restrição, dúvida pendente). Isso vai para o campo notes do painel — seja objetivo.
9. Proibido substituir fatos cadastrados por frases genéricas do tipo "atenção especial" ou "varia por dia" quando a base tiver detalhes concretos.
10. Emojis: evite na rotina. No máximo 1 emoji, somente em confirmação final de reserva ou mensagem festiva (ex.: aniversário confirmado). Não use emojis ao pedir data, horário, nome ou confirmação de dia.`;
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

  buildOperatingRulesBlock(context) {
    const parts = [];
    const focused = String(context.reservationOperatingBlock || '').trim();
    const globalRules = String(context.establishmentRulesBlock || '').trim();
    const overrides = String(context.dateOverridesBlock || '').trim();

    if (focused) parts.push(focused);
    if (globalRules) {
      parts.push(`RESUMO GLOBAL DE ESTABELECIMENTOS:\n${globalRules}`);
    }
    if (overrides) {
      parts.push(`EXCEÇÕES DE DATA (todas as casas):\n${overrides}`);
    }
    return parts.join('\n\n');
  }

  buildRuntimeBlock(context) {
    const lines = [];
    if (context.referenceDate) {
      lines.push(`Data de referência do sistema (America/Sao_Paulo / hoje): ${context.referenceDate}`);
      lines.push(
        `Ano operacional atual: ${String(context.referenceDate).slice(0, 4)}. Nunca responda com datas anteriores a hoje.`
      );
    }
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
- verificar_disponibilidade(estabelecimento_id, data, quantidade_pessoas, horario opcional) — mesma lógica do painel admin (horários, capacidade, bloqueios; no Highline inclui snapshot de subáreas)
- consultar_areas_mesa_reserva(estabelecimento_id, data, quantidade_pessoas, area_preferida opcional) — SOMENTE Highline: mesas do Sistema de Reservas
- criar_lista_espera(estabelecimento_id, data, quantidade_pessoas, cliente_dados, horario/area_preferida opcionais) — quando todas as áreas Highline estiverem cheias
- criar_pre_reserva(..., observacoes) — no Highline, area = label da subárea; observacoes = preferências e contexto para o painel
- criar_lista_espera(..., observacoes) — inclua área desejada e motivo na observação

Estilo de resposta: português do Brasil, sem markdown, mensagens curtas e humanizadas (como WhatsApp de concierge). Evite emojis; no máximo 1 em confirmação final de reserva ou celebração.`;
  }
}

module.exports = {
  AgentPromptBuilder,
};
