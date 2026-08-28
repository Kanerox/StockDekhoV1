import { cachedGet, indianMarketDataTtlMs } from "./apiClient";

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

  return response.data;
}
