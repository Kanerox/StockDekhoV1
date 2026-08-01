const {
  getCurrencyOverview,
  getCurrencyHistory,
} = require("../services/currencyService");

async function getCurrencies(req, res) {
  try {
    const currencies = await getCurrencyOverview();
    res.json({ currencies });
  } catch (error) {
    res.status(500).json({
      error: "Unable to fetch currency data",
      details: error.message,
    });
  }
}

async function getCurrencyPerformance(req, res) {
  try {
    const history = await getCurrencyHistory(
      req.params.code,
      req.query.range || "1Y"
    );
    res.json(history);
  } catch (error) {
    res.status(500).json({
      error: "Unable to fetch currency history",
      details: error.message,
    });
  }
}

module.exports = {
  getCurrencies,
  getCurrencyPerformance,
};
