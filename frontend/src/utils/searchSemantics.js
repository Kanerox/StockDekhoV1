export const SEARCH_TOPIC_ALIASES = {
  india: "indian markets", indian: "indian markets", "india markets": "indian markets", nse: "indian markets", nifty: "indian markets", sensex: "indian markets",
  volatility: "india vix", vix: "india vix", "india vix": "india vix",
  bonds: "india 10y g-sec", "bond yields": "india 10y g-sec", yields: "india 10y g-sec", "government bonds": "india 10y g-sec", "g-sec": "india 10y g-sec", gsec: "india 10y g-sec", "india 10y": "india 10y g-sec",
  global: "global markets", "world markets": "global markets",
  us: "united states", usa: "united states", "us markets": "united states", "american stocks": "united states", "s&p 500": "united states", sp500: "united states", nasdaq: "united states", dow: "united states", "dow jones": "united states",
  chinese: "china", "chinese stocks": "china", "csi 300": "china", "shanghai composite": "china",
  "hang seng": "hong kong", nikkei: "japan", "nikkei 225": "japan", korea: "south korea", kospi: "south korea", taiex: "taiwan", "taiwan weighted": "taiwan",
  european: "europe", "european markets": "europe", "euro stoxx": "europe", "euro stoxx 50": "europe", uk: "united kingdom", ftse: "united kingdom", "ftse 100": "united kingdom", dax: "germany",
  ai: "artificial intelligence", "artificial intelligence": "artificial intelligence", "machine learning": "artificial intelligence",
  chip: "semiconductors", chips: "semiconductors", semiconductor: "semiconductors",
  defence: "defence", defense: "defence", bank: "banking", banks: "banking",
  insurer: "insurance", insurers: "insurance", nbfcs: "nbfc", "non banking finance": "nbfc",
  "mutual funds": "asset management", amc: "asset management", exchanges: "stock exchanges",
  auto: "automobiles", automobile: "automobiles", cars: "automobiles", ev: "electric vehicles", evs: "electric vehicles",
  telecommunications: "telecom", it: "it services", "information technology": "it services", technology: "it services", software: "it services",
  railway: "railways", airport: "aviation", airports: "aviation", port: "ports",
  utilities: "power", renewable: "renewable energy", renewables: "renewable energy", "clean energy": "renewable energy",
  oil: "oil and gas", gas: "oil and gas", metal: "metals", steel: "metals",
  chemical: "chemicals", pharma: "pharmaceuticals", pharmaceutical: "pharmaceuticals",
  health: "pharmaceuticals", healthcare: "pharmaceuticals", "health care": "pharmaceuticals", medicines: "pharmaceuticals", hospital: "hospitals", "consumer staples": "fmcg", staples: "fmcg",
  property: "real estate", electronics: "consumer electronics", jewelry: "jewellery",
  jio: "telecom", hdfc: "banking", "state bank": "banking", realty: "real estate", housing: "real estate", crude: "oil and gas", petroleum: "oil and gas", mining: "metals",
};

const TOPIC_LABELS = {
  "it services": "Information Technology",
  "india vix": "India VIX",
  "india 10y g-sec": "India 10Y G-Sec",
  "indian markets": "Indian Markets",
  "global markets": "Global Markets",
  "united states": "US Markets",
};

export function searchTopicSuggestion(query) {
  const normalized = String(query || "").toLowerCase().replace(/[^a-z0-9&]+/g, " ").trim();
  const canonical = SEARCH_TOPIC_ALIASES[normalized];
  return canonical ? { canonical, label: TOPIC_LABELS[canonical] || canonical.replace(/\b\w/g, (letter) => letter.toUpperCase()) } : null;
}
