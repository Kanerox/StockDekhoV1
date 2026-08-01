import apiClient from "./apiClient";

export async function getCompanyEvents(symbol) {
  const response = await apiClient.get(`/events/${symbol}`);
  return response.data;
}
