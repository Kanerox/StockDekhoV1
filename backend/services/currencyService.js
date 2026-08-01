const {
  CURRENCY_SYMBOLS,
  fetchCurrencyQuotes,
  fetchCurrencyHistory,
} = require("../clients/currencyClient");

const SYMBOL_TO_CODE = Object.fromEntries(
  Object.entries(CURRENCY_SYMBOLS).map(([code, symbol]) => [symbol, code])
);

function valueOrNull(value) {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : null;
}

function startOfDay(value) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function resolveRange(range) {
  const period2 = startOfDay(new Date());
  period2.setDate(period2.getDate() + 1);
  const period1 = startOfDay(new Date());

  switch (range) {
    case "1W":
      period1.setDate(period1.getDate() - 10);
      break;
    case "1M":
      period1.setMonth(period1.getMonth() - 1);
      break;
    case "3M":
      period1.setMonth(period1.getMonth() - 3);
      break;
    case "6M":
      period1.setMonth(period1.getMonth() - 6);
      break;
    case "9M":
      period1.setMonth(period1.getMonth() - 9);
      break;
    case "YTD":
      return {
        period1: new Date(period1.getFullYear(), 0, 1),
        period2,
      };
    case "3Y":
      period1.setFullYear(period1.getFullYear() - 3);
      break;
    case "5Y":
      period1.setFullYear(period1.getFullYear() - 5);
      break;
    case "10Y":
      period1.setFullYear(period1.getFullYear() - 10);
      break;
    case "SI":
      return { period1: new Date("1990-01-01"), period2 };
    case "1Y":
    default:
      period1.setFullYear(period1.getFullYear() - 1);
      break;
  }

  return { period1, period2 };
}

function toDateKey(value) {
  return new Date(value).toISOString().slice(0, 10);
}

async function getCurrencyOverview() {
  const { period1, period2 } = resolveRange("1M");
  const quotes = await fetchCurrencyQuotes();
  const historyResults = await Promise.allSettled(
    Object.keys(CURRENCY_SYMBOLS).map((code) =>
      fetchCurrencyHistory(code, period1, period2)
    )
  );

  return Object.keys(CURRENCY_SYMBOLS).map((code, index) => {
    const symbol = CURRENCY_SYMBOLS[code];
    const quote = quotes.find((item) => item.symbol === symbol);
    const history =
      historyResults[index]?.status === "fulfilled"
        ? historyResults[index].value
        : [];
    const latestClose =
      history.length > 0
        ? valueOrNull(history[history.length - 1].close)
        : null;
    const previousClose =
      history.length > 1
        ? valueOrNull(history[history.length - 2].close)
        : null;
    const historyChangePercent =
      latestClose !== null &&
      previousClose !== null &&
      previousClose !== 0
        ? ((latestClose / previousClose) - 1) * 100
        : null;

    return {
      code,
      symbol,
      rate: valueOrNull(quote?.regularMarketPrice) ?? latestClose,
      changePercent:
        valueOrNull(quote?.regularMarketChangePercent) ??
        historyChangePercent,
      fiftyTwoWeekLow: valueOrNull(quote?.fiftyTwoWeekLow),
      fiftyTwoWeekHigh: valueOrNull(quote?.fiftyTwoWeekHigh),
      marketTime: quote?.regularMarketTime || null,
      source: quote?.quoteSourceName || "Yahoo Finance",
      sparkline: history.map((point) => point.close),
    };
  });
}

async function getCurrencyHistory(code, range = "1Y") {
  const normalizedCode = String(code || "").trim().toUpperCase();
  const { period1, period2 } = resolveRange(range);
  let points = await fetchCurrencyHistory(
    normalizedCode,
    period1,
    period2
  );

  if (range === "1W") {
    points = points.slice(-6);
  }

  if (points.length < 2) {
    throw new Error("Insufficient currency history for the selected period");
  }

  const first = points[0].close;
  const last = points[points.length - 1].close;

  return {
    code: normalizedCode,
    symbol: CURRENCY_SYMBOLS[normalizedCode],
    range,
    startDate: toDateKey(points[0].date),
    endDate: toDateKey(points[points.length - 1].date),
    returnPercent: ((last / first) - 1) * 100,
    points: points.map((point) => ({
      date: toDateKey(point.date),
      close: point.close,
    })),
  };
}

module.exports = {
  getCurrencyOverview,
  getCurrencyHistory,
};
