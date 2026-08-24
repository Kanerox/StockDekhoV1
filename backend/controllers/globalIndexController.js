const { getGlobalIndexOverview, getGlobalIndexDetail } = require("../services/globalIndexService");

async function getGlobalIndices(req, res) {
  try { return res.json({ indices: await getGlobalIndexOverview() }); }
  catch (error) { return res.status(500).json({ error: "Unable to load global indices", details: error.message }); }
}

async function getGlobalIndex(req, res) {
  try { return res.json(await getGlobalIndexDetail(req.params.key, req.query.range || "1Y")); }
  catch (error) { return res.status(error.message === "Unknown global index" ? 404 : 500).json({ error: "Unable to load global index", details: error.message }); }
}

module.exports = { getGlobalIndices, getGlobalIndex };
