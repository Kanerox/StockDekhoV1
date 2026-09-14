const assert = require("assert");
delete process.env.REDIS_URL;

const { updateCacheEntryAtomic, getCachedValue } = require("../clients/cacheClient");
const { classifyObservationLifecycle, indianMarketClosure } = require("../utils/marketDataValidation");
const { _test: global } = require("../services/globalIndexService");
const { GLOBAL_INDICES } = require("../config/globalIndexConfig");
const news = require("../services/newsService")._test;
const corpus = require("../news/canonicalArticleCorpus")._test;
const indexService = require("../services/indexService");

function selectAuthority(candidate, retained) {
  if (!retained) return candidate;
  if (retained.observationDate > candidate.observationDate) return retained;
  if (retained.observationDate < candidate.observationDate) return candidate;
  const retainedEod = retained.observationKind === "session_close" && retained.dataStatus === "eod";
  const candidateEod = candidate.observationKind === "session_close" && candidate.dataStatus === "eod";
  if (retainedEod !== candidateEod) return retainedEod ? retained : candidate;
  return new Date(retained.marketTime) > new Date(candidate.marketTime) ? retained : candidate;
}

(async () => {
  const key = `phase2-authority-${Date.now()}`;
  const weak = { observationDate: "2026-09-14", observationKind: "intraday", dataStatus: "last_updated", marketTime: "2026-09-14T06:29:00Z", value: 99 };
  const eod = { observationDate: "2026-09-14", completedSessionDate: "2026-09-14", completedSessionConfirmed: true, observationKind: "session_close", dataStatus: "eod", marketTime: "2026-09-14T06:30:00Z", value: 100 };
  await Promise.all([
    new Promise((resolve) => setTimeout(resolve, 5)).then(() => updateCacheEntryAtomic(key, weak, 60_000, selectAuthority)),
    updateCacheEntryAtomic(key, eod, 60_000, selectAuthority),
  ]);
  assert.strictEqual((await getCachedValue(key, 60_000)).value, 100, "late weak writer cannot replace EOD");
  const next = { ...weak, observationDate: "2026-09-15", marketTime: "2026-09-15T04:00:00Z", value: 101 };
  await updateCacheEntryAtomic(key, next, 60_000, selectAuthority);
  assert.strictEqual((await getCachedValue(key, 60_000)).value, 101, "new session can supersede old EOD");

  const holidayNow = new Date("2026-09-14T07:00:00Z");
  assert.deepStrictEqual(indianMarketClosure(holidayNow), { closed: true, type: "holiday", name: "Ganesh Chaturthi" });
  const lifecycle = classifyObservationLifecycle({ regularMarketTime: "2026-09-11T10:10:00Z", observationDate: "2026-09-11", observationKind: "session_close" }, holidayNow);
  assert.strictEqual(lifecycle.dataStatus, "eod", "previous validated close remains EOD on holiday");

  const hangSeng = GLOBAL_INDICES.find((item) => item.key === "HANGSENG");
  assert.strictEqual(global.mergeRetainedHeadline(weak, eod, hangSeng, new Date("2026-09-14T12:00:00Z")).value, 100);

  const homepage = "Official Website of Reserve Bank of India";
  assert.strictEqual(news.isWhatMovedEligibleArticle({ title: homepage }, { title: homepage, snippet: "Home and navigation" }), false);
  const policy = "RBI announces monetary policy decision and cuts repo rate";
  assert.strictEqual(news.isWhatMovedEligibleArticle({ title: policy }, { title: policy, snippet: "Official policy release" }), true);
  assert.strictEqual(
    news.classifyMarketEventTopic("Sector", "Indian lenders react", "RBI monetary policy decision changes rates"),
    "Policy",
    "classification uses validated article context rather than the query label alone"
  );
  assert.strictEqual(corpus.isBlockedCanonicalSource({ source: "IndexBox.io", link: "https://indexbox.io/story" }), true);
  assert.strictEqual(corpus.isBlockedCanonicalSource({ source: "Reuters", link: "https://reuters.com/story" }), false);

  const partial = await indexService.getIndexDetail("NIFTY50", "1M", {
    fetchMarketData: async () => ({
      symbol: "^NSEI", regularMarketPrice: 25000, regularMarketPreviousClose: 24900,
      regularMarketChange: 100, regularMarketChangePercent: 0.4016,
      regularMarketTime: "2026-09-11T10:10:00Z", observationDate: "2026-09-11",
      observationKind: "session_close", dataStatus: "eod",
    }),
    fetchHistoricalPrices: async () => { throw new Error("deterministic history failure"); },
    fetchConstituents: async () => { throw new Error("deterministic constituent failure"); },
  });
  assert.strictEqual(partial.value, 25000, "headline survives supplementary failures");
  assert.strictEqual(partial.historyUnavailable, true);
  assert.strictEqual(partial.constituentsUnavailable, true);

  await assert.rejects(
    () => indexService.reconcileIndexClose("NIFTY50", new Date("2026-09-11T12:00:00Z"), {
      fetchMarketData: async () => ({
        regularMarketPrice: 25000, regularMarketTime: "2026-09-11T10:10:00Z",
        observationDate: "2026-09-11", observationKind: "intraday", dataStatus: "last_updated",
      }),
    }),
    (error) => error.code === "COMPLETED_SESSION_NOT_READY",
    "narrow reconciliation fails honestly while the close is not validated"
  );
  const completedQuote = {
    regularMarketPrice: 25010, regularMarketPreviousClose: 24900,
    regularMarketChange: 110, regularMarketChangePercent: 0.4417,
    regularMarketTime: "2026-09-11T10:15:00Z", observationDate: "2026-09-11",
    observationKind: "session_close", dataStatus: "eod",
  };
  const reconciled = await indexService.reconcileIndexClose("NIFTY50", new Date("2026-09-11T12:00:00Z"), {
    fetchMarketData: async () => completedQuote,
  });
  const reconciledAgain = await indexService.reconcileIndexClose("NIFTY50", new Date("2026-09-11T12:01:00Z"), {
    fetchMarketData: async () => completedQuote,
  });
  assert.strictEqual(reconciled.dataStatus, "eod");
  assert.strictEqual(reconciledAgain.value, reconciled.value, "completed-session reconciliation is idempotent");
  console.log("Phase 2 atomic authority, holiday, eligibility and source-policy checks passed.");
})().catch((error) => { console.error(error); process.exitCode = 1; });
