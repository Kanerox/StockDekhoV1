const axios = require("axios");
const zlib = require("zlib");
const universe = require("../../frontend/src/data/stockUniverse.json");

const API_URL = String(process.env.STOCKDEKHO_API_URL || "https://stockdekho-api.onrender.com/api").replace(/\/$/, "");
const MASTER_URL = "https://assets.upstox.com/market-quote/instruments/exchange/NSE.json.gz";

async function loadNseMap() {
  const response = await axios.get(MASTER_URL, { responseType: "arraybuffer", timeout: 30000 });
  const bytes = Buffer.from(response.data);
  const decoded = bytes[0] === 0x1f && bytes[1] === 0x8b ? zlib.gunzipSync(bytes) : bytes;
  const instruments = JSON.parse(decoded.toString("utf8"));
  const bySymbol = new Map();
  for (const instrument of instruments) {
    if (instrument?.segment !== "NSE_EQ" || instrument?.instrument_type !== "EQ") continue;
    const symbol = String(instrument.trading_symbol || "").toUpperCase();
    if (!symbol) continue;
    const existing = bySymbol.get(symbol) || [];
    existing.push(instrument);
    bySymbol.set(symbol, existing);
  }
  return bySymbol;
}

async function loadQuotes(symbols) {
  const chunks = [];
  for (let index = 0; index < symbols.length; index += 40) chunks.push(symbols.slice(index, index + 40));
  const responses = await Promise.all(chunks.map((chunk) => axios.get(`${API_URL}/market/stocks`, {
    params: { symbols: chunk.join(",") }, timeout: 30000,
  })));
  return responses.flatMap((response) => response.data?.stocks || []);
}

async function run() {
  const symbols = universe.map((company) => company.ticker);
  const [nseMap, quotes] = await Promise.all([loadNseMap(), loadQuotes(symbols)]);
  const quoteBySymbol = new Map(quotes.map((quote) => [quote.ticker, quote]));
  const unresolvedSymbols = [];
  const ambiguousSymbols = [];
  const unavailablePrices = [];
  const invalidCalculations = [];
  const staleSecurities = [];

  for (const symbol of symbols) {
    const mappings = nseMap.get(symbol) || [];
    if (!mappings.length) unresolvedSymbols.push(symbol);
    if (mappings.length > 1) ambiguousSymbols.push(symbol);
    const quote = quoteBySymbol.get(symbol);
    if (!quote || !Number.isFinite(quote.price) || quote.price <= 0 || !Number.isFinite(quote.previousClose) || quote.previousClose <= 0) {
      unavailablePrices.push(symbol);
      continue;
    }
    const expectedChange = quote.price - quote.previousClose;
    const expectedPercent = (expectedChange / quote.previousClose) * 100;
    if (Math.abs(expectedChange - quote.change) > 0.01 || Math.abs(expectedPercent - quote.chgPct) > 0.01) invalidCalculations.push(symbol);
    if (["stale", "expired", "invalid"].includes(quote.dataStatus) || quote.isStale) staleSecurities.push(symbol);
  }

  const summary = {
    checked: symbols.length,
    successfullyMapped: symbols.length - unresolvedSymbols.length - ambiguousSymbols.length,
    validPrices: symbols.length - unavailablePrices.length,
    unresolvedSymbols,
    ambiguousSymbols,
    unavailablePrices,
    staleSecurities,
    invalidCalculations,
    apiUrl: API_URL,
    auditedAt: new Date().toISOString(),
  };
  console.log(JSON.stringify(summary, null, 2));
  if (unresolvedSymbols.length || ambiguousSymbols.length || unavailablePrices.length || invalidCalculations.length) process.exitCode = 1;
}

run().catch((error) => {
  console.error(JSON.stringify({ error: error.message, apiUrl: API_URL }, null, 2));
  process.exitCode = 1;
});
