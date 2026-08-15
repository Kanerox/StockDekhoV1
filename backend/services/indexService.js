const {
  fetchMarketData,
  fetchMarketDataBatch,
} = require("../clients/marketClient");
const {
  fetchHistoricalPrices,
} = require("../clients/historyClient");
const {
  INDICES,
  getIndexDefinition,
} = require("../config/indexConfig");
const {
  getMarketDataProviderName,
} = require("../providers/marketData");

function valueOrNull(value) {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : null;
}

function completedSessionPoints(points) {
  return (Array.isArray(points) ? points : []).filter((point) => {
    const date = new Date(point?.date);
    if (Number.isNaN(date.getTime())) return false;
    const day = date.getUTCDay();
    return day !== 0 && day !== 6;
  });
}

function latestSessionAsOf(points) {
  const latest = points[points.length - 1];
  if (!latest?.date) return null;
  const date = new Date(latest.date).toISOString().slice(0, 10);
  return `${date}T10:30:00.000Z`;
}

function resolvePeriod(range = "1Y") {
  const period2 = new Date();
  period2.setDate(period2.getDate() + 1);
  const period1 = new Date();

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
      return {
        period1: new Date("1990-01-01"),
        period2,
      };
    case "1Y":
    default:
      period1.setFullYear(period1.getFullYear() - 1);
      break;
  }

  return { period1, period2 };
}

function calculateReturn(points) {
  if (!Array.isArray(points) || points.length < 2) return null;

  const first = points[0].adjustedClose;
  const last = points[points.length - 1].adjustedClose;

  if (!Number.isFinite(first) || !Number.isFinite(last) || first === 0) {
    return null;
  }

  return ((last / first) - 1) * 100;
}

function calculateDailyMove(points) {
  if (!Array.isArray(points) || points.length < 2) {
    return { change: null, changePercent: null };
  }

  const previousClose = points[points.length - 2].adjustedClose;
  const latestClose = points[points.length - 1].adjustedClose;

  if (
    !Number.isFinite(previousClose) ||
    !Number.isFinite(latestClose) ||
    previousClose === 0
  ) {
    return { change: null, changePercent: null };
  }

  const change = latestClose - previousClose;
  return {
    change,
    changePercent: (change / previousClose) * 100,
  };
}

function mapConstituent(quote, fallbackTicker) {
  const ticker = String(quote?.symbol || fallbackTicker)
    .toUpperCase()
    .replace(/\.(NS|BO)$/, "");
  const marketCap = valueOrNull(quote?.marketCap);

  return {
    ticker,
    symbol: quote?.symbol || `${fallbackTicker}.NS`,
    name: quote?.longName || quote?.shortName || fallbackTicker,
    price: valueOrNull(quote?.regularMarketPrice),
    chgPct: valueOrNull(quote?.regularMarketChangePercent),
    mcap: marketCap === null ? null : marketCap / 10000000,
    pe: valueOrNull(quote?.trailingPE),
    ret1y: valueOrNull(quote?.fiftyTwoWeekChangePercent),
  };
}

async function fetchConstituents(definition) {
  if (definition.constituents.length === 0) return [];

  const quotes = await fetchMarketDataBatch(definition.constituents);
  const quoteByTicker = new Map(
    quotes.map((quote) => [
      String(quote.symbol || "").toUpperCase().replace(/\.(NS|BO)$/, ""),
      quote,
    ])
  );

  return definition.constituents.map((ticker) =>
    mapConstituent(quoteByTicker.get(ticker), ticker)
  );
}

function mapQuote(definition, quote) {
  return {
    key: definition.key,
    name: definition.name,
    symbol: definition.symbol,
    description: definition.description,
    isVix: Boolean(definition.isVix),
    value: valueOrNull(quote.regularMarketPrice),
    change: valueOrNull(quote.regularMarketChange),
    changePercent: valueOrNull(quote.regularMarketChangePercent),
    low52: valueOrNull(quote.fiftyTwoWeekLow),
    high52: valueOrNull(quote.fiftyTwoWeekHigh),
    marketTime: quote.regularMarketTime || null,
    asOf: quote.regularMarketTime || null,
    dataProvider: getMarketDataProviderName(),
  };
}

async function getIndexSummary(definition) {
  const { period1, period2 } = resolvePeriod("1M");
  const [quote, points] = await Promise.all([
    fetchMarketData(definition.symbol),
    fetchHistoricalPrices(definition.symbol, period1, period2),
  ]);

  const sessions = completedSessionPoints(points);
  const asOf = latestSessionAsOf(sessions);
  return {
    ...mapQuote(definition, quote),
    ...calculateDailyMove(sessions),
    marketTime: asOf,
    asOf,
    oneMonthReturn: calculateReturn(sessions),
    sparkline: sessions.map((point) => point.adjustedClose),
  };
}

async function getIndexOverview() {
  return Promise.all(INDICES.map(getIndexSummary));
}

async function getIndexDetail(key, range = "1Y") {
  const definition = getIndexDefinition(key);

  if (!definition) {
    throw new Error("Unknown index");
  }

  const { period1, period2 } = resolvePeriod(range);
  const [quote, points, constituents] = await Promise.all([
    fetchMarketData(definition.symbol),
    fetchHistoricalPrices(definition.symbol, period1, period2),
    fetchConstituents(definition),
  ]);

  const sessions = completedSessionPoints(points);
  if (sessions.length < 2) {
    throw new Error("Insufficient historical index data");
  }

  const closes = sessions
    .map((point) => point.adjustedClose)
    .filter(Number.isFinite);

  return {
    ...mapQuote(definition, quote),
    ...calculateDailyMove(sessions),
    marketTime: latestSessionAsOf(sessions),
    asOf: latestSessionAsOf(sessions),
    range,
    periodReturn: calculateReturn(sessions),
    periodHigh: closes.length ? Math.max(...closes) : null,
    periodLow: closes.length ? Math.min(...closes) : null,
    points: sessions.map((point) => ({
      date: new Date(point.date).toISOString().slice(0, 10),
      close: point.close,
      adjustedClose: point.adjustedClose,
    })),
    constituents,
  };
}

module.exports = {
  getIndexOverview,
  getIndexDetail,
};
