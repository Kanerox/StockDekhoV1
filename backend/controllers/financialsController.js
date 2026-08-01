const {
  getCompanyFinancials,
} = require("../services/financialsService");

async function getFinancials(req, res) {
  try {
    const { symbol } = req.params;

    if (!symbol?.trim()) {
      return res.status(400).json({
        error: "A stock symbol is required",
      });
    }

    const financials = await getCompanyFinancials(symbol);

    return res.json(financials);
  } catch (error) {
    console.error("Financials controller error:", error);

    return res.status(500).json({
      error: "Unable to load financial statements",
      details:
        process.env.NODE_ENV === "development"
          ? error.message
          : undefined,
    });
  }
}

module.exports = {
  getFinancials,
};