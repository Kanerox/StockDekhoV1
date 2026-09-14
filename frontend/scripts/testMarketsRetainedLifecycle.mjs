import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
for (const field of ["niftyDetail", "marketEvents", "performerStocks", "activityStocks", "gsec"]) {
  assert.match(source, new RegExp(`retainedMarketsPage\\.${field}`), `${field} must survive a Markets route remount`);
}
assert.match(source, /if \(retainedSectorOverview\.length === 0\) setSectorLoading\(true\)/,
  "retained sector data must not be blanked during background refresh");
assert.match(source, /if \(retainedMarketsPage\.performerStocks\.length === 0\) setPerformersLoading\(true\)/,
  "retained performers must not be blanked during background refresh");
assert.match(source, /if \(nextEvents\.length \|\| retainedMarketsPage\.marketEvents\.length === 0\)/,
  "an empty refresh cannot displace retained market events");
console.log("Markets retained-navigation lifecycle checks passed.");
