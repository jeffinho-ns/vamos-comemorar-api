const express = require("express");
const jwt = require("jsonwebtoken");
const router = express.Router();
const db = require("../config/database");
const passport = require("passport");

require("../middleware/passport");

const generateToken = (user) => {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      nome: user.nome || user.name, // adapta nome se vier em inglês
      role: user.role || "Cliente",
    },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
};

// Rota para iniciar login com Google

router.get("/google", passport.authenticate("google", { scope: ["profile", "email"] }));

router.get(
  "/google/callback",
  passport.authenticate("google", { session: false, failureRedirect: "/login" }),
  (req, res) => {
    const token = generateToken(req.user);
    res.redirect(
      `https://vamos-comemorar-mobile.vercel.app/social-auth?token=${token}&userId=${req.user.id}`
    );
  }
);


// Rota para login social via POST (opcional)
router.post("/login", async (req, res) => {
  try {
    const { nome, email, provider } = req.body;

    if (!email || !provider) {
      return res.status(400).json({ message: "Credenciais inválidas!" });
    }

    const [existingUser] = await db.query("SELECT * FROM users WHERE email = ?", [email]);

    let user;
    if (existingUser.length > 0) {
      user = existingUser[0];
    } else {
      const [result] = await db.query(
        "INSERT INTO users (nome, email, role, provider, createdAt) VALUES (?, ?, ?, ?, NOW())",
        [nome, email, "Cliente", provider]
      );

      user = { id: result.insertId, nome, email, role: "Cliente", provider };
    }

    const token = generateToken(user);

    res.json({ token, user });
  } catch (error) {
    console.error("Erro ao autenticar:", error);
    res.status(500).json({ message: "Erro no servidor" });
  }
});

module.exports = router;
