import apiClient from "./apiClient";

export async function getIndices() {
  const response = await apiClient.get("/indices");
  return response.data.indices || [];
}

export async function getIndexDetail(indexKey, range) {
  const response = await apiClient.get(
    `/indices/${encodeURIComponent(indexKey)}`,
    {
      params: { range },
    }
  );

  return response.data;
}
