/**
 * CRUD de artes por estabelecimento (aba Flyers): informação, datas e imagens da casa.
 */
const express = require('express');
const multer = require('multer');
const auth = require('../middleware/auth');
const authorize = require('../middleware/authorize');
const cloudinaryService = require('../services/cloudinaryService');
const {
  ASSET_KINDS,
  normalizeKindOrDefault,
  normalizeEvent,
} = require('../services/flyer/flyerAssetCatalog');
const { ensureFlyerAssetColumns } = require('../services/flyer/flyerAssetSchema');

const ADMIN_ROLES = ['admin', 'gerente', 'administrador', 'recepção'];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

function parseEstablishmentId(value) {
  const id = Number(value);
  if (!Number.isFinite(id) || id <= 0) return null;
  return id;
}

function str(value, max) {
  const s = String(value === undefined || value === null ? '' : value).trim();
  return max ? s.slice(0, max) : s;
}

function filesFromRequest(req) {
  const list = [];
  if (Array.isArray(req.files)) list.push(...req.files);
  else if (req.files && typeof req.files === 'object') {
    Object.values(req.files).forEach((group) => {
      if (Array.isArray(group)) list.push(...group);
      else if (group) list.push(group);
    });
  }
  if (req.file) list.push(req.file);
  return list.filter((file) => file && (file.mimetype || '').startsWith('image/'));
}

function mapRow(row) {
  return {
    id: row.id,
    asset_kind: normalizeKindOrDefault(row.asset_kind),
    trigger_event: row.trigger_event,
    title: row.title,
    caption: row.caption,
    usage_hint: row.usage_hint || '',
    media_url: row.media_url,
    delay_hours: Number(row.delay_hours) || 0,
    is_active: Boolean(row.is_active),
  };
}

async function insertFlyer(pool, { establishmentId, file, body }) {
  const ext = ((file.mimetype || 'image/jpeg').split('/')[1] || 'jpg').split(';')[0];
  const fileName = `flyer_${establishmentId}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}.${ext}`;
  const uploaded = await cloudinaryService.uploadFile(fileName, file.buffer, {
    folder: 'whatsapp-flyers',
  });
  const kind = normalizeKindOrDefault(body?.asset_kind);
  const usageHint = str(body?.usage_hint, 2000);
  const result = await pool.query(
    `INSERT INTO ai_flyers
       (establishment_id, asset_kind, trigger_event, title, caption, usage_hint,
        media_url, media_public_id, delay_hours, is_active, sort_order)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
       COALESCE((SELECT MAX(sort_order) + 1 FROM ai_flyers WHERE establishment_id = $1), 0))
     RETURNING id, asset_kind, trigger_event, title, caption, usage_hint, media_url, delay_hours, is_active`,
    [
      establishmentId,
      kind,
      normalizeEvent(body?.trigger_event, kind, usageHint),
      str(body?.title, 120) ||
        str(String(file.originalname || '').replace(/\.[^.]+$/, ''), 120),
      str(body?.caption, 2000),
      usageHint,
      uploaded.secureUrl,
      uploaded.publicId || '',
      Math.max(0, Number(body?.delay_hours) || 0),
      body?.is_active === undefined ? true : String(body.is_active) !== 'false',
    ]
  );
  return mapRow(result.rows[0]);
}

module.exports = (pool) => {
  const router = express.Router({ mergeParams: true });

  router.get(
    '/establishments/:id/ai-flyers',
    auth,
    authorize(...ADMIN_ROLES),
    async (req, res) => {
      const establishmentId = parseEstablishmentId(req.params.id);
      if (!establishmentId) {
        return res.status(400).json({ success: false, message: 'ID de estabelecimento inválido.' });
      }
      try {
        await ensureFlyerAssetColumns(pool);
        const kind = req.query?.kind ? normalizeKindOrDefault(req.query.kind) : null;
        const params = [establishmentId];
        let sql = `SELECT id, asset_kind, trigger_event, title, caption, usage_hint, media_url, delay_hours, is_active
             FROM ai_flyers
            WHERE establishment_id = $1`;
        if (req.query?.kind) {
          params.push(kind);
          sql += ' AND asset_kind = $2';
        }
        sql += ' ORDER BY sort_order ASC, id ASC';
        const result = await pool.query(sql, params);
        return res.json({ success: true, kinds: ASSET_KINDS, data: result.rows.map(mapRow) });
      } catch (error) {
        console.error('[ai-flyers] list:', error.message);
        return res.status(500).json({ success: false, message: 'Falha ao carregar flyers.' });
      }
    }
  );

  router.post(
    '/establishments/:id/ai-flyers',
    auth,
    authorize(...ADMIN_ROLES),
    upload.fields([
      { name: 'images', maxCount: 12 },
      { name: 'image', maxCount: 1 },
    ]),
    async (req, res) => {
      const establishmentId = parseEstablishmentId(req.params.id);
      if (!establishmentId) {
        return res.status(400).json({ success: false, message: 'ID de estabelecimento inválido.' });
      }
      const files = filesFromRequest(req);
      if (!files.length) {
        return res.status(400).json({ success: false, message: 'Selecione ao menos uma imagem.' });
      }
      try {
        await ensureFlyerAssetColumns(pool);
        const created = [];
        for (const file of files) {
          created.push(await insertFlyer(pool, { establishmentId, file, body: req.body }));
        }
        return res.json({ success: true, data: created.length === 1 ? created[0] : created });
      } catch (error) {
        console.error('[ai-flyers] create:', error.message);
        return res.status(500).json({ success: false, message: 'Falha ao criar flyer.' });
      }
    }
  );

  router.put(
    '/establishments/:id/ai-flyers/:flyerId',
    auth,
    authorize(...ADMIN_ROLES),
    upload.single('image'),
    async (req, res) => {
      const establishmentId = parseEstablishmentId(req.params.id);
      const flyerId = Number(req.params.flyerId);
      if (!establishmentId || !Number.isFinite(flyerId)) {
        return res.status(400).json({ success: false, message: 'Parâmetros inválidos.' });
      }
      try {
        const fields = [];
        const params = [];
        let idx = 1;
        const kind = req.body?.asset_kind !== undefined ? normalizeKindOrDefault(req.body.asset_kind) : null;
        const usageHint = req.body?.usage_hint !== undefined ? str(req.body.usage_hint, 2000) : null;

        if (kind) {
          fields.push(`asset_kind = $${idx++}`);
          params.push(kind);
        }
        if (req.body?.trigger_event !== undefined || usageHint !== null || kind) {
          fields.push(`trigger_event = $${idx++}`);
          params.push(
            normalizeEvent(
              req.body?.trigger_event,
              kind || 'informacao',
              usageHint || ''
            )
          );
        }
        if (req.body?.title !== undefined) {
          fields.push(`title = $${idx++}`);
          params.push(str(req.body.title, 120));
        }
        if (req.body?.caption !== undefined) {
          fields.push(`caption = $${idx++}`);
          params.push(str(req.body.caption, 2000));
        }
        if (usageHint !== null) {
          fields.push(`usage_hint = $${idx++}`);
          params.push(usageHint);
        }
        if (req.body?.delay_hours !== undefined) {
          fields.push(`delay_hours = $${idx++}`);
          params.push(Math.max(0, Number(req.body.delay_hours) || 0));
        }
        if (req.body?.is_active !== undefined) {
          fields.push(`is_active = $${idx++}`);
          params.push(String(req.body.is_active) !== 'false');
        }

        if (req.file) {
          if (!(req.file.mimetype || '').startsWith('image/')) {
            return res.status(400).json({ success: false, message: 'Apenas arquivos de imagem são permitidos.' });
          }
          const ext = ((req.file.mimetype || 'image/jpeg').split('/')[1] || 'jpg').split(';')[0];
          const fileName = `flyer_${establishmentId}_${Date.now()}.${ext}`;
          const uploaded = await cloudinaryService.uploadFile(fileName, req.file.buffer, {
            folder: 'whatsapp-flyers',
          });
          fields.push(`media_url = $${idx++}`);
          params.push(uploaded.secureUrl);
          fields.push(`media_public_id = $${idx++}`);
          params.push(uploaded.publicId || '');
        }

        if (fields.length === 0) {
          return res.status(400).json({ success: false, message: 'Nada para atualizar.' });
        }

        fields.push('updated_at = NOW()');
        params.push(flyerId, establishmentId);

        const result = await pool.query(
          `UPDATE ai_flyers SET ${fields.join(', ')}
            WHERE id = $${idx++} AND establishment_id = $${idx}
            RETURNING id, asset_kind, trigger_event, title, caption, usage_hint, media_url, delay_hours, is_active`,
          params
        );
        if (result.rows.length === 0) {
          return res.status(404).json({ success: false, message: 'Flyer não encontrado.' });
        }
        return res.json({ success: true, data: mapRow(result.rows[0]) });
      } catch (error) {
        console.error('[ai-flyers] update:', error.message);
        return res.status(500).json({ success: false, message: 'Falha ao atualizar flyer.' });
      }
    }
  );

  router.delete(
    '/establishments/:id/ai-flyers/:flyerId',
    auth,
    authorize(...ADMIN_ROLES),
    async (req, res) => {
      const establishmentId = parseEstablishmentId(req.params.id);
      const flyerId = Number(req.params.flyerId);
      if (!establishmentId || !Number.isFinite(flyerId)) {
        return res.status(400).json({ success: false, message: 'Parâmetros inválidos.' });
      }
      try {
        const result = await pool.query(
          `DELETE FROM ai_flyers WHERE id = $1 AND establishment_id = $2
           RETURNING media_public_id`,
          [flyerId, establishmentId]
        );
        if (result.rows.length === 0) {
          return res.status(404).json({ success: false, message: 'Flyer não encontrado.' });
        }
        const publicId = result.rows[0].media_public_id;
        if (publicId) {
          cloudinaryService.deleteFile(publicId).catch((e) =>
            console.warn('[ai-flyers] falha ao apagar imagem:', e.message)
          );
        }
        return res.json({ success: true });
      } catch (error) {
        console.error('[ai-flyers] delete:', error.message);
        return res.status(500).json({ success: false, message: 'Falha ao remover flyer.' });
      }
    }
  );

  return router;
};
