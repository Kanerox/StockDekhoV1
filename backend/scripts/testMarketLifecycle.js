const assert = require("assert");
const { classifyFreshness, indianMarketPhase, validateQuote } = require("../utils/marketDataValidation");
const { getGlobalIndexDefinition } = require("../config/globalIndexConfig");
const { _test } = require("../services/globalIndexService");

const hsi = getGlobalIndexDefinition("HANGSENG");
const euro = getGlobalIndexDefinition("EUROSTOXX50");
const sp500 = getGlobalIndexDefinition("SP500");
const ftse = getGlobalIndexDefinition("FTSE100");
const dax = getGlobalIndexDefinition("DAX");
const nikkei = getGlobalIndexDefinition("NIKKEI225");

assert.strictEqual(
  _test.exchangeSessionCloseTimestamp("2026-08-28", hsi),
  "2026-08-28T08:00:00.000Z",
  "Hang Seng displays its 16:00 HKT close, not its 16:30 reconciliation time"
);

// IANA timezone conversion must follow exchange-local daylight-saving rules.
assert.strictEqual(_test.exchangeSessionCloseTimestamp("2026-03-06", sp500), "2026-03-06T21:00:00.000Z");
assert.strictEqual(_test.exchangeSessionCloseTimestamp("2026-03-09", sp500), "2026-03-09T20:00:00.000Z");
assert.strictEqual(_test.exchangeSessionCloseTimestamp("2026-03-20", ftse), "2026-03-20T16:30:00.000Z");
assert.strictEqual(_test.exchangeSessionCloseTimestamp("2026-03-30", ftse), "2026-03-30T15:30:00.000Z");
assert.strictEqual(_test.exchangeSessionCloseTimestamp("2026-03-20", dax), "2026-03-20T16:30:00.000Z");
assert.strictEqual(_test.exchangeSessionCloseTimestamp("2026-03-30", dax), "2026-03-30T15:30:00.000Z");
assert.strictEqual(_test.exchangeSessionCloseTimestamp("2026-10-30", sp500), "2026-10-30T20:00:00.000Z");
assert.strictEqual(_test.exchangeSessionCloseTimestamp("2026-10-30", ftse), "2026-10-30T16:30:00.000Z");
assert.strictEqual(_test.exchangeSessionCloseTimestamp("2026-10-30", dax), "2026-10-30T16:30:00.000Z");
assert.strictEqual(_test.exchangeSessionCloseTimestamp("2026-03-09", nikkei), "2026-03-09T06:30:00.000Z");
assert.strictEqual(_test.exchangeSessionCloseTimestamp("2026-10-30", nikkei), "2026-10-30T06:30:00.000Z");
assert.strictEqual(
  _test.globalQuoteStatus(
    {
      regularMarketTime: "2026-08-28T18:29:00.000Z",
      quoteSourceName: "Yahoo Finance intraday",
      marketState: "CLOSED",
    },
    sp500,
    "2026-08-28",
    false,
    new Date("2026-08-31T11:00:00.000Z"),
    false
  ),
  "last_updated",
  "A pre-close US observation must not be presented as the completed Friday EOD"
);
assert.strictEqual(
  _test.reconciliationEligible(hsi, new Date("2026-08-28T08:20:00.000Z")),
  false
);
assert.strictEqual(
  _test.reconciliationEligible(hsi, new Date("2026-08-28T08:31:00.000Z")),
  true
);

const quote = (time, source = "Yahoo Finance intraday") => ({
  regularMarketTime: time,
  quoteSourceName: source,
  marketState: "REGULAR",
});
assert.strictEqual(
  _test.globalQuoteStatus(quote("2026-08-28T01:56:00.000Z"), hsi, "2026-08-27", false, new Date("2026-08-28T02:00:00.000Z"), false),
  "live"
);
assert.strictEqual(
  _test.globalQuoteStatus(quote("2026-08-28T01:40:00.000Z"), hsi, "2026-08-27", false, new Date("2026-08-28T02:00:00.000Z"), false),
  "last_updated"
);
assert.strictEqual(
  _test.globalQuoteStatus(quote("2026-08-28T01:20:00.000Z"), hsi, "2026-08-27", false, new Date("2026-08-28T02:00:00.000Z"), false),
  "stale"
);
assert.strictEqual(
  _test.globalQuoteStatus(quote("2026-08-28T08:45:00.000Z", "Yahoo Finance delayed"), euro, "2026-08-27", false, new Date("2026-08-28T09:00:00.000Z"), false),
  "delayed"
);
assert.strictEqual(
  _test.globalQuoteStatus(quote("2026-08-28T02:01:30.000Z"), hsi, "2026-08-27", false, new Date("2026-08-28T02:00:00.000Z"), false),
  "unavailable",
  "Future observations are never displayable"
);
assert.strictEqual(
  _test.globalQuoteStatus(quote("2026-08-28T01:01:30.000Z"), hsi, "2026-08-27", false, new Date("2026-08-28T01:00:00.000Z"), false),
  "unavailable",
  "Future observations are rejected even before the exchange opens"
);
assert.strictEqual(
  _test.globalQuoteStatus(quote("2026-08-28T08:00:00.000Z"), hsi, "2026-08-28", false, new Date("2026-08-28T08:31:00.000Z"), true),
  "eod"
);

const retained = { dataStatus: "eod", marketTime: "2026-08-27T08:00:00.000Z" };
assert.strictEqual(
  _test.canReuseCompletedCard(retained, hsi, new Date("2026-08-28T00:30:00.000Z")),
  true,
  "Pre-market reuses the last completed session"
);
assert.strictEqual(
  _test.canReuseCompletedCard(retained, hsi, new Date("2026-08-29T02:00:00.000Z")),
  false,
  "A Thursday close cannot prevent Friday reconciliation on Saturday"
);
assert.strictEqual(
  _test.canReuseCompletedCard(
    { dataStatus: "eod", marketTime: "2026-08-28T08:00:00.000Z" },
    hsi,
    new Date("2026-08-29T02:00:00.000Z")
  ),
  true,
  "The latest Friday close remains reusable on Saturday"
);
assert.strictEqual(
  _test.canReuseCompletedCard(
    { dataStatus: "eod", marketTime: "2026-08-27T08:30:00.000Z" },
    hsi,
    new Date("2026-08-28T00:30:00.000Z")
  ),
  false,
  "Legacy settlement-time cache entries are not mistaken for exchange-close observations"
);
assert.strictEqual(
  _test.canReuseCompletedCard(retained, hsi, new Date("2026-08-28T02:30:00.000Z")),
  false,
  "A live new session invalidates the prior completed card"
);
assert.strictEqual(
  _test.retainedCardWithCurrentStatus(
    { dataStatus: "live", marketTime: "2026-08-28T01:40:00.000Z", dataProvider: "Yahoo Finance intraday" },
    hsi,
    new Date("2026-08-28T02:00:00.000Z")
  ).dataStatus,
  "last_updated",
  "A temporary provider failure keeps a recent observation without falsely calling it stale"
);

assert.strictEqual(
  classifyFreshness("2026-08-28T07:25:00.000Z", new Date("2026-08-28T07:30:00.000Z")),
  "live"
);
assert.strictEqual(
  classifyFreshness("2026-08-28T07:10:00.000Z", new Date("2026-08-28T07:30:00.000Z")),
  "last_updated"
);
assert.strictEqual(
  classifyFreshness("2026-08-28T06:55:00.000Z", new Date("2026-08-28T07:30:00.000Z")),
  "stale"
);

assert.strictEqual(
  validateQuote({
    symbol: "^NSEI",
    regularMarketPrice: 24500,
    regularMarketPreviousClose: 24400,
    regularMarketTime: "2026-08-28T07:25:00.000Z",
    observationKind: "provisional_close",
  }, {
    requestedSymbol: "^NSEI",
    allowStale: true,
    now: new Date("2026-08-28T07:30:00.000Z"),
  }).dataStatus,
  "live",
  "A fresh history-backed LTP remains LIVE during the NSE session"
);

assert.strictEqual(
  indianMarketPhase(new Date("2026-08-28T10:05:00.000Z")),
  "live",
  "NSE Closing Auction Session observations remain active through 15:40 IST"
);
assert.strictEqual(
  indianMarketPhase(new Date("2026-08-28T10:20:00.000Z")),
  "reconciling",
  "Post-auction processing is not prematurely labelled EOD"
);
assert.strictEqual(
  indianMarketPhase(new Date("2026-08-28T10:36:00.000Z")),
  "closed",
  "Completed daily candles become eligible only after reconciliation"
);

console.log("Market lifecycle checks passed.");
