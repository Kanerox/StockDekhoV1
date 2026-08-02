const {
  fetchCompanyNews,
  fetchGlobalMarketNews,
} = require("../clients/newsClient");

const {
  fetchMarketData,
} = require("../clients/marketClient");

const BLOCKED_NEWS_TERMS = [
  "class action",
  "lawsuit",
  "law firm",
  "investigation",
  "shareholder alert",
  "securities fraud",
  "bronstein",
  "pomerantz",
  "rosen law",
  "levi & korsinsky",
  "globe newswire",
  "globenewswire",
  "pr newswire",
  "business wire",
];

const BLOCKED_SOURCES = [
  "facebook",
  "instagram",
  "x",
  "twitter",
  "reddit",
  "threads",
  "linkedin",
  "youtube",
  "tiktok",
  "telegram",
  "whatsapp",
  "discord",
  "medium",
  "quora",
  "snapchat",
  "pinterest",
];

const BLOCKED_TITLE_TERMS = [
  "share price",
  "stock price",
  "live bse",
  "live nse",
  "nse/bse",
  "forecast",
  "buy/sell",
  "f&o quotes",
  "today share price",
  "stock quote",
  "price chart",
];

const GLOBAL_MARKET_TOPICS = [
  {
    topic: "Energy & Crude",
    query: '("crude oil" OR OPEC OR "energy markets") markets',
  },
  {
    topic: "Semiconductors",
    query: '(semiconductor OR "chip industry" OR "chip stocks") markets',
  },
  {
    topic: "Artificial Intelligence",
    query: '("artificial intelligence" OR "AI investment" OR "AI chips") markets',
  },
  {
    topic: "Central Banks",
    query: '("Federal Reserve" OR ECB OR "interest rates") markets',
  },
  {
    topic: "Trade & Tariffs",
    query: '("global trade" OR tariffs OR "supply chains") markets',
  },
  {
    topic: "Commodities",
    query: '(gold OR copper OR commodities) "global markets"',
  },
];

const VIX_MARKET_TOPICS = [
  {
    topic: "Market Volatility",
    query:
      '("India VIX" OR "Nifty volatility" OR "Indian market volatility")',
  },
  {
    topic: "Global Risk",
    query:
      '("global markets" AND (volatility OR selloff OR uncertainty)) India',
  },
  {
    topic: "Central Banks",
    query:
      '(RBI OR "Federal Reserve") (rates OR policy OR liquidity) Indian markets',
  },
  {
    topic: "Foreign Flows",
    query:
      '(FII OR "foreign investors") (selling OR flows) Indian stocks',
  },
  {
    topic: "Crude & Rupee",
    query:
      '("crude oil" OR rupee) (Nifty OR "Indian markets")',
  },
  {
    topic: "Earnings",
    query:
      '("earnings season" OR "quarterly results") Nifty volatility India',
  },
  {
    topic: "Policy & Economy",
    query:
      '(India inflation OR GDP OR election OR budget) markets uncertainty',
  },
  {
    topic: "Options Market",
    query:
      '(Nifty options OR "option premiums" OR derivatives) volatility India',
  },
];

const NIFTY_MARKET_TOPICS = [
  {
    topic: "Market",
    query:
      '("Nifty 50" OR Sensex) (rises OR falls OR markets OR stocks) India',
  },
  {
    topic: "Foreign Flows",
    query:
      '(FII OR "foreign investors") (buying OR selling OR flows) Indian stocks',
  },
  {
    topic: "Macro",
    query:
      '(RBI OR inflation OR GDP OR rupee OR "crude oil") "Indian markets"',
  },
  {
    topic: "Earnings",
    query:
      '(Reliance OR TCS OR Infosys OR "HDFC Bank" OR "ICICI Bank" OR SBI) earnings India',
  },
  {
    topic: "Sector",
    query:
      '(banking OR IT OR energy OR auto OR pharma) stocks Nifty India',
  },
  {
    topic: "Corporate Action",
    query:
      '(Reliance OR TCS OR Infosys OR "HDFC Bank" OR "ICICI Bank" OR SBI OR Airtel OR ITC) (dividend OR buyback OR merger OR acquisition)',
  },
  {
    topic: "Policy",
    query:
      '(India budget OR government policy OR tariffs OR election) stock market',
  },
{
  topic: "Banking",
  query:
    '("Indian banks" OR "banking stocks" OR "Nifty Bank") India',
},
{
  topic: "Technology",
  query:
    '(TCS OR Infosys OR Wipro OR HCLTech) (earnings OR deal OR guidance OR shares) India',
},
{
  topic: "Autos & Pharma",
  query:
    '(Tata Motors OR Maruti OR Mahindra OR Sun Pharma OR Dr Reddy) (earnings OR sales OR approval OR shares) India',
},

];

const TRUSTED_GLOBAL_SOURCES = [
  "reuters",
  "bloomberg",
  "cnbc",
  "financial times",
  "wall street journal",
  "associated press",
  "bbc",
  "economic times",
  "moneycontrol",
  "business standard",
  "livemint",
  "mint",
  "ndtv profit",
  "businessline",
  "financial express",
  "yahoo finance",
  "business-standard.com",
  "economictimes.indiatimes.com",
  "thehindubusinessline.com",
  "livemint.com",
];

const BLOCKED_LIVE_HEADLINE_TERMS = [
  "share market live",
  "stock market live",
  "latest share market news",
];

function cleanGoogleNewsArticle(article) {
  const rawTitle = String(
    article.title || "Untitled article"
  ).trim();

  const explicitSource = String(
    article.source ||
    article.creator ||
    ""
  ).trim();

  let title = rawTitle;
  let rawSource = explicitSource;

  if (!rawSource) {
    const separatorIndex =
      rawTitle.lastIndexOf(" - ");

    if (separatorIndex !== -1) {
      title = rawTitle
        .slice(0, separatorIndex)
        .trim();

      rawSource = rawTitle
        .slice(separatorIndex + 3)
        .trim();
    }
  }

  const source = String(
    rawSource || "Marketaux"
  )
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/^m\./i, "")
    .replace(/\/.*$/, "")
    .trim();

  const rawSnippet =
    article.contentSnippet ||
    article.content ||
    "";

  const snippet = String(rawSnippet)
    .replace(rawTitle, "")
    .replace(title, "")
    .replace(/\s+/g, " ")
    .trim();

  return {
    title,
    source,
    snippet,
  };
}

function isBlockedArticleLink(link = "") {
  const normalizedLink = String(link).toLowerCase();

 const blockedLinkTerms = [
  "/stocks/marketinfo/",
  "/stockpricequote/",
  "/share-price/",
  "share-price",
  "stock-price",
  "quote-page",
];

  return blockedLinkTerms.some((term) =>
    normalizedLink.includes(term)
  );
}

function isRelevantArticle(article) {
  const searchableText = [
    article.title,
    article.contentSnippet,
    article.content,
    article.creator,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const sourceText = (
    article.creator ||
    article.source ||
    article.title ||
    ""
  ).toLowerCase();

  const blockedByContent = BLOCKED_NEWS_TERMS.some((term) =>
    searchableText.includes(term)
  );
const blockedByLink = isBlockedArticleLink(article.link);
  const blockedBySource = BLOCKED_SOURCES.some((source) => {
    if (source === "x") {
      return sourceText === "x" || sourceText.includes("x.com");
    }

    return sourceText.includes(source);
  });

  const blockedByTitle = BLOCKED_TITLE_TERMS.some((term) =>
  (article.title || "").toLowerCase().includes(term)
);

 return (
  !blockedByContent &&
  !blockedBySource &&
  !blockedByTitle &&
  !blockedByLink
);
}

function isMeaningfulSummary(title, snippet) {
  const cleanTitle = String(title || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const cleanSnippet = String(snippet || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleanSnippet || cleanSnippet.length < 30) {
    return false;
  }

  if (
    cleanSnippet === "com" ||
    cleanSnippet === "in" ||
    cleanSnippet.endsWith(" com")
  ) {
    return false;
  }

  if (
    cleanSnippet === cleanTitle ||
    cleanSnippet.includes(cleanTitle) ||
    cleanTitle.includes(cleanSnippet)
  ) {
    return false;
  }

  const titleWords = new Set(
    cleanTitle.split(" ").filter(Boolean)
  );

  const snippetWords = cleanSnippet
    .split(" ")
    .filter(Boolean);

  if (titleWords.size && snippetWords.length) {
    const matchingWords = snippetWords.filter((word) =>
      titleWords.has(word)
    );

    const overlapRatio =
      matchingWords.length / snippetWords.length;

    if (overlapRatio >= 0.8) {
      return false;
    }
  }

  return true;
}

function isCompanyRelevantArticle(
  article,
  companyName,
  symbol
) {
  const cleanedArticle =
    cleanGoogleNewsArticle(article);

  // Match only against user-visible editorial text.
  // Avoid provider metadata or extended content that may
  // contain unrelated entity names.
  const searchableText = [
    cleanedArticle.title,
    cleanedArticle.snippet,
    article.contentSnippet,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const normalizedCompanyName = String(
    companyName || ""
  )
    .toLowerCase()
    .replace(/\blimited\b/g, "")
    .replace(/\bltd\b/g, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const normalizedSymbol = String(
    symbol || ""
  )
    .toLowerCase()
    .replace(/\.(ns|bo)$/i, "")
    .replace(/[^a-z0-9]/g, "");

  const GENERIC_COMPANY_WORDS =
    new Set([
      "limited",
      "ltd",
      "industries",
      "industry",
      "company",
      "corporation",
      "enterprise",
      "enterprises",
      "holdings",
      "group",
      "services",
    ]);

  const significantCompanyWords =
    normalizedCompanyName
      .split(" ")
      .filter(
        (word) =>
          word.length > 2 &&
          !GENERIC_COMPANY_WORDS.has(
            word
          )
      );

  const fullCompanyMatch =
    Boolean(normalizedCompanyName) &&
    new RegExp(
      `\\b${normalizedCompanyName
        .split(/\s+/)
        .join("\\s+")}\\b`,
      "i"
    ).test(searchableText);

  const symbolMatch =
    normalizedSymbol.length >= 3 &&
    new RegExp(
      `\\b${normalizedSymbol}\\b`,
      "i"
    ).test(searchableText);

  const matchedSignificantWords =
    significantCompanyWords.filter(
      (word) =>
        new RegExp(
          `\\b${word}\\b`,
          "i"
        ).test(searchableText)
    );

  const strongWordMatch =
    significantCompanyWords.length === 1
      ? matchedSignificantWords.length === 1
      : significantCompanyWords.length >= 2 &&
        matchedSignificantWords.length >= 2;

  return (
    fullCompanyMatch ||
    symbolMatch ||
    strongWordMatch
  );
}

function generateSummary(title, snippet) {
  if (isMeaningfulSummary(title, snippet)) {
    return snippet;
  }

  return (
    "A reliable summary is not available from " +
    "the publisher feed. Open the original " +
    "article for full details."
  );
}

function normalizeSourceForMatching(
  source = ""
) {
  return String(source)
    .toLowerCase()
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/^m\./i, "")
    .replace(/[.\-_]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isTrustedGlobalSource(source) {
  const normalizedSource =
    normalizeSourceForMatching(source);

  return TRUSTED_GLOBAL_SOURCES.some(
    (trustedSource) => {
      const normalizedTrustedSource =
        normalizeSourceForMatching(
          trustedSource
        );

      return normalizedSource.includes(
        normalizedTrustedSource
      );
    }
  );
}

function isBlockedGlobalArticle(article, cleanedArticle) {
  const searchableText = [
    article.title,
    article.contentSnippet,
    article.content,
    article.creator,
    cleanedArticle.title,
    cleanedArticle.source,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const cleanedTitle = String(
    cleanedArticle.title || article.title || ""
  ).toLowerCase();

  const blockedByContent = BLOCKED_NEWS_TERMS.some((term) =>
    searchableText.includes(term)
  );

  const blockedByTitle = BLOCKED_TITLE_TERMS.some((term) =>
    cleanedTitle.includes(term)
  );

  const normalizedSource = String(
    cleanedArticle.source || ""
  ).toLowerCase();

  const blockedBySource = BLOCKED_SOURCES.some((source) => {
    if (source === "x") {
      return (
        normalizedSource === "x" ||
        normalizedSource === "x.com"
      );
    }

    return normalizedSource.includes(source);
  });

  return (
    blockedByContent ||
    blockedByTitle ||
    blockedBySource
  );
}

function isBlockedLiveHeadline(title) {
  const normalizedTitle = String(
    title || ""
  ).toLowerCase();

  return BLOCKED_LIVE_HEADLINE_TERMS.some(
    (term) => normalizedTitle.includes(term)
  );
}

function getStoryWordSet(title = "") {
  const ignoredWords = new Set([
    "the",
    "and",
    "for",
    "from",
    "with",
    "into",
    "after",
    "before",
    "again",
    "today",
    "live",
    "latest",
    "india",
    "indian",
    "market",
    "markets",
    "stock",
    "stocks",
    "share",
    "shares",
    "sensex",
    "nifty",
    "point",
    "points",
    "says",
    "amid",
    "over",
    "under",
  ]);

  return new Set(
    String(title)
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter(
        (word) =>
          word.length > 3 &&
          !ignoredWords.has(word)
      )
  );
}

function areSimilarStories(titleA, titleB) {
  const wordsA = getStoryWordSet(titleA);
  const wordsB = getStoryWordSet(titleB);

  if (wordsA.size === 0 || wordsB.size === 0) {
    return false;
  }

  const sharedWords = [...wordsA].filter((word) =>
    wordsB.has(word)
  );

  const smallerTitleSize = Math.min(
    wordsA.size,
    wordsB.size
  );

  return sharedWords.length / smallerTitleSize >= 0.55;
}

function deduplicateAndLimit(
  candidates,
  limit
) {
  const seenLinks = new Set();
  const acceptedTitles = [];

  const articles = candidates
    .sort(
      (itemA, itemB) =>
        new Date(itemB.article.pubDate) -
        new Date(itemA.article.pubDate)
    )
    .filter(({ article, cleanedArticle }) => {
      const link = String(article.link || "").trim();
      const title = String(cleanedArticle.title || "").trim();

      if (link && seenLinks.has(link)) {
        return false;
      }

      const similarStoryAlreadyAccepted =
        acceptedTitles.some((acceptedTitle) =>
          areSimilarStories(acceptedTitle, title)
        );

      if (similarStoryAlreadyAccepted) {
        return false;
      }

      if (link) {
        seenLinks.add(link);
      }

      acceptedTitles.push(title);

      return true;
    })
    .slice(0, limit);

  return articles;
}

function isRelevantToGlobalTopic(
  article,
  cleanedArticle,
  topic
) {
  const text = [
    cleanedArticle.title,
    cleanedArticle.snippet,
    article.contentSnippet,
    article.content,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const topicTerms = {
    "Energy & Crude": [
      "crude oil",
      "oil price",
      "brent",
      "wti",
      "opec",
      "opec+",
      "energy market",
      "natural gas",
      "refinery",
      "petroleum",
      "middle east",
      "strait of hormuz",
    ],

    Semiconductors: [
      "semiconductor",
      "chip",
      "chips",
      "foundry",
      "wafer",
      "lithography",
      "asml",
      "tsmc",
      "nvidia",
      "intel",
      "micron",
      "osat",
    ],

    "Artificial Intelligence": [
      "artificial intelligence",
      " ai ",
      "ai investment",
      "ai chip",
      "data centre",
      "data center",
      "machine learning",
      "generative ai",
      "large language model",
    ],

    "Central Banks": [
      "federal reserve",
      "fed rate",
      "ecb",
      "bank of england",
      "bank of japan",
      "central bank",
      "interest rate",
      "repo rate",
      "monetary policy",
      "inflation",
      "bond yield",
      "treasury yield",
      "rbi",
    ],

    "Trade & Tariffs": [
      "tariff",
      "trade war",
      "global trade",
      "trade agreement",
      "supply chain",
      "export",
      "import",
      "customs duty",
      "sanction",
      "shipping route",
    ],

    Commodities: [
      "gold price",
      "silver price",
      "copper price",
      "commodity market",
      "commodities",
      "bullion",
      "metal prices",
      "iron ore",
      "aluminium",
      "aluminum",
      "natural gas",
      "crude oil",
      "agricultural commodity",
    ],
  };

  const requiredTerms =
    topicTerms[topic] || [];
   const topicBlockedTerms = {
  "Energy & Crude": [
    "personal finance",
    "fixed deposit",
    "bank holiday",
  ],

  Semiconductors: [
    "youth address",
    "cultural youth",
    "sports",
  ],

  "Artificial Intelligence": [
    "proverb",
    "human signature",
    "creative expression",
  ],

  "Central Banks": [
    "fixed deposit investors",
    "bank holidays",
    "senior citizens",
  ],

  "Trade & Tariffs": [
    "repo rate",
    "monetary policy",
    "rbi likely",
  ],

  Commodities: [
    "gold seized",
    "gold smuggling",
    "medal",
    "boxing",
    "badminton",
  ],
};

const blockedForTopic =
  topicBlockedTerms[topic] || [];

if (
  blockedForTopic.some((term) =>
    text.includes(term)
  )
) {
  return false;
} 

  if (
    !requiredTerms.some((term) =>
      text.includes(term)
    )
  ) {
    return false;
  }

  const blockedGlobalNoiseTerms = [
    "commonwealth games",
    "badminton",
    "boxing",
    "athlete",
    "medal tally",
    "sports",
    "bank holiday",
    "fixed deposit investors",
    "senior citizens",
    "proverb of the day",
    "box office",
    "movie",
    "celebrity",
    "personal finance",
  ];

  return !blockedGlobalNoiseTerms.some(
    (term) => text.includes(term)
  );
}

async function getGlobalMarketNewsFromService() {
  const topicResults =
    await Promise.allSettled(
      GLOBAL_MARKET_TOPICS.map(
        async ({ topic, query }) => ({
          topic,
          articles:
            await fetchGlobalMarketNews(query),
        })
      )
    );

  const candidates = topicResults.flatMap(
    (result) => {
      if (result.status !== "fulfilled") {
        return [];
      }

      return result.value.articles
        .filter((article) =>
          isWithinLastDays(
            article.pubDate,
            7
          )
        )
       .map((article) => {
  const cleanedArticle =
    cleanGoogleNewsArticle(article);

 

  return {
    article,
    cleanedArticle,
    topic: result.value.topic,
  };
})
    .filter(
  ({
    article,
    cleanedArticle,
    topic,
  }) =>
    !isBlockedGlobalArticle(
      article,
      cleanedArticle
    ) &&
    isTrustedGlobalSource(
      cleanedArticle.source
    ) &&
    isRelevantToGlobalTopic(
      article,
      cleanedArticle,
      topic
    )
)


        .sort(
          (itemA, itemB) =>
            new Date(
              itemB.article.pubDate
            ) -
            new Date(
              itemA.article.pubDate
            )
        )
        .slice(0, 8);
    }
  );

  const articles = deduplicateAndLimit(
    candidates,
    32
  ).map(
    (
      {
        article,
        cleanedArticle,
        topic,
      },
      index
    ) => ({
      id:
        article.guid ||
        article.link ||
        `global-market-${index}`,

      topic,
      title: cleanedArticle.title,
      source: cleanedArticle.source,
      publishedAt: article.pubDate,
      link: article.link,

      summary: isMeaningfulSummary(
        cleanedArticle.title,
        cleanedArticle.snippet
      )
        ? cleanedArticle.snippet
        : "",
    })
  );

  return {
    range: "Last 7 days",
    articleCount: articles.length,
    articles,
  };
}

async function getVixMarketNewsFromService() {
  const topicResults =
    await Promise.allSettled(
      VIX_MARKET_TOPICS.map(
        async ({ topic, query }) => ({
          topic,
          articles:
            await fetchGlobalMarketNews(query),
        })
      )
    );

  const candidates = topicResults.flatMap(
    (result) => {
      if (result.status !== "fulfilled") {
        return [];
      }

      return result.value.articles
        .filter((article) =>
          isWithinLastDays(
            article.pubDate,
            30
          )
        )
        .map((article) => ({
          article,
          cleanedArticle:
            cleanGoogleNewsArticle(article),
          topic: result.value.topic,
        }))
        .filter(
          ({
            article,
            cleanedArticle,
          }) =>
            !isBlockedGlobalArticle(
              article,
              cleanedArticle
            ) &&
            isTrustedGlobalSource(
              cleanedArticle.source
            ) &&
            !isBlockedLiveHeadline(
              cleanedArticle.title
            )
        )
        .sort(
          (itemA, itemB) =>
            new Date(
              itemB.article.pubDate
            ) -
            new Date(
              itemA.article.pubDate
            )
        )
        .slice(0, 15);
    }
  );

  const articles = deduplicateAndLimit(
    candidates,
    25
  ).map(
    (
      {
        article,
        cleanedArticle,
        topic,
      },
      index
    ) => ({
      id:
        article.guid ||
        article.link ||
        `vix-market-${index}`,

      topic,
      title: cleanedArticle.title,
      source: cleanedArticle.source,
      publishedAt: article.pubDate,
      link: article.link,

      summary: isMeaningfulSummary(
        cleanedArticle.title,
        cleanedArticle.snippet
      )
        ? cleanedArticle.snippet
        : "",
    })
  );

  return {
    range: "Last 30 days",
    articleCount: articles.length,
    articles,
  };
}

const MARKET_SOURCE_SCORES = {
  reuters: 100,
  bloomberg: 95,
  "financial times": 90,
  cnbc: 85,
  "business standard": 80,
  "economic times": 78,
  moneycontrol: 75,
  livemint: 72,
  mint: 72,
  businessline: 70,
  "financial express": 68,
  "ndtv profit": 68,
  "yahoo finance": 60,
};

function isWithinLastDays(dateValue, numberOfDays) {
  if (!dateValue) {
    return false;
  }

  const publicationDate = new Date(dateValue);

  if (Number.isNaN(publicationDate.getTime())) {
    return false;
  }

  const now = new Date();
  const earliestDate = new Date(now);

  earliestDate.setDate(now.getDate() - numberOfDays);

  return (
    publicationDate >= earliestDate &&
    publicationDate <= now
  );
}

function getMarketArticleScore(item) {
  const source = String(
    item.cleanedArticle?.source || ""
  ).toLowerCase();

  const title = String(
    item.cleanedArticle?.title || ""
  ).toLowerCase();

  const publicationDate = new Date(
    item.article?.pubDate || 0
  );

  let score = 0;

  for (const [sourceName, sourceScore] of Object.entries(
    MARKET_SOURCE_SCORES
  )) {
    if (source.includes(sourceName)) {
      score += sourceScore;
      break;
    }
  }

  const highValueTerms = [
    "rbi",
    "sebi",
    "nifty",
    "sensex",
    "rupee",
    "inflation",
    "gdp",
    "repo rate",
    "interest rate",
    "earnings",
    "results",
    "foreign investors",
    "fii",
    "crude oil",
    "dividend",
    "buyback",
    "merger",
    "acquisition",
  ];

  score +=
    highValueTerms.filter((term) =>
      title.includes(term)
    ).length * 5;

  if (!Number.isNaN(publicationDate.getTime())) {
    const ageInHours =
      (Date.now() - publicationDate.getTime()) /
      (1000 * 60 * 60);

    score += Math.max(0, 30 - ageInHours / 24);
  }

  return score;
}

function isIndiaMarketRelevantArticle(article, cleanedArticle) {
  const title = String(
    cleanedArticle.title || ""
  ).toLowerCase();

  const combinedText = [
    cleanedArticle.title,
    cleanedArticle.snippet,
    article.contentSnippet,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const strongIndiaMarketTerms = [
    "nifty",
    "sensex",
    "dalal street",
    "bombay stock exchange",
    "national stock exchange",
    "reserve bank of india",
    "rbi",
    "sebi",
    "indian rupee",
    "fii",
    "dii",
    "foreign institutional investors",
    "reliance industries",
    "hdfc bank",
    "icici bank",
    "state bank of india",
    "tata consultancy services",
    "infosys",
    "bharti airtel",
  ];

  const indiaContextTerms = [
    "market",
    "markets",
    "stocks",
    "shares",
    "equities",
    "bonds",
    "economy",
    "inflation",
    "gdp",
    "interest rates",
    "policy",
    "banking",
    "sector",
    "earnings",
  ];

const unrelatedForeignTerms = [
  "spac deal",
  "spac merger",
  "to go public",
  "nasdaq",
  "nyse",
  "wall street",
  "eric trump",
  "donald trump",
  "space-eyes",
  "space eyes",
  "us stocks",
  "u.s. stocks",
];

  const hasStrongIndiaMarketTerm =
    strongIndiaMarketTerms.some((term) =>
      combinedText.includes(term)
    );

  const hasIndiaInTitle =
    /\b(india|indian)\b/.test(title);

  const hasMarketContextInTitle =
    indiaContextTerms.some((term) =>
      title.includes(term)
    );

  const clearlyForeignAndUnrelated =
  unrelatedForeignTerms.some((term) =>
    title.includes(term)
  );

  if (clearlyForeignAndUnrelated) {
    return false;
  }

  return (
    hasStrongIndiaMarketTerm ||
    (hasIndiaInTitle && hasMarketContextInTitle)
  );
}

function selectTopMarketArticles(candidates, limit = 15) {
  const accepted = [];
  const acceptedTitles = [];
  const topicCounts = new Map();
  const sourceCounts = new Map();

  const rankedCandidates = [...candidates].sort((itemA, itemB) => {
    const scoreDifference =
      getMarketArticleScore(itemB) -
      getMarketArticleScore(itemA);

    if (scoreDifference !== 0) {
      return scoreDifference;
    }

    return (
      new Date(itemB.article.pubDate) -
      new Date(itemA.article.pubDate)
    );
  });

  for (const item of rankedCandidates) {
    if (accepted.length >= limit) {
      break;
    }

    const title = String(
      item.cleanedArticle?.title || ""
    ).trim();

    const source = String(
      item.cleanedArticle?.source || "Unknown"
    )
      .toLowerCase()
      .trim();

    const topic = item.topic || "Market";

    const isDuplicate = acceptedTitles.some((existingTitle) =>
      areSimilarStories(existingTitle, title)
    );

    if (isDuplicate) {
      continue;
    }

    const currentTopicCount =
      topicCounts.get(topic) || 0;

    const currentSourceCount =
      sourceCounts.get(source) || 0;

    // Avoid one category or publisher dominating the strip.
    if (currentTopicCount >= 4) {
      continue;
    }

    if (currentSourceCount >= 3) {
      continue;
    }

    accepted.push(item);
    acceptedTitles.push(title);

    topicCounts.set(
      topic,
      currentTopicCount + 1
    );

    sourceCounts.set(
      source,
      currentSourceCount + 1
    );
  }

  // If strict diversity rules leave fewer than 15,
  // fill the remaining slots with the best unique stories.
  if (accepted.length < limit) {
    for (const item of rankedCandidates) {
      if (accepted.length >= limit) {
        break;
      }

      if (accepted.includes(item)) {
        continue;
      }

      const title = String(
        item.cleanedArticle?.title || ""
      ).trim();

      const isDuplicate = acceptedTitles.some((existingTitle) =>
        areSimilarStories(existingTitle, title)
      );

      if (isDuplicate) {
        continue;
      }

      accepted.push(item);
      acceptedTitles.push(title);
    }
  }

// Final fallback: if we still have fewer than the requested
// number of articles, simply add the highest-ranked remaining
// unique stories regardless of topic/source limits.
if (accepted.length < limit) {
  for (const item of rankedCandidates) {
    if (accepted.length >= limit) {
      break;
    }

    if (accepted.includes(item)) {
      continue;
    }

    const title = String(item.cleanedArticle?.title || "");

    const duplicate = accepted.some(
      (acceptedItem) =>
        areSimilarStories(
          acceptedItem.cleanedArticle.title,
          title
        )
    );

    if (duplicate) {
      continue;
    }

    accepted.push(item);
  }
}

  return accepted.slice(0, limit);
}

async function getNiftyMarketEventsFromService() {
  const topicResults =
    await Promise.allSettled(
      
      NIFTY_MARKET_TOPICS.map(
        async ({ topic, query }) => ({
          topic,
          articles:
            await fetchGlobalMarketNews(query),
        })
      )
    );
 topicResults.forEach((result, index) => {
  const topic = NIFTY_MARKET_TOPICS[index]?.topic || "Unknown";

  if (result.status === "fulfilled") {
    console.log(
      `${topic}: ${result.value.articles.length} articles`
    );
  } else {
    console.error(
      `${topic} news request failed:`,
      result.reason?.message || result.reason
    );
  }
});

  const candidates = topicResults.flatMap(
    (result) => {
      if (result.status !== "fulfilled") {
        return [];
      }
      return result.value.articles
        .filter((article) =>
          isWithinLastDays(
            article.pubDate,
            30
          )
        )
        .map((article) => ({
          article,
          cleanedArticle:
            cleanGoogleNewsArticle(article),
          topic: result.value.topic,
        }))
 .filter(
  ({
    article,
    cleanedArticle,
  }) =>
    !isBlockedGlobalArticle(
      article,
      cleanedArticle
    ) &&
    !isBlockedLiveHeadline(
      cleanedArticle.title
    ) &&
    isIndiaMarketRelevantArticle(
      article,
      cleanedArticle
    )
)
        .sort(
          (itemA, itemB) =>
            new Date(
              itemB.article.pubDate
            ) -
            new Date(
              itemA.article.pubDate
            )
        )
        .slice(0, 25);
    }
  );
console.log("Total candidates:", candidates.length);
  const selectedArticles = selectTopMarketArticles(
  candidates,
  30
);

selectedArticles.sort(
  (itemA, itemB) =>
    new Date(itemB.article.pubDate) -
    new Date(itemA.article.pubDate)
);

console.log("Selected:", selectedArticles.length);
selectedArticles.forEach((item, i) => {
  console.log(
    `${i + 1}. [${item.topic}] ${item.cleanedArticle.source} | ${item.cleanedArticle.title}`
  );
});
console.log(
  "Candidates by topic:",
  candidates.reduce((acc, item) => {
    acc[item.topic] = (acc[item.topic] || 0) + 1;
    return acc;
  }, {})
);

selectedArticles.forEach((item, index) => {
  console.log(
    `${index + 1}. [${item.topic}] ${item.cleanedArticle.source} -> ${item.cleanedArticle.title}`
  );
});

const articles = selectedArticles.map(
  ({ article, cleanedArticle, topic }, index) => ({
      id:
        article.guid ||
        article.link ||
        `nifty-market-${index}`,

      category: topic,
      title: cleanedArticle.title,
      source: cleanedArticle.source,
      publishedAt: article.pubDate,
      link: article.link,

      summary: isMeaningfulSummary(
        cleanedArticle.title,
        cleanedArticle.snippet
      )
        ? cleanedArticle.snippet
        : "",
    })
  );

  return {
    range: "Last 30 days",
    articleCount: articles.length,
    articles,
  };
}

function analyseArticle(title, snippet) {
  const text = `${title || ""} ${
    snippet || ""
  }`.toLowerCase();

  if (
    text.includes("subscriber") ||
    text.includes("customer") ||
    text.includes("user base") ||
    text.includes("market share")
  ) {
    return {
      sentiment: "Positive",
      impact: [
        "Supports recurring revenue visibility.",
        "Strengthens the company's competitive position.",
        "May improve long-term earnings potential.",
      ],
    };
  }

  if (
    text.includes("acquisition") ||
    text.includes("acquire") ||
    text.includes("merger") ||
    text.includes("stake purchase")
  ) {
    return {
      sentiment: "Neutral",
      impact: [
        "Could create strategic and operational synergies.",
        "Integration execution will be important.",
        "May affect future profitability and capital allocation.",
      ],
    };
  }

  if (
    text.includes("capacity") ||
    text.includes("plant") ||
    text.includes("factory") ||
    text.includes("expansion") ||
    text.includes("manufacturing facility")
  ) {
    return {
      sentiment: "Positive",
      impact: [
        "Expands future production capacity.",
        "Supports potential long-term revenue growth.",
        "May increase near-term capital expenditure.",
      ],
    };
  }

  if (
    text.includes("profit rises") ||
    text.includes("profit increases") ||
    text.includes("record profit") ||
    text.includes("earnings beat") ||
    text.includes("revenue rises") ||
    text.includes("revenue growth")
  ) {
    return {
      sentiment: "Positive",
      impact: [
        "Indicates improving operating performance.",
        "Could support stronger investor expectations.",
        "Margin and guidance trends remain important.",
      ],
    };
  }

  if (
    text.includes("profit falls") ||
    text.includes("profit declines") ||
    text.includes("earnings miss") ||
    text.includes("revenue falls") ||
    text.includes("revenue declines") ||
    text.includes("loss widens")
  ) {
    return {
      sentiment: "Negative",
      impact: [
        "Signals weaker recent operating performance.",
        "Could pressure investor sentiment.",
        "Future margins and management guidance should be monitored.",
      ],
    };
  }

  if (
    text.includes("order win") ||
    text.includes("wins order") ||
    text.includes("contract awarded") ||
    text.includes("new contract")
  ) {
    return {
      sentiment: "Positive",
      impact: [
        "Improves future revenue visibility.",
        "Supports the company's order book.",
        "Execution timelines and margins will determine the financial impact.",
      ],
    };
  }

  if (
    text.includes("debt") ||
    text.includes("borrowing") ||
    text.includes("loan") ||
    text.includes("refinancing")
  ) {
    return {
      sentiment: "Neutral",
      impact: [
        "May affect the company's leverage position.",
        "Interest costs and repayment terms should be monitored.",
        "Capital structure changes could influence future cash flow.",
      ],
    };
  }

  if (
    text.includes("dividend") ||
    text.includes("buyback") ||
    text.includes("share repurchase")
  ) {
    return {
      sentiment: "Positive",
      impact: [
        "Represents a direct return of capital to shareholders.",
        "May signal confidence in cash-flow generation.",
        "The effect on future capital availability should be considered.",
      ],
    };
  }

  if (
    text.includes("regulatory") ||
    text.includes("penalty") ||
    text.includes("fine") ||
    text.includes("probe") ||
    text.includes("tax demand")
  ) {
    return {
      sentiment: "Negative",
      impact: [
        "Introduces potential regulatory or financial uncertainty.",
        "Could affect costs, operations or management attention.",
        "Further disclosures should be monitored closely.",
      ],
    };
  }

  if (
    text.includes("profit") ||
    text.includes("earnings") ||
    text.includes("results") ||
    text.includes("quarter")
  ) {
    return {
      sentiment: "Neutral",
      impact: [
        "Could influence near-term investor expectations.",
        "Revenue, margin and profit trends should be reviewed.",
        "Management guidance remains important.",
      ],
    };
  }

  return {
    sentiment: "Neutral",
    impact: [
      "Monitor for further company disclosures.",
      "Assess any financial or strategic implications.",
      "Consider the development alongside broader business trends.",
    ],
  };
}

async function getCompanyNewsFromService(symbol) {
const quote = await fetchMarketData(symbol);

const companyName =
  quote?.longName ||
  quote?.shortName ||
  symbol;

  const articles =
    await fetchCompanyNews(companyName);

  const currentArticles = articles
    .filter((article) => {
      if (!article.pubDate) {
        return false;
      }

      return (
        isWithinLastDays(
          article.pubDate,
          30
        ) &&
        isRelevantArticle(article) &&
        isCompanyRelevantArticle(
          article,
          companyName,
          symbol
        )
      );
    })
    .sort(
      (articleA, articleB) =>
        new Date(articleB.pubDate) -
        new Date(articleA.pubDate)
    )
    .slice(0, 8)
    .map((article, index) => {
      const cleanedArticle =
        cleanGoogleNewsArticle(article);
       

      const analysis = analyseArticle(
        cleanedArticle.title,
        cleanedArticle.snippet
      );

      return {
        id:
          article.guid ||
          article.link ||
          `${symbol}-${index}`,

        title: cleanedArticle.title,
        source: cleanedArticle.source,
        publishedAt: article.pubDate,
        link: article.link,
        snippet: cleanedArticle.snippet,

        summary: generateSummary(
          cleanedArticle.title,
          cleanedArticle.snippet
        ),

        sentiment: analysis.sentiment,
        impact: analysis.impact,
      };
    });

  return {
    symbol: quote?.symbol || symbol,
    company: companyName,
    range: "Last 30 days",
    articleCount: currentArticles.length,
    articles: currentArticles,
  };
}

module.exports = {
  getCompanyNewsFromService,
  getGlobalMarketNewsFromService,
  getVixMarketNewsFromService,
  getNiftyMarketEventsFromService,
};