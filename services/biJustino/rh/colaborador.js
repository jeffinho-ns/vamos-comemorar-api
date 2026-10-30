'use strict';

/**
 * Validação da ficha de colaborador (ação `saveEmployee` / `deleteEmployee` do Apps Script).
 * Campos e opções iguais ao formulário "Novo colaborador" do painel do Renato.
 */

const { numeroBr } = require('../financeiro/envioMensal');

const SETORES = ['salao', 'cumim', 'bar', 'cozinha', 'limpeza', 'seguranca', 'caixa', 'runner', 'manutencao', 'estoquista'];
const CARGOS = [...SETORES, 'outro'];
const NIVEIS = ['junior', 'pleno', 'senior'];
const CONTRATACOES = ['CLT', 'INT', 'PJ'];
const FUNCOES = ['', 'chefeBar', 'subchefeBar', 'auxiliarBar', 'chefeCozinha', 'subchefeCozinha', 'auxiliarCozinha', 'chefeCaixa', 'maitre', 'chefeFila', 'gerente'];
const TIPOS_DESLIGAMENTO = ['', 'pedidoDemissao', 'demissaoSemJustaCausa', 'demissaoJustaCausa', 'acordo'];
const CAMPOS_NUMERICOS = ['salario', 'adSalarial', 'horasExtras', 'adicionalNoturno', 'fgts', 'inss', 'irrf', 'salarioFamilia', 'quebra', 'vt', 'vr', 'ferias', 'decimoTerceiro', 'beneficios', 'valorTotal'];

const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;
const RE_MES = /^\d{4}-\d{2}$/;
const RE_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

function texto(valor, limite) {
  return String(valor == null ? '' : valor).replace(/\s+/g, ' ').trim().slice(0, limite);
}

function dataOuVazio(valor) {
  const t = String(valor || '').trim();
  if (!t) return '';
  return RE_DATA.test(t) ? t : null;
}

function horaOuVazio(valor) {
  const t = String(valor || '').trim();
  if (!t) return '';
  return RE_HORA.test(t) ? t : null;
}

function escolha(valor, opcoes, padrao) {
  const t = String(valor == null ? padrao : valor);
  return opcoes.includes(t) ? t : null;
}

/** Horário padrão da semana: 7 dias (dom→sáb), cada um com trabalha/entrada/saida/almoco/jantar. */
function validarHorarioSemanal(lista) {
  const dias = Array.isArray(lista) && lista.length === 7 ? lista : null;
  if (!dias) return [0, 1, 2, 3, 4, 5, 6].map(() => ({ trabalha: false, entrada: '', saida: '', almoco: '', jantar: '' }));
  const saida = [];
  for (const dia of dias) {
    const d = dia && typeof dia === 'object' ? dia : {};
    const entrada = horaOuVazio(d.entrada);
    const fim = horaOuVazio(d.saida);
    if (entrada === null || fim === null) return null;
    saida.push({
      trabalha: d.trabalha === true,
      entrada,
      saida: fim,
      almoco: texto(d.almoco, 30),
      jantar: texto(d.jantar, 30),
    });
  }
  return saida;
}

/**
 * @returns {{ ok: true, payload: object } | { ok: false, error: string }}
 */
function validarColaborador(corpo) {
  const f = corpo && typeof corpo === 'object' ? corpo : {};
  const nome = texto(f.nome, 120);
  if (!nome) return { ok: false, error: 'nome_obrigatorio' };
  const cargo = escolha(f.cargo, CARGOS, 'outro');
  const nivel = escolha(f.nivel, NIVEIS, 'pleno');
  const contratacao = escolha(f.contratacao, CONTRATACOES, 'CLT');
  const funcaoCargo = escolha(f.funcaoCargo, FUNCOES, '');
  const tipoDesligamento = escolha(f.tipoDesligamento, TIPOS_DESLIGAMENTO, '');
  if (!cargo) return { ok: false, error: 'cargo_invalido' };
  if (!nivel) return { ok: false, error: 'nivel_invalido' };
  if (!contratacao) return { ok: false, error: 'contratacao_invalida' };
  if (funcaoCargo === null) return { ok: false, error: 'funcao_invalida' };
  if (tipoDesligamento === null) return { ok: false, error: 'tipo_desligamento_invalido' };

  const mesReferencia = String(f.mesReferencia || '').trim().slice(0, 7);
  if (mesReferencia && !RE_MES.test(mesReferencia)) return { ok: false, error: 'mes_invalido' };

  const datas = {};
  for (const campo of ['feriasInicio', 'feriasFim', 'dataAdmissao', 'dataDesligamento']) {
    const d = dataOuVazio(f[campo]);
    if (d === null) return { ok: false, error: `data_invalida:${campo}` };
    datas[campo] = d;
  }
  if (datas.feriasInicio && datas.feriasFim && datas.feriasFim < datas.feriasInicio) return { ok: false, error: 'ferias_invertidas' };
  if ((datas.feriasInicio && !datas.feriasFim) || (!datas.feriasInicio && datas.feriasFim)) return { ok: false, error: 'ferias_incompletas' };

  const numeros = {};
  for (const campo of CAMPOS_NUMERICOS) {
    const n = f[campo] === undefined ? 0 : numeroBr(f[campo]);
    if (n === null || n < 0) return { ok: false, error: `valor_invalido:${campo}` };
    numeros[campo] = n;
  }
  const valorRescisao = f.valorRescisao === undefined ? 0 : numeroBr(f.valorRescisao);
  if (valorRescisao === null || valorRescisao < 0) return { ok: false, error: 'valor_invalido:valorRescisao' };

  const horarioSemanal = validarHorarioSemanal(f.horarioSemanal);
  if (!horarioSemanal) return { ok: false, error: 'horario_invalido' };

  const id = texto(f.id, 80);
  const payload = {
    ...(id ? { id } : {}),
    nome,
    cargo,
    cargoOutro: texto(f.cargoOutro, 80),
    funcaoCargo,
    nivel,
    contratacao,
    mesReferencia,
    ativo: f.ativo !== false && f.ativo !== 'false' && f.ativo !== 0,
    horarioSemanal,
    ...datas,
    tipoDesligamento,
    desligamentoObs: texto(f.desligamentoObs, 1000),
    valorRescisao,
    ...numeros,
  };
  return { ok: true, payload };
}

function validarApagarColaborador(corpo) {
  const f = corpo && typeof corpo === 'object' ? corpo : {};
  const id = texto(f.id, 80);
  if (!id) return { ok: false, error: 'id_ausente' };
  return { ok: true, payload: { id } };
}

module.exports = {
  SETORES,
  CARGOS,
  NIVEIS,
  CONTRATACOES,
  FUNCOES,
  CAMPOS_NUMERICOS,
  validarHorarioSemanal,
  validarColaborador,
  validarApagarColaborador,
};
