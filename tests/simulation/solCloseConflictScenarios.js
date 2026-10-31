const { resolveEstablishmentForTurn } = require('../../services/conversationEngine/helpers');
const { isCreatableAreaLabel } = require('../../services/agent/deterministicReservationClose');
const { sanitizeAssistantReply } = require('../../services/agent/agentService');
const { humanizeCreateError } = require('../../services/agent/reservationCreateError');
const { buildTimeoutFallbackReply } = require('../../services/agent/solTimeoutFallback');

const HOUSES = [
  { id: 1, name: 'Seu Justino' },
  { id: 7, name: 'Highline' },
  { id: 8, name: 'Pracinha do Seu Justino' },
  { id: 17, name: 'Apê Pracinha' },
];

function buildConflictScenarios() {
  return [
    {
      id: 'c1-two-houses',
      title: '1. Duas casas na mesma fala',
      turns: ['Quero reservar no Highline ou no Seu Justino sábado'],
      expect: { action: 'house_choice', wouldCreate: false, replyMatch: /qual das duas/i },
    },
    {
      id: 'c2-switch-house',
      title: '2. Trocar de casa no meio zera o slot',
      initialState: {
        establishment_id: 7,
        reservation_date: '2026-10-31',
        reservation_time: '21:00',
        quantidade_convidados: 2,
      },
      turns: ['Na verdade quero no Pracinha'],
      expect: { establishment_id: 8, reservation_time: undefined },
    },
    {
      id: 'c3-pracinha-lock',
      title: '3. “No Pracinha” trava a casa 8',
      turns: ['Quero mesa no Pracinha'],
      expect: { establishment_id: 8, wouldCreate: false },
    },
    {
      id: 'c4-conversation-house',
      title: '4. Casa da conversa vence last do contato',
      run: () => ({
        action: 'collect',
        state: {
          establishment_id: resolveEstablishmentForTurn({
            messageText: 'quero reservar mesa',
            messageHistory: [],
            establishments: HOUSES,
            lockedEstablishmentId: null,
            conversationEstablishmentId: 8,
            collectedFields: {},
          }),
        },
        reply: '',
      }),
      expect: { establishment_id: 8 },
    },
    {
      id: 'c5-friday-alone',
      title: '5. “Sexta” sozinha confirma data e pede horário',
      initialState: { establishment_id: 8 },
      turns: ['sexta'],
      expect: {
        missingIncludes: ['reservation_time'],
        missingExcludes: ['reservation_date'],
        replyMatch: /hor[aá]rio/i,
      },
    },
    {
      id: 'c6-change-day',
      title: '6. Dia novo substitui o anterior',
      initialState: { establishment_id: 8, reservation_date: '2026-10-30', reservation_time: '19:00' },
      turns: ['melhor no sábado 31/10'],
      expect: { reservation_date: '2026-10-31' },
    },
    {
      id: 'c7-birth-without-year',
      title: '7. “15/09” no nascimento não vira data da reserva',
      initialState: {
        establishment_id: 8,
        reservation_date: '2026-10-31',
        reservation_time: '19:00',
        quantidade_convidados: 4,
        client_name: 'Ana Souza',
        client_email: 'ana@ex.com',
      },
      seedHistory: [{ role: 'assistant', content: 'Qual seu nome, e-mail e data de nascimento?' }],
      turns: ['15/09'],
      expect: { reservation_date: '2026-10-31', missingIncludes: ['data_nascimento'] },
    },
    {
      id: 'c8-umas-19',
      title: '8. “Umas 19” grava 19:00',
      initialState: { establishment_id: 8, reservation_date: '2026-10-31' },
      turns: ['umas 19'],
      expect: { reservation_time: '19:00' },
    },
    {
      id: 'c9-change-time',
      title: '9. Horário novo substitui o antigo',
      initialState: { establishment_id: 8, reservation_date: '2026-10-31', reservation_time: '19:00' },
      turns: ['melhor às 21h'],
      expect: { reservation_time: '21:00' },
    },
    {
      id: 'c10-outside-hours',
      title: '10. Sexta 14h no Pracinha recusa e cita 17h',
      initialState: { establishment_id: 8 },
      turns: ['sexta 14h pra 4 pessoas'],
      expect: { action: 'slot_guard', reason: 'outside_hours', replyMatch: /17h/ },
    },
    {
      id: 'c11-closed-day',
      title: '11. Terça no Pracinha oferece outro dia',
      initialState: { establishment_id: 8 },
      turns: ['terça 19h pra 4 pessoas'],
      expect: { action: 'slot_guard', reason: 'closed_day', replyMatch: /fechad/i },
    },
    {
      id: 'c12-somos-7',
      title: '12. “Somos em 7” entra como grupo',
      initialState: { establishment_id: 8, reservation_date: '2026-10-31' },
      turns: ['somos em 7'],
      expect: { quantidade_convidados: 7 },
    },
    {
      id: 'c13-large-group',
      title: '13. Acima de 60 faz handoff',
      turns: ['Quero reservar no Pracinha sábado 19h pra 80 pessoas'],
      expect: { action: 'large_group_handoff', wouldCreate: false, replyMatch: /equipe|humano|grupo/i },
    },
    {
      id: 'c14-forbidden-area',
      title: '14. Nome proibido no Highline é sanitizado',
      run: () => ({
        action: 'collect',
        reply: sanitizeAssistantReply('Te coloquei no Terraço, pode ser?', {
          toolTrace: [],
          workingState: { establishment_id: 7, reservation_date: '2026-10-31', reservation_time: '21:00' },
          establishmentId: 7,
        }).text,
        state: { establishment_id: 7 },
      }),
      expect: { replyNotMatch: /Terraço/i },
    },
    {
      id: 'c15-highline-area-question',
      title: '15. Highline pede uma área, sem grade',
      initialState: {
        establishment_id: 7,
        reservation_date: '2026-10-31',
        reservation_time: '21:00',
        quantidade_convidados: 2,
      },
      turns: ['ok'],
      expect: { replyMatch: /[aá]rea/i, replyNotMatch: /17:00-04:00|18:00-04:00/ },
    },
    {
      id: 'c16-justino-zone',
      title: '16. Lounge no Justino fecha como coberta',
      initialState: {
        establishment_id: 1,
        reservation_date: '2026-10-31',
        reservation_time: '20:00',
        quantidade_convidados: 3,
        client_name: 'Ana Souza',
        client_email: 'ana@ex.com',
        data_nascimento: '1990-05-10',
      },
      turns: ['lounge'],
      expect: { wouldCreate: true, establishment_id: 1 },
    },
    {
      id: 'c17-pracinha-synonym',
      title: '17. Salão no Pracinha vira Balcão',
      initialState: {
        establishment_id: 8,
        reservation_date: '2026-10-31',
        reservation_time: '19:00',
        quantidade_convidados: 4,
        client_name: 'Ana Souza',
        client_email: 'ana@ex.com',
        data_nascimento: '1990-05-10',
      },
      turns: ['salão'],
      expect: { wouldCreate: true },
    },
    {
      id: 'c19-age-only',
      title: '19. Só a idade não fecha nascimento',
      initialState: {
        establishment_id: 8,
        reservation_date: '2026-10-31',
        reservation_time: '19:00',
        quantidade_convidados: 4,
        client_name: 'Ana Souza',
        client_email: 'ana@ex.com',
      },
      turns: ['tenho 25 anos'],
      expect: { wouldCreate: false, missingIncludes: ['data_nascimento'], replyMatch: /nascimento|dia|ano/i },
    },
    {
      id: 'c20-contact-birth',
      title: '20. Nascimento do contato pede confirmação',
      contact: { birth_date: '1990-05-10', contact_name: 'Ana Souza' },
      initialState: {
        establishment_id: 8,
        reservation_date: '2026-10-31',
        reservation_time: '19:00',
        quantidade_convidados: 4,
        client_email: 'ana@ex.com',
        area_label: 'Balcão',
      },
      turns: ['fechado'],
      expect: { replyMatch: /10\/05\/1990|nascimento/i, wouldCreate: false },
    },
    {
      id: 'c23-empty-area',
      title: '23. Área vazia/padrão não cria',
      run: () => {
        const wouldCreate = isCreatableAreaLabel('', 8) || isCreatableAreaLabel('padrão', 8);
        return {
          action: wouldCreate ? 'would_create' : 'collect',
          wouldCreate,
          reply: 'No Pracinha, prefere o Balcão ou a Praça?',
          state: { establishment_id: 8 },
        };
      },
      expect: { wouldCreate: false },
    },
    {
      id: 'c24-fake-confirm',
      title: '24. “Reserva confirmada” sem tool vira pergunta real',
      run: () => ({
        action: 'collect',
        wouldCreate: false,
        reply: sanitizeAssistantReply('Reserva confirmada para sábado às 19h.', {
          toolTrace: [],
          workingState: {
            establishment_id: 8,
            reservation_date: '2026-10-31',
            reservation_time: '19:00',
            quantidade_convidados: 4,
          },
        }).text,
        state: { establishment_id: 8 },
      }),
      expect: { replyMatch: /nome|e-mail|nascimento|Balc|Praça/i, replyNotMatch: /confirmada/i },
    },
    {
      id: 'c25-create-error',
      title: '25. Erro na criação pede só o que destrava',
      run: () => ({
        action: 'collect',
        reply: humanizeCreateError(
          { error: 'Informe a data de nascimento. Precisa ser maior de 18.' },
          { establishment_id: 8, reservation_date: '2026-10-31' }
        ).replyText,
        state: {},
      }),
      expect: { replyMatch: /nascimento/i },
    },
    {
      id: 'c26-second-create',
      title: '26. Depois de criada, chama a equipe',
      initialState: {
        establishment_id: 8,
        reservation_created: true,
        reservation_id: 99,
        reservation_date: '2026-10-31',
        reservation_time: '19:00',
        quantidade_convidados: 4,
      },
      turns: ['pode mudar para 6 pessoas?'],
      expect: { action: 'second_create_refused', replyMatch: /equipe/i },
    },
    {
      id: 'c27-list-sanitize',
      title: '27. Lista de horários vira prosa',
      run: () => ({
        action: 'collect',
        reply: sanitizeAssistantReply('- 17h\n- 18h\n- 19h\n- 20h', {
          toolTrace: [],
          workingState: { establishment_id: 8 },
        }).text,
        state: {},
      }),
      expect: { replyNotMatch: /^\s*-\s/m },
    },
    {
      id: 'c29-timeout',
      title: '29. Timeout devolve frase curta com o horário já dito',
      run: () => ({
        action: 'collect',
        reply: buildTimeoutFallbackReply({ reservation_time: '19:00', quantidade_convidados: 4 }, {}),
        state: {},
      }),
      expect: { replyMatch: /19h|19:00|hor[aá]rio/i },
    },
    {
      id: 'c30-short-funnel',
      title: '30. Funil curto pergunta data+hora+pessoas juntos',
      initialState: { establishment_id: 8 },
      turns: ['quero reservar'],
      expect: { replyMatch: /data/i },
    },
  ];
}

module.exports = { buildConflictScenarios };
