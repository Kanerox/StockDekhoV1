import { cachedGet } from "./apiClient";
import { getYahooCompanySupplement, getYahooQuoteSupplements } from "./yahooSupplementApi";

export async function getStockQuote(symbol) {
  try {
    const [response, supplement] = await Promise.all([
      cachedGet(`/market/${symbol}`),
      getYahooCompanySupplement(symbol),
    ]);
    const quote = response.data;

    if (!supplement) return quote;

    // Upstox/backend remains authoritative for price, change, timestamp and
    // trading status. Yahoo only fills descriptive/fundamental gaps.
    return {
      ...quote,
      company: supplement.company || quote.company,
      marketCap:
        Number.isFinite(supplement.marketCap) && supplement.marketCap > 0
          ? supplement.marketCap
          : quote.marketCap,
      trailingPE: supplement.trailingPE ?? quote.trailingPE,
      priceToBook: supplement.priceToBook ?? quote.priceToBook,
      bookValue: supplement.bookValue ?? quote.bookValue,
      dividendYield: supplement.dividendYield ?? quote.dividendYield,
      averageDailyVolume3Month:
        supplement.averageVolume ?? quote.averageDailyVolume3Month,
      fiftyTwoWeekLow:
        supplement.fiftyTwoWeekLow ?? quote.fiftyTwoWeekLow,
      fiftyTwoWeekHigh:
        supplement.fiftyTwoWeekHigh ?? quote.fiftyTwoWeekHigh,
      fiftyTwoWeekChangePercent:
        supplement.fiftyTwoWeekChangePercent ??
        quote.fiftyTwoWeekChangePercent,
      supplementalDataProvider: "Yahoo Finance",
    };
  } catch (error) {
    console.error("Failed to fetch stock quote:", error);
    throw error;
  }
}

export async function getPeerComparison(symbols) {
  try {
    const response = await cachedGet("/market/peers", {
        params: {
          symbols: symbols.join(","),
        },
      });
    return response.data.peers || [];
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
    const [responses, batchSupplements] = await Promise.all([
      Promise.all(
        chunks.map((chunk) =>
          cachedGet("/market/stocks", {
            params: { symbols: chunk.join(",") },
          })
        )
      ),
      getYahooQuoteSupplements(symbols),
    ]);
    const supplements = [...batchSupplements];
    const supplementByTicker = new Map(supplements.map((item) => [item.ticker, item]));
    const missingMarketCaps = symbols.filter((symbol) => {
      const item = supplementByTicker.get(symbol);
      return !Number.isFinite(item?.marketCap) || item.marketCap <= 0;
    });
    const detailResults = await Promise.allSettled(
      missingMarketCaps.slice(0, 20).map((symbol) => getYahooCompanySupplement(symbol))
    );
    detailResults.forEach((result) => {
      if (result.status === "fulfilled" && result.value?.ticker) {
        supplementByTicker.set(result.value.ticker, {
          ...(supplementByTicker.get(result.value.ticker) || {}),
          ...result.value,
        });
      }
    });
    return responses
      .flatMap((response) => response.data.stocks || [])
      .map((stock) => {
        const supplement = supplementByTicker.get(stock.ticker);
        if (!supplement) return stock;
        return {
          ...stock,
          name: supplement.company || stock.name,
          mcap: Number.isFinite(supplement.marketCap) && supplement.marketCap > 0
            ? supplement.marketCap / 10000000
            : stock.mcap,
          pe: supplement.trailingPE ?? stock.pe,
          pb: supplement.priceToBook ?? stock.pb,
          bookValue: supplement.bookValue ?? stock.bookValue,
          divYield: supplement.dividendYield ?? stock.divYield,
          ret1y: supplement.fiftyTwoWeekChangePercent ?? stock.ret1y,
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
      },
      15 * 60 * 1000
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
