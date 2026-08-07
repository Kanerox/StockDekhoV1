import { cachedGet } from "./apiClient";

export async function getSectors() {
  const response = await cachedGet("/sectors");
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
