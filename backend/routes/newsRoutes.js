const express = require("express");
const {
  getCompanyNews,
  getGlobalMarketNews,
  getVixMarketNews,
  getNiftyMarketEvents,
  getIndiaGsecNews,
} = require("../controllers/newsController");

const router = express.Router();

router.get("/global", getGlobalMarketNews);
router.get("/vix", getVixMarketNews);
router.get("/market-events", getNiftyMarketEvents);
router.get("/gsec", getIndiaGsecNews);
router.get("/:symbol", getCompanyNews);

module.exports = router;
