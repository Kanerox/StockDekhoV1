const axios = require("axios");

const MARKETAUX_URL =
  "https://api.marketaux.com/v1/news/all";

function getMarketauxApiKey() {
  const apiKey = process.env.MARKETAUX_API_KEY;

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

  return date.toISOString();
}

function normalizeSearchQuery(searchQuery = "") {
  return String(searchQuery)
    .replace(/\s+OR\s+/gi, " | ")
    .replace(/\s+AND\s+/gi, " + ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeMarketauxArticle(article) {
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

async function fetchMarketauxNews({
  search,
  numberOfDays = 7,
  limit = 50,
  countries = "in",
}) {
  const response = await axios.get(
    MARKETAUX_URL,
    {
      params: {
        api_token:
          getMarketauxApiKey(),

        search:
          normalizeSearchQuery(search),

        countries,
        language: "en",

        published_after:
          getPublishedAfter(numberOfDays),

        group_similar: true,
        must_have_entities: false,
        limit,
      },

      timeout: 15000,
    }
  );

  const articles = Array.isArray(
    response.data?.data
  )
    ? response.data.data
    : [];

  return articles.map(
    normalizeMarketauxArticle
  );
}

async function fetchCompanyNews(companyName) {
  return fetchMarketauxNews({
    search: `"${companyName}"`,
    numberOfDays: 30,
    limit: 50,
    countries: "in",
  });
}

async function fetchGlobalMarketNews(searchQuery) {
  return fetchMarketauxNews({
    search: searchQuery,
    numberOfDays: 30,
    limit: 50,
    countries: "in",
  });
}

module.exports = {
  fetchCompanyNews,
  fetchGlobalMarketNews,
};