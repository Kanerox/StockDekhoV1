async function getCompanyNews() {
  return [];
}

async function getIndexNews() {
  return [];
}

async function getSectorNews() {
  return [];
}

module.exports = {
  name: "sebi",
  enabled: false,

  getCompanyNews,
  getIndexNews,
  getSectorNews,
};