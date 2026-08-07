import { cachedGet } from "./apiClient";

export async function getCompanyFinancials(symbol) {
  const response = await cachedGet(`/financials/${symbol}`);
  return response.data;
}
