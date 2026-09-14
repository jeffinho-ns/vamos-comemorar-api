'use strict';

/**
 * Modo guia: quando não há tool, conduz o colaborador pela tela
 * usando UM playbook compacto (sem catálogo de tools → bem mais barato).
 */

const xaiClient = require('./xaiClient');
const {
  getPlaybookById,
  detectPlaybookIntent,
  formatPlaybookForPrompt,
} = require('./playbooks');
const {
  upsertGuideSession,
  getGuideSession,
  clearGuideSession,
  isGuideContinueText,
  isGuideCancelText,
  inferNextStepIndex,
} = require('./guideSessions');
const { getPhase1Meta } = require('./phase1ToolCatalog');

const GUIDE_SYSTEM = `Você é o assistente interno do Agilizaiapp em MODO GUIA.
Não execute ações no sistema: só oriente o colaborador na tela do admin.
Tom: colega de operação, prosa em português do Brasil, acolhedor e direto.
Regras de ouro:
- Diga com clareza que você ainda NÃO está liberado para fazer essa ação sozinho, mas vai mostrar o caminho.
- Use os nomes EXATOS de menu, botões e campos listados no GUIA ATIVO (ex.: "Adicionar Item", "Nova Reserva", "Assumir conversa").
- Uma pergunta ou um passo por vez (no máximo 2 se forem curtíssimos).
- No primeiro contato, cite a rota (/admin/...) e peça para confirmar a casa do seletor.
- Se o colaborador disser que já fez / pronto / próximo, avance para o próximo passo do guia.
- Se disser que parou ou não conseguiu, pergunte em qual botão/campo travou e retome dali.
- Se faltar permissão (UEP), explique qual flag costuma liberar (está em Atenção do guia).
- Nunca invente botões ou menus que não estejam no GUIA ATIVO.
- Sem listas numeradas longas e sem "Como posso ajudar?".`;

/**
 * @returns {Promise<object|null>} resposta de turno ou null se não for modo guia
 */
async function tryGuideTurn({ user, estId, text }) {
  const userId = user?.id || user?.userId;
  if (!userId) return null;

  if (isGuideCancelText(text)) {
    clearGuideSession(userId, estId);
    return {
      ok: true,
      type: 'message',
      reply: 'Beleza, parei o guia. Quando quiser retomar é só pedir de novo.',
      guide: { active: false },
      meta: getPhase1Meta(),
    };
  }

  const existing = getGuideSession(userId, estId);
  let playbook = detectPlaybookIntent(text);

  // Continuação de guia ativo sem novo intent explícito
  if (!playbook && existing && isGuideContinueText(text)) {
    playbook = getPlaybookById(existing.playbookId);
  }

  // Mesmo playbook de novo → retoma sessão
  if (playbook && existing && existing.playbookId === playbook.id) {
    // keep step
  } else if (playbook && existing && existing.playbookId !== playbook.id) {
    // troca de guia
  } else if (!playbook) {
    return null;
  }

  const stepIndex = playbook && existing && existing.playbookId === playbook.id
    ? existing.stepIndex || 0
    : 0;

  const playbookBlock = formatPlaybookForPrompt(playbook, { stepIndex });

  const messages = [
    { role: 'system', content: GUIDE_SYSTEM },
    {
      role: 'system',
      content: `Contexto: establishment_id=${estId}. Use a casa do seletor do chat como referência.\n\n${playbookBlock}`,
    },
  ];

  if (existing?.lastReply && existing.playbookId === playbook.id) {
    messages.push({
      role: 'assistant',
      content: existing.lastReply.slice(0, 600),
    });
  }

  messages.push({ role: 'user', content: text });

  const completion = await xaiClient.chatCompletion({
    messages,
    // Sem tools: economiza ~2k+ tokens do catálogo
  });

  const reply = String(completion.choices?.[0]?.message?.content || '')
    .trim()
    .slice(0, 2000);

  if (!reply) {
    return {
      ok: true,
      type: 'guide',
      reply: `Ainda não consigo fazer isso direto pelo chat, mas te guio. Abra ${playbook.route} com a casa certa e me diga quando estiver na tela.`,
      guide: { active: true, playbook_id: playbook.id, step_index: stepIndex },
      meta: getPhase1Meta(),
    };
  }

  const nextStep = inferNextStepIndex(reply, stepIndex, playbook.steps.length - 1);
  upsertGuideSession({
    userId,
    establishmentId: estId,
    playbookId: playbook.id,
    stepIndex: nextStep,
    lastReply: reply,
  });

  return {
    ok: true,
    type: 'guide',
    reply,
    guide: {
      active: true,
      playbook_id: playbook.id,
      title: playbook.title,
      route: playbook.route,
      step_index: nextStep,
    },
    meta: getPhase1Meta(),
  };
}

module.exports = {
  tryGuideTurn,
};
