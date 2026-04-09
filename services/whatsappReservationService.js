/**
 * Idade completa a partir de data YYYY-MM-DD (timezone local).
 * @returns {number|null}
 */
function ageFromIsoDate(isoDateStr) {
  if (!isoDateStr || typeof isoDateStr !== 'string') return null;
  const m = isoDateStr.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const birth = new Date(y, mo, d);
  if (Number.isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const dm = today.getMonth() - birth.getMonth();
  if (dm < 0 || (dm === 0 && today.getDate() < birth.getDate())) {
    age -= 1;
  }
  return age;
}

/**
 * Se a IA mandar ano errado (ex.: 2024 em vez de 2026) ou data no passado,
 * ajusta para a próxima ocorrência de (mês/dia) a partir de hoje em America/Sao_Paulo.
 * Assim o calendário admin e expires_at da lista de convidados ficam corretos.
 */
function getTodayPartsSaoPaulo() {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(new Date());
  const o = { year: 0, month: 0, day: 0 };
  for (const p of parts) {
    if (p.type === 'year') o.year = Number(p.value);
    if (p.type === 'month') o.month = Number(p.value);
    if (p.type === 'day') o.day = Number(p.value);
  }
  return { y: o.year, m: o.month, d: o.day };
}

function compareYmd(y1, m1, d1, y2, m2, d2) {
  if (y1 !== y2) return y1 < y2 ? -1 : 1;
  if (m1 !== m2) return m1 < m2 ? -1 : 1;
  if (d1 !== d2) return d1 < d2 ? -1 : d1 > d2 ? 1 : 0;
  return 0;
}

function normalizeReservationDateToUpcoming(isoDateStr) {
  const m = String(isoDateStr || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return isoDateStr;
  const month = parseInt(m[2], 10);
  const day = parseInt(m[3], 10);
  if (month < 1 || month > 12 || day < 1 || day > 31) return isoDateStr;

  const today = getTodayPartsSaoPaulo();

  const ymd = (y) =>
    `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  for (let delta = 0; delta <= 1; delta += 1) {
    const y = today.y + delta;
    const test = new Date(Date.UTC(y, month - 1, day, 12, 0, 0));
    if (test.getUTCMonth() !== month - 1) continue;
    if (compareYmd(y, month, day, today.y, today.m, today.d) >= 0) {
      return ymd(y);
    }
  }

  return ymd(today.y + 2);
}

function normalizeReservationTime(t) {
  if (t == null || t === '') return null;
  const s = String(t).trim();
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(s)) {
    const parts = s.split(':');
    const hh = String(parts[0]).padStart(2, '0');
    const mm = String(parts[1]).padStart(2, '0');
    const ss = parts[2] != null ? String(parts[2]).padStart(2, '0') : '00';
    return `${hh}:${mm}:${ss}`;
  }
  return s;
}

/**
 * Evita cair em IDs duplicados de estabelecimentos com o mesmo nome.
 * O painel operacional usa IDs canônicos para regras e calendário.
 */
function normalizeCanonicalEstablishmentId(establishmentIdRaw, establishmentNameHintRaw) {
  const establishmentId = Number(establishmentIdRaw);
  const hint = String(establishmentNameHintRaw || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

  // IDs canônicos usados no projeto
  // - Seu Justino: 1
  // - Pracinha do Seu Justino: 8
  // - Reserva Rooftop: 9
  if (hint.includes('reserva rooftop') || hint.includes('rooftop')) return 9;
  if (hint.includes('pracinha')) return 8;
  if (hint.includes('seu justino') || hint.includes('justino')) return 1;

  // Fallback por ID quando o hint não vier.
  return Number.isFinite(establishmentId) && establishmentId > 0 ? establishmentId : establishmentIdRaw;
}

/**
 * Catálogo de estabelecimentos e áreas para o prompt da IA.
 */
async function loadAiCatalog(pool) {
  let establishments = [];
  try {
    const places = await pool.query(
      `SELECT id, name FROM places ORDER BY name ASC`
    );
    establishments = (places.rows || []).map((r) => ({
      id: r.id,
      name: r.name,
      source: 'place',
    }));
  } catch (e) {
    console.warn('[whatsappReservationService] places:', e.message);
  }

  try {
    const bars = await pool.query(`SELECT id, name FROM bars ORDER BY name ASC`);
    const barRows = bars.rows || [];
    const seen = new Set(establishments.map((e) => e.id));
    for (const r of barRows) {
      if (!seen.has(r.id)) {
        establishments.push({ id: r.id, name: r.name, source: 'bar' });
        seen.add(r.id);
      }
    }
  } catch (e) {
    console.warn('[whatsappReservationService] bars:', e.message);
  }

  let areas = [];
  try {
    const areasResult = await pool.query(
      `SELECT id, name FROM restaurant_areas WHERE is_active = TRUE ORDER BY name ASC LIMIT 120`
    );
    areas = areasResult.rows || [];
  } catch (e) {
    console.warn('[whatsappReservationService] restaurant_areas:', e.message);
  }

  const establishmentsBlock = establishments.length
    ? establishments.map((e) => `- id ${e.id}: ${e.name}`).join('\n')
    : '(nenhum estabelecimento listado)';

  const areasBlock = areas.length
    ? areas.map((a) => `- id ${a.id}: ${a.name}`).join('\n')
    : '(nenhuma área listada)';

  return { establishments, areas, establishmentsBlock, areasBlock };
}

/**
 * Cria reserva via HTTP interno (mesma instância Express / regras de negócio).
 */
async function createReservationInternal(body) {
  const port = process.env.PORT || 3000;
  const base =
    process.env.INTERNAL_API_BASE_URL || `http://127.0.0.1:${port}`;
  const url = `${base.replace(/\/$/, '')}/api/restaurant-reservations`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const errMsg =
      (data && (data.error || data.message)) || `${res.status} ${res.statusText}`;
    return { success: false, error: errMsg, status: res.status, data };
  }
  return { success: true, data };
}

function buildReservationBodyFromParams(params, senderWaId, opts = {}) {
  const {
    establishment_id,
    establishment_name_hint,
    client_name,
    client_email,
    data_nascimento,
    quantidade_convidados,
    reservation_date,
    reservation_time,
    area_id,
    is_birthday,
  } = params || {};

  const numberOfPeople = Number(quantidade_convidados);
  const estId = Number(
    normalizeCanonicalEstablishmentId(establishment_id, establishment_name_hint)
  );
  const aId = Number(area_id);

  const rawDate = reservation_date || null;
  const normalizedDate = rawDate ? normalizeReservationDateToUpcoming(rawDate) : null;
  if (rawDate && normalizedDate && rawDate !== normalizedDate) {
    console.warn('[whatsappReservationService] reservation_date ajustada:', {
      de: rawDate,
      para: normalizedDate,
    });
  }

  return {
    client_name: client_name != null ? String(client_name).trim() : null,
    client_phone: senderWaId ? String(senderWaId).replace(/\D/g, '') : null,
    client_email: client_email != null ? String(client_email).trim() : null,
    data_nascimento_cliente: data_nascimento || null,
    reservation_date: normalizedDate,
    reservation_time: normalizeReservationTime(reservation_time),
    number_of_people: numberOfPeople,
    area_id: aId,
    establishment_id: estId,
    // confirmed: aparece no calendário como reserva válida (check-in, ocupação) como as criadas pela equipe após confirmação
    status: 'confirmed',
    origin: 'WHATSAPP',
    notes: opts.notes || null,
    created_by: null,
    send_email: Boolean(client_email && String(client_email).trim()),
    send_whatsapp: false,
    event_type: is_birthday ? 'aniversario' : undefined,
  };
}

/**
 * Mensagem fixa do link de convidados (produto pediu texto específico).
 */
function buildGuestListSecondMessage(link) {
  return `Para facilitar sua entrada e dos seus amigos, criei este link exclusivo para você preencher a lista de convidados: ${link}`;
}

module.exports = {
  ageFromIsoDate,
  normalizeReservationDateToUpcoming,
  normalizeReservationTime,
  normalizeCanonicalEstablishmentId,
  loadAiCatalog,
  createReservationInternal,
  buildReservationBodyFromParams,
  buildGuestListSecondMessage,
};
