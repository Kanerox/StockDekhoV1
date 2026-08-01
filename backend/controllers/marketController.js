const {
  getMarketData,
  getStockDataFromService,
  getPeerComparisonFromService,
  getStockUniverseFromService,
  getMarketPerformersFromService,
} = require("../services/marketService");


const getMarketStatus = (req, res) => {

  const marketData = getMarketData();

  res.json(marketData);

};


const getStockData = async (req, res) => {

  try {

    const symbol = req.params.symbol;

    const stockData = await getStockDataFromService(symbol);

    res.json(stockData);

  } catch (error) {

    res.status(500).json({
      error: "Unable to fetch market data",
      details: error.message
    });

  }

};

const getPeerComparison = async (req, res) => {
  try {
    const symbols = String(req.query.symbols || "")
      .split(",")
      .map((symbol) => symbol.trim())
      .filter(Boolean);

    const peers = await getPeerComparisonFromService(symbols);

    res.json({ peers });
  } catch (error) {
    res.status(500).json({
      error: "Unable to fetch peer comparison data",
      details: error.message
    });
  }
};

const getStockUniverse = async (req, res) => {
  try {
    const symbols = String(req.query.symbols || "")
      .split(",")
      .map((symbol) => symbol.trim())
      .filter(Boolean);

    const stocks = await getStockUniverseFromService(symbols);

    res.json({ stocks });
  } catch (error) {
    res.status(500).json({
      error: "Unable to fetch live stock universe",
      details: error.message
    });
  }
};


const getMarketPerformers = async (req, res) => {
  try {
    const symbols = String(req.query.symbols || "")
      .split(",")
      .map((symbol) => symbol.trim())
      .filter(Boolean);

    const range = String(
      req.query.range || "1M"
    ).toUpperCase();

    const performers =
      await getMarketPerformersFromService(
        symbols,
        range
      );

    res.json(performers);
  } catch (error) {
    res.status(500).json({
      error:
        "Unable to fetch market performer data",
      details: error.message,
    });
  }
};

module.exports = {
  getMarketStatus,
  getStockData,
  getPeerComparison,
  getStockUniverse,
  getMarketPerformers,
};