'use strict';

/**
 * Nota operacional na Base de Conhecimento (Informações adicionais)
 * para a IA SOL explicar bloqueios de agenda criados pelo Staff Agent.
 *
 * Não substitui o hard block em restaurant_reservation_blocks —
 * só reforça a mensagem humana quando o cliente perguntar.
 */

const { queryWithRlsContext } = require('../../tenancy/scopedQuery');
const {
  resolveOrganizationIdForEstablishment,
} = require('../../tenancy/resolveOrganizationId');
const { invalidateFaqCache } = require('../agent/faqPrefetchService');
const { formatBr, formatTimeRange } = require('./agendaBlockHelpers');

function slugPart(value) {
  return String(value || 'casa')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40) || 'casa';
}

function buildBlockFaqTopic({ dateIso, endDateIso, areaId, areaName }) {
  const range =
    endDateIso && endDateIso !== dateIso ? `${dateIso}_a_${endDateIso}` : dateIso;
  const areaKey = areaId != null ? `area_${areaId}` : `area_${slugPart(areaName || 'casa')}`;
  return `aviso_bloqueio_agenda_${range}_${areaKey}`.slice(0, 120);
}

function buildBlockFaqAnswer({
  dateIso,
  endDateIso,
  areaName,
  startDatetime,
  endDatetime,
  reason,
}) {
  const when =
    endDateIso && endDateIso !== dateIso
      ? `de ${formatBr(dateIso)} a ${formatBr(endDateIso)}`
      : `em ${formatBr(dateIso)}`;
  const where = areaName ? `na área ${areaName}` : 'na casa';
  const hours = formatTimeRange(startDatetime, endDatetime);
  const motive = String(reason || '').trim() || 'evento particular / operação interna';
  return (
    `Importante: ${where} está indisponível para novas reservas ${when} (${hours}). ` +
    `Motivo: ${motive}. ` +
    `Não ofereça mesa nessas áreas nesse período; sugira outra área/data ou avise que está fechado para evento particular.`
  );
}

async function rlsCtxFor(pool, establishmentId) {
  const organizationId = await resolveOrganizationIdForEstablishment(pool, establishmentId);
  return organizationId ? { organizationId } : { isAdmin: true };
}

/**
 * Upsert FAQ ativa (categoria evento) vinculada ao bloqueio.
 * Retorna { ok, faqId, topic, created }.
 */
async function upsertBlockAiNote(pool, {
  establishmentId,
  dateIso,
  endDateIso = null,
  areaId = null,
  areaName = null,
  startDatetime,
  endDatetime,
  reason,
}) {
  const topic = buildBlockFaqTopic({ dateIso, endDateIso, areaId, areaName });
  const answer = buildBlockFaqAnswer({
    dateIso,
    endDateIso,
    areaName,
    startDatetime,
    endDatetime,
    reason,
  });
  const ctx = await rlsCtxFor(pool, establishmentId);
  const organizationId = ctx.organizationId || null;

  const existing = await pool.query(
    `SELECT id FROM establishment_faq
      WHERE establishment_id = $1 AND topic = $2
      LIMIT 1`,
    [establishmentId, topic]
  );

  if (existing.rows[0]?.id) {
    const faqId = existing.rows[0].id;
    await queryWithRlsContext(
      pool,
      ctx,
      `UPDATE establishment_faq
          SET answer = $1,
              category = 'evento',
              is_active = TRUE,
              updated_at = NOW()
        WHERE id = $2 AND establishment_id = $3`,
      [answer, faqId, establishmentId]
    );
    invalidateFaqCache(establishmentId);
    return { ok: true, faqId, topic, created: false };
  }

  const { rows } = await queryWithRlsContext(
    pool,
    ctx,
    `INSERT INTO establishment_faq
       (establishment_id, topic, answer, category, is_active, organization_id, updated_at)
     VALUES ($1, $2, $3, 'evento', TRUE, $4, NOW())
     RETURNING id`,
    [establishmentId, topic, answer, organizationId]
  );

  invalidateFaqCache(establishmentId);
  return { ok: true, faqId: rows[0]?.id, topic, created: true };
}

/** Desativa notas de bloqueio ligadas à data (e área, se informada). */
async function deactivateBlockAiNotes(pool, {
  establishmentId,
  dateIso,
  areaId = null,
  areaName = null,
}) {
  const topicExact = buildBlockFaqTopic({
    dateIso,
    endDateIso: null,
    areaId,
    areaName,
  });
  const likeDate = `%${dateIso}%`;
  const ctx = await rlsCtxFor(pool, establishmentId);

  const { rows } = await queryWithRlsContext(
    pool,
    ctx,
    `UPDATE establishment_faq
        SET is_active = FALSE, updated_at = NOW()
      WHERE establishment_id = $1
        AND is_active = TRUE
        AND topic LIKE 'aviso_bloqueio_agenda_%'
        AND (topic = $2 OR topic ILIKE $3)
      RETURNING id, topic`,
    [establishmentId, topicExact, likeDate]
  );

  if (rows.length) invalidateFaqCache(establishmentId);
  return { ok: true, deactivated: rows.length, topics: rows.map((r) => r.topic) };
}

module.exports = {
  buildBlockFaqTopic,
  buildBlockFaqAnswer,
  upsertBlockAiNote,
  deactivateBlockAiNotes,
};
