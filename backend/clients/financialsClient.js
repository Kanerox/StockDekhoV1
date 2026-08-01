const { getYahooFinanceClient } = require("./yahooClient");

function normalizeSymbol(symbol) {
  if (!symbol) {
    throw new Error("A stock symbol is required");
  }

  const normalizedSymbol = symbol.trim().toUpperCase();

  if (
    normalizedSymbol.endsWith(".NS") ||
    normalizedSymbol.endsWith(".BO")
  ) {
    return normalizedSymbol;
  }

  return `${normalizedSymbol}.NS`;
}

function getPeriodRange(years = 6) {
  const period2 = new Date();
  const period1 = new Date();

  period1.setFullYear(period1.getFullYear() - years);

  return {
    period1,
    period2,
  };
}

async function fetchAnnualFinancialStatement(symbol, module) {
  const yahooSymbol = normalizeSymbol(symbol);
  const { period1, period2 } = getPeriodRange();

  const results = await getYahooFinanceClient().fundamentalsTimeSeries(
    yahooSymbol,
    {
      period1,
      period2,
      type: "annual",
      module,
    }
  );

  return Array.isArray(results) ? results : [];
}

async function fetchAnnualIncomeStatement(symbol) {
  return fetchAnnualFinancialStatement(
    symbol,
    "financials"
  );
}

async function fetchAnnualBalanceSheet(symbol) {
  return fetchAnnualFinancialStatement(
    symbol,
    "balance-sheet"
  );
}

async function fetchAnnualCashFlow(symbol) {
  return fetchAnnualFinancialStatement(
    symbol,
    "cash-flow"
  );
}

module.exports = {
  fetchAnnualIncomeStatement,
  fetchAnnualBalanceSheet,
  fetchAnnualCashFlow,
};
