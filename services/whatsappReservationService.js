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
  const estId = Number(establishment_id);
  const aId = Number(area_id);

  return {
    client_name: client_name != null ? String(client_name).trim() : null,
    client_phone: senderWaId ? String(senderWaId).replace(/\D/g, '') : null,
    client_email: client_email != null ? String(client_email).trim() : null,
    data_nascimento_cliente: data_nascimento || null,
    reservation_date: reservation_date || null,
    reservation_time: normalizeReservationTime(reservation_time),
    number_of_people: numberOfPeople,
    area_id: aId,
    establishment_id: estId,
    status: 'NOVA',
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
  normalizeReservationTime,
  loadAiCatalog,
  createReservationInternal,
  buildReservationBodyFromParams,
  buildGuestListSecondMessage,
};
