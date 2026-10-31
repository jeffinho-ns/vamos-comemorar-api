const { AgentPromptBuilder } = require('../../services/agent/AgentPromptBuilder');
const { shouldOfferIceBreakers, appendIceBreakers } = require('../../services/agent/iceBreakerService');
const { scoreFaqAgainstText } = require('../../services/agent/faqPrefetchService');
const { pickCategory, buildFollowUpText } = require('../../services/agent/conversationFollowUpEngine');
const { looksLikeFakeReservationConfirmation } = require('../../services/agent/agentService');

const FILLED_SETTINGS = {
  is_active: false,
  assistant_name: 'Sol',
  gender: 'feminino',
  tone: 'amigavel',
  use_emojis: true,
  use_bullets: true,
  custom_rules: ['Nunca prometa mesa no palco', 'Quarta tem open bar só até 23h'],
  behavior_config: {
    bloquear_visita_sem_reserva: true,
    chamar_humano_erro: true,
    mensagem_atendimento_humano: 'Já chamei alguém da equipe da casa.',
  },
  ice_breakers_enabled: true,
  ice_breakers_channels: ['whatsapp'],
};

const IDENTITY = 'Ana Souza, ana@ex.com, 10/05/1990';

function buildHappyScenarios() {
  return [
    {
      id: 'close-pracinha',
      title: 'Fecha no Pracinha com funil curto + Balcão',
      turns: ['Quero reservar no Pracinha sábado 19h pra 4 pessoas', IDENTITY, 'Balcão'],
      expect: {
        action: 'would_create',
        wouldCreate: true,
        establishment_id: 8,
        reservation_time: '19:00',
        quantidade_convidados: 4,
      },
    },
    {
      id: 'close-justino',
      title: 'Fecha no Justino com coberta',
      turns: ['Quero reservar no Seu Justino sábado 20h pra 3 pessoas', IDENTITY, 'área coberta'],
      expect: { action: 'would_create', wouldCreate: true, establishment_id: 1 },
    },
    {
      id: 'close-highline',
      title: 'Fecha no Highline no Bar Central',
      turns: ['Quero reservar no Highline sábado 21h pra 2 pessoas', IDENTITY, 'Bar Central'],
      expect: { action: 'would_create', wouldCreate: true, establishment_id: 7 },
    },
    {
      id: 'close-with-settings',
      title: 'Fecha no Pracinha com as configs da atendente ligadas',
      settings: FILLED_SETTINGS,
      turns: ['Quero reservar no Pracinha sábado 19h pra 4 pessoas', IDENTITY, 'Praça'],
      expect: { action: 'would_create', wouldCreate: true, establishment_id: 8 },
    },
    {
      id: 'close-instagram',
      title: 'Fecha no Instagram depois de pedir o WhatsApp',
      initialState: { source_channel: 'instagram', wa_id: 'ig:17841400000000' },
      turns: [
        'Quero reservar no Pracinha sábado 19h pra 4 pessoas',
        'Ana Souza, ana@ex.com, 11987654321, 10/05/1990',
        'Balcão',
      ],
      expect: {
        action: 'would_create',
        wouldCreate: true,
        establishment_id: 8,
        field: { key: 'client_phone', value: '5511987654321' },
      },
    },
    {
      id: 'ig-asks-phone',
      title: 'Instagram sem WhatsApp não fecha a reserva',
      initialState: { source_channel: 'instagram', wa_id: 'ig:17841400000000' },
      turns: ['Quero reservar no Pracinha sábado 19h pra 4 pessoas', IDENTITY, 'Balcão'],
      expect: {
        action: 'collect',
        wouldCreate: false,
        missingIncludes: ['client_phone'],
        replyMatch: /WhatsApp/i,
      },
    },
    {
      id: 'cfg-no-reserve',
      title: 'Config: não informar reservas encaminha humano',
      settings: { behavior_config: { nao_informar_reservas: true } },
      turns: ['Quero reservar mesa para sábado'],
      expect: { action: 'handoff', reason: 'nao_informar_reservas', wouldCreate: false },
    },
    {
      id: 'cfg-visit',
      title: 'Config: visita sem reserva é bloqueada',
      settings: { behavior_config: { bloquear_visita_sem_reserva: true } },
      turns: ['Posso chegar sem reserva?'],
      expect: { action: 'reply', reason: 'bloquear_visita_sem_reserva', replyMatch: /reserva/i },
    },
    {
      id: 'cfg-after-hours',
      title: 'Config: fora de horário em silêncio',
      settings: { behavior_config: { fora_horario_comportamento: 'silencio' } },
      houseIsOpen: false,
      turns: ['Oi'],
      expect: { action: 'silence', reason: 'fora_horario_silencio' },
    },
    {
      id: 'cfg-persona',
      title: 'Config: prompt usa Sol e regras mesmo inativa',
      run: () => ({
        action: 'collect',
        reply: new AgentPromptBuilder().buildStatic({
          assistantSettings: FILLED_SETTINGS,
          lockedEstablishmentId: 8,
          lockedEstablishmentName: 'Pracinha',
        }),
        state: {},
      }),
      expect: { replyMatch: /Sol/, replyNotMatch: /is_active/ },
    },
    {
      id: 'cfg-ice',
      title: 'Config: quebra-gelo no primeiro oi',
      run: () => {
        const offer = shouldOfferIceBreakers({
          settings: FILLED_SETTINGS,
          userText: 'Oi, boa noite!',
          messageHistory: [{ role: 'user', content: 'Oi, boa noite!' }],
        });
        return {
          action: offer ? 'collect' : 'silence',
          reply: appendIceBreakers('Oi! Tudo bem?', [{ question: 'Você já conhece a casa?' }]),
          state: {},
        };
      },
      expect: { action: 'collect', replyMatch: /conhece a casa/ },
    },
    {
      id: 'cfg-faq',
      title: 'Config: FAQ da aba Informações casa por título livre',
      run: () => {
        const score = scoreFaqAgainstText(
          { topic: 'Valet na porta do Justino', answer: 'Tem valet o sábado inteiro.' },
          'tem valet aí?'
        );
        return { action: score >= 40 ? 'collect' : 'silence', reply: `score ${score}`, state: {} };
      },
      expect: { action: 'collect' },
    },
    {
      id: 'cfg-followup',
      title: 'Config: follow-up de conversa usa a instrução da casa',
      run: () => {
        const category = pickCategory('quero reservar mesa', {
          reservas: { enabled: true, instruction: 'Ainda tá aí? Fecho sua mesa agora.' },
        });
        return { action: 'collect', reply: buildFollowUpText(category), state: {} };
      },
      expect: { replyMatch: /Fecho sua mesa agora/ },
    },
    {
      id: 'cfg-fake-confirm-detect',
      title: 'Guard: confirmação falsa continua detectada com settings',
      run: () => {
        const fake = looksLikeFakeReservationConfirmation('Pronto, sua reserva está confirmada!');
        return { action: fake ? 'collect' : 'would_create', reply: 'ok', wouldCreate: !fake, state: {} };
      },
      expect: { wouldCreate: false },
    },
  ];
}

module.exports = { FILLED_SETTINGS, buildHappyScenarios };
