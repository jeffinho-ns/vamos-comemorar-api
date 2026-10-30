'use strict';

/**
 * Validação dos envios por área da planilha do Seu Justino (ação `submitEntry` do Apps Script).
 * Mesmos campos numéricos do painel do Renato (AREA_NUM_FIELDS / AREA_NOTE_FIELDS no HTML).
 * Financeiro e RH são mensais (chave de upsert = dia 01 do mês); CMV é diário.
 */

const CAMPOS_NUMERICOS = {
  financeiro: ['fnTax', 'fnCard', 'fnFee', 'fnIncomeTax', 'fnRent', 'fnEnergy', 'fnWater', 'fnGas', 'fnDisposable', 'fnSecurity', 'fnAdminFixed', 'fnFinanceOther'],
  rh: ['rhCore', 'rhExtras', 'rhHead', 'rhServicoDesconto'],
  cmv: ['cmvSales', 'cmvFoodTheo', 'cmvFoodReal', 'cmvBevTheo', 'cmvBevReal', 'cmvFoodMix'],
};

const CAMPOS_TEXTO = {
  financeiro: [],
  rh: [],
  cmv: ['cmvNote'],
};

const AREAS_MENSAIS = new Set(['financeiro', 'rh']);
const AREAS_FECHAMENTO = new Set(['financeiro', 'rh', 'cmv']);
const LIMITE_NOME = 80;
const LIMITE_NOTA = 2000;
const LIMITE_DATAS = 62;

function ehArea(area) {
  return Object.prototype.hasOwnProperty.call(CAMPOS_NUMERICOS, area);
}

function textoLimpo(valor, limite) {
  const limpo = String(valor == null ? '' : valor).replace(/\s+/g, ' ').trim();
  return limpo.slice(0, limite);
}

/** Aceita número ou texto em formato brasileiro ("1.234,56"); devolve null quando não é número. */
function numeroBr(valor) {
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : null;
  if (typeof valor !== 'string') return valor == null ? 0 : null;
  const bruto = valor.trim();
  if (!bruto) return 0;
  const semMoeda = bruto.replace(/[R$\s]/g, '');
  const normal = semMoeda.includes(',') ? semMoeda.replace(/\./g, '').replace(',', '.') : semMoeda;
  const n = Number(normal);
  return Number.isFinite(n) ? n : null;
}

/**
 * Normaliza a data do envio: `AAAA-MM` vira dia 01 nas áreas mensais (mesma convenção do submitEntry do HTML);
 * áreas diárias exigem `AAAA-MM-DD`.
 */
function normalizarData(area, bruto) {
  const texto = String(bruto || '').trim();
  if (AREAS_MENSAIS.has(area)) {
    if (/^\d{4}-\d{2}$/.test(texto)) return `${texto}-01`;
    if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) return `${texto.slice(0, 7)}-01`;
    return null;
  }
  return /^\d{4}-\d{2}-\d{2}$/.test(texto) ? texto : null;
}

/**
 * Valida o corpo de um envio e devolve o payload pronto para o Apps Script.
 * @returns {{ ok: true, payload: object } | { ok: false, error: string }}
 */
function validarEnvio(area, corpo) {
  if (!ehArea(area)) return { ok: false, error: 'area_invalida' };
  const fonte = corpo && typeof corpo === 'object' ? corpo : {};
  const date = normalizarData(area, fonte.date);
  if (!date) return { ok: false, error: 'data_invalida' };
  const valoresFonte = fonte.values && typeof fonte.values === 'object' ? fonte.values : {};
  const values = {};
  for (const campo of CAMPOS_NUMERICOS[area]) {
    if (valoresFonte[campo] === undefined) {
      values[campo] = 0;
      continue;
    }
    const n = numeroBr(valoresFonte[campo]);
    if (n === null) return { ok: false, error: `valor_invalido:${campo}` };
    values[campo] = n;
  }
  const notasFonte = fonte.notes && typeof fonte.notes === 'object' ? fonte.notes : {};
  const notes = {};
  for (const campo of CAMPOS_TEXTO[area]) notes[campo] = textoLimpo(notasFonte[campo], LIMITE_NOTA);
  const submittedByName = textoLimpo(fonte.submittedByName, LIMITE_NOME);
  const temAlgumValor = Object.values(values).some((v) => v !== 0);
  if (!temAlgumValor) return { ok: false, error: 'registro_em_branco' };
  return { ok: true, payload: { area, date, values, notes, submittedByName } };
}

/** Lista de datas para apagar (`deleteEntry` é por área + data). */
function validarApagar(area, corpo) {
  if (!ehArea(area)) return { ok: false, error: 'area_invalida' };
  const fonte = corpo && typeof corpo === 'object' ? corpo : {};
  const lista = Array.isArray(fonte.dates) ? fonte.dates : (fonte.date ? [fonte.date] : []);
  const datas = Array.from(new Set(lista.map((d) => String(d || '').trim()).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))));
  if (!datas.length) return { ok: false, error: 'datas_ausentes' };
  if (datas.length > LIMITE_DATAS) return { ok: false, error: 'datas_demais' };
  return { ok: true, datas };
}

/** Fechar/reabrir mês (`closeMonth` / `reopenMonth`). */
function validarFechamento(area, corpo) {
  if (!AREAS_FECHAMENTO.has(area)) return { ok: false, error: 'area_invalida' };
  const fonte = corpo && typeof corpo === 'object' ? corpo : {};
  const monthKey = String(fonte.monthKey || '').trim().slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(monthKey)) return { ok: false, error: 'mes_invalido' };
  const mes = Number(monthKey.slice(5, 7));
  if (mes < 1 || mes > 12) return { ok: false, error: 'mes_invalido' };
  const acao = fonte.acao === 'reabrir' ? 'reopenMonth' : fonte.acao === 'fechar' ? 'closeMonth' : null;
  if (!acao) return { ok: false, error: 'acao_invalida' };
  return { ok: true, action: acao, payload: { area, monthKey } };
}

module.exports = {
  CAMPOS_NUMERICOS,
  CAMPOS_TEXTO,
  numeroBr,
  normalizarData,
  validarEnvio,
  validarApagar,
  validarFechamento,
};
