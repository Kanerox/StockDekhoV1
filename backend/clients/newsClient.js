const axios = require("axios");
const Parser = require("rss-parser");
const {
  getCachedValue,
  setCacheEntry,
  incrementCacheCounter,
} = require("./cacheClient");

const currentsProvider = require(
  "../news/providers/currents"
);

const MARKETAUX_URL =
  "https://api.marketaux.com/v1/news/all";

const CACHE_TTL_MS =
  10 * 60 * 1000;

const CACHE_RETENTION_MS =
  24 * 60 * 60 * 1000;

const inFlightRequests = new Map();
const rssParser = new Parser();
const NEWS_DIAGNOSTICS = process.env.NEWS_DIAGNOSTICS === "true";
const PROVIDER_TTLS = {
  marketaux: 6 * 60 * 60 * 1000,
  currents: 30 * 60 * 1000,
  google: 15 * 60 * 1000,
};
const PROVIDER_RETENTION_MS = 48 * 60 * 60 * 1000;
const DAILY_PROVIDER_LIMITS = { marketaux: 85, currents: 225 };

function diagnostic(message) {
  if (NEWS_DIAGNOSTICS) console.info(`[news] ${message}`);
}

function providerDayKey(provider) {
  return `news-provider-usage:${provider}:${new Date().toISOString().slice(0, 10)}`;
}

async function reserveProviderRequest(provider) {
  const limit = DAILY_PROVIDER_LIMITS[provider];
  if (!limit) return true;
  const count = await incrementCacheCounter(providerDayKey(provider), 26 * 60 * 60 * 1000);
  if (count > limit) {
    if (count === limit + 1) console.warn(`[news] ${provider} daily safety budget reached; cached and alternate sources will be used.`);
    return false;
  }
  return true;
}

function getMarketauxApiKey() {
  const apiKey =
    process.env.MARKETAUX_API_KEY;

  if (!apiKey) {
    throw new Error(
      "MARKETAUX_API_KEY is not configured"
    );
  }

  return apiKey;
}

function getPublishedAfter(numberOfDays) {
  const date = new Date();

  date.setUTCDate(
    date.getUTCDate() - numberOfDays
  );

  return date
    .toISOString()
    .slice(0, 10);
}

function normalizeSearchQuery(
  searchQuery = ""
) {
  return String(searchQuery)
    .replace(/["'()]/g, " ")
    .replace(/\bOR\b/gi, " ")
    .replace(/\bAND\b/gi, " ")
    .replace(/[|+]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeMarketauxArticle(
  article
) {
  return {
    guid:
      article.uuid ||
      article.url ||
      null,

    title:
      article.title ||
      "Untitled article",

    link:
      article.url ||
      "",

    pubDate:
      article.published_at ||
      null,

    creator:
      article.source ||
      "Marketaux",

    source:
      article.source ||
      "Marketaux",

    contentSnippet:
      article.snippet ||
      article.description ||
      "",

    content:
      article.description ||
      article.snippet ||
      "",

    imageUrl:
      article.image_url ||
      null,

    entities:
      Array.isArray(article.entities)
        ? article.entities
        : [],

    provider: "marketaux",
  };
}

function convertCurrentsToLegacy(
  article
) {
  return {
    guid:
      article.id ||
      article.url ||
      null,

    title:
      article.title ||
      "Untitled article",

    link:
      article.url ||
      "",

    pubDate:
      article.publishedAt ||
      null,

    creator:
      article.source ||
      "Currents",

    source:
      article.source ||
      "Currents",

    contentSnippet:
      article.summary ||
      "",

    content:
      article.summary ||
      "",

    imageUrl:
      article.raw?.image ||
      null,

    entities: [],

    provider: "currents",
  };
}

async function fetchGoogleNewsRss(searchQuery, numberOfDays = 14) {
  const query = `${String(searchQuery || "").trim()} when:${numberOfDays}d`;
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-IN&gl=IN&ceid=IN:en`;

  try {
    const response = await axios.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; StockDekho/1.0)",
        Accept: "application/rss+xml, application/xml;q=0.9, text/xml;q=0.8",
      },
      responseType: "text",
      timeout: 15000,
    });
    const feed = await rssParser.parseString(response.data);

    return (feed.items || []).map((item) => ({
      guid: item.guid || item.link || null,
      title: item.title || "Untitled article",
      link: item.link || "",
      pubDate: item.isoDate || item.pubDate || null,
      creator: item.creator || "",
      source: item.creator || "",
      contentSnippet: "",
      content: "",
      imageUrl: null,
      entities: [],
      provider: "google-news-rss",
    }));
  } catch (error) {
    console.error("Google News RSS request failed:", error.message);
    return [];
  }
}

function settleWithin(promise, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => resolve([]), timeoutMs);
    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeout);
        reject(error);
      }
    );
  });
}

function getCacheKey({
  type,
  search,
  numberOfDays,
  countries,
}) {
  return JSON.stringify({
    type,
    search,
    numberOfDays,
    countries,
  });
}

function persistentCacheKey(cacheKey) {
  return `news:${cacheKey}`;
}

async function getCachedArticles(
  cacheKey,
  maxAgeMs = CACHE_TTL_MS
) {
  return getCachedValue(
    persistentCacheKey(cacheKey),
    maxAgeMs
  );
}

async function saveCachedArticles(cacheKey, articles, retentionMs = CACHE_RETENTION_MS) {
  await setCacheEntry(
    persistentCacheKey(cacheKey),
    articles,
    retentionMs
  );
}

function hasArticles(value) {
  return Array.isArray(value) && value.length > 0;
}

async function getOrFetchArticles(cacheKey, fetchArticles, options = {}) {
  const freshTtlMs = options.freshTtlMs || CACHE_TTL_MS;
  const retentionMs = options.retentionMs || CACHE_RETENTION_MS;
  const cachedArticles =
    await getCachedArticles(cacheKey, freshTtlMs);

  if (hasArticles(cachedArticles)) {
    diagnostic(`${options.label || "aggregate"} cache hit`);
    return cachedArticles;
  }

  diagnostic(`${options.label || "aggregate"} cache miss`);

  if (inFlightRequests.has(cacheKey)) {
    diagnostic(`${options.label || "aggregate"} request coalesced`);
    return inFlightRequests.get(cacheKey);
  }

  const request = (async () => {
    const staleArticles = await getCachedArticles(
      cacheKey,
      retentionMs
    );

    try {
      const articles = await fetchArticles();

      if (articles.length > 0) {
        await saveCachedArticles(cacheKey, articles, retentionMs);
        return articles;
      }

      return hasArticles(staleArticles)
        ? staleArticles
        : [];
    } catch (error) {
      if (hasArticles(staleArticles)) {
        console.warn(
          "News providers failed; using cached articles."
        );
        return staleArticles;
      }

      throw error;
    }
  })().finally(() => {
    inFlightRequests.delete(cacheKey);
  });

  inFlightRequests.set(cacheKey, request);
  return request;
}

async function getProviderArticles(provider, search, fetchArticles) {
  const cacheKey = getCacheKey({ type: `provider:${provider}`, search, numberOfDays: 14, countries: "shared" });
  return getOrFetchArticles(cacheKey, async () => {
    if (!(await reserveProviderRequest(provider))) return [];
    diagnostic(`${provider} upstream request`);
    return fetchArticles();
  }, {
    freshTtlMs: PROVIDER_TTLS[provider],
    retentionMs: PROVIDER_RETENTION_MS,
    label: provider,
  });
}

async function fetchMarketauxNews({
  search,
  numberOfDays = 30,
  countries = "in",
}) {
  const normalizedSearch =
    normalizeSearchQuery(search);

  try {
    const response = await axios.get(
      MARKETAUX_URL,
      {
        params: {
          api_token:
            getMarketauxApiKey(),

          search:
            normalizedSearch ||
            undefined,

          countries:
            countries || undefined,
          language: "en",

          published_after:
            getPublishedAfter(
              numberOfDays
            ),

          group_similar: true,
          limit: 3,
        },

        timeout: 15000,
      }
    );

    const rawArticles =
      Array.isArray(
        response.data?.data
      )
        ? response.data.data
        : [];

    return rawArticles.map(
      normalizeMarketauxArticle
    );
  } catch (error) {
    const status =
      error.response?.status;

    const errorCode =
      error.response?.data?.error?.code;

    const expectedProviderFailure =
      status === 401 ||
      status === 402 ||
      status === 403 ||
      status === 429 ||
      errorCode ===
        "usage_limit_reached";

    if (!expectedProviderFailure) {
      console.error(
        "Marketaux request failed:",
        error.message
      );
    }

    if (expectedProviderFailure) console.warn(`[news] Marketaux quota/rate response (${status || errorCode || "unknown"}).`);

    return [];
  }
}

function removeExactDuplicateUrls(
  articles = []
) {
  const seenUrls = new Set();

  return articles.filter((article) => {
    const url = String(
      article.link || ""
    ).trim();

    if (!url) {
      return true;
    }

    if (seenUrls.has(url)) {
      return false;
    }

    seenUrls.add(url);

    return true;
  });
}

async function fetchCompanyNews(
  companyName
) {
  const cacheKey = getCacheKey({
    type: "company",
    search: companyName,
    numberOfDays: 14,
    countries: "in",
  });

  return getOrFetchArticles(cacheKey, async () => {
    const results = await Promise.allSettled([
      settleWithin(
        getProviderArticles("marketaux", `company:${companyName}`, () => fetchMarketauxNews({
          search: companyName,
          numberOfDays: 14,
          countries: "in",
        })),
        8000
      ),

      settleWithin(
        getProviderArticles("currents", `company:${companyName}`, () => currentsProvider.getCompanyNews({
          companyName,
          aliases: [
            String(companyName)
              .replace(/\bLimited\b/gi, "")
              .replace(/\bLtd\b/gi, "")
              .trim(),
          ],
          limit: 20,
        })),
        8000
      ),

      settleWithin(
        getProviderArticles("google", `company:${companyName}`, () => fetchGoogleNewsRss(companyName, 14)),
        12000
      ),
    ]);


    const marketauxArticles =
      results[0].status === "fulfilled"
        ? results[0].value
        : [];

    const currentsArticles =
      results[1].status === "fulfilled"
        ? results[1].value.map(
            convertCurrentsToLegacy
          )
        : [];

    const googleNewsArticles =
      results[2].status === "fulfilled"
        ? results[2].value.slice(0, 40)
        : [];

    if (results[0].status === "rejected") {
      console.error(
        "Marketaux company news failed:",
        results[0].reason?.message ||
          results[0].reason
      );
    }

    if (results[1].status === "rejected") {
      console.error(
        "Currents company news failed:",
        results[1].reason?.message ||
          results[1].reason
      );
    }

    if (results[2].status === "rejected") {
      console.error(
        "Google News RSS company news failed:",
        results[2].reason?.message ||
          results[2].reason
      );
    }

    return removeExactDuplicateUrls([
      ...marketauxArticles,
      ...currentsArticles,
      ...googleNewsArticles,
    ]);
  });
}

async function fetchGlobalMarketNews(
  searchQuery
) {
  const cacheKey = getCacheKey({
    type: "global",
    search: searchQuery,
    numberOfDays: 14,
    countries: "global",
  });

  return getOrFetchArticles(cacheKey, async () => {
    const results = await Promise.allSettled([
      settleWithin(
        getProviderArticles("marketaux", searchQuery, () => fetchMarketauxNews({
          search: searchQuery,
          numberOfDays: 14,
          countries: "",
        })),
        8000
      ),

      settleWithin(
        getProviderArticles("currents", searchQuery, () => currentsProvider.getGlobalMarketNews({
          topics: [normalizeSearchQuery(searchQuery)],
          limit: 20,
        })),
        8000
      ),

      settleWithin(getProviderArticles("google", searchQuery, () => fetchGoogleNewsRss(searchQuery, 14)), 12000),
    ]);

    const marketauxArticles =
      results[0].status === "fulfilled"
        ? results[0].value
        : [];

    const currentsArticles =
      results[1].status === "fulfilled"
        ? results[1].value.map(
            convertCurrentsToLegacy
          )
        : [];

    const googleNewsArticles =
      results[2].status === "fulfilled"
        ? results[2].value
        : [];

    if (results[0].status === "rejected") {
      console.error(
        "Marketaux market news failed:",
        results[0].reason?.message ||
          results[0].reason
      );
    }

    if (results[1].status === "rejected") {
      console.error(
        "Currents market news failed:",
        results[1].reason?.message ||
          results[1].reason
      );
    }

    if (results[2].status === "rejected") {
      console.error(
        "Google News RSS market news failed:",
        results[2].reason?.message || results[2].reason
      );
    }

    return removeExactDuplicateUrls([
      ...marketauxArticles,
      ...currentsArticles,
      ...googleNewsArticles,
    ]);
  });
}

module.exports = {
  fetchCompanyNews,
  fetchGlobalMarketNews,
};
