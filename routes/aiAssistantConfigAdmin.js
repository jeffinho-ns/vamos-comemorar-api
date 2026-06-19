const express = require('express');
const auth = require('../middleware/auth');
const authorize = require('../middleware/authorize');

const ADMIN_ROLES = ['admin', 'gerente', 'administrador', 'recepção'];

function parseEstablishmentId(value) {
  const id = Number(value);
  if (!Number.isFinite(id) || id <= 0) return null;
  return id;
}

async function establishmentExists(pool, establishmentId) {
  const result = await pool.query('SELECT id FROM places WHERE id = $1 LIMIT 1', [establishmentId]);
  return Boolean(result.rows[0]);
}

function str(value, max) {
  const s = String(value === undefined || value === null ? '' : value).trim();
  return max ? s.slice(0, max) : s;
}

function digitsOnly(value) {
  return String(value || '').replace(/\D/g, '').slice(0, 20);
}

/**
 * GET (lista) + PUT (substitui toda a lista da casa em transação).
 * Cada recurso define como mapear/validar cada item.
 */
function buildListRouter(router, pool, { resource, table, columns, mapRow, sanitizeItem }) {
  router.get(
    `/establishments/:id/${resource}`,
    auth,
    authorize(...ADMIN_ROLES),
    async (req, res) => {
      try {
        const establishmentId = parseEstablishmentId(req.params.id);
        if (!establishmentId) {
          return res.status(400).json({ success: false, message: 'ID de estabelecimento inválido.' });
        }
        const result = await pool.query(
          `SELECT * FROM ${table} WHERE establishment_id = $1 ORDER BY sort_order ASC, id ASC`,
          [establishmentId]
        );
        return res.json({ success: true, data: result.rows.map(mapRow) });
      } catch (error) {
        console.error(`[ai-config:${resource}] list:`, error.message);
        return res.status(500).json({ success: false, message: 'Falha ao carregar dados.' });
      }
    }
  );

  router.put(
    `/establishments/:id/${resource}`,
    auth,
    authorize(...ADMIN_ROLES),
    async (req, res) => {
      const establishmentId = parseEstablishmentId(req.params.id);
      if (!establishmentId) {
        return res.status(400).json({ success: false, message: 'ID de estabelecimento inválido.' });
      }
      if (!(await establishmentExists(pool, establishmentId))) {
        return res.status(404).json({ success: false, message: 'Estabelecimento não encontrado.' });
      }

      const items = Array.isArray(req.body?.items) ? req.body.items : [];
      const sanitized = [];
      const seenKeys = new Set();
      items.forEach((item, index) => {
        const clean = sanitizeItem(item, index);
        if (!clean) return;
        if (clean.__dedupeKey) {
          if (seenKeys.has(clean.__dedupeKey)) return;
          seenKeys.add(clean.__dedupeKey);
          delete clean.__dedupeKey;
        }
        sanitized.push(clean);
      });

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(`DELETE FROM ${table} WHERE establishment_id = $1`, [establishmentId]);

        for (let i = 0; i < sanitized.length; i += 1) {
          const item = sanitized[i];
          const cols = ['establishment_id', ...columns, 'sort_order'];
          const values = [establishmentId, ...columns.map((c) => item[c]), i];
          const placeholders = cols.map((_, idx) => `$${idx + 1}`).join(', ');
          await client.query(
            `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})`,
            values
          );
        }

        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        console.error(`[ai-config:${resource}] put:`, error.message);
        client.release();
        return res.status(500).json({ success: false, message: 'Falha ao salvar dados.' });
      }
      client.release();

      const result = await pool.query(
        `SELECT * FROM ${table} WHERE establishment_id = $1 ORDER BY sort_order ASC, id ASC`,
        [establishmentId]
      );
      return res.json({ success: true, data: result.rows.map(mapRow) });
    }
  );
}

module.exports = (pool) => {
  const router = express.Router({ mergeParams: true });

  // Links externos -----------------------------------------------------------
  buildListRouter(router, pool, {
    resource: 'ai-external-links',
    table: 'ai_external_links',
    columns: ['link_key', 'title', 'url', 'description', 'is_active'],
    mapRow: (row) => ({
      id: row.id,
      link_key: row.link_key,
      title: row.title,
      url: row.url,
      description: row.description,
      is_active: Boolean(row.is_active),
    }),
    sanitizeItem: (item) => ({
      link_key: str(item.link_key, 40) || 'custom',
      title: str(item.title, 120),
      url: str(item.url, 2000),
      description: str(item.description, 500),
      is_active: item.is_active === undefined ? true : Boolean(item.is_active),
    }),
  });

  // Quebra-gelos --------------------------------------------------------------
  buildListRouter(router, pool, {
    resource: 'ai-ice-breakers',
    table: 'ai_ice_breakers',
    columns: ['channel', 'label', 'question', 'is_active'],
    mapRow: (row) => ({
      id: row.id,
      channel: row.channel,
      label: row.label,
      question: row.question,
      is_active: Boolean(row.is_active),
    }),
    sanitizeItem: (item) => {
      const question = str(item.question, 160);
      if (!question) return null;
      const channel = ['whatsapp', 'instagram'].includes(str(item.channel).toLowerCase())
        ? str(item.channel).toLowerCase()
        : 'whatsapp';
      return {
        channel,
        label: str(item.label, 60),
        question,
        is_active: item.is_active === undefined ? true : Boolean(item.is_active),
      };
    },
  });

  // Figurinhas ----------------------------------------------------------------
  buildListRouter(router, pool, {
    resource: 'ai-stickers',
    table: 'ai_stickers',
    columns: ['trigger', 'media_id', 'url', 'description', 'is_active'],
    mapRow: (row) => ({
      id: row.id,
      trigger: row.trigger,
      media_id: row.media_id,
      url: row.url,
      description: row.description,
      is_active: Boolean(row.is_active),
    }),
    sanitizeItem: (item) => {
      const mediaId = str(item.media_id, 2000);
      const url = str(item.url, 2000);
      if (!mediaId && !url) return null;
      return {
        trigger: str(item.trigger, 120),
        media_id: mediaId,
        url,
        description: str(item.description, 500),
        is_active: item.is_active === undefined ? true : Boolean(item.is_active),
      };
    },
  });

  // Números habilitados -------------------------------------------------------
  buildListRouter(router, pool, {
    resource: 'ai-allowed-numbers',
    table: 'ai_allowed_numbers',
    columns: ['phone_e164', 'label'],
    mapRow: (row) => ({
      id: row.id,
      phone_e164: row.phone_e164,
      label: row.label,
    }),
    sanitizeItem: (item) => {
      const phone = digitsOnly(item.phone_e164);
      if (phone.length < 10) return null;
      return {
        phone_e164: phone,
        label: str(item.label, 80),
        __dedupeKey: phone,
      };
    },
  });

  return router;
};
