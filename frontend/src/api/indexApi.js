import { cachedGet } from "./apiClient";

export async function getIndices() {
  const response = await cachedGet("/indices", {}, 5 * 60 * 1000);
  return response.data.indices || [];
}

export async function getIndexDetail(indexKey, range) {
  const response = await cachedGet(
    `/indices/${encodeURIComponent(indexKey)}`,
    {
      params: { range },
    }
  );
  return response.data;
}
