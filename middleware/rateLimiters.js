const rateLimit = require('express-rate-limit');

function createLimiter({ windowMs, max, standardHeaders = true, legacyHeaders = false, message }) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders,
    legacyHeaders,
    message: message || { error: 'Too many requests' },
  });
}

// 60 req/min por IP (padrão solicitado)
const limiter60PerMin = createLimiter({
  windowMs: 60 * 1000,
  max: 60,
  message: { error: 'Rate limit excedido (60 req/min). Tente novamente em instantes.' },
});

// Mais restritivo para requests sem Referer/Origin (mais provável de scraping/hotlink direto)
const limiter20PerMinNoRef = createLimiter({
  windowMs: 60 * 1000,
  max: 20,
  message: { error: 'Rate limit excedido (20 req/min sem Referer/Origin).' },
});

module.exports = {
  limiter60PerMin,
  limiter20PerMinNoRef,
};

