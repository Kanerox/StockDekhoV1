const axios = require("axios");
const yahooProvider = require("./yahooProvider");

const API_BASE_URL = "https://api.upstox.com";
const NSE_INSTRUMENTS_URL =
  "https://assets.upstox.com/market-quote/instruments/exchange/NSE.json.gz";

const INDEX_KEYS = {
  "^NSEI": "NSE_INDEX|Nifty 50",
  "^NSMIDCP": "NSE_INDEX|Nifty Next 50",
  "^NSEBANK": "NSE_INDEX|Nifty Bank",
  "^INDIAVIX": "NSE_INDEX|India VIX",
  "^BSESN": "BSE_INDEX|SENSEX",
  "^CNXIT": "NSE_INDEX|Nifty IT",
  "^CNXENERGY": "NSE_INDEX|Nifty Energy",
  "^CNXFMCG": "NSE_INDEX|Nifty FMCG",
  "^CNXAUTO": "NSE_INDEX|Nifty Auto",
  "^CNXINFRA": "NSE_INDEX|Nifty Infrastructure",
  "^CNXMETAL": "NSE_INDEX|Nifty Metal",
  "^CNXPSE": "NSE_INDEX|Nifty PSE",
  "^CNXREALTY": "NSE_INDEX|Nifty Realty",
  "^NSEMDCP150": "NSE_INDEX|NIFTY MIDCAP 150",
  "^NSESMLCAP250": "NSE_INDEX|NIFTY SMLCAP 250",
  "^NSE500": "NSE_INDEX|Nifty 500",
};

const YAHOO_SUPPLEMENTAL_FIELDS = [
  "marketCap",
  "trailingPE",
  "forwardPE",
  "priceToBook",
  "bookValue",
  "epsTrailingTwelveMonths",
  "dividendYield",
  "averageDailyVolume3Month",
  "fiftyTwoWeekLow",
  "fiftyTwoWeekHigh",
  "fiftyTwoWeekChangePercent",
];

let instrumentMapPromise = null;

function token() {
  const value = String(process.env.UPSTOX_ANALYTICS_TOKEN || "").trim();
  if (!value) throw new Error("UPSTOX_ANALYTICS_TOKEN is not configured");
  return value;
}

function headers() {
  return {
    Accept: "application/json",
    Authorization: `Bearer ${token()}`,
  };
}

function normalizeYahooSymbol(symbol) {
  return String(symbol || "").trim().toUpperCase();
}

function tickerFromSymbol(symbol) {
  return normalizeYahooSymbol(symbol).replace(/\.(NS|BO)$/, "");
}

async function loadInstrumentMap() {
  if (!instrumentMapPromise) {
    instrumentMapPromise = axios
      .get(NSE_INSTRUMENTS_URL, {
        timeout: 30000,
        responseType: "json",
      })
      .then(({ data }) => {
        const map = new Map();
        (Array.isArray(data) ? data : [])
          .filter(
            (instrument) =>
              instrument?.segment === "NSE_EQ" &&
              instrument?.instrument_type === "EQ" &&
              instrument?.trading_symbol &&
              instrument?.instrument_key
          )
          .forEach((instrument) => {
            map.set(String(instrument.trading_symbol).toUpperCase(), instrument);
          });
        return map;
      })
      .catch((error) => {
        instrumentMapPromise = null;
        throw error;
      });
  }
  return instrumentMapPromise;
}

async function resolveInstrument(symbol) {
  const normalized = normalizeYahooSymbol(symbol);
  if (INDEX_KEYS[normalized]) {
    return {
      instrument_key: INDEX_KEYS[normalized],
      trading_symbol: tickerFromSymbol(normalized),
      name: null,
    };
  }

  const instruments = await loadInstrumentMap();
  const instrument = instruments.get(tickerFromSymbol(normalized));
  if (!instrument) throw new Error(`No Upstox instrument found for ${normalized}`);
  return instrument;
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function marketTime(quote) {
  const lastTrade = Number(quote?.last_trade_time);
  if (Number.isFinite(lastTrade) && lastTrade > 0) {
    const milliseconds = lastTrade < 1e12 ? lastTrade * 1000 : lastTrade;
    const lastTradeDate = new Date(milliseconds);
    if (!Number.isNaN(lastTradeDate.getTime())) {
      return lastTradeDate.toISOString();
    }
  }
  const timestamp = new Date(quote?.timestamp);
  if (!Number.isNaN(timestamp.getTime())) {
    return timestamp.toISOString();
  }
  return null;
}

function mapQuote(requestedSymbol, instrument, quote) {
  const price = finite(quote?.last_price);
  const quotedPreviousClose = finite(quote?.ohlc?.close);
  const quotedChange = finite(quote?.net_change);
  const previousClose =
    quotedPreviousClose ??
    (price === null || quotedChange === null ? null : price - quotedChange);
  const change =
    price === null || previousClose === null
      ? quotedChange
      : price - previousClose;

  return {
    symbol: requestedSymbol,
    shortName: instrument?.short_name || instrument?.name || quote?.symbol,
    longName: instrument?.name || instrument?.short_name || quote?.symbol,
    regularMarketPrice: price,
    regularMarketPreviousClose: previousClose,
    regularMarketChange: change,
    regularMarketChangePercent:
      change === null || previousClose === null || previousClose === 0
        ? null
        : (change / previousClose) * 100,
    regularMarketOpen: finite(quote?.ohlc?.open),
    regularMarketDayHigh: finite(quote?.ohlc?.high),
    regularMarketDayLow: finite(quote?.ohlc?.low),
    regularMarketVolume: finite(quote?.volume),
    regularMarketTime: marketTime(quote),
    currency: "INR",
    fullExchangeName: String(instrument?.exchange || "NSE"),
    quoteSourceName: "Upstox",
  };
}

async function upstoxQuotes(symbols) {
  const requested = Array.isArray(symbols) ? symbols : [symbols];
  const resolved = await Promise.all(
    requested.map(async (symbol) => ({
      requestedSymbol: normalizeYahooSymbol(symbol),
      instrument: await resolveInstrument(symbol),
    }))
  );
  const instrumentKeys = resolved.map(({ instrument }) => instrument.instrument_key);
  const response = await axios.get(`${API_BASE_URL}/v2/market-quote/quotes`, {
    headers: headers(),
    params: { instrument_key: instrumentKeys.join(",") },
    timeout: 15000,
  });
  const quotes = Object.values(response?.data?.data || {});
  const byInstrumentKey = new Map(
    quotes.map((quote) => [quote?.instrument_token, quote])
  );
  const result = resolved
    .map(({ requestedSymbol, instrument }) => {
      const quote = byInstrumentKey.get(instrument.instrument_key);
      return quote ? mapQuote(requestedSymbol, instrument, quote) : null;
    })
    .filter(Boolean);

  if (result.length !== requested.length) {
    throw new Error("Upstox returned an incomplete market quote response");
  }
  return Array.isArray(symbols) ? result : result[0];
}

async function enrichQuotesWithYahoo(upstoxResult, symbols) {
  const upstoxQuotesResult = Array.isArray(upstoxResult)
    ? upstoxResult
    : [upstoxResult];

  try {
    const yahooResult = await yahooProvider.quote(symbols);
    const yahooQuotes = Array.isArray(yahooResult) ? yahooResult : [yahooResult];
    const yahooByTicker = new Map(
      yahooQuotes
        .filter(Boolean)
        .map((quote) => [tickerFromSymbol(quote.symbol), quote])
    );

    const enriched = upstoxQuotesResult.map((quote) => {
      const yahooQuote = yahooByTicker.get(tickerFromSymbol(quote.symbol));
      if (!yahooQuote) return quote;

      const supplemental = {};
      for (const field of YAHOO_SUPPLEMENTAL_FIELDS) {
        if (quote[field] === null || quote[field] === undefined) {
          supplemental[field] = yahooQuote[field] ?? null;
        }
      }

      return {
        ...quote,
        ...supplemental,
        shortName: yahooQuote.shortName || quote.shortName,
        longName: yahooQuote.longName || quote.longName,
        supplementalDataProvider: "Yahoo Finance",
      };
    });

    return Array.isArray(upstoxResult) ? enriched : enriched[0];
  } catch (error) {
    console.warn(`Yahoo supplemental quote enrichment unavailable: ${error.message}`);
    return upstoxResult;
  }
}

function formatDate(date) {
  return new Date(date).toISOString().slice(0, 10);
}

function historicalWindows(period1, period2) {
  const start = new Date(period1);
  const inclusiveEnd = new Date(period2);
  inclusiveEnd.setUTCDate(inclusiveEnd.getUTCDate() - 1);
  const windows = [];
  let cursor = new Date(start);

  while (cursor <= inclusiveEnd) {
    const windowEnd = new Date(cursor);
    windowEnd.setUTCFullYear(windowEnd.getUTCFullYear() + 9);
    if (windowEnd > inclusiveEnd) windowEnd.setTime(inclusiveEnd.getTime());
    windows.push({ from: formatDate(cursor), to: formatDate(windowEnd) });
    cursor = new Date(windowEnd);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return windows;
}

async function upstoxChart(symbol, options = {}) {
  const instrument = await resolveInstrument(symbol);
  const windows = historicalWindows(options.period1, options.period2);
  const responses = await Promise.all(
    windows.map(({ from, to }) =>
      axios.get(
        `${API_BASE_URL}/v3/historical-candle/${encodeURIComponent(
          instrument.instrument_key
        )}/days/1/${to}/${from}`,
        { headers: headers(), timeout: 20000 }
      )
    )
  );
  const quotes = responses
    .flatMap((response) => response?.data?.data?.candles || [])
    .map((candle) => ({
      date: new Date(candle[0]),
      open: finite(candle[1]),
      high: finite(candle[2]),
      low: finite(candle[3]),
      close: finite(candle[4]),
      adjclose: finite(candle[4]),
      volume: finite(candle[5]),
    }))
    .filter((quote) => quote.date && Number.isFinite(quote.close))
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  if (quotes.length === 0) throw new Error(`Upstox returned no history for ${symbol}`);
  return { quotes };
}

function quoteDateKey(quote) {
  const date = new Date(quote?.date);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

async function chartWithYahooSupplement(symbol, options) {
  const upstoxResult = await upstoxChart(symbol, options);

  try {
    const yahooResult = await yahooProvider.chart(symbol, options);
    const byDate = new Map();

    for (const quote of [
      ...(upstoxResult?.quotes || []),
      ...(yahooResult?.quotes || []),
    ]) {
      const key = quoteDateKey(quote);
      if (key && Number.isFinite(quote?.close)) byDate.set(key, quote);
    }

    return {
      quotes: [...byDate.values()].sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
      ),
    };
  } catch (error) {
    console.warn(`Yahoo history supplementation unavailable for ${symbol}: ${error.message}`);
    return upstoxResult;
  }
}

async function withYahooFallback(upstoxOperation, yahooOperation, label) {
  try {
    return await upstoxOperation();
  } catch (error) {
    console.warn(`${label} failed; falling back to Yahoo Finance: ${error.message}`);
    return yahooOperation();
  }
}

module.exports = {
  name: "upstox",

  quote(symbols) {
    return withYahooFallback(
      () => upstoxQuotes(symbols),
      () => yahooProvider.quote(symbols),
      "Upstox quote"
    );
  },

  quoteWithSupplement(symbols) {
    return withYahooFallback(
      async () => enrichQuotesWithYahoo(await upstoxQuotes(symbols), symbols),
      () => yahooProvider.quote(symbols),
      "Upstox supplemented quote"
    );
  },

  chart(symbol, options) {
    return withYahooFallback(
      () => chartWithYahooSupplement(symbol, options),
      () => yahooProvider.chart(symbol, options),
      `Upstox history ${symbol}`
    );
  },

  quoteSummary(symbol, options) {
    return yahooProvider.quoteSummary(symbol, options);
  },

  fundamentalsTimeSeries(symbol, options) {
    return yahooProvider.fundamentalsTimeSeries(symbol, options);
  },
};
