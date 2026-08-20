import { cachedGet } from "./apiClient";
import { getYahooQuoteSupplements } from "./yahooSupplementApi";

export async function getIndices() {
  const response = await cachedGet("/indices");
  return response.data.indices || [];
}

export async function getIndexDetail(indexKey, range) {
  const response = await cachedGet(
    `/indices/${encodeURIComponent(indexKey)}`,
    {
      params: { range },
    }
  );
  const detail = response.data;
  if (String(indexKey).toUpperCase() !== "NIFTY50" || !detail?.constituents?.length) {
    return detail;
  }

  const supplements = await getYahooQuoteSupplements(
    detail.constituents.map((stock) => stock.ticker)
  );
  const supplementByTicker = new Map(
    supplements.map((quote) => [quote.ticker, quote])
  );

  return {
    ...detail,
    constituents: detail.constituents.map((stock) => {
      const supplement = supplementByTicker.get(stock.ticker);
      const primaryTime = new Date(stock.marketTime).getTime();
      const supplementTime = new Date(supplement?.regularMarketTime).getTime();
      if (!supplement || !Number.isFinite(supplementTime) || supplementTime <= primaryTime) {
        return stock;
      }
      return {
        ...stock,
        name: supplement.company || stock.name,
        price: supplement.regularMarketPrice ?? stock.price,
        chgPct: supplement.regularMarketChangePercent ?? stock.chgPct,
        marketTime: supplement.regularMarketTime,
      };
    }),
  };
}
