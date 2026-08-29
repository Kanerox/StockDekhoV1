import { cachedGet, indianMarketDataTtlMs } from "./apiClient";
import { getYahooQuoteSupplements } from "./yahooSupplementApi";

export async function getSectors({ force = false } = {}) {
  const response = await cachedGet("/sectors", {}, indianMarketDataTtlMs(), { force });
  return response.data.sectors || [];
}

export async function getSectorDetail(sector, range) {
  const response = await cachedGet(
    `/sectors/${encodeURIComponent(sector)}`,
    {
      params: { range },
    }
  );
  const data = response.data;
  const constituents = Array.isArray(data?.constituents) ? data.constituents : [];
  const supplements = await getYahooQuoteSupplements(
    constituents.map((stock) => stock.ticker)
  );
  const byTicker = new Map(supplements.map((item) => [item.ticker, item]));
  return {
    ...data,
    constituents: constituents.map((stock) => {
      const supplement = byTicker.get(stock.ticker);
      return supplement ? {
        ...stock,
        pe: supplement.trailingPE ?? stock.pe,
        ret1y: supplement.fiftyTwoWeekChangePercent ?? stock.ret1y,
        mcap: Number.isFinite(supplement.marketCap) && supplement.marketCap > 0
          ? supplement.marketCap / 10000000
          : stock.mcap,
      } : stock;
    }),
  };
}
