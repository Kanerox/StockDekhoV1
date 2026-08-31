import assert from "node:assert/strict";
import { NEWS_PAGE_SIZE, articlePageCount, clampArticlePage, articlesForPage } from "../src/utils/pagination.js";

const pool = (count) => Array.from({ length: count }, (_, index) => ({ id: index + 1 }));
for (const [count, pages] of [[0, 1], [1, 1], [8, 1], [9, 2], [16, 2], [17, 3], [29, 4], [40, 5]]) {
  assert.equal(articlePageCount(pool(count)), pages, `${count} articles should create ${pages} page(s)`);
}
assert.equal(NEWS_PAGE_SIZE, 8);
assert.deepEqual(articlesForPage(pool(17), 3).map((item) => item.id), [17]);
assert.equal(clampArticlePage(5, pool(29)), 4, "a shrinking pool clamps to its last valid page");
assert.equal(clampArticlePage(5, pool(8)), 1, "switching to a smaller surface resets/clamps safely");
assert.deepEqual(articlesForPage(pool(9), 2).map((item) => item.id), [9]);

console.log("Dynamic 8-article news pagination checks passed.");
