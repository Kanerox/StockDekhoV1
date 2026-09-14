import assert from "node:assert";
import fs from "node:fs";
import { SEARCH_TOPIC_ALIASES, searchTopicSuggestion, rankSearchDefinitions } from "./searchSemantics.js";

assert.equal(SEARCH_TOPIC_ALIASES.it, "it services");
assert.deepEqual(searchTopicSuggestion("IT"), { canonical: "it services", label: "Information Technology" });
assert.equal(searchTopicSuggestion("TCS"), null, "exact ticker searches remain on the company path");
assert.equal(searchTopicSuggestion("Infosys"), null, "exact company searches remain on the company path");
const stocks = [
  { ticker: "ITC", name: "ITC Limited", sector: "Consumer Staples" },
  { ticker: "TCS", name: "Tata Consultancy Services", sector: "Information Technology" },
  { ticker: "INFY", name: "Infosys Limited", sector: "Information Technology" },
];
const score = (stock, query) => stock.ticker.toLowerCase() === query ? 1000
  : stock.ticker.toLowerCase().startsWith(query) ? 850 : -1;
const topicTickers = { "it services": ["TCS", "INFY"] };
const sectorKeys = { "it services": "Information Technology" };
assert.deepEqual(rankSearchDefinitions(stocks, "IT", topicTickers, sectorKeys, score).map((stock) => stock.ticker), ["INFY", "TCS"]);
assert.equal(rankSearchDefinitions(stocks, "ITC", topicTickers, sectorKeys, score)[0].ticker, "ITC");
const appSource = fs.readFileSync(new URL("../App.jsx", import.meta.url), "utf8");
assert.match(appSource, /showTopicFirst.*score >= 950/,
  "header autocomplete must put strong topic aliases ahead of prefix-only company matches while preserving exact companies");
assert.match(appSource, /Explore \{topicSuggestion\.label\}/,
  "the user-facing autocomplete must expose the resolved topic destination");
console.log("Production-facing search topic suggestion checks passed.");
