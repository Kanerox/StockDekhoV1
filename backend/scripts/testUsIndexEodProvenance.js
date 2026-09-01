const assert = require("assert");
const { getGlobalIndexDefinition } = require("../config/globalIndexConfig");
const { _test } = require("../services/globalIndexService");

for (const key of ["SP500", "DOW", "NASDAQ"]) {
  const definition = getGlobalIndexDefinition(key);
  const provisional = {
    value: key === "DOW" ? 53227.35 : 7711.1,
    regularMarketPrice: key === "DOW" ? 53227.35 : 7711.1,
    regularMarketTime: "2026-08-31T19:59:56.000Z",
    quoteSourceName: key === "NASDAQ" ? "Yahoo Finance" : "Upstox",
    dataStatus: "eod",
  };
  assert.strictEqual(
    _test.globalQuoteStatus(
      provisional,
      definition,
      "2026-08-31",
      false,
      new Date("2026-08-31T20:15:00.000Z"),
      false
    ),
    "last_updated",
    `${key}: a near-close quote is not completed-session evidence`
  );
  assert.strictEqual(
    _test.globalQuoteStatus(
      provisional,
      definition,
      "2026-08-31",
      false,
      new Date("2026-08-31T20:15:00.000Z"),
      true
    ),
    "eod",
    `${key}: a validated daily candle may promote EOD`
  );
  assert.strictEqual(
    _test.canReuseCompletedCard(provisional, definition, new Date("2026-08-31T20:15:00.000Z")),
    false,
    `${key}: legacy/provisional EOD cache cannot survive without provenance`
  );
}

const sp500 = getGlobalIndexDefinition("SP500");
const current = {
  value: 7720,
  change: 10,
  changePercent: 0.13,
  marketTime: "2026-08-31T19:58:00.000Z",
  dataStatus: "last_updated",
  dataProvider: "Upstox",
};
const retained = {
  value: 7711.1,
  change: -21,
  changePercent: -0.27,
  marketTime: "2026-08-31T19:59:56.000Z",
  dataStatus: "last_updated",
  dataProvider: "Upstox",
};
const merged = _test.mergeRetainedHeadline(current, retained, sp500);
assert.deepStrictEqual(
  [merged.value, merged.marketTime, merged.change],
  [retained.value, retained.marketTime, retained.change],
  "Retained selection moves the complete observation record, never a newer timestamp alone"
);

console.log("US index EOD provenance checks passed for S&P 500, Dow and Nasdaq.");
