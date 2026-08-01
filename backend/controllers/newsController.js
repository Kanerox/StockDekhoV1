const {
  getCompanyNewsFromService,
  getGlobalMarketNewsFromService,
  getVixMarketNewsFromService,
  getNiftyMarketEventsFromService,
} = require("../services/newsService");

async function getNiftyMarketEvents(req, res) {
  try {
    const news = await getNiftyMarketEventsFromService();
    return res.status(200).json(news);
  } catch (error) {
    console.error("Error fetching Nifty market events:", error);

    return res.status(500).json({
      error: "Unable to fetch current market events.",
      details: error.message,
    });
  }
}

async function getVixMarketNews(req, res) {
  try {
    const news = await getVixMarketNewsFromService();
    return res.status(200).json(news);
  } catch (error) {
    console.error("Error fetching VIX market news:", error);

    return res.status(500).json({
      error: "Unable to fetch volatility market news.",
      details: error.message,
    });
  }
}

async function getGlobalMarketNews(req, res) {
  try {
    const news = await getGlobalMarketNewsFromService();
    return res.status(200).json(news);
  } catch (error) {
    console.error("Error fetching global market news:", error);

    return res.status(500).json({
      error: "Unable to fetch global market news.",
      details: error.message,
    });
  }
}

async function getCompanyNews(req, res) {
  try {
    const { symbol } = req.params;

    if (!symbol) {
      return res.status(400).json({
        error: "Stock symbol is required.",
      });
    }

    const news = await getCompanyNewsFromService(
      symbol.toUpperCase()
    );

    return res.status(200).json(news);
  } catch (error) {
    console.error("Error fetching company news:", error);

    return res.status(500).json({
      error: "Unable to fetch company news.",
      details: error.message,
    });
  }
}

module.exports = {
  getCompanyNews,
  getGlobalMarketNews,
  getVixMarketNews,
  getNiftyMarketEvents,
};
