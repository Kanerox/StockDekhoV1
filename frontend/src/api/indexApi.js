import { cachedGet } from "./apiClient";
import { getYahooQuoteSupplements } from "./yahooSupplementApi";

export async function getIndices() {
  const response = await cachedGet("/indices");
  const indices = response.data.indices || [];
  const supplements = await getYahooQuoteSupplements(
    indices.map((index) => index.symbol).filter(Boolean)
  );
  const supplementBySymbol = new Map(
    supplements.map((quote) => [quote.ticker, quote])
  );

  return indices.map((index) => {
    const supplement = supplementBySymbol.get(index.symbol);
    if (!supplement) return index;
    const primaryTime = new Date(index.marketTime || index.asOf).getTime();
    const supplementTime = new Date(supplement.regularMarketTime).getTime();
    if (!Number.isFinite(supplementTime) || supplementTime < primaryTime) {
      return index;
    }
    return {
      ...index,
      value: supplement.regularMarketPrice ?? index.value,
      change: supplement.regularMarketChange ?? index.change,
      changePercent:
        supplement.regularMarketChangePercent ?? index.changePercent,
      marketTime: supplement.regularMarketTime,
      asOf: supplement.regularMarketTime,
    };
  });
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
