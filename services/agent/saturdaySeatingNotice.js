'use strict';

/**
 * Aviso oficial de acomodação/assentos aos sábados para:
 * - Seu Justino (id = 1): 14h–17h -> mesa com 8 assentos + 2 bistrôs; pós-17h -> mesa com 6 assentos + bistrô de espera.
 * - Pracinha do Seu Justino (id = 8): 14h–17h -> mesa com 10 assentos + 2 bistrôs; pós-17h -> mesa com 6 assentos + bistrô de espera.
 *
 * Anexado deterministicamente na confirmação da pré-reserva de sábado para garantir
 * que o cliente sempre receba a orientação exata após o cadastro no sistema.
 */

const SEU_JUSTINO_ID = 1;
const PRACINHA_ID = 8;

function isSaturdayIsoDate(isoDate) {
  const match = String(isoDate || '')
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const utc = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  return utc.getUTCDay() === 6;
}

function parseMinutesFromTime(timeStr) {
  const match = String(timeStr || '')
    .trim()
    .match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/**
 * Retorna a mensagem oficial de assentos de sábado para anexar na confirmação
 * da reserva, ou null quando não se aplica (outra casa ou outro dia da semana).
 */
function buildSaturdaySeatingConfirmationNotice({
  establishmentId,
  reservationDate,
  reservationTime,
} = {}) {
  const id = Number(establishmentId);
  if (id !== SEU_JUSTINO_ID && id !== PRACINHA_ID) return null;
  if (!isSaturdayIsoDate(reservationDate)) return null;

  const minutes = parseMinutesFromTime(reservationTime);
  if (minutes === null) return null;

  // Faixa 1: reservas até 17h00 (14h às 17h)
  if (minutes <= 17 * 60) {
    const seats = id === PRACINHA_ID ? 10 : 8;
    return `Você terá uma mesa com ${seats} assentos e dois bistrôs de suporte. Conforme os convidados forem chegando, vamos acomodando todos na sua reserva, de acordo com a disponibilidade da casa.`;
  }

  // Faixa 2: reservas após as 17h00 até o fechamento
  return 'Nesse horário, você terá uma reserva de mesa com 6 assentos. Se, ao chegar à casa, sua mesa não estiver disponível, iremos disponibilizar uma mesa bistrô até que sua mesa fique pronta.';
}

module.exports = {
  isSaturdayIsoDate,
  parseMinutesFromTime,
  buildSaturdaySeatingConfirmationNotice,
};
