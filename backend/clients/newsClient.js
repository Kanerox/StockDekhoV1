let parser;

function getParser() {
  if (!parser) {
    const Parser = require("rss-parser");
    parser = new Parser();
  }

  return parser;
}

async function fetchCompanyNews(companyName) {
  const searchQuery = `"${companyName}"`;

  const query = encodeURIComponent(searchQuery);

  const feed = await getParser().parseURL(
    `https://news.google.com/rss/search?q=${query}&hl=en-IN&gl=IN&ceid=IN:en`
  );

  return feed.items || [];
}

async function fetchGlobalMarketNews(searchQuery) {
  const query = encodeURIComponent(`${searchQuery} when:7d`);

  const feed = await getParser().parseURL(
    `https://news.google.com/rss/search?q=${query}&hl=en-IN&gl=IN&ceid=IN:en`
  );

  return feed.items || [];
}

module.exports = {
  fetchCompanyNews,
  fetchGlobalMarketNews,
};
