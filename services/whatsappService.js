async function sendMessage(to, text) {
  if (!to || typeof to !== 'string') {
    throw new Error('Parâmetro "to" inválido para envio de mensagem.');
  }

  if (!text || typeof text !== 'string') {
    throw new Error('Parâmetro "text" inválido para envio de mensagem.');
  }

  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!accessToken) {
    throw new Error('WHATSAPP_ACCESS_TOKEN não definido no ambiente.');
  }

  if (!phoneNumberId) {
    throw new Error('WHATSAPP_PHONE_NUMBER_ID não definido no ambiente.');
  }

  const url = `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: {
        body: text,
      },
    }),
  });

  const responseBody = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      `Falha ao enviar mensagem no WhatsApp: ${response.status} ${JSON.stringify(responseBody)}`
    );
  }

  return responseBody;
}

module.exports = {
  sendMessage,
};
