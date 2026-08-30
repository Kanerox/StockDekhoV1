const {
  getMarketDataProvider,
  getMarketDataProviderName,
} = require("../providers/marketData");
const { getCachedValue, setCacheEntry } = require("./cacheClient");
const { fetchHistoricalPrices } = require("./historyClient");
const { validateQuote, indianMarketPhase, sessionKey } = require("../utils/marketDataValidation");

const FRESH_QUOTE_TTL_MS = 5 * 60 * 1000;
const CLOSED_SESSION_QUOTE_TTL_MS = 6 * 60 * 60 * 1000;
const STALE_QUOTE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const FUNDAMENTALS_TTL_MS = 24 * 60 * 60 * 1000;
const STALE_FUNDAMENTALS_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const RATE_LIMIT_COOLDOWN_MS = 15 * 60 * 1000;
const QUOTE_CACHE_VERSION = "v15";
const PREVIOUS_QUOTE_CACHE_VERSION = "v14";
const SUPPLEMENTAL_QUOTE_FIELDS = [
  "marketCap",
  "trailingPE",
  "forwardPE",
  "priceToBook",
  "bookValue",
  "epsTrailingTwelveMonths",
  "dividendYield",
  "averageDailyVolume3Month",
  "fiftyTwoWeekLow",
  "fiftyTwoWeekHigh",
  "fiftyTwoWeekChangePercent",
];

const quoteRequestsInFlight = new Map();
const fundamentalsRequestsInFlight = new Map();
let batchRequestInFlight = null;

function quoteFreshTtlMs() {
  return indianMarketPhase() === "closed"
    ? CLOSED_SESSION_QUOTE_TTL_MS
    : FRESH_QUOTE_TTL_MS;
}

function normalizeSymbol(symbol) {
  const normalized = String(symbol || "").trim().toUpperCase();
  if (!normalized) throw new Error("A stock symbol is required");

  if (
    normalized.startsWith("^") ||
    /\.[A-Z]{1,4}$/.test(normalized) ||
    normalized.endsWith(".NS") ||
    normalized.endsWith(".BO")
  ) {
    return normalized;
  }

  return `${normalized}.NS`;
}

function quoteCacheKey(symbol) {
  return providerCacheKey(`quote:${QUOTE_CACHE_VERSION}:${symbol}`);
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

function fetchProviderQuotes(symbols, { supplement = true } = {}) {
  const provider = getMarketDataProvider();
  const requested = Array.isArray(symbols) ? symbols : [symbols];
  const requiresSupplement = supplement && requested.some(
    (symbol) => !String(symbol || "").startsWith("^")
  );
  return requiresSupplement && typeof provider.quoteWithSupplement === "function"
    ? provider.quoteWithSupplement(symbols)
    : provider.quote(symbols);
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
  return quotes
    .filter(Boolean)
    .map((quote) => {
      try {
        return {
          ...validateQuote(quote, { requestedSymbol: quote.symbol, allowStale: true }),
          dataStatus: "stale",
          isStale: true,
        };
      }
      catch (error) { console.warn(`Discarding invalid cached quote: ${error.message}`); return null; }
    })
    .filter(Boolean);
}

function quoteTimestamp(quote) {
  const timestamp = new Date(quote?.regularMarketTime).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function chooseNewerQuote(candidate, cached, requestedSymbol) {
  const validatedCandidate = validateQuote(candidate, { requestedSymbol, allowStale: true });
  if (!cached) return validatedCandidate;
  try {
    const validatedCached = validateQuote(cached, { requestedSymbol, allowStale: true });
    const candidateIsDirect = !/historical/i.test(String(validatedCandidate.quoteSourceName || ""));
    const cachedIsHistorical = /historical/i.test(String(validatedCached.quoteSourceName || ""));
    if (candidateIsDirect && cachedIsHistorical) return validatedCandidate;
    return quoteTimestamp(validatedCached) > quoteTimestamp(validatedCandidate)
      ? validatedCached
      : validatedCandidate;
  } catch {
    return validatedCandidate;
  }
}

function historyObservationTimestamp(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  // A daily candle timestamp identifies its trading session; it is not a
  // fabricated 15:30 or 16:00 trade. The UI uses observationDate for this
  // session-close observation and therefore does not present this as an LTP.
  return date.toISOString();
}

function observationDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-CA", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
  });
}

function needsCompletedSessionReconciliation(quote, now = new Date()) {
  return indianMarketPhase(now) === "closed" &&
    quote?.observationKind !== "session_close";
}

async function preserveLegacyQuoteFields(quote) {
  if (getMarketDataProviderName() !== "upstox" || !quote?.symbol) return quote;

  const normalizedSymbol = normalizeSymbol(quote.symbol);
  const [legacyQuote, previousUpstoxQuote] = await Promise.all([
    getCachedValue(`quote:${normalizedSymbol}`, FUNDAMENTALS_TTL_MS),
    getCachedValue(
      `upstox:quote:${PREVIOUS_QUOTE_CACHE_VERSION}:${normalizedSymbol}`,
      FUNDAMENTALS_TTL_MS
    ),
  ]);
  const cachedSupplement = previousUpstoxQuote || legacyQuote;
  if (!cachedSupplement) return quote;

  const supplemental = {};
  for (const field of SUPPLEMENTAL_QUOTE_FIELDS) {
    if (quote[field] === null || quote[field] === undefined) {
      supplemental[field] = cachedSupplement[field] ?? null;
    }
  }

  return {
    ...quote,
    ...supplemental,
    shortName: quote.shortName || cachedSupplement.shortName,
    longName: quote.longName || cachedSupplement.longName,
  };
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
    period2,
    { appendLatestQuote: true }
  );
  // A quote appended to history contains only close/adjustedClose. Requiring
  // a complete OHLC candle prevents a provisional LTP from being promoted to
  // EOD, while still allowing either provider's legitimate daily candle.
  const pricedObservations = prices.filter((point) => Number.isFinite(point?.close));
  const validPrices = pricedObservations.filter((point) =>
    Number.isFinite(point?.close) &&
    Number.isFinite(point?.open) &&
    Number.isFinite(point?.high) &&
    Number.isFinite(point?.low)
  );

  if (validPrices.length < 2) {
    throw new Error(`Insufficient historical prices for ${normalizedSymbol}`);
  }

  const latestObservation = pricedObservations.at(-1);
  const latestCompleted = validPrices.at(-1);
  const hasNewerProvisionalObservation = observationDate(latestObservation?.date) >
    observationDate(latestCompleted?.date);

  if (hasNewerProvisionalObservation) {
    const previousClose = latestCompleted.close;
    const price = latestObservation.close;
    const provisional = {
      ...(baseQuote || {}),
      symbol: normalizedSymbol,
      regularMarketPrice: price,
      regularMarketPreviousClose: previousClose,
      regularMarketChange: price - previousClose,
      regularMarketChangePercent: previousClose === 0 ? null : ((price - previousClose) / previousClose) * 100,
      regularMarketTime: new Date(latestObservation.date).toISOString(),
      observationDate: observationDate(latestObservation.date),
      observationKind: latestObservation.observationTimeSource === "last_trade"
        ? "provisional_close"
        : "provisional_session",
      quoteSourceName: "Latest market observation",
      fiftyTwoWeekLow: Math.min(...validPrices.map((point) => point.close)),
      fiftyTwoWeekHigh: Math.max(...validPrices.map((point) => point.close)),
    };
    const validatedProvisional = validateQuote(provisional, {
      requestedSymbol: normalizedSymbol,
      allowStale: true,
    });
    await setCacheEntry(quoteCacheKey(normalizedSymbol), validatedProvisional, STALE_QUOTE_TTL_MS);
    return validatedProvisional;
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
    regularMarketOpen: Number.isFinite(latest.open) ? latest.open : null,
    regularMarketDayHigh: Number.isFinite(latest.high) ? latest.high : null,
    regularMarketDayLow: Number.isFinite(latest.low) ? latest.low : null,
    regularMarketVolume: Number.isFinite(latest.volume) ? latest.volume : null,
    fiftyTwoWeekLow: Math.min(...closes),
    fiftyTwoWeekHigh: Math.max(...closes),
    fiftyTwoWeekChangePercent:
      adjustedFirst === 0
        ? null
        : ((adjustedLatest / adjustedFirst) - 1) * 100,
    regularMarketTime: historyObservationTimestamp(latest.date),
    observationDate: observationDate(latest.date),
    observationKind: "session_close",
    currency: "INR",
    quoteSourceName: "Completed daily market data",
  };

  const sameSession = historyQuote.observationDate === sessionKey(baseQuote?.regularMarketTime);
  const quote = !baseQuote || sameSession || quoteTimestamp(historyQuote) > quoteTimestamp(baseQuote)
    ? { ...(baseQuote || {}), ...historyQuote }
    : baseQuote;
  const validatedQuote = validateQuote(quote, { requestedSymbol: normalizedSymbol });

  await setCacheEntry(
    quoteCacheKey(normalizedSymbol),
    validatedQuote,
    STALE_QUOTE_TTL_MS
  );
  return validatedQuote;
}

async function getFallbackQuotes(symbols) {
  const staleQuotes = await getStaleQuotes(symbols);
  const staleBySymbol = new Map(
    staleQuotes.map((quote) => [normalizeSymbol(quote.symbol), quote])
  );

  const missingSymbols = symbols.filter(
    (symbol) => !staleBySymbol.has(normalizeSymbol(symbol))
  );

  if (missingSymbols.length === 0 && indianMarketPhase() !== "closed") return staleQuotes;

  if (indianMarketPhase() === "closed") {
    const completed = [];
    let cursor = 0;
    async function worker() {
      while (cursor < symbols.length) {
        const symbol = symbols[cursor++];
        try {
          completed.push(await fetchHistoryBackedQuote(
            symbol,
            staleBySymbol.get(normalizeSymbol(symbol))
          ));
        } catch (error) {
          console.warn(`Cached completed-session reconciliation unavailable for ${symbol}: ${error.message}`);
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(12, symbols.length) }, worker));
    if (completed.length) return completed;
  }

  const results = await Promise.allSettled(
    missingSymbols.map((symbol) =>
      fetchHistoryBackedQuote(symbol)
    )
  );

  const historyFallbacks = results.map((result) =>
    result.status === "fulfilled"
      ? result.value
      : null
  ).filter(Boolean);
  return [...staleQuotes, ...historyFallbacks];
}

async function fetchMarketData(symbol, options = {}) {
  const normalizedSymbol = normalizeSymbol(symbol);
  const key = quoteCacheKey(normalizedSymbol);
  const freshQuote = await getCachedValue(key, quoteFreshTtlMs());
  if (freshQuote) {
    try {
      const validated = validateQuote(freshQuote, { requestedSymbol: normalizedSymbol });
      if (!needsCompletedSessionReconciliation(validated)) return validated;
    }
    catch (error) { console.warn(`Ignoring invalid or stale fresh-cache quote: ${error.message}`); }
  }

  if (await isYahooCoolingDown()) {
    const staleQuote = await getCachedValue(key, STALE_QUOTE_TTL_MS);
    try {
      return await fetchHistoryBackedQuote(normalizedSymbol, staleQuote);
    } catch (error) {
      if (staleQuote) return { ...staleQuote, dataStatus: "stale", isStale: true };
      throw error;
    }
  }

  if (quoteRequestsInFlight.has(normalizedSymbol)) {
    return quoteRequestsInFlight.get(normalizedSymbol);
  }

  const requestPromise = (async () => {
    try {
      const providerQuote = await withRetry(
        () => fetchProviderQuotes(normalizedSymbol, options),
        { label: `Market quote ${normalizedSymbol}` }
      );
      const cachedQuote = await getCachedValue(key, STALE_QUOTE_TTL_MS);
      let quote = chooseNewerQuote(
        await preserveLegacyQuoteFields(providerQuote),
        cachedQuote,
        normalizedSymbol
      );
      if (needsCompletedSessionReconciliation(quote)) {
        quote = await fetchHistoryBackedQuote(normalizedSymbol, quote);
      }

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
          return {
            ...validateQuote(staleQuote, { requestedSymbol: normalizedSymbol, allowStale: true }),
            dataStatus: "stale",
            isStale: true,
          };
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
  const validatedValues = values.map((quote, index) => {
    if (!quote) return null;
    try {
      const validated = validateQuote(quote, { requestedSymbol: symbols[index] });
      return needsCompletedSessionReconciliation(validated) ? null : validated;
    }
    catch (error) { console.warn(`Ignoring invalid or stale cached quote: ${error.message}`); return null; }
  });
  const cachedQuotes = validatedValues.filter(Boolean);
  const missingSymbols = symbols.filter((symbol, index) => !validatedValues[index]);
  return { cachedQuotes, missingSymbols };
}

async function fetchMarketDataBatch(symbols, options = {}) {
  const normalizedSymbols = [...new Set(symbols.map(normalizeSymbol))];
  let { cachedQuotes, missingSymbols } = await collectCachedQuotes(
    normalizedSymbols,
    quoteFreshTtlMs()
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
      quoteFreshTtlMs()
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
    const existingQuotes = await getStaleQuotes(missingSymbols);
    const existingBySymbol = new Map(existingQuotes.map((quote) => [normalizeSymbol(quote.symbol), quote]));
    const result = await withRetry(
      () => fetchProviderQuotes(missingSymbols, options),
      { label: "Market batch quote request" }
    );
    let fetchedQuotes = await Promise.all(
      (Array.isArray(result) ? result : [result])
        .filter(Boolean)
    .map(async (quote) => {
      const requestedSymbol = normalizeSymbol(quote.symbol);
      return chooseNewerQuote(
        await preserveLegacyQuoteFields(quote),
        existingBySymbol.get(requestedSymbol),
        requestedSymbol
      );
    })
    );

    if (indianMarketPhase() === "closed") {
      const reconciled = new Array(fetchedQuotes.length);
      let cursor = 0;
      async function worker() {
        while (cursor < fetchedQuotes.length) {
          const index = cursor++;
          const quote = fetchedQuotes[index];
          if (!needsCompletedSessionReconciliation(quote)) {
            reconciled[index] = quote;
            continue;
          }
          try {
            reconciled[index] = await fetchHistoryBackedQuote(quote.symbol, quote);
          } catch (error) {
            console.warn(`Completed-session reconciliation unavailable for ${quote.symbol}: ${error.message}`);
            reconciled[index] = validateQuote(quote, { requestedSymbol: quote.symbol, allowStale: true });
          }
        }
      }
      await Promise.all(Array.from({ length: Math.min(12, fetchedQuotes.length) }, worker));
      fetchedQuotes = reconciled;
    }

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
