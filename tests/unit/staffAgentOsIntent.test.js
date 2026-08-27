'use strict';

/**
 * O colaborador pede OS de muitas formas. Estas frases vieram da operação —
 * ao mexer em detectOsIntent, elas precisam continuar passando.
 */

const assert = require('assert');
const { detectOsIntent } = require('../../services/staffAgent/staffAgentService');

const CRIAR = [
  'Crie uma nova OS na data de 29/08, o evento vai acontecer no dia 31/08, o nome do projeto é Justa2.0',
  'Cria uma OS de artista para sábado',
  'abre uma OS pro DJ Pedro',
  'Monta a ordem de serviço do show de sexta',
  'gerar OS da banda',
  'Cadastra uma nova O.S. para o dia 30/08',
  'preciso lançar a OS do evento de amanhã',
  'faz a OS da atração de sábado',
  'registrar OS nova',
  'emitir ordem de servico para 05/09',
  'preenche uma OS pra mim',
  'nova OS: Samba do Ivan, sexta, 18h às 2h',
];

const LISTAR = [
  'Quais OS temos cadastradas?',
  'tem OS para o dia 30/08?',
  'me mostra as OS',
  'confere se ja existe OS nessa data',
  'lista as ordens de servico',
];

// "os" como artigo não pode virar Ordem de Serviço.
const NAO_OS = [
  'Pausa os itens do cardapio',
  'quais os pratos mais vendidos?',
  'ativa os drinks',
  'bloqueia o dia 15/09',
  'quem esta na espera?',
  'os clientes chegaram',
];

for (const frase of CRIAR) {
  assert.equal(detectOsIntent(frase), 'criar_os_artista', `deveria criar OS: ${frase}`);
}

for (const frase of LISTAR) {
  assert.equal(detectOsIntent(frase), 'listar_os_artista', `deveria listar OS: ${frase}`);
}

for (const frase of NAO_OS) {
  assert.equal(detectOsIntent(frase), null, `não é OS: ${frase}`);
}

console.log('✅ staffAgentOsIntent: intenções de OS reconhecidas');
