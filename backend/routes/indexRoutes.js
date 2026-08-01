const express = require("express");
const {
  getIndices,
  getIndex,
} = require("../controllers/indexController");

const router = express.Router();

router.get("/", getIndices);
router.get("/:key", getIndex);

module.exports = router;
