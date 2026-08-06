const { getMarketDataProvider } = require("../providers/marketData");
const { getCachedValue, setCacheEntry } = require("./cacheClient");
const {
  isProviderCoolingDown,
  isRateLimitError,
  providerCacheKey,
  startProviderCooldown,
} = require("./providerCachePolicy");

const FRESH_CURRENCY_QUOTE_TTL_MS = 30 * 60 * 1000;
const STALE_CURRENCY_QUOTE_TTL_MS = 6 * 60 * 60 * 1000;
const FRESH_CURRENCY_HISTORY_TTL_MS = 6 * 60 * 60 * 1000;
const STALE_CURRENCY_HISTORY_TTL_MS = 48 * 60 * 60 * 1000;

const CURRENCY_SYMBOLS = {
  USD: "INR=X",
  EUR: "EURINR=X",
  GBP: "GBPINR=X",
  JPY: "JPYINR=X",
  AED: "AEDINR=X",
};

const historyRequestsInFlight = new Map();
let quoteRequestInFlight = null;

function getCurrencySymbol(code) {
  const normalizedCode = String(code || "").trim().toUpperCase();
  const symbol = CURRENCY_SYMBOLS[normalizedCode];
  if (!symbol) throw new Error(`Unsupported currency code: ${normalizedCode}`);
  return symbol;
}

function dateKey(date) {
  const value = new Date(date);
  if (Number.isNaN(value.getTime())) throw new Error("Invalid currency-history date");
  return value.toISOString().slice(0, 10);
}

function quoteCacheKey(symbol) {
  return providerCacheKey(`currency:quote:${symbol}`);
}

function historyCacheKey(symbol, period1, period2) {
  return providerCacheKey(
    `currency:history:${symbol}:1d:${dateKey(period1)}:${dateKey(period2)}`
  );
}

async function collectCurrencyQuotes(maxAgeMs) {
  const symbols = Object.values(CURRENCY_SYMBOLS);
  const values = await Promise.all(
    symbols.map((symbol) => getCachedValue(quoteCacheKey(symbol), maxAgeMs))
  );

  return {
    quotes: values.filter(Boolean),
    missingSymbols: symbols.filter((symbol, index) => !values[index]),
  };
}

async function fetchCurrencyQuotes() {
  let { quotes, missingSymbols } = await collectCurrencyQuotes(
    FRESH_CURRENCY_QUOTE_TTL_MS
  );
  if (missingSymbols.length === 0) return quotes;

  if (await isProviderCoolingDown()) {
    const stale = await collectCurrencyQuotes(STALE_CURRENCY_QUOTE_TTL_MS);
    if (stale.quotes.length) return stale.quotes;
    throw new Error("Market data provider is temporarily rate limited");
  }

  if (quoteRequestInFlight) {
    try {
      await quoteRequestInFlight;
    } catch {
      // Recheck persistent cache below.
    }
    ({ quotes, missingSymbols } = await collectCurrencyQuotes(
      FRESH_CURRENCY_QUOTE_TTL_MS
    ));
    if (missingSymbols.length === 0) return quotes;
  }

  quoteRequestInFlight = (async () => {
    const result = await getMarketDataProvider().quote(missingSymbols);
    const fetched = (Array.isArray(result) ? result : [result]).filter(Boolean);
    await Promise.all(
      fetched
        .filter((quote) => typeof quote?.symbol === "string")
        .map((quote) =>
          setCacheEntry(
            quoteCacheKey(quote.symbol),
            quote,
            STALE_CURRENCY_QUOTE_TTL_MS
          )
        )
    );
    return fetched;
  })();

  try {
    const fetched = await quoteRequestInFlight;
    return [...quotes, ...fetched];
  } catch (error) {
    if (isRateLimitError(error)) await startProviderCooldown();
    const stale = await collectCurrencyQuotes(STALE_CURRENCY_QUOTE_TTL_MS);
    if (stale.quotes.length) return stale.quotes;
    throw error;
  } finally {
    quoteRequestInFlight = null;
  }
}

async function fetchCurrencyHistory(code, period1, period2) {
  const symbol = getCurrencySymbol(code);
  const key = historyCacheKey(symbol, period1, period2);
  const fresh = await getCachedValue(key, FRESH_CURRENCY_HISTORY_TTL_MS);
  if (fresh) return fresh;

  if (await isProviderCoolingDown()) {
    const stale = await getCachedValue(key, STALE_CURRENCY_HISTORY_TTL_MS);
    if (stale) return stale;
    throw new Error("Market data provider is temporarily rate limited");
  }

  if (historyRequestsInFlight.has(key)) return historyRequestsInFlight.get(key);

  const request = (async () => {
    try {
      const result = await getMarketDataProvider().chart(symbol, {
        period1,
        period2,
        interval: "1d",
      });
      const prices = (result.quotes || [])
        .filter((quote) => quote.date && Number.isFinite(quote.close))
        .map((quote) => ({ date: quote.date, close: quote.close }));
      await setCacheEntry(key, prices, STALE_CURRENCY_HISTORY_TTL_MS);
      return prices;
    } catch (error) {
      if (isRateLimitError(error)) await startProviderCooldown();
      const stale = await getCachedValue(key, STALE_CURRENCY_HISTORY_TTL_MS);
      if (stale) return stale;
      throw error;
    } finally {
      historyRequestsInFlight.delete(key);
    }
  })();

  historyRequestsInFlight.set(key, request);
  return request;
}

module.exports = {
  CURRENCY_SYMBOLS,
  fetchCurrencyQuotes,
  fetchCurrencyHistory,
};
