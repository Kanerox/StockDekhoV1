const INDICES = [
  {
    key: "NIFTY50",
    name: "Nifty 50",
    symbol: "^NSEI",
    description:
      "Tracks 50 of the largest and most liquid companies listed on the NSE. It is the primary benchmark for India’s large-cap equity market.",
    constituents: [
      "ADANIENT",
      "ADANIPORTS",
      "APOLLOHOSP",
      "ASIANPAINT",
      "AXISBANK",
      "BAJAJ-AUTO",
      "BAJAJFINSV",
      "BAJFINANCE",
      "BEL",
      "BHARTIARTL",
      "CIPLA",
      "COALINDIA",
      "DRREDDY",
      "EICHERMOT",
      "ETERNAL",
      "GRASIM",
      "HCLTECH",
      "HDFCBANK",
      "HDFCLIFE",
      "HEROMOTOCO",
      "HINDALCO",
      "HINDUNILVR",
      "ICICIBANK",
      "INDUSINDBK",
      "INFY",
      "ITC",
      "JIOFIN",
      "JSWSTEEL",
      "KOTAKBANK",
      "LT",
      "M&M",
      "MARUTI",
      "NESTLEIND",
      "NTPC",
      "ONGC",
      "POWERGRID",
      "RELIANCE",
      "SBILIFE",
      "SBIN",
      "SHRIRAMFIN",
      "SUNPHARMA",
      "TCS",
      "TATACONSUM",
      "TMPV",
      "TATASTEEL",
      "TECHM",
      "TITAN",
      "TRENT",
      "ULTRACEMCO",
      "WIPRO",
    ],
  },
  {
    key: "NEXT50",
    name: "Nifty Next 50",
    symbol: "^NSMIDCP",
    description:
      "Tracks the 50 large companies immediately below the Nifty 50 by eligible market capitalisation. It is often viewed as a pipeline of potential future Nifty 50 constituents.",
    constituents: ["IOC", "DABUR", "TATACONSUM"],
  },
  {
    key: "BANKNIFTY",
    name: "Nifty Bank",
    symbol: "^NSEBANK",
    description:
      "Tracks the largest and most liquid NSE-listed banking companies. It is a widely followed gauge of Indian credit growth, interest-rate sensitivity and financial-sector sentiment.",
    constituents: [
      "HDFCBANK",
      "ICICIBANK",
      "SBIN",
      "AXISBANK",
      "IDFCFIRSTB",
    ],
  },
  {
    key: "VIX",
    name: "India VIX",
    symbol: "^INDIAVIX",
    description:
      "Measures the market’s expectation of near-term volatility using Nifty option prices. Higher readings generally indicate greater expected market uncertainty.",
    constituents: [],
    isVix: true,
  },
  {
    key: "SENSEX",
    name: "S&P BSE Sensex",
    symbol: "^BSESN",
    description:
      "Tracks 30 large, established and financially sound companies listed on the BSE. It is one of India’s longest-running and most recognised equity benchmarks.",
    constituents: [
      "RELIANCE",
      "TCS",
      "HDFCBANK",
      "BHARTIARTL",
      "ICICIBANK",
      "SBIN",
      "LT",
      "ITC",
      "INFY",
      "SUNPHARMA",
      "MARUTI",
      "HCLTECH",
      "M&M",
      "AXISBANK",
      "TATASTEEL",
      "ULTRACEMCO",
      "NTPC",
      "POWERGRID",
      "BAJFINANCE",
      "TITAN",
    ],
  },
  {
    key: "MIDCAP150",
    name: "Nifty Midcap 150",
    symbol: "^NSEMDCP150",
    description:
      "Tracks 150 mid-sized companies selected from the Nifty 500 and provides a broad view of India's mid-cap equity segment.",
    constituents: require("../../frontend/src/data/stockUniverse.json")
      .filter((stock) => stock.cap === "Mid")
      .map((stock) => stock.ticker),
  },
  {
    key: "SMALLCAP250",
    name: "Nifty Smallcap 250",
    symbol: "^NSESMLCAP250",
    description:
      "Tracks 250 smaller companies within the Nifty 500 and represents India's diversified small-cap equity segment.",
    constituents: [],
  },
  {
    key: "NIFTY500",
    name: "Nifty 500",
    symbol: "^NSE500",
    description:
      "Tracks 500 large-, mid- and small-cap NSE-listed companies and represents the broad Indian equity market.",
    constituents: require("../../frontend/src/data/stockUniverse.json").map(
      (stock) => stock.ticker
    ),
  },
];

function getIndexDefinition(key) {
  return INDICES.find(
    (index) => index.key.toLowerCase() === String(key || "").toLowerCase()
  );
}

module.exports = {
  INDICES,
  getIndexDefinition,
};
