const stockUniverse = require("../../frontend/src/data/stockUniverse.json");

const SECTOR_BENCHMARKS = [
  ["Financials", "Nifty Bank", "^NSEBANK", false],
  ["Information Technology", "Nifty IT", "^CNXIT", false],
  ["Energy", "Nifty Energy", "^CNXENERGY", false],
  ["Consumer Staples", "Nifty FMCG", "^CNXFMCG", false],
  ["Consumer Discretionary", "Nifty Auto", "^CNXAUTO", true],
  ["Health Care", "PharmaBeES", "PHARMABEES.NS", true],
  ["Industrials", "Nifty Infrastructure", "^CNXINFRA", true],
  ["Materials", "Nifty Metal", "^CNXMETAL", true],
  ["Utilities", "Nifty PSE", "^CNXPSE", true],
  ["Communication Services", "Nifty India Digital ETF", "TNIDETF.NS", true],
  ["Real Estate", "Nifty Realty", "^CNXREALTY", false],
];

const SECTORS = SECTOR_BENCHMARKS.map(
  ([key, benchmarkName, benchmarkSymbol, proxy]) => ({
    key,
    benchmarkName,
    benchmarkSymbol,
    proxy,
    constituents: stockUniverse
      .filter((stock) => stock.sector === key)
      .map((stock) => stock.ticker),
  })
);

function getSectorDefinition(key) {
  return SECTORS.find(
    (sector) => sector.key.toLowerCase() === String(key || "").toLowerCase()
  );
}

module.exports = {
  SECTORS,
  getSectorDefinition,
};
