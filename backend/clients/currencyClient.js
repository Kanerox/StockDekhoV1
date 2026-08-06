const { getMarketDataProvider } = require("../providers/marketData");

const CURRENCY_SYMBOLS = {
  USD: "INR=X",
  EUR: "EURINR=X",
  GBP: "GBPINR=X",
  JPY: "JPYINR=X",
  AED: "AEDINR=X",
};

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

module.exports = {
  CURRENCY_SYMBOLS,
  fetchCurrencyQuotes,
  fetchCurrencyHistory,
};
