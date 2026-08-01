const {
  getSectorOverview,
  getSectorDetail,
} = require("../services/sectorService");

async function getSectors(req, res) {
  try {
    const sectors = await getSectorOverview();
    return res.json({ sectors });
  } catch (error) {
    return res.status(500).json({
      error: "Unable to load sector data",
      details: error.message,
    });
  }
}

async function getSector(req, res) {
  try {
    const sector = await getSectorDetail(
      decodeURIComponent(req.params.key),
      req.query.range || "1Y"
    );

    return res.json(sector);
  } catch (error) {
    return res.status(500).json({
      error: "Unable to load sector details",
      details: error.message,
    });
  }
}

module.exports = {
  getSectors,
  getSector,
};
