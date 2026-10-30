'use strict';

const express = require('express');
const { criarProxy } = require('../../services/biJustino/marketing/proxy');
const { validarReuniao, validarApagarReuniao } = require('../../services/biJustino/marketing/reunioes');
const { validarAtivacao, validarApagarAtivacao } = require('../../services/biJustino/marketing/instagram');
const { validarDecisao, validarSugestao, validarLote } = require('../../services/biJustino/marketing/avaliacoes');
const { validarRanking } = require('../../services/biJustino/marketing/bandas');
const { validarSnapshot99 } = require('../../services/biJustino/marketing/delivery');
const {
  validarFechamentoMes,
  validarDecisaoAuditoria,
  validarRespostaDuvida,
  validarNovaDuvida,
} = require('../../services/biJustino/marketing/diretoria');

/**
 * Rotas de escrita do BI Seu Justino — área Marketing (8 sub-abas) e página Diretoria.
 * Montadas em /api/bi (autenticação já vem do router pai). Cada rota é um proxy para a
 * ação de gravação do Apps Script via gravarNaPlanilha, e informa em `recoletar` as
 * chaves do catálogo que precisam ser recopiadas para o espelho depois da escrita.
 */
const ROTAS = [
  // Demandas, pautas e atas
  { caminho: '/justino/marketing/demandas', action: 'saveMkReuniao', validar: validarReuniao, recoletar: ['getMkReunioes'], extrair: (r) => ({ id: r.id }) },
  { caminho: '/justino/marketing/demandas/apagar', action: 'deleteMkReuniao', validar: validarApagarReuniao, recoletar: ['getMkReunioes', 'getDeletionsLog'] },
  // Instagram
  { caminho: '/justino/marketing/instagram/ativacao', action: 'saveIgAtivacao', validar: validarAtivacao, recoletar: ['getIgAtivacoes', 'getIgRetorno'], extrair: (r) => ({ id: r.id }) },
  { caminho: '/justino/marketing/instagram/ativacao/apagar', action: 'deleteIgAtivacao', validar: validarApagarAtivacao, recoletar: ['getIgAtivacoes', 'getIgRetorno', 'getDeletionsLog'] },
  { caminho: '/justino/marketing/instagram/atualizar', action: 'atualizarInstagram', recoletar: ['getInstagram', 'getIgRetorno'], extrair: (r) => ({ dia: r.dia, posts: r.posts, avisos: r.avisos }) },
  // Avaliações do Google
  { caminho: '/justino/marketing/avaliacoes/decidir', action: 'decidirGoogleAvaliacao', validar: validarDecisao, recoletar: ['getGoogleAvaliacoes'] },
  { caminho: '/justino/marketing/avaliacoes/sugerir', action: 'sugerirGoogleAvaliacao', validar: validarSugestao, recoletar: ['getGoogleAvaliacoes'], extrair: (r) => ({ sugestao: r.sugestao, origem: r.origem }) },
  { caminho: '/justino/marketing/avaliacoes/enviar', action: 'submitGoogleAvaliacoes', validar: validarLote, recoletar: ['getGoogleAvaliacoes'], extrair: (r) => ({ novas: r.novas, comSugestao: r.comSugestao, atualizadas: r.atualizadas }) },
  // Top bandas
  { caminho: '/justino/marketing/bandas/salvar', action: 'saveBandRanking', validar: validarRanking, recoletar: ['getBandRanking'], extrair: (r) => ({ count: r.count }) },
  { caminho: '/justino/marketing/bandas/atualizar', action: 'atualizarBandRanking', recoletar: ['getBandRanking'], extrair: (r) => ({ count: r.count, apresentacoes: r.apresentacoes, diasComReceita: r.diasComReceita }) },
  // Delivery • 99Food
  { caminho: '/justino/marketing/99food/enviar', action: 'submit99Food', validar: validarSnapshot99, recoletar: ['get99Food'] },
  // Fechar / reabrir mês (painel "Fechar mês • Marketing" e Diretoria)
  { caminho: '/justino/marketing/fechar-mes', action: 'closeMonth', validar: validarFechamentoMes, recoletar: ['getMonthClosures:marketing', 'getMonthClosures:financeiro', 'getMonthClosures:rh', 'getMonthClosures:operacao', 'getMonthClosures:cmv'] },
  { caminho: '/justino/marketing/reabrir-mes', action: 'reopenMonth', validar: validarFechamentoMes, recoletar: ['getMonthClosures:marketing', 'getMonthClosures:financeiro', 'getMonthClosures:rh', 'getMonthClosures:operacao', 'getMonthClosures:cmv'] },
  // Dúvidas do manual (quadro presente em Marketing e Diretoria)
  { caminho: '/justino/marketing/duvidas', action: 'submitDuvida', validar: validarNovaDuvida, recoletar: ['getDuvidas'], extrair: (r) => ({ id: r.id }) },
  { caminho: '/justino/marketing/duvidas/responder', action: 'responderDuvida', validar: validarRespostaDuvida, recoletar: ['getDuvidas'] },
  // Diretoria • aprovações pendentes da Auditoria Operacional
  { caminho: '/justino/diretoria/auditoria/aprovar', action: 'aprovarAuditoriaOpItem', validar: validarDecisaoAuditoria, recoletar: ['getAuditoriaOpItens'] },
  { caminho: '/justino/diretoria/auditoria/negar', action: 'negarAuditoriaOpItem', validar: validarDecisaoAuditoria, recoletar: ['getAuditoriaOpItens'] },
];

module.exports = (pool, deps) => {
  const router = express.Router();
  ROTAS.forEach((rota) => {
    router.post(rota.caminho, criarProxy(pool, rota, deps));
  });
  return router;
};

module.exports.ROTAS = ROTAS;
