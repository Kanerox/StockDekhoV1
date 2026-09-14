const { createClient } = require("redis");

const memoryCache = new Map();
const MEMORY_MIRROR_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
let redisClient = null;
let connectionPromise = null;
let warnedAboutMemoryFallback = false;
const memoryUpdateQueues = new Map();

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
      if (serialized) {
        const payload = JSON.parse(serialized);
        memoryCache.set(key, {
          payload,
          expiresAt: Date.now() + MEMORY_MIRROR_RETENTION_MS,
        });
        return payload;
      }
      return null;
    } catch (error) {
      console.error(`Unable to read Redis key ${key}:`, error.message);
    }
  }

  return getMemoryEntry(key);
}

async function setCacheEntry(key, value, retentionMs) {
  const payload = { value, savedAt: Date.now() };
  memoryCache.set(key, {
    payload,
    expiresAt: Date.now() + retentionMs,
  });
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

async function updateCacheEntryAtomic(key, candidate, retentionMs, selectValue) {
  const redis = await getRedisClient();
  const namespacedKey = cacheKey(key);

  if (redis) {
    // WATCH is connection-scoped and therefore unsafe on the shared Redis
    // client. Run the compare/update on Redis itself so competing workers and
    // overview/detail requests serialize at the key.
    const script = `
      local current = redis.call('GET', KEYS[1])
      local candidate = cjson.decode(ARGV[1])
      if current then
        local existing = cjson.decode(current)
        local old = existing.value
        local new = candidate.value
        local oldSession = old.completedSessionDate or old.observationDate or ''
        local newSession = new.completedSessionDate or new.observationDate or ''
        local oldEod = old.completedSessionConfirmed == true or (old.observationKind == 'session_close' and old.dataStatus == 'eod')
        local newEod = new.completedSessionConfirmed == true or (new.observationKind == 'session_close' and new.dataStatus == 'eod')
        local oldTime = old.marketTime or old.asOf or ''
        local newTime = new.marketTime or new.asOf or ''
        local keepOld = false
        if oldSession ~= '' and (newSession == '' or oldSession > newSession) then
          keepOld = true
        elseif oldSession == newSession and oldEod and not newEod then
          keepOld = true
        elseif oldSession == newSession and oldEod == newEod and oldTime > newTime then
          keepOld = true
        end
        if keepOld then return current end
        if oldSession == newSession and old.previousSessionClose ~= nil and new.previousSessionClose == nil then
          new.previousSessionClose = old.previousSessionClose
          new.previousSessionCloseDate = old.previousSessionCloseDate
          if new.value ~= nil and old.previousSessionClose ~= 0 and new.change == nil then
            new.change = new.value - old.previousSessionClose
            new.changePercent = (new.change / old.previousSessionClose) * 100
          end
          candidate.value = new
          ARGV[1] = cjson.encode(candidate)
        end
      end
      redis.call('SET', KEYS[1], ARGV[1], 'PX', ARGV[2])
      return ARGV[1]
    `;
    const candidatePayload = { value: candidate, savedAt: Date.now() };
    const serialized = await redis.eval(script, {
      keys: [namespacedKey],
      arguments: [JSON.stringify(candidatePayload), String(retentionMs)],
    });
    const selectedPayload = JSON.parse(serialized);
    memoryCache.set(key, { payload: selectedPayload, expiresAt: Date.now() + retentionMs });
    return selectedPayload.value;
  }

  const prior = memoryUpdateQueues.get(key) || Promise.resolve();
  const update = prior.then(() => {
    const existing = getMemoryEntry(key)?.value ?? null;
    const selected = selectValue(candidate, existing);
    const payload = { value: selected, savedAt: Date.now() };
    memoryCache.set(key, { payload, expiresAt: Date.now() + retentionMs });
    return selected;
  });
  const queued = update.catch(() => {});
  memoryUpdateQueues.set(key, queued);
  return update.finally(() => {
    if (memoryUpdateQueues.get(key) === queued) memoryUpdateQueues.delete(key);
  });
}

module.exports = {
  getCachedValue,
  setCacheEntry,
  incrementCacheCounter,
  updateCacheEntryAtomic,
};
