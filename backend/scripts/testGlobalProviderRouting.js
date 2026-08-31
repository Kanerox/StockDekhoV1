const assert = require("assert");
const { GLOBAL_INDICES } = require("../config/globalIndexConfig");

const routed = GLOBAL_INDICES.filter((definition) => definition.upstoxInstrumentKey);
assert.deepStrictEqual(
  routed.map((definition) => definition.key),
  ["SP500", "DOW", "HANGSENG", "NIKKEI225", "FTSE100", "DAX"]
);
assert.deepStrictEqual(
  routed.map((definition) => definition.upstoxInstrumentKey),
  [
    "GLOBAL_INDEX|^GSPC",
    "GLOBAL_INDEX|^DJI",
    "GLOBAL_INDEX|^HSI",
    "GLOBAL_INDEX|^N225",
    "GLOBAL_INDEX|^FTSE",
    "GLOBAL_INDEX|^GDAXI",
  ]
);
assert.strictEqual(GLOBAL_INDICES.find((item) => item.key === "NASDAQ").upstoxInstrumentKey, undefined);
assert.strictEqual(GLOBAL_INDICES.find((item) => item.key === "EUROSTOXX50").upstoxInstrumentKey, undefined);
assert.strictEqual(GLOBAL_INDICES.find((item) => item.key === "KOSPI").upstoxInstrumentKey, undefined);
assert.strictEqual(GLOBAL_INDICES.find((item) => item.key === "TAIWAN").upstoxInstrumentKey, undefined);
assert.strictEqual(routed.find((item) => item.key === "SP500").upstoxLatencySeconds, 20);
assert.strictEqual(routed.find((item) => item.key === "DOW").upstoxLatencySeconds, 20);
for (const key of ["HANGSENG", "NIKKEI225", "FTSE100", "DAX"]) {
  assert.strictEqual(routed.find((item) => item.key === key).upstoxLatencySeconds, 900);
}

console.log("Global provider routing checks passed: 6 exact Upstox matches, 4 Yahoo-primary benchmarks, no proxies.");
