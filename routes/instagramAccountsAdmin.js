const express = require('express');
const auth = require('../middleware/auth');
const authorize = require('../middleware/authorize');
const {
  getByEstablishmentId,
  toPublicAccount,
  upsertAccount,
  disconnectAccount,
} = require('../services/instagram/instagramAccountService');

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
    '/establishments/:id/instagram-account',
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
          data: toPublicAccount(row) || {
            establishment_id: establishmentId,
            ig_user_id: null,
            page_id: null,
            username: null,
            is_active: false,
            has_token: false,
            token_hint: null,
          },
        });
      } catch (error) {
        if (String(error.message || '').includes('instagram_accounts')) {
          return res.status(503).json({
            success: false,
            message: 'Rode a migration instagram_accounts no banco para ligar o Instagram por casa.',
          });
        }
        console.error('[instagram-account] get:', error.message);
        return res.status(500).json({ success: false, message: 'Falha ao carregar o Instagram da casa.' });
      }
    }
  );

  router.put(
    '/establishments/:id/instagram-account',
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
        const row = await upsertAccount(pool, establishmentId, req.body || {});
        return res.json({ success: true, data: toPublicAccount(row) });
      } catch (error) {
        const status = Number(error.statusCode) || 500;
        if (status >= 500) console.error('[instagram-account] put:', error.message);
        return res.status(status).json({
          success: false,
          message: status >= 500 ? 'Falha ao salvar o Instagram da casa.' : error.message,
        });
      }
    }
  );

  router.delete(
    '/establishments/:id/instagram-account',
    auth,
    authorize(...ADMIN_ROLES),
    async (req, res) => {
      try {
        const establishmentId = parseEstablishmentId(req.params.id);
        if (!establishmentId) {
          return res.status(400).json({ success: false, message: 'ID de estabelecimento inválido.' });
        }
        await disconnectAccount(pool, establishmentId);
        return res.json({ success: true, data: { disconnected: true } });
      } catch (error) {
        console.error('[instagram-account] delete:', error.message);
        return res.status(500).json({ success: false, message: 'Falha ao desconectar o Instagram.' });
      }
    }
  );

  return router;
};
