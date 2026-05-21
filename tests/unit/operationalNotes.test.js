const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildNotesFromReservationArgs,
  buildNotesFromWaitlistArgs,
} = require('../../services/agent/operationalNotes');

test('notes de reserva inclui área pedida e observações do agente', () => {
  const notes = buildNotesFromReservationArgs(
    {
      area: 'Área Deck - Frente',
      quantidade_pessoas: 4,
      horario: '20:00',
      observacoes: 'Cliente comemora aniversário; pediu mesa perto do bar',
    },
    { area_confirmada: 'Área Deck - Frente', mesa: '05' }
  );
  assert.match(notes, /Área Deck - Frente/);
  assert.match(notes, /4 pessoas/);
  assert.match(notes, /aniversário/);
  assert.match(notes, /Mesa: 05/);
});

test('notes de lista de espera registra área desejada', () => {
  const notes = buildNotesFromWaitlistArgs(
    {
      area_preferida: 'Área Rooftop - Vista',
      quantidade_pessoas: 6,
      observacoes: 'Aceita outra área se liberar antes',
    },
    { area_resolvida: 'Área Rooftop - Vista' }
  );
  assert.match(notes, /Cliente quer: Área Rooftop - Vista/);
  assert.match(notes, /lista de espera/i);
  assert.match(notes, /Aceita outra área/);
});
