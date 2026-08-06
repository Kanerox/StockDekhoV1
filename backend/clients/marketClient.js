const {
  getYahooFinanceClient,
} = require("./yahooClient");

const FRESH_QUOTE_TTL_MS =
  10 * 60 * 1000;

const STALE_QUOTE_TTL_MS =
  6 * 60 * 60 * 1000;

const FUNDAMENTALS_TTL_MS =
  24 * 60 * 60 * 1000;

const STALE_FUNDAMENTALS_TTL_MS =
  7 * 24 * 60 * 60 * 1000;

const RATE_LIMIT_COOLDOWN_MS =
  15 * 60 * 1000;

const quoteCache = new Map();
const fundamentalsCache = new Map();

const quoteRequestsInFlight = new Map();
const fundamentalsRequestsInFlight =
  new Map();

let batchRequestInFlight = null;
let yahooBlockedUntil = 0;

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

function isRateLimitError(error) {
  const status =
    error?.response?.status ||
    error?.status ||
    error?.statusCode;

  const message = String(
    error?.message || ""
  ).toLowerCase();

  return (
    status === 429 ||
    message.includes("429") ||
    message.includes(
      "too many requests"
    ) ||
    message.includes(
      "failed to get crumb"
    )
  );
}

function startRateLimitCooldown() {
  yahooBlockedUntil =
    Date.now() +
    RATE_LIMIT_COOLDOWN_MS;

  console.warn(
    "Yahoo Finance rate limit detected. " +
      "Pausing new Yahoo requests for 15 minutes."
  );
}

function isYahooCoolingDown() {
  return Date.now() < yahooBlockedUntil;
}

async function withRetry(
  operation,
  {
    attempts = 2,
    initialDelay = 800,
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

      if (isRateLimitError(error)) {
        startRateLimitCooldown();
        throw error;
      }

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

function getStaleQuotes(symbols) {
  return symbols
    .map((symbol) =>
      getCachedValue(
        quoteCache,
        symbol,
        STALE_QUOTE_TTL_MS
      )
    )
    .filter(Boolean);
}

const fetchMarketData = async (
  symbol
) => {
  const normalizedSymbol =
    normalizeSymbol(symbol);

  const freshQuote =
    getCachedValue(
      quoteCache,
      normalizedSymbol,
      FRESH_QUOTE_TTL_MS
    );

  if (freshQuote) {
    return freshQuote;
  }

  if (isYahooCoolingDown()) {
    const staleQuote =
      getCachedValue(
        quoteCache,
        normalizedSymbol,
        STALE_QUOTE_TTL_MS
      );

    if (staleQuote) {
      return staleQuote;
    }

    throw new Error(
      "Yahoo Finance is temporarily rate limited"
    );
  }

  if (
    quoteRequestsInFlight.has(
      normalizedSymbol
    )
  ) {
    return quoteRequestsInFlight.get(
      normalizedSymbol
    );
  }

  const requestPromise = (async () => {
    try {
      const quote = await withRetry(
        () =>
          getYahooFinanceClient().quote(
            normalizedSymbol
          ),
        {
          label:
            `Yahoo quote ${normalizedSymbol}`,
        }
      );

      if (quote?.symbol) {
        saveCachedValue(
          quoteCache,
          normalizeSymbol(quote.symbol),
          quote
        );
      }

      return quote;
    } catch (error) {
      const staleQuote =
        getCachedValue(
          quoteCache,
          normalizedSymbol,
          STALE_QUOTE_TTL_MS
        );

      if (staleQuote) {
        console.warn(
          `Using stale cached quote for ${normalizedSymbol}`
        );

        return staleQuote;
      }

      throw error;
    } finally {
      quoteRequestsInFlight.delete(
        normalizedSymbol
      );
    }
  })();

  quoteRequestsInFlight.set(
    normalizedSymbol,
    requestPromise
  );

  return requestPromise;
};

const fetchMarketDataBatch = async (
  symbols
) => {
  const normalizedSymbols = [
    ...new Set(
      symbols.map(normalizeSymbol)
    ),
  ];

  const collectCachedData = () => {
    const cachedQuotes = [];
    const missingSymbols = [];

    normalizedSymbols.forEach(
      (symbol) => {
        const quote =
          getCachedValue(
            quoteCache,
            symbol,
            FRESH_QUOTE_TTL_MS
          );

        if (quote) {
          cachedQuotes.push(quote);
        } else {
          missingSymbols.push(symbol);
        }
      }
    );

    return {
      cachedQuotes,
      missingSymbols,
    };
  };

  let {
    cachedQuotes,
    missingSymbols,
  } = collectCachedData();

  if (missingSymbols.length === 0) {
    return cachedQuotes;
  }

  if (isYahooCoolingDown()) {
    const staleQuotes =
      getStaleQuotes(missingSymbols);

    if (
      cachedQuotes.length > 0 ||
      staleQuotes.length > 0
    ) {
      return [
        ...cachedQuotes,
        ...staleQuotes,
      ];
    }

    throw new Error(
      "Yahoo Finance is temporarily rate limited"
    );
  }

  // Allow only one Yahoo batch request at a time.
  // Other callers wait, then recheck the cache.
  if (batchRequestInFlight) {
    try {
      await batchRequestInFlight;
    } catch {
      // Recheck the cache below.
    }

    ({
      cachedQuotes,
      missingSymbols,
    } = collectCachedData());

    if (missingSymbols.length === 0) {
      return cachedQuotes;
    }

    if (isYahooCoolingDown()) {
      const staleQuotes =
        getStaleQuotes(missingSymbols);

      if (
        cachedQuotes.length > 0 ||
        staleQuotes.length > 0
      ) {
        return [
          ...cachedQuotes,
          ...staleQuotes,
        ];
      }

      throw new Error(
        "Yahoo Finance is temporarily rate limited"
      );
    }
  }

  batchRequestInFlight =
    (async () => {
      const result =
        await withRetry(
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
        .filter(
          (quote) =>
            quote &&
            typeof quote.symbol ===
              "string"
        )
        .forEach((quote) => {
          saveCachedValue(
            quoteCache,
            normalizeSymbol(
              quote.symbol
            ),
            quote
          );
        });

      return fetchedQuotes.filter(Boolean);
    })();

  try {
    const fetchedQuotes =
      await batchRequestInFlight;

    return [
      ...cachedQuotes,
      ...fetchedQuotes,
    ];
  } catch (error) {
    const staleQuotes =
      getStaleQuotes(missingSymbols);

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
  } finally {
    batchRequestInFlight = null;
  }
};

const fetchPeerFundamentals =
  async (symbol) => {
    const normalizedSymbol =
      normalizeSymbol(symbol);

    const cacheKey =
      `${normalizedSymbol}:financialData`;

    const freshSummary =
      getCachedValue(
        fundamentalsCache,
        cacheKey,
        FUNDAMENTALS_TTL_MS
      );

    if (freshSummary) {
      return freshSummary;
    }

    if (isYahooCoolingDown()) {
      const staleSummary =
        getCachedValue(
          fundamentalsCache,
          cacheKey,
          STALE_FUNDAMENTALS_TTL_MS
        );

      if (staleSummary) {
        return staleSummary;
      }

      throw new Error(
        "Yahoo Finance is temporarily rate limited"
      );
    }

    if (
      fundamentalsRequestsInFlight.has(
        cacheKey
      )
    ) {
      return fundamentalsRequestsInFlight.get(
        cacheKey
      );
    }

    const requestPromise =
      (async () => {
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
                attempts: 1,
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
              STALE_FUNDAMENTALS_TTL_MS
            );

          if (staleSummary) {
            console.warn(
              `Using stale fundamentals for ${normalizedSymbol}`
            );

            return staleSummary;
          }

          throw error;
        } finally {
          fundamentalsRequestsInFlight.delete(
            cacheKey
          );
        }
      })();

    fundamentalsRequestsInFlight.set(
      cacheKey,
      requestPromise
    );

    return requestPromise;
  };

module.exports = {
  fetchMarketData,
  fetchMarketDataBatch,
  fetchPeerFundamentals,
};