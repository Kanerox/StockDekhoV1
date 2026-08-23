import { cachedGet } from "./apiClient";

export async function getIndiaTenYearYield(range = "1M") {
  const response = await cachedGet("/gsec/india-10y", { params: { range } }, 6 * 60 * 60 * 1000);
  return response.data;
}
