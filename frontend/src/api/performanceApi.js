import { cachedGet } from "./apiClient";

export async function getPerformanceHistory(symbol, range, customRange = {}) {
  const params = { range };

  if (range === "Custom") {
    params.start = customRange.start;
    params.end = customRange.end;
  }

  const response = await cachedGet(`/history/${symbol}`, { params });
  return response.data;
}
