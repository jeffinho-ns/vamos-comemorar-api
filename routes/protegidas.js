const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const authorize = require('../middleware/authorize');

// Rota protegida: apenas ADMIN
router.get('/admin', auth, authorize('Administrador'), (req, res) => {
  res.json({ message: 'Bem-vindo à área administrativa!' });
});

// Exemplo: rota que permite ADMIN ou GERENTE
router.get('/painel-eventos', auth, authorize('Administrador', 'Gerente'), (req, res) => {
  res.json({ message: 'Acesso ao painel de eventos' });
});

module.exports = router;
