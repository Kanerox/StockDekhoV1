const { getYahooFinanceClient } = require("./yahooClient");

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
  return getYahooFinanceClient().quoteSummary(normalizeSymbol(symbol), {
    modules: ["calendarEvents", "summaryDetail", "earningsHistory"],
  });
}

module.exports = {
  fetchCompanyEvents,
};
