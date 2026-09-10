const assert = require("assert");
delete process.env.REDIS_URL;

const { _test: india } = require("../services/indexService");
const { _test: global } = require("../services/globalIndexService");
const { GLOBAL_INDICES } = require("../config/globalIndexConfig");

const closedIndia = new Date("2026-09-09T13:30:00.000Z");
const intraday = {
  key: "SENSEX", value: 74932, marketTime: "2026-09-09T09:17:00.000Z",
  observationDate: "2026-09-09", observationKind: "intraday", dataStatus: "last_updated",
};
const completed = {
  key: "SENSEX", value: 74764, marketTime: "2026-09-09T10:30:00.000Z",
  observationDate: "2026-09-09", observationKind: "session_close", dataStatus: "eod",
};
assert.strictEqual(india.selectAuthoritativeIndexObservation(intraday, completed, closedIndia).value, 74764,
  "validated Indian EOD must beat a weaker same-session overview");
assert.strictEqual(india.selectAuthoritativeIndexObservation(completed, intraday, closedIndia).value, 74764,
  "a stronger detail EOD must propagate into shared headline authority");
assert.strictEqual(india.mergeAuthoritativeIndexHeadline(intraday, completed, closedIndia).observationKind, "session_close");
assert.strictEqual(india.cachedOverviewNeedsReconciliation([intraday], closedIndia), true,
  "a closed-session aggregate containing provisional data must be reconciled");

const now = new Date("2026-09-09T16:30:00.000Z");
for (const key of ["HANGSENG", "NIKKEI225", "KOSPI", "TAIWAN"]) {
  const definition = GLOBAL_INDICES.find((item) => item.key === key);
  const eod = {
    key, value: 200, marketTime: "2026-09-09T06:30:00.000Z", asOf: "2026-09-09T06:30:00.000Z",
    completedSessionDate: "2026-09-09", observationDate: "2026-09-09",
    completedSessionConfirmed: true, observationKind: "session_close", dataStatus: "eod",
  };
  const weaker = {
    ...eod, value: 190, marketTime: "2026-09-09T06:29:00.000Z", asOf: "2026-09-09T06:29:00.000Z",
    completedSessionDate: null, completedSessionConfirmed: false, observationKind: "intraday", dataStatus: "last_updated",
  };
  const priorSession = {
    ...weaker, value: 180, marketTime: "2026-09-08T06:30:00.000Z", asOf: "2026-09-08T06:30:00.000Z",
    observationDate: "2026-09-08",
  };
  assert.strictEqual(global.mergeRetainedHeadline(weaker, eod, definition, now).value, 200,
    `${key}: weaker same-session refresh cannot replace validated EOD`);
  assert.strictEqual(global.mergeRetainedHeadline(priorSession, eod, definition, now).value, 200,
    `${key}: restart/fallback from an older session cannot replace current EOD`);
}

console.log("Task 2 Indian and APAC authoritative headline invariants passed.");
