const assert = require("assert");
delete process.env.REDIS_URL;

const { publicationIntegrity } = require("../news/utils/publicationDate");
const corpus = require("../news/canonicalArticleCorpus")._test;
const news = require("../services/newsService")._test;

const providerA = { title: "YES Bank raises FCNR deposits under RBI swap window", link: "https://a.test/story?utm_source=x", publishedAt: "2026-09-09T10:01:00Z" };
const providerB = { ...providerA, link: "https://b.test/wire-copy" };
assert.strictEqual(corpus.canonicalArticleId(providerA), corpus.canonicalArticleId(providerB),
  "provider representations with the same normalized title share canonical identity");
const destinations = corpus.inferDestinations(providerA, ["company:YESBANK"]);
assert.ok(destinations.includes("company:YESBANK") && destinations.includes("sector:Financials"),
  "one canonical article can be eligible for multiple destinations");
const routed = corpus.inferDestinations({ title: "HDFC Bank credit growth lifts Nifty 50" });
assert.ok(routed.includes("company:HDFCBANK") && routed.includes("sector:Financials") && routed.includes("indian-index:NIFTY50"),
  "canonical routing can distribute one article to company, sector and index surfaces");

const ranked = corpus.rankCanonicalArticles([
  { title: "Old exact Financials story", publishedAt: "2026-09-03T10:00:00Z", publicationPrecision: "exact_datetime", editorialScore: 100 },
  { title: "Current date-only Financials story", recencyAt: "2026-09-09T00:00:00Z", publicationPrecision: "date_only", editorialScore: 85 },
], new Date("2026-09-09T16:00:00Z"));
assert.strictEqual(ranked[0].title, "Current date-only Financials story",
  "pagination input must rank clearly current relevant coverage ahead of old exact metadata");
assert.strictEqual(ranked.slice(0, 1)[0].title, "Current date-only Financials story",
  "pagination must slice only after authoritative ranking");
const surfaceRanked = corpus.rankCanonicalArticles([
  { title: "Company-specific leader", publishedAt: "2026-09-09T09:00:00Z", publicationPrecision: "exact_datetime", destinationScores: { "company:YESBANK": 100, "sector:Financials": 40 } },
  { title: "Sector-wide leader", publishedAt: "2026-09-09T08:00:00Z", publicationPrecision: "exact_datetime", destinationScores: { "company:YESBANK": 40, "sector:Financials": 100 } },
], new Date("2026-09-09T16:00:00Z"), "sector:Financials");
assert.strictEqual(surfaceRanked[0].title, "Sector-wide leader", "canonical records retain surface-specific editorial ranking");

assert.strictEqual(publicationIntegrity({ pubDate: "2026-09-09T10:00:00Z" }, new Date("2026-09-09T12:00:00Z")).precision, "exact_datetime");
assert.strictEqual(publicationIntegrity({ pubDate: "2026-09-09" }, new Date("2026-09-10T12:00:00Z")).precision, "date_only");
assert.strictEqual(publicationIntegrity({ content: "Published 30 September 2026" }, new Date("2026-09-09T12:00:00Z")).precision, "unknown");

const ineligible = [
  "Kotak Nifty Bank Index Fund Direct Plan Returns",
  "Kotak Nifty Bank Index Fund Regular Plan Portfolio",
  "Nippon India Income Plus Arbitrage Omni FoF NAV review and asset allocation",
  "Invesco India Nifty Bank ETF Fund information",
];
ineligible.forEach((title) => assert.strictEqual(
  news.isWhatMovedEligibleArticle({ title }, { title, snippet: "" }), false, title
));
for (const title of [
  "AMC launches new Nifty ETF after regulatory approval",
  "Equity mutual funds record strong inflows in August",
  "SEBI changes rules governing passive mutual funds",
]) {
  assert.strictEqual(news.isWhatMovedEligibleArticle({ title }, { title, snippet: "" }), true, title);
}

(async () => {
  const key = `task2-company-retention:${Date.now()}`;
  const titles = [
    "Refinery expansion receives environmental approval",
    "Telecom subscriber additions accelerate in August",
    "Retail unit reports stronger quarterly margins",
    "Board approves renewable energy investment",
    "Bondholders approve revised financing terms",
    "Shareholders vote on logistics subsidiary merger",
  ];
  const strong = { articles: titles.map((title, index) => ({
    title, link: `https://company.test/${index}`,
    publishedAt: `2026-09-09T0${index}:00:00Z`, publicationPrecision: "exact_datetime", editorialScore: 75,
  })) };
  const weak = { articles: strong.articles.slice(0, 3) };
  await news.retainStableEditorialResult(key, strong);
  const retained = await news.retainStableEditorialResult(key, weak);
  assert.strictEqual(retained.articles.length, 6, "a weak 3-item Company generation cannot destroy a retained 6-item set");
  console.log("Task 2 canonical news, chronology, retention and eligibility invariants passed.");
})().catch((error) => { console.error(error); process.exitCode = 1; });
