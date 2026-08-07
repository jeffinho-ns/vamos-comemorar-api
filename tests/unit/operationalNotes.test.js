const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildNotesFromReservationArgs,
  buildNotesFromWaitlistArgs,
} = require('../../services/agent/operationalNotes');

test('notes de reserva inclui área pedida e observações do agente', () => {
  const notes = buildNotesFromReservationArgs(
    {
      area: 'Deck - Mesas',
      quantidade_pessoas: 4,
      horario: '20:00',
      observacoes: 'Cliente comemora aniversário; pediu mesa perto do bar',
    },
    { area_confirmada: 'Deck - Mesas', mesa: '01' }
  );
  assert.match(notes, /Deck - Mesas/);
  assert.match(notes, /4 pessoas/);
  assert.match(notes, /aniversário/);
  assert.match(notes, /Mesa: 01/);
});

test('notes de lista de espera registra área desejada', () => {
  const notes = buildNotesFromWaitlistArgs(
    {
      area_preferida: 'Rooftop - Lounges',
      quantidade_pessoas: 6,
      observacoes: 'Aceita outra área se liberar antes',
    },
    { area_resolvida: 'Rooftop - Lounges' }
  );
  assert.match(notes, /Cliente quer: Rooftop - Lounges/);
  assert.match(notes, /lista de espera/i);
  assert.match(notes, /Aceita outra área/);
});
