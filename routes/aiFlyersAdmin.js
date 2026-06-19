/**
 * CRUD de Flyers por estabelecimento (aba "Flyers" em Configurações de IA).
 * Cada flyer tem uma imagem (hospedada no Cloudinary, pasta whatsapp-flyers),
 * um evento de disparo e uma legenda. Enviados automaticamente pelo flyerService.
 */
const express = require('express');
const multer = require('multer');
const auth = require('../middleware/auth');
const authorize = require('../middleware/authorize');
const cloudinaryService = require('../services/cloudinaryService');

const ADMIN_ROLES = ['admin', 'gerente', 'administrador', 'recepção'];
const TRIGGER_EVENTS = new Set(['reserva_criada', 'reserva_cancelada', 'pos_visita']);

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

function normalizeEvent(value) {
  const v = String(value || '').trim().toLowerCase();
  return TRIGGER_EVENTS.has(v) ? v : 'reserva_criada';
}

function mapRow(row) {
  return {
    id: row.id,
    trigger_event: row.trigger_event,
    title: row.title,
    caption: row.caption,
    media_url: row.media_url,
    delay_hours: Number(row.delay_hours) || 0,
    is_active: Boolean(row.is_active),
  };
}

module.exports = (pool) => {
  const router = express.Router({ mergeParams: true });

  // Listar flyers da casa
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
        const result = await pool.query(
          `SELECT id, trigger_event, title, caption, media_url, delay_hours, is_active
             FROM ai_flyers
            WHERE establishment_id = $1
            ORDER BY sort_order ASC, id ASC`,
          [establishmentId]
        );
        return res.json({ success: true, data: result.rows.map(mapRow) });
      } catch (error) {
        console.error('[ai-flyers] list:', error.message);
        return res.status(500).json({ success: false, message: 'Falha ao carregar flyers.' });
      }
    }
  );

  // Criar flyer (com imagem)
  router.post(
    '/establishments/:id/ai-flyers',
    auth,
    authorize(...ADMIN_ROLES),
    upload.single('image'),
    async (req, res) => {
      const establishmentId = parseEstablishmentId(req.params.id);
      if (!establishmentId) {
        return res.status(400).json({ success: false, message: 'ID de estabelecimento inválido.' });
      }
      const file = req.file;
      if (!file) {
        return res.status(400).json({ success: false, message: 'Imagem do flyer é obrigatória (campo "image").' });
      }
      if (!(file.mimetype || '').startsWith('image/')) {
        return res.status(400).json({ success: false, message: 'Apenas arquivos de imagem são permitidos.' });
      }
      try {
        const ext = ((file.mimetype || 'image/jpeg').split('/')[1] || 'jpg').split(';')[0];
        const fileName = `flyer_${establishmentId}_${Date.now()}.${ext}`;
        const uploaded = await cloudinaryService.uploadFile(fileName, file.buffer, {
          folder: 'whatsapp-flyers',
        });

        const result = await pool.query(
          `INSERT INTO ai_flyers
             (establishment_id, trigger_event, title, caption, media_url, media_public_id, delay_hours, is_active, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8,
             COALESCE((SELECT MAX(sort_order) + 1 FROM ai_flyers WHERE establishment_id = $1), 0))
           RETURNING id, trigger_event, title, caption, media_url, delay_hours, is_active`,
          [
            establishmentId,
            normalizeEvent(req.body?.trigger_event),
            str(req.body?.title, 120),
            str(req.body?.caption, 2000),
            uploaded.secureUrl,
            uploaded.publicId || '',
            Math.max(0, Number(req.body?.delay_hours) || 0),
            req.body?.is_active === undefined ? true : String(req.body.is_active) !== 'false',
          ]
        );
        return res.json({ success: true, data: mapRow(result.rows[0]) });
      } catch (error) {
        console.error('[ai-flyers] create:', error.message);
        return res.status(500).json({ success: false, message: 'Falha ao criar flyer.' });
      }
    }
  );

  // Atualizar metadados (e opcionalmente trocar a imagem)
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

        if (req.body?.trigger_event !== undefined) {
          fields.push(`trigger_event = $${idx++}`);
          params.push(normalizeEvent(req.body.trigger_event));
        }
        if (req.body?.title !== undefined) {
          fields.push(`title = $${idx++}`);
          params.push(str(req.body.title, 120));
        }
        if (req.body?.caption !== undefined) {
          fields.push(`caption = $${idx++}`);
          params.push(str(req.body.caption, 2000));
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
            RETURNING id, trigger_event, title, caption, media_url, delay_hours, is_active`,
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

  // Remover flyer (e apagar a imagem do Cloudinary)
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
