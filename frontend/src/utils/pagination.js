export const NEWS_PAGE_SIZE = 8;

export function articlePageCount(articles, pageSize = NEWS_PAGE_SIZE) {
  const count = Array.isArray(articles) ? articles.length : 0;
  return Math.max(1, Math.ceil(count / pageSize));
}

export function clampArticlePage(page, articles, pageSize = NEWS_PAGE_SIZE) {
  const totalPages = articlePageCount(articles, pageSize);
  return Math.min(totalPages, Math.max(1, Number(page) || 1));
}

export function articlesForPage(articles, page, pageSize = NEWS_PAGE_SIZE) {
  const values = Array.isArray(articles) ? articles : [];
  const safePage = clampArticlePage(page, values, pageSize);
  return values.slice((safePage - 1) * pageSize, safePage * pageSize);
}
