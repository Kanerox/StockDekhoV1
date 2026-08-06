const { getMarketDataProvider } = require("../providers/marketData");
const { getCachedValue, setCacheEntry } = require("./cacheClient");
const {
  isProviderCoolingDown,
  isRateLimitError,
  providerCacheKey,
  startProviderCooldown,
} = require("./providerCachePolicy");

const FRESH_FINANCIALS_TTL_MS = 24 * 60 * 60 * 1000;
const STALE_FINANCIALS_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const requestsInFlight = new Map();

function normalizeSymbol(symbol) {
  const normalized = String(symbol || "").trim().toUpperCase();
  if (!normalized) throw new Error("A stock symbol is required");
  if (normalized.endsWith(".NS") || normalized.endsWith(".BO")) return normalized;
  return `${normalized}.NS`;
}

function getPeriodRange(years = 6) {
  const period2 = new Date();
  const period1 = new Date();
  period1.setFullYear(period1.getFullYear() - years);
  return { period1, period2 };
}

async function fetchAnnualFinancialStatement(symbol, module) {
  const normalizedSymbol = normalizeSymbol(symbol);
  const key = providerCacheKey(`financials:${normalizedSymbol}:annual:${module}`);
  const fresh = await getCachedValue(key, FRESH_FINANCIALS_TTL_MS);
  if (fresh) return fresh;

  if (await isProviderCoolingDown()) {
    const stale = await getCachedValue(key, STALE_FINANCIALS_TTL_MS);
    if (stale) return stale;
    throw new Error("Market data provider is temporarily rate limited");
  }

  if (requestsInFlight.has(key)) return requestsInFlight.get(key);

  const request = (async () => {
    try {
      const { period1, period2 } = getPeriodRange();
      const result = await getMarketDataProvider().fundamentalsTimeSeries(
        normalizedSymbol,
        { period1, period2, type: "annual", module }
      );
      const records = Array.isArray(result) ? result : [];
      await setCacheEntry(key, records, STALE_FINANCIALS_TTL_MS);
      return records;
    } catch (error) {
      if (isRateLimitError(error)) await startProviderCooldown();
      const stale = await getCachedValue(key, STALE_FINANCIALS_TTL_MS);
      if (stale) return stale;
      throw error;
    } finally {
      requestsInFlight.delete(key);
    }
  })();

  requestsInFlight.set(key, request);
  return request;
}

const fetchAnnualIncomeStatement = (symbol) =>
  fetchAnnualFinancialStatement(symbol, "financials");

const fetchAnnualBalanceSheet = (symbol) =>
  fetchAnnualFinancialStatement(symbol, "balance-sheet");

const fetchAnnualCashFlow = (symbol) =>
  fetchAnnualFinancialStatement(symbol, "cash-flow");

module.exports = {
  fetchAnnualIncomeStatement,
  fetchAnnualBalanceSheet,
  fetchAnnualCashFlow,
};
