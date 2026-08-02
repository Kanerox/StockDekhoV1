async function getGlobalMarketNews() {
  return [];
}

async function getIndexNews() {
  return [];
}

async function getSectorNews() {
  return [];
}

module.exports = {
  name: "rbi",
  enabled: false,

  getGlobalMarketNews,
  getIndexNews,
  getSectorNews,
};