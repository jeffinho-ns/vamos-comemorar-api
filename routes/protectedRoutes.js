const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const authorize = require('../middleware/authorize');

// Apenas Administrador
router.get('/admin-area', auth, authorize('Administrador'), (req, res) => {
  res.json({ message: 'Bem-vindo à área administrativa!' });
});

// Administrador e Gerente
router.get('/painel-eventos', auth, authorize('Administrador', 'Gerente'), (req, res) => {
  res.json({ message: 'Acesso ao painel de eventos' });
});

// Promoter pode ver listas
router.get('/minhas-listas', auth, authorize('Promoter'), (req, res) => {
  res.json({ message: 'Acesso às suas listas de convidados' });
});

// Cliente (usuário final)
router.get('/meus-ingressos', auth, authorize('Cliente'), (req, res) => {
  res.json({ message: 'Acesso aos seus ingressos e reservas' });
});

module.exports = router;
