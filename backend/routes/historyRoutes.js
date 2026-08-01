const express = require("express");
const {
  getPerformanceHistory,
} = require("../controllers/historyController");

const router = express.Router();

router.get("/:symbol", getPerformanceHistory);

module.exports = router;
