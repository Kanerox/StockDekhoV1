import { cachedGet } from "./apiClient";
import {
  getYahooCompanySupplement,
  getYahooQuoteSupplements,
} from "./yahooSupplementApi";

function mergeCompanySupplement(primary, supplement) {
  if (!supplement) return primary;
  const primaryTime = new Date(primary.asOf).getTime();
  const supplementTime = new Date(supplement.regularMarketTime).getTime();
  const useYahooQuote = Number.isFinite(supplementTime) &&
    (!Number.isFinite(primaryTime) || supplementTime > primaryTime);
  return {
    ...primary,
    price: useYahooQuote ? supplement.regularMarketPrice ?? primary.price : primary.price,
    changePercent: useYahooQuote
      ? supplement.regularMarketChangePercent ?? primary.changePercent
      : primary.changePercent,
    asOf: useYahooQuote ? supplement.regularMarketTime : primary.asOf,
    company: supplement.company || primary.company,
    marketCap: Number.isFinite(supplement.marketCap) && supplement.marketCap > 0
      ? supplement.marketCap
      : primary.marketCap,
    trailingPE: supplement.trailingPE ?? primary.trailingPE,
    priceToBook: supplement.priceToBook ?? primary.priceToBook,
    bookValue: supplement.bookValue ?? primary.bookValue,
    trailingEps: supplement.trailingEps ?? primary.trailingEps,
    dividendYield: supplement.dividendYield ?? primary.dividendYield,
    averageVolume: supplement.averageVolume ?? primary.averageVolume,
    open: primary.open ?? supplement.regularMarketOpen,
    previousClose: primary.previousClose ?? supplement.regularMarketPreviousClose,
    dayHigh: primary.dayHigh ?? supplement.regularMarketDayHigh,
    dayLow: primary.dayLow ?? supplement.regularMarketDayLow,
    volume: primary.volume ?? supplement.regularMarketVolume,
    fiftyTwoWeekHigh: supplement.fiftyTwoWeekHigh ?? primary.fiftyTwoWeekHigh,
    fiftyTwoWeekLow: supplement.fiftyTwoWeekLow ?? primary.fiftyTwoWeekLow,
    returnOnEquity: supplement.returnOnEquity ?? primary.returnOnEquity,
    debtToEquity: supplement.debtToEquity ?? primary.debtToEquity,
    supplementalDataProvider: "Yahoo Finance",
  };
}

export async function getStockQuote(symbol) {
  try {
    const [response, supplement] = await Promise.all([
      cachedGet(`/market/${symbol}`),
      getYahooCompanySupplement(symbol),
    ]);
    return mergeCompanySupplement(response.data, supplement);
  } catch (error) {
    console.error("Failed to fetch stock quote:", error);
    throw error;
  }
}

export async function getPeerComparison(symbols) {
  try {
    const [response, supplements] = await Promise.all([
      cachedGet("/market/peers", {
        params: {
          symbols: symbols.join(","),
        },
      }),
      getYahooQuoteSupplements(symbols),
    ]);
    const supplementByTicker = new Map(
      supplements.map((item) => [item.ticker, item])
    );
    return (response.data.peers || []).map((peer) => {
      const supplement = supplementByTicker.get(peer.ticker);
      return supplement
        ? {
            ...peer,
            company: supplement.company || peer.company,
            trailingPE: supplement.trailingPE ?? peer.trailingPE,
            dividendYield: supplement.dividendYield ?? peer.dividendYield,
          }
        : peer;
    });
  } catch (error) {
    console.error("Failed to fetch peer comparison:", error);
    throw error;
  }
}

export async function getStockUniverse(symbols) {
  try {
    const chunks = [];
    for (let index = 0; index < symbols.length; index += 40) {
      chunks.push(symbols.slice(index, index + 40));
    }
    const [responses, supplements] = await Promise.all([
      Promise.all(
        chunks.map((chunk) =>
          cachedGet("/market/stocks", {
            params: { symbols: chunk.join(",") },
          })
        )
      ),
      getYahooQuoteSupplements(symbols),
    ]);
    const supplementByTicker = new Map(
      supplements.map((item) => [item.ticker, item])
    );
    return responses
      .flatMap((response) => response.data.stocks || [])
      .map((stock) => {
        const supplement = supplementByTicker.get(stock.ticker);
        if (!supplement) return stock;
        const stockTime = new Date(stock.asOf).getTime();
        const supplementTime = new Date(supplement.regularMarketTime).getTime();
        const useYahooQuote = Number.isFinite(supplementTime) &&
          (!Number.isFinite(stockTime) || supplementTime > stockTime);
        return {
          ...stock,
          price: useYahooQuote
            ? supplement.regularMarketPrice ?? stock.price
            : stock.price,
          chgPct: useYahooQuote
            ? supplement.regularMarketChangePercent ?? stock.chgPct
            : stock.chgPct,
          asOf: useYahooQuote ? supplement.regularMarketTime : stock.asOf,
          name: supplement.company || stock.name,
          mcap: Number.isFinite(supplement.marketCap)
            ? supplement.marketCap / 10000000
            : stock.mcap,
          pe: supplement.trailingPE ?? stock.pe,
          pb: supplement.priceToBook ?? stock.pb,
          bookValue: supplement.bookValue ?? stock.bookValue,
          divYield: supplement.dividendYield ?? stock.divYield,
        };
      });
  } catch (error) {
    console.error("Failed to fetch live stock universe:", error);
    throw error;
  }
}
export async function getMarketPerformers(
  symbols,
  range = "1M"
) {
  try {
    const response = await cachedGet(
      "/market/performers",
      {
        params: {
          symbols: symbols.join(","),
          range,
        },
      }
    );

    return response.data;
  } catch (error) {
    console.error(
      "Failed to fetch market performers:",
      error
    );
    throw error;
  }
}
