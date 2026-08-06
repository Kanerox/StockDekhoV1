const clients = new Map();

const WINDOW_MS = 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 180;

function getClientKey(req) {
  return String(req.ip || req.socket?.remoteAddress || "unknown");
}

function apiRateLimit(req, res, next) {
  const now = Date.now();
  const key = getClientKey(req);
  const current = clients.get(key);

  const entry =
    !current || current.resetAt <= now
      ? { count: 0, resetAt: now + WINDOW_MS }
      : current;

  entry.count += 1;
  clients.set(key, entry);

  const remaining = Math.max(
    0,
    MAX_REQUESTS_PER_WINDOW - entry.count
  );

  res.set("RateLimit-Limit", String(MAX_REQUESTS_PER_WINDOW));
  res.set("RateLimit-Remaining", String(remaining));
  res.set(
    "RateLimit-Reset",
    String(Math.ceil(entry.resetAt / 1000))
  );

  if (entry.count > MAX_REQUESTS_PER_WINDOW) {
    const retryAfter = Math.max(
      1,
      Math.ceil((entry.resetAt - now) / 1000)
    );

    res.set("Retry-After", String(retryAfter));
    return res.status(429).json({
      error: "Too many requests. Please try again shortly.",
    });
  }

  next();
}

const cleanupTimer = setInterval(() => {
  const now = Date.now();

  for (const [key, entry] of clients.entries()) {
    if (entry.resetAt <= now) {
      clients.delete(key);
    }
  }
}, WINDOW_MS);

cleanupTimer.unref();

module.exports = apiRateLimit;
