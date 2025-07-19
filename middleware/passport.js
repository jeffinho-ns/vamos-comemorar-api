// routes/auth.js (ou onde você define as rotas de autenticação)
const express = require('express');
const router = express.Router();
const { OAuth2Client } = require('google-auth-library');
const jwt = require('jsonwebtoken');
const pool = require('../config/database');

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const client = new OAuth2Client(CLIENT_ID);

// Rota para autenticação via Google (usada pelo Flutter)
router.post('/google-mobile', async (req, res) => {
  const { idToken } = req.body;

  if (!idToken) {
    return res.status(400).json({ error: 'idToken não fornecido' });
  }

  try {
    // 1. Verifica token com o Google
    const ticket = await client.verifyIdToken({
      idToken,
      audience: CLIENT_ID,
    });

    const payload = ticket.getPayload();

    const email = payload.email;
    const nome = payload.name;
    const foto_perfil = payload.picture;

    if (!email) {
      return res.status(400).json({ error: 'Email não fornecido pelo Google' });
    }

    // 2. Verifica se o usuário já existe
    const [users] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);

    let user;

    if (users.length > 0) {
      user = users[0];
    } else {
      // 3. Cria usuário novo se não existir
      const [result] = await pool.query(
        'INSERT INTO users (name, email, foto_perfil, role, created_at, provider) VALUES (?, ?, ?, ?, NOW(), ?)',
        [nome, email, foto_perfil, 'Cliente', 'google']
      );

      user = {
        id: result.insertId,
        nome,
        email,
        foto_perfil,
        role: 'Cliente',
        provider: 'google',
      };
    }

    // 4. Gera um token (opcional)
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // 5. Retorna usuário e token
    return res.status(200).json({
      message: 'Login com Google bem-sucedido',
      user,
      token,
    });
  } catch (error) {
    console.error('Erro ao autenticar com Google:', error);
    return res.status(500).json({ error: 'Erro ao autenticar com Google' });
  }
});

module.exports = router;
