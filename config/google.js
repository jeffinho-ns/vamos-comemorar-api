const clientID = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
const callbackURL = process.env.GOOGLE_CALLBACK_URL || '/auth/google/callback';

if (!clientID || !clientSecret) {
  console.warn("⚠️ Variáveis do Google OAuth não estão definidas. A autenticação social pode falhar.");
}

module.exports = {
  clientID,
  clientSecret,
  callbackURL,
};
