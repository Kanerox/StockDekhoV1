const { getCachedValue, setCacheEntry } = require("./cacheClient");
const {
  getMarketDataProviderName,
} = require("../providers/marketData");

const RATE_LIMIT_COOLDOWN_MS = 15 * 60 * 1000;

function providerCacheKey(key) {
  const providerName = getMarketDataProviderName();
  return providerName === "yahoo" ? key : `${providerName}:${key}`;
}

function cooldownCacheKey() {
  return `${getMarketDataProviderName()}:blocked-until`;
}

function isRateLimitError(error) {
  const status = error?.response?.status || error?.status || error?.statusCode;
  const message = String(error?.message || "").toLowerCase();

  return (
    status === 429 ||
    message.includes("429") ||
    message.includes("too many requests") ||
    message.includes("failed to get crumb")
  );
}

async function isProviderCoolingDown() {
  const blockedUntil = await getCachedValue(
    cooldownCacheKey(),
    RATE_LIMIT_COOLDOWN_MS
  );
  return Number(blockedUntil) > Date.now();
}

async function startProviderCooldown() {
  const blockedUntil = Date.now() + RATE_LIMIT_COOLDOWN_MS;
  await setCacheEntry(
    cooldownCacheKey(),
    blockedUntil,
    RATE_LIMIT_COOLDOWN_MS
  );
}

module.exports = {
  isProviderCoolingDown,
  isRateLimitError,
  providerCacheKey,
  startProviderCooldown,
};
