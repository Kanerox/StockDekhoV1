import assert from "node:assert/strict";
import fs from "node:fs";

const appSource = fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const chartSource = fs.readFileSync(new URL("../src/components/StockCharts.jsx", import.meta.url), "utf8");

assert.doesNotMatch(appSource, /from ["']recharts["']/, "Recharts must not return to the eager application module");
assert.match(appSource, /import\(["']\.\/components\/StockCharts\.jsx["']\)/, "Charts must retain a dynamic import boundary");
assert.match(chartSource, /from ["']recharts["']/, "The deferred chart module must own the Recharts dependency");
assert.match(appSource, /const retainedMarketsPage =/, "Markets retained state must remain in the stable eager module");
assert.match(appSource, /let retainedGlobalIndices =/, "Global authority state must remain in the stable eager module");
assert.match(appSource, /sessionStorage\.getItem\(["']stockdekho-brand-intro-seen["']\)/, "The cinematic remains guarded once per browser session");
assert.match(appSource, /<React\.Suspense fallback=\{<ChartFallback/, "Deferred charts must have local, dimension-preserving fallbacks");

for (const page of ["markets", "benchmark", "stocks", "sectors", "company", "compare", "currencies", "global-index", "watchlist", "search"]) {
  assert.match(appSource, new RegExp(`page === ["']${page}["']`), `${page} navigation surface must remain wired`);
}
assert.match(appSource, /const openCompany = \(t\) => \{ setActiveTicker\(t\); setPage\(["']company["']\); \};/,
  "direct company selection must still resolve through the existing application navigation path");

console.log("Lazy chart boundary and retained-state placement checks passed.");
