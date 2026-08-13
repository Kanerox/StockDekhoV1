const yahooProvider = require("./yahooProvider");
const upstoxProvider = require("./upstoxProvider");

const providers = new Map([
  [yahooProvider.name, yahooProvider],
  [upstoxProvider.name, upstoxProvider],
]);

function getConfiguredProviderName() {
  const defaultProvider = process.env.UPSTOX_ANALYTICS_TOKEN
    ? "upstox"
    : "yahoo";
  return String(process.env.MARKET_DATA_PROVIDER || defaultProvider)
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
