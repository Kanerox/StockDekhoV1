const { fetchMarketData } = require("../clients/marketClient");
const { fetchHistoricalPrices } = require("../clients/historyClient");
const { GLOBAL_INDICES, getGlobalIndexDefinition } = require("../config/globalIndexConfig");

function finite(value) {
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function resolvePeriod(range = "1Y") {
  const period2 = new Date();
  period2.setDate(period2.getDate() + 1);
  const period1 = new Date();
  if (range === "1W") period1.setDate(period1.getDate() - 10);
  else if (range === "1M") period1.setMonth(period1.getMonth() - 1);
  else if (range === "3M") period1.setMonth(period1.getMonth() - 3);
  else if (range === "6M") period1.setMonth(period1.getMonth() - 6);
  else if (range === "9M") period1.setMonth(period1.getMonth() - 9);
  else if (range === "YTD") period1.setTime(new Date(period1.getFullYear(), 0, 1).getTime());
  else if (range === "3Y") period1.setFullYear(period1.getFullYear() - 3);
  else if (range === "5Y") period1.setFullYear(period1.getFullYear() - 5);
  else if (range === "10Y") period1.setFullYear(period1.getFullYear() - 10);
  else if (range === "SI") period1.setTime(new Date("1980-01-01").getTime());
  else period1.setFullYear(period1.getFullYear() - 1);
  return { period1, period2 };
}

function validPoints(points) {
  return (points || []).filter((point) => Number.isFinite(point?.adjustedClose));
}

function returnPercent(points) {
  if (points.length < 2 || !points[0].adjustedClose) return null;
  return ((points.at(-1).adjustedClose / points[0].adjustedClose) - 1) * 100;
}

function exchangeClock(definition, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: definition.timeZone,
    weekday: "short", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(now).reduce((result, part) => ({ ...result, [part.type]: part.value }), {});
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    weekday: parts.weekday,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

function globalQuoteStatus(quote, definition, latestSessionDate) {
  const marketState = String(quote?.marketState || "").toUpperCase();
  if (marketState === "REGULAR") return "live";
  if (["CLOSED", "POST", "POSTPOST", "PRE", "PREPRE"].includes(marketState)) return "eod";
  const clock = exchangeClock(definition);
  const weekday = !["Sat", "Sun"].includes(clock.weekday);
  const scheduledOpen = weekday && definition.sessions.some(([open, close]) => clock.minutes >= open && clock.minutes < close);
  return scheduledOpen && latestSessionDate === clock.date ? "live" : "eod";
}

function observationDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

async function getGlobalIndexDetail(key, range = "1Y") {
  const definition = getGlobalIndexDefinition(key);
  if (!definition) throw new Error("Unknown global index");
  const { period1, period2 } = resolvePeriod(range);
  const [quote, rawPoints] = await Promise.all([
    fetchMarketData(definition.symbol),
    fetchHistoricalPrices(definition.symbol, period1, period2),
  ]);
  const points = validPoints(rawPoints);
  if (points.length < 2) throw new Error("Insufficient global-index history");
  const closes = points.map((point) => point.adjustedClose);
  const historyBacked = /historical/i.test(String(quote.quoteSourceName || ""));
  const latestSessionDate = observationDate(points.at(-1)?.date);
  return {
    ...definition,
    value: finite(quote.regularMarketPrice) ?? closes.at(-1),
    change: finite(quote.regularMarketChange),
    changePercent: finite(quote.regularMarketChangePercent),
    marketTime: historyBacked ? latestSessionDate : (quote.regularMarketTime || latestSessionDate || null),
    asOf: historyBacked ? latestSessionDate : (quote.regularMarketTime || latestSessionDate || null),
    sessionDateOnly: historyBacked,
    isGlobalIndex: true,
    dataStatus: globalQuoteStatus(quote, definition, latestSessionDate),
    isStale: Boolean(quote.isStale),
    dataProvider: quote.quoteSourceName || "market provider",
    periodReturn: returnPercent(points),
    periodHigh: Math.max(...closes),
    periodLow: Math.min(...closes),
    points,
    range,
  };
}

async function getGlobalIndexOverview() {
  const values = [];
  for (let offset = 0; offset < GLOBAL_INDICES.length; offset += 3) {
    const definitions = GLOBAL_INDICES.slice(offset, offset + 3);
    const results = await Promise.allSettled(
      definitions.map(async (definition) => {
      const detail = await getGlobalIndexDetail(definition.key, "1M");
      return {
        key: detail.key, name: detail.name, symbol: detail.symbol, region: detail.region,
        description: detail.description, value: detail.value, change: detail.change,
        changePercent: detail.changePercent, oneMonthReturn: detail.periodReturn,
        sparkline: detail.points.map((point) => point.adjustedClose), marketTime: detail.marketTime,
        asOf: detail.asOf, dataStatus: detail.dataStatus, isStale: detail.isStale,
        dataProvider: detail.dataProvider, sessionDateOnly: detail.sessionDateOnly,
        isGlobalIndex: true,
      };
      })
    );
    results.forEach((result) => {
      if (result.status === "fulfilled") values.push(result.value);
    });
  }
  return values;
}

module.exports = { getGlobalIndexOverview, getGlobalIndexDetail };
