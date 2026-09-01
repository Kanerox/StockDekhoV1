const {
  getMarketDataProvider,
  getMarketDataProviderName,
} = require("../providers/marketData");
const { getCachedValue, setCacheEntry } = require("./cacheClient");

const YAHOO_FRESH_HISTORY_TTL_MS = 6 * 60 * 60 * 1000;
const UPSTOX_FRESH_HISTORY_TTL_MS = 5 * 60 * 1000;
const STALE_HISTORY_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const RATE_LIMIT_COOLDOWN_MS = 15 * 60 * 1000;
const requestsInFlight = new Map();

function indianHistoryFreshTtl(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(now).map((part) => [part.type, part.value]));
  const weekday = ["Mon", "Tue", "Wed", "Thu", "Fri"].includes(parts.weekday);
  const minutes = Number(parts.hour) * 60 + Number(parts.minute);
  return weekday && minutes >= 9 * 60 + 15 && minutes < 16 * 60 + 5
    ? UPSTOX_FRESH_HISTORY_TTL_MS
    : 6 * 60 * 60 * 1000;
}

function normalizeSymbol(symbol) {
  const normalized = String(symbol || "").trim().toUpperCase();
  if (!normalized) throw new Error("A stock symbol is required");

  if (
    normalized.startsWith("^") ||
    /\.[A-Z]+$/.test(normalized)
  ) {
    return normalized;
  }
  return `${normalized}.NS`;
}

function dateKey(date) {
  const value = new Date(date);
  if (Number.isNaN(value.getTime())) throw new Error("Invalid historical date");
  return value.toLocaleDateString("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function historyCacheKey(symbol, period1, period2, appendLatestQuote = true, completedSessionReconciliation = false) {
  const variant = appendLatestQuote ? "" : ":completed-only";
  const reconcileVariant = completedSessionReconciliation ? ":reconcile" : "";
  const key = `history:${symbol}:1d${variant}${reconcileVariant}:${dateKey(period1)}:${dateKey(period2)}`;
  const providerName = getMarketDataProviderName();
  const version = appendLatestQuote ? "v7" : "v10";
  return providerName === "yahoo" ? key : `${providerName}:${version}:${key}`;
}

function latestHistoryCacheKey(symbol, appendLatestQuote = true) {
  const variant = appendLatestQuote ? "" : ":completed-only";
  const key = `history:${symbol}:1d${variant}:latest`;
  const providerName = getMarketDataProviderName();
  const version = appendLatestQuote ? "v7" : "v10";
  return providerName === "yahoo" ? key : `${providerName}:${version}:${key}`;
}

function cooldownCacheKey() {
  return `${getMarketDataProviderName()}:history-blocked-until`;
}

function pricesWithinRange(prices, period1, period2) {
  const start = new Date(period1).getTime();
  const end = new Date(period2).getTime();
  return (Array.isArray(prices) ? prices : []).filter((point) => {
    const time = new Date(point.date).getTime();
    return Number.isFinite(time) && time >= start && time < end;
  });
}

async function getLatestCachedPrices(symbol, period1, period2, appendLatestQuote) {
  const latest = await getCachedValue(
    latestHistoryCacheKey(symbol, appendLatestQuote),
    STALE_HISTORY_TTL_MS
  );
  const prices = pricesWithinRange(latest, period1, period2);
  return prices.length >= 2 ? prices : null;
}

function mergePrices(existingPrices, newPrices) {
  const byDate = new Map();
  [...(Array.isArray(existingPrices) ? existingPrices : []), ...newPrices]
    .forEach((point) => {
      const key = dateKey(point.date);
      byDate.set(key, { ...byDate.get(key), ...point });
    });
  return [...byDate.values()].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );
}

async function appendLatestUpstoxQuote(symbol, prices, period1, period2) {
  if (getMarketDataProviderName() !== "upstox") return prices;

  try {
    const quote = await getMarketDataProvider().quote(symbol);
    const price = Number(quote?.regularMarketPrice);
    const date = quote?.regularMarketTime;
    const time = new Date(date).getTime();
    const start = new Date(period1).getTime();
    const end = new Date(period2).getTime();

    if (
      !Number.isFinite(price) ||
      !Number.isFinite(time) ||
      time < start ||
      time >= end
    ) {
      return prices;
    }

    return mergePrices(prices, [{
      date,
      close: price,
      adjustedClose: price,
      observationTimeSource: quote?.marketTimeSource || null,
    }]);
  } catch (error) {
    console.warn(`Unable to append current Upstox quote for ${symbol}: ${error.message}`);
    return prices;
  }
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

async function fetchHistoricalPrices(
  symbol,
  period1,
  period2,
  { appendLatestQuote = true, completedSessionReconciliation = false } = {}
) {
  const normalizedSymbol = normalizeSymbol(symbol);
  const key = historyCacheKey(
    normalizedSymbol,
    period1,
    period2,
    appendLatestQuote,
    completedSessionReconciliation
  );
  const freshTtl = completedSessionReconciliation
    ? 15 * 60 * 1000
    : getMarketDataProviderName() === "upstox"
    ? (appendLatestQuote ? indianHistoryFreshTtl() : 6 * 60 * 60 * 1000)
    : YAHOO_FRESH_HISTORY_TTL_MS;
  const freshPrices = await getCachedValue(key, freshTtl);
  if (freshPrices) return freshPrices;

  if (await isYahooCoolingDown()) {
    const stalePrices = await getCachedValue(key, STALE_HISTORY_TTL_MS);
    if (stalePrices) return stalePrices;
    const latestPrices = await getLatestCachedPrices(
      normalizedSymbol,
      period1,
      period2,
      appendLatestQuote
    );
    if (latestPrices) return latestPrices;
    throw new Error("Yahoo Finance is temporarily rate limited");
  }

  if (requestsInFlight.has(key)) return requestsInFlight.get(key);

  const requestPromise = (async () => {
    try {
      const result = await getMarketDataProvider().chart(normalizedSymbol, {
        period1,
        period2,
        interval: "1d",
        // Upstox is primary. Its completed daily series can publish later
        // than Yahoo's, so the existing Yahoo supplement may provide the
        // same-session completed candle when Upstox is still one session
        // behind. Neither source is replaced by an intraday LTP here.
        supplement: true,
      });

      const historicalPrices = (result.quotes || [])
        .filter((quote) => quote.date && Number.isFinite(quote.close))
        .map((quote) => ({
          date: quote.date,
          sessionDate: quote.sessionDate || null,
          open: Number.isFinite(quote.open) ? quote.open : null,
          high: Number.isFinite(quote.high) ? quote.high : null,
          low: Number.isFinite(quote.low) ? quote.low : null,
          close: quote.close,
          adjustedClose: Number.isFinite(quote.adjclose) ? quote.adjclose : quote.close,
          volume: Number.isFinite(quote.volume) ? quote.volume : null,
        }));
      const prices = appendLatestQuote
        ? await appendLatestUpstoxQuote(
            normalizedSymbol,
            historicalPrices,
            period1,
            period2
          )
        : historicalPrices;

      const existingLatest = await getCachedValue(
        latestHistoryCacheKey(normalizedSymbol, appendLatestQuote),
        STALE_HISTORY_TTL_MS
      );
      const mergedLatest = mergePrices(existingLatest, prices);

      await Promise.all([
        setCacheEntry(key, prices, STALE_HISTORY_TTL_MS),
        setCacheEntry(
          latestHistoryCacheKey(normalizedSymbol, appendLatestQuote),
          mergedLatest,
          STALE_HISTORY_TTL_MS
        ),
      ]);
      return prices;
    } catch (error) {
      const stalePrices = await getCachedValue(key, STALE_HISTORY_TTL_MS);
      if (stalePrices) {
        console.warn(`Using stale historical prices for ${normalizedSymbol}`);
        return stalePrices;
      }

      const latestPrices = await getLatestCachedPrices(
        normalizedSymbol,
        period1,
        period2,
        appendLatestQuote
      );
      if (latestPrices) {
        console.warn(`Using latest cached historical prices for ${normalizedSymbol}`);
        return latestPrices;
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
