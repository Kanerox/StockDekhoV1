const { createClient } = require("redis");

const memoryCache = new Map();
let redisClient = null;
let connectionPromise = null;
let warnedAboutMemoryFallback = false;

function cacheKey(key) {
  return `stockdekho:${key}`;
}

function warnAboutMemoryFallback() {
  if (warnedAboutMemoryFallback) return;
  warnedAboutMemoryFallback = true;
  console.warn(
    "REDIS_URL is not configured. Cache data will not survive a server restart."
  );
}

async function getRedisClient() {
  if (!process.env.REDIS_URL) {
    warnAboutMemoryFallback();
    return null;
  }

  if (!redisClient) {
    redisClient = createClient({ url: process.env.REDIS_URL });
    redisClient.on("error", (error) => {
      console.error("Redis cache error:", error.message);
    });
  }

  if (!redisClient.isOpen) {
    if (!connectionPromise) {
      connectionPromise = redisClient.connect().finally(() => {
        connectionPromise = null;
      });
    }

    try {
      await connectionPromise;
    } catch (error) {
      console.error("Unable to connect to Redis:", error.message);
      return null;
    }
  }

  return redisClient;
}

function getMemoryEntry(key) {
  const entry = memoryCache.get(key);
  if (!entry) return null;

  if (entry.expiresAt <= Date.now()) {
    memoryCache.delete(key);
    return null;
  }

  return entry.payload;
}

async function getCacheEntry(key) {
  const redis = await getRedisClient();

  if (redis) {
    try {
      const serialized = await redis.get(cacheKey(key));
      return serialized ? JSON.parse(serialized) : null;
    } catch (error) {
      console.error(`Unable to read Redis key ${key}:`, error.message);
    }
  }

  return getMemoryEntry(key);
}

async function setCacheEntry(key, value, retentionMs) {
  const payload = { value, savedAt: Date.now() };
  const redis = await getRedisClient();

  if (redis) {
    try {
      await redis.set(cacheKey(key), JSON.stringify(payload), {
        PX: retentionMs,
      });
      return payload;
    } catch (error) {
      console.error(`Unable to write Redis key ${key}:`, error.message);
    }
  }

  memoryCache.set(key, {
    payload,
    expiresAt: Date.now() + retentionMs,
  });

  return payload;
}

async function getCachedValue(key, maxAgeMs) {
  const entry = await getCacheEntry(key);

  if (!entry || Date.now() - entry.savedAt > maxAgeMs) {
    return null;
  }

  return entry.value;
}

async function incrementCacheCounter(key, retentionMs) {
  const redis = await getRedisClient();

  if (redis) {
    try {
      const namespacedKey = cacheKey(key);
      const count = await redis.incr(namespacedKey);
      if (count === 1) await redis.pExpire(namespacedKey, retentionMs);
      return count;
    } catch (error) {
      console.error(`Unable to increment Redis key ${key}:`, error.message);
    }
  }

  const current = getMemoryEntry(key);
  const count = Number(current?.value || 0) + 1;
  const payload = { value: count, savedAt: Date.now() };
  memoryCache.set(key, { payload, expiresAt: Date.now() + retentionMs });
  return count;
}

module.exports = {
  getCachedValue,
  setCacheEntry,
  incrementCacheCounter,
};
