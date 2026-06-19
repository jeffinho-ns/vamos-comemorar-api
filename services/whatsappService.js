class WhatsAppApiError extends Error {
  constructor(message, { status, responseBody, isTransient }) {
    super(message);
    this.name = 'WhatsAppApiError';
    this.status = status;
    this.responseBody = responseBody;
    this.isTransient = Boolean(isTransient);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientWhatsAppFailure(status, responseBody) {
  if ([429, 500, 502, 503, 504].includes(Number(status))) return true;
  const error = responseBody?.error;
  if (error?.is_transient === true) return true;
  return [1, 2, 4, 17, 32, 341].includes(Number(error?.code));
}

async function postGraphMessage(payload, failureLabel) {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!accessToken) {
    throw new Error('WHATSAPP_ACCESS_TOKEN não definido no ambiente.');
  }

  if (!phoneNumberId) {
    throw new Error('WHATSAPP_PHONE_NUMBER_ID não definido no ambiente.');
  }

  const url = `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`;
  const delaysMs = [0, 750, 2000];
  let lastError = null;

  for (let attempt = 0; attempt < delaysMs.length; attempt += 1) {
    if (delaysMs[attempt] > 0) {
      await sleep(delaysMs[attempt]);
    }

    let response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
    } catch (fetchError) {
      lastError = new WhatsAppApiError(`${failureLabel}: ${fetchError.message || fetchError}`, {
        status: 0,
        responseBody: null,
        isTransient: true,
      });

      if (attempt === delaysMs.length - 1) {
        throw lastError;
      }

      console.warn(
        `[whatsappService] ${failureLabel} falhou por rede; retry ${attempt + 1}/${delaysMs.length - 1}`,
        { error: fetchError.message || String(fetchError) }
      );
      continue;
    }

    const responseBody = await response.json().catch(() => ({}));

    if (response.ok) {
      return responseBody;
    }

    const isTransient = isTransientWhatsAppFailure(response.status, responseBody);
    lastError = new WhatsAppApiError(
      `${failureLabel}: ${response.status} ${JSON.stringify(responseBody)}`,
      {
        status: response.status,
        responseBody,
        isTransient,
      }
    );

    if (!isTransient || attempt === delaysMs.length - 1) {
      throw lastError;
    }

    console.warn(
      `[whatsappService] ${failureLabel} transitória; retry ${attempt + 1}/${delaysMs.length - 1}`,
      {
        status: response.status,
        code: responseBody?.error?.code,
        fbtrace_id: responseBody?.error?.fbtrace_id,
      }
    );
  }

  throw lastError || new Error(failureLabel);
}

function buildPublicWhatsAppErrorMessage(error) {
  if (error instanceof WhatsAppApiError && error.isTransient) {
    return 'WhatsApp temporariamente indisponível pela Meta. Tente enviar novamente em alguns segundos; este erro não pausa a IA automaticamente.';
  }
  return error?.message || 'Erro ao enviar mensagem no WhatsApp';
}

function isWhatsAppTransientError(error) {
  return error instanceof WhatsAppApiError && error.isTransient;
}

async function sendMessage(to, text) {
  if (!to || typeof to !== 'string') {
    throw new Error('Parâmetro "to" inválido para envio de mensagem.');
  }

  if (!text || typeof text !== 'string') {
    throw new Error('Parâmetro "text" inválido para envio de mensagem.');
  }

  return postGraphMessage(
    {
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: {
        body: text,
      },
    },
    'Falha ao enviar mensagem no WhatsApp'
  );
}

async function sendTemplateMessage(to, template) {
  if (!to || typeof to !== 'string') {
    throw new Error('Parâmetro "to" inválido para envio de template.');
  }

  if (!template || typeof template !== 'object') {
    throw new Error('Parâmetro "template" inválido para envio de template.');
  }

  return postGraphMessage(
    {
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template,
    },
    'Falha ao enviar template no WhatsApp'
  );
}

async function sendSticker(to, { mediaId, link } = {}) {
  if (!to || typeof to !== 'string') {
    throw new Error('Parâmetro "to" inválido para envio de figurinha.');
  }
  const sticker = mediaId ? { id: String(mediaId) } : link ? { link: String(link) } : null;
  if (!sticker) {
    throw new Error('Figurinha sem media_id nem URL.');
  }

  return postGraphMessage(
    {
      messaging_product: 'whatsapp',
      to,
      type: 'sticker',
      sticker,
    },
    'Falha ao enviar figurinha no WhatsApp'
  );
}

module.exports = {
  buildPublicWhatsAppErrorMessage,
  isWhatsAppTransientError,
  sendMessage,
  sendTemplateMessage,
  sendSticker,
  WhatsAppApiError,
};
