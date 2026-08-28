import { cachedGet } from "./apiClient";

export async function getIndices({ force = false } = {}) {
  const response = await cachedGet("/indices", {}, 5 * 60 * 1000, { force });
  return response.data.indices || [];
}

export async function getIndexDetail(indexKey, range, { force = false } = {}) {
  const response = await cachedGet(
    `/indices/${encodeURIComponent(indexKey)}`,
    {
      params: { range },
    },
    5 * 60 * 1000,
    { force }
  );
  return response.data;
}
