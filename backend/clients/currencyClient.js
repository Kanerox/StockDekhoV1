const { getMarketDataProvider } = require("../providers/marketData");

const CURRENCY_SYMBOLS = {
  USD: "INR=X",
  EUR: "EURINR=X",
  GBP: "GBPINR=X",
  JPY: "JPYINR=X",
  AED: "AEDINR=X",
  SGD: "SGDINR=X",
  CAD: "CADINR=X",
  AUD: "AUDINR=X",
};

const intradayCache = new Map();
const INTRADAY_TTL_MS = 5 * 60 * 1000;

function getCurrencySymbol(code) {
  const normalizedCode = String(code || "").trim().toUpperCase();
  const symbol = CURRENCY_SYMBOLS[normalizedCode];

  if (!symbol) {
    throw new Error(`Unsupported currency code: ${normalizedCode}`);
  }

  return symbol;
}

async function fetchCurrencyQuotes() {
  const results = await Promise.allSettled(
    Object.values(CURRENCY_SYMBOLS).map((symbol) =>
      getMarketDataProvider().quote(symbol)
    )
  );

  return results
    .filter((result) => result.status === "fulfilled" && result.value)
    .map((result) => result.value);
}

async function fetchCurrencyHistory(code, period1, period2) {
  const result = await getMarketDataProvider().chart(getCurrencySymbol(code), {
    period1,
    period2,
    interval: "1d",
  });

  return (result.quotes || [])
    .filter((quote) => quote.date && Number.isFinite(quote.close))
    .map((quote) => ({
      date: quote.date,
      close: quote.close,
    }));
}

async function fetchCurrencyIntraday(code) {
  const normalizedCode = String(code || "").trim().toUpperCase();
  const cached = intradayCache.get(normalizedCode);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const period2 = new Date();
  const period1 = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
  const result = await require("../providers/marketData/yahooProvider").chart(
    getCurrencySymbol(normalizedCode),
    { period1, period2, interval: "5m" }
  );
  const latest = (result.quotes || [])
    .filter((quote) => quote.date && Number.isFinite(quote.close))
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .at(-1);
  if (!latest) throw new Error(`No intraday currency quote for ${normalizedCode}`);
  const value = { rate: latest.close, marketTime: new Date(latest.date).toISOString() };
  intradayCache.set(normalizedCode, { value, expiresAt: Date.now() + INTRADAY_TTL_MS });
  return value;
}

module.exports = {
  CURRENCY_SYMBOLS,
  fetchCurrencyQuotes,
  fetchCurrencyHistory,
  fetchCurrencyIntraday,
};
