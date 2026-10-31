const { instagramSenderId } = require('./instagramIdentity');

function instagramAccessToken() {
  return (
    String(process.env.INSTAGRAM_ACCESS_TOKEN || process.env.IG_ACCESS_TOKEN || '').trim() || null
  );
}

function instagramUserId() {
  return String(process.env.INSTAGRAM_USER_ID || process.env.IG_USER_ID || '').trim() || null;
}

function instagramMessagesUrl() {
  const version = String(process.env.INSTAGRAM_GRAPH_VERSION || 'v21.0').replace(/^\//, '');
  const userId = instagramUserId();
  if (userId) return `https://graph.facebook.com/${version}/${userId}/messages`;
  return `https://graph.instagram.com/${version}/me/messages`;
}

async function sendInstagramMessage(to, text) {
  const recipientId = instagramSenderId(to) || String(to || '').replace(/\D/g, '');
  const token = instagramAccessToken();
  const body = String(text || '').trim();
  if (!recipientId || !body) {
    throw new Error('Parâmetros inválidos para envio no Instagram.');
  }
  if (!token) {
    throw new Error('IG_ACCESS_TOKEN ou INSTAGRAM_ACCESS_TOKEN não definido no ambiente.');
  }

  const response = await fetch(instagramMessagesUrl(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
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
  return Boolean(instagramAccessToken());
}

module.exports = {
  sendInstagramMessage,
  isInstagramConfigured,
  instagramAccessToken,
  instagramUserId,
};
