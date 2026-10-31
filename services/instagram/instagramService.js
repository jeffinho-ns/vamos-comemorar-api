const { instagramSenderId } = require('./instagramIdentity');
const {
  findActiveByCustomerWaId,
  findActiveByEstablishmentId,
} = require('./instagramAccountService');

function envAccessToken() {
  return (
    String(process.env.INSTAGRAM_ACCESS_TOKEN || process.env.IG_ACCESS_TOKEN || '').trim() || null
  );
}

function envUserId() {
  return String(process.env.INSTAGRAM_USER_ID || process.env.IG_USER_ID || '').trim() || null;
}

function instagramMessagesUrl(igUserId) {
  const version = String(process.env.INSTAGRAM_GRAPH_VERSION || 'v21.0').replace(/^\//, '');
  const userId = String(igUserId || '').replace(/\D/g, '');
  if (userId) return `https://graph.facebook.com/${version}/${userId}/messages`;
  return `https://graph.instagram.com/${version}/me/messages`;
}

async function defaultLookupAccount({ to, establishmentId } = {}) {
  const pool = require('../../config/database');
  if (establishmentId) {
    const byHouse = await findActiveByEstablishmentId(pool, establishmentId);
    if (byHouse) return byHouse;
  }
  if (to) return findActiveByCustomerWaId(pool, to);
  return null;
}

async function resolveSendCredentials(options = {}) {
  if (options.accessToken) {
    return {
      accessToken: String(options.accessToken).trim(),
      igUserId: options.igUserId || null,
    };
  }
  const lookup = options.lookupAccount || defaultLookupAccount;
  const account = await lookup({
    to: options.to,
    establishmentId: options.establishmentId,
  });
  if (account?.access_token) {
    return { accessToken: account.access_token, igUserId: account.ig_user_id };
  }
  return { accessToken: envAccessToken(), igUserId: envUserId() };
}

async function sendInstagramMessage(to, text, options = {}) {
  const recipientId = instagramSenderId(to) || String(to || '').replace(/\D/g, '');
  const body = String(text || '').trim();
  if (!recipientId || !body) {
    throw new Error('Parâmetros inválidos para envio no Instagram.');
  }

  const credentials = await resolveSendCredentials({ ...options, to });
  if (!credentials.accessToken) {
    throw new Error(
      'Instagram desta casa sem token. Cadastre o Direct em Configurações de IA > Instagram.'
    );
  }

  const response = await fetch(instagramMessagesUrl(credentials.igUserId), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${credentials.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      recipient: { id: recipientId },
      message: { text: body },
    }),
  });
  const responseBody = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      `Falha ao enviar mensagem no Instagram: ${response.status} ${JSON.stringify(responseBody)}`
    );
  }
  return responseBody;
}

function isInstagramConfigured() {
  return Boolean(envAccessToken());
}

module.exports = {
  sendInstagramMessage,
  isInstagramConfigured,
  resolveSendCredentials,
  instagramAccessToken: envAccessToken,
  instagramUserId: envUserId,
};
