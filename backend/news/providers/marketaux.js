const {
  fetchCompanyNews,
  fetchGlobalMarketNews,
} = require("../../clients/newsClient");

async function getCompanyNews({
  companyName,
}) {
  if (!companyName) {
    return [];
  }

  return fetchCompanyNews(companyName);
}

async function getIndexNews({
  indexName,
}) {
  if (!indexName) {
    return [];
  }

  return fetchGlobalMarketNews(indexName);
}

async function getSectorNews({
  sectorName,
}) {
  if (!sectorName) {
    return [];
  }

  return fetchGlobalMarketNews(sectorName);
}

async function getGlobalMarketNews({
  topics = [],
}) {
  const searches = Array.isArray(topics)
    ? topics
    : [topics];

  const results =
    await Promise.allSettled(
      searches.map((topic) =>
        fetchGlobalMarketNews(topic)
      )
    );

  return results.flatMap((result) =>
    result.status === "fulfilled"
      ? result.value
      : []
  );
}

module.exports = {
  name: "marketaux",
  enabled: true,

  getCompanyNews,
  getIndexNews,
  getSectorNews,
  getGlobalMarketNews,
};