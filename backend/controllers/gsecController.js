const { getIndiaTenYearYield } = require("../clients/gsecClient");

async function getIndiaTenYear(req, res) {
  try {
    return res.status(200).json(await getIndiaTenYearYield(req.query.range));
  } catch (error) {
    console.error("Unable to fetch India 10Y G-Sec data:", error.message);
    return res.status(503).json({ error: "India 10Y G-Sec data is currently unavailable." });
  }
}

module.exports = { getIndiaTenYear };
