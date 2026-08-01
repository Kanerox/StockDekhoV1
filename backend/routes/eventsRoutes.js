const express = require("express");
const { getEvents } = require("../controllers/eventsController");

const router = express.Router();

router.get("/:symbol", getEvents);

module.exports = router;
