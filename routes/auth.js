const express = require("express");
const jwt = require("jsonwebtoken");
const router = express.Router();

const users = []; // Simulando um banco de dados (substitua pelo MySQL)

// Função para gerar JWT
const generateToken = (user) => {
  return jwt.sign(
    { id: user.id, email: user.email, name: user.name },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
};

// Rota de Login com Google/Facebook
router.post("/login", async (req, res) => {
  try {
    const { name, email, provider } = req.body;

    if (!email || !provider) {
      return res.status(400).json({ message: "Credenciais inválidas!" });
    }

    let user = users.find((u) => u.email === email);

    if (!user) {
      // Criando um novo usuário se não existir
      user = {
        id: users.length + 1,
        name,
        email,
        provider,
        createdAt: new Date(),
      };
      users.push(user);
    }

    const token = generateToken(user);

    res.json({ token, user });
  } catch (error) {
    console.error("Erro ao autenticar:", error);
    res.status(500).json({ message: "Erro no servidor" });
  }
});

module.exports = router;
