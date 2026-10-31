const test = require('node:test');
const assert = require('node:assert/strict');
const { AgentPromptBuilder } = require('../../services/agent/AgentPromptBuilder');
const { sanitizeAssistantReply } = require('../../services/agent/agentService');
const { formatTrainingReply } = require('../../services/agent/trainingReplyFormatter');
const {
  loadFaqsMatchingFreeText,
  scoreFaqAgainstText,
  buildFaqGroundedSystemPrompt,
} = require('../../services/agent/faqPrefetchService');
const { pickCategory, buildFollowUpText } = require('../../services/agent/conversationFollowUpEngine');
const { isHouseOpenNow } = require('../../services/agent/reservationOperatingContext');

const builder = new AgentPromptBuilder();

const filledSettings = {
  is_active: false,
  assistant_name: 'Sol',
  gender: 'feminino',
  tone: 'amigavel',
  response_size: 'media',
  use_emojis: true,
  use_bullets: true,
  use_greeting: true,
  greet_when_already_greeted: false,
  slang_intensity: 'leve',
  slang_text: 'fechado, show',
  custom_rules: [
    'Nunca prometa mesa no palco',
    'Ofereça o link do cardápio quando pedirem drink',
    'Se falarem de aniversário, mencione o bolo da casa',
    'Quarta tem open bar só até 23h',
  ],
  behavior_config: {
    nao_informar_reservas: false,
    bloquear_visita_sem_reserva: true,
    chamar_humano_erro: true,
    mensagem_atendimento_humano: 'Já chamei alguém da equipe.',
  },
};

test('prompt usa identidade e regras mesmo com is_active=false', () => {
  const prompt = builder.buildStatic({
    assistantSettings: filledSettings,
    lockedEstablishmentId: 1,
    lockedEstablishmentName: 'Seu Justino',
  });
  assert.match(prompt, /Sol/);
  assert.match(prompt, /Nunca prometa mesa no palco/);
  assert.match(prompt, /Quarta tem open bar só até 23h/);
  assert.match(prompt, /Não confirme visita\/entrada sem reserva/);
  assert.match(prompt, /Já chamei alguém da equipe/);
  assert.match(prompt, /Pode usar listas\/bullets/);
});

test('sanitizeAssistantReply preserva bullets quando a casa pediu', () => {
  const listed = '- Dress code casual\n- Sem chinelo\n- Sem bermuda rasgada';
  const kept = sanitizeAssistantReply(listed, {
    toolTrace: [],
    workingState: {},
    assistantSettings: { use_bullets: true },
  });
  assert.match(kept.text, /Dress code casual/);
  assert.match(kept.text, /-/);

  const stripped = sanitizeAssistantReply(listed, {
    toolTrace: [],
    workingState: {},
    assistantSettings: { use_bullets: false },
  });
  assert.doesNotMatch(stripped.text, /^\s*-\s/m);
});

test('formatTrainingReply preserva bullets quando use_bullets=true', () => {
  const result = formatTrainingReply({
    answer: '- Sem chinelo\n- Sem bermuda rasgada',
    settings: { ...filledSettings, use_greeting: false, use_emojis: false },
    messageHistory: [{ role: 'user', content: 'dress?' }, { role: 'user', content: 'e chinelo?' }],
    options: { appendCta: false },
  });
  assert.match(result.text, /Sem chinelo/);
  assert.match(result.text, /-/);
});

test('FAQ grounded usa persona preenchida sem exigir is_active', () => {
  const prompt = buildFaqGroundedSystemPrompt({
    faqText: 'TREINAMENTO: valet na porta.',
    establishmentName: 'Seu Justino',
    settings: filledSettings,
  });
  assert.match(prompt, /Sol/);
  assert.match(prompt, /bullets curtos/);
});

test('FAQ da aba Informações casa por título livre', async () => {
  assert.ok(
    scoreFaqAgainstText(
      { topic: 'Valet na porta do Justino', answer: 'Tem valet o sábado inteiro.' },
      'tem valet aí?'
    ) >= 40
  );

  const pool = {
    async query() {
      return {
        rows: [
          {
            topic: 'Valet na porta do Justino',
            answer: 'Tem valet o sábado inteiro.',
            updated_at: new Date(),
          },
        ],
      };
    },
  };
  const entries = await loadFaqsMatchingFreeText(pool, 1, 'vocês têm valet?');
  assert.equal(entries.length, 1);
  assert.equal(entries[0].topic, 'Valet na porta do Justino');
});

test('follow-up de conversa usa a instrução da categoria preenchida', () => {
  const category = pickCategory('quero reservar mesa', {
    reservas: { enabled: true, instruction: 'Ainda tá aí? Fecho sua mesa agora.' },
  });
  assert.equal(category.key, 'reservas');
  assert.match(buildFollowUpText(category), /Fecho sua mesa agora/);
});

test('isHouseOpenNow não inventa horário quando a casa não tem grade', async () => {
  const pool = {
    async query() {
      return { rows: [] };
    },
  };
  assert.equal(await isHouseOpenNow(pool, 1, 'Seu Justino'), true);
});

test('isHouseOpenNow respeita o dia fechado cadastrado', async () => {
  const pool = {
    async query(_sql, params) {
      return {
        rows: [
          {
            weekday: 0,
            is_open: false,
            start_time: null,
            end_time: null,
            second_start_time: null,
            second_end_time: null,
          },
          {
            weekday: 1,
            is_open: false,
            start_time: null,
            end_time: null,
            second_start_time: null,
            second_end_time: null,
          },
          {
            weekday: 2,
            is_open: false,
            start_time: null,
            end_time: null,
            second_start_time: null,
            second_end_time: null,
          },
          {
            weekday: 3,
            is_open: false,
            start_time: null,
            end_time: null,
            second_start_time: null,
            second_end_time: null,
          },
          {
            weekday: 4,
            is_open: false,
            start_time: null,
            end_time: null,
            second_start_time: null,
            second_end_time: null,
          },
          {
            weekday: 5,
            is_open: false,
            start_time: null,
            end_time: null,
            second_start_time: null,
            second_end_time: null,
          },
          {
            weekday: 6,
            is_open: false,
            start_time: null,
            end_time: null,
            second_start_time: null,
            second_end_time: null,
          },
        ],
      };
    },
  };
  assert.equal(await isHouseOpenNow(pool, 1, 'Seu Justino'), false);
});
