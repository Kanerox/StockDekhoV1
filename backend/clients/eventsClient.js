const { getMarketDataProvider } = require("../providers/marketData");
const { getCachedValue, setCacheEntry } = require("./cacheClient");
const {
  isProviderCoolingDown,
  isRateLimitError,
  providerCacheKey,
  startProviderCooldown,
} = require("./providerCachePolicy");

const FRESH_EVENTS_TTL_MS = 6 * 60 * 60 * 1000;
const STALE_EVENTS_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const requestsInFlight = new Map();

function normalizeSymbol(symbol) {
  const normalized = String(symbol || "").trim().toUpperCase();
  if (!normalized) throw new Error("A stock symbol is required");
  if (normalized.endsWith(".NS") || normalized.endsWith(".BO")) return normalized;
  return `${normalized}.NS`;
}

async function fetchCompanyEvents(symbol) {
  const normalizedSymbol = normalizeSymbol(symbol);
  const key = providerCacheKey(`events:${normalizedSymbol}`);
  const fresh = await getCachedValue(key, FRESH_EVENTS_TTL_MS);
  if (fresh) return fresh;

  if (await isProviderCoolingDown()) {
    const stale = await getCachedValue(key, STALE_EVENTS_TTL_MS);
    if (stale) return stale;
    throw new Error("Market data provider is temporarily rate limited");
  }

  if (requestsInFlight.has(key)) return requestsInFlight.get(key);

  const request = (async () => {
    try {
      const result = await getMarketDataProvider().quoteSummary(normalizedSymbol, {
        modules: ["calendarEvents", "summaryDetail", "earningsHistory"],
      });
      await setCacheEntry(key, result, STALE_EVENTS_TTL_MS);
      return result;
    } catch (error) {
      if (isRateLimitError(error)) await startProviderCooldown();
      const stale = await getCachedValue(key, STALE_EVENTS_TTL_MS);
      if (stale) return stale;
      throw error;
    } finally {
      requestsInFlight.delete(key);
    }
  })();

  requestsInFlight.set(key, request);
  return request;
}

module.exports = { fetchCompanyEvents };
