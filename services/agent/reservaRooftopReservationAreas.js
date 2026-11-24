'use strict';

/**
 * Preferências públicas do Reserva Rooftop (id=9) — espelho do formulário /reservar
 * e de app/config/reservaRooftopPublicAreas.ts no next.
 * Subáreas operacionais (LG, Gramado, PQ…) ficam só no painel admin.
 */

const RESERVA_ROOFTOP_ESTABLISHMENT_ID = 9;

const RESERVA_ROOFTOP_PUBLIC_SUBAREAS = [
  {
    key: 'interna',
    label: 'Área Interna',
    preferNameIncludes: [
      'área interna',
      'area interna',
      'lg 1',
      'lg 2',
      'lg 3',
      'pq 1',
      'pq 2',
      'pq 3',
      'pq 4',
    ],
  },
  {
    key: 'externa',
    label: 'Área Externa',
    preferNameIncludes: ['área externa', 'area externa', 'gramado', 'corredor', 'parrilha'],
  },
  {
    key: 'salao',
    label: 'Salão',
    preferNameIncludes: [
      'rooftop - salão',
      'rooftop - salao',
      'área salão',
      'area salao',
      'salão',
      'salao',
      'redário',
      'redario',
    ],
  },
];

function normalizeRooftopText(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function isReservaRooftopEstablishment(establishmentId) {
  return Number(establishmentId) === RESERVA_ROOFTOP_ESTABLISHMENT_ID;
}

function guestAreaPromptForClient() {
  return 'Você prefere área interna, área externa ou o salão?';
}

function resolveReservaRooftopGuestZone(text) {
  const normalized = normalizeRooftopText(text);
  if (!normalized) return null;

  const salao = /\b(salao|redario|privativ[ao])\b/.test(normalized);
  const externa =
    /\b(externa|externo|descoberta|descoberto|ar livre|ao ar livre|gramado|corredor|parrilha)\b/.test(
      normalized
    ) || normalized === 'externa';
  const interna =
    (/\b(interna|interno|coberta|coberto|lg\b|pq\b)\b/.test(normalized) ||
      normalized === 'interna' ||
      normalized === 'coberta') &&
    !/\bsalao|privativ/.test(normalized);

  if (salao && !externa && !interna) return { key: 'salao', label: 'Salão' };
  if (externa && !interna && !salao) return { key: 'externa', label: 'Área Externa' };
  if (interna && !externa && !salao) return { key: 'interna', label: 'Área Interna' };
  return null;
}

function findReservaRooftopPublicSubarea(textOrKey) {
  const normalized = normalizeRooftopText(textOrKey);
  if (!normalized) return null;
  const byKey = RESERVA_ROOFTOP_PUBLIC_SUBAREAS.find((item) => item.key === normalized);
  if (byKey) return byKey;
  const byLabel = RESERVA_ROOFTOP_PUBLIC_SUBAREAS.find(
    (item) => normalizeRooftopText(item.label) === normalized
  );
  if (byLabel) return byLabel;
  return resolveReservaRooftopGuestZone(textOrKey)
    ? RESERVA_ROOFTOP_PUBLIC_SUBAREAS.find(
        (item) => item.key === resolveReservaRooftopGuestZone(textOrKey).key
      )
    : null;
}

function isCreatableRooftopAreaLabel(area) {
  return Boolean(findReservaRooftopPublicSubarea(area));
}

function resolveReservaRooftopPublicAreaId(subareaKeyOrLabel, areas = []) {
  const sub =
    findReservaRooftopPublicSubarea(subareaKeyOrLabel) ||
    RESERVA_ROOFTOP_PUBLIC_SUBAREAS.find((item) => item.key === String(subareaKeyOrLabel || ''));
  if (!sub || !areas.length) return null;

  const normalizedAreas = areas.map((area) => ({
    id: Number(area.id),
    name: normalizeRooftopText(area.name),
  }));

  const exactPublic = normalizedAreas.find((area) =>
    area.name.includes(`reserva rooftop - ${normalizeRooftopText(sub.label)}`)
  );
  if (exactPublic) return exactPublic.id;

  for (const needle of sub.preferNameIncludes) {
    const n = normalizeRooftopText(needle);
    const match = normalizedAreas.find((area) => area.name.includes(n));
    if (match) return match.id;
  }

  const rooftop = normalizedAreas.find((area) => area.name.includes('reserva rooftop'));
  return rooftop ? rooftop.id : Number(areas[0].id) || null;
}

module.exports = {
  RESERVA_ROOFTOP_ESTABLISHMENT_ID,
  RESERVA_ROOFTOP_PUBLIC_SUBAREAS,
  isReservaRooftopEstablishment,
  guestAreaPromptForClient,
  resolveReservaRooftopGuestZone,
  findReservaRooftopPublicSubarea,
  isCreatableRooftopAreaLabel,
  resolveReservaRooftopPublicAreaId,
};
