const assert = require("assert");
const fs = require("fs");
delete process.env.REDIS_URL;

const { SECTORS } = require("../config/sectorConfig");
const { _test: sectorTest } = require("../services/sectorService");

const retained = SECTORS.map((sector) => ({ key: sector.key, marker: `retained-${sector.key}` }));
const results = SECTORS.map((sector, index) => index === 1
  ? { status: "rejected", reason: new Error("deterministic provider failure") }
  : { status: "fulfilled", value: { key: sector.key, marker: `fresh-${sector.key}` } });
const merged = sectorTest.mergeSectorOverview(results, retained);
assert.strictEqual(merged.length, SECTORS.length, "one failed sector must not collapse the complete overview");
assert.strictEqual(merged[1].marker, `retained-${SECTORS[1].key}`, "the failed sector uses its legitimate retained observation");
assert.strictEqual(merged[0].marker, `fresh-${SECTORS[0].key}`, "healthy sectors continue to refresh independently");

const appSource = fs.readFileSync(require.resolve("../../frontend/src/App.jsx"), "utf8");
const searchSource = fs.readFileSync(require.resolve("../../frontend/src/utils/searchSemantics.js"), "utf8");
assert.match(searchSource, /volatility:\s*"india vix"/);
assert.match(searchSource, /bonds:\s*"india 10y g-sec"/);
assert.match(searchSource, /it:\s*"it services"/);
assert.match(appSource, /newsLoading && <Panel[^>]*>Loading relevant market coverage/);
assert.match(appSource, /articlesForPage\(formattedLiveNews, safeNewsPage, 6\)/);
assert.match(appSource, /Session Close —/);
assert.match(appSource, /intervalMs: 10 \* 60 \* 1000, shouldRefresh: isIndianPostCloseReconciliationWindow/);
assert.match(appSource, /intervalMs: 30 \* 60 \* 1000, shouldRefresh: isIndianEditorialRefreshWindow/);

console.log("Task 1 sector isolation, search semantics, pending state, pagination and EOD presentation checks passed.");
