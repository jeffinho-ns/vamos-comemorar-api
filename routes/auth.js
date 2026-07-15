'use strict';

const express = require("express");
const jwt = require("jsonwebtoken");
const router = express.Router();
const pool = require("../config/database");
const passport = require("passport");
const { buildTokenPayload } = require("../tenancy/jwtClaims");
const { isUserOrganizationSuspended } = require("../tenancy/organizationSuspension");

require("../middleware/passport");

const generateToken = async (user) => {
  const payload = await buildTokenPayload(pool, {
    id: user.id,
    email: user.email,
    role: user.role || "Cliente",
    is_super_admin: user.is_super_admin,
  });
  if (user.nome || user.name) {
    payload.nome = user.nome || user.name;
  }
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "7d" });
};

// Rota para iniciar login com Google

router.get("/google", passport.authenticate("google", { scope: ["profile", "email"] }));

router.get(
  "/google/callback",
  passport.authenticate("google", { session: false, failureRedirect: "/login" }),
  async (req, res) => {
    try {
      const token = await generateToken(req.user);
      res.redirect(
        `https://vamos-comemorar-mobile.vercel.app/social-auth?token=${token}&userId=${req.user.id}`
      );
    } catch (err) {
      console.error("Erro ao gerar token Google:", err);
      res.redirect("/login");
    }
  }
);


// Rota para login social via POST (opcional)
router.post("/login", async (req, res) => {
  try {
    const { nome, email, provider } = req.body;

    if (!email || !provider) {
      return res.status(400).json({ message: "Credenciais inválidas!" });
    }

    const result = await pool.query("SELECT * FROM users WHERE email = $1", [email]);

    let user;
    if (result.rows.length > 0) {
      user = result.rows[0];
    } else {
      const insertResult = await pool.query(
        "INSERT INTO users (nome, email, role, provider, createdAt) VALUES ($1, $2, $3, $4, NOW()) RETURNING id",
        [nome, email, "Cliente", provider]
      );

      user = { id: insertResult.rows[0].id, nome, email, role: "Cliente", provider };
    }

    if (!user.is_super_admin && (await isUserOrganizationSuspended(pool, user.id))) {
      return res.status(403).json({
        message:
          "Acesso suspenso. Entre em contato com o suporte para regularizar sua assinatura.",
      });
    }

    const token = await generateToken(user);

    res.json({ token, user });
  } catch (error) {
    console.error("Erro ao autenticar:", error);
    res.status(500).json({ message: "Erro no servidor" });
  }
});

module.exports = router;
