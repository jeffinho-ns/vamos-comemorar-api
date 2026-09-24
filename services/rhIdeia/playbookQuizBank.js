'use strict';

const { PASSING_SCORE } = require('./playbookRoles');

/**
 * Prova do capítulo 39. O índice correto não sai neste módulo para a tela:
 * a rota de perguntas usa publicQuestions().
 */
const QUIZ_BANK = [
  { slug: 'q1', prompt: 'Em que dia da semana a casa não abre?', options: ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira'], correct: 1 },
  { slug: 'q2', prompt: 'Que horas a casa abre e fecha no sábado?', options: ['18h às 1h', '12h às 21h', '14h às 5h', '14h às 1h'], correct: 2 },
  { slug: 'q3', prompt: 'No domingo, o que tem na casa e até que horas o buffet é servido?', options: ['Feijoada até 17h', 'Música ao vivo até 1h', 'Casa fechada', 'Almoço até 15h sem buffet'], correct: 0 },
  { slug: 'q4', prompt: 'Qual o valor do couvert artístico de terça a quinta?', options: ['R$ 10', 'R$ 20 por pessoa', 'R$ 30 por pessoa', 'Não cobra'], correct: 1 },
  { slug: 'q5', prompt: 'Qual o valor do couvert no domingo?', options: ['R$ 20', 'R$ 30 por pessoa', 'Incluso na feijoada', 'R$ 15'], correct: 1 },
  { slug: 'q6', prompt: 'Quando a casa chega no limite de lotação, a portaria faz o quê?', options: ['Continua vendendo', 'Fecha a entrada e libera 1 para cada 1 que sai', 'Chama a polícia', 'O garçom decide'], correct: 1 },
  { slug: 'q7', prompt: 'Menor de idade pode entrar?', options: ['Não', 'Sim, sozinho até 22h', 'Sim, com responsável legal, termo assinado, até 23h, sem álcool', 'Sim, com álcool se o responsável autorizar'], correct: 2 },
  { slug: 'q8', prompt: 'Qual é a taxa de serviço?', options: ['10% obrigatória', '13% sobre o consumo; o cliente pode pedir para retirar', '15%', 'Não cobra'], correct: 1 },
  { slug: 'q9', prompt: 'O cliente perdeu o cartão de consumo. O que a casa cobra?', options: ['Multa fixa', 'O valor real no Zig, sem multa', 'O valor máximo do cartão', 'Nada'], correct: 1 },
  { slug: 'q10', prompt: 'Quem abre a casa e quem fecha?', options: ['Gerente abre e fecha', 'Chefe de Fila abre; Gerente fecha', 'Caixa abre; Segurança fecha', 'Qualquer líder'], correct: 1 },
  { slug: 'q11', prompt: 'Quem pode autorizar cortesia, desconto ou cancelamento?', options: ['Chefe de Fila', 'Caixa', 'Somente o Gerente', 'Bartender'], correct: 2 },
  { slug: 'q12', prompt: 'Em quanto tempo o cliente que chega na porta deve ser recebido?', options: ['1 minuto', '30 segundos', '3 minutos', '5 minutos'], correct: 1 },
  { slug: 'q13', prompt: 'Em quanto tempo a primeira bebida deve chegar à mesa?', options: ['1 minuto', '3 minutos', '10 minutos', '15 minutos'], correct: 1 },
  { slug: 'q14', prompt: 'Depois de servir o prato, em quanto tempo você volta para checar?', options: ['2 minutos', '10 minutos', 'Quando o cliente chamar', 'No fechamento'], correct: 0 },
  { slug: 'q15', prompt: 'Qual é o uniforme completo da casa?', options: ['Camiseta preta e tênis', 'Polo da casa, calça marrom, avental e sapato fechado antiderrapante', 'Avental só no salão', 'Livre, desde que escuro'], correct: 1 },
  { slug: 'q16', prompt: 'Qual destes momentos exige lavar as mãos?', options: ['Só no início do turno', 'Ao chegar, depois do banheiro e antes de tocar em alimento', 'Só na cozinha', 'Só se o gerente pedir'], correct: 1 },
  { slug: 'q17', prompt: 'Pode usar celular em área de cliente?', options: ['Sim, no bolso', 'Não. Fica no armário o turno inteiro', 'Só para foto do prato', 'Só o gerente proíbe'], correct: 1 },
  { slug: 'q18', prompt: 'O prato passou de 15 minutos do tempo combinado. O que você faz?', options: ['Oferece desconto', 'Chama o Chefe de Fila e informa o cliente com o tempo real', 'Leva o prato de volta em silêncio', 'Pede desculpas e encerra a conta'], correct: 1 },
  { slug: 'q19', prompt: 'O que fazer quando um cliente bebeu demais?', options: ['Continuar servindo devagar', 'Parar o álcool, avisar o Gerente, oferecer água, comida e transporte', 'Pedir para sair na hora', 'Confrontar na mesa'], correct: 1 },
  { slug: 'q20', prompt: 'Quem é o líder de quem trabalha no salão?', options: ['Chefe de Bar', 'Chefe de Fila', 'Caixa', 'Hostess'], correct: 1 },
];

function publicQuestions(rows) {
  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    sort_order: row.sort_order,
    prompt: row.prompt,
    options: row.options,
  }));
}

function gradeAttempt(bank, submitted) {
  const bySlug = new Map((submitted || []).map((item) => [item.slug, Number(item.option)]));
  let score = 0;
  bank.forEach((question) => {
    if (bySlug.get(question.slug) === question.correct) score += 1;
  });
  return {
    score,
    total: bank.length,
    passed: score >= PASSING_SCORE,
  };
}

module.exports = {
  QUIZ_BANK,
  publicQuestions,
  gradeAttempt,
};
