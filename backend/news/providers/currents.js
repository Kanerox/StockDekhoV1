const axios = require("axios");

const {
  normalizeArticle,
} = require("../utils/articleNormalizer");

const CURRENTS_BASE_URL =
  "https://api.currentsapi.services/v2";

function getApiKey() {
  const apiKey =
    process.env.CURRENTS_API_KEY;

  if (!apiKey) {
    throw new Error(
      "CURRENTS_API_KEY is not configured"
    );
  }

  return apiKey;
}

function cleanText(value = "") {
  return String(value)
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeComparableText(
  value = ""
) {
  return cleanText(value)
    .toLowerCase()
    .replace(/\blimited\b/g, "")
    .replace(/\bltd\b/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeSymbol(value = "") {
  return String(value)
    .toUpperCase()
    .replace(/\.(NS|BO)$/i, "")
    .replace(/[^A-Z0-9]/g, "");
}
const AMBIGUOUS_TICKERS = new Set([
  "RELIANCE",
]);

function isAmbiguousTicker(symbol) {
  return AMBIGUOUS_TICKERS.has(
    normalizeSymbol(symbol)
  );
}

function getSourceName(article = {}) {
  try {
    const hostname = new URL(
      article.url || ""
    ).hostname;

    return hostname
      .replace(/^www\./i, "")
      .replace(/^m\./i, "");
  } catch {
    return cleanText(
      article.author ||
        article.source ||
        "Currents"
    );
  }
}

function normalizeCurrentsArticle(
  article,
  {
    company = [],
    sectors = [],
    indexes = [],
    themes = [],
    countries = [],
  } = {}
) {
  return normalizeArticle({
    provider: "currents",

    id:
      article.id ||
      article.url ||
      `${article.title}-${article.published || ""}`,

    title:
      cleanText(
        article.title ||
          "Untitled article"
      ),

    summary:
      cleanText(
        article.description ||
          ""
      ),

    source:
      getSourceName(article),

    url:
      article.url ||
      "",

    publishedAt:
      article.published ||
      null,

    company,
    sectors,
    indexes,
    themes,
    countries,

    sentiment: null,

    raw: article,
  });
}

async function requestCurrents(
  endpoint,
  params = {}
) {
  try {
    const response = await axios.get(
      `${CURRENTS_BASE_URL}/${endpoint}`,
      {
        params: {
          ...params,
          apiKey: getApiKey(),
        },

        timeout: 15000,
      }
    );

    return Array.isArray(
      response.data?.news
    )
      ? response.data.news
      : [];
  } catch (error) {
    console.error(
      "Currents request failed:",
      {
        endpoint,

        status:
          error.response?.status,

        details:
          error.response?.data ||
          error.message,

        params,
      }
    );

    throw error;
  }
}

async function searchNews({
  keywords,
  country,
  category,
  pageSize = 20,
} = {}) {
  if (!keywords) {
    return [];
  }

  return requestCurrents(
    "search",
    {
      keywords,
      language: "en",

      country:
        country ||
        undefined,

      category:
        category ||
        undefined,

      page_size:
        Math.min(
          Math.max(pageSize, 1),
          20
        ),
    }
  );
}

function isIndiaMarketRelevant(
  article
) {
  const text =
    normalizeComparableText(
      [
        article.title,
        article.description,
      ]
        .filter(Boolean)
        .join(" ")
    );

  const marketTerms = [
    "nifty",
    "sensex",
    "stock market",
    "stocks",
    "shares",
    "equity",
    "markets",
    "rbi",
    "sebi",
    "fii",
    "dii",
    "rupee",
    "inflation",
    "interest rate",
    "repo rate",
    "earnings",
    "results",
    "ipo",
    "market cap",
    "mcap",
    "bond",
    "yield",
    "economy",
    "gdp",
    "commodity",
    "crude oil",
    "gold",
  ];

  return marketTerms.some(
    (term) => text.includes(term)
  );
}

async function fetchIndiaBusinessNews({
  pageSize = 20,
} = {}) {
  const articles =
    await searchNews({
      keywords: [
        "Nifty",
        "Sensex",
        "Indian stocks",
        "stock market India",
        "RBI",
        "FII",
        "DII",
        "Indian rupee",
        "earnings India",
        "corporate results India",
      ].join(" OR "),

      country: "IN",

      category:
        "economy_business_finance",

      pageSize: Math.min(
        pageSize * 2,
        20
      ),
    });

  return articles
    .filter(isIndiaMarketRelevant)
    .slice(0, pageSize);
}

function articleMatchesCompany(
  article,
  {
    symbol,
    companyName,
    aliases = [],
  } = {}
) {
  const searchableText =
    normalizeComparableText(
      [
        article.title,
        article.description,
      ]
        .filter(Boolean)
        .join(" ")
    );

  const normalizedCompanyName =
    normalizeComparableText(
      companyName
    );

  if (
    normalizedCompanyName &&
    searchableText.includes(
      normalizedCompanyName
    )
  ) {
    return true;
  }

  const safeAliases = aliases
    .filter(Boolean)
    .map(normalizeComparableText)
    .filter(
      (alias) =>
        alias.length >= 5 &&
        alias !==
          normalizeComparableText(
            symbol
          )
    );

  if (
    safeAliases.some((alias) =>
      searchableText.includes(alias)
    )
  ) {
    return true;
  }

  if (isAmbiguousTicker(symbol)) {
    return false;
  }

  const ticker =
    normalizeSymbol(symbol)
      .toLowerCase();

  return (
    ticker.length >= 4 &&
    new RegExp(
      `\\b${ticker}\\b`,
      "i"
    ).test(searchableText)
  );
}

function isWrongRelianceEntity(
  article,
  symbol
) {
  if (
    normalizeSymbol(symbol) !==
    "RELIANCE"
  ) {
    return false;
  }

  const searchableText =
    normalizeComparableText(
      [
        article.title,
        article.description,
      ]
        .filter(Boolean)
        .join(" ")
    );

  const wrongEntities = [
    "reliance capital",
    "reliance power",
    "reliance infrastructure",
    "anil ambani",
  ];

  return wrongEntities.some(
    (term) =>
      searchableText.includes(
        term
      )
  );
}

function sortNewestFirst(
  articles = []
) {
  return [...articles].sort(
    (articleA, articleB) =>
      new Date(
        articleB.publishedAt || 0
      ) -
      new Date(
        articleA.publishedAt || 0
      )
  );
}

function getConstituentTerms(
  constituents = []
) {
  return constituents
    .slice(0, 10)
    .map((item) => {
      if (
        typeof item ===
        "string"
      ) {
        return item;
      }

      return (
        item.name ||
        item.companyName ||
        item.symbol ||
        item.ticker ||
        ""
      );
    })
    .filter(Boolean);
}

async function getCompanyNews({
  symbol,
  companyName,
  aliases = [],
  sector = null,
  limit = 20,
} = {}) {
  if (!companyName) {
    return [];
  }

const queryTerms = [
  companyName,

  ...aliases.filter(
    (alias) => {
      const normalizedAlias =
        normalizeComparableText(
          alias
        );

      return (
        normalizedAlias.length >= 5 &&
        normalizedAlias !==
          normalizeComparableText(
            symbol
          )
      );
    }
  ),

  !isAmbiguousTicker(symbol)
    ? normalizeSymbol(symbol)
    : null,
]
  .filter(Boolean)
  .join(" OR ");

  const rawArticles =
    await searchNews({
      keywords:
        queryTerms,

      country: "IN",

      category:
        "economy_business_finance",

      pageSize:
        Math.min(limit, 20),
    });

  const normalizedArticles =
    rawArticles
      .filter(
        (article) =>
          articleMatchesCompany(
            article,
            {
              symbol,
              companyName,
              aliases,
            }
          ) &&
          !isWrongRelianceEntity(
            article,
            symbol
          )
      )
      .map((article) =>
        normalizeCurrentsArticle(
          article,
          {
            company: [
              normalizeSymbol(
                symbol
              ) ||
                companyName,
            ].filter(Boolean),

            sectors:
              sector
                ? [sector]
                : [],

            themes: [
              "Company News",
            ],

            countries: [
              "India",
            ],
          }
        )
      );

  return sortNewestFirst(
    normalizedArticles
  ).slice(0, limit);
}

async function getIndexNews({
  indexKey,
  indexName,
  constituents = [],
  sectors = [],
  limit = 32,
} = {}) {
  const constituentTerms =
    getConstituentTerms(
      constituents
    );

  const keywords = [
    indexName,
    indexKey,
    "Nifty",
    "Sensex",
    "Indian stocks",
    "Indian stock market",
    ...constituentTerms,
  ]
    .filter(Boolean)
    .join(" OR ");

  const rawArticles =
    await searchNews({
      keywords,

      country: "IN",

      category:
        "economy_business_finance",

      pageSize:
        Math.min(limit, 20),
    });

  const normalizedArticles =
    rawArticles.map(
      (article) =>
        normalizeCurrentsArticle(
          article,
          {
            indexes: [
              indexKey ||
                indexName,
            ].filter(Boolean),

            sectors,

            themes: [
              "Indian Markets",
              "Index News",
            ],

            countries: [
              "India",
            ],
          }
        )
    );

  return sortNewestFirst(
    normalizedArticles
  ).slice(0, limit);
}

async function getSectorNews({
  sectorKey,
  sectorName,
  constituents = [],
  themes = [],
  limit = 32,
} = {}) {
  const constituentTerms =
    getConstituentTerms(
      constituents
    );

  const keywords = [
    sectorName,
    sectorKey,
    ...themes,
    ...constituentTerms,
  ]
    .filter(Boolean)
    .join(" OR ");

  if (!keywords) {
    return [];
  }

  const rawArticles =
    await searchNews({
      keywords,

      country: "IN",

      category:
        "economy_business_finance",

      pageSize:
        Math.min(limit, 20),
    });

  const normalizedArticles =
    rawArticles.map(
      (article) =>
        normalizeCurrentsArticle(
          article,
          {
            sectors: [
              sectorKey ||
                sectorName,
            ].filter(Boolean),

            themes: [
              "Sector News",
              ...themes,
            ],

            countries: [
              "India",
            ],
          }
        )
    );

  return sortNewestFirst(
    normalizedArticles
  ).slice(0, limit);
}

async function getGlobalMarketNews({
  topics = [],
  countries = [],
  currencies = [],
  commodities = [],
  limit = 32,
} = {}) {
  const keywords = [
    ...topics,
    ...countries,
    ...currencies,
    ...commodities,
  ]
    .filter(Boolean)
    .join(" OR ");

  const rawArticles =
    keywords
      ? await searchNews({
          keywords,

          category:
            "economy_business_finance",

          pageSize:
            Math.min(
              limit,
              20
            ),
        })
      : await requestCurrents(
          "latest-news",
          {
            language: "en",

            category:
              "economy_business_finance",

            page_size:
              Math.min(
                limit,
                20
              ),
          }
        );

  const normalizedArticles =
    rawArticles.map(
      (article) =>
        normalizeCurrentsArticle(
          article,
          {
            themes: [
              "Global Markets",
              ...topics,
            ],

            countries,
          }
        )
    );

  return sortNewestFirst(
    normalizedArticles
  ).slice(0, limit);
}

module.exports = {
  name: "currents",
  enabled: true,

  getCompanyNews,
  getIndexNews,
  getSectorNews,
  getGlobalMarketNews,

  fetchIndiaBusinessNews,
  searchNews,
};