const MIN_PUBLICATION_YEAR = 2000;
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;

function validDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.getUTCFullYear() < MIN_PUBLICATION_YEAR) return null;
  return date;
}

function dateKey(date) {
  return date ? date.toISOString().slice(0, 10) : null;
}

function extractDateFromUrl(value = "") {
  const url = String(value);
  const separated = url.match(/(?:^|[/_-])(20\d{2})[/_-](0?[1-9]|1[0-2])[/_-](0?[1-9]|[12]\d|3[01])(?:[/_.-]|$)/);
  const compact = url.match(/(?:^|[/_-])(20\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])(?:[/_.-]|$)/);
  const match = separated || compact;
  if (!match) return null;
  const parsed = validDate(`${match[1]}-${String(match[2]).padStart(2, "0")}-${String(match[3]).padStart(2, "0")}T12:00:00.000Z`);
  return parsed && dateKey(parsed) === `${match[1]}-${String(match[2]).padStart(2, "0")}-${String(match[3]).padStart(2, "0")}`
    ? parsed
    : null;
}

function publicationIntegrity(article, now = new Date()) {
  const published = validDate(article?.pubDate || article?.publishedAt);
  if (!published) return { valid: false, publishedAt: null, reason: "missing_or_malformed" };
  if (published.getTime() > now.getTime() + MAX_FUTURE_SKEW_MS) {
    return { valid: false, publishedAt: null, reason: "future" };
  }

  const urlDate = extractDateFromUrl(article?.link || article?.url);
  if (urlDate) {
    const differenceDays = Math.abs(published.getTime() - urlDate.getTime()) / (24 * 60 * 60 * 1000);
    if (differenceDays > 2) {
      return { valid: false, publishedAt: null, reason: "url_date_conflict", urlDate: dateKey(urlDate) };
    }
  }

  return {
    valid: true,
    publishedAt: published.toISOString(),
    reason: "provider_publication_time",
    urlDate: dateKey(urlDate),
  };
}

function isGoogleNewsWrapper(article = {}) {
  return article.provider === "google-news-rss" || /(^|\.)news\.google\.com$/i.test((() => {
    try { return new URL(article.link || article.url || "").hostname; }
    catch { return ""; }
  })());
}

module.exports = {
  publicationIntegrity,
  extractDateFromUrl,
  isGoogleNewsWrapper,
};
