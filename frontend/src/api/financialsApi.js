import apiClient from "./apiClient";

export async function getCompanyFinancials(symbol) {
  const response = await apiClient.get(`/financials/${symbol}`);
  return response.data;
}