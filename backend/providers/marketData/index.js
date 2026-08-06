const yahooProvider = require("./yahooProvider");

const providers = new Map([
  [yahooProvider.name, yahooProvider],
]);

function getConfiguredProviderName() {
  return String(process.env.MARKET_DATA_PROVIDER || "yahoo")
    .trim()
    .toLowerCase();
}

function getMarketDataProvider() {
  const providerName = getConfiguredProviderName();
  const provider = providers.get(providerName);

  if (!provider) {
    throw new Error(
      `Unsupported market-data provider: ${providerName}`
    );
  }

  return provider;
}

function getMarketDataProviderName() {
  return getMarketDataProvider().name;
}

module.exports = {
  getMarketDataProvider,
  getMarketDataProviderName,
};
