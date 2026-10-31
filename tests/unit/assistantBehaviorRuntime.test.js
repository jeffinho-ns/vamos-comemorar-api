const test = require('node:test');
const assert = require('node:assert/strict');
const {
  evaluateAssistantBehavior,
  shouldSendStickers,
  shouldIgnoreInstagramComments,
  inactivityLimitMinutes,
} = require('../../services/agent/assistantBehaviorRuntime');

function settings(behavior_config) {
  return { behavior_config };
}

test('evaluateAssistantBehavior encaminha no erro quando a flag está ligada', () => {
  const result = evaluateAssistantBehavior({
    settings: settings({
      chamar_humano_erro: true,
      mensagem_atendimento_humano: 'Já chamei a equipe da casa.',
    }),
    errorCode: 'AGENT_RUNTIME_ERROR',
  });
  assert.equal(result.action, 'handoff');
  assert.equal(result.reason, 'chamar_humano_erro');
  assert.match(result.replyText, /equipe da casa/);
});

test('evaluateAssistantBehavior silencia fora do horário', () => {
  const result = evaluateAssistantBehavior({
    settings: settings({ fora_horario_comportamento: 'silencio' }),
    userText: 'Oi',
    houseIsOpen: false,
  });
  assert.equal(result.action, 'silence');
  assert.equal(result.reason, 'fora_horario_silencio');
});

test('evaluateAssistantBehavior não reserva quando a casa pediu para não informar', () => {
  const result = evaluateAssistantBehavior({
    settings: settings({ nao_informar_reservas: true }),
    userText: 'Quero reservar mesa para sábado',
  });
  assert.equal(result.action, 'handoff');
  assert.equal(result.reason, 'nao_informar_reservas');
});

test('evaluateAssistantBehavior bloqueia visita sem reserva', () => {
  const result = evaluateAssistantBehavior({
    settings: settings({ bloquear_visita_sem_reserva: true }),
    userText: 'Posso chegar sem reserva?',
  });
  assert.equal(result.action, 'reply');
  assert.equal(result.reason, 'bloquear_visita_sem_reserva');
  assert.match(result.replyText, /data/i);
});

test('shouldSendStickers só desliga com false explícito', () => {
  assert.equal(shouldSendStickers(null), true);
  assert.equal(shouldSendStickers(settings({})), true);
  assert.equal(shouldSendStickers(settings({ considerar_figurinhas: false })), false);
});

test('shouldIgnoreInstagramComments e inatividade leem o que a atendente preencheu', () => {
  assert.equal(shouldIgnoreInstagramComments(settings({ ignorar_comentarios_instagram: true })), true);
  assert.equal(inactivityLimitMinutes(settings({ tempo_limite_inatividade: 45 })), 45);
  assert.equal(inactivityLimitMinutes(settings({})), 0);
});
