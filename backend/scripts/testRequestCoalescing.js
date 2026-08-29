const assert = require("assert");

process.env.MARKET_DATA_PROVIDER = "yahoo";
delete process.env.REDIS_URL;

const { getMarketDataProvider } = require("../providers/marketData");
const provider = getMarketDataProvider();
let quoteCalls = 0;
let batchCalls = 0;

function testQuote(symbol) {
  return {
    symbol,
    shortName: symbol,
    longName: symbol,
    regularMarketPrice: 101,
    regularMarketPreviousClose: 100,
    regularMarketTime: "2026-08-28T10:00:00.000Z",
    observationDate: "2026-08-28",
    observationKind: "session_close",
    dataStatus: "eod",
    isStale: false,
  };
}

provider.quote = async (symbols) => {
  const list = Array.isArray(symbols) ? symbols : [symbols];
  if (list.length > 1) batchCalls += 1;
  else quoteCalls += 1;
  await new Promise((resolve) => setTimeout(resolve, 30));
  const values = list.map(testQuote);
  return Array.isArray(symbols) ? values : values[0];
};

const { fetchMarketData, fetchMarketDataBatch } = require("../clients/marketClient");

async function run(level) {
  quoteCalls = 0;
  const symbol = `COLD${level}.NS`;
  const quotes = await Promise.all(Array.from({ length: level }, () => fetchMarketData(symbol)));
  assert.strictEqual(quotes.length, level);
  assert.strictEqual(quoteCalls, 1, `${level} identical cold quote requests should share one provider call`);

  batchCalls = 0;
  const symbols = [`BATCH${level}A.NS`, `BATCH${level}B.NS`, `BATCH${level}C.NS`];
  const batches = await Promise.all(Array.from({ length: level }, () => fetchMarketDataBatch(symbols)));
  assert.strictEqual(batches.length, level);
  assert.strictEqual(batchCalls, 1, `${level} identical cold batch requests should share one provider call`);
  return { level, quoteProviderCalls: quoteCalls, batchProviderCalls: batchCalls };
}

(async () => {
  const results = [];
  for (const level of [1, 5, 10, 25, 50, 75, 100, 125, 150]) results.push(await run(level));

  const realNow = Date.now;
  const failureSymbol = "FAILSAFE.NS";
  const cached = await fetchMarketData(failureSymbol);
  Date.now = () => realNow() + 6 * 60 * 1000;
  provider.quote = async () => { throw new Error("deterministic provider outage"); };
  provider.chart = async () => { throw new Error("deterministic history outage"); };
  const retained = await fetchMarketData(failureSymbol);
  Date.now = realNow;
  assert.strictEqual(retained.regularMarketPrice, cached.regularMarketPrice);
  assert.strictEqual(retained.dataStatus, "stale");

  console.log(JSON.stringify({ levels: results, providerFailureRetainedLastKnownGood: true }));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
