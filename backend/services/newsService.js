const {
  fetchCompanyNews,
  fetchGlobalMarketNews,
} = require("../clients/newsClient");

const {
  fetchMarketData,
} = require("../clients/marketClient");
const { getCachedValue, setCacheEntry } = require("../clients/cacheClient");
const {
  publicationIntegrity,
  isGoogleNewsWrapper,
} = require("../news/utils/publicationDate");

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
  "espncricinfo",
  "espn cricinfo",
  "cricinfo",
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
  "stock recommendation",
  "stock recommendations",
  "trading guide",
  "technical pick",
  "technical picks",
  "buy or sell",
  "buy, sell",
  "sell or hold",
  "do you own",
  "upside potential",
  "top gainers",
  "top losers",
  "leads gainers",
  "leads losers",
  "spurts",
  "straight session",
  "shares gain",
  "shares rise",
  "shares fall",
  "shares drop",
  "shares decline",
  "prefers",
  "price target",
  "raises tp",
  "cuts tp",
  "analyst picks",
  "brokerage picks",
  "trade ideas",
  "should you buy",
  "should you consider",
];

const GLOBAL_MARKET_TOPICS = [
  { topic: "US Markets", query: '("S&P 500" OR Nasdaq OR "Dow Jones") stocks' },
  { topic: "China & Hong Kong", query: '("Chinese stocks" OR "Hang Seng" OR "Shanghai Composite" OR "CSI 300")' },
  { topic: "Japan & Asia", query: '("Nikkei 225" OR KOSPI OR "Taiwan stocks") markets' },
  { topic: "European Markets", query: '("FTSE 100" OR DAX OR "EURO STOXX 50") stocks' },
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

const GLOBAL_INDEX_NEWS = {
  SP500: { topic: "S&P 500", query: '"S&P 500" index stocks', terms: ["s&p 500", "s&p500"], marketTerms: ["wall street", "us stocks", "u.s. stocks", "federal reserve", "fed"] },
  NASDAQ: { topic: "NASDAQ", query: '"Nasdaq Composite" index', terms: ["nasdaq composite", "nasdaq"], marketTerms: ["us tech stocks", "technology stocks", "wall street", "federal reserve", "fed"] },
  DOW: { topic: "Dow Jones", query: '"Dow Jones Industrial Average" index', terms: ["dow jones industrial average", "dow jones", "the dow"], marketTerms: ["wall street", "us stocks", "u.s. stocks", "federal reserve", "fed"] },
  HANGSENG: { topic: "Hang Seng", query: '"Hang Seng" index', terms: ["hang seng"], marketTerms: ["hong kong stocks", "hong kong market", "china stocks", "chinese stocks"] },
  SHANGHAI: { topic: "Shanghai Composite", query: '"Shanghai Composite" index', terms: ["shanghai composite"] },
  CSI300: { topic: "CSI 300", query: '"CSI 300" index', terms: ["csi 300", "csi300"] },
  NIKKEI225: { topic: "Nikkei 225", query: '"Nikkei 225" index', terms: ["nikkei 225", "nikkei"], marketTerms: ["japan stocks", "japanese stocks", "tokyo stocks", "bank of japan"] },
  FTSE100: { topic: "FTSE 100", query: '"FTSE 100" index', terms: ["ftse 100", "ftse"], marketTerms: ["uk stocks", "british stocks", "london stocks", "bank of england"] },
  DAX: { topic: "DAX", query: '"DAX index" Germany stocks', terms: ["dax index", "germany's dax", "german dax"], marketTerms: ["german stocks", "germany stocks", "frankfurt stocks", "ecb"] },
  EUROSTOXX50: { topic: "EURO STOXX 50", query: '"EURO STOXX 50" index', terms: ["euro stoxx 50", "stoxx 50"], marketTerms: ["euro zone stocks", "eurozone stocks", "european stocks", "ecb"] },
  KOSPI: { topic: "KOSPI", query: 'KOSPI index Korean stocks', terms: ["kospi"], marketTerms: ["south korea stocks", "korean stocks", "seoul stocks", "bank of korea"] },
  TAIWAN: { topic: "Taiwan Weighted", query: '("Taiwan Weighted" OR "Taiwan stocks" OR TAIEX) index', terms: ["taiwan weighted", "taiex", "taiwan stocks"], marketTerms: ["taiwan market", "taiwanese stocks", "taiwan semiconductor", "tsmc"] },
};

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

const GSEC_NEWS_TOPICS = [
  { topic: "Indian G-Secs", query: '("Indian government bonds" OR "India 10-year bond" OR "10-year G-sec") yield' },
  { topic: "RBI & Liquidity", query: '(RBI OR "Reserve Bank of India") ("government bonds" OR G-sec OR "bond yields" OR liquidity)' },
  { topic: "Inflation & Borrowing", query: '(India inflation OR CPI OR "government borrowing" OR "fiscal deficit") (G-sec OR "government bond yield")' },
  { topic: "Debt Flows", query: '(FPI OR "foreign flows" OR "bond index") ("Indian government bonds" OR G-sec)' },
];

const SECTOR_NEWS_CONFIG = {
  Financials: { query: '("Indian banking sector" OR "Nifty Bank" OR RBI OR "banking stocks")', terms: ["bank", "banking", "rbi", "credit", "lending", "deposit"] },
  "Information Technology": { query: '("Indian IT sector" OR "IT stocks" OR TCS OR Infosys OR Wipro) India', terms: ["information technology", "it sector", "it stocks", "software", "technology services"] },
  Energy: { query: '("Indian energy sector" OR "energy stocks" OR crude OR refinery OR Reliance OR ONGC) India', terms: ["energy", "crude", "oil", "gas", "refinery", "opec"] },
  "Consumer Staples": { query: '("Indian FMCG sector" OR "FMCG stocks" OR rural demand OR consumption) India', terms: ["fmcg", "consumer staples", "rural demand", "consumption"] },
  "Consumer Discretionary": { query: '("Indian auto sector" OR "auto stocks" OR vehicle sales OR consumer demand) India', terms: ["auto", "automobile", "vehicle", "consumer discretionary"] },
  "Health Care": { query: '("Indian pharma sector" OR "pharma stocks" OR drug approval OR healthcare) India', terms: ["pharma", "pharmaceutical", "healthcare", "drug", "hospital"] },
  Industrials: { query: '("Indian infrastructure" OR "capital goods" OR industrial stocks OR capex) India', terms: ["industrial", "infrastructure", "capital goods", "capex", "construction"] },
  Materials: { query: '("Indian metal sector" OR "metal stocks" OR steel OR aluminium OR mining) India', terms: ["metal", "steel", "aluminium", "aluminum", "mining", "materials"] },
  Utilities: { query: '("Indian power sector" OR "power stocks" OR electricity OR renewable energy) India', terms: ["power", "utility", "electricity", "renewable", "energy"] },
  "Communication Services": { query: '("Indian telecom sector" OR "telecom stocks" OR spectrum OR Bharti Airtel OR Jio) India', terms: ["telecom", "communications", "spectrum", "airtel", "jio"] },
  "Real Estate": { query: '("Indian real estate sector" OR "realty stocks" OR housing demand OR property market) India', terms: ["real estate", "realty", "property", "housing", "developer"] },
};

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
  "the globe and mail",
  "firstpost",
  "investing.com",
  "the guardian",
  "new york times",
  "wsj",
  "tradingview",
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

  const summaryBoilerplateTerms = [
    "live events as a reliable and trusted news source",
    "you can now subscribe",
    "add now",
  ];

  if (summaryBoilerplateTerms.some((term) => cleanSnippet.includes(term))) {
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

  const titleText = String(
    cleanedArticle.title || ""
  )
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const summaryText = [
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
    ).test(titleText);

  const symbolMatch =
    normalizedSymbol.length >= 4 &&
    new RegExp(
      `\\b${normalizedSymbol}\\b`,
      "i"
    ).test(titleText);

  const matchedSignificantWords =
    significantCompanyWords.filter(
      (word) =>
        new RegExp(
          `\\b${word}\\b`,
          "i"
        ).test(titleText)
      );

  const companyNameWords =
    normalizedCompanyName
      .split(" ")
      .filter(Boolean);

  const strongWordMatch =
    significantCompanyWords.length === 1 &&
    companyNameWords.length === 1
      ? matchedSignificantWords.length === 1
      : significantCompanyWords.length >= 2 &&
        matchedSignificantWords.length >= 2;

  const companyPattern = normalizedCompanyName
    .split(/\s+/)
    .join("\\s+");

  const relationshipMatch =
    Boolean(companyPattern) &&
    new RegExp(
      `(?:part\\s+of|subsidiary\\s+of|unit\\s+of|arm\\s+of|owned\\s+by)\\s+(?:the\\s+)?${companyPattern}|${companyPattern}\\s+(?:subsidiary|unit|arm)`,
      "i"
    ).test(summaryText);

  return (
    fullCompanyMatch ||
    symbolMatch ||
    strongWordMatch ||
    relationshipMatch
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

function isAccessibleNewsSource(source) {
  const normalized = normalizeSourceForMatching(source);
  const subscriptionFirstSources = [
    "bloomberg", "financial times", "wall street journal", "wsj",
    "business standard", "economic times", "livemint", "mint",
    "new york times", "the globe and mail",
  ];
  return !subscriptionFirstSources.some((blocked) => normalized.includes(blocked));
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

  return /^(list of|top\s+\d+)\b.*\bstocks?\b/.test(normalizedTitle) || BLOCKED_LIVE_HEADLINE_TERMS.some(
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
      .map((word) => {
        if (word.endsWith("ies") && word.length > 5) {
          return `${word.slice(0, -3)}y`;
        }

        if (
          word.endsWith("s") &&
          !word.endsWith("ss") &&
          word.length > 4
        ) {
          return word.slice(0, -1);
        }

        return word;
      })
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

function storyEventCategory(title = "") {
  const value = String(title).toLowerCase();
  const categories = [
    ["leadership-change", /(ceo|chief executive|chairman|boss|jagdishan).*(leave|leaving|retire|retirement|resign|resignation|reappoint|successor|succession|steps? down|opts? out|departure|final chapter|era|years|way out)|(?:leave|retire|resign|reappoint|successor|succession|steps? down|opts? out|departure|final chapter|way out).*(ceo|chief executive|chairman|boss|jagdishan)/],
    ["earnings", /(earnings|quarterly results|profit|revenue|guidance)/],
    ["corporate-action", /(merger|acquisition|buyback|dividend|stake sale)/],
    ["policy-rates", /(interest rate|repo rate|monetary policy|rate cut|rate hike)/],
    ["exchange-price-gap", /(bank|banking).*(auction|price gap)|(?:auction|price gap).*(bank|banking)/],
    ["market-close", /(closing bell|market close|ends?|settles?).*(nifty|sensex|stocks?|shares?)/],
  ];
  return categories.find(([, pattern]) => pattern.test(value))?.[0] || null;
}

function areSameEvent(titleA, titleB) {
  if (areSimilarStories(titleA, titleB)) return true;
  const categoryA = storyEventCategory(titleA);
  const categoryB = storyEventCategory(titleB);
  if (!categoryA || categoryA !== categoryB) return false;
  if (categoryA === "exchange-price-gap") return true;
  const wordsA = getStoryWordSet(titleA);
  const wordsB = getStoryWordSet(titleB);
  const shared = [...wordsA].filter((word) => wordsB.has(word));
  return shared.length >= 2;
}

function normalizePublicationCandidate(article) {
  const integrity = publicationIntegrity(article);
  if (!integrity.valid) return null;
  if (isGoogleNewsWrapper(article)) {
    return {
      ...article,
      pubDate: null,
      recencyAt: integrity.publishedAt,
      publicationDateSource: "unverified_google_news_listing",
    };
  }
  return {
    ...article,
    pubDate: integrity.publishedAt,
    publicationDateSource: integrity.reason,
  };
}

function articleRecencyValue(article) {
  return article?.pubDate || article?.recencyAt || null;
}

function publicationPresentation(article) {
  return {
    publishedAt: article?.pubDate || null,
    recencyAt: articleRecencyValue(article),
    publicationDateStatus: article?.publicationDateSource || null,
  };
}

function sourceIdentity(article, cleanedArticle) {
  return normalizeSourceForMatching(
    cleanedArticle?.source || article?.source || article?.creator || "unknown"
  );
}

function retainPublicationReliableCandidates(candidates = [], { allowValidatedWrappers = false } = {}) {
  const normalized = candidates
    .map((item) => {
      const article = normalizePublicationCandidate(item.article);
      return article ? { ...item, article } : null;
    })
    .filter(Boolean);

  if (allowValidatedWrappers) return normalized;
  return normalized.filter((item) => {
    if (!isGoogleNewsWrapper(item.article)) return true;
    const source = sourceIdentity(item.article, item.cleanedArticle);
    return normalized.some((other) =>
      other !== item &&
      sourceIdentity(other.article, other.cleanedArticle) !== source &&
      areSameEvent(item.cleanedArticle?.title, other.cleanedArticle?.title)
    );
  });
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
        (Number(itemB.relevanceScore || 0) - Number(itemA.relevanceScore || 0)) ||
        (new Date(articleRecencyValue(itemB.article) || 0) -
          new Date(articleRecencyValue(itemA.article) || 0))
    )
    .filter(({ article, cleanedArticle }) => {
      const link = String(article.link || "").trim();
      const title = String(cleanedArticle.title || "").trim();

      if (link && seenLinks.has(link)) {
        return false;
      }

      const similarStoryAlreadyAccepted =
        acceptedTitles.some((acceptedTitle) =>
          areSameEvent(acceptedTitle, title)
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
  const titleText = String(
    cleanedArticle.title || ""
  ).toLowerCase();

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
    "US Markets": [
      "s&p 500",
      "s&p500",
      "nasdaq",
      "dow jones",
      "wall street",
      "us stocks",
      "u.s. stocks",
    ],

    "China & Hong Kong": [
      "chinese stocks",
      "china stocks",
      "hang seng",
      "hong kong stocks",
      "shanghai composite",
      "csi 300",
    ],

    "Japan & Asia": [
      "nikkei 225",
      "nikkei",
      "kospi",
      "taiwan stocks",
      "taiex",
      "asian stocks",
      "asia markets",
    ],

    "European Markets": [
      "ftse 100",
      "ftse",
      "dax",
      "euro stoxx 50",
      "stoxx 50",
      "european stocks",
      "european markets",
    ],

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

  const containsTerm = (value, term) => {
    const escapedTerm = String(term)
      .trim()
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      .replace(/\\ /g, "\\s+");

    return new RegExp(
      `(^|[^a-z0-9])${escapedTerm}([^a-z0-9]|$)`,
      "i"
    ).test(value);
  };

  const hasTopicTermInTitle = requiredTerms.some((term) =>
    containsTerm(titleText, term)
  );

  const marketContextTerms = [
    "market",
    "markets",
    "stock",
    "stocks",
    "share",
    "shares",
    "investment",
    "investors",
    "spending",
    "trade",
    "tariff",
    "price",
    "prices",
    "rate",
    "rates",
    "yield",
    "economy",
    "economic",
    "earnings",
    "revenue",
    "profit",
  ];

  const hasMarketContext = marketContextTerms.some(
    (term) => containsTerm(text, term)
  );

  if (!hasTopicTermInTitle || !hasMarketContext) {
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
    "gold rate today",
    "gold, silver prices today",
    "term insurance",
    "bigger loan",
    "loan offers",
    "premature redemption",
    "warm-up match",
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
            14
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
    isAccessibleNewsSource(cleanedArticle.source) &&
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
    retainPublicationReliableCandidates(candidates, { allowValidatedWrappers: true })
      .sort((a, b) => new Date(articleRecencyValue(b.article) || 0) - new Date(articleRecencyValue(a.article) || 0)),
    Math.max(candidates.length, 1)
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
      ...publicationPresentation(article),
      link: article.link,

      summary: isMeaningfulSummary(
        cleanedArticle.title,
        cleanedArticle.snippet
      )
        ? cleanedArticle.snippet
        : "",
    })
  );

  return retainStableEditorialResult("news-editorial:global-markets:v1", {
    range: "Last 14 days",
    articleCount: articles.length,
    articles,
  });
}

function isRelevantToVixTopic(article, cleanedArticle, topic) {
  const title = String(
    cleanedArticle.title || ""
  ).toLowerCase();

  const text = [
    cleanedArticle.title,
    cleanedArticle.snippet,
    article.contentSnippet,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const blockedNoiseTerms = [
    "warm-up match",
    "cricket",
    "football",
    "term insurance",
    "personal finance",
    "premature redemption",
    "bank holiday",
    "political party",
    "organisational units",
    "loan recovery",
    "mobile phones",
    "laptop",
    "wealth trick",
    "aiff",
  ];

  if (blockedNoiseTerms.some((term) => text.includes(term))) {
    return false;
  }

  const topicTerms = {
    "Market Volatility": [
      "india vix", "volatility", "nifty", "sensex", "stock market", "equities",
    ],
    "Global Risk": [
      "global markets", "stocks", "dow", "s&p", "kospi", "dollar", "bonds", "selloff", "volatility",
    ],
    "Central Banks": [
      "interest rate", "repo rate", "monetary policy", "liquidity", "inflation", "fcnr", "rupee", "bond yield",
    ],
    "Foreign Flows": [
      "fii", "foreign investor", "foreign money", "capital flow", "inflows", "outflows",
    ],
    "Crude & Rupee": [
      "crude", "oil", "rupee", "hormuz", "opec",
    ],
    Earnings: [
      "earnings", "results", "profit", "revenue", "guidance", "shares",
    ],
    "Policy & Economy": [
      "inflation", "gdp", "budget", "tariff", "economy", "economic policy",
    ],
    "Options Market": [
      "options", "derivatives", "f&o", "futures", "option premiums",
    ],
  };

  const requiredTerms = topicTerms[topic] || [];
  const hasTopicTerm = requiredTerms.some((term) =>
    title.includes(term)
  );

  const marketContextTerms = [
    "market", "markets", "stock", "stocks", "share", "shares", "nifty", "sensex",
    "investor", "investment", "trader", "fii", "rupee", "rate", "yield", "inflow",
  ];

  return (
    hasTopicTerm &&
    marketContextTerms.some((term) => title.includes(term))
  );
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
            topic,
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
            ) &&
            isRelevantToVixTopic(
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
        .slice(0, 15);
    }
  );

  const articles = deduplicateAndLimit(
    retainPublicationReliableCandidates(candidates),
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
      ...publicationPresentation(article),
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

function indiaDateKey(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function recentMarketNewsDay(value, now = new Date()) {
  const publicationDate = new Date(value);
  if (Number.isNaN(publicationDate.getTime()) || publicationDate > now) {
    return null;
  }
  const today = indiaDateKey(now);
  const yesterday = indiaDateKey(now.getTime() - 24 * 60 * 60 * 1000);
  const articleDay = indiaDateKey(publicationDate);
  if (articleDay === today) return "today";
  if (articleDay === yesterday) return "yesterday";
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
  }).format(now);
  const weekendBridgeDays = weekday === "Sun" ? 2 : weekday === "Mon" ? 3 : 0;
  if (weekendBridgeDays > 0) {
    const earliest = indiaDateKey(now.getTime() - weekendBridgeDays * 24 * 60 * 60 * 1000);
    if (articleDay >= earliest && articleDay < yesterday) return "previous_session";
  }
  return null;
}

function isPlausibleMarketPublication(article, cleanedArticle) {
  const publicationDate = new Date(article?.pubDate);
  if (Number.isNaN(publicationDate.getTime())) return false;
  const title = String(cleanedArticle?.title || "").toLowerCase();
  const hour = Number(new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    hourCycle: "h23",
  }).format(publicationDate));
  const claimsMarketClose = /\b(closing|closing bell|ends?|settles?|final bell)\b/.test(title);
  if (claimsMarketClose && hour < 15) return false;

  const monthNumbers = {
    jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
    jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
  };
  const titleDate = title.match(
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})\b/
  ) || title.match(
    /\b(\d{1,2})\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/
  );
  if (titleDate) {
    const monthFirst = Number.isNaN(Number(titleDate[1]));
    const monthName = monthFirst ? titleDate[1] : titleDate[2];
    const day = Number(monthFirst ? titleDate[2] : titleDate[1]);
    const publicationParts = Object.fromEntries(
      new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Kolkata",
        month: "numeric",
        day: "numeric",
      }).formatToParts(publicationDate).map((part) => [part.type, part.value])
    );
    if (monthNumbers[monthName.slice(0, 3)] !== Number(publicationParts.month) ||
        day !== Number(publicationParts.day)) {
      return false;
    }
  }
  return true;
}

function isMarketMovementArticle(article, cleanedArticle) {
  const title = String(
    cleanedArticle?.title || article?.title || ""
  ).toLowerCase();

  // These can be useful on sector, company and topic-search pages, but they do
  // not explain an observed move in the current market session.
  const nonMovementPatterns = [
    /\btop\s+\d+\b.*\bstocks?\b/,
    /\b\d+\s+.*\bstocks?\s+in\s+india\b/,
    /\bstocks?\s+to\s+(?:buy|watch|own)\b/,
    /\bwhich\s+.*\bstock\b/,
    /\b[a-z0-9&.-]+\s+vs\.?\s+[a-z0-9&.-]+\b/,
    /\bbest\s+.*\bstocks?\b/,
    /\bportfolio\s+(?:pick|picks|ideas?)\b/,
    /\bpositioned\s+for\b/,
  ];

  return !nonMovementPatterns.some((pattern) => pattern.test(title));
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
      areSameEvent(existingTitle, title)
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
        areSameEvent(existingTitle, title)
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
        areSameEvent(
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

function getCompanyArticleScore(item) {
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

  const materialCompanyTerms = [
    "earnings",
    "results",
    "profit",
    "revenue",
    "guidance",
    "order",
    "contract",
    "acquisition",
    "merger",
    "dividend",
    "buyback",
    "regulatory",
    "sebi",
    "rbi",
    "capacity",
    "investment",
  ];

  score +=
    materialCompanyTerms.filter((term) =>
      title.includes(term)
    ).length * 6;

  if (
    isMeaningfulSummary(
      item.cleanedArticle?.title,
      item.cleanedArticle?.snippet
    )
  ) {
    score += 8;
  }

  if (!Number.isNaN(publicationDate.getTime())) {
    const ageInDays =
      (Date.now() - publicationDate.getTime()) /
      (1000 * 60 * 60 * 24);

    score += Math.max(0, 20 - ageInDays);
  }

  return score;
}

function selectCompanyArticles(candidates, limit = 8) {
  const rankedCandidates = [...candidates].sort(
    (itemA, itemB) => {
      const scoreDifference =
        getCompanyArticleScore(itemB) -
        getCompanyArticleScore(itemA);

      if (scoreDifference !== 0) {
        return scoreDifference;
      }

      return (
        new Date(itemB.article.pubDate) -
        new Date(itemA.article.pubDate)
      );
    }
  );

  const selected = [];
  const selectedTitles = [];
  const seenLinks = new Set();
  const sourceCounts = new Map();

  function trySelect(item, enforceSourceDiversity) {
    const title = String(
      item.cleanedArticle?.title || ""
    ).trim();

    const link = String(
      item.article?.link || ""
    ).trim();

    const source = normalizeSourceForMatching(
      item.cleanedArticle?.source || "unknown"
    );

    if (!title || (link && seenLinks.has(link))) {
      return false;
    }

    if (
      selectedTitles.some((acceptedTitle) =>
        areSameEvent(acceptedTitle, title)
      )
    ) {
      return false;
    }

    if (
      enforceSourceDiversity &&
      (sourceCounts.get(source) || 0) >= 3
    ) {
      return false;
    }

    selected.push(item);
    selectedTitles.push(title);

    if (link) {
      seenLinks.add(link);
    }

    sourceCounts.set(
      source,
      (sourceCounts.get(source) || 0) + 1
    );

    return true;
  }

  for (const item of rankedCandidates) {
    if (selected.length >= limit) break;
    trySelect(item, true);
  }

  for (const item of rankedCandidates) {
    if (selected.length >= limit) break;
    if (selected.includes(item)) continue;
    trySelect(item, false);
  }

  return selected;
}

const MARKET_EVENTS_RESULT_CACHE_KEY = "news-editorial:market-events:v6";
const LEGACY_MARKET_EVENTS_RESULT_CACHE_KEYS = [
  "news-editorial:market-events:v5",
  "news-editorial:market-events:v4",
  "news-editorial:market-events:v3",
];
const EDITORIAL_RESULT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

function presentStableMarketEvents(result) {
  const accepted = [];
  for (const article of result?.articles || []) {
    if (!accepted.some((item) => areSameEvent(item.title, article.title))) {
      accepted.push(article);
    }
  }
  const educational = /^(?:list\s+of|top\s+\d+)\b.*\bstocks?\b/i;
  accepted.sort((articleA, articleB) =>
    Number(educational.test(articleA.title)) - Number(educational.test(articleB.title))
  );
  return { ...result, articles: accepted, articleCount: accepted.length };
}

function mergeEditorialResults(nextResult, previousResult) {
  const merged = [];
  for (const article of [
    ...(nextResult?.articles || []),
    ...(previousResult?.articles || []),
  ]) {
    const duplicate = merged.some((accepted) =>
      (article.link && accepted.link === article.link) ||
      areSameEvent(accepted.title, article.title)
    );
    if (!duplicate) merged.push(article);
  }
  return {
    ...nextResult,
    articles: merged,
    articleCount: merged.length,
  };
}

function newestEditorialTimestamp(result) {
  return Math.max(0, ...(result?.articles || []).map((article) => {
    const value = new Date(article.recencyAt || article.publishedAt || 0).getTime();
    return Number.isFinite(value) ? value : 0;
  }));
}

function shouldPreserveStrongerRetainedSet(nextResult, previousResult) {
  const previousNewest = newestEditorialTimestamp(previousResult);
  const nextNewest = newestEditorialTimestamp(nextResult);
  return previousNewest > 0 && nextNewest > 0 && previousNewest - nextNewest > 6 * 60 * 60 * 1000;
}

async function retainStableEditorialResult(cacheKey, nextResult, fallbackCacheKeys = []) {
  const retainedResults = await Promise.all([
    getCachedValue(cacheKey, EDITORIAL_RESULT_RETENTION_MS),
    ...fallbackCacheKeys.map((key) => getCachedValue(key, EDITORIAL_RESULT_RETENTION_MS)),
  ]);
  const previous = retainedResults
    .filter((result) => Array.isArray(result?.articles))
    .sort((a, b) => b.articles.length - a.articles.length)[0] || null;
  const previousCount = previous?.articles?.length || 0;
  const nextCount = nextResult?.articles?.length || 0;
  const collapsed = previousCount >= 5 && nextCount < Math.ceil(previousCount * 0.6);
  const regressed = shouldPreserveStrongerRetainedSet(nextResult, previous);
  const selected = collapsed
    ? mergeEditorialResults(nextResult, previous)
    : regressed
      ? mergeEditorialResults(previous, nextResult)
      : nextResult;
  await setCacheEntry(cacheKey, selected, EDITORIAL_RESULT_RETENTION_MS);
  return selected;
}

async function getNiftyMarketEventsFromService() {
  const cachedResult = await getCachedValue(MARKET_EVENTS_RESULT_CACHE_KEY, 30 * 60 * 1000);
  if (cachedResult) return presentStableMarketEvents(cachedResult);
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
  const candidates = topicResults.flatMap(
    (result) => {
      if (result.status !== "fulfilled") {
        return [];
      }
      return result.value.articles
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
    ) &&
    isMarketMovementArticle(
      article,
      cleanedArticle
    ) &&
    isPlausibleMarketPublication(article, cleanedArticle)
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
  const reliableCandidates = retainPublicationReliableCandidates(candidates)
    .filter(({ article }) => recentMarketNewsDay(articleRecencyValue(article)));
  const todayCandidates = reliableCandidates.filter(
    ({ article }) => recentMarketNewsDay(articleRecencyValue(article)) === "today"
  );
  const yesterdayCandidates = reliableCandidates.filter(
    ({ article }) => recentMarketNewsDay(articleRecencyValue(article)) === "yesterday"
  );
  const previousSessionCandidates = reliableCandidates.filter(
    ({ article }) => recentMarketNewsDay(articleRecencyValue(article)) === "previous_session"
  );
  const selectedArticles = selectTopMarketArticles([
    ...todayCandidates,
    ...yesterdayCandidates,
    ...previousSessionCandidates,
  ], 30);

selectedArticles.sort(
  (itemA, itemB) =>
    new Date(articleRecencyValue(itemB.article) || 0) -
    new Date(articleRecencyValue(itemA.article) || 0)
);

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
      recencyAt: articleRecencyValue(article),
      publicationDateStatus: article.publicationDateSource,
      link: article.link,

      summary: isMeaningfulSummary(
        cleanedArticle.title,
        cleanedArticle.snippet
      )
        ? cleanedArticle.snippet
        : "",
    })
  );

  const retained = await retainStableEditorialResult(MARKET_EVENTS_RESULT_CACHE_KEY, {
    range: "Recent market sessions",
    articleCount: articles.length,
    articles,
  }, LEGACY_MARKET_EVENTS_RESULT_CACHE_KEYS);
  return presentStableMarketEvents(retained);
}

function analyseArticle(title, snippet) {
  const text = `${title || ""} ${
    snippet || ""
  }`.toLowerCase();

  const hasPhrase = (phrase) => {
    const escapedPhrase = String(phrase)
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      .replace(/\s+/g, "\\s+");

    return new RegExp(
      `(^|[^a-z0-9])${escapedPhrase}([^a-z0-9]|$)`,
      "i"
    ).test(text);
  };

  const hasAnyPhrase = (phrases) =>
    phrases.some(hasPhrase);

  if (
    hasAnyPhrase([
      "subscriber growth",
      "subscriber additions",
      "customer growth",
      "adds customers",
      "user base grows",
      "market share gains",
      "market share rises",
    ])
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
    hasAnyPhrase([
      "acquisition",
      "acquire",
      "merger",
      "stake purchase",
    ])
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
    hasAnyPhrase([
      "capacity expansion",
      "new plant",
      "new factory",
      "manufacturing facility",
    ])
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
    hasAnyPhrase([
      "profit rises",
      "profit increases",
      "record profit",
      "earnings beat",
      "revenue rises",
      "revenue growth",
    ])
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
    hasAnyPhrase([
      "profit falls",
      "profit declines",
      "earnings miss",
      "revenue falls",
      "revenue declines",
      "loss widens",
    ])
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
    hasAnyPhrase([
      "order win",
      "wins order",
      "contract awarded",
      "new contract",
    ])
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
    hasAnyPhrase([
      "debt",
      "borrowing",
      "loan",
      "refinancing",
    ])
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
    hasAnyPhrase([
      "dividend",
      "buyback",
      "share repurchase",
    ])
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
    hasAnyPhrase([
      "regulatory",
      "penalty",
      "fine",
      "probe",
      "tax demand",
    ])
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
    hasAnyPhrase([
      "profit",
      "earnings",
      "results",
      "quarter",
    ])
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

  const candidates = articles
    .filter((article) => {
      if (!article.pubDate) {
        return false;
      }

      return (
        isWithinLastDays(
          article.pubDate,
          14
        ) &&
        isRelevantArticle(article) &&
        isCompanyRelevantArticle(
          article,
          companyName,
          symbol
        ) &&
        isAccessibleNewsSource(cleanGoogleNewsArticle(article).source)
      );
    })
    .map((article) => ({
      article,
      cleanedArticle:
        cleanGoogleNewsArticle(article),
    }));

  const currentArticles = selectCompanyArticles(
    retainPublicationReliableCandidates(candidates),
    8
  ).map(({ article, cleanedArticle }, index) => {

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
        ...publicationPresentation(article),
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
    range: "Last 14 days",
    articleCount: currentArticles.length,
    articles: currentArticles,
  };
}

function isRelevantToIndiaGsec(article, cleanedArticle) {
  const text = [cleanedArticle.title, cleanedArticle.snippet, article.contentSnippet, article.content]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const indiaContext = /\b(india|indian|rbi|reserve bank of india|goi)\b/.test(text);
  const directBondContext = /(g[ -]?sec|government securit|sovereign bond|government bond|bond yield|10[ -]?year yield|10[ -]?year bond)/.test(text);
  const movementContext = /(yield|auction|borrowing|liquidity|repo rate|monetary policy|inflation|cpi|fiscal deficit|bond index|foreign flow|treasury yield)/.test(text);
  return indiaContext && directBondContext && movementContext;
}

async function getIndiaGsecNewsFromService() {
  const topicResults = await Promise.allSettled(
    GSEC_NEWS_TOPICS.map(async ({ topic, query }) => ({ topic, articles: await fetchGlobalMarketNews(query) }))
  );
  const candidates = topicResults.flatMap((result) => {
    if (result.status !== "fulfilled") return [];
    return result.value.articles
      .filter((article) => isWithinLastDays(article.pubDate, 15))
      .map((article) => ({ article, cleanedArticle: cleanGoogleNewsArticle(article), topic: result.value.topic }))
      .filter(({ article, cleanedArticle }) =>
        !isBlockedGlobalArticle(article, cleanedArticle) &&
        isTrustedGlobalSource(cleanedArticle.source) &&
        isAccessibleNewsSource(cleanedArticle.source) &&
        isRelevantToIndiaGsec(article, cleanedArticle)
      );
  });
  const articles = deduplicateAndLimit(retainPublicationReliableCandidates(candidates), 15).map(({ article, cleanedArticle, topic }, index) => ({
    id: article.guid || article.link || `india-gsec-${index}`,
    topic,
    title: cleanedArticle.title,
    source: cleanedArticle.source,
    ...publicationPresentation(article),
    link: article.link,
    summary: isMeaningfulSummary(cleanedArticle.title, cleanedArticle.snippet) ? cleanedArticle.snippet : "",
  }));
  return { range: "Last 15 days", articleCount: articles.length, articles };
}

function rankGlobalIndexCandidates(fetched, config) {
  return fetched
    .filter((article) => isWithinLastDays(article.pubDate, 15))
    .map((article) => ({ article, cleanedArticle: cleanGoogleNewsArticle(article), topic: config.topic }))
    .filter(({ article, cleanedArticle }) =>
      !isBlockedGlobalArticle(article, cleanedArticle) &&
      isAccessibleNewsSource(cleanedArticle.source)
    )
    .map((item) => {
      const title = String(item.cleanedArticle.title || "").toLowerCase();
      const text = [title, item.cleanedArticle.snippet, item.article.contentSnippet]
        .filter(Boolean).join(" ").toLowerCase();
      const directTitle = config.terms.some((term) => title.includes(term));
      const directContext = config.terms.some((term) => text.includes(term));
      const marketContext = (config.marketTerms || []).some((term) => text.includes(term));
      const movementContext = /(rise|gain|advance|fall|drop|decline|rally|slide|selloff|record|close|open|futures|session|market|index|fed|inflation|tariff|rate|yield|earnings|central bank)/.test(text);
      return {
        ...item,
        relevanceScore: directTitle ? 100 : directContext ? 80 : marketContext && movementContext ? 55 : 0,
      };
    })
    .filter((item) => item.relevanceScore > 0)
    .sort((a, b) => b.relevanceScore - a.relevanceScore || new Date(b.article.pubDate) - new Date(a.article.pubDate));
}

async function getGlobalIndexNewsFromService(key) {
  const config = GLOBAL_INDEX_NEWS[String(key || "").toUpperCase()];
  if (!config) throw new Error("Unknown global index");
  const fetched = await fetchGlobalMarketNews(config.query);
  const candidates = rankGlobalIndexCandidates(fetched, config);
  const articles = deduplicateAndLimit(
    retainPublicationReliableCandidates(candidates, { allowValidatedWrappers: true }),
    Math.max(candidates.length, 1)
  ).map(({ article, cleanedArticle, topic }, index) => ({
    id: article.guid || article.link || `global-index-${key}-${index}`,
    topic,
    title: cleanedArticle.title,
    source: cleanedArticle.source,
    ...publicationPresentation(article),
    link: article.link,
    summary: isMeaningfulSummary(cleanedArticle.title, cleanedArticle.snippet) ? cleanedArticle.snippet : "",
  }));
  return retainStableEditorialResult(`news-editorial:global-index:${String(key).toUpperCase()}:v1`, {
    key: String(key).toUpperCase(), range: "Last 15 days", articleCount: articles.length, articles,
  });
}

async function getSectorNewsFromService(key) {
  const sectorKey = Object.keys(SECTOR_NEWS_CONFIG).find(
    (name) => name.toLowerCase() === String(key || "").toLowerCase()
  );
  const config = sectorKey ? SECTOR_NEWS_CONFIG[sectorKey] : null;
  if (!config) throw new Error("Unknown sector");
  const fetched = await fetchGlobalMarketNews(config.query);
  const macroTerms = ["rbi", "sebi", "policy", "regulation", "budget", "tariff", "inflation", "interest rate", "government"];
  const candidates = fetched
    .filter((article) => isWithinLastDays(article.pubDate, 15))
    .map((article) => ({ article, cleanedArticle: cleanGoogleNewsArticle(article), topic: sectorKey }))
    .filter(({ article, cleanedArticle }) =>
      !isBlockedGlobalArticle(article, cleanedArticle) &&
      isAccessibleNewsSource(cleanedArticle.source)
    )
    .map((item) => {
      const title = String(item.cleanedArticle.title || "").toLowerCase();
      const text = [title, item.cleanedArticle.snippet, item.article.contentSnippet]
        .filter(Boolean).join(" ").toLowerCase();
      const sectorMatches = config.terms.filter((term) => text.includes(term)).length;
      const industryWide = /(sector|industry|stocks|companies|demand|sales|output|capacity)/.test(title) && sectorMatches > 0;
      const macroRelevant = macroTerms.some((term) => title.includes(term)) && sectorMatches > 0;
      const relevanceScore = industryWide ? 100 : macroRelevant ? 85 : sectorMatches >= 2 ? 70 : sectorMatches === 1 ? 45 : 0;
      return { ...item, relevanceScore };
    })
    .filter((item) => item.relevanceScore > 0);
  const articles = deduplicateAndLimit(
    retainPublicationReliableCandidates(candidates, { allowValidatedWrappers: true }),
    Math.max(candidates.length, 1)
  )
    .map(({ article, cleanedArticle, topic }, index) => ({
      id: article.guid || article.link || `sector-${sectorKey}-${index}`,
      topic,
      title: cleanedArticle.title,
      source: cleanedArticle.source,
      ...publicationPresentation(article),
      link: article.link,
      summary: isMeaningfulSummary(cleanedArticle.title, cleanedArticle.snippet) ? cleanedArticle.snippet : "",
    }));
  return retainStableEditorialResult(`news-editorial:sector:${sectorKey}:v1`, {
    sector: sectorKey, range: "Last 15 days", articleCount: articles.length, articles,
  });
}

module.exports = {
  getCompanyNewsFromService,
  getGlobalMarketNewsFromService,
  getVixMarketNewsFromService,
  getNiftyMarketEventsFromService,
  getIndiaGsecNewsFromService,
  getGlobalIndexNewsFromService,
  getSectorNewsFromService,
  _test: {
    areSameEvent,
    deduplicateAndLimit,
    isBlockedGlobalArticle,
    isBlockedLiveHeadline,
    rankGlobalIndexCandidates,
    recentMarketNewsDay,
    selectTopMarketArticles,
    mergeEditorialResults,
    newestEditorialTimestamp,
    shouldPreserveStrongerRetainedSet,
    retainPublicationReliableCandidates,
    retainStableEditorialResult,
  },
};
