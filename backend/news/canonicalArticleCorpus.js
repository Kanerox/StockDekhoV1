const crypto = require("crypto");
const { getCachedValue, setCacheEntry } = require("../clients/cacheClient");
const stockUniverse = require("../../frontend/src/data/stockUniverse.json");

const CORPUS_CACHE_KEY = "news:canonical-corpus:v1";
const CORPUS_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_CORPUS_ARTICLES = 1200;
let corpusWriteInFlight = Promise.resolve();

const DESTINATION_RULES = [
  ["sector:Financials", /\b(bank|banking|rbi|credit|lending|deposit|nbfc|insurance|financ(?:e|ial))\b/i],
  ["sector:Information Technology", /\b(information technology|it services?|software|technology services?|tcs|infosys|wipro|hcltech)\b/i],
  ["sector:Energy", /\b(energy|crude|oil|gas|refiner|opec|ongc)\b/i],
  ["sector:Consumer Discretionary", /\b(auto|automobile|vehicle|consumer discretionary|maruti|mahindra)\b/i],
  ["sector:Health Care", /\b(pharma|pharmaceutical|healthcare|drug|hospital)\b/i],
  ["sector:Materials", /\b(metal|steel|aluminium|aluminum|mining|materials)\b/i],
  ["sector:Utilities", /\b(power|utility|electricity|renewable)\b/i],
  ["sector:Communication Services", /\b(telecom|communications|spectrum|airtel|jio)\b/i],
  ["sector:Real Estate", /\b(real estate|realty|property|housing|developer)\b/i],
  ["global-index:SP500", /\b(s&p 500|s&p500)\b/i],
  ["global-index:NASDAQ", /\b(nasdaq(?: composite)?)\b/i],
  ["global-index:DOW", /\b(dow jones|the dow)\b/i],
  ["global-index:HANGSENG", /\b(hang seng|hong kong stocks?)\b/i],
  ["global-index:NIKKEI225", /\b(nikkei(?: 225)?|japan(?:ese)? stocks?)\b/i],
  ["global-index:FTSE100", /\b(ftse(?: 100)?|uk stocks?|british stocks?)\b/i],
  ["global-index:DAX", /\b(dax|german stocks?)\b/i],
  ["global-index:EUROSTOXX50", /\b(euro stoxx(?: 50)?|eurozone stocks?)\b/i],
  ["global-index:KOSPI", /\b(kospi|korean stocks?)\b/i],
  ["global-index:TAIWAN", /\b(taiex|taiwan(?:ese)? stocks?)\b/i],
  ["indian-index:NIFTY50", /\b(nifty(?: 50)?|national stock exchange)\b/i],
  ["indian-index:SENSEX", /\b(sensex|bse 30)\b/i],
  ["indian-index:VIX", /\b(india vix|market volatility)\b/i],
  ["indian-index:INDIA10Y", /\b(india(?:n)? 10[ -]?year|g[ -]?sec|government bond yields?)\b/i],
];

const COMPANY_DESTINATIONS = stockUniverse.map((stock) => ({
  destination: `company:${stock.ticker}`,
  terms: [stock.ticker, String(stock.name || "").replace(/\b(?:Limited|Ltd)\.?$/i, "").trim()]
    .map(normalizeText).filter((term) => term.length >= 3),
}));

function normalizeText(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function normalizeLink(value) {
  try {
    const url = new URL(String(value || ""));
    ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid", "fbclid"].forEach((key) =>
      url.searchParams.delete(key)
    );
    url.hash = "";
    return url.toString().replace(/\/$/, "").toLowerCase();
  } catch {
    return String(value || "").trim().toLowerCase();
  }
}

function canonicalArticleId(article) {
  const link = normalizeLink(article?.link || article?.url);
  const title = normalizeText(article?.title);
  // Provider wrappers frequently point at different URLs for the same title.
  // Prefer normalized title identity so those representations converge; use
  // the canonicalized URL only when a usable title is absent.
  const identity = title || link || normalizeText(article?.source);
  return crypto.createHash("sha256").update(identity).digest("hex").slice(0, 24);
}

function publicationPrecision(article) {
  if (article?.publicationPrecision) return article.publicationPrecision;
  const value = article?.publishedAt || article?.pubDate;
  if (!value) return "unknown";
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value).trim())) return "date_only";
  return Number.isNaN(new Date(value).getTime()) ? "unknown" : "exact_datetime";
}

function inferDestinations(article, explicit = []) {
  const text = [article?.title, article?.summary, article?.snippet, article?.topic]
    .filter(Boolean).join(" ");
  const destinations = new Set(explicit);
  for (const [destination, pattern] of DESTINATION_RULES) {
    if (pattern.test(text)) destinations.add(destination);
  }
  const normalized = ` ${normalizeText(text)} `;
  for (const { destination, terms } of COMPANY_DESTINATIONS) {
    if (terms.some((term) => normalized.includes(` ${term} `))) destinations.add(destination);
  }
  if (/\b(nifty|sensex|indian market|india stocks?|rbi|fii|foreign investors?)\b/i.test(text)) {
    destinations.add("market");
  }
  if (/\b(global markets?|wall street|european markets?|asian markets?|central bank|federal reserve|ecb)\b/i.test(text)) {
    destinations.add("global");
  }
  return [...destinations].sort();
}

function normalizeCanonicalArticle(article, destinations = []) {
  return {
    ...article,
    canonicalId: canonicalArticleId(article),
    publicationPrecision: publicationPrecision(article),
    destinationEligibility: inferDestinations(article, destinations),
    destinationScores: Object.fromEntries(
      destinations.map((destination) => [destination, Number(article?.editorialScore || 0)])
    ),
  };
}

function precisionStrength(value) {
  return value === "exact_datetime" ? 3 : value === "date_only" ? 2 : 1;
}

function mergeCanonicalRecord(existing, candidate) {
  if (!existing) return candidate;
  const candidateIsStronger = precisionStrength(candidate.publicationPrecision) > precisionStrength(existing.publicationPrecision);
  const preferred = candidateIsStronger ? candidate : existing;
  return {
    ...existing,
    ...preferred,
    destinationEligibility: [...new Set([
      ...(existing.destinationEligibility || []),
      ...(candidate.destinationEligibility || []),
    ])].sort(),
    destinationScores: {
      ...(existing.destinationScores || {}),
      ...(candidate.destinationScores || {}),
    },
    lastSeenAt: new Date().toISOString(),
  };
}

function articleChronology(article) {
  const value = article?.publishedAt || article?.recencyAt;
  const timestamp = new Date(value || 0).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function rankCanonicalArticles(articles, now = new Date(), destination = null) {
  return [...articles].sort((a, b) => {
    const score = (article) => destination
      ? Number(article?.destinationScores?.[destination] || 0)
      : Number(article.editorialScore || 0);
    const relevance = score(b) - score(a);
    const ageA = now.getTime() - articleChronology(a);
    const ageB = now.getTime() - articleChronology(b);
    const recencyBand = (age) => age <= 24 * 60 * 60 * 1000 ? 3 : age <= 3 * 24 * 60 * 60 * 1000 ? 2 : age <= 14 * 24 * 60 * 60 * 1000 ? 1 : 0;
    const band = recencyBand(ageB) - recencyBand(ageA);
    if (band) return band;
    if (relevance) return relevance;
    const precision = precisionStrength(b.publicationPrecision) - precisionStrength(a.publicationPrecision);
    if (precision) return precision;
    return articleChronology(b) - articleChronology(a);
  });
}

async function registerCanonicalArticles(articles, destinations = []) {
  const normalized = (articles || []).map((article) => normalizeCanonicalArticle(article, destinations));
  corpusWriteInFlight = corpusWriteInFlight.then(async () => {
    const existing = await getCachedValue(CORPUS_CACHE_KEY, CORPUS_RETENTION_MS) || [];
    const byId = new Map(existing.map((article) => [article.canonicalId, article]));
    normalized.forEach((article) => byId.set(article.canonicalId, mergeCanonicalRecord(byId.get(article.canonicalId), article)));
    const retained = [...byId.values()]
      .sort((a, b) => articleChronology(b) - articleChronology(a))
      .slice(0, MAX_CORPUS_ARTICLES);
    await setCacheEntry(CORPUS_CACHE_KEY, retained, CORPUS_RETENTION_MS);
  });
  await corpusWriteInFlight;
  return normalized;
}

async function getCanonicalArticles(destination) {
  const corpus = await getCachedValue(CORPUS_CACHE_KEY, CORPUS_RETENTION_MS) || [];
  return corpus.filter((article) => (article.destinationEligibility || []).includes(destination));
}

module.exports = {
  registerCanonicalArticles,
  getCanonicalArticles,
  rankCanonicalArticles,
  _test: {
    canonicalArticleId,
    publicationPrecision,
    inferDestinations,
    normalizeCanonicalArticle,
    mergeCanonicalRecord,
    rankCanonicalArticles,
  },
};
