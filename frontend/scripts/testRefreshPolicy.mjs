import assert from "node:assert/strict";
import { shouldRunVisibilityRefresh } from "../src/utils/refreshPolicy.js";

const base = { now: 1_000_000, lastAttemptAt: 600_000, intervalMs: 300_000 };
assert.equal(shouldRunVisibilityRefresh({ ...base, visibilityState: "hidden" }), false);
assert.equal(shouldRunVisibilityRefresh({ ...base, visibilityState: "visible" }), true);
assert.equal(shouldRunVisibilityRefresh({ ...base, visibilityState: "visible", eligible: false }), false);
assert.equal(shouldRunVisibilityRefresh({ ...base, visibilityState: "visible", lastAttemptAt: 800_000 }), false);
console.log("Visibility refresh policy checks passed.");
