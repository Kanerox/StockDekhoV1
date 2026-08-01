const { getYahooFinanceClient } = require("./yahooClient");

function normalizeSymbol(symbol) {
  const normalized = String(symbol || "").trim().toUpperCase();

  if (!normalized) {
    throw new Error("A stock symbol is required");
  }

  if (normalized.startsWith("^") || normalized.endsWith(".NS") || normalized.endsWith(".BO")) {
    return normalized;
  }

  return `${normalized}.NS`;
}

async function fetchHistoricalPrices(symbol, period1, period2) {
  const result = await getYahooFinanceClient().chart(normalizeSymbol(symbol), {
    period1,
    period2,
    interval: "1d",
  });

  return (result.quotes || [])
    .filter((quote) => quote.date && Number.isFinite(quote.close))
    .map((quote) => ({
      date: quote.date,
      close: quote.close,
      adjustedClose: Number.isFinite(quote.adjclose) ? quote.adjclose : quote.close,
    }));
}

module.exports = {
  fetchHistoricalPrices,
};
