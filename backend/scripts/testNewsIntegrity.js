const assert = require("assert");
delete process.env.REDIS_URL;

const { publicationIntegrity } = require("../news/utils/publicationDate");
const { _test } = require("../services/newsService");

const now = new Date("2026-08-30T12:00:00.000Z");
assert.strictEqual(publicationIntegrity({ pubDate: "2026-08-30T09:00:00Z", link: "https://publisher.test/story" }, now).valid, true);
assert.strictEqual(publicationIntegrity({ pubDate: "2026-01-08T09:00:00Z", link: "https://publisher.test/2026/01/08/story" }, now).publishedAt, "2026-01-08T09:00:00.000Z");
assert.strictEqual(publicationIntegrity({ pubDate: null }, now).reason, "missing_or_malformed");
assert.strictEqual(publicationIntegrity({ pubDate: "not-a-date" }, now).reason, "missing_or_malformed");
assert.strictEqual(
  publicationIntegrity({ fetchedAt: "2026-08-30T09:00:00Z", cachedAt: "2026-08-30T09:01:00Z" }, now).reason,
  "missing_or_malformed",
  "retrieval and cache timestamps must never become publication timestamps"
);
assert.strictEqual(publicationIntegrity({ pubDate: "2026-08-29T09:00:00Z", link: "https://publisher.test/2026/03/09/story" }, now).reason, "url_date_conflict");
assert.strictEqual(publicationIntegrity({ pubDate: "2026-08-31T09:00:00Z" }, now).reason, "future");

const leadershipTitles = [
  "HDFC Bank CEO Jagdishan opts out of reappointment; succession begins",
  "Sashidhar Jagdishan to retire as HDFC Bank chief executive",
  "Sashidhar Jagdishan era at HDFC Bank: Transformation, merger and a difficult final chapter",
];
assert.strictEqual(_test.areSameEvent(leadershipTitles[0], leadershipTitles[1]), true);
assert.strictEqual(_test.areSameEvent(leadershipTitles[0], leadershipTitles[2]), true);
assert.strictEqual(_test.areSameEvent(
  "The Sashidhar Jagdishan years at HDFC Bank: Crisis, merger, and scrutiny",
  "HDFC Bank boss on way out, won't seek reappointment"
), true);
const eventCandidates = leadershipTitles.map((title, index) => ({
  article: { link: `https://source${index}.test/story`, pubDate: `2026-08-29T0${9 - index}:00:00Z` },
  cleanedArticle: { title, source: `Source ${index}` },
}));
assert.strictEqual(_test.deduplicateAndLimit(eventCandidates, 10).length, 1, "different URLs for one event must collapse to one representative");
assert.strictEqual(_test.selectTopMarketArticles(eventCandidates, 10).length, 1, "same events crossing editorial day buckets must collapse after the pools are combined");

const googleOnly = [{
  article: { provider: "google-news-rss", link: "https://news.google.com/rss/articles/old", pubDate: "2026-08-29T09:00:00Z" },
  cleanedArticle: { title: "A unique resurfaced market story", source: "Publisher A" },
}];
assert.strictEqual(_test.retainPublicationReliableCandidates(googleOnly).length, 0, "uncorroborated Google feed dates are not publisher dates");
const corroborated = [
  { article: { provider: "google-news-rss", link: "https://news.google.com/rss/articles/a", pubDate: "2026-08-29T09:00:00Z" }, cleanedArticle: { title: leadershipTitles[0], source: "Publisher A" } },
  { article: { provider: "google-news-rss", link: "https://news.google.com/rss/articles/b", pubDate: "2026-08-29T08:00:00Z" }, cleanedArticle: { title: leadershipTitles[1], source: "Publisher B" } },
];
const corroboratedResult = _test.retainPublicationReliableCandidates(corroborated);
assert.strictEqual(corroboratedResult.length, 2, "independently corroborated feed events remain eligible before event deduplication");
assert.strictEqual(corroboratedResult[0].article.pubDate, null, "a Google listing time must never be exposed as the publisher's publication time");
assert.ok(corroboratedResult[0].article.recencyAt, "the listing time may be retained separately for corroborated recency grouping");

const cricinfo = _test.isBlockedGlobalArticle(
  { title: "Cricket Grounds | Ind v Pak DLF", creator: "ESPN Cricinfo" },
  { title: "Cricket Grounds | Ind v Pak DLF", source: "ESPN Cricinfo" }
);
assert.strictEqual(cricinfo, true, "Cricinfo must be excluded from financial-news candidates");

const rankedIndexCandidates = _test.rankGlobalIndexCandidates([{
  provider: "marketaux",
  link: "https://reuters.test/sp500-close",
  pubDate: new Date().toISOString(),
  title: "S&P 500 closes higher as Wall Street gains",
  source: "Reuters",
  creator: "Reuters",
  contentSnippet: "The S&P 500 advanced in the latest session.",
}], {
  topic: "S&P 500",
  terms: ["s&p 500"],
  marketTerms: ["wall street", "us stocks"],
});
assert.strictEqual(rankedIndexCandidates.length, 1, "the executable Global Index News ranking path must return relevant candidates");
assert.strictEqual(rankedIndexCandidates[0].relevanceScore, 100);
assert.strictEqual(
  _test.recentMarketNewsDay("2026-08-28T12:00:00Z", new Date("2026-08-30T12:00:00Z")),
  "previous_session",
  "Sunday editorial selection must be able to retain Friday's market-session reporting"
);

(async () => {
  const cacheKey = `news-test-stability:${Date.now()}`;
  const healthyTitles = [
    "RBI holds policy rate after inflation review",
    "Oil prices fall as supply concerns ease",
    "Technology shares lift Indian benchmarks",
    "Foreign investors return to domestic equities",
    "Government announces new infrastructure spending",
    "Rupee strengthens against the US dollar",
    "Metal stocks rise on stronger commodity demand",
    "Automakers report improved monthly sales",
  ];
  const healthy = { articles: healthyTitles.map((title, index) => ({ title, link: `https://healthy.test/${index}`, publishedAt: `2026-08-30T${String(10 - index).padStart(2, "0")}:00:00Z` })) };
  const partial = { articles: [
    { title: "A genuinely new market event", link: "https://new.test/story", publishedAt: "2026-08-30T11:00:00Z" },
    { title: "Partial event one", link: "https://partial.test/1", publishedAt: "2026-08-29T01:00:00Z" },
    { title: "Partial event two", link: "https://partial.test/2", publishedAt: "2026-08-29T02:00:00Z" },
  ] };
  await _test.retainStableEditorialResult(cacheKey, healthy);
  const retained = await _test.retainStableEditorialResult(cacheKey, partial);
  assert.ok(retained.articles.length >= 8, "a partial provider generation must not collapse a healthy editorial set");
  assert.ok(retained.articles.some((article) => article.title === "A genuinely new market event"), "a new distinct story must still enter the retained editorial set");
  assert.ok(retained.articles.some((article) => article.title === healthyTitles[0]), "healthy retained stories must survive a partial refresh");
  console.log("News publication, event-diversity, source-context and result-stability tests passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
