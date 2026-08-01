const { getYahooFinanceClient } = require("./yahooClient");

function normalizeSymbol(symbol) {
  const normalized = String(symbol || "").trim().toUpperCase();

  if (!normalized) {
    throw new Error("A stock symbol is required");
  }

  if (
    normalized.startsWith("^") ||
    normalized.endsWith(".NS") ||
    normalized.endsWith(".BO")
  ) {
    return normalized;
  }

  return `${normalized}.NS`;
}

const fetchMarketData = async (symbol) => {
  return getYahooFinanceClient().quote(normalizeSymbol(symbol));
};

const fetchMarketDataBatch = async (symbols) => {
  const normalizedSymbols = symbols.map(normalizeSymbol);
  const quotes = await getYahooFinanceClient().quote(normalizedSymbols);

  return Array.isArray(quotes) ? quotes : [quotes];
};

const fetchPeerFundamentals = async (symbol) => {
  return getYahooFinanceClient().quoteSummary(normalizeSymbol(symbol), {
    modules: ["financialData"],
  });
};

module.exports = {
  fetchMarketData,
  fetchMarketDataBatch,
  fetchPeerFundamentals,
};
