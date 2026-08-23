const express = require("express");
const { getIndiaTenYear } = require("../controllers/gsecController");

const router = express.Router();
router.get("/india-10y", getIndiaTenYear);
module.exports = router;
