const { getMarketDataProvider } = require("../providers/marketData");

function normalizeSymbol(symbol) {
  const normalized = String(symbol || "").trim().toUpperCase();

  if (!normalized) {
    throw new Error("A stock symbol is required");
  }

  if (normalized.endsWith(".NS") || normalized.endsWith(".BO")) {
    return normalized;
  }

  return `${normalized}.NS`;
}

async function fetchCompanyEvents(symbol) {
  return getMarketDataProvider().quoteSummary(normalizeSymbol(symbol), {
    modules: ["calendarEvents", "summaryDetail", "earningsHistory"],
  });
}

module.exports = {
  fetchCompanyEvents,
};
