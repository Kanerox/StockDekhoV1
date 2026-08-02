function normalizeArticle({
  provider,
  id,
  title,
  summary = "",
  source,
  url,
  publishedAt,
  company = [],
  sectors = [],
  indexes = [],
  themes = [],
  countries = [],
  sentiment = null,
  raw = {},
}) {
  return {
    provider,

    id,

    title,

    summary,

    source,

    url,

    publishedAt,

    company: Array.isArray(company)
      ? company
      : [company],

    sectors: Array.isArray(sectors)
      ? sectors
      : [sectors],

    indexes: Array.isArray(indexes)
      ? indexes
      : [indexes],

    themes: Array.isArray(themes)
      ? themes
      : [themes],

    countries: Array.isArray(countries)
      ? countries
      : [countries],

    sentiment,

    raw,
  };
}

module.exports = {
  normalizeArticle,
};