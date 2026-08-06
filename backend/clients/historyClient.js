const {
  getMarketDataProvider,
  getMarketDataProviderName,
} = require("../providers/marketData");
const { getCachedValue, setCacheEntry } = require("./cacheClient");

const FRESH_HISTORY_TTL_MS = 6 * 60 * 60 * 1000;
const STALE_HISTORY_TTL_MS = 48 * 60 * 60 * 1000;
const RATE_LIMIT_COOLDOWN_MS = 15 * 60 * 1000;
const requestsInFlight = new Map();

function normalizeSymbol(symbol) {
  const normalized = String(symbol || "").trim().toUpperCase();
  if (!normalized) throw new Error("A stock symbol is required");

  if (
    normalized.startsWith("^") ||
    normalized.endsWith(".NS") ||
    normalized.endsWith(".BO")
  ) {
    return normalized;
  }
  return `${normalized}.NS`;
}

function dateKey(date) {
  const value = new Date(date);
  if (Number.isNaN(value.getTime())) throw new Error("Invalid historical date");
  return value.toISOString().slice(0, 10);
}

function historyCacheKey(symbol, period1, period2) {
  const key = `history:${symbol}:1d:${dateKey(period1)}:${dateKey(period2)}`;
  const providerName = getMarketDataProviderName();
  return providerName === "yahoo" ? key : `${providerName}:${key}`;
}

function cooldownCacheKey() {
  return `${getMarketDataProviderName()}:blocked-until`;
}

function isRateLimitError(error) {
  const status = error?.response?.status || error?.status || error?.statusCode;
  const message = String(error?.message || "").toLowerCase();
  return status === 429 || message.includes("429") || message.includes("too many requests") || message.includes("failed to get crumb");
}

async function isYahooCoolingDown() {
  const blockedUntil = await getCachedValue(
    cooldownCacheKey(),
    RATE_LIMIT_COOLDOWN_MS
  );
  return Number(blockedUntil) > Date.now();
}

async function startRateLimitCooldown() {
  const blockedUntil = Date.now() + RATE_LIMIT_COOLDOWN_MS;
  await setCacheEntry(cooldownCacheKey(), blockedUntil, RATE_LIMIT_COOLDOWN_MS);
}

async function fetchHistoricalPrices(symbol, period1, period2) {
  const normalizedSymbol = normalizeSymbol(symbol);
  const key = historyCacheKey(normalizedSymbol, period1, period2);
  const freshPrices = await getCachedValue(key, FRESH_HISTORY_TTL_MS);
  if (freshPrices) return freshPrices;

  if (await isYahooCoolingDown()) {
    const stalePrices = await getCachedValue(key, STALE_HISTORY_TTL_MS);
    if (stalePrices) return stalePrices;
    throw new Error("Yahoo Finance is temporarily rate limited");
  }

  if (requestsInFlight.has(key)) return requestsInFlight.get(key);

  const requestPromise = (async () => {
    try {
      const result = await getMarketDataProvider().chart(normalizedSymbol, {
        period1,
        period2,
        interval: "1d",
      });

      const prices = (result.quotes || [])
        .filter((quote) => quote.date && Number.isFinite(quote.close))
        .map((quote) => ({
          date: quote.date,
          close: quote.close,
          adjustedClose: Number.isFinite(quote.adjclose) ? quote.adjclose : quote.close,
        }));

      await setCacheEntry(key, prices, STALE_HISTORY_TTL_MS);
      return prices;
    } catch (error) {
      const stalePrices = await getCachedValue(key, STALE_HISTORY_TTL_MS);
      if (stalePrices) {
        console.warn(`Using stale historical prices for ${normalizedSymbol}`);
        return stalePrices;
      }

      if (isRateLimitError(error)) {
        await startRateLimitCooldown();
        throw new Error("Yahoo Finance is temporarily rate limited");
      }
      throw error;
    } finally {
      requestsInFlight.delete(key);
    }
  })();

  requestsInFlight.set(key, requestPromise);
  return requestPromise;
}

module.exports = { fetchHistoricalPrices };
