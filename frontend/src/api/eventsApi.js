import { cachedGet } from "./apiClient";

export async function getCompanyEvents(symbol) {
  const response = await cachedGet(`/events/${symbol}`);
  return response.data;
}
