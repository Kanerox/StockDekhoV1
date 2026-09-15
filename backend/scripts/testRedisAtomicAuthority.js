const assert = require("assert");
const fs = require("fs");
const net = require("net");
const os = require("os");
const path = require("path");
const { spawn, spawnSync } = require("child_process");
const { createClient } = require("redis");

function selectAuthority(candidate, retained) {
  if (!retained) return candidate;
  const candidateSession = candidate.completedSessionDate || candidate.observationDate || "";
  const retainedSession = retained.completedSessionDate || retained.observationDate || "";
  if (retainedSession > candidateSession) return retained;
  if (candidateSession > retainedSession) return candidate;
  const candidateEod = candidate.completedSessionConfirmed === true ||
    (candidate.observationKind === "session_close" && candidate.dataStatus === "eod");
  const retainedEod = retained.completedSessionConfirmed === true ||
    (retained.observationKind === "session_close" && retained.dataStatus === "eod");
  if (candidateEod !== retainedEod) return retainedEod ? retained : candidate;
  return new Date(retained.marketTime || 0) > new Date(candidate.marketTime || 0)
    ? retained : candidate;
}

async function normalRedisChild() {
  const { updateCacheEntryAtomic, getCachedValue } = require("../clients/cacheClient");
  const suffix = `${process.pid}-${Date.now()}`;
  const weak = {
    observationDate: "2026-09-15", completedSessionDate: null,
    observationKind: "intraday", dataStatus: "live",
    marketTime: "2026-09-15T06:20:00.000Z", value: 100,
    previousSessionClose: null,
  };
  const stronger = { ...weak, marketTime: "2026-09-15T06:25:00.000Z", value: 101 };
  const nullObservation = { ...weak, observationDate: null, marketTime: "2026-09-15T06:26:00.000Z" };
  const eod = {
    ...stronger, completedSessionDate: "2026-09-15", completedSessionConfirmed: true,
    observationKind: "session_close", dataStatus: "eod", value: 102,
  };
  const nextSession = {
    ...weak, observationDate: "2026-09-16", marketTime: "2026-09-16T04:00:00.000Z", value: 103,
  };

  assert.strictEqual((await updateCacheEntryAtomic(`redis-null-completed:${suffix}`, weak, 60_000, selectAuthority)).value, 100);
  assert.strictEqual((await updateCacheEntryAtomic(`redis-null-completed:${suffix}`, stronger, 60_000, selectAuthority)).value, 101);
  assert.strictEqual(
    (await getCachedValue(`redis-null-completed:${suffix}`, 60_000)).previousSessionClose,
    null,
    "a nullable previous close remains absent rather than becoming numeric provenance"
  );
  assert.strictEqual((await updateCacheEntryAtomic(`redis-null-observation:${suffix}`, nullObservation, 60_000, selectAuthority)).value, 100);
  assert.strictEqual((await updateCacheEntryAtomic(`redis-null-observation:${suffix}`, { ...nullObservation, marketTime: "2026-09-15T06:27:00.000Z", value: 101 }, 60_000, selectAuthority)).value, 101);
  await updateCacheEntryAtomic(`redis-monotonic:${suffix}`, eod, 60_000, selectAuthority);
  assert.strictEqual((await updateCacheEntryAtomic(`redis-monotonic:${suffix}`, weak, 60_000, selectAuthority)).dataStatus, "eod");
  assert.strictEqual((await updateCacheEntryAtomic(`redis-monotonic:${suffix}`, { ...eod, marketTime: "2026-09-15T06:31:00.000Z", value: 104 }, 60_000, selectAuthority)).value, 104);
  assert.strictEqual((await updateCacheEntryAtomic(`redis-monotonic:${suffix}`, nextSession, 60_000, selectAuthority)).value, 103);

  const concurrentKey = `redis-concurrent:${suffix}`;
  const concurrent = await Promise.all([
    updateCacheEntryAtomic(concurrentKey, weak, 60_000, selectAuthority),
    updateCacheEntryAtomic(concurrentKey, eod, 60_000, selectAuthority),
  ]);
  assert(concurrent.some((item) => item.dataStatus === "eod"));
  assert.strictEqual((await updateCacheEntryAtomic(concurrentKey, weak, 60_000, selectAuthority)).dataStatus, "eod");
  process.stdout.write("real Redis null/monotonic/concurrent checks passed\n");
  process.exit(0);
}

async function deniedEvalChild() {
  const { updateCacheEntryAtomic } = require("../clients/cacheClient");
  const indexService = require("../services/indexService");
  const globalService = require("../services/globalIndexService");
  const { INDICES } = require("../config/indexConfig");
  const key = process.env.GATE2_DENIED_KEY;
  const candidate = {
    observationDate: "2026-09-15", completedSessionDate: null,
    observationKind: "intraday", dataStatus: "live",
    marketTime: "2026-09-15T06:25:00.000Z", value: 99,
  };
  const retained = await updateCacheEntryAtomic(key, candidate, 60_000, selectAuthority);
  assert.strictEqual(retained.dataStatus, "eod", "EVAL failure serves readable retained EOD without writing");

  const now = new Date();
  const marketTime = now.toISOString();
  const observationDate = now.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const indian = await indexService.getIndexOverview({
    getIndexSummary: async (definition) => ({
      ...definition, value: 25000, change: 10, changePercent: 0.04,
      marketTime, asOf: marketTime, observationDate,
      observationKind: "intraday", dataStatus: "live", sparkline: [],
    }),
  });
  assert.strictEqual(indian.length, INDICES.length, "Indian overview survives authority persistence failure");

  const global = await globalService.getGlobalIndexOverview({
    fetchMarketDataBatch: async () => [],
    getGlobalIndexDetail: async (indexKey) => ({
      key: indexKey, name: indexKey, symbol: indexKey, region: "Test",
      value: 100, change: 1, changePercent: 1, periodReturn: 1,
      points: [], marketTime, asOf: marketTime, observationDate,
      observationKind: "intraday", dataStatus: "last_updated",
    }),
  });
  assert.strictEqual(global.length, 10, "Global overview survives per-card authority persistence failure");

  const nifty = INDICES.find((item) => item.key === "NIFTY50");
  const constituents = nifty.constituents.map((ticker) => ({
    ticker, symbol: `${ticker}.NS`, chgPct: 0.1, marketTime,
    observationDate, observationKind: "intraday", dataStatus: "live", isStale: false,
  }));
  const detail = await indexService.getIndexDetail("NIFTY50", "1M", {
    fetchMarketData: async () => ({
      symbol: "^NSEI", regularMarketPrice: 25000, regularMarketPreviousClose: 24900,
      regularMarketTime: marketTime, observationDate, observationKind: "intraday", dataStatus: "live",
    }),
    fetchHistoricalPrices: async () => [
      { date: "2026-09-14T00:00:00.000Z", close: 24900, adjustedClose: 24900 },
      { date: "2026-09-15T00:00:00.000Z", close: 25000, adjustedClose: 25000 },
    ],
    fetchConstituents: async () => constituents,
  });
  assert.strictEqual(detail.constituents.length, 50, "Nifty detail/Leadership survives authority persistence failure");
  process.stdout.write("real Redis EVAL-denied availability checks passed\n");
  process.exit(0);
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

function runChild(env) {
  const result = spawnSync(process.execPath, [__filename], {
    env: { ...process.env, ...env }, encoding: "utf8", timeout: 30_000,
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  assert.strictEqual(result.status, 0, `Redis child failed with status ${result.status}`);
}

async function orchestrate() {
  const redisServer = process.env.REDIS_SERVER_BIN || spawnSync("which", ["redis-server"], { encoding: "utf8" }).stdout.trim();
  assert(redisServer, "redis-server is required for this integration test");
  const port = await freePort();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "stockdekho-gate2-redis-"));
  const server = spawn(redisServer, ["--bind", "127.0.0.1", "--port", String(port), "--save", "", "--appendonly", "no", "--dir", directory], {
    stdio: "ignore",
  });
  const url = `redis://127.0.0.1:${port}`;
  const admin = createClient({ url });
  try {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      try { await admin.connect(); break; } catch { await new Promise((resolve) => setTimeout(resolve, 50)); }
    }
    assert(admin.isOpen, "ephemeral Redis did not start");
    runChild({ REDIS_URL: url, GATE2_REDIS_CHILD: "normal" });

    const deniedKey = `gate2-eval-denied-${Date.now()}`;
    const retainedPayload = {
      value: {
        observationDate: "2026-09-15", completedSessionDate: "2026-09-15",
        completedSessionConfirmed: true, observationKind: "session_close", dataStatus: "eod",
        marketTime: "2026-09-15T06:30:00.000Z", value: 100,
      },
      savedAt: Date.now(),
    };
    await admin.set(`stockdekho:${deniedKey}`, JSON.stringify(retainedPayload), { PX: 60_000 });
    await admin.sendCommand(["ACL", "SETUSER", "gate2", "on", ">gate2pass", "~stockdekho:*", "+get", "+ping", "-eval", "-set"]);
    runChild({
      REDIS_URL: `redis://gate2:gate2pass@127.0.0.1:${port}`,
      GATE2_REDIS_CHILD: "denied",
      GATE2_DENIED_KEY: deniedKey,
    });
    console.log("Gate 2 real ephemeral Redis integration suite passed.");
  } finally {
    if (admin.isOpen) await admin.quit();
    server.kill("SIGTERM");
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

if (process.env.GATE2_REDIS_CHILD === "normal") normalRedisChild().catch((error) => { console.error(error); process.exit(1); });
else if (process.env.GATE2_REDIS_CHILD === "denied") deniedEvalChild().catch((error) => { console.error(error); process.exit(1); });
else orchestrate().catch((error) => { console.error(error); process.exitCode = 1; });
