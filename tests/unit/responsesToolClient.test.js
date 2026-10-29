'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  modelRequiresResponsesForTools,
  normalizeReasoningEffort,
  chatMessagesToResponsesInput,
  toResponsesToolChoice,
  responsesOutputToAssistantMessage,
  usageFromResponses,
} = require('../../services/agent/responsesToolClient');

test('gpt-6.1-sol usa Responses para tools; gpt-5.5 continua no Chat Completions', () => {
  assert.equal(modelRequiresResponsesForTools('gpt-6.1-sol'), true);
  assert.equal(modelRequiresResponsesForTools('gpt-6.1-terra'), true);
  assert.equal(modelRequiresResponsesForTools('gpt-5.5'), false);
  assert.equal(modelRequiresResponsesForTools('gpt-6-luna'), false);
});

test('reasoning none da Sol vira low', () => {
  assert.equal(normalizeReasoningEffort('none'), 'low');
  assert.equal(normalizeReasoningEffort('medium'), 'medium');
  assert.equal(normalizeReasoningEffort(''), 'low');
});

test('histórico de tool vira function_call e function_call_output', () => {
  const { instructions, input } = chatMessagesToResponsesInput([
    { role: 'system', content: 'Seja concierge.' },
    { role: 'user', content: 'Quero reservar sexta.' },
    {
      role: 'assistant',
      content: null,
      tool_calls: [
        {
          id: 'call_1',
          function: { name: 'verificar_disponibilidade', arguments: '{"data":"2026-10-30"}' },
        },
      ],
    },
    { role: 'tool', tool_call_id: 'call_1', content: '{"ok":true}' },
  ]);

  assert.equal(instructions, 'Seja concierge.');
  assert.equal(input[0].role, 'user');
  assert.equal(input[1].type, 'function_call');
  assert.equal(input[1].call_id, 'call_1');
  assert.equal(input[2].type, 'function_call_output');
  assert.equal(toResponsesToolChoice({ type: 'function', function: { name: 'criar_pre_reserva' } }).name, 'criar_pre_reserva');
});

test('saída da Responses volta ao formato do loop de tools', () => {
  const message = responsesOutputToAssistantMessage({
    output_text: '',
    output: [
      { type: 'reasoning', id: 'rs_1' },
      {
        type: 'function_call',
        call_id: 'call_9',
        name: 'criar_pre_reserva',
        arguments: '{"horario":"20:00"}',
      },
    ],
  });
  assert.equal(message.tool_calls[0].id, 'call_9');
  assert.equal(message.tool_calls[0].function.name, 'criar_pre_reserva');
  assert.equal(message.responses_output.length, 2);

  const usage = usageFromResponses({ input_tokens: 100, output_tokens: 20, total_tokens: 120 });
  assert.equal(usage.prompt_tokens, 100);
  assert.equal(usage.completion_tokens, 20);
});
