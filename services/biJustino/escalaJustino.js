'use strict';

const CAPACIDADE = 380;
const PERMANENCIA_H = 3.9;
const SETORES = ['salao', 'cumim', 'bar', 'cozinha', 'limpeza', 'seguranca', 'caixa', 'runner', 'manutencao', 'estoquista'];
const SO_MANUAL = ['manutencao', 'estoquista', 'runner'];
const ROTULO = {
  salao: 'Garçom',
  cumim: 'Cumim',
  bar: 'Bar',
  cozinha: 'Cozinha',
  limpeza: 'Limpeza',
  seguranca: 'Segurança',
  caixa: 'Caixa/Hostess',
  runner: 'Runner/RP',
  manutencao: 'Manutenção',
  estoquista: 'Estoquista',
};
const PAGAMENTO = { 8: 125, 9: 135, 10: 145, 11: 155, 12: 165 };
const HORARIO = {
  0: { abre: 12, fecha: 21, texto: 'Feijoada em buffet livre. Roda de samba 360º.' },
  1: null,
  2: { abre: 18, fecha: 25, texto: 'Noite. Som ambiente.' },
  3: { abre: 18, fecha: 25, texto: 'Noite. Música ao vivo.' },
  4: { abre: 18, fecha: 25, texto: 'Noite. Música ao vivo.' },
  5: { abre: 18, fecha: 27, texto: 'Noite longa. Casa cheia, entrada por faixa de público. Palco 360º.' },
  6: { abre: 14, fecha: 29, texto: 'O dia mais longo da casa. Abre à tarde e emenda na noite. Palco 360º.' },
};
const NOMES = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const BASE = {
  salao: { atendimentoPorPessoa: 45, clt: 4, brigadaPadrao: 4 },
  cumim: { atendimentoPorPessoa: 90, clt: 2, brigadaPadrao: 1 },
  bar: { atendimentoPorPessoa: 80, clt: 2, brigadaPadrao: 4 },
  cozinha: { atendimentoPorPessoa: 60, clt: 4, brigadaPadrao: 4 },
  limpeza: { atendimentoPorPessoa: 250, clt: 0, brigadaPadrao: 1 },
  seguranca: { atendimentoPorPessoa: 75, clt: 0, brigadaPadrao: 1 },
  caixa: { atendimentoPorPessoa: 110, clt: 2, brigadaPadrao: 2 },
  runner: { atendimentoPorPessoa: 300, clt: 0, brigadaPadrao: 1 },
  manutencao: { atendimentoPorPessoa: 400, clt: 0, brigadaPadrao: 1 },
  estoquista: { atendimentoPorPessoa: 400, clt: 0, brigadaPadrao: 1 },
};

function hojeIso(agora) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(agora || new Date());
}

function deslocar(iso, dias) {
  const [ano, mes, dia] = iso.split('-').map(Number);
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  data.setUTCDate(data.getUTCDate() + dias);
  return data.toISOString().slice(0, 10);
}

function diaSemana(iso) {
  const [ano, mes, dia] = iso.split('-').map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay();
}

function horaCasa(abre, fecha) {
  return `${abre}h`;
}

function fimCasa(fecha) {
  return `${fecha % 24}h`;
}

function tabelaHorario() {
  return [1, 2, 3, 4, 5, 6, 0].map((wd) => {
    const casa = HORARIO[wd];
    if (!casa) {
      return { dia: NOMES[wd], fechado: true, abre: null, fecha: null, duracao: null, texto: 'FECHADO — só manutenção e entregas programadas' };
    }
    return {
      dia: NOMES[wd],
      fechado: false,
      abre: horaCasa(casa.abre),
      fecha: fimCasa(casa.fecha),
      duracao: `${casa.fecha - casa.abre}h`,
      texto: casa.texto,
    };
  });
}

function baseDoSetor(sectorBase, setor) {
  const vindo = sectorBase && sectorBase[setor] ? sectorBase[setor] : {};
  const reserva = BASE[setor] || { atendimentoPorPessoa: 1, clt: 0, brigadaPadrao: 0 };
  return {
    atendimentoPorPessoa: Number(vindo.atendimentoPorPessoa) || reserva.atendimentoPorPessoa,
    clt: Number(vindo.clt) || 0,
    int: Number(vindo.int) || 0,
    pj: Number(vindo.pj) || 0,
    brigadaPadrao: vindo.brigadaPadrao != null ? Number(vindo.brigadaPadrao) || 0 : reserva.brigadaPadrao,
    limiteBrigada: Number(vindo.limiteBrigada) || 0,
    referencia: !sectorBase || !sectorBase[setor],
  };
}

function fracaoDoDia(pontos) {
  const mapa = {};
  let total = 0;
  (pontos || []).forEach((ponto) => {
    const valor = Number(ponto.valor) || 0;
    if (valor <= 0 || !ponto.hora) return;
    const [hora, minuto] = String(ponto.hora).split(':').map(Number);
    if (!Number.isFinite(hora)) return;
    let off = hora * 60 + (minuto >= 30 ? 30 : 0);
    if (hora < 6) off += 1440;
    mapa[off] = (mapa[off] || 0) + valor;
    total += valor;
  });
  if (total <= 0) return null;
  const frac = {};
  Object.keys(mapa).forEach((chave) => {
    frac[chave] = mapa[chave] / total;
  });
  return frac;
}

function planejarTurnos(need, largura) {
  const n = need.length;
  if (!n) return [];
  const w = Math.max(1, Math.min(largura, n));
  const resto = need.slice();
  const contagem = {};
  let guarda = 0;
  while (resto.some((valor) => valor > 0) && guarda < 300) {
    guarda += 1;
    let melhor = 0;
    let soma = -1;
    for (let i = 0; i + w <= n; i += 1) {
      let parcial = 0;
      for (let k = 0; k < w; k += 1) parcial += resto[i + k];
      if (parcial > soma) {
        soma = parcial;
        melhor = i;
      }
    }
    for (let k = 0; k < w; k += 1) resto[melhor + k] = Math.max(0, resto[melhor + k] - 1);
    contagem[melhor] = (contagem[melhor] || 0) + 1;
  }
  return Object.keys(contagem).map(Number).sort((a, b) => a - b).map((i) => ({ i, tam: w, qtd: contagem[i] }));
}

function distribuir(gap, largura, qtd) {
  const n = gap.length;
  if (!n || qtd <= 0) return [];
  const w = Math.max(1, Math.min(largura, n));
  const resto = gap.slice();
  const pessoas = [];
  for (let q = 0; q < qtd; q += 1) {
    let melhor = 0;
    let soma = -1;
    for (let i = 0; i + w <= n; i += 1) {
      let parcial = 0;
      for (let k = 0; k < w; k += 1) parcial += resto[i + k];
      if (parcial > soma) {
        soma = parcial;
        melhor = i;
      }
    }
    for (let k = 0; k < w; k += 1) resto[melhor + k] = Math.max(0, resto[melhor + k] - 1);
    pessoas.push({ i: melhor, tam: w });
  }
  return pessoas;
}

function melhorTurno(gap) {
  const n = gap.length;
  let melhor = null;
  [8, 9, 10, 11, 12].forEach((horas) => {
    const w = Math.min(horas * 2, n);
    const qtd = planejarTurnos(gap, w).reduce((total, turno) => total + turno.qtd, 0);
    if (!qtd) return;
    const janela = distribuir(gap, w, qtd);
    let sobra = 0;
    for (let i = 0; i < n; i += 1) {
      const cobre = janela.filter((pessoa) => i >= pessoa.i && i < pessoa.i + pessoa.tam).length;
      sobra += Math.max(0, cobre - gap[i]);
    }
    const custo = qtd * PAGAMENTO[horas];
    const score = custo + (15 * sobra) / 2;
    if (!melhor || score < melhor.score) melhor = { horas, qtd, custo, score };
  });
  return melhor || { horas: 8, qtd: 0, custo: 0, score: 0 };
}

function necessidade(date, setor, frac, pax, base) {
  const casa = HORARIO[diaSemana(date)];
  if (!casa) return null;
  const atend = base.atendimentoPorPessoa || 1;
  const brigada = base.brigadaPadrao || 0;
  const tetoCozinha = setor === 'cozinha' ? 5 : null;
  const limite = base.limiteBrigada > 0
    ? (tetoCozinha != null ? Math.min(tetoCozinha, base.limiteBrigada) : base.limiteBrigada)
    : tetoCozinha;
  const blocos = [];
  for (let off = casa.abre * 60 - 60; off < casa.fecha * 60; off += 30) {
    blocos.push({ off, aberto: off >= casa.abre * 60, v: frac ? frac[off] || 0 : 0 });
  }
  const picoMovimento = Math.max(0, ...blocos.map((bloco) => bloco.v));
  if (!frac || picoMovimento <= 0) {
    return { necessario: Math.ceil(pax / atend), brigada, semCurva: true, blocos: [] };
  }
  const presentes = Math.min(CAPACIDADE, pax);
  blocos.forEach((bloco) => {
    const relativo = bloco.v / picoMovimento;
    const calculado = bloco.aberto ? Math.ceil((presentes * relativo) / atend) : 0;
    const fator = Math.max(0.25, Math.min(1, relativo / 0.6));
    const piso = brigada > 0 ? Math.max(1, Math.round(brigada * fator)) : 0;
    let gente = Math.max(calculado, piso);
    if (limite != null) gente = Math.min(gente, limite);
    bloco.need = gente;
  });
  return {
    necessario: Math.max(0, ...blocos.map((bloco) => bloco.need || 0)),
    brigada,
    semCurva: false,
    blocos,
    limite,
  };
}

function publicoDoDia(porDiaSemana, nome) {
  const dia = (porDiaSemana || []).find((item) => item && item.nome === nome);
  const medio = dia && Number(dia.publicoMedio);
  return Number.isFinite(medio) && medio > 0 ? Math.round(medio) : 0;
}

function curvaDoNome(horario, nome) {
  const pontos = horario && horario.porDia && horario.porDia[nome];
  return fracaoDoDia(pontos && pontos.length ? pontos : horario && horario.pontos);
}

function setorDoDia(date, setor, frac, pax, sectorBase) {
  const base = baseDoSetor(sectorBase, setor);
  const fixa = base.clt + base.int + base.pj || (base.referencia ? (BASE[setor] && BASE[setor].clt) || 0 : 0);
  const conta = necessidade(date, setor, frac, pax, base);
  if (!conta) return null;
  const manual = SO_MANUAL.includes(setor);
  let sugerido = 0;
  let turno = 8;
  if (!manual && conta.blocos.length) {
    const falta = conta.blocos.map((bloco) => Math.max(0, (bloco.need || 0) - fixa));
    const escolha = melhorTurno(falta);
    sugerido = escolha.qtd;
    turno = escolha.horas;
  } else if (!manual) {
    sugerido = Math.max(0, Math.max(conta.necessario, conta.brigada) - fixa);
  }
  const limite = base.limiteBrigada > 0 ? base.limiteBrigada : (setor === 'cozinha' ? 5 : null);
  return {
    chave: setor,
    label: ROTULO[setor],
    brigada: conta.brigada,
    limite,
    necessario: conta.necessario,
    fixa,
    sugerido,
    turno,
    custo: sugerido * (PAGAMENTO[turno] || 0),
    manual,
    referencia: base.referencia,
  };
}

function faturamentoSemana(semanas) {
  const fechadas = (semanas || []).filter((semana) => semana && Number(semana.faturamento) > 0).slice(0, 4);
  if (!fechadas.length) return null;
  return fechadas.reduce((total, semana) => total + Number(semana.faturamento), 0) / fechadas.length;
}

function montarEscala(entrada) {
  const fonte = entrada || {};
  const hoje = fonte.hoje || hojeIso();
  const segunda = deslocar(hoje, -((diaSemana(hoje) + 6) % 7));
  const dias = [];
  for (let i = 0; i < 7; i += 1) {
    const date = deslocar(segunda, i);
    const wd = diaSemana(date);
    const casa = HORARIO[wd];
    if (!casa) {
      dias.push({ date, dia: NOMES[wd], fechado: true, pax: 0, fonte: 'Casa fechada', presentesPico: 0, setores: [] });
      continue;
    }
    const pax = publicoDoDia(fonte.porDiaSemana, NOMES[wd]);
    const frac = curvaDoNome(fonte.horario, NOMES[wd]);
    const setores = SETORES.map((setor) => setorDoDia(date, setor, frac, pax, fonte.sectorBase)).filter(Boolean);
    dias.push({
      date,
      dia: NOMES[wd],
      fechado: false,
      pax,
      fonte: pax ? `média histórica de ${NOMES[wd].toLowerCase()}` : 'ainda sem público desse dia da semana',
      presentesPico: Math.min(CAPACIDADE, pax),
      abre: horaCasa(casa.abre),
      fecha: fimCasa(casa.fecha),
      setores,
    });
  }
  const custo = dias.reduce((total, dia) => total + dia.setores.reduce((soma, setor) => soma + setor.custo, 0), 0);
  const faturamento = faturamentoSemana(fonte.semanas);
  const teto = faturamento != null ? faturamento * 0.08 : null;
  const pct = faturamento ? (custo / faturamento) * 100 : null;
  let status = 'semBase';
  if (pct != null) status = pct > 8 ? 'acima' : pct > 6.8 ? 'atencao' : 'ok';
  return {
    capacidade: CAPACIDADE,
    permanenciaH: PERMANENCIA_H,
    horario: tabelaHorario(),
    dias,
    cmo: {
      total: custo,
      faturamento,
      fonte: faturamento != null ? 'média das últimas semanas fechadas na ZigPay' : null,
      tetoPct: 8,
      teto,
      pct,
      status,
    },
  };
}

function quadroSetor(sectorBase) {
  return SETORES.map((setor) => {
    const base = baseDoSetor(sectorBase, setor);
    return {
      chave: setor,
      label: ROTULO[setor],
      atendimento: base.atendimentoPorPessoa,
      clt: base.referencia ? (BASE[setor].clt || 0) : base.clt,
      int: base.int,
      pj: base.pj,
      brigada: base.brigadaPadrao,
      limite: base.limiteBrigada || (setor === 'cozinha' ? 5 : null),
      referencia: base.referencia,
    };
  });
}

module.exports = {
  montarEscala,
  quadroSetor,
  PAGAMENTO,
  ROTULO,
};
