const {
  getProvider,
  getAllProviders,
} = require("./providerRegistry");

async function callProviderMethod(
  providerName,
  methodName,
  options = {}
) {
  const provider = getProvider(providerName);

  if (!provider) {
    console.error(
      `Unknown news provider: ${providerName}`
    );

    return [];
  }

  if (provider.enabled === false) {
    return [];
  }

  if (
    typeof provider[methodName] !==
    "function"
  ) {
    return [];
  }

  try {
    const articles =
      await provider[methodName](options);

    return Array.isArray(articles)
      ? articles
      : [];
  } catch (error) {
    console.error(
      `${providerName}.${methodName} failed:`,
      error.message
    );

    return [];
  }
}

async function collectFromProviders({
  providerNames,
  methodName,
  options = {},
}) {
  const selectedProviderNames =
    Array.isArray(providerNames) &&
    providerNames.length > 0
      ? providerNames
      : getAllProviders()
          .filter(
            ({ provider }) =>
              provider.enabled !== false
          )
          .map(({ name }) => name);

  const results =
    await Promise.allSettled(
      selectedProviderNames.map(
        (providerName) =>
          callProviderMethod(
            providerName,
            methodName,
            options
          )
      )
    );

  return results.flatMap((result) =>
    result.status === "fulfilled"
      ? result.value
      : []
  );
}

async function getCompanyNews({
  symbol,
  companyName,
  aliases = [],
  sector = null,
  limit = 20,
} = {}) {
  const articles =
    await collectFromProviders({
      providerNames: [
        "marketaux",
        "nse",
        "bse",
      ],

      methodName: "getCompanyNews",

      options: {
        symbol,
        companyName,
        aliases,
        sector,
        limit,
      },
    });

  return articles.slice(0, limit);
}

async function getIndexNews({
  indexKey,
  indexName,
  constituents = [],
  sectors = [],
  limit = 32,
} = {}) {
  const articles =
    await collectFromProviders({
      providerNames: [
        "marketaux",
        "nse",
        "bse",
        "rbi",
        "sebi",
      ],

      methodName: "getIndexNews",

      options: {
        indexKey,
        indexName,
        constituents,
        sectors,
        limit,
      },
    });

  return articles.slice(0, limit);
}

async function getSectorNews({
  sectorKey,
  sectorName,
  constituents = [],
  themes = [],
  limit = 32,
} = {}) {
  const articles =
    await collectFromProviders({
      providerNames: [
        "marketaux",
        "nse",
        "bse",
        "rbi",
        "sebi",
      ],

      methodName: "getSectorNews",

      options: {
        sectorKey,
        sectorName,
        constituents,
        themes,
        limit,
      },
    });

  return articles.slice(0, limit);
}

async function getGlobalMarketNews({
  tab,
  topics = [],
  countries = [],
  currencies = [],
  commodities = [],
  limit = 32,
} = {}) {
  const articles =
    await collectFromProviders({
      providerNames: [
        "marketaux",
        "rbi",
      ],

      methodName:
        "getGlobalMarketNews",

      options: {
        tab,
        topics,
        countries,
        currencies,
        commodities,
        limit,
      },
    });

  return articles.slice(0, limit);
}
async function testMarketauxConnection() {
  const articles =
    await getCompanyNews({
      companyName: "Reliance Industries",
      limit: 5,
    });

  console.log(
    `News Engine returned ${articles.length} article(s).`
  );

  return articles;
}
module.exports = {
  callProviderMethod,
  collectFromProviders,
  getCompanyNews,
  getIndexNews,
  getSectorNews,
  getGlobalMarketNews,
  testMarketauxConnection,
};