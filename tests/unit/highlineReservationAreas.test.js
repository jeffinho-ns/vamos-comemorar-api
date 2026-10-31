const test = require('node:test');
const assert = require('node:assert/strict');

process.env.HIGHLINE_ESTABLISHMENT_ID = process.env.HIGHLINE_ESTABLISHMENT_ID || '7';

const {
  getHighlineSubareas,
  resolveHighlineSubarea,
  isHighlineEstablishment,
  HIGHLINE_ESTABLISHMENT_ID,
  evaluateHighlineSubareaFromCache,
  pickCombinedTablesForArea,
  resolveHighlineSubareaLabelForTable,
  suggestHighlineAreaForSlot,
} = require('../../services/agent/highlineReservationAreas');
const {
  synthesizeAvailabilityFromToolResult,
  synthesizeReplyFromToolTrace,
} = require('../../services/agent/agentService');

const DECK_TABLES = [
  { table_number: '01', capacity: 8 },
  { table_number: '02', capacity: 8 },
  { table_number: '03', capacity: 8 },
  { table_number: '04', capacity: 8 },
  { table_number: '09', capacity: 6 },
  { table_number: '10', capacity: 6 },
  { table_number: '11', capacity: 6 },
  { table_number: '12', capacity: 6 },
  { table_number: '13', capacity: 2 },
  { table_number: '14', capacity: 2 },
  { table_number: '15', capacity: 2 },
  { table_number: '16', capacity: 2 },
  { table_number: '17', capacity: 2 },
];

function buildDeckCache(reserved = []) {
  const tablesByArea = new Map([[2, DECK_TABLES.map((t) => ({ ...t, area_id: 2 }))]]);
  const reservedByArea = new Map([[2, new Set(reserved.map(String))]]);
  return { tablesByArea, reservedByArea };
}

test('Highline tem subáreas do painel novo', () => {
  const areas = getHighlineSubareas();
  assert.ok(areas.length >= 11);
  assert.ok(areas.some((a) => a.label === 'Deck - Mesas'));
  assert.ok(areas.some((a) => a.label === 'Bar Central - Bistrôs de Espera'));
  assert.ok(areas.some((a) => a.label === 'Rooftop - Lounges'));
  assert.ok(areas.some((a) => a.label === 'Rotativo - Lista de Espera'));
});

test('resolveHighlineSubarea reconhece labels novos e aliases antigos', () => {
  const sub = resolveHighlineSubarea('Rooftop - Bistrôs');
  assert.ok(sub);
  assert.equal(sub.key, 'roof-bistros');
  assert.equal(sub.area_id, 5);

  const legacy = resolveHighlineSubarea('deck-frente');
  assert.ok(legacy);
  assert.equal(legacy.key, 'deck-mesas');

  const bar = resolveHighlineSubarea('Bar Central');
  assert.ok(bar);
  assert.equal(bar.key, 'bar-central');
});

test('isHighlineEstablishment usa id configurado', () => {
  assert.equal(isHighlineEstablishment(HIGHLINE_ESTABLISHMENT_ID), true);
  assert.equal(isHighlineEstablishment(1), false);
});

test('label por mesa distingue Deck vs Rotativo com area_id', () => {
  assert.equal(resolveHighlineSubareaLabelForTable('01'), 'Deck - Mesas');
  assert.equal(resolveHighlineSubareaLabelForTable('01', 7001), 'Rotativo - Bistrôs de Espera');
  assert.equal(resolveHighlineSubareaLabelForTable('15'), 'Bar Central - Bistrôs de Espera');
  assert.equal(resolveHighlineSubareaLabelForTable('L01', 7001), 'Rotativo - Lista de Espera');
});

test('grupo 50 combina mesas em toda area_id 2 (Deck/Bar/Balada)', () => {
  const subarea = resolveHighlineSubarea('deck-mesas');
  const { tablesByArea, reservedByArea } = buildDeckCache();

  const combo = pickCombinedTablesForArea(tablesByArea, reservedByArea, 2, 50);
  assert.ok(combo);
  assert.ok(combo.total_capacity >= 50);

  const evaluation = evaluateHighlineSubareaFromCache(
    subarea,
    50,
    tablesByArea,
    reservedByArea
  );
  assert.equal(evaluation.tem_mesa_para_grupo, true);
  assert.equal(evaluation.mesa_sugerida.escopo_combinacao, 'area');
  assert.ok(evaluation.mesa_sugerida.capacity >= 50);
});

test('grupo 8 ainda cabe numa mesa única do Deck sem combinar', () => {
  const subarea = resolveHighlineSubarea('deck-mesas');
  const { tablesByArea, reservedByArea } = buildDeckCache();

  const evaluation = evaluateHighlineSubareaFromCache(
    subarea,
    8,
    tablesByArea,
    reservedByArea
  );
  assert.equal(evaluation.tem_mesa_para_grupo, true);
  assert.equal(evaluation.mesa_sugerida.mesas_combinadas, false);
  assert.equal(evaluation.mesa_sugerida.table_number, '01');
});

test('bistrô de espera rotativo respeita máximo de 4 pessoas', () => {
  const subarea = resolveHighlineSubarea('rotativo-espera');
  assert.equal(subarea.maxParty, 4);
  assert.equal(subarea.opsNote.includes('4 pessoas'), true);
});

test('resolveHighlineSubarea prioriza Mesas Redondas sobre Deck - Mesas', () => {
  const redondas = resolveHighlineSubarea('Deck - Mesas Redondas');
  assert.ok(redondas);
  assert.equal(redondas.key, 'deck-redondas');

  const short = resolveHighlineSubarea('Eu quero Mesas Redondas e vai ser para 5 pessoas.');
  assert.ok(short);
  assert.equal(short.key, 'deck-redondas');

  const plain = resolveHighlineSubarea('Deck - Mesas');
  assert.ok(plain);
  assert.equal(plain.key, 'deck-mesas');
});

test('mesas 02/03 ocupadas não são sugeridas no Deck - Mesas', () => {
  const subarea = resolveHighlineSubarea('deck-mesas');
  const { tablesByArea, reservedByArea } = buildDeckCache(['02', '03']);

  const evaluation = evaluateHighlineSubareaFromCache(
    subarea,
    5,
    tablesByArea,
    reservedByArea
  );
  assert.equal(evaluation.tem_mesa_para_grupo, true);
  assert.ok(evaluation.mesa_sugerida);
  assert.notEqual(evaluation.mesa_sugerida.table_number, '02');
  assert.notEqual(evaluation.mesa_sugerida.table_number, '03');
  assert.equal(evaluation.mesa_sugerida.table_number, '01');
});

test('Mesas Redondas sugere mesa da subárea correta (09+)', () => {
  const subarea = resolveHighlineSubarea('Deck - Mesas Redondas');
  const { tablesByArea, reservedByArea } = buildDeckCache(['02', '03']);

  const evaluation = evaluateHighlineSubareaFromCache(
    subarea,
    5,
    tablesByArea,
    reservedByArea
  );
  assert.equal(evaluation.tem_mesa_para_grupo, true);
  assert.ok(['09', '10', '11', '12'].includes(String(evaluation.mesa_sugerida.table_number)));
});

test('timesOverlapHHmm detecta janela de 2h', () => {
  const { timesOverlapHHmm } = require('../../services/agent/highlineReservationAreas');
  assert.equal(timesOverlapHHmm('19:00', '19:00'), true);
  assert.equal(timesOverlapHHmm('19:00', '20:30'), true);
  assert.equal(timesOverlapHHmm('19:00', '21:00'), false);
});

test('resolveHighlineSubarea traduz Terraço e Área VIP para labels válidos', () => {
  const terraco = resolveHighlineSubarea('Terraço');
  assert.ok(terraco);
  assert.equal(terraco.key, 'roof-mesas');
  assert.equal(terraco.area_id, 5);
  assert.equal(terraco.label, 'Rooftop - Mesas');

  const vip = resolveHighlineSubarea('Área VIP');
  assert.ok(vip);
  assert.equal(vip.key, 'balada-camarotes');
  assert.match(vip.label, /Camarotes/i);
});

test('sanitizeForbiddenAreaNames troca só o nome inválido e mantém horário e pessoas', () => {
  const {
    sanitizeForbiddenAreaNames,
    hasUsefulReservationProse,
  } = require('../../services/agent/reservationAreaSanitize');

  const sanitized = sanitizeForbiddenAreaNames(
    'Sexta às 21h, 6 pessoas no Terraço tem vaga',
    7
  );
  assert.match(sanitized, /21h/);
  assert.match(sanitized, /6 pessoas/);
  assert.doesNotMatch(sanitized, /terra[cç]o/i);
  assert.match(sanitized, /Rooftop/i);
  assert.equal(hasUsefulReservationProse(sanitized), true);

  const balcao = sanitizeForbiddenAreaNames('confirmo no Balcão às 20:00 para 4 pessoas', 7);
  assert.doesNotMatch(balcao, /balc[aã]o/i);
  assert.match(balcao, /Deck - Mesas/);
  assert.match(balcao, /20:00/);
  assert.match(balcao, /4 pessoas/);

  const areaVip = sanitizeForbiddenAreaNames('Área VIP às 22h para 8 pessoas', 7);
  assert.doesNotMatch(areaVip, /[áa]rea vip/i);
  assert.match(areaVip, /Camarotes/i);
  assert.match(areaVip, /22h/);
});

test('sanitizeForbiddenAreaNames no Pracinha não apaga Balcão', () => {
  const { sanitizeForbiddenAreaNames } = require('../../services/agent/reservationAreaSanitize');
  const text = sanitizeForbiddenAreaNames('Prefiro o Balcão às 19h, 5 pessoas', 8);
  assert.match(text, /Balcão/);
  assert.match(text, /19h/);
  assert.match(text, /5 pessoas/);
});

test('suggestHighlineAreaForSlot sugere UMA área no horário e UMA pergunta', () => {
  const snapshot = {
    ok: true,
    area_recomendada: { label: 'Deck - Mesas' },
    areas_com_vaga_labels: [
      'Deck - Mesas',
      'Deck - Mesas Redondas',
      'Bar Central - Bistrôs de Espera',
    ],
    quantidade_pessoas: 6,
  };
  const suggestion = suggestHighlineAreaForSlot({
    snapshot,
    horario: '21:00',
    partySize: 6,
  });
  assert.ok(suggestion);
  assert.equal(suggestion.label, 'Deck - Mesas');
  assert.equal(
    suggestion.question,
    'No Highline, às 21h para 6 pessoas, combina o Deck - Mesas. Pode ser?'
  );
  assert.equal((suggestion.question.match(/\?/g) || []).length, 1);
  assert.doesNotMatch(suggestion.question, /Redondas|Bar Central|14:00|23:30/);
  assert.doesNotMatch(suggestion.question, /[\n*`#]|^\s*[-•]/);
});

test('suggestHighlineAreaForSlot devolve null sem vaga', () => {
  assert.equal(
    suggestHighlineAreaForSlot({
      snapshot: { todas_areas_cheias: true, area_recomendada: null },
      horario: '21:00',
      partySize: 6,
    }),
    null
  );
  assert.equal(suggestHighlineAreaForSlot({ snapshot: null, horario: '21:00' }), null);
});

test('mensagem de área Highline não lista grade nem outras áreas', () => {
  const reply = synthesizeReplyFromToolTrace([
    {
      name: 'consultar_areas_mesa_reserva',
      result: {
        ok: true,
        reservation_date: '2026-11-06',
        quantidade_pessoas: 6,
        horario_consultado: '21:00',
        area_recomendada: { label: 'Deck - Mesas' },
        areas_com_vaga_labels: [
          'Deck - Mesas',
          'Deck - Mesas Redondas',
          'Bar Central - Bistrôs de Espera',
        ],
      },
    },
  ]);
  assert.match(reply, /Deck - Mesas/);
  assert.match(reply, /21h/);
  assert.match(reply, /6 pessoas/);
  assert.doesNotMatch(reply, /Redondas|Bar Central|Qual dessas|14:00-23:30/);
  assert.doesNotMatch(reply, /[\n*`#]/);
});

test('synthesizeAvailabilityFromToolResult não despeja grade 14:00-23:30', () => {
  const withSlot = synthesizeAvailabilityFromToolResult({
    ok: true,
    reservation_date: '2026-10-30',
    is_open: true,
    horario_consultado: '21:00',
    windows: [{ label: '14:00-23:30' }],
    quantidade_pessoas: 6,
    capacidade: { pode_reservar: true },
  });
  assert.match(withSlot, /21:00/);
  assert.doesNotMatch(withSlot, /14:00-23:30/);

  const onlyRange = synthesizeAvailabilityFromToolResult({
    ok: true,
    reservation_date: '2026-10-30',
    is_open: true,
    windows: [{ label: '14:00-23:30' }],
    capacidade: { pode_reservar: true },
  });
  assert.doesNotMatch(onlyRange, /14:00-23:30/);
  assert.match(onlyRange, /horário/i);
});
