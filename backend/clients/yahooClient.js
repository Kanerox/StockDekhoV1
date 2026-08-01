let yahooFinance;

function getYahooFinanceClient() {
  if (!yahooFinance) {
    const YahooFinance = require("yahoo-finance2").default;

    yahooFinance = new YahooFinance({
      suppressNotices: ["yahooSurvey"],
    });
  }

  return yahooFinance;
}

module.exports = {
  getYahooFinanceClient,
};
