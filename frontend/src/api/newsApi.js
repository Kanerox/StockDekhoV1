import { cachedGet } from "./apiClient";

export async function getCompanyNews(symbol) {
  const response = await cachedGet(`/news/${symbol}`, {}, 5 * 60 * 1000);
  return response.data;
}

export async function getGlobalMarketNews() {
  const response = await cachedGet("/news/global", {}, 5 * 60 * 1000);
  return response.data;
}

export async function getVixMarketNews() {
  const response = await cachedGet("/news/vix", {}, 5 * 60 * 1000);
  return response.data;
}

export async function getNiftyMarketEvents() {
  const response = await cachedGet("/news/market-events", {}, 5 * 60 * 1000);
  return response.data;
}

export async function getIndiaGsecNews() {
  const response = await cachedGet("/news/gsec", {}, 10 * 60 * 1000);
  return response.data;
}
