const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { clientID, clientSecret, callbackURL } = require('../config/google');
const pool = require('../config/database');

if (!clientID || !clientSecret || !callbackURL) {
  console.warn('⚠️ Variáveis do Google OAuth não definidas. Estratégia não será inicializada.');
} else {
  passport.use(
    new GoogleStrategy(
      { clientID, clientSecret, callbackURL },
      async (accessToken, refreshToken, profile, done) => {
        try {
          const email = profile.emails?.[0]?.value;
          const nome = profile.displayName;
          const foto_perfil = profile.photos?.[0]?.value;

          if (!email) {
            return done(new Error('Email não fornecido pelo Google'), null);
          }

          const [userResult] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);

          if (userResult.length > 0) {
            return done(null, userResult[0]);
          }

          const [insertResult] = await pool.query(
            'INSERT INTO users (name, email, foto_perfil, role, created_at, provider) VALUES (?, ?, ?, ?, NOW(), ?)',
            [nome, email, foto_perfil, 'Cliente', 'google']
          );

          const newUser = {
            id: insertResult.insertId,
            nome,
            email,
            foto_perfil,
            role: 'Cliente',
            provider: 'google',
          };

          return done(null, newUser);
        } catch (err) {
          console.error('Erro no login com Google:', err);
          return done(err, null);
        }
      }
    )
  );
}

passport.serializeUser((user, done) => {
  // Serializa apenas o necessário
  done(null, {
    id: user.id,
    email: user.email,
    nome: user.nome,
    role: user.role,
    foto_perfil: user.foto_perfil,
  });
});

passport.deserializeUser((user, done) => {
  done(null, user);
});
