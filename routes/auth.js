const express = require("express");
const jwt = require("jsonwebtoken");
const router = express.Router();
const db = require("../config/database");
const passport = require('passport');

// Função para gerar JWT
const generateToken = (user) => {
  return jwt.sign(
    { id: user.id, email: user.email, name: user.name },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
};


require('../middleware/passport');

// Inicia login com Google
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

// Callback do Google
router.get(
  '/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: '/login' }),
  (req, res) => {
    const token = jwt.sign(req.user, process.env.JWT_SECRET, { expiresIn: '1d' });

    // Redireciona para o front-end com o token e user info na URL (pode usar query ou JWT em cookie)
    const redirectUrl = `https://vamos-comemorar-mobile.vercel.app/oauth-success?token=${token}`;
    res.redirect(redirectUrl);
  }
);

// Rota de Login com Google/Facebook
router.post("/login", async (req, res) => {
  try {
    const { name, email, provider } = req.body;

    if (!email || !provider) {
      return res.status(400).json({ message: "Credenciais inválidas!" });
    }

    // Verifica se o usuário já existe no banco de dados
    const [existingUser] = await db.query("SELECT * FROM users WHERE email = ?", [email]);

    let user;
    if (existingUser.length > 0) {
      user = existingUser[0];
    } else {
      // Criando novo usuário no banco de dados
      const [result] = await db.query(
        "INSERT INTO users (name, email, provider, createdAt) VALUES (?, ?, ?, NOW())",
        [name, email, provider]
      );

      user = { id: result.insertId, name, email, provider };
    }

    const token = generateToken(user);

    res.json({ token, user });
  } catch (error) {
    console.error("Erro ao autenticar:", error);
    res.status(500).json({ message: "Erro no servidor" });
  }
});

module.exports = router;
