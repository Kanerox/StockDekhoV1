import { cachedGet } from "./apiClient";

export async function getGlobalIndices() {
  const response = await cachedGet("/global-indices", {}, 5 * 60 * 1000);
  return response.data.indices || [];
}

export async function getGlobalIndexDetail(key, range = "1Y") {
  const response = await cachedGet(`/global-indices/${encodeURIComponent(key)}`, { params: { range } }, 5 * 60 * 1000);
  return response.data;
}
