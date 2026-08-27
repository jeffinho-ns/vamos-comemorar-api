'use strict';

/**
 * Frases reais de pedido de OS. O parser precisa montar a OS sem LLM —
 * é o caminho usado quando a Groq falha em chamar a função.
 */

const assert = require('assert');
const { parseOsFromText } = require('../../services/staffAgent/artistOSTextParser');

// Caso que quebrou em produção (400 Failed to call a function).
const frase =
  'Crie uma nova OS na data de 29/08 o evento vai acontecer no dia 31/08, o nome do projeto é Justa2.0 ' +
  'os horáros de funcionamento vai começar as 17:00 e vai terminar as 05:00 valores de entrada é de 20 reais ' +
  'mulheres e homens 50, na promoção diga que se levar 10 concidados vai ganhar uma garrafa de Gin142. ' +
  'Sem Briefing, sem parceria e não vai exibir nenhum jogo nesse dia na TV.';

const os = parseOsFromText(frase);
assert.ok(os, 'deveria extrair a OS da frase');
assert.equal(os.event_date, '31/08', 'evento é 31/08');
assert.equal(os.os_date, '29/08', 'OS emitida em 29/08');
assert.equal(os.project_name, 'Justa2.0');
assert.equal(os.working_hours, '17:00 às 05:00');
assert.ok(/20/.test(os.ticket_values) && /50/.test(os.ticket_values), 'valores de entrada');
assert.ok(/Gin142/.test(os.promotions), 'promoção');

// Uma data só: é a do evento, sem data de emissão separada.
const simples = parseOsFromText(
  'Cria uma OS para o dia 30/08, o nome do projeto é Samba do Ivan, funcionamento das 18h às 02h',
);
assert.ok(simples, 'deveria extrair a OS simples');
assert.equal(simples.event_date, '30/08');
assert.equal(simples.os_date, null);
assert.equal(simples.project_name, 'Samba do Ivan');
assert.equal(simples.working_hours, '18:00 às 02:00');

// Sem os obrigatórios, o parser não assume o turno — deixa o modelo conduzir.
assert.equal(parseOsFromText('Cria uma OS pra sexta'), null);
assert.equal(parseOsFromText('abre uma OS'), null);
assert.equal(parseOsFromText(''), null);

console.log('✅ staffAgentOsTextParser: OS extraída do texto');
