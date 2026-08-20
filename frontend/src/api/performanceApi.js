import { cachedGet } from "./apiClient";
import { getYahooHistorySupplement } from "./yahooSupplementApi";

export async function getPerformanceHistory(symbol, range, customRange = {}) {
  const params = { range };

  if (range === "Custom") {
    params.start = customRange.start;
    params.end = customRange.end;
  }

  const [primaryResult, supplementResult] = await Promise.allSettled([
    cachedGet(`/history/${symbol}`, { params }),
    getYahooHistorySupplement(symbol, range, customRange),
  ]);
  if (primaryResult.status === "rejected" && supplementResult.status === "rejected") {
    throw primaryResult.reason;
  }

  const primary = primaryResult.status === "fulfilled" ? primaryResult.value.data : null;
  const supplement = supplementResult.status === "fulfilled" ? supplementResult.value : null;
  const byDate = new Map();
  for (const point of [...(primary?.points || []), ...(supplement?.points || [])]) {
    if (point?.date) byDate.set(point.date, point);
  }
  const points = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));

  return {
    ...(primary || {}),
    symbol: primary?.symbol || String(symbol).toUpperCase(),
    benchmarkName: primary?.benchmarkName || "Nifty 50",
    range,
    startDate: points[0]?.date || primary?.startDate,
    endDate: points.at(-1)?.date || primary?.endDate,
    points,
  };
}
