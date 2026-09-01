const { getYahooFinanceClient } = require("../../clients/yahooClient");

function getClient() {
  return getYahooFinanceClient();
}

function yahooChartOptions(options = {}) {
  const { supplement: _supplement, ...yahooOptions } = options;
  return yahooOptions;
}

module.exports = {
  name: "yahoo",

  quote(symbols) {
    return getClient().quote(symbols);
  },

  chart(symbol, options) {
    // `supplement` is an internal StockDekho routing flag. yahoo-finance2
    // validates chart options strictly, so never forward provider-only fields.
    return getClient().chart(symbol, yahooChartOptions(options));
  },

  quoteSummary(symbol, options) {
    return getClient().quoteSummary(symbol, options);
  },

  fundamentalsTimeSeries(symbol, options) {
    return getClient().fundamentalsTimeSeries(symbol, options);
  },

  _test: { yahooChartOptions },
};
