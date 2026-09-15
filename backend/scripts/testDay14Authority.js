const assert = require("assert");
delete process.env.REDIS_URL;

const { updateCacheEntryAtomic } = require("../clients/cacheClient");
const indexService = require("../services/indexService");
const sectorService = require("../services/sectorService");
const { INDICES } = require("../config/indexConfig");
const historyClient = require("../clients/historyClient");

const completed = {
  key: "SENSEX", name: "S&P BSE Sensex", symbol: "^BSESN", value: 80000,
  change: 100, changePercent: 0.125, marketTime: "2026-09-15T10:30:00.000Z",
  asOf: "2026-09-15T10:30:00.000Z", observationDate: "2026-09-15",
  completedSessionDate: "2026-09-15", completedSessionConfirmed: true,
  observationKind: "session_close", dataStatus: "eod", isStale: false,
};
const weaker = {
  ...completed, value: 79900, marketTime: "2026-09-15T10:29:00.000Z",
  completedSessionDate: null, completedSessionConfirmed: false,
  observationKind: "intraday", dataStatus: "last_updated",
};

(async () => {
  await updateCacheEntryAtomic(
    "index-summary:SENSEX:v2", completed, 60_000,
    (candidate, retained) => indexService._test.selectAuthoritativeIndexObservation(candidate, retained)
  );
  const detail = await indexService.getIndexDetail("SENSEX", "1M", {
    fetchMarketData: async () => ({
      symbol: "^BSESN", regularMarketPrice: weaker.value, regularMarketPreviousClose: 79800,
      regularMarketTime: weaker.marketTime, observationDate: weaker.observationDate,
      observationKind: weaker.observationKind, dataStatus: weaker.dataStatus,
    }),
    fetchHistoricalPrices: async () => [
      { date: "2026-09-14T00:00:00Z", close: 79800, adjustedClose: 79800 },
      { date: "2026-09-15T00:00:00Z", close: 80000, adjustedClose: 80000 },
    ],
    fetchConstituents: async () => [],
  });
  assert.equal(detail.dataStatus, "eod", "detail returns the stronger authority selected by persistence");
  assert.equal(detail.completedSessionConfirmed, true);
  assert.equal(detail.completedSessionDate, "2026-09-15");

  const overview = await indexService.getIndexOverview({
    getIndexSummary: async (definition) => ({
      ...weaker, key: definition.key, name: definition.name, symbol: definition.symbol,
    }),
  });
  const sensex = overview.find((item) => item.key === "SENSEX");
  assert.equal(sensex.dataStatus, "eod", "aggregate generation inherits detail-promoted authority");
  assert.equal(sensex.completedSessionConfirmed, true);

  const nextSession = { ...weaker, observationDate: "2026-09-16", marketTime: "2026-09-16T05:00:00Z", dataStatus: "live" };
  assert.equal(
    indexService._test.selectAuthoritativeIndexObservation(nextSession, completed, new Date("2026-09-16T05:02:00Z")).dataStatus,
    "live",
    "new-session LIVE supersedes the prior completed session"
  );

  const mapped = indexService._test.mapQuote(INDICES.find((item) => item.key === "SENSEX"), {
    regularMarketPrice: 80000, regularMarketChange: 100, regularMarketChangePercent: 0.125,
    regularMarketTime: completed.marketTime, observationDate: completed.observationDate,
    observationKind: "session_close", completedSessionConfirmed: true,
    completedSessionDate: completed.completedSessionDate,
  });
  const roundTrip = JSON.parse(JSON.stringify(mapped));
  assert.equal(roundTrip.completedSessionConfirmed, true);
  assert.equal(roundTrip.completedSessionDate, "2026-09-15");

  const onePoint = await sectorService.getSectorDetail("Industrials", "1Y", {
    fetchHistoricalPrices: async () => [{ date: "2026-09-15T00:00:00Z", close: 8910, adjustedClose: 8910 }],
    fetchConstituents: async () => [],
  });
  assert.equal(onePoint.historyUnavailable, true);
  assert.deepStrictEqual(onePoint.points, []);
  assert.equal(onePoint.periodReturn, null);
  assert.equal(onePoint.returns["1Y"], null);

  const retainedHistory = [
    { date: "2026-09-14T00:00:00Z", adjustedClose: 8800 },
    { date: "2026-09-15T00:00:00Z", adjustedClose: 8910 },
  ];
  assert.deepStrictEqual(
    historyClient._test.selectUsableHistory(
      [{ date: "2026-09-15T00:00:00Z", adjustedClose: 8910 }],
      retainedHistory
    ),
    retainedHistory,
    "a newly insufficient response cannot replace trustworthy retained history"
  );

  console.log("Day 14 backend authority propagation and insufficient-history checks passed.");
})().catch((error) => { console.error(error); process.exitCode = 1; });
