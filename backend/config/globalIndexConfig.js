const GLOBAL_INDICES = [
  { key: "SP500", name: "S&P 500", symbol: "^GSPC", region: "Americas", timeZone: "America/New_York", sessions: [[570, 960]], description: "Tracks 500 leading US companies and is the most widely followed benchmark for large-cap US equities." },
  { key: "NASDAQ", name: "NASDAQ Composite", symbol: "^IXIC", region: "Americas", timeZone: "America/New_York", sessions: [[570, 960]], description: "Tracks thousands of Nasdaq-listed companies, with a strong concentration in technology and growth businesses." },
  { key: "DOW", name: "Dow Jones Industrial Average", symbol: "^DJI", region: "Americas", timeZone: "America/New_York", sessions: [[570, 960]], description: "A price-weighted benchmark of 30 prominent US companies across major industries." },
  { key: "HANGSENG", name: "Hang Seng", symbol: "^HSI", region: "APAC", timeZone: "Asia/Hong_Kong", sessions: [[570, 720], [780, 960]], settlementBufferMinutes: 30, description: "Tracks the largest and most liquid companies listed in Hong Kong and is an important gauge of Chinese and regional risk appetite." },
  { key: "NIKKEI225", name: "Nikkei 225", symbol: "^N225", historySymbol: "998407.O", region: "APAC", timeZone: "Asia/Tokyo", sessions: [[540, 690], [750, 930]], settlementBufferMinutes: 0, description: "A price-weighted benchmark of 225 leading companies listed in Japan." },
  { key: "FTSE100", name: "FTSE 100", symbol: "^FTSE", region: "EMEA", timeZone: "Europe/London", sessions: [[480, 990]], settlementBufferMinutes: 60, description: "Tracks 100 of the largest companies listed on the London Stock Exchange." },
  { key: "DAX", name: "DAX", symbol: "^GDAXI", region: "EMEA", timeZone: "Europe/Berlin", sessions: [[540, 1050]], settlementBufferMinutes: 60, description: "Tracks 40 major German blue-chip companies listed on the Frankfurt Stock Exchange." },
  { key: "EUROSTOXX50", name: "EURO STOXX 50", symbol: "^STOXX50E", region: "EMEA", timeZone: "Europe/Berlin", sessions: [[540, 1050]], settlementBufferMinutes: 60, delayMinutes: 15, description: "Tracks 50 leading blue-chip companies from euro-area countries." },
  { key: "KOSPI", name: "KOSPI", symbol: "^KS11", region: "APAC", timeZone: "Asia/Seoul", sessions: [[540, 930]], description: "Tracks companies listed on Korea's main stock market and is the principal benchmark for South Korean equities." },
  { key: "TAIWAN", name: "Taiwan Stock Exchange (TAIEX)", symbol: "^TWII", region: "APAC", timeZone: "Asia/Taipei", sessions: [[540, 810]], description: "Tracks Taiwan Stock Exchange-listed shares and is heavily influenced by the semiconductor supply chain." },
];

function getGlobalIndexDefinition(key) {
  return GLOBAL_INDICES.find((index) => index.key.toLowerCase() === String(key || "").toLowerCase());
}

module.exports = { GLOBAL_INDICES, getGlobalIndexDefinition };
