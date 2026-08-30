const express = require("express");
const {
  getCompanyNews,
  getGlobalMarketNews,
  getVixMarketNews,
  getNiftyMarketEvents,
  getIndiaGsecNews,
  getGlobalIndexNews,
  getSectorNews,
} = require("../controllers/newsController");

const router = express.Router();

router.get("/global", getGlobalMarketNews);
router.get("/vix", getVixMarketNews);
router.get("/market-events", getNiftyMarketEvents);
router.get("/gsec", getIndiaGsecNews);
router.get("/global-index/:key", getGlobalIndexNews);
router.get("/sector/:key", getSectorNews);
router.get("/:symbol", getCompanyNews);

module.exports = router;
