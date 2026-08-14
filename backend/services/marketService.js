const {
  fetchMarketData,
  fetchMarketDataBatch,
  fetchPeerFundamentals,
} = require("../clients/marketClient");
const { fetchHistoricalPrices } = require("../clients/historyClient");
const {
  getMarketDataProviderName,
} = require("../providers/marketData");

const getMarketData = () => {
  return {
    status: "StockDekho Backend is running!",
  };
};

const getStockDataFromService = async (symbol) => {
  const quote = await fetchMarketData(symbol);

  return {
    symbol: quote.symbol,
    company: quote.longName || quote.shortName || symbol,

    price: quote.regularMarketPrice,
    previousClose: quote.regularMarketPreviousClose,
    changePercent: quote.regularMarketChangePercent,

    open: quote.regularMarketOpen,

    dayHigh: quote.regularMarketDayHigh,
    dayLow: quote.regularMarketDayLow,

    fiftyTwoWeekHigh: quote.fiftyTwoWeekHigh,
    fiftyTwoWeekLow: quote.fiftyTwoWeekLow,

    volume: quote.regularMarketVolume,
    averageVolume: quote.averageDailyVolume3Month,

    marketCap: quote.marketCap,

    trailingPE: quote.trailingPE,
    trailingEps: quote.epsTrailingTwelveMonths,
    dividendYield: quote.dividendYield,

    exchange: quote.fullExchangeName,
    currency: quote.currency,
    asOf: quote.regularMarketTime || null,
    dataProvider: getMarketDataProviderName(),
  };
};

function valueOrNull(value) {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : null;
}

const getPeerComparisonFromService = async (symbols) => {
  const uniqueSymbols = [...new Set(
    symbols
      .map((symbol) => String(symbol || "").trim().toUpperCase())
      .filter(Boolean)
  )].slice(0, 200);

  if (uniqueSymbols.length === 0) {
    throw new Error("At least one peer symbol is required");
  }

  const quotes = await fetchMarketDataBatch(uniqueSymbols);
  const quoteByTicker = new Map(
    quotes.map((quote) => [tickerFromYahooSymbol(quote.symbol), quote])
  );

  return Promise.all(
    uniqueSymbols.map(async (symbol) => {
      const quote = quoteByTicker.get(tickerFromYahooSymbol(symbol)) || {};
      const summary = await fetchPeerFundamentals(symbol).catch(() => null);

      const returnOnEquity = valueOrNull(
        summary?.financialData?.returnOnEquity
      );
      const debtToEquity = valueOrNull(
        summary?.financialData?.debtToEquity
      );
      const trailingEps = valueOrNull(quote.epsTrailingTwelveMonths);
      const bookValue = valueOrNull(quote.bookValue);
      const calculatedReturnOnEquity =
        trailingEps !== null && bookValue !== null && bookValue !== 0
          ? (trailingEps / bookValue) * 100
          : null;

      return {
        ticker: symbol,
        symbol: quote.symbol || `${symbol}.NS`,
        company: quote.longName || quote.shortName || symbol,
        trailingPE: valueOrNull(quote.trailingPE),
        returnOnEquity:
          returnOnEquity === null
            ? calculatedReturnOnEquity
            : returnOnEquity * 100,
        debtToEquity:
          debtToEquity === null ? null : debtToEquity / 100,
        dividendYield: valueOrNull(quote.dividendYield),
        oneYearReturn: valueOrNull(quote.fiftyTwoWeekChangePercent),
        asOf: quote.regularMarketTime || null,
        dataProvider: getMarketDataProviderName(),
      };
    })
  );
};

function tickerFromYahooSymbol(symbol) {
  return String(symbol || "")
    .toUpperCase()
    .replace(/\.(NS|BO)$/, "");
}

const getStockUniverseFromService = async (symbols) => {
  const uniqueSymbols = [...new Set(
    symbols
      .map((symbol) => String(symbol || "").trim().toUpperCase())
      .filter(Boolean)
  )].slice(0, 200);

  if (uniqueSymbols.length === 0) {
    throw new Error("At least one stock symbol is required");
  }

const quotes = await fetchMarketDataBatch(uniqueSymbols);

const quoteByTicker = new Map(
  quotes
    .filter(
      (quote) =>
        quote &&
        typeof quote.symbol === "string"
    )
    .map((quote) => [
      tickerFromYahooSymbol(quote.symbol),
      quote,
    ])
);

  return uniqueSymbols.map((ticker, index) => {
    const quote = quoteByTicker.get(
  tickerFromYahooSymbol(ticker)
);
    
    const price = valueOrNull(quote?.regularMarketPrice);
    const volume = valueOrNull(quote?.regularMarketVolume);
    const marketCap = valueOrNull(quote?.marketCap);

    return {
      ticker,
      symbol:
  quote?.symbol ||
  (ticker.endsWith(".NS") ||
  ticker.endsWith(".BO")
    ? ticker
    : `${ticker}.NS`),
      name: quote?.longName || quote?.shortName || ticker,
      price,
      chgPct: valueOrNull(quote?.regularMarketChangePercent),
      mcap: marketCap === null ? null : marketCap / 10000000,
      tradedVal:
        price === null || volume === null
          ? null
          : (price * volume) / 10000000,
      pe: valueOrNull(quote?.trailingPE),
pb: valueOrNull(quote?.priceToBook),
bookValue: valueOrNull(quote?.bookValue),

// Load these only on the company page.
roe: null,
divYield: valueOrNull(quote?.dividendYield),
de: null,
      ret1y: valueOrNull(quote?.fiftyTwoWeekChangePercent),
      asOf: quote?.regularMarketTime || null,
      dataProvider: getMarketDataProviderName(),
    };
  });
};

function getPerformerPeriod(range = "1M") {
  const period2 = new Date();
  period2.setDate(period2.getDate() + 1);

  const period1 = new Date();

  switch (range) {
    case "1W":
      // Extra calendar days ensure roughly five trading sessions.
      period1.setDate(period1.getDate() - 10);
      break;

    case "1M":
      period1.setMonth(period1.getMonth() - 1);
      break;

    case "6M":
      period1.setMonth(period1.getMonth() - 6);
      break;

    case "1Y":
      period1.setFullYear(period1.getFullYear() - 1);
      break;

    default:
      throw new Error(
        "Range must be one of: 1W, 1M, 6M, 1Y"
      );
  }

  return {
    period1,
    period2,
  };
}

function calculatePeriodReturn(prices) {
  if (!Array.isArray(prices) || prices.length < 2) {
    return null;
  }

  const validPrices = prices
    .map((point) => ({
      date: point.date,
      value:
        valueOrNull(point.adjustedClose) ??
        valueOrNull(point.close),
    }))
    .filter((point) => point.value !== null);

  if (validPrices.length < 2) {
    return null;
  }

  const firstPrice = validPrices[0].value;
  const lastPrice =
    validPrices[validPrices.length - 1].value;

  if (
    !Number.isFinite(firstPrice) ||
    !Number.isFinite(lastPrice) ||
    firstPrice === 0
  ) {
    return null;
  }

  return (
    ((lastPrice / firstPrice) - 1) * 100
  );
}

const getMarketPerformersFromService = async (
  symbols,
  range = "1M"
) => {
  const normalizedRange = String(range || "1M")
    .trim()
    .toUpperCase();

  const uniqueSymbols = [
    ...new Set(
      symbols
        .map((symbol) =>
          String(symbol || "")
            .trim()
            .toUpperCase()
        )
        .filter(Boolean)
    ),
  ].slice(0, 200);

  if (uniqueSymbols.length === 0) {
    throw new Error(
      "At least one stock symbol is required"
    );
  }

  const { period1, period2 } =
    getPerformerPeriod(normalizedRange);

  const historyResults = new Array(uniqueSymbols.length);
  let nextHistoryIndex = 0;

  async function loadHistoryWorker() {
    while (nextHistoryIndex < uniqueSymbols.length) {
      const index = nextHistoryIndex;
      nextHistoryIndex += 1;

      try {
        historyResults[index] = {
          status: "fulfilled",
          value: await fetchHistoricalPrices(
            uniqueSymbols[index],
            period1,
            period2
          ),
        };
      } catch (error) {
        historyResults[index] = {
          status: "rejected",
          reason: error,
        };
      }
    }
  }

  const [quotes] =
    await Promise.all([
      fetchMarketDataBatch(uniqueSymbols),
      Promise.all(
        Array.from(
          { length: Math.min(12, uniqueSymbols.length) },
          () => loadHistoryWorker()
        )
      ),
    ]);

  const quoteByTicker = new Map(
  quotes
    .filter(
      (quote) =>
        quote &&
        typeof quote.symbol === "string"
    )
    .map((quote) => [
      tickerFromYahooSymbol(quote.symbol),
      quote,
    ])
);

  const stocks = uniqueSymbols
    .map((ticker, index) => {
      const quote = quoteByTicker.get(
  tickerFromYahooSymbol(ticker)
);

      const prices =
        historyResults[index]?.status ===
        "fulfilled"
          ? historyResults[index].value
          : [];

      const returnPercent =
        calculatePeriodReturn(prices);
      const latestHistoricalVolume = [...prices]
        .reverse()
        .map((point) => valueOrNull(point?.volume))
        .find((volume) => volume !== null) ?? null;
      const volume =
        valueOrNull(quote?.regularMarketVolume) ?? latestHistoricalVolume;
      const price = valueOrNull(quote?.regularMarketPrice);

      return {
        ticker,
          symbol:
         quote?.symbol ||
        (ticker.endsWith(".NS") ||
         ticker.endsWith(".BO")
         ? ticker
        : `${ticker}.NS`),

        name:
          quote?.longName ||
          quote?.shortName ||
          ticker,

        price,

        changePercent: valueOrNull(
          quote?.regularMarketChangePercent
        ),

        marketCap: valueOrNull(
          quote?.marketCap
        ),

        volume,

        tradedValue:
          price !== null && volume !== null
            ? (price * volume) / 10000000
            : null,

        returnPercent,
        asOf: quote?.regularMarketTime || null,
        dataProvider: getMarketDataProviderName(),
      };
    })
    .filter(
      (stock) =>
        stock.price !== null &&
        stock.returnPercent !== null
    )
    .sort(
      (stockA, stockB) =>
        stockB.returnPercent -
        stockA.returnPercent
    );

  return {
    range: normalizedRange,
    stockCount: stocks.length,
    stocks,
  };
};

module.exports = {
  getMarketData,
  getStockDataFromService,
  getPeerComparisonFromService,
  getStockUniverseFromService,
  getMarketPerformersFromService,
};
