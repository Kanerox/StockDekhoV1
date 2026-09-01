const { fetchMarketData, fetchMarketDataBatch } = require("../clients/marketClient");
const { fetchHistoricalPrices } = require("../clients/historyClient");
const yahooProvider = require("../providers/marketData/yahooProvider");
const { GLOBAL_INDICES, getGlobalIndexDefinition } = require("../config/globalIndexConfig");
const { getCachedValue, setCacheEntry } = require("../clients/cacheClient");
const { marketClosure } = require("../config/marketCalendars");

const DIRECT_GLOBAL_QUOTE_KEYS = new Set(["NASDAQ", "EUROSTOXX50"]);
const intradayCache = new Map();
const INTRADAY_TTL_MS = 5 * 60 * 1000;
const GLOBAL_CARD_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
let overviewInFlight = null;

function globalCardCacheKey(key) {
  return `global-index-card:${key}:v1`;
}

async function getRetainedGlobalCard(key) {
  return getCachedValue(globalCardCacheKey(key), GLOBAL_CARD_RETENTION_MS);
}

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

function exchangeClosure(definition, now = new Date()) {
  const clock = exchangeClock(definition, now);
  return marketClosure(definition.calendar, clock.date, clock.weekday);
}

function observationClosure(definition, timestamp) {
  const clock = exchangeClock(definition, new Date(timestamp));
  return marketClosure(definition.calendar, clock.date, clock.weekday);
}

function pointSessionDate(point, definition) {
  return point?.sessionDate || exchangeObservationDate(point?.date, definition);
}

function closureForSessionDate(definition, dateKey) {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "short",
  }).format(new Date(`${dateKey}T12:00:00.000Z`));
  return marketClosure(definition.calendar, dateKey, weekday);
}

function excludeClosureSessionPoints(points, definition) {
  const tradedPoints = points.filter(
    (point) => closureForSessionDate(definition, pointSessionDate(point, definition)).type !== "holiday"
  );
  return tradedPoints.length >= 2 ? tradedPoints : points;
}

function exchangeIsOpen(definition, now = new Date()) {
  const clock = exchangeClock(definition, now);
  return !exchangeClosure(definition, now).closed && definition.sessions.some(
    ([open, close]) => clock.minutes >= open && clock.minutes < close
  );
}

function globalQuoteStatus(quote, definition, latestSessionDate, historyBacked = false, now = new Date(), completedDailyConfirmed = false) {
  const clock = exchangeClock(definition, now);
  const closure = exchangeClosure(definition, now);
  const tradingDay = !closure.closed;
  const scheduledOpen = tradingDay && definition.sessions.some(([open, close]) => clock.minutes >= open && clock.minutes < close);
  const observationValue = quote?.regularMarketTime || quote?.marketTime || quote?.asOf;
  const observation = exchangeClock(definition, new Date(observationValue || 0));
  const observationDate = observation.date;
  const finalClose = Math.max(...definition.sessions.map((session) => session[1]));
  const reconciliationMinute = finalClose + Number(definition.settlementBufferMinutes || 30);
  const marketState = String(quote?.marketState || "").toUpperCase();
  const providerIsDelayed = /delayed/i.test(String(quote?.quoteSourceName || quote?.dataProvider || ""));
  const age = observationAgeMs(observationValue, now);
  const knownDelayed = providerIsDelayed || definition.delayMinutes > 0;

  if (completedDailyConfirmed) return "eod";
  if (age < -60 * 1000) return "unavailable";
  if (!tradingDay || clock.minutes < Math.min(...definition.sessions.map((session) => session[0]))) {
    const expectedSession = expectedLatestWeekdaySession(definition, now);
    const expectedClose = new Date(exchangeSessionCloseTimestamp(expectedSession, definition)).getTime();
    const observationTime = new Date(observationValue || 0).getTime();
    const closeAligned = Number.isFinite(expectedClose) && Number.isFinite(observationTime) &&
      Math.abs(observationTime - expectedClose) <= 2 * 60 * 1000;
    if (observationDate === expectedSession && closeAligned) return "eod";
    return observationDate && observationDate < expectedSession ? "stale" : "last_updated";
  }
  if (observationDate !== clock.date) return scheduledOpen ? "stale" : "last_updated";
  if (scheduledOpen && knownDelayed && age <= 45 * 60 * 1000) return "delayed";
  if (scheduledOpen && age <= 15 * 60 * 1000) return "live";
  if (scheduledOpen && age <= 30 * 60 * 1000) return "last_updated";
  if (scheduledOpen) return "stale";
  if (clock.minutes < reconciliationMinute) return knownDelayed ? "delayed" : "last_updated";
  if (!historyBacked && marketState === "REGULAR" && age <= 30 * 60 * 1000) return knownDelayed ? "delayed" : "last_updated";
  return "stale";
}

function reconciliationEligible(definition, now = new Date()) {
  const clock = exchangeClock(definition, now);
  if (exchangeClosure(definition, now).closed) return true;
  const finalClose = Math.max(...definition.sessions.map((session) => session[1]));
  return clock.minutes >= finalClose + Number(definition.settlementBufferMinutes || 30);
}

function exchangeSessionCloseTimestamp(dateKey, definition) {
  if (!dateKey || !definition?.timeZone || !definition?.sessions?.length) return null;
  const [year, month, day] = dateKey.split("-").map(Number);
  const closeMinutes = Math.max(...definition.sessions.map((session) => session[1]));
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

function observationAgeMs(value, now = new Date()) {
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? now.getTime() - timestamp : Number.POSITIVE_INFINITY;
}

function expectedLatestWeekdaySession(definition, now = new Date()) {
  const clock = exchangeClock(definition, now);
  const firstOpen = Math.min(...definition.sessions.map((session) => session[0]));
  if (!exchangeClosure(definition, now).closed && clock.minutes >= firstOpen) return clock.date;
  const candidate = new Date(now);
  do {
    candidate.setUTCDate(candidate.getUTCDate() - 1);
  } while (exchangeClosure(definition, candidate).closed);
  return exchangeClock(definition, candidate).date;
}

function canReuseCompletedCard(card, definition, now = new Date()) {
  if (!card || card.dataStatus !== "eod") return false;
  if (observationAgeMs(card.marketTime, now) < -60 * 1000) return false;
  const cardSession = exchangeObservationDate(card.marketTime, definition);
  if (!cardSession) return false;
  const expectedClose = new Date(exchangeSessionCloseTimestamp(cardSession, definition)).getTime();
  const observedClose = new Date(card.marketTime).getTime();
  if (!Number.isFinite(expectedClose) || Math.abs(observedClose - expectedClose) > 2 * 60 * 1000) {
    return false;
  }
  const clock = exchangeClock(definition, now);
  const tradingDay = !exchangeClosure(definition, now).closed;
  const firstOpen = Math.min(...definition.sessions.map((session) => session[0]));
  const marketOpen = tradingDay && definition.sessions.some(
    ([open, close]) => clock.minutes >= open && clock.minutes < close
  );
  if (marketOpen) return false;
  if (!tradingDay || clock.minutes < firstOpen) {
    return cardSession === expectedLatestWeekdaySession(definition, now);
  }
  return cardSession === clock.date;
}

function retainedCardWithCurrentStatus(card, definition, now = new Date()) {
  if (observationAgeMs(card?.marketTime, now) < -60 * 1000) return null;
  if (canReuseCompletedCard(card, definition, now)) return card;
  const status = globalQuoteStatus(
    card,
    definition,
    exchangeObservationDate(card?.marketTime, definition),
    /historical/i.test(String(card?.dataProvider || "")),
    now,
    false
  );
  const safeStatus = status === "unavailable" ? "stale" : status;
  const closure = exchangeClosure(definition, now);
  return {
    ...card,
    dataStatus: safeStatus,
    isStale: safeStatus === "stale",
    marketClosure: closure.type === "holiday" ? closure.name : null,
  };
}

function shouldUseRetainedHeadline(detail, retained, definition) {
  if (!retained?.marketTime || !Number.isFinite(Number(retained?.value))) return false;
  if (!detail?.marketTime || !Number.isFinite(Number(detail?.value))) return true;
  const retainedSession = exchangeObservationDate(retained.marketTime, definition);
  const detailSession = exchangeObservationDate(detail.marketTime, definition);
  if (!retainedSession) return false;
  if (!detailSession || retainedSession > detailSession) return true;
  if (retainedSession < detailSession) return false;
  if (retained.dataStatus === "eod" && detail.dataStatus !== "eod") return true;
  return new Date(retained.marketTime).getTime() > new Date(detail.marketTime).getTime();
}

function mergeRetainedHeadline(detail, retained, definition) {
  const currentRetained = retainedCardWithCurrentStatus(retained, definition);
  if (!shouldUseRetainedHeadline(detail, currentRetained, definition)) return detail;
  return {
    ...detail,
    value: currentRetained.value,
    change: currentRetained.change,
    changePercent: currentRetained.changePercent,
    marketTime: currentRetained.marketTime,
    asOf: currentRetained.asOf || currentRetained.marketTime,
    dataStatus: currentRetained.dataStatus,
    isStale: Boolean(currentRetained.isStale),
    dataProvider: currentRetained.dataProvider,
    sessionDateOnly: currentRetained.sessionDateOnly,
    headlineFromRetainedObservation: true,
  };
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
  const currentClosure = exchangeClosure(definition, new Date());
  const retainedHeadline = await getRetainedGlobalCard(definition.key);
  const { period1, period2 } = resolvePeriod(range);
  const [quoteResult, historyResult] = await Promise.allSettled([
    fetchMarketData(definition.symbol),
    fetchHistoricalPrices(definition.historySymbol || definition.symbol, period1, period2, {
      appendLatestQuote: false,
    }),
  ]);
  let rawPoints = historyResult.status === "fulfilled" ? historyResult.value : null;
  let usedFallbackHistory = false;
  if ((!rawPoints || validPoints(rawPoints).length < 2) && definition.historySymbol) {
    try {
      rawPoints = await fetchHistoricalPrices(definition.symbol, period1, period2, {
        appendLatestQuote: false,
      });
      usedFallbackHistory = true;
    } catch (error) {
      console.warn(`Fallback global history unavailable for ${definition.key}: ${error.message}`);
    }
  }
  let points = validPoints(rawPoints);
  if (points.length < 2) {
    const reason = historyResult.status === "rejected" ? historyResult.reason?.message : "Insufficient global-index history";
    const quoteOnly = quoteResult.status === "fulfilled" ? quoteResult.value : null;
    const quoteOnlyTime = quoteOnly?.regularMarketTime;
    const quoteOnlyValue = finite(quoteOnly?.regularMarketPrice);
    if (!retainedHeadline && quoteOnlyValue !== null && quoteOnlyTime &&
        observationAgeMs(quoteOnlyTime) >= -60 * 1000) {
      const status = globalQuoteStatus(
        quoteOnly,
        definition,
        exchangeObservationDate(quoteOnlyTime, definition),
        false,
        new Date(),
        false
      );
      return {
        ...definition,
        value: quoteOnlyValue,
        change: finite(quoteOnly.regularMarketChange),
        changePercent: finite(quoteOnly.regularMarketChangePercent),
        marketTime: new Date(quoteOnlyTime).toISOString(),
        asOf: new Date(quoteOnlyTime).toISOString(),
        sessionDateOnly: false,
        isGlobalIndex: true,
        dataStatus: status,
        isStale: status === "stale",
        dataProvider: quoteOnly.quoteSourceName || "market provider",
        marketClosure: currentClosure.type === "holiday" ? currentClosure.name : null,
        periodReturn: null,
        periodHigh: null,
        periodLow: null,
        points: [],
        range,
        historyUnavailable: true,
        historyError: reason || "Insufficient global-index history",
      };
    }
    if (!retainedHeadline) throw new Error(reason || "Insufficient global-index history");
    return {
      ...definition,
      value: retainedHeadline.value,
      change: retainedHeadline.change,
      changePercent: retainedHeadline.changePercent,
      marketTime: retainedHeadline.marketTime,
      asOf: retainedHeadline.asOf || retainedHeadline.marketTime,
      sessionDateOnly: retainedHeadline.sessionDateOnly,
      isGlobalIndex: true,
      dataStatus: retainedHeadline.dataStatus,
      isStale: Boolean(retainedHeadline.isStale),
      dataProvider: retainedHeadline.dataProvider,
      marketClosure: currentClosure.type === "holiday" ? currentClosure.name : null,
      periodReturn: null,
      periodHigh: null,
      periodLow: null,
      points: [],
      range,
      historyUnavailable: true,
      historyError: reason || "Insufficient global-index history",
      headlineFromRetainedObservation: true,
    };
  }
  const now = new Date();
  let latestHistoricalPoint = points.at(-1);
  let quote = quoteResult.status === "fulfilled" ? quoteResult.value : {
    symbol: definition.symbol,
    regularMarketPrice: latestHistoricalPoint.adjustedClose,
    regularMarketTime: latestHistoricalPoint.date,
    quoteSourceName: "Historical market data",
    marketState: "CLOSED",
    isStale: true,
  };
  if (quoteResult.status === "rejected") {
    console.warn(`Global quote unavailable for ${definition.key}; retaining historical observation: ${quoteResult.reason?.message}`);
  }
  if (DIRECT_GLOBAL_QUOTE_KEYS.has(definition.key)) {
    try {
      const directQuote = await yahooProvider.quote(definition.symbol);
      const directTime = new Date(directQuote?.regularMarketTime).getTime();
      const baseTime = new Date(quote?.regularMarketTime).getTime();
      if (Number.isFinite(directTime) && (!Number.isFinite(baseTime) || directTime >= baseTime)) {
        quote = directQuote;
      }
    } catch (error) {
      console.warn(`Direct global quote unavailable for ${definition.key}: ${error.message}`);
    }
  }
  const preflightClock = exchangeClock(definition, now);
  const closure = exchangeClosure(definition, now);
  const preflightOpen = exchangeIsOpen(definition, now);
  const tradedPoints = excludeClosureSessionPoints(points, definition);
  if (tradedPoints !== points) {
    // Some providers emit a synthetic daily/reference row dated on a full-day
    // closure. It is not a traded session and must not become the observation
    // date shown to users or qualify as a completed daily candle.
    points = tradedPoints;
    latestHistoricalPoint = points.at(-1);
  }
  let quoteSessionDate = exchangeObservationDate(quote?.regularMarketTime, definition);
  if (observationClosure(definition, quote?.regularMarketTime).type === "holiday") {
    // A provider can refresh an unchanged reference value on a full-day
    // closure. Retrieval time is not a traded observation.
    quote = {
      ...quote,
      regularMarketPrice: latestHistoricalPoint.adjustedClose,
      regularMarketTime: exchangeSessionCloseTimestamp(
        pointSessionDate(latestHistoricalPoint, definition),
        definition
      ),
      quoteSourceName: "Historical market data",
      marketState: "CLOSED",
      isStale: false,
    };
    quoteSessionDate = exchangeObservationDate(quote.regularMarketTime, definition);
  }
  const preflightHistoryBacked = /historical/i.test(String(quote?.quoteSourceName || ""));
  const preflightTradingDay = !closure.closed;
  const marketHasOpenedToday = preflightTradingDay && preflightClock.minutes >= Math.min(...definition.sessions.map((session) => session[0]));
  const quoteIsFuture = observationAgeMs(quote?.regularMarketTime, now) < -60 * 1000;
  const quoteIsTooOldWhileOpen = preflightOpen && observationAgeMs(quote?.regularMarketTime, now) > 15 * 60 * 1000;
  let intradayObservationApplied = false;
  if (marketHasOpenedToday && (definition.preferIntradayChart || quoteIsFuture || quoteSessionDate !== preflightClock.date || preflightHistoryBacked || quoteIsTooOldWhileOpen)) {
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
        intradayObservationApplied = true;
      }
    } catch (error) {
      console.warn(`Intraday global quote unavailable for ${definition.key}: ${error.message}`);
    }
  }
  const historyBacked = /historical/i.test(String(quote.quoteSourceName || ""));
  const currentClock = exchangeClock(definition, now);
  const latestRawSessionDate = pointSessionDate(points.at(-1), definition);
  const marketOpenNow = exchangeIsOpen(definition, now);
  if (marketOpenNow && latestRawSessionDate === currentClock.date && points.length > 2) {
    points = points.slice(0, -1);
  }
  const closes = points.map((point) => point.adjustedClose);
  const latestSessionDate = pointSessionDate(points.at(-1), definition);

  const servingPriorSession = marketHasOpenedToday &&
    exchangeObservationDate(quote?.regularMarketTime, definition) !== preflightClock.date &&
    latestSessionDate !== preflightClock.date;
  const previousClose = closes.at(-2);
  const latestClose = closes.at(-1);
  const historyChange = latestClose - previousClose;
  const beforeOpen = preflightTradingDay && preflightClock.minutes < Math.min(...definition.sessions.map((session) => session[0]));
  const nonTradingDay = !preflightTradingDay;
  const preferredHistoryEligible = !definition.requirePreferredHistoryForEod || !usedFallbackHistory;
  const hasCompletedDailyClose = preferredHistoryEligible &&
    Number.isFinite(latestClose) &&
    Number.isFinite(previousClose) &&
    (
      ((beforeOpen || nonTradingDay) &&
        latestSessionDate === expectedLatestWeekdaySession(definition, now)) ||
      (reconciliationEligible(definition, now) && latestRawSessionDate === preflightClock.date)
    );
  // A missing current-session intraday observation must not erase a defined
  // benchmark when a legitimate completed historical observation exists.
  // The prior session remains visible with an honest stale/last-updated state;
  // it is never promoted to LIVE merely because it was fetched again.
  let status = globalQuoteStatus(
    quote,
    definition,
    latestSessionDate,
    historyBacked,
    now,
    hasCompletedDailyClose
  );
  if (servingPriorSession && !hasCompletedDailyClose) status = "stale";
  if (usedFallbackHistory && definition.requirePreferredHistoryForEod && status === "eod") status = "stale";
  const rawObservationTime = quote.regularMarketTime || null;
  const observationTime = hasCompletedDailyClose
    ? exchangeSessionCloseTimestamp(latestSessionDate, definition)
    : (observationAgeMs(rawObservationTime, now) >= -60 * 1000 ? rawObservationTime : null);
  if (!observationTime) throw new Error(`No trustworthy observation timestamp for ${definition.key}`);
  const detail = {
    ...definition,
    value: hasCompletedDailyClose
      ? latestClose
      : (finite(quote.regularMarketPrice) ?? latestClose),
    change: hasCompletedDailyClose
      ? historyChange
      : finite(quote.regularMarketChange),
    changePercent: hasCompletedDailyClose
      ? (previousClose ? (historyChange / previousClose) * 100 : null)
      : finite(quote.regularMarketChangePercent),
    marketTime: observationTime,
    asOf: observationTime,
    sessionDateOnly: false,
    isGlobalIndex: true,
    dataStatus: status,
    isStale: status === "stale" || Boolean(quote.isStale),
    dataProvider: hasCompletedDailyClose
      ? (usedFallbackHistory ? "Fallback historical market data" : definition.historySymbol ? "Yahoo Japan official cash-index history" : "Completed daily market data")
      : (quote.quoteSourceName || "market provider"),
    marketClosure: closure.type === "holiday" ? closure.name : null,
    periodReturn: returnPercent(points),
    periodHigh: Math.max(...closes),
    periodLow: Math.min(...closes),
    points,
    range,
  };
  return mergeRetainedHeadline(detail, retainedHeadline, definition);
}

async function getGlobalIndexOverview() {
  const cacheKey = "global-index-overview:v9";
  const cached = await getCachedValue(cacheKey, 5 * 60 * 1000);
  if (cached) return cached;
  if (overviewInFlight) return overviewInFlight;

  overviewInFlight = (async () => {
    const exactUpstoxSymbols = GLOBAL_INDICES
      .filter((definition) => definition.upstoxInstrumentKey)
      .map((definition) => definition.symbol);
    try {
      // One batched Upstox request warms all exact global matches. Individual
      // detail reads then reuse the normal market-data cache and fallback path.
      await fetchMarketDataBatch(exactUpstoxSymbols, { supplement: false });
    } catch (error) {
      console.warn(`Batched Upstox global quote warm-up unavailable: ${error.message}`);
    }
    const retainedSnapshots = await Promise.all([
      getCachedValue(cacheKey, GLOBAL_CARD_RETENTION_MS),
      getCachedValue("global-index-overview:v8", GLOBAL_CARD_RETENTION_MS),
      getCachedValue("global-index-overview:v7", GLOBAL_CARD_RETENTION_MS),
      getCachedValue("global-index-overview:v6", GLOBAL_CARD_RETENTION_MS),
      getCachedValue("global-index-overview:v5", GLOBAL_CARD_RETENTION_MS),
      getCachedValue("global-index-overview:v4", GLOBAL_CARD_RETENTION_MS),
      getCachedValue("global-index-overview:v3", GLOBAL_CARD_RETENTION_MS),
    ]);
    const retainedByKey = new Map();
    retainedSnapshots.filter(Array.isArray).forEach((snapshot) => {
      snapshot.forEach((item) => {
        if (item?.key && !retainedByKey.has(item.key)) retainedByKey.set(item.key, item);
      });
    });
    const retainedCards = await Promise.all(
      GLOBAL_INDICES.map((definition) =>
        getCachedValue(globalCardCacheKey(definition.key), GLOBAL_CARD_RETENTION_MS)
      )
    );
    retainedCards.forEach((item) => {
      if (item?.key) retainedByKey.set(item.key, item);
    });
    const values = [];
    for (let offset = 0; offset < GLOBAL_INDICES.length; offset += 5) {
      const definitions = GLOBAL_INDICES.slice(offset, offset + 5);
    const results = await Promise.allSettled(
      definitions.map(async (definition) => {
      const retained = retainedByKey.get(definition.key);
      if (canReuseCompletedCard(retained, definition)) {
        const retainedClosure = exchangeClosure(definition);
        return {
          ...retained,
          marketClosure: retainedClosure.type === "holiday" ? retainedClosure.name : null,
        };
      }
      const detail = await getGlobalIndexDetail(definition.key, "1M");
      if (detail.historyUnavailable && retained) {
        return retainedCardWithCurrentStatus(retained, definition);
      }
      return {
        key: detail.key, name: detail.name, symbol: detail.symbol, region: detail.region,
        description: detail.description, value: detail.value, change: detail.change,
        changePercent: detail.changePercent, oneMonthReturn: detail.periodReturn,
        sparkline: detail.points.map((point) => point.adjustedClose), marketTime: detail.marketTime,
        asOf: detail.asOf, dataStatus: detail.dataStatus, isStale: detail.isStale,
        dataProvider: detail.dataProvider, sessionDateOnly: detail.sessionDateOnly,
        marketClosure: detail.marketClosure,
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
        if (!previous) return null;
        return retainedCardWithCurrentStatus(previous, definition);
      }
      if (!previous) return fresh;

      const freshSession = exchangeObservationDate(fresh.marketTime, definition);
      const previousSession = exchangeObservationDate(previous.marketTime, definition);
      if (freshSession === previousSession) {
        if (
          previous.dataStatus === "eod" &&
          fresh.dataStatus !== "eod" &&
          canReuseCompletedCard(previous, definition)
        ) return previous;
        if (new Date(previous.marketTime).getTime() > new Date(fresh.marketTime).getTime()) {
          return previous;
        }
      }
      if (previousSession && freshSession && previousSession > freshSession) {
        return retainedCardWithCurrentStatus(previous, definition);
      }
      return fresh;
    }).filter(Boolean);
    await Promise.all(
      merged.map((item) =>
        setCacheEntry(globalCardCacheKey(item.key), item, GLOBAL_CARD_RETENTION_MS)
      )
    );
    await setCacheEntry(cacheKey, merged, GLOBAL_CARD_RETENTION_MS);
    return merged;
  })().finally(() => { overviewInFlight = null; });
  return overviewInFlight;
}

module.exports = {
  getGlobalIndexOverview,
  getGlobalIndexDetail,
  _test: {
    exchangeClock,
    exchangeClosure,
    observationClosure,
    pointSessionDate,
    excludeClosureSessionPoints,
    exchangeIsOpen,
    exchangeObservationDate,
    exchangeSessionCloseTimestamp,
    reconciliationEligible,
    globalQuoteStatus,
    canReuseCompletedCard,
    retainedCardWithCurrentStatus,
    shouldUseRetainedHeadline,
    mergeRetainedHeadline,
    expectedLatestWeekdaySession,
  },
};
