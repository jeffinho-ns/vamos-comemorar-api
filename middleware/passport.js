const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { clientID, clientSecret, callbackURL } = require('../config/google');
const pool = require('../config/database');

// ✅ Protege o código contra ausência das variáveis
if (!clientID || !clientSecret || !callbackURL) {
  console.warn('⚠️ Variáveis do Google OAuth não definidas. Estratégia não será inicializada.');
} else {
  passport.use(
    new GoogleStrategy(
      { clientID, clientSecret, callbackURL },
      async (accessToken, refreshToken, profile, done) => {
        const email = profile.emails[0].value;
        const nome = profile.displayName;
        const foto_perfil = profile.photos[0]?.value;

        try {
          const [user] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);

          if (user.length > 0) {
            return done(null, user[0]);
          }

          const [result] = await pool.query(
            'INSERT INTO users (nome, email, foto_perfil, role) VALUES (?, ?, ?, ?)',
            [nome, email, foto_perfil, 'Cliente']
          );

          const newUser = { id: result.insertId, nome, email, foto_perfil, role: 'Cliente' };
          return done(null, newUser);
        } catch (err) {
          return done(err, null);
        }
      }
    )
  );
}

passport.serializeUser((user, done) => {
  done(null, user);
});

passport.deserializeUser((user, done) => {
  done(null, user);
});
