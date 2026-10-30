'use strict';

const { texto, dataIso, idSimples, enumDe } = require('./validacao');

// Mesmas listas do Apps Script (saveMkReuniao_): tipo, status e prioridade.
const TIPOS = ['demanda', 'pauta', 'ata'];
const STATUS = ['aberto', 'andamento', 'concluido', 'cancelado'];
const PRIORIDADES = ['alta', 'media', 'baixa'];

/**
 * Valida o corpo de saveMkReuniao (Demandas, pautas e atas do Marketing).
 * @returns {{ erro: string } | { payload: object }}
 */
function validarReuniao(entrada) {
  const fonte = entrada || {};
  const titulo = texto(fonte.titulo, 200);
  if (!titulo) return { erro: 'titulo_obrigatorio' };
  if (fonte.id != null && fonte.id !== '' && !idSimples(fonte.id)) return { erro: 'id_invalido' };
  const dataReuniao = fonte.dataReuniao ? dataIso(fonte.dataReuniao) : '';
  if (fonte.dataReuniao && !dataReuniao) return { erro: 'data_invalida' };
  const prazo = fonte.prazo ? dataIso(fonte.prazo) : '';
  if (fonte.prazo && !prazo) return { erro: 'prazo_invalido' };
  const tipo = enumDe(fonte.tipo, TIPOS, 'demanda');
  const ehDemanda = tipo === 'demanda';
  const reuniaoId = ehDemanda && fonte.reuniaoId ? idSimples(fonte.reuniaoId) : '';
  if (ehDemanda && fonte.reuniaoId && !reuniaoId) return { erro: 'reuniao_invalida' };
  return {
    payload: {
      ...(fonte.id ? { id: String(fonte.id) } : {}),
      tipo,
      titulo,
      descricao: texto(fonte.descricao, 2000),
      dataReuniao: dataReuniao || '',
      participantes: ehDemanda ? '' : texto(fonte.participantes, 500),
      decisoes: tipo === 'ata' ? texto(fonte.decisoes, 3000) : '',
      responsavel: texto(fonte.responsavel, 120),
      prazo: prazo || '',
      prioridade: enumDe(fonte.prioridade, PRIORIDADES, 'media'),
      status: enumDe(fonte.status, STATUS, 'aberto'),
      reuniaoId: reuniaoId || '',
      observacao: texto(fonte.observacao, 1000),
    },
  };
}

function validarApagarReuniao(entrada) {
  const id = idSimples((entrada || {}).id);
  if (!id) return { erro: 'id_invalido' };
  return { payload: { id } };
}

module.exports = {
  TIPOS,
  STATUS,
  PRIORIDADES,
  validarReuniao,
  validarApagarReuniao,
};
