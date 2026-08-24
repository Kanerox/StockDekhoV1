const express = require("express");
const { getGlobalIndices, getGlobalIndex } = require("../controllers/globalIndexController");
const router = express.Router();
router.get("/", getGlobalIndices);
router.get("/:key", getGlobalIndex);
module.exports = router;
