import assert from "node:assert/strict";
import {
  mergeAuthoritativeObservation,
  mergeAuthoritativeObservationList,
  mergeRetainedIndexDetail,
} from "../src/utils/marketAuthority.js";

const eod = (key) => ({
  key, value: 100, marketTime: "2026-09-15T07:00:00.000Z",
  observationDate: "2026-09-15", completedSessionDate: "2026-09-15",
  observationKind: "session_close", completedSessionConfirmed: true,
  dataStatus: "eod", isStale: false,
});
const weaker = (key, status = "stale") => ({
  key, value: 99, marketTime: "2026-09-15T07:05:00.000Z",
  observationDate: "2026-09-15", completedSessionDate: null,
  observationKind: "intraday", completedSessionConfirmed: false,
  dataStatus: status, isStale: status === "stale",
});

for (const key of ["NIKKEI225", "HANGSENG", "KOSPI", "TAIWAN"]) {
  let visible = mergeAuthoritativeObservationList([eod(key)], []);
  visible = mergeAuthoritativeObservationList([weaker(key, "last_updated")], visible);
  visible = mergeAuthoritativeObservationList([weaker(key, "delayed")], visible);
  assert.equal(visible[0].dataStatus, "eod", `${key} EOD survives aggregate/revalidation generations`);
  assert.equal(visible[0].value, 100);
}

let indian = mergeAuthoritativeObservation(weaker("SENSEX", "last_updated"), eod("SENSEX"));
assert.equal(indian.dataStatus, "eod", "detail promotion survives a weaker overview refresh");
for (const generation of [
  weaker("SENSEX", "last_updated"),
  weaker("SENSEX", "stale"),
  weaker("SENSEX", "live"),
]) {
  indian = mergeAuthoritativeObservation(generation, indian);
}
assert.equal(indian.dataStatus, "eod", "overview → detail → overview → fallback → detail remains monotonic");
indian = mergeAuthoritativeObservation({
  ...weaker("SENSEX", "live"), value: 105,
  marketTime: "2026-09-16T05:30:00.000Z", observationDate: "2026-09-16",
}, indian);
assert.equal(indian.dataStatus, "live", "a legitimate next-session observation supersedes prior EOD");
assert.equal(indian.value, 105);

const serializedEod = JSON.parse(JSON.stringify(eod("VIX")));
assert.equal(
  mergeAuthoritativeObservation(weaker("VIX"), serializedEod).completedSessionConfirmed,
  true,
  "serialized completion authority is preserved"
);
assert.equal(
  mergeAuthoritativeObservation(
    { ...serializedEod, dataStatus: "last_updated", observationKind: "intraday" },
    weaker("VIX")
  ).dataStatus,
  "eod",
  "validated completion metadata canonicalizes weaker lifecycle labels"
);

const retainedDetail = { ...eod("NIFTY50"), points: [{ date: "2026-09-14" }, { date: "2026-09-15" }], periodReturn: 2 };
const refreshedDetail = { ...eod("NIFTY50"), points: [], historyUnavailable: true };
const mergedDetail = mergeRetainedIndexDetail(refreshedDetail, retainedDetail);
assert.equal(mergedDetail.points.length, 2, "valid Nifty history survives a transient supplementary failure");
assert.equal(mergedDetail.historyUnavailable, false);

console.log("Day 14 frontend authority and retained-history lifecycle checks passed.");
