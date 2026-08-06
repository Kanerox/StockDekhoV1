const axios = require("axios");
const {
  getCachedValue,
  setCacheEntry,
} = require("./cacheClient");

const currentsProvider = require(
  "../news/providers/currents"
);

const MARKETAUX_URL =
  "https://api.marketaux.com/v1/news/all";

const CACHE_TTL_MS =
  30 * 60 * 1000;

const CACHE_RETENTION_MS =
  24 * 60 * 60 * 1000;

const inFlightRequests = new Map();

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

async function saveCachedArticles(cacheKey, articles) {
  await setCacheEntry(
    persistentCacheKey(cacheKey),
    articles,
    CACHE_RETENTION_MS
  );
}

async function getOrFetchArticles(cacheKey, fetchArticles) {
  const cachedArticles =
    await getCachedArticles(cacheKey);

  if (cachedArticles) {
    return cachedArticles;
  }

  if (inFlightRequests.has(cacheKey)) {
    return inFlightRequests.get(cacheKey);
  }

  const request = (async () => {
    const staleArticles = await getCachedArticles(
      cacheKey,
      CACHE_RETENTION_MS
    );

    try {
      const articles = await fetchArticles();

      if (articles.length > 0) {
        await saveCachedArticles(cacheKey, articles);
        return articles;
      }

      return staleArticles || [];
    } catch (error) {
      if (staleArticles) {
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

          countries,
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
    numberOfDays: 30,
    countries: "in",
  });

  return getOrFetchArticles(cacheKey, async () => {
    const results = await Promise.allSettled([
      fetchMarketauxNews({
        search: companyName,
        numberOfDays: 30,
        countries: "in",
      }),

      currentsProvider.getCompanyNews({
        companyName,
        aliases: [
          String(companyName)
            .replace(/\bLimited\b/gi, "")
            .replace(/\bLtd\b/gi, "")
            .trim(),
        ],
        limit: 20,
      }),
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

    return removeExactDuplicateUrls([
      ...marketauxArticles,
      ...currentsArticles,
    ]);
  });
}

async function fetchGlobalMarketNews(
  searchQuery
) {
  const cacheKey = getCacheKey({
    type: "global",
    search: searchQuery,
    numberOfDays: 30,
    countries: "in",
  });

  return getOrFetchArticles(cacheKey, async () => {
    const results = await Promise.allSettled([
      fetchMarketauxNews({
        search: searchQuery,
        numberOfDays: 30,
        countries: "in",
      }),

      currentsProvider.getGlobalMarketNews({
        topics: [searchQuery],
        limit: 20,
      }),
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

    return removeExactDuplicateUrls([
      ...marketauxArticles,
      ...currentsArticles,
    ]);
  });
}

module.exports = {
  fetchCompanyNews,
  fetchGlobalMarketNews,
};
