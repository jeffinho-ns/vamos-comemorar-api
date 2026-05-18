const express = require('express');
const auth = require('../middleware/auth');
const authorize = require('../middleware/authorize');

const ADMIN_ROLES = ['admin', 'gerente', 'administrador', 'recepção'];
const { canonicalizeAdminFaqTopic } = require('../services/agent/faqTopicCanonical');

function normalizeTopic(topic) {
  const raw = String(topic || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_');
  return canonicalizeAdminFaqTopic(raw);
}

function parseEstablishmentId(value) {
  const id = Number(value);
  if (!Number.isFinite(id) || id <= 0) return null;
  return id;
}

function mapFaqRow(row) {
  return {
    id: row.id,
    establishment_id: row.establishment_id,
    topic: row.topic,
    answer: row.answer,
    is_active: Boolean(row.is_active),
    updated_at: row.updated_at,
    created_at: row.created_at,
  };
}

async function establishmentExists(pool, establishmentId) {
  const result = await pool.query('SELECT id FROM places WHERE id = $1 LIMIT 1', [establishmentId]);
  return Boolean(result.rows[0]);
}

module.exports = (pool) => {
  const router = express.Router({ mergeParams: true });

  router.get(
    '/establishments/:id/faqs',
    auth,
    authorize(...ADMIN_ROLES),
    async (req, res) => {
      try {
        const establishmentId = parseEstablishmentId(req.params.id);
        if (!establishmentId) {
          return res.status(400).json({ success: false, message: 'ID de estabelecimento inválido.' });
        }
        if (!(await establishmentExists(pool, establishmentId))) {
          return res.status(404).json({ success: false, message: 'Estabelecimento não encontrado.' });
        }

        const result = await pool.query(
          `SELECT id, establishment_id, topic, answer, is_active, updated_at, created_at
             FROM establishment_faq
            WHERE establishment_id = $1
            ORDER BY topic ASC`,
          [establishmentId]
        );

        return res.json({ success: true, data: result.rows.map(mapFaqRow) });
      } catch (error) {
        console.error('[establishment-faqs] list:', error.message);
        return res.status(500).json({ success: false, message: 'Falha ao listar FAQs.' });
      }
    }
  );

  router.post(
    '/establishments/:id/faqs',
    auth,
    authorize(...ADMIN_ROLES),
    async (req, res) => {
      try {
        const establishmentId = parseEstablishmentId(req.params.id);
        const topic = normalizeTopic(req.body?.topic);
        const answer = String(req.body?.answer || '').trim();

        if (!establishmentId) {
          return res.status(400).json({ success: false, message: 'ID de estabelecimento inválido.' });
        }
        if (!topic) {
          return res.status(400).json({ success: false, message: 'Tópico inválido.' });
        }
        if (!answer) {
          return res.status(400).json({ success: false, message: 'Resposta inválida.' });
        }
        if (!(await establishmentExists(pool, establishmentId))) {
          return res.status(404).json({ success: false, message: 'Estabelecimento não encontrado.' });
        }

        const result = await pool.query(
          `INSERT INTO establishment_faq (establishment_id, topic, answer, is_active, updated_at)
           VALUES ($1, $2, $3, TRUE, NOW())
           RETURNING id, establishment_id, topic, answer, is_active, updated_at, created_at`,
          [establishmentId, topic, answer]
        );

        return res.status(201).json({ success: true, data: mapFaqRow(result.rows[0]) });
      } catch (error) {
        if (String(error.message || '').includes('uq_establishment_faq_topic')) {
          return res.status(409).json({ success: false, message: 'Já existe uma FAQ para este tópico.' });
        }
        console.error('[establishment-faqs] create:', error.message);
        return res.status(500).json({ success: false, message: 'Falha ao criar FAQ.' });
      }
    }
  );

  router.put(
    '/establishments/:id/faqs/:faq_id',
    auth,
    authorize(...ADMIN_ROLES),
    async (req, res) => {
      try {
        const establishmentId = parseEstablishmentId(req.params.id);
        const faqId = Number(req.params.faq_id);
        const topic = req.body?.topic !== undefined ? normalizeTopic(req.body.topic) : null;
        const answer =
          req.body?.answer !== undefined ? String(req.body.answer || '').trim() : null;
        const isActive =
          req.body?.is_active !== undefined ? Boolean(req.body.is_active) : undefined;

        if (!establishmentId || !Number.isFinite(faqId) || faqId <= 0) {
          return res.status(400).json({ success: false, message: 'Parâmetros inválidos.' });
        }
        if (topic !== null && !topic) {
          return res.status(400).json({ success: false, message: 'Tópico inválido.' });
        }
        if (answer !== null && !answer) {
          return res.status(400).json({ success: false, message: 'Resposta inválida.' });
        }

        const existing = await pool.query(
          `SELECT id, establishment_id, topic, answer, is_active
             FROM establishment_faq
            WHERE id = $1 AND establishment_id = $2
            LIMIT 1`,
          [faqId, establishmentId]
        );
        if (!existing.rows[0]) {
          return res.status(404).json({ success: false, message: 'FAQ não encontrada.' });
        }

        const nextTopic = topic !== null ? topic : existing.rows[0].topic;
        const nextAnswer = answer !== null ? answer : existing.rows[0].answer;
        const nextActive = isActive !== undefined ? isActive : existing.rows[0].is_active;

        const result = await pool.query(
          `UPDATE establishment_faq
              SET topic = $1,
                  answer = $2,
                  is_active = $3,
                  updated_at = NOW()
            WHERE id = $4 AND establishment_id = $5
            RETURNING id, establishment_id, topic, answer, is_active, updated_at, created_at`,
          [nextTopic, nextAnswer, nextActive, faqId, establishmentId]
        );

        return res.json({ success: true, data: mapFaqRow(result.rows[0]) });
      } catch (error) {
        if (String(error.message || '').includes('uq_establishment_faq_topic')) {
          return res.status(409).json({ success: false, message: 'Já existe uma FAQ para este tópico.' });
        }
        console.error('[establishment-faqs] update:', error.message);
        return res.status(500).json({ success: false, message: 'Falha ao atualizar FAQ.' });
      }
    }
  );

  router.delete(
    '/establishments/:id/faqs/:faq_id',
    auth,
    authorize(...ADMIN_ROLES),
    async (req, res) => {
      try {
        const establishmentId = parseEstablishmentId(req.params.id);
        const faqId = Number(req.params.faq_id);
        if (!establishmentId || !Number.isFinite(faqId) || faqId <= 0) {
          return res.status(400).json({ success: false, message: 'Parâmetros inválidos.' });
        }

        const result = await pool.query(
          `DELETE FROM establishment_faq
            WHERE id = $1 AND establishment_id = $2
            RETURNING id`,
          [faqId, establishmentId]
        );
        if (!result.rows[0]) {
          return res.status(404).json({ success: false, message: 'FAQ não encontrada.' });
        }
        return res.json({ success: true, data: { id: result.rows[0].id } });
      } catch (error) {
        console.error('[establishment-faqs] delete:', error.message);
        return res.status(500).json({ success: false, message: 'Falha ao remover FAQ.' });
      }
    }
  );

  return router;
};
