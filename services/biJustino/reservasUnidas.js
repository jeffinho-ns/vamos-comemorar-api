'use strict';

const snapshotStore = require('./snapshotStore');

const FONTE_AGILIZAI = 'agilizai';
const FONTE_DIONISIO = 'dionisio';
const FONTE_AMBOS = 'ambos';
const LIMITE = 400;
const CANCELLED = ['cancelled', 'cancelada', 'canceled'];

function soDigitos(valor) {
  return String(valor || '').replace(/\D/g, '');
}

function dataIso(valor) {
  const texto = String(valor || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(texto) ? texto : '';
}

function nomeChave(valor) {
  return String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 24);
}

function chaveDuplicata(date, phone, name) {
  const dia = dataIso(date);
  if (!dia) return '';
  const tel = soDigitos(phone);
  if (tel.length >= 8) return `${dia}|tel:${tel.slice(-8)}`;
  const nome = nomeChave(name);
  if (nome.length >= 3) return `${dia}|nome:${nome}`;
  return '';
}

function origemDe(bruto) {
  const texto = String(bruto || '').toLowerCase();
  if (!texto) return '';
  if (texto.includes('instagram') || texto === 'ig') return 'instagram';
  if (texto.includes('whats') || texto === 'wpp') return 'whatsapp';
  if (texto.includes('indica')) return 'indicacao';
  if (texto.includes('google') || texto.includes('site') || texto.includes('web')) return 'google';
  if (texto.includes('porta') || texto.includes('walk')) return 'porta';
  return 'outro';
}

function tipoDe(bruto) {
  const texto = String(bruto || '').toLowerCase();
  if (texto.includes('happy') || texto.includes('hh')) return 'happyHour';
  if (texto.includes('desped')) return 'despedida';
  if (texto.includes('anivers')) return 'aniversario';
  return 'normal';
}

function horaDe(bruto) {
  const texto = String(bruto || '').trim();
  const match = texto.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return '';
  const hora = String(Math.min(23, Number(match[1]))).padStart(2, '0');
  return `${hora}:${match[2]}`;
}

function entradaVazia(parcial) {
  return {
    id: '',
    date: '',
    pax: 1,
    tipo: 'normal',
    nomeCliente: '',
    telefone: '',
    email: '',
    observacao: '',
    submittedByName: '',
    submittedAt: '',
    convidados: '',
    origem: '',
    ativacaoId: '',
    hora: '',
    fonte: FONTE_DIONISIO,
    idAgilizai: null,
    idDionisio: '',
    ...parcial,
  };
}

function deAgilizai(row) {
  const id = Number(row && row.id) || 0;
  const date = dataIso(row && (row.date || row.reservation_date));
  return entradaVazia({
    id: id ? `agilizai:${id}` : '',
    date,
    pax: Math.max(1, Number(row && (row.pax != null ? row.pax : row.number_of_people)) || 1),
    tipo: tipoDe((row && row.event_type) || (row && row.notes)),
    nomeCliente: String((row && (row.client_name || row.nomeCliente)) || '').trim(),
    telefone: String((row && (row.client_phone || row.telefone)) || '').trim(),
    email: String((row && (row.client_email || row.email)) || '').trim(),
    observacao: String((row && (row.notes || row.observacao)) || '').trim(),
    submittedByName: String((row && (row.created_by_name || row.submittedByName)) || '').trim() || 'Agilizaiapp',
    submittedAt: row && row.created_at ? String(row.created_at) : '',
    origem: origemDe(row && (row.origin || row.origem)),
    hora: horaDe(row && (row.hora || row.reservation_time)),
    fonte: FONTE_AGILIZAI,
    idAgilizai: id || null,
    idDionisio: '',
  });
}

function deDionisio(item) {
  if (!item) return null;
  const date = dataIso(item.date);
  if (!date) return null;
  return entradaVazia({
    id: String(item.id || ''),
    date,
    pax: Math.max(1, Number(item.pax) || 1),
    tipo: tipoDe(item.tipo) === 'normal' && item.tipo === 'normal' ? 'normal' : (['happyHour', 'despedida', 'aniversario', 'normal'].includes(item.tipo) ? item.tipo : tipoDe(item.tipo)),
    nomeCliente: String(item.nomeCliente || '').trim(),
    telefone: String(item.telefone || '').trim(),
    email: String(item.email || '').trim(),
    observacao: String(item.observacao || '').trim(),
    submittedByName: String(item.submittedByName || '').trim(),
    submittedAt: String(item.submittedAt || ''),
    convidados: String(item.convidados || ''),
    origem: String(item.origem || ''),
    ativacaoId: String(item.ativacaoId || ''),
    hora: horaDe(item.hora),
    fonte: FONTE_DIONISIO,
    idAgilizai: null,
    idDionisio: String(item.id || ''),
  });
}

function entradasDeDionisio(payload) {
  if (!payload) return [];
  const lista = Array.isArray(payload.items)
    ? payload.items
    : (Array.isArray(payload.docs) ? payload.docs : (Array.isArray(payload) ? payload : []));
  return lista.map(deDionisio).filter(Boolean);
}

function mesclarPar(dionisio, agilizai) {
  return entradaVazia({
    id: dionisio.id || agilizai.id,
    date: agilizai.date || dionisio.date,
    pax: agilizai.pax || dionisio.pax,
    tipo: agilizai.tipo !== 'normal' ? agilizai.tipo : dionisio.tipo,
    nomeCliente: agilizai.nomeCliente || dionisio.nomeCliente,
    telefone: agilizai.telefone || dionisio.telefone,
    email: agilizai.email || dionisio.email,
    observacao: agilizai.observacao || dionisio.observacao,
    submittedByName: agilizai.submittedByName || dionisio.submittedByName,
    submittedAt: agilizai.submittedAt || dionisio.submittedAt,
    convidados: dionisio.convidados || agilizai.convidados,
    origem: agilizai.origem || dionisio.origem,
    ativacaoId: dionisio.ativacaoId || agilizai.ativacaoId,
    hora: agilizai.hora || dionisio.hora,
    fonte: FONTE_AMBOS,
    idAgilizai: agilizai.idAgilizai,
    idDionisio: dionisio.idDionisio || dionisio.id,
  });
}

function chaveDe(item) {
  return chaveDuplicata(item.date, item.telefone, item.nomeCliente);
}

function unir(dionisioItems, agilizaiItems) {
  const agilizai = (agilizaiItems || []).filter(Boolean);
  const usados = new Set();
  const porChave = new Map();
  agilizai.forEach((item, indice) => {
    const chave = chaveDe(item);
    if (chave && !porChave.has(chave)) porChave.set(chave, indice);
  });

  const saida = [];
  (dionisioItems || []).forEach((item) => {
    if (!item) return;
    const chave = chaveDe(item);
    const indice = chave ? porChave.get(chave) : undefined;
    if (indice == null) {
      saida.push(item);
      return;
    }
    usados.add(indice);
    saida.push(mesclarPar(item, agilizai[indice]));
  });
  agilizai.forEach((item, indice) => {
    if (!usados.has(indice)) saida.push(item);
  });
  saida.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    if (a.submittedAt !== b.submittedAt) return String(a.submittedAt) < String(b.submittedAt) ? 1 : -1;
    return String(b.id).localeCompare(String(a.id));
  });
  return saida.slice(0, LIMITE);
}

function docsPorDia(entradas) {
  const porData = {};
  (entradas || []).forEach((item) => {
    if (!item || !item.date) return;
    if (!porData[item.date]) {
      porData[item.date] = {
        date: item.date,
        pax: 0,
        happyHour: 0,
        despedida: 0,
        aniversario: 0,
        submittedAt: '',
        porHora: {},
      };
    }
    const dia = porData[item.date];
    const pax = Number(item.pax) || 0;
    dia.pax += pax;
    if (item.hora) dia.porHora[item.hora] = (dia.porHora[item.hora] || 0) + pax;
    if (item.tipo === 'happyHour') dia.happyHour += 1;
    else if (item.tipo === 'despedida') dia.despedida += 1;
    else if (item.tipo === 'aniversario') dia.aniversario += 1;
    if (String(item.submittedAt || '') > dia.submittedAt) dia.submittedAt = item.submittedAt || '';
  });
  return Object.keys(porData)
    .sort((a, b) => (a < b ? 1 : -1))
    .map((date) => porData[date])
    .slice(0, LIMITE);
}

function extrasDionisio(dionisioItems, chavesAgilizai) {
  const chaves = chavesAgilizai || new Set();
  return (dionisioItems || []).filter((item) => {
    const chave = chaveDe(item);
    return !chave || !chaves.has(chave);
  });
}

function somarFaixa(entradas, inicio, fimExclusivo) {
  let reservas = 0;
  let pessoas = 0;
  (entradas || []).forEach((item) => {
    if (!item || !item.date) return;
    if (item.date < inicio || item.date >= fimExclusivo) return;
    reservas += 1;
    pessoas += Number(item.pax) || 0;
  });
  return { reservas, pessoas };
}

function dowDe(date) {
  const partes = String(date || '').split('-').map(Number);
  if (partes.length !== 3 || partes.some((n) => !n && n !== 0)) return 0;
  return new Date(Date.UTC(partes[0], partes[1] - 1, partes[2], 12, 0, 0)).getUTCDay();
}

function somarNoQuadro(quadro, extras) {
  const indicadores = {
    reservas: [...((quadro && quadro.indicadores && quadro.indicadores.reservas) || [0, 0, 0, 0, 0, 0, 0])],
    pessoas: [...((quadro && quadro.indicadores && quadro.indicadores.pessoas) || [0, 0, 0, 0, 0, 0, 0])],
    checkins: [...((quadro && quadro.indicadores && quadro.indicadores.checkins) || [0, 0, 0, 0, 0, 0, 0])],
  };
  const porData = {};
  ((quadro && quadro.dias) || []).forEach((dia) => {
    porData[dia.data] = { ...dia };
  });
  (extras || []).forEach((item) => {
    if (!item || !item.date) return;
    if (!porData[item.date]) {
      porData[item.date] = {
        data: item.date,
        dow: dowDe(item.date),
        reservas: 0,
        pessoas: 0,
        checkins: 0,
        aniversario: 0,
        despedida: 0,
        listaSexta: 0,
      };
    }
    const dia = porData[item.date];
    const pax = Number(item.pax) || 0;
    dia.reservas += 1;
    dia.pessoas += pax;
    if (item.tipo === 'aniversario') dia.aniversario += pax;
    else if (item.tipo === 'despedida') dia.despedida += pax;
    const i = (Number(dia.dow) + 6) % 7;
    indicadores.reservas[i] += 1;
    indicadores.pessoas[i] += pax;
  });
  const dias = Object.keys(porData).sort().map((data) => porData[data]);
  return { indicadores, dias };
}

function misturarReservas(dionisioPayload, agilizaiLinhas) {
  const items = unir(entradasDeDionisio(dionisioPayload), (agilizaiLinhas || []).map(deAgilizai));
  return { ok: true, items, docs: docsPorDia(items) };
}

async function listarAgilizai(pool, placeIds) {
  if (!pool || !placeIds || !placeIds.length) return [];
  const sql = `SELECT rr.id,
              rr.reservation_date::text AS date,
              COALESCE(rr.number_of_people, 0)::int AS pax,
              left(rr.reservation_time::text, 5) AS hora,
              rr.client_name,
              rr.client_phone,
              rr.client_email,
              rr.origin,
              rr.notes,
              rr.created_at,
              u.name AS created_by_name
         FROM restaurant_reservations rr
         LEFT JOIN users u ON u.id = rr.created_by
        WHERE rr.establishment_id = ANY($1::int[])
          AND lower(replace(COALESCE(rr.status, ''), '_', '-')) <> ALL($2::text[])
        ORDER BY rr.reservation_date DESC, rr.id DESC
        LIMIT $3`;
  try {
    const result = await pool.query(sql, [placeIds, CANCELLED, LIMITE]);
    return result.rows.map(deAgilizai);
  } catch (err) {
    console.warn('[bi-justino] reservas do Agilizaiapp indisponíveis', {
      establishment: 'Seu Justino',
      message: err && err.message ? err.message : String(err),
    });
    return [];
  }
}

async function chavesAgilizaiNasDatas(pool, placeIds, datas) {
  const dias = [...new Set((datas || []).map(dataIso).filter(Boolean))];
  const chaves = new Set();
  if (!pool || !placeIds || !placeIds.length || !dias.length) return chaves;
  try {
    const result = await pool.query(
      `SELECT reservation_date::text AS date, client_phone, client_name
         FROM restaurant_reservations
        WHERE establishment_id = ANY($1::int[])
          AND reservation_date = ANY($2::date[])
          AND lower(replace(COALESCE(status, ''), '_', '-')) <> ALL($3::text[])`,
      [placeIds, dias, CANCELLED],
    );
    result.rows.forEach((row) => {
      const chave = chaveDuplicata(row.date, row.client_phone, row.client_name);
      if (chave) chaves.add(chave);
    });
  } catch (err) {
    console.warn('[bi-justino] chaves de reserva do Agilizaiapp indisponíveis', {
      establishment: 'Seu Justino',
      message: err && err.message ? err.message : String(err),
    });
  }
  return chaves;
}

async function payloadDionisio(pool, store, jaLido) {
  if (jaLido) return jaLido;
  const snap = await (store || snapshotStore).latestPayload(pool, 'planilha:getReservationEntries').catch(() => null);
  return snap && snap.payload;
}

async function carregarUnidas(pool, opts) {
  const options = opts || {};
  const dionisioPayload = await payloadDionisio(pool, options.store, options.dionisioPayload);
  if (!pool) {
    const items = unir(entradasDeDionisio(dionisioPayload), []);
    return { ok: true, items, docs: docsPorDia(items) };
  }
  const placeIds = options.placeIds && options.placeIds.length
    ? options.placeIds
    : await require('./liveFacts').resolveJustinoPlaceIds(pool);
  const bruto = options.agilizai || await listarAgilizai(pool, placeIds);
  const agilizai = (bruto || []).map((item) => (item && item.fonte ? item : deAgilizai(item)));
  const items = unir(entradasDeDionisio(dionisioPayload), agilizai);
  return { ok: true, items, docs: docsPorDia(items) };
}

async function extrasDionisioDoBanco(pool, placeIds, dionisioPayload) {
  const dionisio = entradasDeDionisio(dionisioPayload);
  const chaves = await chavesAgilizaiNasDatas(pool, placeIds, dionisio.map((item) => item.date));
  return extrasDionisio(dionisio, chaves);
}

function acrescentarDias(iso, dias) {
  const partes = String(iso).split('-').map(Number);
  const data = new Date(Date.UTC(partes[0], partes[1] - 1, partes[2], 12, 0, 0));
  data.setUTCDate(data.getUTCDate() + dias);
  return data.toISOString().slice(0, 10);
}

function aplicarExtrasNoLive(live, extras, hoje) {
  if (!live) return live;
  const inicioMes = `${hoje.slice(0, 7)}-01`;
  const proximoMes = acrescentarDias(inicioMes, 32).slice(0, 7);
  const fimMes = `${proximoMes}-01`;
  const hojeExtra = somarFaixa(extras, hoje, acrescentarDias(hoje, 1));
  const agendaExtra = somarFaixa(extras, hoje, acrescentarDias(hoje, 30));
  const mesExtra = somarFaixa(extras, inicioMes, fimMes);
  return {
    ...live,
    hoje: {
      ...live.hoje,
      reservas: (live.hoje.reservas || 0) + hojeExtra.reservas,
      pessoas: (live.hoje.pessoas || 0) + hojeExtra.pessoas,
    },
    agenda: {
      reservas: (live.agenda.reservas || 0) + agendaExtra.reservas,
      pessoas: (live.agenda.pessoas || 0) + agendaExtra.pessoas,
    },
    mes: {
      reservas: (live.mes.reservas || 0) + mesExtra.reservas,
      pessoas: (live.mes.pessoas || 0) + mesExtra.pessoas,
    },
    quadroSemana: somarNoQuadro(live.quadroSemana, extras),
  };
}

module.exports = {
  FONTE_AGILIZAI,
  FONTE_DIONISIO,
  FONTE_AMBOS,
  chaveDuplicata,
  deAgilizai,
  deDionisio,
  entradasDeDionisio,
  unir,
  docsPorDia,
  extrasDionisio,
  somarFaixa,
  somarNoQuadro,
  misturarReservas,
  listarAgilizai,
  carregarUnidas,
  extrasDionisioDoBanco,
  aplicarExtrasNoLive,
};
