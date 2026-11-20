'use strict';

/**
 * Helpers de mock para cenários Wame/Meta.
 * Nenhum helper aqui envia WhatsApp real nem altera sessão/instância remota.
 */

function metaStylePayload({
  field = 'messages',
  displayPhone = '551130322934',
  phoneNumberId = 'highlineKey7',
  from = '5511988776655',
  messageId = 'wamid.TEST001',
  text = 'oi',
  fromMe = false,
  statuses = null,
} = {}) {
  const value = {
    metadata: {
      display_phone_number: displayPhone,
      phone_number_id: phoneNumberId,
    },
    contacts: [{ wa_id: from }],
  };

  if (statuses) {
    value.statuses = statuses;
  } else {
    value.messages = [
      {
        from: fromMe ? displayPhone : from,
        id: messageId,
        type: 'text',
        text: { body: text },
        ...(fromMe ? { from_me: true } : {}),
      },
    ];
  }

  return {
    provider: 'whatsapp',
    entry: [{ changes: [{ field, value }] }],
  };
}

function mockPool(handlers = {}) {
  return {
    query: async (sql, params) => {
      if (typeof handlers.query === 'function') {
        return handlers.query(sql, params);
      }
      return { rows: [], rowCount: 0 };
    },
  };
}

function installFetchMock(impl) {
  const original = global.fetch;
  const calls = [];
  global.fetch = async (url, opts = {}) => {
    const entry = {
      url: String(url),
      method: String(opts.method || 'GET').toUpperCase(),
      body: opts.body ? JSON.parse(opts.body) : null,
    };
    calls.push(entry);
    return impl(entry, opts);
  };
  return {
    calls,
    restore() {
      global.fetch = original;
    },
  };
}

function jsonResponse(status, body = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

function withEnv(vars, fn) {
  const prev = {};
  for (const [key, value] of Object.entries(vars)) {
    prev[key] = process.env[key];
    if (value == null) delete process.env[key];
    else process.env[key] = String(value);
  }
  const restore = () => {
    for (const [key, value] of Object.entries(prev)) {
      if (value == null) delete process.env[key];
      else process.env[key] = value;
    }
  };
  if (typeof fn !== 'function') return restore;
  return (async () => {
    try {
      return await fn();
    } finally {
      restore();
    }
  })();
}

const FIXTURES = {
  HIGHLINE_ID: 7,
  JUSTINO_ID: 1,
  PRACINHA_ID: 8,
  ROOFTOP_ID: 9,
  HIGHLINE_PHONE: '551130322934',
  JUSTINO_PHONE: '551152003650',
  PRACINHA_PHONE: '551123050938',
  ROOFTOP_PHONE: '551142803345',
  HIGHLINE_INSTANCE: 'highlineKey7',
  JUSTINO_INSTANCE: 'justinoKey1',
  CUSTOMER: '5511988776655',
};

module.exports = {
  metaStylePayload,
  mockPool,
  installFetchMock,
  jsonResponse,
  withEnv,
  FIXTURES,
};
