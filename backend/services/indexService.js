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
const { getCachedValue, setCacheEntry, updateCacheEntryAtomic } = require("../clients/cacheClient");
const {
  sessionKey,
  isIndianMarketOpen,
  indianMarketPhase,
  classifyObservationLifecycle,
  indianMarketClosure,
} = require("../utils/marketDataValidation");
const { marketClosure } = require("../config/marketCalendars");

const LEADERSHIP_SNAPSHOT_FRESH_MS = 5 * 60 * 1000;
const CLOSED_LEADERSHIP_SNAPSHOT_FRESH_MS = 6 * 60 * 60 * 1000;
const LEADERSHIP_SNAPSHOT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const INDEX_OVERVIEW_RETENTION_MS = 48 * 60 * 60 * 1000;
const lastConsistentLeadershipByRange = new Map();
let overviewInFlight = null;

function indianClockMinutes(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(now).map((part) => [part.type, part.value]));
  return {
    weekday: parts.weekday,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

function indexOverviewFreshMs(now = new Date()) {
  const clock = indianClockMinutes(now);
  const weekday = ["Mon", "Tue", "Wed", "Thu", "Fri"].includes(clock.weekday);
  const reconciling = weekday && clock.minutes >= 15 * 60 + 30 && clock.minutes < 16 * 60 + 5;
  return isIndianMarketOpen(now) || reconciling
    ? 5 * 60 * 1000
    : 6 * 60 * 60 * 1000;
}

function leadershipSnapshotFreshMs(now = new Date()) {
  const clock = indianClockMinutes(now);
  const weekday = ["Mon", "Tue", "Wed", "Thu", "Fri"].includes(clock.weekday);
  const reconciling = weekday && clock.minutes >= 15 * 60 + 30 && clock.minutes < 16 * 60 + 5;
  return isIndianMarketOpen(now) || reconciling
    ? LEADERSHIP_SNAPSHOT_FRESH_MS
    : CLOSED_LEADERSHIP_SNAPSHOT_FRESH_MS;
}

function indexSummaryCacheKey(key) {
  return `index-summary:${key}:v2`;
}

function withCurrentFreshness(observation, now = new Date()) {
  if (!observation?.marketTime) return observation;
  const lifecycle = classifyObservationLifecycle(observation, now);
  const dataStatus = lifecycle.dataStatus;
  return {
    ...observation,
    observationKind: lifecycle.observationKind,
    dataStatus,
    isStale: dataStatus === "stale",
  };
}

function indianTradingDay(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
  }).formatToParts(now);
  const weekday = parts.find((part) => part.type === "weekday")?.value;
  return !marketClosure("INDIA", sessionKey(now), weekday).closed;
}

function expectedLatestIndianSession(now = new Date()) {
  const today = sessionKey(now);
  const parts = indianClockMinutes(now);
  if (indianTradingDay(now) && parts.minutes >= 9 * 60 + 15) return today;
  const candidate = new Date(`${today}T12:00:00+05:30`);
  do candidate.setUTCDate(candidate.getUTCDate() - 1);
  while (!indianTradingDay(candidate));
  return sessionKey(candidate);
}

function isAuthoritativeCompletedLeadership(detail, now = new Date()) {
  return isConsistentLeadershipDetail(detail) &&
    detail.observationKind === "session_close" &&
    observationSession(detail) === expectedLatestIndianSession(now);
}

function observationTimestamp(observation) {
  const value = new Date(observation?.marketTime || observation?.asOf || 0).getTime();
  return Number.isFinite(value) ? value : 0;
}

function observationSession(observation) {
  return observation?.observationDate || sessionKey(observation?.marketTime || observation?.asOf);
}

function selectAuthoritativeIndexObservation(candidate, retained, now = new Date()) {
  if (!retained) return candidate;
  if (!candidate) return withCurrentFreshness(retained, now);
  const currentCandidate = withCurrentFreshness(candidate, now);
  const currentRetained = withCurrentFreshness(retained, now);
  const candidateSession = observationSession(currentCandidate);
  const retainedSession = observationSession(currentRetained);
  if (!retainedSession) return currentCandidate;
  if (!candidateSession || retainedSession > candidateSession) return currentRetained;
  if (candidateSession > retainedSession) return currentCandidate;
  const candidateCompleted = currentCandidate.observationKind === "session_close" && currentCandidate.dataStatus === "eod";
  const retainedCompleted = currentRetained.observationKind === "session_close" && currentRetained.dataStatus === "eod";
  if (retainedCompleted !== candidateCompleted) return retainedCompleted ? currentRetained : currentCandidate;
  return observationTimestamp(currentRetained) > observationTimestamp(currentCandidate)
    ? currentRetained
    : currentCandidate;
}

function mergeAuthoritativeIndexHeadline(detail, retained, now = new Date()) {
  const authoritative = selectAuthoritativeIndexObservation(detail, retained, now);
  if (authoritative === detail) return detail;
  return {
    ...detail,
    value: authoritative.value,
    change: authoritative.change,
    changePercent: authoritative.changePercent,
    marketTime: authoritative.marketTime,
    asOf: authoritative.asOf || authoritative.marketTime,
    observationDate: authoritative.observationDate || null,
    observationKind: authoritative.observationKind || null,
    dataStatus: authoritative.dataStatus,
    isStale: Boolean(authoritative.isStale),
    dataProvider: authoritative.dataProvider || detail.dataProvider,
    quoteSource: authoritative.quoteSource || detail.quoteSource,
  };
}

function cachedOverviewNeedsReconciliation(cached, now = new Date()) {
  if (!Array.isArray(cached) || indianMarketPhase(now) !== "closed" || !indianTradingDay(now)) return false;
  const today = sessionKey(now);
  return cached.some((item) =>
    observationSession(item) === today && item?.observationKind !== "session_close"
  );
}

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
    marketTime: quote?.regularMarketTime || null,
    observationDate: quote?.observationDate || null,
    observationKind: quote?.observationKind || null,
    dataStatus: quote?.dataStatus || null,
    isStale: Boolean(quote?.isStale),
    mcap: marketCap === null ? null : marketCap / 10000000,
    pe: valueOrNull(quote?.trailingPE),
    ret1y: valueOrNull(quote?.fiftyTwoWeekChangePercent),
  };
}

async function fetchConstituents(definition) {
  if (definition.constituents.length === 0) return [];

  // Leadership only needs authoritative prices/timestamps. Waiting for Yahoo
  // fundamentals here made the whole same-session snapshot depend on an
  // unrelated supplemental provider.
  const quotes = await fetchMarketDataBatch(definition.constituents, {
    supplement: false,
  });
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
  const closure = indianMarketClosure();
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
    observationDate: quote.observationDate || null,
    observationKind: quote.observationKind || null,
    dataProvider: getMarketDataProviderName(),
    quoteSource: quote.quoteSourceName || getMarketDataProviderName(),
    dataStatus: quote.dataStatus || null,
    isStale: Boolean(quote.isStale),
    marketClosure: quote.marketClosure || (closure.type === "holiday" ? closure.name : null),
  };
}

function leadershipSnapshotCacheKey(range) {
  return `index-detail-consistent:NIFTY50:${range}:v2`;
}

function isConsistentLeadershipDetail(detail) {
  const indexSession = sessionKey(detail?.marketTime);
  const constituents = Array.isArray(detail?.constituents)
    ? detail.constituents
    : [];
  return Boolean(
    indexSession &&
    detail?.dataStatus !== "stale" &&
    !detail?.isStale &&
    constituents.length === 50 &&
    constituents.every(
      (stock) =>
        Number.isFinite(stock?.chgPct) &&
        stock?.dataStatus !== "stale" &&
        !stock?.isStale &&
        sessionKey(stock?.marketTime) === indexSession
    )
  );
}

async function getIndexSummary(definition) {
  const { period1, period2 } = resolvePeriod("1M");
  const [quote, points] = await Promise.all([
    fetchMarketData(definition.symbol),
    fetchHistoricalPrices(definition.symbol, period1, period2),
  ]);

  const sessions = completedSessionPoints(points);
  const historyMove = calculateDailyMove(sessions);
  const quoteMove = {
    change: valueOrNull(quote.regularMarketChange),
    changePercent: valueOrNull(quote.regularMarketChangePercent),
  };
  return {
    ...mapQuote(definition, quote),
    ...(quoteMove.changePercent === null ? historyMove : quoteMove),
    oneMonthReturn: calculateReturn(sessions),
    sparkline: sessions.map((point) => point.adjustedClose),
  };
}

async function getIndexOverview(dependencies = {}) {
  const cacheKey = "index-overview:v8";
  const cached = await getCachedValue(cacheKey, indexOverviewFreshMs());
  // Price payloads may be safely reused after the session, but lifecycle
  // labels must be evaluated against the current exchange phase on every
  // response. Otherwise a quote cached while LIVE can remain labelled LIVE
  // for the full post-close cache window.
  if (cached && !cachedOverviewNeedsReconciliation(cached)) {
    const cachedByKey = new Map(cached.map((item) => [item.key, item]));
    const retained = await Promise.all(INDICES.map((definition) =>
      getCachedValue(indexSummaryCacheKey(definition.key), INDEX_OVERVIEW_RETENTION_MS)
    ));
    return INDICES.map((definition, index) =>
      selectAuthoritativeIndexObservation(cachedByKey.get(definition.key), retained[index])
    ).filter(Boolean);
  }
  if (overviewInFlight) return overviewInFlight;

  overviewInFlight = (async () => {
  const summaryLoader = dependencies.getIndexSummary || getIndexSummary;
  const results = await Promise.allSettled(INDICES.map(summaryLoader));
  const summaries = await Promise.all(results.map(async (result, index) => {
    const definition = INDICES[index];
    if (result.status === "fulfilled") {
      const retained = await getCachedValue(
        indexSummaryCacheKey(definition.key),
        INDEX_OVERVIEW_RETENTION_MS
      );
      const authoritative = selectAuthoritativeIndexObservation(result.value, retained);
      try {
        return await updateCacheEntryAtomic(
          indexSummaryCacheKey(definition.key),
          authoritative,
          INDEX_OVERVIEW_RETENTION_MS,
          (candidate, existing) => selectAuthoritativeIndexObservation(candidate, existing)
        );
      } catch (error) {
        console.error(`Index authority persistence unavailable for ${definition.key}:`, error.message);
        return authoritative;
      }
    }
    const retained = await getCachedValue(
      indexSummaryCacheKey(definition.key),
      INDEX_OVERVIEW_RETENTION_MS
    );
    return retained ? withCurrentFreshness(retained) : null;
  }));
  const available = summaries.filter(Boolean);
  if (!available.length) throw new Error("No Indian index observations are available");
  await setCacheEntry(cacheKey, available, INDEX_OVERVIEW_RETENTION_MS);
  return available;
  })().finally(() => { overviewInFlight = null; });
  return overviewInFlight;
}

async function reconcileIndexClose(key, now = new Date(), dependencies = {}) {
  const definition = getIndexDefinition(key);
  if (!definition) throw new Error("Unknown index");
  const quote = await (dependencies.fetchMarketData || fetchMarketData)(definition.symbol);
  const candidate = withCurrentFreshness(mapQuote(definition, quote), now);
  if (candidate.observationKind !== "session_close" || candidate.dataStatus !== "eod") {
    const error = new Error("Completed-session observation is not available yet");
    error.code = "COMPLETED_SESSION_NOT_READY";
    throw error;
  }
  return updateCacheEntryAtomic(
    indexSummaryCacheKey(definition.key), candidate, INDEX_OVERVIEW_RETENTION_MS,
    (next, retained) => selectAuthoritativeIndexObservation(next, retained, now)
  );
}

async function getIndexDetail(key, range = "1Y", dependencies = {}) {
  const definition = getIndexDefinition(key);

  if (!definition) {
    throw new Error("Unknown index");
  }

  const leadershipCacheKey = definition.key === "NIFTY50"
    ? leadershipSnapshotCacheKey(range)
    : null;
  if (leadershipCacheKey) {
    const retainedCompleted = await getCachedValue(
      leadershipCacheKey,
      LEADERSHIP_SNAPSHOT_RETENTION_MS
    );
    if (indianMarketPhase() === "closed" && isAuthoritativeCompletedLeadership(retainedCompleted)) {
      return retainedCompleted;
    }
    const cached = await getCachedValue(
      leadershipCacheKey,
      leadershipSnapshotFreshMs()
    );
    if (cached) {
      const retainedSummary = await getCachedValue(
        indexSummaryCacheKey(definition.key),
        INDEX_OVERVIEW_RETENTION_MS
      );
      const authoritative = mergeAuthoritativeIndexHeadline(
        withCurrentFreshness(cached),
        retainedSummary
      );
      return {
        ...authoritative,
        constituents: (cached.constituents || []).map(withCurrentFreshness),
      };
    }
  }

  const { period1, period2 } = resolvePeriod(range);
  const retainedSummary = await getCachedValue(
    indexSummaryCacheKey(definition.key),
    INDEX_OVERVIEW_RETENTION_MS
  );
  const [quoteResult, historyResult, constituentsResult] = await Promise.allSettled([
    (dependencies.fetchMarketData || fetchMarketData)(definition.symbol),
    (dependencies.fetchHistoricalPrices || fetchHistoricalPrices)(definition.symbol, period1, period2),
    (dependencies.fetchConstituents || fetchConstituents)(definition),
  ]);
  if (quoteResult.status === "rejected" && !retainedSummary) throw quoteResult.reason;

  const quote = quoteResult.status === "fulfilled" ? quoteResult.value : null;
  const points = historyResult.status === "fulfilled" ? historyResult.value : [];
  const constituents = constituentsResult.status === "fulfilled" ? constituentsResult.value : [];
  const sessions = completedSessionPoints(points);

  const closes = sessions
    .map((point) => point.adjustedClose)
    .filter(Number.isFinite);

  const candidateHeadline = quote ? mapQuote(definition, quote) : retainedSummary;
  let detail = {
    ...candidateHeadline,
    ...(quote && valueOrNull(quote.regularMarketChangePercent) === null && sessions.length >= 2
      ? calculateDailyMove(sessions)
      : quote ? {
          change: valueOrNull(quote.regularMarketChange),
          changePercent: valueOrNull(quote.regularMarketChangePercent),
        } : {}),
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
    historyUnavailable: historyResult.status === "rejected" || sessions.length < 2,
    constituentsUnavailable: constituentsResult.status === "rejected",
  };

  detail = mergeAuthoritativeIndexHeadline(detail, retainedSummary);
  const authoritativeSummary = selectAuthoritativeIndexObservation(detail, retainedSummary);
  try {
    await updateCacheEntryAtomic(
      indexSummaryCacheKey(definition.key),
      {
        ...authoritativeSummary,
        oneMonthReturn: retainedSummary?.oneMonthReturn ?? null,
        sparkline: retainedSummary?.sparkline || [],
      },
      INDEX_OVERVIEW_RETENTION_MS,
      (candidate, existing) => selectAuthoritativeIndexObservation(candidate, existing)
    );
  } catch (error) {
    console.error(`Index detail authority persistence unavailable for ${definition.key}:`, error.message);
  }

  if (!leadershipCacheKey) return detail;

  if (isConsistentLeadershipDetail(detail)) {
    lastConsistentLeadershipByRange.set(range, detail);
    await setCacheEntry(
      leadershipCacheKey,
      detail,
      LEADERSHIP_SNAPSHOT_RETENTION_MS
    );
    return detail;
  }

  const previous = await getCachedValue(
    leadershipCacheKey,
    LEADERSHIP_SNAPSHOT_RETENTION_MS
  ) || lastConsistentLeadershipByRange.get(range);
  if (
    isConsistentLeadershipDetail(previous) &&
    sessionKey(previous.marketTime) === sessionKey(detail.marketTime)
  ) {
    console.warn(
      "Preserving the last consistent Nifty 50 leadership snapshot for the current session."
    );
    const refreshedPrevious = withCurrentFreshness(previous);
    return {
      ...refreshedPrevious,
      constituents: previous.constituents.map(withCurrentFreshness),
    };
  }

  return detail;
}

module.exports = {
  getIndexOverview,
  getIndexDetail,
  reconcileIndexClose,
  _test: {
    withCurrentFreshness,
    selectAuthoritativeIndexObservation,
    mergeAuthoritativeIndexHeadline,
    cachedOverviewNeedsReconciliation,
    expectedLatestIndianSession,
    isAuthoritativeCompletedLeadership,
  },
};
