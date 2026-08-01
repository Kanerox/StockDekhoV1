const SECTORS = [
  {
    key: "Financials",
    benchmarkName: "Nifty Bank",
    benchmarkSymbol: "^NSEBANK",
    proxy: false,
    constituents: ["HDFCBANK", "ICICIBANK", "SBIN", "AXISBANK", "IDFCFIRSTB"],
  },
  {
    key: "Information Technology",
    benchmarkName: "Nifty IT",
    benchmarkSymbol: "^CNXIT",
    proxy: false,
    constituents: ["TCS", "INFY", "HCLTECH", "WIPRO", "PERSISTENT"],
  },
  {
    key: "Energy",
    benchmarkName: "Nifty Energy",
    benchmarkSymbol: "^CNXENERGY",
    proxy: false,
    constituents: ["RELIANCE", "NTPC", "POWERGRID", "IOC"],
  },
  {
    key: "Consumer Staples",
    benchmarkName: "Nifty FMCG",
    benchmarkSymbol: "^CNXFMCG",
    proxy: false,
    constituents: ["ITC", "DABUR", "TATACONSUM"],
  },
  {
    key: "Consumer Discretionary",
    benchmarkName: "Nifty Auto",
    benchmarkSymbol: "^CNXAUTO",
    proxy: true,
    constituents: ["MARUTI", "M&M", "SONACOMS"],
  },
  {
    key: "Health Care",
    benchmarkName: "PharmaBeES",
    benchmarkSymbol: "PHARMABEES.NS",
    proxy: true,
    constituents: ["SUNPHARMA", "BIOCON", "GRANULES"],
  },
  {
    key: "Industrials",
    benchmarkName: "Nifty Infrastructure",
    benchmarkSymbol: "^CNXINFRA",
    proxy: true,
    constituents: ["LT", "BHARTIARTL", "NTPC", "POWERGRID", "RELIANCE"],
  },
  {
    key: "Materials",
    benchmarkName: "Nifty Metal",
    benchmarkSymbol: "^CNXMETAL",
    proxy: true,
    constituents: ["TATASTEEL"],
  },
  {
    key: "Utilities",
    benchmarkName: "Nifty PSE",
    benchmarkSymbol: "^CNXPSE",
    proxy: true,
    constituents: ["NTPC", "POWERGRID", "IOC"],
  },
  {
    key: "Communication Services",
    benchmarkName: "Nifty India Digital ETF",
    benchmarkSymbol: "TNIDETF.NS",
    proxy: true,
    constituents: ["BHARTIARTL", "IDEA"],
  },
  {
    key: "Real Estate",
    benchmarkName: "Nifty Realty",
    benchmarkSymbol: "^CNXREALTY",
    proxy: false,
    constituents: ["DLF", "OBEROIRLTY"],
  },
];

function getSectorDefinition(key) {
  return SECTORS.find(
    (sector) => sector.key.toLowerCase() === String(key || "").toLowerCase()
  );
}

module.exports = {
  SECTORS,
  getSectorDefinition,
};
