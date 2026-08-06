const { getYahooFinanceClient } = require("../../clients/yahooClient");

function getClient() {
  return getYahooFinanceClient();
}

module.exports = {
  name: "yahoo",

  quote(symbols) {
    return getClient().quote(symbols);
  },

  chart(symbol, options) {
    return getClient().chart(symbol, options);
  },

  quoteSummary(symbol, options) {
    return getClient().quoteSummary(symbol, options);
  },

  fundamentalsTimeSeries(symbol, options) {
    return getClient().fundamentalsTimeSeries(symbol, options);
  },
};
