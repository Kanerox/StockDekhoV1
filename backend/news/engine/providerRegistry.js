const marketauxProvider = require("../providers/marketaux");
const nseProvider = require("../providers/nse");
const bseProvider = require("../providers/bse");
const rbiProvider = require("../providers/rbi");
const sebiProvider = require("../providers/sebi");
const etNowProvider =
  require("../providers/etNow");
const currentsProvider =
  require("../providers/currents");

const providers = {
  marketaux: marketauxProvider,
  nse: nseProvider,
  bse: bseProvider,
  rbi: rbiProvider,
  sebi: sebiProvider,
  etNow: etNowProvider,
  currents: currentsProvider,
};

function getProvider(providerName) {
  return providers[providerName] || null;
}

function getAllProviders() {
  return Object.entries(providers).map(
    ([name, provider]) => ({
      name,
      provider,
    })
  );
}

module.exports = {
  providers,
  getProvider,
  getAllProviders,
};