const Parser = require("rss-parser");
const axios = require("axios");

const parser = new Parser();

async function fetchFeed(url) {
  const response = await axios.get(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36",
      Accept: "application/rss+xml, application/xml;q=0.9,*/*;q=0.8",
    },
    timeout: 10000,
  });

  return parser.parseString(response.data);
}

async function fetchCompanyNews(companyName) {
  const query = encodeURIComponent(`"${companyName}"`);

  const url =
    `https://news.google.com/rss/search?q=${query}&hl=en-IN&gl=IN&ceid=IN:en`;

  const feed = await fetchFeed(url);

  return feed.items || [];
}

async function fetchGlobalMarketNews(searchQuery) {
  const query = encodeURIComponent(`${searchQuery} when:7d`);

  const url =
    `https://news.google.com/rss/search?q=${query}&hl=en-IN&gl=IN&ceid=IN:en`;

  const feed = await fetchFeed(url);

  return feed.items || [];
}

module.exports = {
  fetchCompanyNews,
  fetchGlobalMarketNews,
};