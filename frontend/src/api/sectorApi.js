import apiClient from "./apiClient";

export async function getSectors() {
  const response = await apiClient.get("/sectors");
  return response.data.sectors || [];
}

export async function getSectorDetail(sector, range) {
  const response = await apiClient.get(
    `/sectors/${encodeURIComponent(sector)}`,
    {
      params: { range },
    }
  );

  return response.data;
}
