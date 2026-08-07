import { cachedGet } from "./apiClient";

export async function getCurrencies() {
  const response = await cachedGet("/currencies");
  return response.data.currencies || [];
}

export async function getCurrencyHistory(code, range) {
  const response = await cachedGet(`/currencies/${code}/history`, {
    params: { range },
  });
  return response.data;
}
