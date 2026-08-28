const MAX_FUTURE_SKEW_MS = 60 * 1000;
const MAX_DISPLAY_AGE_MS = 5 * 24 * 60 * 60 * 1000;
const INDIAN_INDEX_FRESHNESS_POLICY = Object.freeze({
  liveThroughMs: 15 * 60 * 1000,
  lastUpdatedThroughMs: 30 * 60 * 1000,
});

function finitePositive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function comparableSymbol(value) {
  return String(value || "").trim().toUpperCase().replace(/\.(NS|BO)$/, "");
}

function istParts(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      weekday: "short",
    }).formatToParts(date).map((part) => [part.type, part.value])
  );
}

function sessionKey(value) {
  const parts = istParts(value);
  return parts ? `${parts.year}-${parts.month}-${parts.day}` : null;
}

function isIndianMarketOpen(now = new Date()) {
  const parts = istParts(now);
  if (!parts || parts.weekday === "Sat" || parts.weekday === "Sun") return false;
  const minutes = Number(parts.hour) * 60 + Number(parts.minute);
  // Closing Auction Session activity can continue beyond the old 15:30
  // continuous-session boundary. Treat exchange observations through 15:40
  // as active; the period after that is reconciliation, not confirmed EOD.
  return minutes >= 9 * 60 + 15 && minutes < 15 * 60 + 40;
}

function indianMarketPhase(now = new Date()) {
  const parts = istParts(now);
  if (!parts || parts.weekday === "Sat" || parts.weekday === "Sun") return "closed";
  const minutes = Number(parts.hour) * 60 + Number(parts.minute);
  if (minutes < 9 * 60 + 15) return "pre_market";
  if (minutes < 15 * 60 + 40) return "live";
  if (minutes < 16 * 60 + 5) return "reconciling";
  return "closed";
}

function classifyFreshness(timestamp, now = new Date(), policy = INDIAN_INDEX_FRESHNESS_POLICY) {
  const observedAt = new Date(timestamp);
  const ageMs = now.getTime() - observedAt.getTime();
  if (!Number.isFinite(ageMs) || ageMs < -MAX_FUTURE_SKEW_MS) return "invalid";
  if (ageMs > MAX_DISPLAY_AGE_MS) return "expired";
  if (isIndianMarketOpen(now)) {
    if (sessionKey(observedAt) !== sessionKey(now)) return "stale";
    if (ageMs <= policy.liveThroughMs) return "live";
    if (ageMs <= policy.lastUpdatedThroughMs) return "last_updated";
    return "stale";
  }
  return "eod";
}

function validateQuote(quote, { requestedSymbol, allowStale = false } = {}) {
  if (!quote || typeof quote !== "object") throw new Error("Market provider returned an empty quote");
  if (requestedSymbol && quote.symbol && comparableSymbol(requestedSymbol) !== comparableSymbol(quote.symbol)) {
    throw new Error(`Quote symbol mismatch: requested ${requestedSymbol}, received ${quote.symbol}`);
  }
  const price = finitePositive(quote.regularMarketPrice);
  const previousClose = finitePositive(quote.regularMarketPreviousClose);
  const timestamp = new Date(quote.regularMarketTime);
  if (price === null) throw new Error(`Invalid price for ${requestedSymbol || quote.symbol || "instrument"}`);
  if (previousClose === null) throw new Error(`Invalid previous close for ${requestedSymbol || quote.symbol || "instrument"}`);
  if (Number.isNaN(timestamp.getTime())) throw new Error(`Invalid market timestamp for ${requestedSymbol || quote.symbol || "instrument"}`);
  if (timestamp.getTime() > Date.now() + MAX_FUTURE_SKEW_MS) throw new Error(`Future market timestamp for ${requestedSymbol || quote.symbol || "instrument"}`);

  let freshness = classifyFreshness(timestamp);
  if (quote.observationKind === "session_close") {
    const observationSession = quote.observationDate || sessionKey(timestamp);
    const currentSession = sessionKey(new Date());
    freshness = observationSession === currentSession || indianMarketPhase() !== "live"
      ? "eod"
      : "stale";
  } else if (["provisional_close", "provisional_session"].includes(quote.observationKind)) {
    const phase = indianMarketPhase();
    const ageMs = Date.now() - timestamp.getTime();
    freshness = phase !== "live" && ageMs <= 3 * 24 * 60 * 60 * 1000
      ? "last_updated"
      : "stale";
  } else if (indianMarketPhase() === "reconciling" && sessionKey(timestamp) === sessionKey(new Date())) {
    freshness = "last_updated";
  } else if (indianMarketPhase() === "closed" && sessionKey(timestamp) === sessionKey(new Date())) {
    // A same-day LTP after trading is only a provisional observation until a
    // completed daily candle confirms the exchange close.
    freshness = "last_updated";
  }
  if (freshness === "invalid" || freshness === "expired" || (freshness === "stale" && !allowStale)) {
    throw new Error(`Quote is beyond the accepted freshness window for ${requestedSymbol || quote.symbol || "instrument"}`);
  }
  const change = price - previousClose;
  const changePercent = (change / previousClose) * 100;
  if (Math.abs(changePercent) > 80) {
    console.warn(`Unusually large quote move retained for review: ${requestedSymbol || quote.symbol} ${changePercent.toFixed(2)}%`);
  }

  return {
    ...quote,
    regularMarketPrice: price,
    regularMarketPreviousClose: previousClose,
    regularMarketChange: change,
    regularMarketChangePercent: changePercent,
    regularMarketTime: timestamp.toISOString(),
    dataStatus: freshness,
    isStale: freshness === "stale",
  };
}

module.exports = {
  validateQuote,
  classifyFreshness,
  sessionKey,
  isIndianMarketOpen,
  indianMarketPhase,
  INDIAN_INDEX_FRESHNESS_POLICY,
  MAX_DISPLAY_AGE_MS,
};
