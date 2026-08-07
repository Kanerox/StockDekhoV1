import axios from "axios";

const fallbackBaseURL =
  import.meta.env.PROD
    ? "https://stockdekho-api.onrender.com/api"
    : "http://localhost:3001/api";

const apiClient = axios.create({
  baseURL:
    import.meta.env.VITE_API_URL ||
    fallbackBaseURL,
});

const responseCache = new Map();
const inFlightRequests = new Map();
const DEFAULT_CACHE_TTL_MS = 60 * 1000;

function requestKey(url, config = {}) {
  const params = Object.entries(config.params || {})
    .sort(([keyA], [keyB]) => keyA.localeCompare(keyB));

  return JSON.stringify([url, params]);
}

export async function cachedGet(
  url,
  config = {},
  ttlMs = DEFAULT_CACHE_TTL_MS
) {
  const key = requestKey(url, config);
  const cached = responseCache.get(key);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.response;
  }

  if (inFlightRequests.has(key)) {
    return inFlightRequests.get(key);
  }

  const request = apiClient
    .get(url, config)
    .then((response) => {
      responseCache.set(key, {
        response,
        expiresAt: Date.now() + ttlMs,
      });

      return response;
    })
    .finally(() => {
      inFlightRequests.delete(key);
    });

  inFlightRequests.set(key, request);
  return request;
}

export default apiClient;
