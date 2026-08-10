const {
  getMarketDataProvider,
  getMarketDataProviderName,
} = require("../providers/marketData");
const { getCachedValue, setCacheEntry } = require("./cacheClient");
const { fetchHistoricalPrices } = require("./historyClient");

const FRESH_QUOTE_TTL_MS = 10 * 60 * 1000;
const STALE_QUOTE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
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

function quoteTimestamp(quote) {
  const timestamp = new Date(quote?.regularMarketTime).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

async function fetchHistoryBackedQuote(symbol, baseQuote = null) {
  const normalizedSymbol = normalizeSymbol(symbol);
  const period2 = new Date();
  period2.setDate(period2.getDate() + 1);
  const period1 = new Date();
  period1.setFullYear(period1.getFullYear() - 1);

  const prices = await fetchHistoricalPrices(
    normalizedSymbol,
    period1,
    period2
  );
  const validPrices = prices.filter((point) =>
    Number.isFinite(point?.close)
  );

  if (validPrices.length < 2) {
    throw new Error(`Insufficient historical prices for ${normalizedSymbol}`);
  }

  const first = validPrices[0];
  const previous = validPrices[validPrices.length - 2];
  const latest = validPrices[validPrices.length - 1];
  const closes = validPrices.map((point) => point.close);
  const adjustedFirst = Number.isFinite(first.adjustedClose)
    ? first.adjustedClose
    : first.close;
  const adjustedLatest = Number.isFinite(latest.adjustedClose)
    ? latest.adjustedClose
    : latest.close;
  const change = latest.close - previous.close;

  const historyQuote = {
    symbol: normalizedSymbol,
    regularMarketPrice: latest.close,
    regularMarketPreviousClose: previous.close,
    regularMarketChange: change,
    regularMarketChangePercent:
      previous.close === 0 ? null : (change / previous.close) * 100,
    fiftyTwoWeekLow: Math.min(...closes),
    fiftyTwoWeekHigh: Math.max(...closes),
    fiftyTwoWeekChangePercent:
      adjustedFirst === 0
        ? null
        : ((adjustedLatest / adjustedFirst) - 1) * 100,
    regularMarketTime: latest.date,
    currency: "INR",
    quoteSourceName: "Yahoo Finance historical EOD",
  };

  const quote = quoteTimestamp(historyQuote) > quoteTimestamp(baseQuote)
    ? { ...(baseQuote || {}), ...historyQuote }
    : baseQuote || historyQuote;

  await setCacheEntry(
    quoteCacheKey(normalizedSymbol),
    quote,
    STALE_QUOTE_TTL_MS
  );
  return quote;
}

async function getFallbackQuotes(symbols) {
  const staleQuotes = await getStaleQuotes(symbols);
  const staleBySymbol = new Map(
    staleQuotes.map((quote) => [normalizeSymbol(quote.symbol), quote])
  );

  const results = await Promise.allSettled(
    symbols.map((symbol) =>
      fetchHistoryBackedQuote(symbol, staleBySymbol.get(normalizeSymbol(symbol)))
    )
  );

  return results.map((result, index) =>
    result.status === "fulfilled"
      ? result.value
      : staleBySymbol.get(normalizeSymbol(symbols[index]))
  ).filter(Boolean);
}

async function fetchMarketData(symbol) {
  const normalizedSymbol = normalizeSymbol(symbol);
  const key = quoteCacheKey(normalizedSymbol);
  const freshQuote = await getCachedValue(key, FRESH_QUOTE_TTL_MS);
  if (freshQuote) return freshQuote;

  if (await isYahooCoolingDown()) {
    const staleQuote = await getCachedValue(key, STALE_QUOTE_TTL_MS);
    try {
      return await fetchHistoryBackedQuote(normalizedSymbol, staleQuote);
    } catch (error) {
      if (staleQuote) return staleQuote;
      throw error;
    }
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
      try {
        return await fetchHistoryBackedQuote(normalizedSymbol, staleQuote);
      } catch (historyError) {
        if (staleQuote) {
          console.warn(`Using stale cached quote for ${normalizedSymbol}`);
          return staleQuote;
        }
        throw historyError;
      }
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
    const fallbackQuotes = await getFallbackQuotes(missingSymbols);
    if (cachedQuotes.length || fallbackQuotes.length) {
      return [...cachedQuotes, ...fallbackQuotes];
    }
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
      const fallbackQuotes = await getFallbackQuotes(missingSymbols);
      if (cachedQuotes.length || fallbackQuotes.length) {
        return [...cachedQuotes, ...fallbackQuotes];
      }
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
    const fallbackQuotes = await getFallbackQuotes(missingSymbols);
    if (cachedQuotes.length || fallbackQuotes.length) {
      console.warn("Yahoo batch request failed; using cached market data.");
      return [...cachedQuotes, ...fallbackQuotes];
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
