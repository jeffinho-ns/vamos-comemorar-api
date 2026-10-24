const WEEKDAY = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function addDays(iso, days) {
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addMonths(monthKey, delta) {
  const [year, month] = monthKey.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function hojeSaoPaulo(now) {
  const iso = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    weekday: 'short',
  }).format(now);
  return { iso, dow: WEEKDAY[weekday] ?? 0 };
}

function indexar(docs) {
  const byDate = {};
  const publicoByDate = {};
  const servicoByDate = {};
  for (const doc of docs || []) {
    const date = String(doc && doc.date ? doc.date : '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    byDate[date] = Number(doc.revenue) || 0;
    if (doc.publico !== '' && doc.publico != null) publicoByDate[date] = Number(doc.publico) || 0;
    if (doc.servico !== '' && doc.servico != null && !Number.isNaN(Number(doc.servico))) {
      servicoByDate[date] = Number(doc.servico) || 0;
    }
  }
  return { byDate, publicoByDate, servicoByDate };
}

function ticketMedio(dates, byDate, publicoByDate) {
  let revenue = 0;
  let publico = 0;
  let temPublico = false;
  for (const date of dates) {
    if (publicoByDate[date] == null) continue;
    revenue += byDate[date] || 0;
    publico += publicoByDate[date];
    temPublico = true;
  }
  return temPublico && publico > 0 ? revenue / publico : null;
}

function soma(dates, byDate) {
  return dates.reduce((total, date) => total + (byDate[date] || 0), 0);
}

function datasDoMes(byDate, monthKey, ate) {
  return Object.keys(byDate).filter((date) => date.slice(0, 7) === monthKey && (!ate || date <= ate));
}

function semanaDe(todayIso, dow, byDate) {
  const diffToMonday = (dow + 6) % 7;
  const monday = addDays(todayIso, -diffToMonday);
  const corrente = [];
  for (let i = 0; i < 7; i += 1) {
    const date = addDays(monday, i);
    if (date > todayIso) break;
    corrente.push(date);
  }
  const temFaturamento = corrente.some((date) => (byDate[date] || 0) > 0);
  if (temFaturamento) {
    return { dates: corrente, anterior: false };
  }
  const anterior = [];
  for (let i = 0; i < 7; i += 1) {
    anterior.push(addDays(monday, -7 + i));
  }
  return { dates: anterior, anterior: true };
}

function serieMes(byDate, monthKey, todayIso) {
  const serie = [];
  let cursor = `${monthKey}-01`;
  while (cursor <= todayIso && cursor.slice(0, 7) === monthKey) {
    serie.push({ dia: cursor, valor: byDate[cursor] || 0 });
    cursor = addDays(cursor, 1);
  }
  return serie;
}

function serieAno(byDate, monthKey) {
  const serie = [];
  for (let i = 11; i >= 0; i -= 1) {
    const mes = addMonths(monthKey, -i);
    const valor = Object.keys(byDate)
      .filter((date) => date.slice(0, 7) === mes)
      .reduce((total, date) => total + (byDate[date] || 0), 0);
    serie.push({ mes, valor });
  }
  return serie;
}

function summarizeZig(docs, now = new Date()) {
  const { byDate, publicoByDate, servicoByDate } = indexar(docs);
  const { iso, dow } = hojeSaoPaulo(now);
  const monthKey = iso.slice(0, 7);
  const yearKey = iso.slice(0, 4);
  const lastYearMonthKey = `${Number(yearKey) - 1}${monthKey.slice(4)}`;
  const lastYearCutoff = `${lastYearMonthKey}-${iso.slice(8, 10)}`;

  const monthDates = datasDoMes(byDate, monthKey);
  const lastYearDates = datasDoMes(byDate, lastYearMonthKey, lastYearCutoff);
  const yearMonths = [...new Set(Object.keys(byDate).map((date) => date.slice(0, 7)))]
    .filter((mes) => mes.slice(0, 4) === yearKey && mes !== monthKey);
  const yearAvgMonthly = yearMonths.length
    ? yearMonths.reduce((total, mes) => total + soma(datasDoMes(byDate, mes), byDate), 0) / yearMonths.length
    : null;

  const semana = semanaDe(iso, dow, byDate);
  const weekDatesLastYear = semana.dates.map((date) => addDays(date, -364));
  const temSemanaAnoAnterior = weekDatesLastYear.some((date) => byDate[date] !== undefined);
  const yearToDate = Object.keys(byDate).filter((date) => date.slice(0, 4) === yearKey && date <= iso);
  const lastYearCutoffYear = `${Number(yearKey) - 1}${iso.slice(4)}`;
  const yearToDateLastYear = Object.keys(byDate).filter((date) => (
    date.slice(0, 4) === String(Number(yearKey) - 1) && date <= lastYearCutoffYear
  ));

  return {
    fonte: 'ZigPay',
    hoje: iso,
    mes: {
      chave: monthKey,
      faturamento: soma(monthDates, byDate),
      publico: monthDates.reduce((total, date) => total + (publicoByDate[date] || 0), 0),
      servico: monthDates.reduce((total, date) => total + (servicoByDate[date] || 0), 0),
      mesmoMesAnoAnterior: lastYearDates.length ? soma(lastYearDates, byDate) : null,
      mediaMensal: yearAvgMonthly,
      mesesNaMedia: yearMonths.length,
    },
    semana: {
      inicio: semana.dates[0] || null,
      fim: semana.dates[semana.dates.length - 1] || null,
      anterior: semana.anterior,
      faturamento: soma(semana.dates, byDate),
      faturamentoAnoAnterior: temSemanaAnoAnterior ? soma(weekDatesLastYear, byDate) : null,
    },
    tickets: {
      semana: ticketMedio(semana.dates, byDate, publicoByDate),
      semanaAnoAnterior: ticketMedio(weekDatesLastYear, byDate, publicoByDate),
      mes: ticketMedio(monthDates, byDate, publicoByDate),
      mesAnoAnterior: ticketMedio(datasDoMes(byDate, lastYearMonthKey), byDate, publicoByDate),
      ano: ticketMedio(yearToDate, byDate, publicoByDate),
      anoAnterior: ticketMedio(yearToDateLastYear, byDate, publicoByDate),
    },
    serieMes: serieMes(byDate, monthKey, iso),
    serieAno: serieAno(byDate, monthKey),
  };
}

module.exports = { summarizeZig, addDays };
