const express = require("express");
const {
  getCurrencies,
  getCurrencyPerformance,
} = require("../controllers/currencyController");

const router = express.Router();

router.get("/", getCurrencies);
router.get("/:code/history", getCurrencyPerformance);

module.exports = router;
