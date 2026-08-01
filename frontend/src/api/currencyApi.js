import apiClient from "./apiClient";

export async function getCurrencies() {
  const response = await apiClient.get("/currencies");
  return response.data.currencies || [];
}

export async function getCurrencyHistory(code, range) {
  const response = await apiClient.get(`/currencies/${code}/history`, {
    params: { range },
  });
  return response.data;
}
