export function shouldRunVisibilityRefresh({
  visibilityState,
  now,
  lastAttemptAt,
  intervalMs,
  eligible = true,
}) {
  return visibilityState === "visible" &&
    eligible &&
    now - lastAttemptAt >= intervalMs;
}
