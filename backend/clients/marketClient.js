const {
  getYahooFinanceClient,
} = require("./yahooClient");

const FRESH_QUOTE_TTL_MS =
  60 * 1000;

const STALE_QUOTE_TTL_MS =
  15 * 60 * 1000;

const FUNDAMENTALS_TTL_MS =
  10 * 60 * 1000;

const quoteCache = new Map();
const fundamentalsCache = new Map();

function normalizeSymbol(symbol) {
  const normalized = String(
    symbol || ""
  )
    .trim()
    .toUpperCase();

  if (!normalized) {
    throw new Error(
      "A stock symbol is required"
    );
  }

  if (
    normalized.startsWith("^") ||
    normalized.endsWith(".NS") ||
    normalized.endsWith(".BO")
  ) {
    return normalized;
  }

  return `${normalized}.NS`;
}

function wait(milliseconds) {
  return new Promise((resolve) =>
    setTimeout(resolve, milliseconds)
  );
}

async function withRetry(
  operation,
  {
    attempts = 3,
    initialDelay = 700,
    label = "Yahoo Finance request",
  } = {}
) {
  let lastError;

  for (
    let attempt = 1;
    attempt <= attempts;
    attempt += 1
  ) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      console.error(
        `${label} failed on attempt ${attempt}/${attempts}:`,
        error.message
      );

      if (attempt < attempts) {
        await wait(
          initialDelay *
            Math.pow(2, attempt - 1)
        );
      }
    }
  }

  throw lastError;
}

function getCachedValue(
  cache,
  key,
  maxAge
) {
  const cached = cache.get(key);

  if (!cached) {
    return null;
  }

  if (
    Date.now() - cached.savedAt >
    maxAge
  ) {
    return null;
  }

  return cached.value;
}

function saveCachedValue(
  cache,
  key,
  value
) {
  cache.set(key, {
    value,
    savedAt: Date.now(),
  });
}

const fetchMarketData = async (
  symbol
) => {
  const normalizedSymbol =
    normalizeSymbol(symbol);

  const freshCachedQuote =
    getCachedValue(
      quoteCache,
      normalizedSymbol,
      FRESH_QUOTE_TTL_MS
    );

  if (freshCachedQuote) {
    return freshCachedQuote;
  }

  try {
    const quote = await withRetry(
      () =>
        getYahooFinanceClient().quote(
          normalizedSymbol
        ),
      {
        label: `Yahoo quote ${normalizedSymbol}`,
      }
    );

    saveCachedValue(
      quoteCache,
      normalizedSymbol,
      quote
    );

    return quote;
  } catch (error) {
    const staleCachedQuote =
      getCachedValue(
        quoteCache,
        normalizedSymbol,
        STALE_QUOTE_TTL_MS
      );

    if (staleCachedQuote) {
      console.warn(
        `Using stale cached quote for ${normalizedSymbol}`
      );

      return staleCachedQuote;
    }

    throw error;
  }
};

const fetchMarketDataBatch = async (
  symbols
) => {
  const normalizedSymbols = [
    ...new Set(
      symbols.map(normalizeSymbol)
    ),
  ];

  const cachedQuotes = [];
  const missingSymbols = [];

  normalizedSymbols.forEach(
    (symbol) => {
      const cachedQuote =
        getCachedValue(
          quoteCache,
          symbol,
          FRESH_QUOTE_TTL_MS
        );

      if (cachedQuote) {
        cachedQuotes.push(
          cachedQuote
        );
      } else {
        missingSymbols.push(symbol);
      }
    }
  );

  if (missingSymbols.length === 0) {
    return cachedQuotes;
  }

  try {
    const result = await withRetry(
      () =>
        getYahooFinanceClient().quote(
          missingSymbols
        ),
      {
        label:
          "Yahoo batch quote request",
      }
    );

    const fetchedQuotes =
      Array.isArray(result)
        ? result
        : [result];



    fetchedQuotes
      .filter(Boolean)
      .forEach((quote) => {
        if (quote.symbol) {
          saveCachedValue(
            quoteCache,
            quote.symbol,
            quote
          );
        }
      });

    return [
      ...cachedQuotes,
      ...fetchedQuotes,
    ];
  } catch (error) {
    const staleQuotes =
      missingSymbols
        .map((symbol) =>
          getCachedValue(
            quoteCache,
            symbol,
            STALE_QUOTE_TTL_MS
          )
        )
        .filter(Boolean);

    if (
      cachedQuotes.length > 0 ||
      staleQuotes.length > 0
    ) {
      console.warn(
        "Yahoo batch request failed; using cached market data."
      );

      return [
        ...cachedQuotes,
        ...staleQuotes,
      ];
    }

    throw error;
  }
};

const fetchPeerFundamentals =
  async (symbol) => {
    const normalizedSymbol =
      normalizeSymbol(symbol);

    const cacheKey =
      `${normalizedSymbol}:financialData`;

    const cachedSummary =
      getCachedValue(
        fundamentalsCache,
        cacheKey,
        FUNDAMENTALS_TTL_MS
      );

    if (cachedSummary) {
      return cachedSummary;
    }

    try {
      const summary =
        await withRetry(
          () =>
            getYahooFinanceClient()
              .quoteSummary(
                normalizedSymbol,
                {
                  modules: [
                    "financialData",
                  ],
                }
              ),
          {
            attempts: 2,
            label:
              `Yahoo fundamentals ${normalizedSymbol}`,
          }
        );

      saveCachedValue(
        fundamentalsCache,
        cacheKey,
        summary
      );

      return summary;
    } catch (error) {
      const staleSummary =
        getCachedValue(
          fundamentalsCache,
          cacheKey,
          60 * 60 * 1000
        );

      if (staleSummary) {
        console.warn(
          `Using stale fundamentals for ${normalizedSymbol}`
        );

        return staleSummary;
      }

      throw error;
    }
  };

module.exports = {
  fetchMarketData,
  fetchMarketDataBatch,
  fetchPeerFundamentals,
};