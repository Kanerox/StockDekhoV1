const express = require("express");

const {
  getFinancials,
} = require("../controllers/financialsController");

const router = express.Router();

router.get("/:symbol", getFinancials);

module.exports = router;