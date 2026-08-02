const Parser = require("rss-parser");

const {
  normalizeArticle,
} = require("../utils/articleNormalizer");

const NSE_ANNOUNCEMENTS_FEED =
  "https://nsearchives.nseindia.com/content/RSS/Online_announcements.xml";

const parser = new Parser({
  requestOptions: {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126.0 Safari/537.36",

      Accept:
        "application/rss+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.7",
    },
  },
});

function cleanText(value = "") {
  return String(value)
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeComparableText(value = "") {
  return cleanText(value)
    .toLowerCase()
    .replace(/\blimited\b/g, "")
    .replace(/\bltd\b/g, "")
    .replace(/\bthe\b/g, "")
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

function parseNseDate(value) {
  if (!value) {
    return null;
  }

  const match = String(value).match(
    /^(\d{2})-([A-Za-z]{3})-(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/
  );

  if (!match) {
    const fallbackDate = new Date(value);

    return Number.isNaN(
      fallbackDate.getTime()
    )
      ? null
      : fallbackDate.toISOString();
  }

  const [
    ,
    day,
    monthText,
    year,
    hour,
    minute,
    second,
  ] = match;

  const monthMap = {
    jan: 0,
    feb: 1,
    mar: 2,
    apr: 3,
    may: 4,
    jun: 5,
    jul: 6,
    aug: 7,
    sep: 8,
    oct: 9,
    nov: 10,
    dec: 11,
  };

  const month =
    monthMap[
      monthText.toLowerCase()
    ];

  if (!Number.isInteger(month)) {
    return null;
  }

  return new Date(
    Number(year),
    month,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second)
  ).toISOString();
}

function extractSubject(article) {
  const text = cleanText(
    article.contentSnippet ||
      article.content ||
      ""
  );

  const subjectMatch = text.match(
    /\|SUBJECT:\s*(.+)$/i
  );

  return subjectMatch
    ? subjectMatch[1].trim()
    : "";
}

function articleMatchesCompany(
  article,
  {
    symbol,
    companyName,
    aliases = [],
  }
) {
  const normalizedTitle =
    normalizeComparableText(
      article.title
    );

  const terms = [
    companyName,
    ...aliases,
  ]
    .filter(Boolean)
    .map(normalizeComparableText)
    .filter(
      (term) => term.length >= 3
    );

  const companyNameMatch =
    terms.some(
      (term) =>
        normalizedTitle === term ||
        normalizedTitle.includes(
          term
        ) ||
        term.includes(
          normalizedTitle
        )
    );

  if (companyNameMatch) {
    return true;
  }

  const normalizedTicker =
    normalizeSymbol(symbol);

  if (!normalizedTicker) {
    return false;
  }

  const link = String(
    article.link || ""
  ).toUpperCase();

  return link.includes(
    `/${normalizedTicker}_`
  );
}

function normalizeNseArticle(
  article,
  {
    company = [],
    sectors = [],
    indexes = [],
  } = {}
) {
  const companyTitle = cleanText(
    article.title ||
      "NSE announcement"
  );

  const summary = cleanText(
    article.contentSnippet ||
      article.content ||
      ""
  );

  const subject =
    extractSubject(article);

  const publishedAt =
    parseNseDate(
      article.pubDate ||
        article.isoDate
    );

  const url =
    article.link ||
    article.guid ||
    NSE_ANNOUNCEMENTS_FEED;

  const displayTitle = subject
    ? `${companyTitle} — ${subject}`
    : companyTitle;

  return normalizeArticle({
    provider: "nse",

    id:
      article.guid ||
      article.link ||
      `${companyTitle}-${publishedAt || ""}`,

    title: displayTitle,
    summary,

    source:
      "National Stock Exchange of India",

    url,
    publishedAt,

    company,
    sectors,
    indexes,

    themes: [
      "Official Disclosure",
      subject ||
        "Corporate Announcement",
    ],

    countries: ["India"],

    sentiment: null,

    raw: article,
  });
}

async function fetchNseAnnouncements() {
  const feed =
    await parser.parseURL(
      NSE_ANNOUNCEMENTS_FEED
    );

  return Array.isArray(feed.items)
    ? feed.items
    : [];
}

function normalizeConstituents(
  constituents = []
) {
  return constituents.map(
    (constituent) => {
      if (
        typeof constituent ===
        "string"
      ) {
        return {
          symbol: constituent,
          companyName: constituent,
          aliases: [],
        };
      }

      return {
        symbol:
          constituent.symbol ||
          constituent.ticker ||
          "",

        companyName:
          constituent.companyName ||
          constituent.name ||
          "",

        aliases:
          Array.isArray(
            constituent.aliases
          )
            ? constituent.aliases
            : [],
      };
    }
  );
}

async function getCompanyNews({
  symbol,
  companyName,
  aliases = [],
  sector = null,
  limit = 20,
} = {}) {
  const articles =
    await fetchNseAnnouncements();

  return articles
    .filter((article) =>
      articleMatchesCompany(
        article,
        {
          symbol,
          companyName,
          aliases,
        }
      )
    )
    .map((article) =>
      normalizeNseArticle(
        article,
        {
          company: [
            normalizeSymbol(symbol) ||
              companyName,
          ].filter(Boolean),

          sectors:
            sector
              ? [sector]
              : [],
        }
      )
    )
    .sort(
      (articleA, articleB) =>
        new Date(
          articleB.publishedAt || 0
        ) -
        new Date(
          articleA.publishedAt || 0
        )
    )
    .slice(0, limit);
}

async function getIndexNews({
  indexKey,
  indexName,
  constituents = [],
  sectors = [],
  limit = 32,
} = {}) {
  const articles =
    await fetchNseAnnouncements();

  const normalizedConstituents =
    normalizeConstituents(
      constituents
    );

  return articles
    .filter((article) =>
      normalizedConstituents.some(
        (constituent) =>
          articleMatchesCompany(
            article,
            constituent
          )
      )
    )
    .map((article) =>
      normalizeNseArticle(
        article,
        {
          indexes: [
            indexKey ||
              indexName,
          ].filter(Boolean),

          sectors,
        }
      )
    )
    .sort(
      (articleA, articleB) =>
        new Date(
          articleB.publishedAt || 0
        ) -
        new Date(
          articleA.publishedAt || 0
        )
    )
    .slice(0, limit);
}

async function getSectorNews({
  sectorKey,
  sectorName,
  constituents = [],
  limit = 32,
} = {}) {
  const articles =
    await fetchNseAnnouncements();

  const normalizedConstituents =
    normalizeConstituents(
      constituents
    );

  return articles
    .filter((article) =>
      normalizedConstituents.some(
        (constituent) =>
          articleMatchesCompany(
            article,
            constituent
          )
      )
    )
    .map((article) =>
      normalizeNseArticle(
        article,
        {
          sectors: [
            sectorKey ||
              sectorName,
          ].filter(Boolean),
        }
      )
    )
    .sort(
      (articleA, articleB) =>
        new Date(
          articleB.publishedAt || 0
        ) -
        new Date(
          articleA.publishedAt || 0
        )
    )
    .slice(0, limit);
}

module.exports = {
  name: "nse",
  enabled: true,

  getCompanyNews,
  getIndexNews,
  getSectorNews,

  fetchNseAnnouncements,
};