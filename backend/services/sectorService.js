const {
  fetchMarketDataBatch,
} = require("../clients/marketClient");
const {
  fetchHistoricalPrices,
} = require("../clients/historyClient");
const {
  SECTORS,
  getSectorDefinition,
} = require("../config/sectorConfig");
const {
  getMarketDataProviderName,
} = require("../providers/marketData");
const { getCachedValue, setCacheEntry } = require("../clients/cacheClient");

function valueOrNull(value) {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : null;
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

function trailingPoints(points, options) {
  if (!points.length) return [];

  const latestDate = new Date(points[points.length - 1].date);
  const cutoff = new Date(latestDate);

  if (options.days) cutoff.setDate(cutoff.getDate() - options.days);
  if (options.months) cutoff.setMonth(cutoff.getMonth() - options.months);
  if (options.years) cutoff.setFullYear(cutoff.getFullYear() - options.years);

  return points.filter((point) => new Date(point.date) >= cutoff);
}

function calculateTrailingReturn(points, options, fallbackSessions) {
  const calendarPoints = trailingPoints(points, options);
  const returnPoints =
    calendarPoints.length >= 2
      ? calendarPoints
      : points.slice(-fallbackSessions);

  return calculateReturn(returnPoints);
}

function mapQuote(quote, fallbackTicker) {
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
    pe: valueOrNull(quote?.trailingPE),
    ret1y: valueOrNull(quote?.fiftyTwoWeekChangePercent),
    mcap: marketCap === null ? null : marketCap / 10000000,
    asOf: quote?.regularMarketTime || null,
    observationDate: quote?.observationDate || null,
    observationKind: quote?.observationKind || null,
  };
}

function latestHistoryDate(points) {
  const lastPoint = Array.isArray(points) ? points[points.length - 1] : null;
  return lastPoint?.date ? new Date(lastPoint.date).toISOString() : null;
}

async function fetchConstituents(definition) {
  const quotes = await fetchMarketDataBatch(definition.constituents);
  const quoteByTicker = new Map(
    quotes.map((quote) => [
      String(quote.symbol || "").toUpperCase().replace(/\.(NS|BO)$/, ""),
      quote,
    ])
  );

  return definition.constituents.map((ticker) =>
    mapQuote(quoteByTicker.get(ticker), ticker)
  );
}

async function getSectorSummary(definition) {
  const { period1, period2 } = resolvePeriod("1Y");
  const [history, constituents] = await Promise.all([
    fetchHistoricalPrices(definition.benchmarkSymbol, period1, period2),
    fetchConstituents(definition),
  ]);

  const validReturns = constituents.filter((stock) =>
    Number.isFinite(stock.ret1y)
  );
  const ranked = [...validReturns].sort((a, b) => b.ret1y - a.ret1y);

  return {
    key: definition.key,
    benchmarkName: definition.benchmarkName,
    benchmarkSymbol: definition.benchmarkSymbol,
    proxy: definition.proxy,
    asOf: latestHistoryDate(history),
    dataProvider: getMarketDataProviderName(),
    returns: {
      "1W": calculateTrailingReturn(history, { days: 10 }, 6),
      "1M": calculateTrailingReturn(history, { months: 1 }, 22),
      "3M": calculateTrailingReturn(history, { months: 3 }, 63),
      "6M": calculateTrailingReturn(history, { months: 6 }, 126),
      "9M": calculateTrailingReturn(history, { months: 9 }, 189),
      "1Y": calculateReturn(history),
    },
    companyCount: constituents.length,
    combinedMarketCap: constituents.some((stock) => Number.isFinite(stock.mcap))
      ? constituents.reduce(
          (total, stock) => total + (Number.isFinite(stock.mcap) ? stock.mcap : 0),
          0
        )
      : null,
    leader: ranked[0]?.ticker || null,
    lagger: ranked[ranked.length - 1]?.ticker || null,
  };
}

async function getSectorOverview() {
  const cached = await getCachedValue("sector-overview:v3", 15 * 60 * 1000);
  if (cached) return cached;
  const overview = await Promise.all(SECTORS.map(getSectorSummary));
  await setCacheEntry("sector-overview:v3", overview, 24 * 60 * 60 * 1000);
  return overview;
}

async function getSectorDetail(key, range = "1Y") {
  const definition = getSectorDefinition(key);

  if (!definition) {
    throw new Error("Unknown sector");
  }

  const selectedPeriod = resolvePeriod(range);
  const oneYearPeriod = resolvePeriod("1Y");

  const [selectedHistory, oneYearHistory, constituents] = await Promise.all([
    fetchHistoricalPrices(
      definition.benchmarkSymbol,
      selectedPeriod.period1,
      selectedPeriod.period2
    ),
    range === "1Y"
      ? Promise.resolve(null)
      : fetchHistoricalPrices(
          definition.benchmarkSymbol,
          oneYearPeriod.period1,
          oneYearPeriod.period2
        ),
    fetchConstituents(definition),
  ]);

  const metricHistory = oneYearHistory || selectedHistory;

  return {
    key: definition.key,
    benchmarkName: definition.benchmarkName,
    benchmarkSymbol: definition.benchmarkSymbol,
    proxy: definition.proxy,
    range,
    asOf: latestHistoryDate(selectedHistory),
    dataProvider: getMarketDataProviderName(),
    periodReturn: calculateReturn(selectedHistory),
    returns: {
      "1W": calculateTrailingReturn(metricHistory, { days: 10 }, 6),
      "1M": calculateTrailingReturn(metricHistory, { months: 1 }, 22),
      "3M": calculateTrailingReturn(metricHistory, { months: 3 }, 63),
      "6M": calculateTrailingReturn(metricHistory, { months: 6 }, 126),
      "9M": calculateTrailingReturn(metricHistory, { months: 9 }, 189),
      "1Y": calculateReturn(metricHistory),
    },
    points: selectedHistory.map((point) => ({
      date: new Date(point.date).toISOString().slice(0, 10),
      close: point.close,
      adjustedClose: point.adjustedClose,
    })),
    constituents,
  };
}

module.exports = {
  getSectorOverview,
  getSectorDetail,
};
