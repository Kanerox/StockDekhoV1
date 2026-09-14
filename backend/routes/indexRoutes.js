const express = require("express");
const {
  getIndices,
  getIndex,
  reconcileClose,
} = require("../controllers/indexController");

const router = express.Router();

router.get("/", getIndices);
router.post("/:key/reconcile-close", reconcileClose);
router.get("/:key", getIndex);

module.exports = router;
