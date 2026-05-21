/**
 * Monta o campo notes/observações do painel com contexto útil para a equipe.
 */
function buildOperationalNotes(segments = []) {
  const parts = ['Origem: WhatsApp (Agente IA)'];
  for (const segment of segments) {
    const text = String(segment || '').trim();
    if (text) parts.push(text);
  }
  return parts.join(' | ');
}

function buildNotesFromReservationArgs(args = {}, context = {}) {
  const segments = [];
  const observacoes = String(args.observacoes || '').trim();
  const areaInput = String(args.area || args.area_preferida || '').trim();
  const confirmedLabel = String(context.area_confirmada || '').trim();
  const tableNumber = context.mesa != null ? String(context.mesa).trim() : '';

  if (areaInput) {
    segments.push(
      confirmedLabel && confirmedLabel !== areaInput
        ? `Cliente pediu: ${areaInput} | Alocado: ${confirmedLabel}`
        : `Área: ${confirmedLabel || areaInput}`
    );
  } else if (confirmedLabel) {
    segments.push(`Área: ${confirmedLabel}`);
  }

  if (tableNumber) segments.push(`Mesa: ${tableNumber}`);

  const partySize = Number(args.quantidade_pessoas);
  if (Number.isFinite(partySize) && partySize > 0) {
    segments.push(`${partySize} pessoas`);
  }

  const horario = String(args.horario || '').trim();
  if (horario) segments.push(`Horário: ${horario}`);

  if (observacoes) segments.push(observacoes);

  return buildOperationalNotes(segments);
}

function buildNotesFromWaitlistArgs(args = {}, context = {}) {
  const segments = [];
  const observacoes = String(args.observacoes || '').trim();
  const areaInput = String(args.area_preferida || '').trim();
  const resolvedLabel = String(context.area_resolvida || '').trim();

  segments.push('Lista de espera — todas as áreas cheias na data');

  if (areaInput || resolvedLabel) {
    segments.push(`Cliente quer: ${resolvedLabel || areaInput}`);
  }

  const partySize = Number(args.quantidade_pessoas);
  if (Number.isFinite(partySize) && partySize > 0) {
    segments.push(`${partySize} pessoas`);
  }

  const horario = String(args.horario || '').trim();
  if (horario) segments.push(`Horário preferido: ${horario}`);

  segments.push('Hostess aloca mesa quando liberar vaga');

  if (observacoes) segments.push(observacoes);

  return buildOperationalNotes(segments);
}

module.exports = {
  buildOperationalNotes,
  buildNotesFromReservationArgs,
  buildNotesFromWaitlistArgs,
};
