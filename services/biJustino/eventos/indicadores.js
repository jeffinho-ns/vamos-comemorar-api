'use strict';

/**
 * Indicadores de Eventos — MESMA conta de computeEventosIndicadores() do painel do Renato
 * (BI_Gerencial_Seu_Justino_v2.html). Mantido aqui para testes e para quem precisar do número
 * no servidor; o front repete a conta em TypeScript (eventos/indicadores.ts).
 */

function contratoAssinado(ev) {
  return /assinado/i.test(String((ev && ev.statusContrato) || ''));
}

function pagamentoValidado(ev) {
  const txt = String((ev && ev.statusPagamento) || '').toLowerCase();
  if (!txt) return false;
  if (/n[ãa]o|pendente|aguardando|falta|parcial/.test(txt)) return false;
  return /pago|confirmado|quitado|recebid|liquidad|\bok\b/.test(txt);
}

function pagamentoDuvidoso(ev) {
  if (contratoAssinado(ev)) return false;
  return /parcial/i.test(String((ev && ev.statusPagamento) || ''));
}

function valorBruto(ev) {
  const viaContrato = (Number(ev.valorContrato) || 0) + (Number(ev.valorExcedente) || 0);
  return viaContrato > 0 ? viaContrato : (Number(ev.valorTotal) || 0);
}

function valorSistema(ev) {
  if (!contratoAssinado(ev) && !pagamentoValidado(ev)) return 0;
  return valorBruto(ev);
}

function soma(lista, fn) {
  return lista.reduce((s, item) => s + fn(item), 0);
}

/**
 * @param {object[]} eventos itens de getEventos
 * @param {object[]} cotacoes itens de getEventoCotacoes
 * @param {string} hojeIso AAAA-MM-DD (fuso de São Paulo)
 */
function calcularIndicadores(eventos, cotacoes, hojeIso) {
  const evs = Array.isArray(eventos) ? eventos : [];
  const cots = Array.isArray(cotacoes) ? cotacoes : [];
  const anoAtual = Number(hojeIso.slice(0, 4));
  const mesAtualKey = hojeIso.slice(0, 7);
  const anoAnterior = anoAtual - 1;
  const mesAnoAnteriorKey = `${anoAnterior}-${hojeIso.slice(5, 7)}`;
  const cutoffAnoAnterior = `${anoAnterior}${hojeIso.slice(4)}`;

  const realizados = evs.filter((ev) => ev.status === 'realizado' && ev.data);
  const emAndamento = cots.filter((c) => ['rascunho', 'aguardando_aprovacao', 'aprovado'].includes(c.status));
  const realizadosMes = realizados.filter((ev) => String(ev.data).slice(0, 7) === mesAtualKey);
  const duvidosos = realizados.filter(pagamentoDuvidoso);

  return {
    emAndamentoCount: emAndamento.length,
    emAndamentoValor: soma(emAndamento, (c) => Number(c.valorTotal) || 0),
    realizadosMesCount: realizadosMes.length,
    realizadosMesValor: soma(realizadosMes, valorSistema),
    fatMesAtual: soma(realizadosMes, valorSistema),
    fatMesAnoAnterior: soma(realizados.filter((ev) => String(ev.data).slice(0, 7) === mesAnoAnteriorKey), valorSistema),
    fatAnoAtual: soma(realizados.filter((ev) => String(ev.data).slice(0, 4) === String(anoAtual) && ev.data <= hojeIso), valorSistema),
    fatAnoAnterior: soma(realizados.filter((ev) => String(ev.data).slice(0, 4) === String(anoAnterior) && ev.data <= cutoffAnoAnterior), valorSistema),
    cotEnviadasAnoAtual: cots.filter((c) => c.status === 'enviado' && c.dataEvento && String(c.dataEvento).slice(0, 4) === String(anoAtual)).length,
    cotEnviadasAnoAnterior: cots.filter((c) => c.status === 'enviado' && c.dataEvento && String(c.dataEvento).slice(0, 4) === String(anoAnterior)).length,
    duvidosos,
    duvidososValor: soma(duvidosos, valorBruto),
    mesAtualKey,
    anoAtual,
    anoAnterior,
  };
}

/** Faturamento de eventos realizados por mês — 12 meses seguidos terminando no mês de `hojeIso`. */
function faturamentoPorMes(eventos, hojeIso) {
  const somas = {};
  (Array.isArray(eventos) ? eventos : []).filter((ev) => ev.status === 'realizado' && ev.data).forEach((ev) => {
    const mk = String(ev.data).slice(0, 7);
    somas[mk] = (somas[mk] || 0) + valorSistema(ev);
  });
  const ano = Number(hojeIso.slice(0, 4));
  const mes = Number(hojeIso.slice(5, 7));
  const meses = [];
  for (let i = 11; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(ano, mes - 1 - i, 1));
    meses.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return meses.map((mk) => ({ mes: mk, valor: somas[mk] || 0 }));
}

module.exports = {
  contratoAssinado,
  pagamentoValidado,
  pagamentoDuvidoso,
  valorBruto,
  valorSistema,
  calcularIndicadores,
  faturamentoPorMes,
};
