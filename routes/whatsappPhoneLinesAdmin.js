const express = require('express');
const auth = require('../middleware/auth');
const authorize = require('../middleware/authorize');
const {
  getByEstablishmentId,
  toPublicLine,
  upsertLine,
  disconnectLine,
} = require('../services/whatsapp/whatsappPhoneLineService');

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

module.exports = (pool) => {
  const router = express.Router({ mergeParams: true });

  router.get(
    '/establishments/:id/whatsapp-line',
    auth,
    authorize(...ADMIN_ROLES),
    async (req, res) => {
      try {
        const establishmentId = parseEstablishmentId(req.params.id);
        if (!establishmentId) {
          return res.status(400).json({ success: false, message: 'ID de estabelecimento inválido.' });
        }
        const row = await getByEstablishmentId(pool, establishmentId);
        return res.json({
          success: true,
          data: toPublicLine(row) || {
            establishment_id: establishmentId,
            phone_number_id: null,
            display_phone: null,
            is_active: false,
            has_token: false,
            token_hint: null,
          },
        });
      } catch (error) {
        if (String(error.message || '').includes('whatsapp_phone_lines')) {
          return res.status(503).json({
            success: false,
            message: 'A tabela do número WhatsApp ainda não existe neste banco.',
          });
        }
        console.error('[whatsapp-line] get:', error.message);
        return res.status(500).json({ success: false, message: 'Falha ao carregar o número da casa.' });
      }
    },
  );

  router.put(
    '/establishments/:id/whatsapp-line',
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
        const row = await upsertLine(pool, establishmentId, req.body || {});
        return res.json({ success: true, data: toPublicLine(row) });
      } catch (error) {
        const status = Number(error.statusCode) || 500;
        if (status >= 500) console.error('[whatsapp-line] put:', error.message);
        return res.status(status).json({
          success: false,
          message: status >= 500 ? 'Falha ao salvar o número da casa.' : error.message,
        });
      }
    },
  );

  router.delete(
    '/establishments/:id/whatsapp-line',
    auth,
    authorize(...ADMIN_ROLES),
    async (req, res) => {
      try {
        const establishmentId = parseEstablishmentId(req.params.id);
        if (!establishmentId) {
          return res.status(400).json({ success: false, message: 'ID de estabelecimento inválido.' });
        }
        await disconnectLine(pool, establishmentId);
        return res.json({ success: true, data: { disconnected: true } });
      } catch (error) {
        console.error('[whatsapp-line] delete:', error.message);
        return res.status(500).json({ success: false, message: 'Falha ao desconectar o número.' });
      }
    },
  );

  return router;
};
