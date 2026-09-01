const assert = require("assert");
const {
  validateQuote,
  classifyObservationLifecycle,
} = require("../utils/marketDataValidation");
const { _test: marketClientTest } = require("../clients/marketClient");

function quote(overrides = {}) {
  return {
    symbol: "^NSEI",
    regularMarketPrice: 25050,
    regularMarketPreviousClose: 24900,
    regularMarketTime: "2026-09-01T08:29:00.000Z",
    observationDate: "2026-09-01",
    observationKind: "session_close",
    quoteSourceName: "Upstox historical",
    ...overrides,
  };
}

const liveNow = new Date("2026-09-01T08:30:00.000Z"); // 14:00 IST
const developing = validateQuote(quote(), {
  requestedSymbol: "^NSEI",
  allowStale: true,
  now: liveNow,
});
assert.strictEqual(developing.dataStatus, "live");
assert.strictEqual(developing.observationKind, "provisional_session");

const overview = classifyObservationLifecycle({
  marketTime: developing.regularMarketTime,
  observationDate: developing.observationDate,
  observationKind: developing.observationKind,
}, liveNow);
assert.deepStrictEqual(overview, {
  dataStatus: "live",
  observationKind: "provisional_session",
});

const reconcilingNow = new Date("2026-09-01T10:20:00.000Z"); // 15:50 IST
const reconciling = validateQuote(quote({ regularMarketTime: "2026-09-01T10:10:00.000Z" }), {
  requestedSymbol: "^NSEI",
  allowStale: true,
  now: reconcilingNow,
});
assert.strictEqual(reconciling.dataStatus, "last_updated");
assert.strictEqual(reconciling.observationKind, "provisional_close");

const closedNow = new Date("2026-09-01T10:40:00.000Z"); // 16:10 IST
const completed = validateQuote(quote({
  regularMarketPrice: 25080,
  regularMarketTime: "2026-09-01T10:15:00.000Z",
}), {
  requestedSymbol: "^NSEI",
  allowStale: true,
  now: closedNow,
});
assert.strictEqual(completed.dataStatus, "eod");
assert.strictEqual(completed.observationKind, "session_close");

const laterProvisional = quote({
  regularMarketPrice: 25060,
  regularMarketTime: "2026-09-01T10:25:00.000Z",
  observationKind: "provisional_close",
  quoteSourceName: "Upstox",
});
const protectedClose = marketClientTest.chooseNewerQuote(
  laterProvisional,
  completed,
  "^NSEI",
  closedNow
);
assert.strictEqual(protectedClose.regularMarketPrice, 25080);
assert.strictEqual(protectedClose.dataStatus, "eod");

const nextSessionNow = new Date("2026-09-02T04:30:00.000Z"); // 10:00 IST
const priorClose = validateQuote(completed, {
  requestedSymbol: "^NSEI",
  allowStale: true,
  now: nextSessionNow,
});
assert.strictEqual(priorClose.dataStatus, "stale");
const nextLive = validateQuote(quote({
  regularMarketPrice: 25120,
  regularMarketTime: "2026-09-02T04:29:00.000Z",
  observationDate: "2026-09-02",
  observationKind: "intraday",
  quoteSourceName: "Upstox",
}), {
  requestedSymbol: "^NSEI",
  allowStale: true,
  now: nextSessionNow,
});
assert.strictEqual(nextLive.dataStatus, "live");
assert.strictEqual(nextLive.regularMarketPrice, 25120);

console.log("Indian intraday → reconciliation → EOD → next-session lifecycle checks passed.");
