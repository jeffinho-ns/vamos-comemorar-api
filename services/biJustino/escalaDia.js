'use strict';

const SETORES = ['salao', 'cumim', 'bar', 'cozinha', 'limpeza', 'seguranca', 'caixa', 'runner', 'manutencao', 'estoquista'];
const CONTRATOS = ['CLT', 'INT', 'PJ'];
const NOMES = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

function horaSp(start) {
  const date = new Date(start);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date);
}

function dow(iso) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return 0;
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function hojeSp(agora) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(agora || new Date());
}

function diaHorario(dia) {
  const item = dia && typeof dia === 'object' ? dia : {};
  return {
    trabalha: Boolean(item.trabalha),
    entrada: String(item.entrada || '').slice(0, 5),
    saida: String(item.saida || '').slice(0, 5),
    almoco: String(item.almoco || '').slice(0, 20),
    jantar: String(item.jantar || '').slice(0, 20),
  };
}

function compactColaboradores(payload) {
  const items = payload && Array.isArray(payload.items) ? payload.items : [];
  return items.filter((item) => {
    if (!item || item.ativo === false || item.ativo === 'false') return false;
    const contrato = item.contratacao || 'CLT';
    return CONTRATOS.includes(contrato) && SETORES.includes(item.cargo);
  }).map((item) => {
    const semana = Array.isArray(item.horarioSemanal) && item.horarioSemanal.length === 7
      ? item.horarioSemanal
      : [0, 1, 2, 3, 4, 5, 6].map(() => ({}));
    return {
      id: String(item.id || '').slice(0, 40),
      nome: String(item.nome || '').slice(0, 80),
      cargo: item.cargo,
      cargoOutro: String(item.cargoOutro || '').slice(0, 40),
      funcaoCargo: String(item.funcaoCargo || '').slice(0, 40),
      nivel: String(item.nivel || 'pleno').slice(0, 20),
      contratacao: String(item.contratacao || 'CLT').slice(0, 8),
      horarioSemanal: semana.map(diaHorario),
      feriasInicio: String(item.feriasInicio || '').slice(0, 10),
      feriasFim: String(item.feriasFim || '').slice(0, 10),
    };
  });
}

function compactCalor(payload) {
  const items = payload && Array.isArray(payload.items) ? payload.items : [];
  const porData = {};
  items.forEach((item) => {
    const date = String(item && item.date || '').slice(0, 10);
    const clock = horaSp(item && item.start);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !clock) return;
    const dia = porData[date] || (porData[date] = {});
    dia[clock] = (dia[clock] || 0) + (Number(item.value) || 0);
  });
  const acc = NOMES.map(() => ({ n: 0, clocks: {} }));
  const fracaoPorData = {};
  Object.keys(porData).sort().forEach((date) => {
    const clocks = porData[date];
    const total = Object.values(clocks).reduce((soma, valor) => soma + valor, 0);
    if (!total) return;
    fracaoPorData[date] = Object.keys(clocks).sort().map((clock) => ({
      clock,
      fracao: clocks[clock] / total,
    }));
    const alvo = acc[dow(date)];
    alvo.n += 1;
    Object.keys(clocks).forEach((clock) => {
      alvo.clocks[clock] = (alvo.clocks[clock] || 0) + clocks[clock] / total;
    });
  });
  const datas = Object.keys(fracaoPorData);
  const recentes = new Set(datas.slice(-21));
  return {
    datas,
    recentes: datas.filter((date) => recentes.has(date)).map((date) => ({ date, blocos: fracaoPorData[date] })),
    porDia: NOMES.map((nome, indice) => ({
      nome,
      nDias: acc[indice].n,
      blocos: Object.keys(acc[indice].clocks).sort().map((clock) => ({
        clock,
        fracao: acc[indice].n ? acc[indice].clocks[clock] / acc[indice].n : 0,
      })),
    })),
  };
}

function compactReservas(payload) {
  const docs = payload && Array.isArray(payload.docs) ? payload.docs : [];
  return docs.map((doc) => ({
    date: String(doc && doc.date || '').slice(0, 10),
    pax: Number(doc && doc.pax) || 0,
  })).filter((doc) => /^\d{4}-\d{2}-\d{2}$/.test(doc.date) && doc.pax > 0).slice(0, 400);
}

function compactDiasZig(docs) {
  return (Array.isArray(docs) ? docs : []).map((doc) => ({
    date: String(doc && doc.date || '').slice(0, 10),
    publico: doc && doc.publico != null && doc.publico !== '' ? Number(doc.publico) : null,
    receita: Number(doc && doc.revenue) || 0,
  })).filter((doc) => /^\d{4}-\d{2}-\d{2}$/.test(doc.date) && (doc.receita || doc.publico));
}

function mediana(valores) {
  const lista = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(lista.length / 2);
  if (!lista.length) return null;
  return lista.length % 2 ? lista[meio] : (lista[meio - 1] + lista[meio]) / 2;
}

function fatorReserva(reservas, diasZig, hoje) {
  const limite = hoje || hojeSp();
  const publico = {};
  (diasZig || []).forEach((dia) => {
    if (dia && dia.date && Number(dia.publico) > 0) publico[dia.date] = Number(dia.publico);
  });
  const grupos = NOMES.map(() => []);
  (reservas || []).forEach((reserva) => {
    if (!reserva || reserva.date >= limite || !publico[reserva.date] || !(reserva.pax > 0)) return;
    grupos[dow(reserva.date)].push(publico[reserva.date] / reserva.pax);
  });
  return NOMES.map((nome, indice) => ({
    nome,
    fator: grupos[indice].length >= 3 ? mediana(grupos[indice]) : null,
    n: grupos[indice].length,
  }));
}

function itensRecentes(payload, quantidade) {
  const items = payload && Array.isArray(payload.items) ? payload.items : [];
  const datas = [...new Set(items.map((item) => String(item && item.date || '').slice(0, 10)).filter(Boolean))].sort();
  const corte = new Set(datas.slice(-quantidade));
  return { items: items.filter((item) => corte.has(String(item.date || '').slice(0, 10))) };
}

module.exports = {
  compactColaboradores,
  compactCalor,
  compactReservas,
  compactDiasZig,
  fatorReserva,
  itensRecentes,
  hojeSp,
};
