const assert = require("assert");
const { _test } = require("../providers/marketData/yahooProvider");

assert.deepStrictEqual(
  _test.yahooChartOptions({
    period1: new Date("2026-01-01"),
    period2: new Date("2026-09-01"),
    interval: "1d",
    supplement: true,
  }),
  {
    period1: new Date("2026-01-01"),
    period2: new Date("2026-09-01"),
    interval: "1d",
  }
);

console.log("Yahoo chart option boundary checks passed.");
