const assert = require("assert");
const { GLOBAL_INDICES } = require("../config/globalIndexConfig");
const { _test } = require("../services/globalIndexService");

for (const definition of GLOBAL_INDICES) {
  const retained = {
    key: definition.key,
    value: 200,
    change: 2,
    changePercent: 1,
    marketTime: "2026-08-28T12:00:00.000Z",
    asOf: "2026-08-28T12:00:00.000Z",
    dataStatus: "eod",
    dataProvider: "Completed daily market data",
    isStale: false,
  };
  const regressedDetail = {
    ...definition,
    value: 190,
    change: -1,
    changePercent: -0.5,
    marketTime: "2026-08-27T12:00:00.000Z",
    asOf: "2026-08-27T12:00:00.000Z",
    dataStatus: "eod",
    points: [{ date: "2026-08-27", adjustedClose: 190 }],
  };
  const merged = _test.mergeRetainedHeadline(regressedDetail, retained, definition);
  assert.strictEqual(merged.value, retained.value, `${definition.key} must retain the newer overview headline`);
  assert.strictEqual(merged.marketTime, retained.marketTime);
  assert.strictEqual(
    merged.dataStatus,
    _test.retainedCardWithCurrentStatus(retained, definition).dataStatus,
    "retained headline status must be revalidated for the current exchange session"
  );
  assert.deepStrictEqual(merged.points, regressedDetail.points, "headline reconciliation must not fabricate chart history");

  const newerDetail = { ...regressedDetail, value: 210, marketTime: "2026-08-29T12:00:00.000Z" };
  assert.strictEqual(
    _test.mergeRetainedHeadline(newerDetail, retained, definition).value,
    210,
    `${definition.key} must not regress a genuinely newer detail observation`
  );
}

console.log(`Global overview/detail headline consistency tests passed (${GLOBAL_INDICES.length}/10 indices).`);
