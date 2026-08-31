const assert = require("assert");
const { _test } = require("../clients/marketClient");

// The test date is passed through validation data; the protection itself is
// exercised in the current closed-session test environment.
const completed = {
  symbol: "RELIANCE.NS",
  regularMarketPrice: 1500,
  regularMarketPreviousClose: 1480,
  regularMarketTime: "2026-08-31T10:15:00.000Z",
  observationDate: "2026-08-31",
  observationKind: "session_close",
  quoteSourceName: "Completed daily market data",
};
const provisional = {
  ...completed,
  regularMarketPrice: 1498,
  regularMarketTime: "2026-08-31T10:30:00.000Z",
  observationKind: "provisional_close",
  quoteSourceName: "Upstox",
};

const chosen = _test.chooseNewerQuote(provisional, completed, "RELIANCE.NS");
assert.equal(chosen.observationKind, "session_close");
assert.equal(chosen.regularMarketPrice, 1500);

console.log("Completed-session cache regression protection passed.");
