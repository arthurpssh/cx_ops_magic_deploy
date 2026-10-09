// Cache em memória com TTL para leituras pouco mutáveis (listas de apoio da planilha).
// Falhas não são cacheadas e leituras concorrentes compartilham a mesma Promise.
function memo(fn, ttlMs) {
  let cached = null;
  let expiresAt = 0;
  let inflight = null;

  const wrapped = async () => {
    if (cached !== null && Date.now() < expiresAt) return cached;
    if (inflight) return inflight;

    inflight = fn()
      .then((value) => {
        cached = value;
        expiresAt = Date.now() + ttlMs;
        return value;
      })
      .finally(() => {
        inflight = null;
      });
    return inflight;
  };

  wrapped.clear = () => {
    cached = null;
    expiresAt = 0;
  };

  return wrapped;
}

module.exports = { memo };
