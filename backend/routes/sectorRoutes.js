const express = require("express");
const {
  getSectors,
  getSector,
} = require("../controllers/sectorController");

const router = express.Router();

router.get("/", getSectors);
router.get("/:key", getSector);

module.exports = router;
