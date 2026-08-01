const { getCompanyEvents } = require("../services/eventsService");

async function getEvents(req, res) {
  try {
    const data = await getCompanyEvents(req.params.symbol);
    return res.json(data);
  } catch (error) {
    return res.status(500).json({
      error: "Unable to load company events",
      details: error.message,
    });
  }
}

module.exports = {
  getEvents,
};
