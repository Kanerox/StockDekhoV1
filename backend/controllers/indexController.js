const {
  getIndexOverview,
  getIndexDetail,
} = require("../services/indexService");

async function getIndices(req, res) {
  try {
    const indices = await getIndexOverview();
    return res.json({ indices });
  } catch (error) {
    return res.status(500).json({
      error: "Unable to load index data",
      details: error.message,
    });
  }
}

async function getIndex(req, res) {
  try {
    const index = await getIndexDetail(
      req.params.key,
      req.query.range || "1Y"
    );
    return res.json(index);
  } catch (error) {
    const status = error.message === "Unknown index" ? 404 : 500;
    return res.status(status).json({
      error: "Unable to load index data",
      details: error.message,
    });
  }
}

module.exports = {
  getIndices,
  getIndex,
};
