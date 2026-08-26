const { fetchMarketData } = require("../clients/marketClient");
const { fetchHistoricalPrices } = require("../clients/historyClient");
const yahooProvider = require("../providers/marketData/yahooProvider");
const { GLOBAL_INDICES, getGlobalIndexDefinition } = require("../config/globalIndexConfig");
const { getCachedValue, setCacheEntry } = require("../clients/cacheClient");

const DIRECT_GLOBAL_QUOTE_KEYS = new Set(["NASDAQ", "DOW", "EUROSTOXX50"]);
const intradayCache = new Map();
const INTRADAY_TTL_MS = 5 * 60 * 1000;
let overviewInFlight = null;

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

function globalQuoteStatus(quote, definition, latestSessionDate, historyBacked = false) {
  const clock = exchangeClock(definition);
  const weekday = !["Sat", "Sun"].includes(clock.weekday);
  const scheduledOpen = weekday && definition.sessions.some(([open, close]) => clock.minutes >= open && clock.minutes < close);
  const observation = exchangeClock(definition, new Date(quote?.regularMarketTime || 0));
  const observationDate = observation.date;
  const finalClose = Math.max(...definition.sessions.map((session) => session[1]));
  const currentSessionComplete = observationDate === clock.date && observation.minutes >= finalClose - 2;
  const marketState = String(quote?.marketState || "").toUpperCase();
  const providerIsDelayed = /delayed/i.test(String(quote?.quoteSourceName || ""));
  const observationIsFresh = observationAgeMs(quote?.regularMarketTime) <= 12 * 60 * 1000;

  if (scheduledOpen && (providerIsDelayed || definition.delayMinutes > 0) && observationDate === clock.date) return "delayed";
  if (!historyBacked && marketState === "REGULAR" && scheduledOpen && observationDate === clock.date) return "live";
  if (!historyBacked && scheduledOpen && observationDate === clock.date && observationIsFresh) return "live";
  if (scheduledOpen && observationDate === clock.date) return "delayed";
  if (observationDate === clock.date && !currentSessionComplete) return "delayed";
  if (historyBacked && latestSessionDate === clock.date && !currentSessionComplete) return "delayed";
  return "eod";
}

function exchangeSessionCloseTimestamp(dateKey, definition) {
  if (!dateKey || !definition?.timeZone || !definition?.sessions?.length) return null;
  const [year, month, day] = dateKey.split("-").map(Number);
  const closeMinutes = Math.max(...definition.sessions.map((session) => session[1])) +
    Number(definition.settlementBufferMinutes || 0);
  const targetHour = Math.floor(closeMinutes / 60);
  const targetMinute = closeMinutes % 60;
  let instant = new Date(Date.UTC(year, month - 1, day, targetHour, targetMinute));

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: definition.timeZone,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(instant).reduce((result, part) => ({ ...result, [part.type]: part.value }), {});
    const displayed = Date.UTC(
      Number(parts.year), Number(parts.month) - 1, Number(parts.day),
      Number(parts.hour), Number(parts.minute)
    );
    const target = Date.UTC(year, month - 1, day, targetHour, targetMinute);
    instant = new Date(instant.getTime() + (target - displayed));
  }
  return instant.toISOString();
}

function exchangeObservationDate(value, definition) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : exchangeClock(definition, date).date;
}

function observationAgeMs(value) {
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? Date.now() - timestamp : Number.POSITIVE_INFINITY;
}

async function getIntradayObservation(definition) {
  const cached = intradayCache.get(definition.key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const period2 = new Date();
  const period1 = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
  const result = await yahooProvider.chart(definition.symbol, {
    period1,
    period2,
    interval: "5m",
  });
  const latest = (result.quotes || [])
    .filter((point) => point.date && Number.isFinite(point.close))
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .at(-1);
  if (!latest) throw new Error(`No intraday observation for ${definition.key}`);
  const value = { price: latest.close, marketTime: new Date(latest.date).toISOString() };
  intradayCache.set(definition.key, { value, expiresAt: Date.now() + INTRADAY_TTL_MS });
  return value;
}

async function getGlobalIndexDetail(key, range = "1Y") {
  const definition = getGlobalIndexDefinition(key);
  if (!definition) throw new Error("Unknown global index");
  const { period1, period2 } = resolvePeriod(range);
  const [baseQuote, rawPoints] = await Promise.all([
    fetchMarketData(definition.symbol),
    fetchHistoricalPrices(definition.symbol, period1, period2, {
      appendLatestQuote: false,
    }),
  ]);
  let quote = baseQuote;
  if (DIRECT_GLOBAL_QUOTE_KEYS.has(definition.key)) {
    try {
      const directQuote = await yahooProvider.quote(definition.symbol);
      const directTime = new Date(directQuote?.regularMarketTime).getTime();
      const baseTime = new Date(baseQuote?.regularMarketTime).getTime();
      if (Number.isFinite(directTime) && (!Number.isFinite(baseTime) || directTime >= baseTime)) {
        quote = directQuote;
      }
    } catch (error) {
      console.warn(`Direct global quote unavailable for ${definition.key}: ${error.message}`);
    }
  }
  const preflightClock = exchangeClock(definition);
  const preflightOpen = !["Sat", "Sun"].includes(preflightClock.weekday) &&
    definition.sessions.some(([open, close]) => preflightClock.minutes >= open && preflightClock.minutes < close);
  const quoteSessionDate = exchangeObservationDate(quote?.regularMarketTime, definition);
  const preflightHistoryBacked = /historical/i.test(String(quote?.quoteSourceName || ""));
  const preflightWeekday = !["Sat", "Sun"].includes(preflightClock.weekday);
  const marketHasOpenedToday = preflightWeekday && preflightClock.minutes >= Math.min(...definition.sessions.map((session) => session[0]));
  const quoteIsTooOldWhileOpen = preflightOpen && observationAgeMs(quote?.regularMarketTime) > 12 * 60 * 1000;
  if (marketHasOpenedToday && (quoteSessionDate !== preflightClock.date || preflightHistoryBacked || quoteIsTooOldWhileOpen)) {
    try {
      const intraday = await getIntradayObservation(definition);
      if (exchangeObservationDate(intraday.marketTime, definition) === preflightClock.date) {
        quote = {
          ...quote,
          regularMarketPrice: intraday.price,
          regularMarketTime: intraday.marketTime,
          quoteSourceName: "Yahoo Finance intraday",
          marketState: preflightOpen ? "REGULAR" : "CLOSED",
        };
      }
    } catch (error) {
      console.warn(`Intraday global quote unavailable for ${definition.key}: ${error.message}`);
    }
  }
  let points = validPoints(rawPoints);
  if (points.length < 2) throw new Error("Insufficient global-index history");
  const historyBacked = /historical/i.test(String(quote.quoteSourceName || ""));
  const currentClock = exchangeClock(definition);
  const latestRawSessionDate = exchangeObservationDate(
    points.at(-1)?.date,
    definition
  );
  const exchangeIsOpen = !["Sat", "Sun"].includes(currentClock.weekday) &&
    definition.sessions.some(([open, close]) => currentClock.minutes >= open && currentClock.minutes < close);
  if (historyBacked && exchangeIsOpen && latestRawSessionDate === currentClock.date && points.length > 2) {
    points = points.slice(0, -1);
  }
  const closes = points.map((point) => point.adjustedClose);
  const latestSessionDate = exchangeObservationDate(
    points.at(-1)?.date,
    definition
  );

  if (preflightOpen) {
    const age = observationAgeMs(quote?.regularMarketTime);
    if (age < -2 * 60 * 1000 || age > 20 * 60 * 1000) {
      throw new Error(`No fresh live observation for ${definition.key}`);
    }
  }

  // Once today's session has begun, do not publish an older session as if it
  // were the latest one. The overview omits this index until a provider
  // supplies a genuine observation for the current exchange date.
  if (marketHasOpenedToday && exchangeObservationDate(quote?.regularMarketTime, definition) !== preflightClock.date && latestSessionDate !== preflightClock.date) {
    throw new Error(`No current-session observation for ${definition.key}`);
  }
  const previousClose = closes.at(-2);
  const latestClose = closes.at(-1);
  const historyChange = latestClose - previousClose;
  const status = globalQuoteStatus(
    quote,
    definition,
    latestSessionDate,
    historyBacked
  );
  const completedQuoteSessionDate = exchangeObservationDate(
    quote?.regularMarketTime,
    definition
  );
  const hasCompletedDailyClose =
    status === "eod" &&
    latestSessionDate === completedQuoteSessionDate &&
    Number.isFinite(latestClose) &&
    Number.isFinite(previousClose);
  const observationTime = hasCompletedDailyClose || historyBacked
    ? exchangeSessionCloseTimestamp(latestSessionDate, definition)
    : (quote.regularMarketTime || latestSessionDate || null);
  return {
    ...definition,
    value: hasCompletedDailyClose || historyBacked
      ? latestClose
      : (finite(quote.regularMarketPrice) ?? latestClose),
    change: hasCompletedDailyClose || historyBacked
      ? historyChange
      : finite(quote.regularMarketChange),
    changePercent: hasCompletedDailyClose || historyBacked
      ? (previousClose ? (historyChange / previousClose) * 100 : null)
      : finite(quote.regularMarketChangePercent),
    marketTime: observationTime,
    asOf: observationTime,
    sessionDateOnly: false,
    isGlobalIndex: true,
    dataStatus: status,
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
  const cacheKey = "global-index-overview:v5";
  const cached = await getCachedValue(cacheKey, 5 * 60 * 1000);
  if (cached) return cached;
  if (overviewInFlight) return overviewInFlight;

  overviewInFlight = (async () => {
    const retained =
      await getCachedValue(cacheKey, 24 * 60 * 60 * 1000) ||
      await getCachedValue("global-index-overview:v4", 24 * 60 * 60 * 1000);
    const retainedByKey = new Map(
      (Array.isArray(retained) ? retained : []).map((item) => [item.key, item])
    );
    const values = [];
    for (let offset = 0; offset < GLOBAL_INDICES.length; offset += 5) {
      const definitions = GLOBAL_INDICES.slice(offset, offset + 5);
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
    const freshByKey = new Map(values.map((item) => [item.key, item]));
    const merged = GLOBAL_INDICES.map((definition) => {
      const fresh = freshByKey.get(definition.key);
      const previous = retainedByKey.get(definition.key);
      if (!fresh) {
        return previous ? { ...previous, dataStatus: "stale", isStale: true } : null;
      }
      if (!previous) return fresh;

      const freshSession = exchangeObservationDate(fresh.marketTime, definition);
      const previousSession = exchangeObservationDate(previous.marketTime, definition);
      if (freshSession === previousSession) {
        if (previous.dataStatus === "eod" && fresh.dataStatus !== "eod") return previous;
        if (new Date(previous.marketTime).getTime() > new Date(fresh.marketTime).getTime()) {
          return previous;
        }
      }
      return fresh;
    }).filter(Boolean);
    await setCacheEntry(cacheKey, merged, 24 * 60 * 60 * 1000);
    return merged;
  })().finally(() => { overviewInFlight = null; });
  return overviewInFlight;
}

module.exports = { getGlobalIndexOverview, getGlobalIndexDetail };
