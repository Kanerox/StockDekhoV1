const axios = require("axios");

const MARKETAUX_URL =
  "https://api.marketaux.com/v1/news/all";

const CACHE_TTL_MS =
  30 * 60 * 1000;

const newsCache = new Map();

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

  // Marketaux accepts date-based formats such as YYYY-MM-DD.
  return date
    .toISOString()
    .slice(0, 10);
}

function normalizeSearchQuery(
  searchQuery = ""
) {
  return String(searchQuery)
    // Remove quotation marks and grouping characters.
    .replace(/["'()]/g, " ")

    // Replace Boolean operators with spaces.
    .replace(/\bOR\b/gi, " ")
    .replace(/\bAND\b/gi, " ")

    // Remove symbols that may produce a 400 response.
    .replace(/[|+]/g, " ")

    // Clean repeated whitespace.
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
  };
}

function getCacheKey({
  search,
  numberOfDays,
  countries,
}) {
  return JSON.stringify({
    search,
    numberOfDays,
    countries,
  });
}

function getCachedArticles(cacheKey) {
  const cachedEntry =
    newsCache.get(cacheKey);

  if (!cachedEntry) {
    return null;
  }

  const isExpired =
    Date.now() -
      cachedEntry.createdAt >
    CACHE_TTL_MS;

  if (isExpired) {
    newsCache.delete(cacheKey);
    return null;
  }

  return cachedEntry.articles;
}

function saveCachedArticles(
  cacheKey,
  articles
) {
  newsCache.set(cacheKey, {
    createdAt: Date.now(),
    articles,
  });
}

async function fetchMarketauxNews({
  search,
  numberOfDays = 30,
  countries = "in",
}) {
  const normalizedSearch =
    normalizeSearchQuery(search);

  const cacheKey = getCacheKey({
    search: normalizedSearch,
    numberOfDays,
    countries,
  });

  const cachedArticles =
    getCachedArticles(cacheKey);

  if (cachedArticles) {
    return cachedArticles;
  }

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

          // The Marketaux free plan permits
          // three articles per news request.
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

    const articles =
      rawArticles.map(
        normalizeMarketauxArticle
      );

    saveCachedArticles(
      cacheKey,
      articles
    );

    return articles;
  } catch (error) {
    console.error(
      "Marketaux request failed:",
      {
        status:
          error.response?.status,

        details:
          error.response?.data ||
          error.message,

        search:
          normalizedSearch,

        countries,

        publishedAfter:
          getPublishedAfter(
            numberOfDays
          ),
      }
    );

    throw new Error(
      error.response?.data?.error?.message ||
      error.response?.data?.message ||
      `Marketaux request failed with status ${
        error.response?.status ||
        "unknown"
      }`
    );
  }
}

async function fetchCompanyNews(
  companyName
) {
  return fetchMarketauxNews({
    search: companyName,
    numberOfDays: 30,
    countries: "in",
  });
}

async function fetchGlobalMarketNews(
  searchQuery
) {
  return fetchMarketauxNews({
    search: searchQuery,
    numberOfDays: 30,
    countries: "in",
  });
}

module.exports = {
  fetchCompanyNews,
  fetchGlobalMarketNews,
};