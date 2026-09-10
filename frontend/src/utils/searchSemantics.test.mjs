import assert from "node:assert";
import fs from "node:fs";
import { SEARCH_TOPIC_ALIASES, searchTopicSuggestion } from "./searchSemantics.js";

assert.equal(SEARCH_TOPIC_ALIASES.it, "it services");
assert.deepEqual(searchTopicSuggestion("IT"), { canonical: "it services", label: "Information Technology" });
assert.equal(searchTopicSuggestion("TCS"), null, "exact ticker searches remain on the company path");
assert.equal(searchTopicSuggestion("Infosys"), null, "exact company searches remain on the company path");
const appSource = fs.readFileSync(new URL("../App.jsx", import.meta.url), "utf8");
assert.match(appSource, /showTopicFirst.*score >= 950/,
  "header autocomplete must put strong topic aliases ahead of prefix-only company matches while preserving exact companies");
assert.match(appSource, /Explore \{topicSuggestion\.label\}/,
  "the user-facing autocomplete must expose the resolved topic destination");
console.log("Production-facing search topic suggestion checks passed.");
