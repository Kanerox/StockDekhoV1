const {
  getHistoricalPerformance,
} = require("../services/historyService");

async function getPerformanceHistory(req, res) {
  try {
    const data = await getHistoricalPerformance(req.params.symbol, {
      range: req.query.range,
      start: req.query.start,
      end: req.query.end,
    });

    return res.json(data);
  } catch (error) {
    return res.status(500).json({
      error: "Unable to load historical market data",
      details: error.message,
    });
  }
}

module.exports = {
  getPerformanceHistory,
};
