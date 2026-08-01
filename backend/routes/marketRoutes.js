const express = require("express");

const router = express.Router();

const {
  getMarketStatus,
  getStockData,
  getPeerComparison,
  getStockUniverse,
  getMarketPerformers,
} = require("../controllers/marketController");

router.get("/", getMarketStatus);

router.get("/peers", getPeerComparison);

router.get("/stocks", getStockUniverse);

router.get("/performers", getMarketPerformers);

router.get("/:symbol", getStockData);

module.exports = router;
