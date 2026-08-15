import { cachedGet } from "./apiClient";
import { getYahooEventSupplement } from "./yahooSupplementApi";

export async function getCompanyEvents(symbol) {
  const [primaryResult, yahooResult] = await Promise.allSettled([
    cachedGet(`/events/${symbol}`),
    getYahooEventSupplement(symbol),
  ]);
  const yahooData = yahooResult.status === "fulfilled" ? yahooResult.value : null;
  if (yahooData) return yahooData;
  if (primaryResult.status === "fulfilled") return primaryResult.value.data;
  throw primaryResult.reason;
}
