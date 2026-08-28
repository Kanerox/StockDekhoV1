import { cachedGet } from "./apiClient";

export async function getGlobalIndices({ force = false } = {}) {
  const response = await cachedGet("/global-indices", {}, 5 * 60 * 1000, { force });
  return response.data.indices || [];
}

export async function getGlobalIndexDetail(key, range = "1Y", { force = false } = {}) {
  const response = await cachedGet(`/global-indices/${encodeURIComponent(key)}`, { params: { range } }, 5 * 60 * 1000, { force });
  return response.data;
}
