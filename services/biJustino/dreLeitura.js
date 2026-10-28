'use strict';

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

const CHAVES = ['revenue', 'tax', 'card', 'rent', 'adminFixed', 'energy', 'water', 'gas', 'security', 'fee', 'disposable', 'financeOther', 'incomeTax'];

function normalizar(valor) {
  return String(valor || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

function numeroCelula(valor) {
  if (typeof valor === 'number' && Number.isFinite(valor)) return valor;
  if (typeof valor !== 'string') return 0;
  const texto = valor.trim();
  if (!texto) return 0;
  const normal = texto.includes(',') ? texto.replace(/\./g, '').replace(',', '.') : texto;
  const n = Number(normal.replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function mesAlvo(agora) {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: 'numeric',
  }).formatToParts(agora || new Date());
  const ano = Number(partes.find((parte) => parte.type === 'year').value);
  const mes = Number(partes.find((parte) => parte.type === 'month').value);
  const anterior = new Date(Date.UTC(ano, mes - 2, 1));
  return {
    label: `${MESES[anterior.getUTCMonth()]}/${String(anterior.getUTCFullYear()).slice(-2)}`,
    key: `${anterior.getUTCFullYear()}-${String(anterior.getUTCMonth() + 1).padStart(2, '0')}`,
  };
}

function mesLabelAnterior(label, passos) {
  const partes = String(label || '').split('/');
  const indice = MESES.findIndex((nome) => normalizar(nome) === normalizar(partes[0]));
  if (indice < 0 || !partes[1]) return null;
  const data = new Date(Date.UTC(2000 + Number(partes[1]), indice - passos, 1));
  return `${MESES[data.getUTCMonth()]}/${String(data.getUTCFullYear()).slice(-2)}`;
}

function mesesPresentes(mesLabel, header) {
  const cabecalho = Array.isArray(header) ? header : [];
  const existe = (label) => cabecalho.some((celula) => String(celula || '').trim() === label);
  const lista = [];
  if (existe(mesLabel)) lista.push(mesLabel);
  for (let passo = 1; passo <= 12; passo += 1) {
    const anterior = mesLabelAnterior(mesLabel, passo);
    if (!anterior || !existe(anterior)) continue;
    lista.push(anterior);
  }
  return lista;
}

function colunaExcel(numero) {
  let resto = numero;
  let saida = '';
  while (resto > 0) {
    const letra = (resto - 1) % 26;
    saida = String.fromCharCode(65 + letra) + saida;
    resto = Math.floor((resto - 1) / 26);
  }
  return saida;
}

function linhaDoTermo(rotulos, termo) {
  const alvo = normalizar(termo);
  const indice = rotulos.findIndex((rotulo) => normalizar(rotulo).includes(alvo));
  return indice < 0 ? null : indice + 1;
}

function linhasReceita(rotulos, termo) {
  const base = linhaDoTermo(rotulos, termo);
  if (!base) return [];
  const encontradas = [];
  for (let i = base - 1; i < rotulos.length && encontradas.length < 60; i += 1) {
    const nome = normalizar(rotulos[i]);
    if (nome.charAt(0) === '(' && i !== base - 1) break;
    if (nome.startsWith('receita')) encontradas.push({ linha: i + 1, nome });
  }
  const totais = encontradas.filter((item) => /total|bruta/.test(item.nome));
  return (totais.length ? [totais[0]] : encontradas).map((item) => item.linha);
}

function valorCampo(campo, termos, rotulos, coluna) {
  if (campo === 'revenue') {
    let soma = 0;
    let achou = false;
    termos.forEach((termo) => {
      linhasReceita(rotulos, termo).forEach((linha) => {
        achou = true;
        soma += coluna[linha - 1] || 0;
      });
    });
    return { valor: soma, achou };
  }
  let soma = 0;
  let achou = false;
  termos.forEach((termo) => {
    const linha = linhaDoTermo(rotulos, termo);
    if (!linha) return;
    achou = true;
    soma += coluna[linha - 1] || 0;
  });
  return { valor: soma, achou };
}

function termosDoCampo(fields, campo) {
  const bruto = fields && fields[campo];
  if (Array.isArray(bruto)) return bruto.filter(Boolean);
  if (bruto) return [bruto];
  return campo === 'revenue' ? ['(+) Faturamento'] : [];
}

function extrairDre({ mesLabel, rotulos, colunas, fields }) {
  const lista = Array.isArray(rotulos) ? rotulos : [];
  const porMes = colunas && typeof colunas === 'object' ? colunas : {};
  const colunaAtual = porMes[mesLabel];
  if (!colunaAtual) {
    const error = new Error('mes_nao_achado');
    error.code = 'mes_nao_achado';
    throw error;
  }
  const valores = {};
  const fallbacks = {};
  const naoAchados = [];
  CHAVES.forEach((campo) => {
    const termos = termosDoCampo(fields, campo);
    if (!termos.length) return;
    const atual = valorCampo(campo, termos, lista, colunaAtual);
    if (!atual.achou) {
      naoAchados.push(campo);
      return;
    }
    let valor = atual.valor;
    if (valor === 0) {
      for (let passo = 1; passo <= 12; passo += 1) {
        const label = mesLabelAnterior(mesLabel, passo);
        const coluna = label && porMes[label];
        if (!coluna) continue;
        const anterior = valorCampo(campo, termos, lista, coluna);
        if (anterior.achou && anterior.valor !== 0) {
          valor = anterior.valor;
          fallbacks[campo] = label;
          break;
        }
      }
    }
    valores[campo] = valor;
  });
  return { mes: mesLabel, valores, fallbacks, naoAchados };
}

module.exports = {
  MESES,
  numeroCelula,
  mesAlvo,
  mesLabelAnterior,
  mesesPresentes,
  colunaExcel,
  extrairDre,
};
