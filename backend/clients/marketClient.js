const {
  getMarketDataProvider,
  getMarketDataProviderName,
} = require("../providers/marketData");
const { getCachedValue, setCacheEntry } = require("./cacheClient");

const FRESH_QUOTE_TTL_MS = 10 * 60 * 1000;
const STALE_QUOTE_TTL_MS = 6 * 60 * 60 * 1000;
const FUNDAMENTALS_TTL_MS = 24 * 60 * 60 * 1000;
const STALE_FUNDAMENTALS_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const RATE_LIMIT_COOLDOWN_MS = 15 * 60 * 1000;

const quoteRequestsInFlight = new Map();
const fundamentalsRequestsInFlight = new Map();
let batchRequestInFlight = null;

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

function quoteCacheKey(symbol) {
  return providerCacheKey(`quote:${symbol}`);
}

function fundamentalsCacheKey(symbol) {
  return providerCacheKey(`fundamentals:${symbol}:financialData`);
}

function providerCacheKey(key) {
  const providerName = getMarketDataProviderName();
  return providerName === "yahoo" ? key : `${providerName}:${key}`;
}

function cooldownCacheKey() {
  return `${getMarketDataProviderName()}:blocked-until`;
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function isRateLimitError(error) {
  const status = error?.response?.status || error?.status || error?.statusCode;
  const message = String(error?.message || "").toLowerCase();

  return (
    status === 429 ||
    message.includes("429") ||
    message.includes("too many requests") ||
    message.includes("failed to get crumb")
  );
}

async function startRateLimitCooldown() {
  const blockedUntil = Date.now() + RATE_LIMIT_COOLDOWN_MS;
  await setCacheEntry(cooldownCacheKey(), blockedUntil, RATE_LIMIT_COOLDOWN_MS);
  console.warn("Yahoo Finance rate limit detected. Pausing new Yahoo requests for 15 minutes.");
}

async function isYahooCoolingDown() {
  const blockedUntil = await getCachedValue(
    cooldownCacheKey(),
    RATE_LIMIT_COOLDOWN_MS
  );
  return Number(blockedUntil) > Date.now();
}

async function withRetry(operation, { attempts = 2, initialDelay = 800, label = "Yahoo Finance request" } = {}) {
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      console.error(`${label} failed on attempt ${attempt}/${attempts}:`, error.message);

      if (isRateLimitError(error)) {
        await startRateLimitCooldown();
        throw error;
      }

      if (attempt < attempts) {
        await wait(initialDelay * Math.pow(2, attempt - 1));
      }
    }
  }

  throw lastError;
}

async function getStaleQuotes(symbols) {
  const quotes = await Promise.all(
    symbols.map((symbol) =>
      getCachedValue(quoteCacheKey(symbol), STALE_QUOTE_TTL_MS)
    )
  );
  return quotes.filter(Boolean);
}

async function fetchMarketData(symbol) {
  const normalizedSymbol = normalizeSymbol(symbol);
  const key = quoteCacheKey(normalizedSymbol);
  const freshQuote = await getCachedValue(key, FRESH_QUOTE_TTL_MS);
  if (freshQuote) return freshQuote;

  if (await isYahooCoolingDown()) {
    const staleQuote = await getCachedValue(key, STALE_QUOTE_TTL_MS);
    if (staleQuote) return staleQuote;
    throw new Error("Yahoo Finance is temporarily rate limited");
  }

  if (quoteRequestsInFlight.has(normalizedSymbol)) {
    return quoteRequestsInFlight.get(normalizedSymbol);
  }

  const requestPromise = (async () => {
    try {
      const quote = await withRetry(
        () => getMarketDataProvider().quote(normalizedSymbol),
        { label: `Yahoo quote ${normalizedSymbol}` }
      );

      if (quote?.symbol) {
        await setCacheEntry(
          quoteCacheKey(normalizeSymbol(quote.symbol)),
          quote,
          STALE_QUOTE_TTL_MS
        );
      }
      return quote;
    } catch (error) {
      const staleQuote = await getCachedValue(key, STALE_QUOTE_TTL_MS);
      if (staleQuote) {
        console.warn(`Using stale cached quote for ${normalizedSymbol}`);
        return staleQuote;
      }
      throw error;
    } finally {
      quoteRequestsInFlight.delete(normalizedSymbol);
    }
  })();

  quoteRequestsInFlight.set(normalizedSymbol, requestPromise);
  return requestPromise;
}

async function collectCachedQuotes(symbols, maxAgeMs) {
  const values = await Promise.all(
    symbols.map((symbol) => getCachedValue(quoteCacheKey(symbol), maxAgeMs))
  );
  const cachedQuotes = values.filter(Boolean);
  const missingSymbols = symbols.filter((symbol, index) => !values[index]);
  return { cachedQuotes, missingSymbols };
}

async function fetchMarketDataBatch(symbols) {
  const normalizedSymbols = [...new Set(symbols.map(normalizeSymbol))];
  let { cachedQuotes, missingSymbols } = await collectCachedQuotes(
    normalizedSymbols,
    FRESH_QUOTE_TTL_MS
  );

  if (missingSymbols.length === 0) return cachedQuotes;

  if (await isYahooCoolingDown()) {
    const staleQuotes = await getStaleQuotes(missingSymbols);
    if (cachedQuotes.length || staleQuotes.length) return [...cachedQuotes, ...staleQuotes];
    throw new Error("Yahoo Finance is temporarily rate limited");
  }

  if (batchRequestInFlight) {
    try {
      await batchRequestInFlight;
    } catch {
      // The cache and cooldown are checked again below.
    }

    ({ cachedQuotes, missingSymbols } = await collectCachedQuotes(
      normalizedSymbols,
      FRESH_QUOTE_TTL_MS
    ));
    if (missingSymbols.length === 0) return cachedQuotes;

    if (await isYahooCoolingDown()) {
      const staleQuotes = await getStaleQuotes(missingSymbols);
      if (cachedQuotes.length || staleQuotes.length) return [...cachedQuotes, ...staleQuotes];
      throw new Error("Yahoo Finance is temporarily rate limited");
    }
  }

  batchRequestInFlight = (async () => {
    const result = await withRetry(
      () => getMarketDataProvider().quote(missingSymbols),
      { label: "Yahoo batch quote request" }
    );
    const fetchedQuotes = (Array.isArray(result) ? result : [result]).filter(Boolean);

    await Promise.all(
      fetchedQuotes
        .filter((quote) => typeof quote?.symbol === "string")
        .map((quote) =>
          setCacheEntry(
            quoteCacheKey(normalizeSymbol(quote.symbol)),
            quote,
            STALE_QUOTE_TTL_MS
          )
        )
    );
    return fetchedQuotes;
  })();

  try {
    const fetchedQuotes = await batchRequestInFlight;
    return [...cachedQuotes, ...fetchedQuotes];
  } catch (error) {
    const staleQuotes = await getStaleQuotes(missingSymbols);
    if (cachedQuotes.length || staleQuotes.length) {
      console.warn("Yahoo batch request failed; using cached market data.");
      return [...cachedQuotes, ...staleQuotes];
    }
    throw error;
  } finally {
    batchRequestInFlight = null;
  }
}

async function fetchPeerFundamentals(symbol) {
  const normalizedSymbol = normalizeSymbol(symbol);
  const key = fundamentalsCacheKey(normalizedSymbol);
  const freshSummary = await getCachedValue(key, FUNDAMENTALS_TTL_MS);
  if (freshSummary) return freshSummary;

  if (await isYahooCoolingDown()) {
    const staleSummary = await getCachedValue(key, STALE_FUNDAMENTALS_TTL_MS);
    if (staleSummary) return staleSummary;
    throw new Error("Yahoo Finance is temporarily rate limited");
  }

  if (fundamentalsRequestsInFlight.has(key)) {
    return fundamentalsRequestsInFlight.get(key);
  }

  const requestPromise = (async () => {
    try {
      const summary = await withRetry(
        () =>
          getMarketDataProvider().quoteSummary(normalizedSymbol, {
            modules: ["financialData"],
          }),
        { attempts: 1, label: `Yahoo fundamentals ${normalizedSymbol}` }
      );
      await setCacheEntry(key, summary, STALE_FUNDAMENTALS_TTL_MS);
      return summary;
    } catch (error) {
      const staleSummary = await getCachedValue(key, STALE_FUNDAMENTALS_TTL_MS);
      if (staleSummary) {
        console.warn(`Using stale fundamentals for ${normalizedSymbol}`);
        return staleSummary;
      }
      throw error;
    } finally {
      fundamentalsRequestsInFlight.delete(key);
    }
  })();

  fundamentalsRequestsInFlight.set(key, requestPromise);
  return requestPromise;
}

module.exports = {
  fetchMarketData,
  fetchMarketDataBatch,
  fetchPeerFundamentals,
};
