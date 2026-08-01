import apiClient from "./apiClient";

export async function getCompanyNews(symbol) {
  const response = await apiClient.get(`/news/${symbol}`);
  return response.data;
}

export async function getGlobalMarketNews() {
  const response = await apiClient.get("/news/global");
  return response.data;
}

export async function getVixMarketNews() {
  const response = await apiClient.get("/news/vix");
  return response.data;
}

export async function getNiftyMarketEvents() {
  const response = await apiClient.get("/news/market-events");
  return response.data;
}
