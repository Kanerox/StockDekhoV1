import React, { useState, useMemo, useRef, useEffect } from "react";
import { getPeerComparison, getStockQuote, getStockUniverse, getMarketPerformers } from "./api/marketApi";
import CompanyHeader from "./components/CompanyHeader";
import { getCurrencies, getCurrencyHistory } from "./api/currencyApi";
import { getCompanyEvents } from "./api/eventsApi";
import { getCompanyFinancials } from "./api/financialsApi";
import { getIndexDetail, getIndices } from "./api/indexApi";
import { getGlobalIndexDetail, getGlobalIndices } from "./api/globalIndexApi";
import { getIndiaTenYearYield } from "./api/gsecApi";
import { getCompanyNews, getGlobalIndexNews, getGlobalMarketNews, getIndiaGsecNews, getNiftyMarketEvents, getVixMarketNews } from "./api/newsApi";
import { getPerformanceHistory } from "./api/performanceApi";
import { getSectorDetail, getSectors } from "./api/sectorApi";
import stockUniverse from "./data/stockUniverse.json";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
  Legend,
} from "recharts";

import Search from "lucide-react/dist/esm/icons/search.mjs";
import ChevronDown from "lucide-react/dist/esm/icons/chevron-down.mjs";
import ChevronRight from "lucide-react/dist/esm/icons/chevron-right.mjs";
import X from "lucide-react/dist/esm/icons/x.mjs";
import Plus from "lucide-react/dist/esm/icons/plus.mjs";
import Star from "lucide-react/dist/esm/icons/star.mjs";
import StarOff from "lucide-react/dist/esm/icons/star-off.mjs";
import TrendingUp from "lucide-react/dist/esm/icons/trending-up.mjs";
import TrendingDown from "lucide-react/dist/esm/icons/trending-down.mjs";
import Info from "lucide-react/dist/esm/icons/info.mjs";
import ArrowUpRight from "lucide-react/dist/esm/icons/arrow-up-right.mjs";
import ArrowDownRight from "lucide-react/dist/esm/icons/arrow-down-right.mjs";
import FileText from "lucide-react/dist/esm/icons/file-text.mjs";
import Clock from "lucide-react/dist/esm/icons/clock.mjs";
import ChevronLeft from "lucide-react/dist/esm/icons/chevron-left.mjs";
import Bell from "lucide-react/dist/esm/icons/bell.mjs";
import Bookmark from "lucide-react/dist/esm/icons/bookmark.mjs";
import Layers from "lucide-react/dist/esm/icons/layers.mjs";
import PieChart from "lucide-react/dist/esm/icons/chart-pie.mjs";
import BarChart2 from "lucide-react/dist/esm/icons/chart-no-axes-column.mjs";
import Newspaper from "lucide-react/dist/esm/icons/newspaper.mjs";
import ShieldCheck from "lucide-react/dist/esm/icons/shield-check.mjs";
import ExternalLink from "lucide-react/dist/esm/icons/external-link.mjs";

/* =========================================================================================
   STOCKDEKHO — DATA LAYER
   -----------------------------------------------------------------------------------------
   Two tiers of data, deliberately distinguished throughout the UI:

   1) LIVE-ANCHORED  (flag: live === true)
      Real NSE/BSE reference values gathered via live web search on 26 Jul 2026, for the
      last completed trading session (Fri 24 Jul 2026, unless noted otherwise per item).
      This covers: all 8 benchmark indices, 5 large-cap stocks (RELIANCE, TCS, SBIN,
      ICICIBANK, LT), and all 5 currency pairs. These are snapshots, not a live feed —
      there is no auto-refresh. Refresh by asking Claude to re-pull current levels.

   2) DEMO / ILLUSTRATIVE (flag: live === false, or fundamentals in general)
      Everything else — the broader stock universe, all financial statements, valuation
      history, ownership, corporate events, and every day-by-day historical price series
      (even for the 5 live-anchored stocks; multi-year daily series were not fetched).
      Demo series are seeded deterministically so the app is internally consistent and
      reloadable, but they are not real historical prints.
   ========================================================================================= */

const SNAPSHOT_META = {
  indicesAsOf: "24 Jul 2026 (last NSE/BSE close)",
  stocksAsOf: "sourced 24–26 Jul 2026 (see per-stock note)",
  fetchedAt: "26 Jul 2026",
};

// ---- deterministic PRNG so demo series are stable across renders ----
function seedRandom(seed) {
  let s = 0;
  for (let i = 0; i < seed.length; i++) s = (s * 31 + seed.charCodeAt(i)) >>> 0;
  return function () {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function genSeries(seed, points, endValue, volatility = 0.012) {
  const rnd = seedRandom(seed);
  const arr = new Array(points);
  arr[points - 1] = endValue;
  let v = endValue;
  for (let i = points - 2; i >= 0; i--) {
    const drift = (rnd() - 0.505) * volatility;
    v = v / (1 + drift);
    arr[i] = v;
  }
  // light smoothing
  const out = arr.map((x) => Math.round(x * 100) / 100);
  out[points - 1] = endValue;
  return out;
}

function makeDateLabels(n, unit = "d") {
  const today = new Date(2026, 6, 24); // 24 Jul 2026
  const labels = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today);
    if (unit === "d") d.setDate(d.getDate() - i);
    if (unit === "w") d.setDate(d.getDate() - i * 7);
    if (unit === "m") d.setMonth(d.getMonth() - i);
    labels.push(d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: unit === "m" ? "2-digit" : undefined }));
  }
  return labels;
}

function sparkPoints(seed, endValue, n = 24) {
  return genSeries(seed, n, endValue, 0.01);
}

// ---- shared extended return-period support, used across all detail and comparison pages ----
const EXTENDED_RANGES = ["1W", "1M", "3M", "6M", "9M", "YTD", "1Y", "3Y", "5Y", "10Y", "SI"];
const RANGE_TRADING_DAYS = {
  "1D": 2, "1W": 6, "1M": 22, "3M": 66, "6M": 130, "9M": 195, "1Y": 250, "2Y": 500, "3Y": 750,
  "5Y": 1250, "10Y": 2500, YTD: 145, SI: 1800, Max: 1800,
};
function getSeriesForRange(seedKey, endValue, rangeKey, customRange, volatility = 0.02) {
  if (rangeKey === "Custom" && customRange && customRange.start && customRange.end) {
    const days = Math.max(5, Math.min(3000, Math.round((new Date(customRange.end) - new Date(customRange.start)) / 86400000)));
    return genSeries(`${seedKey}CUSTOM${customRange.start}${customRange.end}`, days, endValue, volatility);
  }
  const days = RANGE_TRADING_DAYS[rangeKey] || 250;
  return genSeries(seedKey + rangeKey, days, endValue, volatility);
}
// Demo return magnitude for a given lookback period — used by interactive benchmark/currency cards.
const PERIOD_MAGNITUDE = { "1D": 2, "1W": 4, "1M": 7, SI: 180, YTD: 14, "3M": 9, "6M": 15, "9M": 19, "1Y": 22, "3Y": 55, "5Y": 85, "10Y": 160, Max: 190, Custom: 12 };
function demoPeriodReturn(seed, period) {
  const rnd = seedRandom(seed + "RET" + period);
  const magnitude = PERIOD_MAGNITUDE[period] || 20;
  return +((rnd() - 0.42) * magnitude).toFixed(2);
}
function demoSmallReturn(seed, magnitude) {
  const rnd = seedRandom(seed);
  return +((rnd() - 0.48) * magnitude).toFixed(2);
}

function parseNewsDate(value) {
  if (!value) {
    return null;
  }

  const rawValue = String(value).trim();

  // Converts:
  // 2026-08-02 11:14:10 +0000
  // into:
  // 2026-08-02T11:14:10+00:00
  const normalizedValue = rawValue
    .replace(
      /^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})\s+([+-]\d{2})(\d{2})$/,
      "$1T$2$3:$4"
    )
    // Converts microseconds such as .000000Z to milliseconds.
    .replace(
      /\.(\d{3})\d+(Z|[+-]\d{2}:?\d{2})$/,
      ".$1$2"
    );

  const parsedDate = new Date(
    normalizedValue
  );

  return Number.isNaN(
    parsedDate.getTime()
  )
    ? null
    : parsedDate;
}

function isTodayOrYesterdayNews(value) {
  const date = parseNewsDate(value);
  if (!date || date.getTime() > Date.now()) return false;
  const dateKey = (item) => item.toLocaleDateString("en-CA", {
    timeZone: "Asia/Kolkata",
  });
  const today = dateKey(new Date());
  const yesterday = dateKey(new Date(Date.now() - 24 * 60 * 60 * 1000));
  return dateKey(date) === today || dateKey(date) === yesterday;
}

function formatNewsDate(value) {
  const parsedDate =
    parseNewsDate(value);

  if (!parsedDate) {
    return "Date unavailable";
  }

  return parsedDate.toLocaleString(
    "en-IN",
    {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Kolkata",
      timeZoneName: "short",
    }
  );
}

function newsDateTimestamp(value) {
  return parseNewsDate(value)?.getTime() || 0;
}


/* ---------------------------- Benchmark indices (LIVE) ---------------------------- */
const INDICES = [
  {
    key: "NIFTY50", name: "Nifty 50", value: 23767.45, chg: -102.15, chgPct: -0.43,
    low52: 22182.55, high52: 26373.2, live: true, sourceDate: "24 Jul 2026 close",
  },
  {
    key: "NEXT50", name: "Nifty Next 50", value: 71766.0, chg: -71.9, chgPct: -0.1,
    live: true, approx: true, sourceDate: "aggregator ref., mid-Jul 2026",
  },
  {
    key: "MIDCAP150", name: "Nifty Midcap 150", value: 23114.4, chg: 258.4, chgPct: 1.13,
    low52: 19218.0, high52: 23138.9, live: true, approx: true, sourceDate: "10 Jul 2026",
  },
  {
    key: "SMALLCAP250", name: "Nifty Smallcap 250", value: 17601.2, chg: -49.3, chgPct: -0.28,
    live: true, approx: true, sourceDate: "aggregator ref., mid-Jul 2026",
  },
  {
    key: "NIFTY500", name: "Nifty 500", value: 22913, chg: -68.9, chgPct: -0.3,
    low52: 20386, high52: 24144, live: true, sourceDate: "24 Jul 2026 close",
  },
  {
    key: "BANKNIFTY", name: "Nifty Bank", value: 56173.85, chg: -418.15, chgPct: -0.74,
    low52: 49954.85, high52: 61764.85, live: true, sourceDate: "24 Jul 2026",
  },
  {
    key: "VIX", name: "India VIX", value: 14.03, chg: 0.55, chgPct: 4.08,
    low52: 8.72, high52: 28.91, live: true, sourceDate: "24/25 Jul 2026", isVix: true,
  },
  {
    key: "SENSEX", name: "S&P BSE Sensex", value: 76059.77, chg: -331.62, chgPct: -0.43,
    live: true, sourceDate: "24 Jul 2026 close",
  },
].map((idx) => ({ ...idx, spark: sparkPoints(idx.key, idx.value) }));

const DEMO_MARKET_INDICES = [
  {
    key: "MIDCAP150",
    name: "Nifty Midcap 150",
    value: 23114.4,
    oneMonthReturn: 2.4,
  },
  {
    key: "SMALLCAP250",
    name: "Nifty Smallcap 250",
    value: 17601.2,
    oneMonthReturn: -1.7,
  },
  {
    key: "NIFTY500",
    name: "Nifty 500",
    value: 22913,
    oneMonthReturn: 0.8,
  },
].map((idx) => ({
  ...idx,
  demo: true,
  sparkline: genSeries(`${idx.key}MARKETCARD`, 22, idx.value, 0.012),
}));

const DEMO_INDEX_DETAILS = {
  MIDCAP150: {
    description: "Illustrative view of a diversified basket of mid-sized Indian companies positioned between large-cap leaders and smaller emerging businesses.",
    tickers: ["IDFCFIRSTB", "BIOCON", "IDEA", "OBEROIRLTY", "TATACONSUM"],
    news: [
      ["Mid-cap companies balance domestic growth with tighter funding conditions", "Sample market context illustrating how borrowing costs and domestic demand can affect mid-sized businesses."],
      ["Industrial and consumer names lead an illustrative mid-cap session", "Sample commentary showing how sector leadership may influence a diversified mid-cap benchmark."],
      ["Earnings dispersion remains a key theme across mid-sized companies", "Sample report highlighting why company-level execution matters within the mid-cap universe."],
    ],
  },
  SMALLCAP250: {
    description: "Illustrative view of smaller listed Indian companies, a segment often associated with higher growth potential, lower liquidity and greater volatility.",
    tickers: ["KARURVYSYA", "DABUR", "IOC", "TATASTEEL", "BIOCON"],
    news: [
      ["Small-cap breadth improves in an illustrative risk-on session", "Sample market context showing how broader participation can support smaller-company benchmarks."],
      ["Liquidity and earnings quality remain in focus for smaller companies", "Sample report explaining two factors commonly monitored across the small-cap segment."],
      ["Domestic demand themes support selected smaller-company shares", "Sample commentary illustrating how local consumption and investment cycles can affect the universe."],
    ],
  },
  NIFTY500: {
    description: "Illustrative broad-market benchmark spanning large-, mid- and small-cap Indian companies across the major sectors of the listed equity market.",
    tickers: ["RELIANCE", "TCS", "HDFCBANK", "ICICIBANK", "SBIN", "INFY", "ITC", "LT"],
    news: [
      ["Broad-market performance remains mixed across sectors", "Sample market context illustrating how leadership can rotate between large-, mid- and small-cap companies."],
      ["Financials and technology shape an illustrative broad-index session", "Sample report showing how heavily represented sectors can influence a diversified benchmark."],
      ["Market breadth offers context beyond headline index moves", "Sample commentary explaining why participation across the wider listed universe matters."],
    ],
  },
};

const VIX_SCHEDULED_EVENTS_2026 = [
  {
    date: "2026-08-03",
    endDate: "2026-08-05",
    category: "Central Bank",
    event: "RBI Monetary Policy Committee meeting",
    whyItMatters: "Rate, liquidity and guidance surprises can quickly change equity-option premiums.",
    source: "RBI schedule",
    sourceUrl: "https://www.rbi.org.in/",
  },
  {
    date: "2026-08-03",
    category: "Election",
    event: "Assembly by-election vote counting",
    whyItMatters: "Unexpected political outcomes can temporarily increase domestic policy uncertainty.",
    source: "Election Commission of India",
    sourceUrl: "https://www.eci.gov.in/eci/public/api/document?id=17436",
  },
  {
    date: "2026-08-12",
    category: "Inflation",
    event: "India Consumer Price Index release",
    whyItMatters: "Inflation affects rate expectations, bond yields and equity valuations.",
    source: "MoSPI release calendar",
    sourceUrl: "https://mospi.gov.in/advance-release-calendar",
  },
  {
    date: "2026-08-31",
    category: "Growth",
    event: "India Q1 FY2026–27 GDP estimates",
    whyItMatters: "A material growth surprise can change earnings expectations and risk appetite.",
    source: "MoSPI release calendar",
    sourceUrl: "https://mospi.gov.in/advance-release-calendar",
  },
  {
    date: "2026-10-05",
    endDate: "2026-10-07",
    category: "Central Bank",
    event: "RBI Monetary Policy Committee meeting",
    whyItMatters: "Policy decisions and forward guidance can affect banks, the rupee and index volatility.",
    source: "RBI schedule",
    sourceUrl: "https://www.rbi.org.in/",
  },
  {
    date: "2026-10-12",
    category: "Inflation",
    event: "India Consumer Price Index release",
    whyItMatters: "Inflation surprises can alter the expected path of monetary policy.",
    source: "MoSPI release calendar",
    sourceUrl: "https://mospi.gov.in/advance-release-calendar",
  },
  {
    date: "2026-11-30",
    category: "Growth",
    event: "India Q2 FY2026–27 GDP estimates",
    whyItMatters: "The release provides a broad update on economic momentum and corporate demand.",
    source: "MoSPI release calendar",
    sourceUrl: "https://mospi.gov.in/advance-release-calendar",
  },
  {
    date: "2026-12-02",
    endDate: "2026-12-04",
    category: "Central Bank",
    event: "RBI Monetary Policy Committee meeting",
    whyItMatters: "Year-end policy and liquidity signals can influence positioning and option demand.",
    source: "RBI schedule",
    sourceUrl: "https://www.rbi.org.in/",
  },
  {
    date: "2026-12-12",
    category: "Inflation",
    event: "India Consumer Price Index release",
    whyItMatters: "The final scheduled 2026 inflation release can influence year-end rate expectations.",
    source: "MoSPI release calendar",
    sourceUrl: "https://mospi.gov.in/advance-release-calendar",
  },
];

function buildDemoIndexDetail(indexKey, range) {
  const config = DEMO_INDEX_DETAILS[indexKey];
  const card = DEMO_MARKET_INDICES.find((idx) => idx.key === indexKey);
  const snapshot = INDICES.find((idx) => idx.key === indexKey);
  const pointCount = Math.max(2, RANGE_TRADING_DAYS[range] || 250);
  const values = genSeries(`${indexKey}DETAIL${range}`, pointCount, card.value, 0.009);
  const today = new Date();
  const points = values.map((adjustedClose, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (values.length - 1 - index));
    return {
      date: date.toISOString().slice(0, 10),
      adjustedClose,
    };
  });

  return {
    key: indexKey,
    name: card.name,
    description: config.description,
    demo: true,
    value: card.value,
    changePercent: snapshot?.chgPct ?? 0,
    low52: snapshot?.low52 ?? Math.min(...values),
    high52: snapshot?.high52 ?? Math.max(...values),
    periodReturn: values[0] ? ((values[values.length - 1] / values[0]) - 1) * 100 : null,
    periodHigh: Math.max(...values),
    periodLow: Math.min(...values),
    points,
    constituents: config.tickers
      .map((ticker) => STOCKS_BY_TICKER[ticker])
      .filter(Boolean)
      .map((stock) => ({
        ticker: stock.ticker,
        name: stock.name,
        price: stock.price,
        chgPct: stock.chgPct,
        pe: stock.pe,
        ret1y: stock.ret1y,
        demo: true,
      })),
  };
}

/* ---------------------------- Sectors ---------------------------- */
const SECTOR_LIST = [
  "Financials", "Information Technology", "Energy", "Consumer Staples", "Consumer Discretionary",
  "Health Care", "Industrials", "Materials", "Utilities", "Communication Services", "Real Estate",
];

// Maps each Sector Classification group to the most relevant official NSE/BSE benchmark index.
const SECTOR_INDEX_MAP = {
  Financials: "Nifty Bank",
  "Information Technology": "Nifty IT",
  Energy: "Nifty Energy",
  "Consumer Staples": "Nifty FMCG",
  "Consumer Discretionary": "Nifty Auto / Consumer Durables",
  "Health Care": "Nifty Healthcare",
  Industrials: "Nifty Infrastructure",
  Materials: "Nifty Metal",
  Utilities: "BSE Utilities",
  "Communication Services": "Nifty Telecommunications",
  "Real Estate": "Nifty Realty",
};

const SECTOR_PERF_SEED = {
  Financials: { w1: -0.9, m1: 1.8, m6: 6.4, y1: 11.2, leader: "ICICIBANK", lagger: "IDFCFIRSTB" },
  "Information Technology": { w1: 1.6, m1: 2.9, m6: -3.1, y1: -8.4, leader: "HCLTECH", lagger: "INFY" },
  Energy: { w1: -1.4, m1: -0.6, m6: 4.1, y1: 9.8, leader: "RELIANCE", lagger: "IOC" },
  "Consumer Staples": { w1: 0.4, m1: 1.1, m6: 3.7, y1: 6.9, leader: "ITC", lagger: "DABUR" },
  "Consumer Discretionary": { w1: -1.8, m1: -3.4, m6: -1.2, y1: 4.5, leader: "TITAN", lagger: "MARUTI" },
  "Health Care": { w1: 0.8, m1: 2.4, m6: 8.9, y1: 15.6, leader: "SUNPHARMA", lagger: "BIOCON" },
  Industrials: { w1: -1.1, m1: -2.2, m6: 2.6, y1: 10.1, leader: "LT", lagger: "SIEMENS" },
  Materials: { w1: -2.3, m1: -4.1, m6: -2.8, y1: -1.6, leader: "ULTRACEMCO", lagger: "TATASTEEL" },
  Utilities: { w1: 0.2, m1: 0.9, m6: 5.3, y1: 12.7, leader: "NTPC", lagger: "POWERGRID" },
  "Communication Services": { w1: -0.5, m1: 1.4, m6: 7.2, y1: 18.3, leader: "BHARTIARTL", lagger: "IDEA" },
  "Real Estate": { w1: -2.6, m1: -5.2, m6: -4.4, y1: -6.1, leader: "DLF", lagger: "OBEROIRLTY" },
};

// Editorial "why it matters" news per sector — demo/illustrative, dated around the live snapshot window.
const SECTOR_NEWS = {
  Financials: [
    { date: "22 Jul 2026", title: "FIIs net sellers for a second straight session in banking stocks",
      teaser: "Large-cap private banks carry heavy FII ownership, so flow reversals move the sector index disproportionately.",
      body: "Foreign institutional investors were net sellers of Indian banking stocks for a second consecutive session, extending a pattern of profit-taking after a strong run in private-sector lenders through the first half of the year. Large private banks such as ICICI Bank and Axis Bank carry some of the highest FII ownership in the Nifty Bank index, so even modest changes in allocation from overseas funds tend to move the sector benchmark disproportionately relative to its weight in the broader market. The selling has been attributed largely to global portfolio rebalancing ahead of key central bank decisions rather than to any India-specific concern, though it has still weighed on sentiment across the lending space. For investors tracking the sector, sustained multi-day FII selling is generally read as a flow dynamic rather than a fundamental one — it says more about global capital allocation than about the underlying health of Indian banks' loan books.",
      companies: ["ICICIBANK", "AXISBANK", "HDFCBANK"], source: "Bloomberg" },
    { date: "16 Jul 2026", title: "HDFC Bank and Axis Bank both fall sharply after Q1 results",
      teaser: "Asset-quality commentary from the two largest private lenders often sets the tone for the whole banking complex.",
      body: "Shares of HDFC Bank and Axis Bank both declined sharply after their respective first-quarter results, as management commentary on asset quality and slower-than-expected deposit growth disappointed investors positioned for a stronger print. Both lenders flagged incremental stress in specific unsecured retail segments, along with continued pressure on net interest margins as deposit costs stayed elevated relative to loan repricing. As the two largest private-sector banks by market capitalisation, their results are widely used as an early read-through for the rest of the sector, and the shared weakness pulled smaller private and public-sector lenders lower in sympathy through the session. Analysts noted that the underlying loan growth trajectory remained broadly intact even as near-term profitability metrics came in softer, framing this as a margin story rather than a credit-quality one for now.",
      companies: ["HDFCBANK", "AXISBANK"], source: "CNBC-TV18" },
    { date: "05 Jul 2026", title: "RBI keeps repo rate unchanged, flags inflation watch",
      teaser: "Rate decisions directly affect net interest margins across the sector's lenders and NBFCs.",
      body: "The Reserve Bank of India's monetary policy committee held the repo rate unchanged at its latest meeting, citing the need to monitor inflation trends before committing to further easing. The central bank's statement struck a cautious tone, noting that food price volatility could keep headline inflation elevated in the near term even as core inflation trends remained benign. For banks and non-banking financial companies, the rate decision matters directly: a longer pause extends the period of tighter net interest margins for institutions that have already passed through most of the previous rate cuts to depositors, while it also keeps borrowing costs steady for corporate and retail loan books. Sector participants broadly read the decision as in line with expectations, with market attention now shifting to the RBI's forward guidance and the pace of liquidity management operations through the rest of the year.",
      companies: ["SBIN", "HDFCBANK", "ICICIBANK"], source: "Reuters" },
  ],
  "Information Technology": [
    { date: "24 Jul 2026", title: "TCS posts stable Q1 FY27 revenue, 24% margin, $9.5B order book",
      teaser: "As the sector's bellwether, TCS's order book trend is widely read as a proxy for enterprise IT demand.",
      body: "Tata Consultancy Services reported first-quarter results broadly in line with expectations, holding operating margin at 24% while reporting a $9.5 billion order book for the period. Management pointed to continued momentum in AI-linked engagements and steady demand from BFSI and manufacturing clients, even as they acknowledged some caution in discretionary technology spending among North American accounts. As India's largest IT services company, TCS's quarterly commentary functions as an early industry-wide demand signal, and its steady print offered some reassurance to a sector that has faced guidance cuts from other large players this earnings season. The stock itself traded in a narrow range, suggesting the results were largely priced in, but peers were watched closely for confirming or diverging signals on the same demand themes.",
      companies: ["TCS"], source: "Business Standard" },
    { date: "23 Jul 2026", title: "Infosys trims FY27 revenue growth guidance",
      teaser: "A guidance cut from a top-three IT services firm often re-rates growth expectations across peers.",
      body: "Infosys lowered its full-year revenue growth guidance, citing softer discretionary spending among a handful of large clients and delays in ramping up newly signed projects within its communications and hi-tech verticals. The company held its operating margin guidance steady, attributing this to continued cost discipline and productivity gains from internal automation and AI tooling, even as top-line growth expectations came down. Because Infosys is one of the two largest Indian IT services companies by market capitalisation, guidance revisions of this kind tend to be read across the sector as a broader data point on enterprise technology budgets, rather than treated purely as a company-specific development, and several mid-cap IT peers traded weaker in sympathy on the day. Investors will be watching whether the next round of large-deal signings in the current quarter validates management's view that the underlying pipeline remains healthy despite the slower revenue conversion.",
      companies: ["INFY"], source: "Mint" },
    { date: "24 Jul 2026", title: "HCL Technologies and Wipro among the day's strongest large caps",
      teaser: "Relative outperformance during a broad market decline signals defensive positioning in IT services.",
      body: "HCL Technologies and Wipro were among the strongest large-cap performers on a day when the broader market fell for a fifth consecutive session, with the divergence coming a day after Infosys trimmed its growth guidance and the same morning TCS posted steady results. The relative strength suggests investors are differentiating between company-specific guidance commentary and a broader sector read, rather than treating the entire IT services space as uniformly weaker. Part of the move may also reflect sector rotation, as capital shifted away from energy and auto names hit by the day's crude-oil spike and toward relatively defensive, lower-capex businesses like IT services. For sector-level research, a divergence of this kind is a useful reminder that reading IT services purely through a single bellwether's results can understate the dispersion in performance across constituents on any given day.",
      companies: ["HCLTECH", "WIPRO"], source: "Economic Times" },
  ],
  Energy: [
    { date: "24 Jul 2026", title: "Brent crude tops $100/bbl on renewed Middle East tensions",
      teaser: "Higher crude raises input costs for refiners and import-dependent energy names, while benefiting upstream producers.",
      body: "Brent crude futures pushed past $100 a barrel after reports of renewed military tension along a key Middle Eastern shipping corridor raised concerns about potential supply disruption, extending a rally that had already been building through the week. For India, which imports the large majority of its crude requirement, a sustained move above this level flows through quickly into the trade deficit and the currency, and typically pressures margins at downstream refiners and fuel retailers even as it benefits upstream and gas-linked producers with exposure to higher realisations. Diversified energy majors with both upstream and downstream operations, such as Reliance Industries, tend to see a more mixed impact than pure-play refiners, since higher crude can lift petrochemical feedstock costs while also supporting exploration economics. Investors in the sector are watching whether the price move proves durable or unwinds quickly, since the earnings impact differs materially between a brief spike and a sustained repricing of the oil market.",
      companies: ["RELIANCE", "IOC"], source: "Reuters" },
    { date: "20 Jul 2026", title: "Government reviews windfall tax framework on fuel exports",
      teaser: "Policy changes on export levies directly affect refining margins for integrated energy majors.",
      body: "The government is reviewing its windfall tax framework on fuel exports, a levy structure introduced in prior years to capture a share of unusually high refining margins during periods of elevated crude prices. Any change to the framework — whether an adjustment to the trigger threshold or the levy rate itself — has a direct bearing on the export economics for integrated refiners that sell diesel and other fuels into international markets when domestic realisations are less attractive. A more lenient framework would generally support refining margins for companies with meaningful export volumes, while a tighter one could compress them at a time when crude costs are already rising. The review is being closely watched by energy-sector analysts, since export tax policy has historically been a source of earnings volatility for the sector independent of underlying commodity price movements.",
      companies: ["RELIANCE"], source: "Economic Times" },
  ],
  "Consumer Staples": [
    { date: "24 Jul 2026", title: "ITC among the session's stronger large-cap gainers",
      teaser: "Staples names often see relative demand during broad market weakness due to their defensive earnings profile.",
      body: "ITC was among the stronger large-cap performers in a session that saw the broader market decline for a fifth straight day, consistent with the classic defensive behaviour of consumer staples stocks during periods of broader market weakness. Staples businesses derive the bulk of their revenue from everyday, non-discretionary purchases, which makes their near-term earnings less sensitive to the macro anxieties — in this case, a crude-oil spike and continued FII selling — that were driving the rest of the market lower. The relative outperformance does not necessarily reflect any company-specific catalyst; it is more a reflection of investors rotating toward earnings stability when broader sentiment turns cautious. For sector watchers, this kind of defensive rotation is worth distinguishing from genuine fundamental improvement, since it tends to unwind once broader risk appetite recovers.",
      companies: ["ITC"], source: "Economic Times" },
    { date: "12 Jul 2026", title: "Rural demand recovery cited in FMCG channel checks",
      teaser: "Rural volume growth is a key swing factor for staples companies with large mass-market portfolios.",
      body: "Recent channel checks across the FMCG distribution network point to an early recovery in rural demand, following several quarters of softer volume growth outside major urban centres. Distributors cited improved offtake in personal care and packaged food categories, which industry participants have linked to a combination of a favourable monsoon outlook and targeted rural income-support measures. Rural markets represent a disproportionately large share of volume — as opposed to value — for mass-market staples companies, which makes this trend a meaningful swing factor for full-year volume growth even before it shows up clearly in reported numbers. Analysts caution that channel checks are directional rather than definitive, and that the next one or two quarters of reported results will be needed to confirm whether the recovery is broad-based or concentrated in specific categories and geographies.",
      companies: ["ITC", "TATACONSUM", "DABUR"], source: "Mint" },
  ],
  "Consumer Discretionary": [
    { date: "18 Jul 2026", title: "Passenger vehicle sales moderate amid high base effect",
      teaser: "Monthly volume data is a leading indicator for auto-sector earnings and inventory trends.",
      body: "Passenger vehicle sales moderated in the latest monthly data, with industry participants attributing much of the slowdown to a high base effect following unusually strong volumes in the same period last year, rather than to a fresh deterioration in underlying demand. Dealer inventory levels ticked up modestly as a result, a metric closely watched because elevated inventory typically precedes discounting activity that can compress near-term realisations even when unit volumes hold up. Passenger vehicle data is one of the more timely, monthly-frequency indicators available for the broader consumer discretionary sector, which is why it tends to move auto-linked stocks ahead of formal quarterly results. Segment-level detail showed SUVs continuing to outperform smaller hatchbacks, a mix shift that has generally supported realisations and margins across the industry even as overall unit growth has cooled.",
      companies: ["MARUTI", "M&M"], source: "Business Standard" },
    { date: "24 Jul 2026", title: "Mahindra & Mahindra among the day's weaker large caps",
      teaser: "Stock-specific weakness in a bellwether auto name can weigh on sentiment across the broader sector.",
      body: "Mahindra & Mahindra was among the session's weaker large-cap performers, part of a broader decline in auto and metal names that were disproportionately affected by the day's spike in crude oil prices given their sensitivity to input costs and consumer discretionary spending. As one of the largest and most closely tracked names in the auto sector, weakness in M&M shares tends to weigh on sentiment across smaller component makers and dealership-linked businesses even when the underlying cause is macro rather than company-specific. There was no stock-specific news attributed to the move, reinforcing the read that this was a sector-wide reaction to the crude price spike rather than an M&M-specific development. Investors focused on the sector will typically look through single-session moves of this kind unless they persist alongside deteriorating volume or margin data in subsequent updates.",
      companies: ["M&M", "MARUTI"], source: "Economic Times" },
  ],
  "Health Care": [
    { date: "14 Jul 2026", title: "Sun Pharma's Organon-related specialty portfolio in focus after regulatory update",
      teaser: "Specialty and generics approvals materially affect near-term revenue visibility for pharma majors.",
      body: "Sun Pharmaceutical Industries' specialty portfolio, which includes products originating from its Organon-related licensing arrangements, came into focus after a regulatory update affecting the approval timeline for a key dermatology asset. Specialty drugs typically carry meaningfully higher margins than the company's base generics business, so shifts in their approval or launch timeline have an outsized effect on near-term revenue and margin visibility relative to their share of total volume. The update was described by industry trackers as a procedural delay rather than a rejection, meaning the ultimate approval outlook remains intact even as the near-term revenue contribution shifts by a quarter or two. For pharma-sector investors, distinguishing between specialty and generics revenue streams is important, since the two segments carry very different margin and growth profiles even within the same company.",
      companies: ["SUNPHARMA"], source: "Livemint" },
    { date: "02 Jul 2026", title: "US FDA issues fresh facility observations for a mid-cap generics exporter",
      teaser: "Regulatory actions on manufacturing facilities can disrupt export timelines across the pharma sector.",
      body: "The US Food and Drug Administration issued a fresh set of facility observations following a routine inspection of a mid-cap Indian generics exporter's manufacturing site, flagging documentation and quality-control process gaps that will need to be addressed before the facility can resume its full export cadence to the US market. Observations of this kind are a routine part of the FDA's inspection process and do not necessarily indicate a serious safety issue, but they can still disrupt near-term export timelines and shipment schedules while the company works through a remediation plan. For the broader pharma and generics sector, US regulatory actions on any single facility are watched closely because they can serve as an early signal of inspection intensity that may extend to other exporters' facilities in subsequent cycles. Analysts typically wait for the company's formal response and remediation timeline before assessing the likely earnings impact.",
      companies: ["BIOCON"], source: "Reuters" },
    { date: "28 Jun 2026", title: "Hospital chains report steady occupancy growth in Q1 updates",
      teaser: "Occupancy and ARPOB trends are core operating metrics for the healthcare-delivery sub-segment.",
      body: "Listed hospital chains reported steady occupancy growth in their first-quarter business updates, with average revenue per occupied bed (ARPOB) also trending higher as case mix continued to shift toward higher-value specialty treatments. These two metrics — occupancy and ARPOB — are the core operating indicators for the healthcare-delivery sub-segment, functioning similarly to same-store sales growth in retail, and are typically disclosed ahead of full financial results as an early read on the quarter. The updates suggest continued post-pandemic normalisation in elective procedure volumes alongside steady expansion in insurance penetration, both of which have supported the sub-segment's growth over the past several quarters. Healthcare-delivery businesses are typically viewed as a more domestically driven, less globally cyclical part of the broader health care sector compared with export-oriented pharma and generics names.",
      companies: ["SUNPHARMA"], source: "CNBC-TV18" },
  ],
  Industrials: [
    { date: "24 Jul 2026", title: "L&T shares ease modestly in a broadly weak session",
      teaser: "As the sector's largest constituent by weight, L&T's order-inflow commentary anchors sentiment for capital goods.",
      body: "Larsen & Toubro shares eased modestly in a session where the broader market declined for a fifth consecutive day, with the move broadly tracking the market rather than reflecting any company-specific development. As the largest constituent by weight in the industrials and capital goods space, L&T's stock performance and order-inflow commentary function as an anchor for sentiment across the broader engineering and construction sector, and smaller capital goods names often trade in sympathy with its moves even absent their own company-specific news. The company's order book and execution pipeline remain closely tied to public infrastructure capex cycles, which is why investors in the sector pay close attention to government budget allocations and project award data alongside quarterly results. Today's move was read by sector analysts as noise within a broader market pullback rather than a signal about the underlying capex cycle.",
      companies: ["LT"], source: "Business Standard" },
    { date: "10 Jul 2026", title: "Government capex allocation for infrastructure reviewed mid-year",
      teaser: "Public capex trends are a primary demand driver for engineering & construction order books.",
      body: "The government conducted its scheduled mid-year review of infrastructure capital expenditure allocation, assessing the pace of spending against full-year budget targets across roads, railways and urban infrastructure programmes. Public capex has been one of the primary demand drivers for engineering and construction order books over the past several years, making the pace and composition of this spending a key input for industrials-sector earnings visibility. The review indicated spending was broadly on track against annual targets, with some categories running ahead of schedule and others facing execution delays typical of large infrastructure programmes. For sector investors, the mid-year checkpoint is useful less for any single data point and more as a directional signal on whether full-year capex guidance is likely to be met, which in turn affects the order-inflow outlook for listed engineering and construction companies.",
      companies: ["LT"], source: "Mint" },
  ],
  Materials: [
    { date: "22 Jul 2026", title: "Global steel prices soften on oversupply concerns",
      teaser: "Commodity price cycles flow directly into realisations for metals and cement producers.",
      body: "Global steel prices softened over the past week on concerns about oversupply from major exporting nations, extending a period of pricing pressure that has weighed on realisations for steel producers across several markets, including India. Because steel and cement producers largely sell into commodity markets where prices are set globally or regionally rather than company by company, movements of this kind flow through directly into revenue per tonne even when a company's own production volumes and cost structure remain unchanged. Domestic steelmakers have some insulation from global oversupply through import duties and freight costs that favour local production, but sustained global price weakness still exerts downward pressure on domestic pricing power over time. Materials-sector investors typically track global price benchmarks alongside company-specific volume and cost data, since the commodity cycle often has a larger near-term effect on earnings than company-level operational execution.",
      companies: ["TATASTEEL"], source: "Reuters" },
    { date: "24 Jul 2026", title: "UltraTech Cement fixes 30 Jul 2026 as dividend record date",
      teaser: "Corporate actions from sector heavyweights are relevant context even when not price-moving.",
      body: "UltraTech Cement confirmed 30 July 2026 as the record date for the dividend it had previously announced alongside its full-year results, a routine administrative confirmation rather than a new financial disclosure since the dividend amount itself was set out earlier. Shareholders on the company's register as of the record date will be eligible for the payout, with the stock expected to trade ex-dividend a day or two prior in line with standard settlement conventions. As the largest cement producer by capacity in the materials sector, corporate actions and capital-allocation decisions from UltraTech are watched as a reference point for how well-capitalised producers are choosing to deploy cash — dividends versus capacity expansion versus debt reduction — at a time when the sector is navigating a softer pricing environment for building materials more broadly.",
      companies: ["ULTRACEMCO"], source: "NSE Corporate Announcements" },
  ],
  Utilities: [
    { date: "08 Jul 2026", title: "Power demand rises on seasonal cooling load",
      teaser: "Utilities revenue is closely tied to electricity demand cycles, especially in peak summer months.",
      body: "Electricity demand rose across several states as seasonal cooling load picked up during peak summer months, with grid operators reporting higher peak-hour consumption compared with the same period last year. Because utilities revenue is directly linked to units of power generated, transmitted and distributed, seasonal demand cycles of this kind have a fairly mechanical effect on near-term revenue for generation and distribution companies, distinct from the longer-term structural growth drivers like industrial electrification and renewable capacity additions. Grid operators noted that supply kept pace with the higher demand without major outages, a reassuring sign for the sector's operational reliability during peak-load periods. For utilities investors, seasonal demand swings are generally treated as a predictable, recurring pattern rather than a meaningful signal about the sector's medium-term earnings trajectory.",
      companies: ["NTPC", "POWERGRID"], source: "Economic Times" },
    { date: "01 Jul 2026", title: "Transmission capex plans reviewed for FY27",
      teaser: "Grid investment plans shape medium-term earnings visibility for transmission-focused utilities.",
      body: "Transmission-focused utilities and the sector regulator reviewed capital expenditure plans for FY27, with a particular focus on grid infrastructure needed to integrate rising renewable energy capacity into the national network. Transmission capex plans are a key input for medium-term earnings visibility at grid-focused utilities, since regulated returns on newly commissioned transmission assets form a predictable, multi-year revenue stream once projects are completed and put into service. The review pointed to continued elevated investment levels as renewable capacity additions continue to outpace the buildout of transmission infrastructure needed to evacuate that power to demand centres, a gap that has been a recurring theme in sector commentary. Utilities-sector investors generally view a larger, well-funded transmission capex pipeline positively, since it supports a longer runway of regulated asset growth even though it requires sustained capital investment in the interim.",
      companies: ["POWERGRID", "NTPC"], source: "Mint" },
  ],
  "Communication Services": [
    { date: "15 Jul 2026", title: "Telecom tariff hike speculation resurfaces ahead of festive season",
      teaser: "ARPU trajectory is the single biggest swing factor for telecom operator earnings.",
      body: "Speculation about another round of telecom tariff increases resurfaced ahead of the festive season, with industry watchers pointing to continued pressure on operators to improve average revenue per user (ARPU) after a prolonged period of intense price competition weighed on sector profitability. ARPU trajectory is widely regarded as the single biggest swing factor for telecom operator earnings, since the sector's cost base — network infrastructure, spectrum payments and content investment — is largely fixed in the near term, meaning incremental ARPU gains flow through to profitability at a high rate. Any tariff hike would need to be broadly coordinated across major operators to be effective, since a unilateral increase risks losing subscribers to competitors who hold prices steady, which is why speculation of this kind tends to move the whole sector rather than a single operator's stock. Market participants are treating this as speculation rather than confirmed plans until operators make formal announcements.",
      companies: ["BHARTIARTL", "IDEA"], source: "Economic Times" },
    { date: "24 Jul 2026", title: "Bharti Airtel steady while smaller telecom peers remain under pressure",
      teaser: "Divergence between the sector leader and smaller peers highlights ongoing consolidation dynamics.",
      body: "Bharti Airtel shares held broadly steady even as smaller telecom peers remained under pressure, extending a multi-quarter pattern in which the sector leader has continued gaining postpaid and data-heavy subscribers at the expense of financially weaker operators. The divergence reflects ongoing consolidation dynamics within Indian telecom, where a smaller number of well-capitalised operators have been able to invest in network quality and 5G rollout while heavily indebted peers have struggled to keep pace, leading to continued subscriber migration toward stronger players. For sector investors, this kind of divergence is generally read as a structural trend rather than a single-day anomaly, reinforcing a broader thesis that market share and pricing power are consolidating around fewer operators over time. The performance gap is likely to remain a recurring theme in sector coverage until the competitive landscape stabilises further.",
      companies: ["BHARTIARTL", "IDEA"], source: "Mint" },
  ],
  "Real Estate": [
    { date: "20 Jul 2026", title: "Residential launches moderate in top-7 cities, per channel data",
      teaser: "New-launch volumes are a leading indicator for developer revenue recognition over the following years.",
      body: "Residential project launches moderated across India's top seven cities in the latest channel data, with developers citing a combination of elevated input costs and a cautious near-term demand environment following several strong years of launch activity. New-launch volumes are a leading indicator for developer revenue over the following one to three years under Indian accounting conventions, since revenue is typically recognised as construction progresses rather than at the point of sale, meaning today's launch data shapes the sector's revenue visibility well into the future. Developers with larger, well-capitalised balance sheets have generally continued launching in prime micro-markets even as smaller players pulled back, consistent with a broader consolidation trend the sector has seen since the introduction of stricter regulatory oversight in prior years. Real estate-sector investors typically weigh launch data alongside inventory and absorption trends to assess whether a slowdown reflects developer caution or genuine demand softness.",
      companies: ["DLF", "OBEROIRLTY"], source: "Business Standard" },
    { date: "05 Jul 2026", title: "Mortgage rate trajectory watched closely by homebuyers",
      teaser: "Financing costs directly affect affordability and, in turn, demand for the sector's inventory.",
      body: "Prospective homebuyers and developers alike are watching the mortgage rate trajectory closely following the central bank's recent policy decisions, since financing costs have a direct and fairly immediate effect on affordability and, in turn, on demand for residential inventory across price segments. Higher-ticket, premium housing tends to be somewhat less rate-sensitive than the mass and affordable housing segments, where monthly instalment affordability is often the binding constraint on a buyer's purchase decision, making rate trajectory a particularly important variable for developers focused on the mid-market. Housing finance companies and banks with large mortgage books are similarly attentive to this trajectory, since it affects both origination volumes and the competitive dynamics of mortgage pricing among lenders. Real estate-sector analysts generally treat mortgage rate expectations as one of the more important, and more closely monitored, macro inputs into their demand models for the sector.",
      companies: ["DLF"], source: "Mint" },
  ],
};

/* ---------------------------- Stocks ---------------------------- */
// live:true rows are the 5 real-anchored large caps. Everything else is representative demo data.
const LEGACY_RAW_STOCKS = [
  { ticker: "RELIANCE", name: "Reliance Industries Ltd", sector: "Energy", cap: "Large", price: 1286.3, chgPct: 0.65, mcap: 1739000, pe: 24.1, pb: 2.1, roe: 9.2, roce: 10.4, divYield: 0.4, de: 0.35, ret1y: 4.2, tradedVal: 2840, live: true, sourceNote: "Yahoo Finance base price + 24 Jul close move" },
  { ticker: "TCS", name: "Tata Consultancy Services Ltd", sector: "Information Technology", cap: "Large", price: 2254.3, chgPct: 0.2, mcap: 1218000, pe: 22.8, pb: 12.9, roe: 52.1, roce: 64.3, divYield: 3.1, de: 0.02, ret1y: -6.8, tradedVal: 1620, live: true, sourceNote: "Yahoo Finance, early Jul 2026 + Q1 FY27 results 24 Jul 2026" },
  { ticker: "SBIN", name: "State Bank of India", sector: "Financials", cap: "Large", price: 1015.0, chgPct: 0.24, mcap: 906000, pe: 10.2, pb: 1.6, roe: 17.4, roce: null, divYield: 1.8, de: null, ret1y: 8.9, tradedVal: 1980, live: true, sourceNote: "Yahoo Finance, early Jul 2026" },
  { ticker: "ICICIBANK", name: "ICICI Bank Ltd", sector: "Financials", cap: "Large", price: 1433.4, chgPct: -0.51, mcap: 1027000, pe: 19.6, pb: 3.1, roe: 17.9, roce: null, divYield: 0.8, de: null, ret1y: 14.1, tradedVal: 2210, live: true, sourceNote: "23 Jul 2026" },
  { ticker: "LT", name: "Larsen & Toubro Ltd", sector: "Industrials", cap: "Large", price: 3785.6, chgPct: -0.18, mcap: 521000, pe: 33.4, pb: 4.8, roe: 14.7, roce: 16.2, divYield: 0.7, de: 0.6, ret1y: 8.9, tradedVal: 1340, live: true, sourceNote: "24 Jul 2026" },

  { ticker: "INFY", name: "Infosys Ltd", sector: "Information Technology", cap: "Large", price: 1178.5, chgPct: -0.42, mcap: 489000, pe: 18.9, pb: 6.4, roe: 30.2, roce: 39.6, divYield: 3.4, de: 0.05, ret1y: -34.1, tradedVal: 1580 },
  { ticker: "HDFCBANK", name: "HDFC Bank Ltd", sector: "Financials", cap: "Large", price: 1682.4, chgPct: -1.35, mcap: 1281000, pe: 18.3, pb: 2.7, roe: 15.1, roce: null, divYield: 1.1, de: null, ret1y: -3.6, tradedVal: 2650 },
  { ticker: "ITC", name: "ITC Ltd", sector: "Consumer Staples", cap: "Large", price: 412.6, chgPct: 0.94, mcap: 515000, pe: 24.7, pb: 6.1, roe: 27.3, roce: 34.8, divYield: 3.0, de: 0.02, ret1y: 6.9, tradedVal: 980 },
  { ticker: "SUNPHARMA", name: "Sun Pharmaceutical Industries Ltd", sector: "Health Care", cap: "Large", price: 1742.9, chgPct: 0.38, mcap: 418000, pe: 32.5, pb: 6.9, roe: 18.4, roce: 21.7, divYield: 0.7, de: 0.1, ret1y: 15.6, tradedVal: 720 },
  { ticker: "MARUTI", name: "Maruti Suzuki India Ltd", sector: "Consumer Discretionary", cap: "Large", price: 12480.0, chgPct: -0.71, mcap: 396000, pe: 27.3, pb: 4.2, roe: 15.9, roce: 19.4, divYield: 1.1, de: 0.03, ret1y: 4.5, tradedVal: 640 },
  { ticker: "HCLTECH", name: "HCL Technologies Ltd", sector: "Information Technology", cap: "Large", price: 1698.2, chgPct: 1.95, mcap: 460000, pe: 24.1, pb: 6.6, roe: 27.9, roce: 34.2, divYield: 3.2, de: 0.04, ret1y: -2.1, tradedVal: 890 },
  { ticker: "WIPRO", name: "Wipro Ltd", sector: "Information Technology", cap: "Large", price: 268.4, chgPct: 1.42, mcap: 141000, pe: 21.3, pb: 3.1, roe: 14.8, roce: 18.1, divYield: 1.0, de: 0.06, ret1y: -11.4, tradedVal: 410 },
  { ticker: "BAJFINANCE", name: "Bajaj Finance Ltd", sector: "Financials", cap: "Large", price: 6820.5, chgPct: -2.11, mcap: 421000, pe: 28.4, pb: 5.6, roe: 21.7, roce: null, divYield: 0.4, de: null, ret1y: -9.2, tradedVal: 980 },
  { ticker: "M&M", name: "Mahindra & Mahindra Ltd", sector: "Consumer Discretionary", cap: "Large", price: 2864.7, chgPct: -2.0, mcap: 356000, pe: 26.9, pb: 5.8, roe: 19.4, roce: 22.6, divYield: 0.6, de: 0.4, ret1y: 12.3, tradedVal: 870 },
  { ticker: "BHARTIARTL", name: "Bharti Airtel Ltd", sector: "Communication Services", cap: "Large", price: 1912.3, chgPct: -0.82, mcap: 1148000, pe: 44.2, pb: 9.8, roe: 20.6, roce: 15.9, divYield: 0.4, de: 1.1, ret1y: 18.3, tradedVal: 1120 },
  { ticker: "AXISBANK", name: "Axis Bank Ltd", sector: "Financials", cap: "Large", price: 1064.8, chgPct: -1.4, mcap: 330000, pe: 12.9, pb: 1.9, roe: 15.2, roce: null, divYield: 0.1, de: null, ret1y: -6.4, tradedVal: 1240 },
  { ticker: "TITAN", name: "Titan Company Ltd", sector: "Consumer Discretionary", cap: "Large", price: 3418.2, chgPct: 0.61, mcap: 303000, pe: 78.4, pb: 22.1, roe: 29.8, roce: 27.4, divYield: 0.3, de: 0.5, ret1y: 9.7, tradedVal: 460 },
  { ticker: "TATASTEEL", name: "Tata Steel Ltd", sector: "Materials", cap: "Large", price: 148.6, chgPct: -1.62, mcap: 185000, pe: 41.2, pb: 1.9, roe: 4.6, roce: 6.8, divYield: 2.3, de: 0.7, ret1y: -3.2, tradedVal: 590 },
  { ticker: "ULTRACEMCO", name: "UltraTech Cement Ltd", sector: "Materials", cap: "Large", price: 11240.5, chgPct: -0.9, mcap: 324000, pe: 34.6, pb: 4.4, roe: 12.8, roce: 14.6, divYield: 0.5, de: 0.2, ret1y: 6.4, tradedVal: 380 },
  { ticker: "NTPC", name: "NTPC Ltd", sector: "Utilities", cap: "Large", price: 342.7, chgPct: 0.29, mcap: 332000, pe: 15.4, pb: 1.9, roe: 12.6, roce: 10.9, divYield: 2.4, de: 1.3, ret1y: 12.7, tradedVal: 520 },
  { ticker: "POWERGRID", name: "Power Grid Corp of India Ltd", sector: "Utilities", cap: "Large", price: 289.4, chgPct: -0.4, mcap: 269000, pe: 17.8, pb: 3.6, roe: 20.4, roce: 12.1, divYield: 3.9, de: 1.5, ret1y: -2.8, tradedVal: 380 },
  { ticker: "DLF", name: "DLF Ltd", sector: "Real Estate", cap: "Large", price: 682.3, chgPct: -1.9, mcap: 168000, pe: 44.8, pb: 3.8, roe: 8.6, roce: 9.1, divYield: 0.6, de: 0.1, ret1y: -8.4, tradedVal: 310 },
  { ticker: "OBEROIRLTY", name: "Oberoi Realty Ltd", sector: "Real Estate", cap: "Mid", price: 1642.0, chgPct: -2.4, mcap: 59700, pe: 26.3, pb: 3.9, roe: 15.8, roce: 17.2, divYield: 0.2, de: 0.05, ret1y: -11.6, tradedVal: 90 },
  { ticker: "IDEA", name: "Vodafone Idea Ltd", sector: "Communication Services", cap: "Mid", price: 8.2, chgPct: -3.1, mcap: 58200, pe: null, pb: 1.1, roe: -34.2, roce: -6.4, divYield: 0, de: 4.8, ret1y: -22.4, tradedVal: 210 },
  { ticker: "BIOCON", name: "Biocon Ltd", sector: "Health Care", cap: "Mid", price: 342.6, chgPct: -0.6, mcap: 41200, pe: 46.8, pb: 2.6, roe: 5.9, roce: 8.1, divYield: 0.2, de: 0.7, ret1y: -4.8, tradedVal: 70 },
  { ticker: "IOC", name: "Indian Oil Corporation Ltd", sector: "Energy", cap: "Large", price: 138.9, chgPct: -0.8, mcap: 195900, pe: 8.9, pb: 0.9, roe: 10.4, roce: 9.8, divYield: 6.1, de: 0.9, ret1y: -6.2, tradedVal: 260 },
  { ticker: "DABUR", name: "Dabur India Ltd", sector: "Consumer Staples", cap: "Mid", price: 486.3, chgPct: 0.1, mcap: 86200, pe: 42.1, pb: 8.9, roe: 21.4, roce: 26.8, divYield: 1.4, de: 0.1, ret1y: -2.1, tradedVal: 60 },
  { ticker: "SIEMENS", name: "Siemens Ltd", sector: "Industrials", cap: "Mid", price: 5820.0, chgPct: -1.3, mcap: 207200, pe: 68.2, pb: 12.4, roe: 18.6, roce: 22.9, divYield: 0.3, de: 0.02, ret1y: -5.6, tradedVal: 130 },
  { ticker: "IDFCFIRSTB", name: "IDFC First Bank Ltd", sector: "Financials", cap: "Mid", price: 62.4, chgPct: -1.9, mcap: 46800, pe: 26.7, pb: 1.4, roe: 5.2, roce: null, divYield: 0, de: null, ret1y: -9.8, tradedVal: 240 },
  { ticker: "PERSISTENT", name: "Persistent Systems Ltd", sector: "Information Technology", cap: "Mid", price: 5240.0, chgPct: 1.1, mcap: 79900, pe: 42.3, pb: 11.2, roe: 26.5, roce: 32.8, divYield: 0.5, de: 0.03, ret1y: 8.4, tradedVal: 110 },
  { ticker: "CROMPTON", name: "Crompton Greaves Consumer Electricals Ltd", sector: "Consumer Discretionary", cap: "Mid", price: 342.1, chgPct: -0.9, mcap: 21900, pe: 32.6, pb: 5.8, roe: 17.9, roce: 22.4, divYield: 0.8, de: 0.1, ret1y: -6.7, tradedVal: 40 },
  { ticker: "GRANULES", name: "Granules India Ltd", sector: "Health Care", cap: "Small", price: 548.2, chgPct: 1.6, mcap: 14400, pe: 23.4, pb: 4.1, roe: 17.6, roce: 20.1, divYield: 0.3, de: 0.3, ret1y: 22.8, tradedVal: 30 },
  { ticker: "KARURVYSYA", name: "Karur Vysya Bank Ltd", sector: "Financials", cap: "Small", price: 246.8, chgPct: -0.5, mcap: 19900, pe: 9.8, pb: 1.6, roe: 16.2, roce: null, divYield: 1.8, de: null, ret1y: 14.6, tradedVal: 25 },
  { ticker: "SONACOMS", name: "Sona BLW Precision Forgings Ltd", sector: "Consumer Discretionary", cap: "Small", price: 618.4, chgPct: -1.1, mcap: 26900, pe: 44.6, pb: 8.9, roe: 20.1, roce: 24.7, divYield: 0.5, de: 0.2, ret1y: -3.4, tradedVal: 20 },
  { ticker: "SUZLON", name: "Suzlon Energy Ltd", sector: "Industrials", cap: "Small", price: 68.9, chgPct: 2.4, mcap: 93700, pe: 38.2, pb: 9.4, roe: 27.6, roce: 32.1, divYield: 0, de: 0.1, ret1y: 42.6, tradedVal: 180 },
  { ticker: "NAVINFLUOR", name: "Navin Fluorine International Ltd", sector: "Materials", cap: "Small", price: 4620.0, chgPct: -1.8, mcap: 22800, pe: 52.3, pb: 6.8, roe: 13.4, roce: 16.9, divYield: 0.4, de: 0.05, ret1y: -8.1, tradedVal: 15 },
  { ticker: "TIPSFILMS", name: "Tips Industries Ltd", sector: "Communication Services", cap: "Micro", price: 622.3, chgPct: 3.2, mcap: 5800, pe: 38.9, pb: 9.1, roe: 24.6, roce: 30.2, divYield: 0.3, de: 0.02, ret1y: 18.9, tradedVal: 8 },
  { ticker: "SHRIRAMFIN", name: "Shriram Finance Ltd", sector: "Financials", cap: "Large", price: 682.4, chgPct: 1.2, mcap: 128600, pe: 14.8, pb: 2.3, roe: 16.9, roce: null, divYield: 1.4, de: null, ret1y: 52.3, tradedVal: 260 },
  { ticker: "TATACONSUM", name: "Tata Consumer Products Ltd", sector: "Consumer Staples", cap: "Large", price: 942.6, chgPct: 0.4, mcap: 91200, pe: 68.9, pb: 4.8, roe: 7.1, roce: 8.9, divYield: 0.9, de: 0.2, ret1y: -4.6, tradedVal: 130 },
].map((s) => ({
  ...s,
  spark: sparkPoints(s.ticker, s.price),
  live: !!s.live,
  retWeek: demoSmallReturn(s.ticker + "W", 6),
  retMonth: demoSmallReturn(s.ticker + "M", 12),
  ret6m: demoSmallReturn(s.ticker + "6M", 26),
  hist: {
    "1M": genSeries(s.ticker + "1M", 22, s.price, 0.014),
    "3M": genSeries(s.ticker + "3M", 66, s.price, 0.016),
    "6M": genSeries(s.ticker + "6M", 130, s.price, 0.018),
    "1Y": genSeries(s.ticker + "1Y", 250, s.price, 0.02),
    "2Y": genSeries(s.ticker + "2Y", 500, s.price, 0.022),
    "3Y": genSeries(s.ticker + "3Y", 750, s.price, 0.024),
    "5Y": genSeries(s.ticker + "5Y", 1250, s.price, 0.026),
    Max: genSeries(s.ticker + "Max", 1600, s.price, 0.028),
  },
}));

const RAW_STOCKS = stockUniverse.map((stock) => ({
  ...stock,
  price: null,
  chgPct: null,
  mcap: null,
  pe: null,
  pb: null,
  roe: null,
  roce: null,
  divYield: null,
  ret1y: null,
  tradedVal: null,
  live: true,
  spark: [],
  hist: {},
}));

const STOCKS_BY_TICKER = Object.fromEntries(RAW_STOCKS.map((s) => [s.ticker, s]));

// Demo constituent membership for each benchmark index, drawn from the representative stock
// universe above. A live product would source the actual, licensed index membership lists.
const INDEX_CONSTITUENTS = {
  NIFTY50: RAW_STOCKS.filter((s) => s.cap === "Large").map((s) => s.ticker),
  NEXT50: RAW_STOCKS.filter((s) => s.cap === "Large").slice(8, 20).map((s) => s.ticker),
  MIDCAP150: RAW_STOCKS.filter((s) => s.cap === "Mid").map((s) => s.ticker),
  SMALLCAP250: [],
  NIFTY500: RAW_STOCKS.map((s) => s.ticker),
  BANKNIFTY: RAW_STOCKS.filter((s) => s.sector === "Financials" && /BANK|SBIN/i.test(s.ticker)).map((s) => s.ticker),
  SENSEX: RAW_STOCKS.filter((s) => s.cap === "Large").slice(0, 14).map((s) => s.ticker),
  VIX: [],
};

// Editorial "Index News" module — recent developments involving constituent companies of each
// benchmark, shown on the Benchmark Detail page. Falls back to a generic neutral item for
// indices without hand-authored coverage in this demo dataset.
const INDEX_NEWS = {
  NIFTY50: [
    {
      date: "24 Jul 2026", title: "Reliance and TCS help offset broad index weakness",
      teaser: "Two of the index's heaviest weights traded firmer even as the broader Nifty 50 closed lower for a fifth straight session.",
      body: [
        "Reliance Industries and Tata Consultancy Services, two of the largest weights in the Nifty 50, both closed firmer even as the broader index extended its losing streak to a fifth straight session, driven mainly by weakness in banking and metals names.",
        "Because index-weighted benchmarks like the Nifty 50 are dominated by their largest constituents, strength in just a handful of heavyweight names can meaningfully cushion an otherwise weak session — which is part of why the index's decline was more contained than the number of individual decliners might suggest.",
        "For investors tracking the index rather than individual stocks, sessions like this are a reminder that headline index moves can mask a wide dispersion of underlying constituent performance, and that a full read on market breadth requires looking past the index level alone.",
      ],
      companies: ["RELIANCE", "TCS"], source: "Economic Times",
    },
    {
      date: "23 Jul 2026", title: "HDFC Bank and ICICI Bank weigh on the index amid FII selling",
      teaser: "Foreign portfolio outflows concentrated in large private banks dragged on the index's financials weight.",
      body: [
        "HDFC Bank and ICICI Bank, both among the Nifty 50's largest constituents by weight, declined amid continued foreign institutional investor selling concentrated in large private-sector banks.",
        "Financials carry one of the heaviest sector weights in the Nifty 50, so a coordinated pullback across the sector's largest names tends to have an outsized effect on the headline index level relative to sectors with a smaller aggregate weight.",
        "Market participants noted the selling has so far tracked broader global portfolio-rebalancing flows rather than any India-specific concern with the banks' underlying loan books or asset quality.",
      ],
      companies: ["HDFCBANK", "ICICIBANK"], source: "Mint",
    },
  ],
  BANKNIFTY: [
    {
      date: "24 Jul 2026", title: "Private banks lead Bank Nifty lower on FII outflows",
      teaser: "A concentrated sell-off in the index's largest private lenders pulled the benchmark down for a second session.",
      body: [
        "The Nifty Bank index declined for a second consecutive session as foreign institutional investors extended net selling in large private-sector lenders including HDFC Bank, ICICI Bank and Axis Bank.",
        "Because Bank Nifty membership is concentrated in a relatively small number of large lenders compared with broader benchmarks, flow-driven moves in even two or three constituent stocks can shift the index level meaningfully — a dynamic distinct from stock-specific fundamental developments.",
        "Traders noted that public-sector banks within the index held up relatively better in the same session, a divergence some attributed to comparatively lower FII ownership in that segment of the index.",
      ],
      companies: ["HDFCBANK", "ICICIBANK", "AXISBANK", "SBIN"], source: "CNBC-TV18",
    },
  ],
};
function indexNews(key) {
  if (INDEX_NEWS[key]) return INDEX_NEWS[key];
  const idx = INDICES.find((i) => i.key === key);
  const members = (INDEX_CONSTITUENTS[key] || []).slice(0, 3);
  return [
    {
      date: "24 Jul 2026", title: `No major constituent-specific news for ${idx ? idx.name : key} this session`,
      teaser: `Index-level movement broadly tracked overall market conditions rather than a single constituent catalyst.`,
      body: [
        `There was no standout company-specific announcement among ${idx ? idx.name : key} constituents in the most recent session, and the index's move largely tracked broader market conditions.`,
        `In the absence of a specific catalyst, single-session index moves are generally read as reflecting overall market sentiment rather than a shift in the fundamentals of the underlying constituent companies.`,
        `This is placeholder demo commentary for this Artifact — a live product would source real-time index and constituent news from licensed financial-news providers and exchange filings.`,
      ],
      companies: members, source: "StockDekho demo desk",
    },
  ];
}

/* ---------------------------- Market events (demo, dated around live snapshot) ---------------------------- */
const MARKET_EVENTS = [
  {
    id: "e1", cat: "Macro", date: "24 Jul 2026, 09:20 IST",
    title: "Brent crude tops $100/bbl on renewed Middle East tensions",
    desc: "Energy import costs rose, adding pressure on the rupee and weighing on auto, metal and paint stocks through the session.",
    related: ["NIFTY50", "RELIANCE", "IOC"], source: "Reuters",
    body: [
      "Brent crude futures climbed past $100 a barrel in early trade after reports of renewed military tension along a key Middle Eastern shipping route raised concerns about supply disruption. The move extended a rally that had already pushed oil prices higher through the week, with traders pricing in a greater risk premium ahead of the weekend.",
      "For India, which imports roughly 85% of its crude requirement, a sustained move above $100/bbl flows through quickly into the trade deficit and the rupee. Refiners and paint makers that use crude derivatives as raw material typically see near-term margin pressure, while upstream producers and gas-linked names can benefit from higher realisations. Auto and metal stocks — both sensitive to input costs and consumer sentiment — led the day's declines alongside broader risk-off positioning.",
      "Investors watching India-focused portfolios generally track this move for two reasons: it affects the import bill and currency, and it changes the relative earnings outlook for energy-linked sectors. It does not, on its own, indicate a change in company fundamentals for most non-energy businesses.",
    ],
  },
  {
    id: "e2", cat: "Earnings", date: "24 Jul 2026, 08:05 IST",
    title: "TCS posts stable Q1 FY27 revenue, 24% margin, declares ₹12 dividend",
    desc: "Management highlighted a $9.5B order book and continued AI-led deal momentum; stock traded in a narrow range post-results.",
    related: ["TCS"], source: "Business Standard",
    body: [
      "Tata Consultancy Services reported first-quarter FY27 results broadly in line with analyst expectations, with revenue growth holding steady and operating margin coming in at 24%. Management pointed to a $9.5 billion order book for the quarter, split across BFSI, retail and manufacturing verticals, and reiterated that AI-linked engagements are increasingly influencing deal sizes rather than just deal counts.",
      "The board also declared an interim dividend of ₹12 per share. On the earnings call, leadership flagged some caution around discretionary technology spending in North American clients even as they described the medium-term demand pipeline as healthy, a combination that left the stock trading in a narrow range through the session rather than moving sharply in either direction.",
      "As India's largest IT services company by revenue, TCS's commentary is widely used as an early read on demand conditions across the broader IT services sector — one reason peers were watched closely for similar signals on the same day.",
    ],
  },
  {
    id: "e3", cat: "Earnings", date: "23 Jul 2026, 16:40 IST",
    title: "Infosys trims FY27 revenue growth guidance",
    desc: "Company cited softer discretionary spend and client-specific issues while holding margin guidance at 20–22%.",
    related: ["INFY", "Information Technology"], source: "Mint",
    body: [
      "Infosys lowered its FY27 revenue growth guidance band, citing softer discretionary technology spending among a handful of large clients and project-specific delays in its communications and hi-tech verticals. Operating margin guidance was left unchanged at 20–22%, which management said reflects continued cost discipline and productivity gains from internal AI tooling even as top-line growth slows.",
      "The revision follows a similar, smaller guidance trim in the prior quarter and comes as the sector broadly digests a slower pace of large-deal conversions compared with the post-pandemic years. Leadership indicated that deal pipeline value remains healthy but that clients are taking longer to move from signing to ramp-up.",
      "Because Infosys is one of the two largest Indian IT services companies by market capitalisation, guidance cuts of this kind are typically read across the sector as a data point on enterprise technology budgets rather than treated as an Infosys-specific issue alone.",
    ],
  },
  {
    id: "e4", cat: "Sector", date: "24 Jul 2026, 15:30 IST",
    title: "IT stocks buck the broader decline",
    desc: "HCL Technologies and Wipro closed among the day's strongest large caps even as the benchmark indices fell for a fifth session.",
    related: ["HCLTECH", "WIPRO", "Information Technology"], source: "Economic Times",
    body: [
      "While the Nifty 50 and Sensex both closed lower for a fifth straight session, HCL Technologies and Wipro were among the strongest large-cap performers on the day, with the broader IT services sector holding up notably better than autos, metals and energy.",
      "The relative strength came a day after Infosys trimmed its growth guidance and the same morning TCS reported steady results, suggesting investors differentiated between company-specific guidance commentary and a broader read on the sector. Some of the move may also reflect rotation: as energy and auto names sold off on the crude-oil spike, relatively defensive, lower-capex IT names attracted incremental buying.",
      "For sector-level research, a divergence like this is a reminder that reading the IT sector through a single bellwether's results can be misleading — constituent-level performance on the same day showed a meaningfully different picture.",
    ],
  },
  {
    id: "e5", cat: "Corporate Action", date: "22 Jul 2026",
    title: "UltraTech Cement fixes 30 Jul 2026 as dividend record date",
    desc: "The company confirmed the record date for its previously announced dividend distribution.",
    related: ["ULTRACEMCO"], source: "NSE Corporate Announcements",
    body: [
      "UltraTech Cement confirmed 30 July 2026 as the record date for the dividend it had previously announced alongside its full-year results. Shareholders on the company's register as of that date will be eligible for the payout; the stock is expected to trade ex-dividend a day or two prior, in line with standard settlement conventions.",
      "Corporate actions of this kind are routine administrative confirmations rather than new financial disclosures — the dividend amount itself was set out earlier — but the record date is relevant for anyone tracking entitlement dates across a portfolio or building out a dividend calendar for cement-sector holdings.",
    ],
  },
];

/* ---------------------------- Sector Classification demo return periods used on the Markets page ---------------------------- */


/* ---------------------------- Currencies (LIVE) ---------------------------- */
const CURRENCIES = [
  { code: "USD", name: "US Dollar", rate: 96.54, chgPct: -0.37, low52: 88.1, high52: 96.84, live: true, sourceDate: "RBI reference rate, 24 Jul 2026" },
  { code: "EUR", name: "Euro", rate: 106.8, chgPct: -0.19, low52: 92.4, high52: 110.2, live: true, sourceDate: "market ref., 24 Jul 2026" },
  { code: "GBP", name: "British Pound", rate: 128.9, chgPct: 0.1, low52: 112.6, high52: 130.4, live: true, sourceDate: "mid-market ref., 24 Jul 2026" },
  { code: "JPY", name: "Japanese Yen (per 1)", rate: 0.594, chgPct: -0.05, low52: 0.52, high52: 0.63, live: true, sourceDate: "forex card ref., 20 Jul 2026" },
  { code: "AED", name: "UAE Dirham", rate: 25.17, chgPct: 0.01, low52: 23.4, high52: 26.4, live: true, sourceDate: "market ref., late Jul 2026" },
  { code: "SGD", name: "Singapore Dollar", rate: null, chgPct: null, low52: null, high52: null, live: true, sourceDate: "Latest available market reference" },
  { code: "CAD", name: "Canadian Dollar", rate: null, chgPct: null, low52: null, high52: null, live: true, sourceDate: "Latest available market reference" },
  { code: "AUD", name: "Australian Dollar", rate: null, chgPct: null, low52: null, high52: null, live: true, sourceDate: "Latest available market reference" },
].map((c) => ({ ...c, spark: sparkPoints("FX" + c.code, c.rate) }));

// Editorial "Global Markets" module — macro developments affecting the INR, shown on the Currencies page.
const GLOBAL_MARKETS_NEWS = [
  {
    date: "24 Jul 2026", title: "Crude oil above $100/bbl pressures the rupee",
    teaser: "Higher energy import costs widen India's trade deficit, a direct drag on INR through the currency's import channel.",
    body: "Brent crude's move above $100 a barrel has renewed pressure on the rupee, since India imports the large majority of its crude oil requirement and a sustained rise in the import bill widens the trade deficit — one of the more direct and mechanical channels through which global commodity prices affect the currency. Dealers noted the Reserve Bank of India has room to smooth excessive volatility through its reserves, which remain at comfortable levels, but a persistent move in oil is likely to keep the rupee on a weaker footing versus the dollar in the near term. The USD, being the invoicing currency for the bulk of India's energy imports, is the pair most directly affected, though EUR and GBP crosses tend to move in sympathy given the broader dollar-strength dynamic that often accompanies oil-driven risk-off sentiment.",
    currencies: ["USD"], source: "Reuters",
  },
  {
    date: "22 Jul 2026", title: "US Federal Reserve signals a longer pause on rate cuts",
    teaser: "A more hawkish Fed tends to support the dollar broadly, which is the single biggest external driver of INR moves.",
    body: "Commentary from Federal Reserve officials this week leaned toward a longer pause before the next rate cut, with policymakers citing sticky services inflation as the main reason for caution. A more hawkish-than-expected Fed typically supports the US dollar broadly against a basket of currencies, since it narrows the interest-rate differential that has historically been a call for foreign capital to flow into emerging-market currencies, including the rupee, for the carry it offers. Indian markets tend to watch Fed commentary closely for this reason: dollar strength driven by US rate expectations is one of the most consistent external forces on INR, distinct from any India-specific development. A sustained hawkish shift would be expected to keep the dollar firm against the rupee and could also feed through to relative euro and pound weakness against the dollar.",
    currencies: ["USD", "EUR", "GBP"], source: "Bloomberg",
  },
  {
    date: "18 Jul 2026", title: "FII debt and equity outflows continue for a third week",
    teaser: "Sustained foreign portfolio outflows reduce dollar inflows into India, adding to rupee depreciation pressure.",
    body: "Foreign institutional investors extended a streak of net outflows from Indian debt and equity markets into a third consecutive week, continuing a trend that has been building since mid-year amid a broader reallocation toward developed-market assets. Portfolio outflows of this kind reduce the inflow of foreign currency into India, which — all else equal — adds incremental depreciation pressure on the rupee, since fewer dollars are being converted into rupees to fund Indian market purchases. Market participants noted that the outflows have so far been orderly rather than disorderly, with the RBI intervening periodically to smooth volatility rather than to defend a specific level. The dynamic is most directly relevant to the USD/INR pair, since FII flows into India are predominantly dollar-denominated.",
    currencies: ["USD"], source: "Economic Times",
  },
  {
    date: "10 Jul 2026", title: "European Central Bank holds rates, flags growth concerns",
    teaser: "A cautious ECB stance has kept the euro range-bound, an important cross for India's trade with the EU.",
    body: "The European Central Bank held its key policy rate unchanged at its latest meeting, with officials flagging concerns about sluggish growth across the eurozone even as inflation continued to moderate toward target. The cautious tone has kept the euro broadly range-bound against major currencies, including the rupee, as markets weigh a slower eurozone growth outlook against a similarly uncertain US rate path. The European Union is among India's largest trading partners, making the EUR/INR cross relevant not just for currency traders but for exporters and importers pricing contracts in euros. A weaker eurozone growth outlook can, over time, dampen demand for Indian exports into the region, an indirect channel worth watching alongside the more immediate currency-market effects.",
    currencies: ["EUR"], source: "Reuters",
  },
];

/* =========================================================================================
   THEME
   ========================================================================================= */
const THEME = {
  navy: "#0E1420",
  navyDeep: "#0A0F18",
  panel: "#141C2B",
  panelAlt: "#182238",
  hairline: "#28324A",
  cream: "#F6F1E7",
  creamDim: "#DCD5C4",
  ink: "#EDEAE0",
  inkDim: "#A9B0C3",
  gold: "#C9A24B",
  goldSoft: "#8E7639",
  up: "#3FA772",
  down: "#C5564A",
  serif: "'Iowan Old Style','Palatino Linotype',Georgia,serif",
  sans: "'Inter','Helvetica Neue',Arial,sans-serif",
  mono: "'IBM Plex Mono','SF Mono',Menlo,monospace",
};

const fmtNum = (n, d = 2) => (n === null || n === undefined || Number.isNaN(n) ? "—" : n.toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d }));
const fmtInt = (n) => (n === null || n === undefined ? "—" : n.toLocaleString("en-IN"));
const fmtPct = (n) => (n === null || n === undefined ? "—" : `${n > 0 ? "+" : ""}${n.toFixed(2)}%`);
const fmtCr = (n) => (n === null || n === undefined ? "—" : `₹${fmtInt(Math.round(n))} Cr`);
const cls = (...a) => a.filter(Boolean).join(" ");
const formatMarketAsOf = (value) => {
  if (!value) return "Time unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Time unavailable";

  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
    timeZoneName: "short",
  });
};

/* =========================================================================================
   SMALL SHARED COMPONENTS
   ========================================================================================= */

function GlobalStyle() {
  return (
    <style>{`
      html, body { background: ${THEME.navy}; min-height: 100%; }
      .sd-root * { box-sizing: border-box; }
      .sd-root { font-family: ${THEME.sans}; color: ${THEME.ink}; }
      .sd-serif { font-family: ${THEME.serif}; }
      .sd-mono { font-family: ${THEME.mono}; }
      .sd-scroll::-webkit-scrollbar { height: 6px; width: 6px; }
      .sd-scroll::-webkit-scrollbar-thumb { background: ${THEME.hairline}; border-radius: 4px; }
      .sd-fade-in { animation: sdFadeIn .25s ease; }
      @keyframes sdFadeIn { from { opacity: 0; transform: translateY(4px);} to { opacity:1; transform:none; } }
      .sd-row-hover:hover { background: rgba(201,162,75,0.06); }
      .sd-focusable:focus-visible { outline: 2px solid ${THEME.gold}; outline-offset: 2px; }
      .sd-underline-link { text-decoration: underline; text-decoration-color: rgba(201,162,75,0.4); text-underline-offset: 3px; cursor:pointer; }
      .sd-underline-link:hover { text-decoration-color: ${THEME.gold}; }
    `}</style>
  );
}

function isIndianMarketOpen(now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kolkata",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now).map((part) => [part.type, part.value])
  );
  const minuteOfDay = Number(parts.hour) * 60 + Number(parts.minute);
  return ["Mon", "Tue", "Wed", "Thu", "Fri"].includes(parts.weekday) &&
    minuteOfDay >= 9 * 60 + 15 &&
    minuteOfDay < 15 * 60 + 30;
}

function isIndianMarketRefreshWindow(now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kolkata",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now).map((part) => [part.type, part.value])
  );
  const minuteOfDay = Number(parts.hour) * 60 + Number(parts.minute);
  return ["Mon", "Tue", "Wed", "Thu", "Fri"].includes(parts.weekday) &&
    minuteOfDay >= 9 * 60 + 15 &&
    minuteOfDay <= 15 * 60 + 40;
}

const MARKET_REFRESH_MS = 5 * 60 * 1000;

function isCurrencyMarketOpen(now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "America/New_York",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now).map((part) => [part.type, part.value])
  );
  const minuteOfDay = Number(parts.hour) * 60 + Number(parts.minute);
  if (["Mon", "Tue", "Wed", "Thu"].includes(parts.weekday)) return true;
  if (parts.weekday === "Sun") return minuteOfDay >= 17 * 60;
  if (parts.weekday === "Fri") return minuteOfDay < 17 * 60;
  return false;
}

function marketSessionDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function isCompleteLeadershipObservation(value, now = new Date()) {
  const observation = new Date(value);
  if (Number.isNaN(observation.getTime())) return false;
  if (isIndianMarketOpen(now)) {
    return now.getTime() - observation.getTime() <= 10 * 60 * 1000;
  }
  return true;
}

function isClosingLeadershipObservation(value) {
  const observation = new Date(value);
  if (Number.isNaN(observation.getTime())) return false;
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kolkata",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(observation).map((part) => [part.type, part.value])
  );
  return Number(parts.hour) * 60 + Number(parts.minute) >= 15 * 60 + 29;
}

function hasFreshCurrencyQuote(currency, now = new Date()) {
  return isCurrencyMarketOpen(now) && Number.isFinite(currency?.rate);
}

function LiveTag({ live, approx, small, statusLabel }) {
  if (live) {
    const label = statusLabel || (approx ? "Live · approx" : isIndianMarketOpen() ? "Live" : "EOD");
    const caution = label === "Delayed" || label === "Stale";
    const tagColor = caution ? THEME.gold : THEME.up;
    return (
      <span title={statusLabel === "Live" ? "Market is currently open" : statusLabel === "EOD" ? "Latest end-of-day value" : approx ? "Live-anchored (approximate reference level)" : "Live-anchored EOD snapshot"}
        style={{
          fontSize: small ? 9 : 10, letterSpacing: 0.5, textTransform: "uppercase", fontWeight: 700,
          color: tagColor, border: `1px solid ${tagColor}55`, borderRadius: 3, padding: small ? "1px 5px" : "2px 6px",
          background: caution ? "rgba(201,162,75,0.08)" : "rgba(63,167,114,0.08)", whiteSpace: "nowrap", flexShrink: 0,
        }}>
        {label}
      </span>
    );
  }
  return (
    <span title="Illustrative demo data"
      style={{
        fontSize: small ? 9 : 10, letterSpacing: 0.5, textTransform: "uppercase", fontWeight: 700,
        color: THEME.inkDim, border: `1px solid ${THEME.hairline}`, borderRadius: 3, padding: small ? "1px 5px" : "2px 6px",
      }}>
      Demo
    </span>
  );
}

function quoteStatusLabel(quote, marketOpen = isIndianMarketOpen()) {
  const status = String(quote?.dataStatus || "").toLowerCase();
  if (status === "live") return "Live";
  if (status === "delayed") return "Delayed";
  if (status === "stale") return "Stale";
  if (status === "eod") return "EOD";
  if (status === "unavailable") return "Unavailable";
  return marketOpen ? "Live" : "EOD";
}

function marketProviderLabel(value) {
  return String(value || "").toLowerCase() === "upstox"
    ? "Upstox"
    : "Yahoo Finance";
}

function Move({ value, suffix = "%", size = 13 }) {
  if (!Number.isFinite(value)) {
    return <span style={{ color: THEME.inkDim, fontSize: size }}>—</span>;
  }
  const up = value >= 0;
  return (
    <span style={{ color: up ? THEME.up : THEME.down, fontWeight: 600, fontSize: size, display: "inline-flex", alignItems: "center", gap: 3 }}>
      {up ? <ArrowUpRight size={size} /> : <ArrowDownRight size={size} />}
      {up ? "+" : ""}{value.toFixed(2)}{suffix}
    </span>
  );
}

function Sparkline({ data, width = 96, height = 30, positive }) {
  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const up = positive ?? data[data.length - 1] >= data[0];
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: "block" }}>
      <polyline points={pts} fill="none" stroke={up ? THEME.up : THEME.down} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function DemoBanner() {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: THEME.inkDim,
      padding: "6px 14px", borderBottom: `1px solid ${THEME.hairline}`, background: THEME.navyDeep,
    }}>
      <Clock size={13} />
      <span>
  Built to simplify investment research • For research purposes only • Not investment advice.
</span>
    </div>
  );
}

function SectionHeading({ eyebrow, title, action }) {
  return (
    <div className="sd-section-heading" style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 14 }}>
      <div>
        {eyebrow && <div style={{ fontSize: 11, letterSpacing: 1.2, textTransform: "uppercase", color: THEME.gold, marginBottom: 4 }}>{eyebrow}</div>}
        <h2 className="sd-serif" style={{ fontSize: 22, margin: 0, fontWeight: 600 }}>{title}</h2>
      </div>
      {action && <div className="sd-section-action">{action}</div>}
    </div>
  );
}

function Panel({ children, style, ...rest }) {
  return <div style={{ background: THEME.panel, border: `1px solid ${THEME.hairline}`, borderRadius: 6, ...style }} {...rest}>{children}</div>;
}

function WideNewsTile({ article, onClick, href }) {
  const content = (
    <>
      <div style={{ fontSize: 10.5, color: THEME.gold, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 700 }}>
        {article.topic || article.category || "Market"}
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, color: THEME.ink, marginTop: 5 }}>{article.title}</div>
      <div style={{ fontSize: 10.5, color: THEME.inkDim, marginTop: 6 }}>
        {article.source || "Source unavailable"} · {article.date || formatNewsDate(article.publishedAt)}
      </div>
    </>
  );
  return (
    <Panel onClick={onClick} className={(onClick || href) ? "sd-row-hover" : undefined} style={{ padding: 14, cursor: (onClick || href) ? "pointer" : "default" }}>
      {href ? <a href={href} target="_blank" rel="noopener noreferrer" style={{ display: "block", textDecoration: "none" }}>{content}</a> : content}
    </Panel>
  );
}

function Pill({ active, children, onClick }) {
  return (
    <button onClick={onClick} className="sd-focusable" style={{
      padding: "5px 12px", borderRadius: 4, fontSize: 12.5, fontWeight: 600, cursor: "pointer",
      border: `1px solid ${active ? THEME.gold : THEME.hairline}`,
      background: active ? "rgba(201,162,75,0.12)" : "transparent",
      color: active ? THEME.gold : THEME.inkDim,
    }}>
      {children}
    </button>
  );
}

// Shared period control used across all detail and comparison pages.
function ReturnRangeSelector({ active, onSelect }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
      <span style={{ fontSize: 10.5, color: THEME.inkDim, marginRight: 2 }}>Period Range:</span>
      {EXTENDED_RANGES.map((r) => (
        <Pill key={r} active={active === r} onClick={() => onSelect(r)}>{r}</Pill>
      ))}
    </div>
  );
}

function ModeExplain({ mode, children }) {
  if (mode !== "explore") return null;
  return (
    <div style={{ fontSize: 12, color: THEME.inkDim, background: "rgba(201,162,75,0.06)", border: `1px dashed ${THEME.hairline}`, borderRadius: 4, padding: "8px 10px", marginTop: 6, display: "flex", gap: 6 }}>
      <Info size={14} style={{ flexShrink: 0, marginTop: 1, color: THEME.gold }} />
      <span>{children}</span>
    </div>
  );
}

function WatchStar({ active, onClick }) {
  return (
    <button onClick={onClick} className="sd-focusable" title={active ? "Remove from watchlist" : "Add to watchlist"}
      style={{ background: "none", border: "none", cursor: "pointer", color: active ? THEME.gold : THEME.inkDim, display: "flex" }}>
      {active ? <Star size={16} fill={THEME.gold} /> : <Star size={16} />}
    </button>
  );
}

function MetricExplain({ mode, text }) {
  const [open, setOpen] = useState(false);
  if (mode !== "explore") return null;
  return (
    <span style={{ position: "relative", marginLeft: 4 }}>
      <button onClick={() => setOpen((o) => !o)} className="sd-focusable"
        style={{ background: "none", border: "none", cursor: "pointer", color: THEME.gold, padding: 0, display: "inline-flex" }}>
        <Info size={12} />
      </button>
      {open && (
        <div style={{
          position: "absolute", zIndex: 20, top: 18, left: 0, width: 220, fontSize: 11.5, lineHeight: 1.4,
          background: THEME.panelAlt, border: `1px solid ${THEME.hairline}`, borderRadius: 4, padding: 10, color: THEME.inkDim,
        }}>
          {text}
        </div>
      )}
    </span>
  );
}

/* =========================================================================================
   PRICE CHART (recharts)
   ========================================================================================= */
function PriceChart({ series, labels, height = 280, benchmarkSeries, benchmarkLabel, color = THEME.gold }) {
  const data = series.map((v, i) => {
    const row = { i: labels ? labels[i] : i, price: v };
    if (benchmarkSeries) row.benchmark = benchmarkSeries[i];
    return row;
  });
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 6, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={THEME.hairline} strokeDasharray="2 4" vertical={false} />
        <XAxis dataKey="i" tick={{ fill: THEME.inkDim, fontSize: 10 }} minTickGap={40} axisLine={{ stroke: THEME.hairline }} tickLine={false} />
        <YAxis tick={{ fill: THEME.inkDim, fontSize: 10 }} axisLine={false} tickLine={false} domain={["auto", "auto"]} width={54} />
        <Tooltip contentStyle={{ background: THEME.panelAlt, border: `1px solid ${THEME.hairline}`, borderRadius: 4, fontSize: 12 }}
          labelStyle={{ color: THEME.inkDim }} itemStyle={{ color: THEME.ink }} formatter={(value) => fmtNum(value, 2)} />
        {benchmarkSeries && <Legend wrapperStyle={{ fontSize: 11, color: THEME.inkDim }} />}
        <Line type="monotone" dataKey="price" name="Price" stroke={color} strokeWidth={2} dot={false} />
        {benchmarkSeries && <Line type="monotone" dataKey="benchmark" name={benchmarkLabel || "Benchmark"} stroke={THEME.inkDim} strokeWidth={1.4} dot={false} strokeDasharray="3 3" />}
      </LineChart>
    </ResponsiveContainer>
  );
}

/* =========================================================================================
   HEADER / NAVIGATION
   ========================================================================================= */
function Header({
  page,
  setPage,
  mode,
  setMode,
  watchlist,
  compareList,
  query,
  setQuery,
  onSelectSearch,
  onSearchTopic,
}) {
  const [searchOpen, setSearchOpen] =
    useState(false);

  const results = useMemo(() => {
    if (!query.trim()) {
      return [];
    }

    const normalizedQuery = query
      .trim()
      .toLowerCase();

    return RAW_STOCKS
      .filter(
        (stock) =>
          stock.ticker
            .toLowerCase()
            .includes(normalizedQuery) ||
          stock.name
            .toLowerCase()
            .includes(normalizedQuery)
      )
      .slice(0, 8);
  }, [query]);

  const navItems = [
    { key: "markets", label: "Markets" },
    { key: "sectors", label: "Sectors" },
    { key: "stocks", label: "Stocks" },
    { key: "currencies", label: "Global" },
    { key: "compare", label: "Compare" },
    { key: "watchlist", label: "Watchlist" },
  ];

  return (
    <div style={{ position: "sticky", top: 0, zIndex: 40, background: THEME.navy, borderBottom: `1px solid ${THEME.hairline}` }}>
      <DemoBanner />
      <div className="sd-header-main" style={{ display: "flex", alignItems: "center", gap: 22, padding: "10px 20px" }}>
        <div onClick={() => setPage("markets")} style={{ cursor: "pointer", display: "flex", alignItems: "baseline", gap: 0, flexShrink: 0 }}>
          <span className="sd-serif" style={{ fontSize: 21, fontWeight: 700, color: THEME.cream, letterSpacing: 0.3 }}>StockDekho</span>
          <span style={{ color: THEME.gold, fontSize: 42, lineHeight: 0, position: "relative", top: 1, marginLeft: 1 }}>.</span>
        </div>

        <nav className="sd-header-nav" style={{ display: "flex", gap: 4 }}>
          {navItems.map((n) => (
            <button key={n.key} onClick={() => setPage(n.key)} className="sd-focusable" style={{
              background: "none", border: "none", cursor: "pointer", fontSize: 13.5, fontWeight: 600,
              padding: "8px 10px", borderRadius: 4,
              color: page === n.key ? THEME.cream : THEME.inkDim,
              borderBottom: page === n.key ? `2px solid ${THEME.gold}` : "2px solid transparent",
              display: "flex", alignItems: "center", gap: 6,
            }}>
              {n.label}
              {n.key === "watchlist" && watchlist.length > 0 && (
                <span style={{ fontSize: 10, background: THEME.gold, color: THEME.navyDeep, borderRadius: 8, padding: "1px 6px", fontWeight: 700 }}>{watchlist.length}</span>
              )}
              {n.key === "compare" && compareList.length > 0 && (
                <span style={{ fontSize: 10, background: THEME.gold, color: THEME.navyDeep, borderRadius: 8, padding: "1px 6px", fontWeight: 700 }}>{compareList.length}</span>
              )}
            </button>
          ))}
        </nav>

        <div className="sd-header-search" style={{ position: "relative", width: "min(460px, 36vw)", marginLeft: "auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, background: THEME.panel, border: `1px solid ${THEME.hairline}`, borderRadius: 5, padding: "7px 10px" }}>
            <Search size={14} color={THEME.inkDim} />
            <input
              value={query}
              onChange={(e) => { setQuery(e.target.value); setSearchOpen(true); }}
              onFocus={() => setSearchOpen(true)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && query.trim()) {
                  onSearchTopic(query.trim());
                  setSearchOpen(false);
                }
              }}
              placeholder="Search Companies or Topics..."
              style={{ background: "none", border: "none", outline: "none", color: THEME.ink, fontSize: 13, width: "100%" }}
            />
          </div>
          {searchOpen && query.trim() && (
            <div className="sd-fade-in" style={{ position: "absolute", top: 40, left: 0, right: 0, background: THEME.panelAlt, border: `1px solid ${THEME.hairline}`, borderRadius: 6, overflow: "hidden", boxShadow: "0 12px 28px rgba(0,0,0,0.4)" }}>
              {results.map((r) => (
                <div key={r.ticker} className="sd-row-hover" onClick={() => { onSelectSearch(r.ticker); setSearchOpen(false); setQuery(""); }}
                  style={{ padding: "9px 12px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `1px solid ${THEME.hairline}` }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{r.name} <span style={{ color: THEME.inkDim, fontWeight: 400 }}>· {r.ticker}</span></div>
                    <div style={{ fontSize: 11, color: THEME.inkDim }}>{r.sector}</div>
                  </div>
                </div>
              ))}
              <button
                onClick={() => { onSearchTopic(query.trim()); setSearchOpen(false); }}
                style={{ width: "100%", padding: "10px 12px", textAlign: "left", border: "none", background: "rgba(201,162,75,0.08)", color: THEME.gold, cursor: "pointer", fontSize: 12.5, fontWeight: 700 }}
              >
                View stocks and news related to “{query.trim()}”
              </button>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

/* =========================================================================================
   MARKETS HOME PAGE
   ========================================================================================= */
function IndexCard({ idx, onOpen }) {
  const isDemo = Boolean(idx.demo);
  const isRateContext = idx.isVix || idx.isGsec;
  const todayPointChange = idx.isVix ? idx.change : null;
  const monthPointChange = idx.isVix && idx.sparkline?.length
    ? idx.value - idx.sparkline[0]
    : null;
  const neutralDelta = (value, suffix) => Number.isFinite(value)
    ? <span className="sd-mono" style={{ color: THEME.creamDim, fontWeight: 600, fontSize: 10.5 }}>{value > 0 ? "+" : ""}{value.toFixed(2)} {suffix}</span>
    : <span style={{ color: THEME.inkDim }}>—</span>;

  return (
    <div
      onClick={() => onOpen(idx.key)}
      className="sd-row-hover"
      style={{
      cursor: "pointer", border: `1px solid ${THEME.hairline}`, borderRadius: 6, padding: "12px 14px",
      background: THEME.panel, width: 184, minWidth: 184, height: 136, display: "flex", flexDirection: "column", justifyContent: "space-between", flexShrink: 0,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: THEME.creamDim, lineHeight: 1.3, maxWidth: 124, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{idx.name}</div>
          <div className="sd-mono" style={{ fontSize: 17, marginTop: 12 }}>
            {Number.isFinite(idx.value) ? (idx.isGsec ? `${fmtNum(idx.value, 2)}%` : idx.isVix ? fmtNum(idx.value) : fmtInt(Math.round(idx.value))) : "—"}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 1 }}>
            <span style={{ fontSize: 9.5, color: THEME.inkDim }}>{idx.isGsec ? "Prev. pub." : isRateContext ? "Today" : "Daily"}</span>
            {idx.isGsec ? neutralDelta(idx.todayBps, "bps") : idx.isVix ? neutralDelta(todayPointChange, "pts") : <Move value={idx.changePercent} size={11} />}
          </div>
        </div>
        <LiveTag
          live={!isDemo}
          small
          statusLabel={isDemo ? undefined : idx.isGsec ? (idx.status || "EOD") : quoteStatusLabel(idx)}
        />
      </div>
      <div>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 44px", columnGap: 12, alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 3, whiteSpace: "nowrap", flexShrink: 0 }}>
            <span style={{ fontSize: 9.5, color: THEME.inkDim, whiteSpace: "nowrap" }}>{isRateContext ? "1M change" : "1M return"}</span>
            {idx.isGsec ? neutralDelta(idx.oneMonthBps, "bps") : idx.isVix ? neutralDelta(monthPointChange, "pts") : <Move value={idx.oneMonthReturn} size={10} />}
          </div>
          <Sparkline data={idx.sparkline || []} width={44} height={24} />
        </div>
        <div style={{ fontSize: 10, color: THEME.inkDim, marginTop: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {isDemo
            ? "Illustrative 1M series · Demo"
            : idx.isGsec
              ? `${idx.dataProvider || "FBIL"} · ${idx.asOf?.includes("T") ? formatMarketAsOf(idx.asOf) : new Date(`${idx.observationDate}T00:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}`
              : idx.sessionDateOnly
                ? `Latest session ${new Date(`${idx.asOf}T00:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}`
              : `As of ${formatMarketAsOf(idx.asOf || idx.marketTime)}`}
        </div>
      </div>
    </div>
  );
}

/* =========================================================================================
   BENCHMARK RESEARCH PAGE — opened by clicking any index card on the Markets homepage
   ========================================================================================= */
function GsecDetailPage({ back }) {
  const [range, setRange] = useState("1Y");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [news, setNews] = useState([]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    getIndiaTenYearYield(range)
      .then((result) => { if (!cancelled) setData(result); })
      .catch(() => { if (!cancelled) { setData(null); setError("India 10Y G-Sec yield data is currently unavailable."); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [range]);

  useEffect(() => {
    let cancelled = false;
    getIndiaGsecNews()
      .then((result) => { if (!cancelled) setNews(result.articles || []); })
      .catch(() => { if (!cancelled) setNews([]); });
    return () => { cancelled = true; };
  }, []);

  const chartData = (data?.points || []).map((point, index, points) => ({
    date: new Date(`${point.date}T00:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: points.length > 60 ? "2-digit" : undefined }),
    yield: point.yield,
    change: index ? Math.round((point.yield - points[index - 1].yield) * 100) : null,
  }));

  return (
    <div className="sd-fade-in" style={{ padding: "22px 20px 70px", maxWidth: 1280, margin: "0 auto" }}>
      <button onClick={back} style={{ background: "none", border: "none", color: THEME.gold, cursor: "pointer", fontSize: 12.5, display: "flex", alignItems: "center", gap: 4, marginBottom: 10 }}>
        <ChevronLeft size={14} /> Back to markets
      </button>
      <Panel style={{ padding: 20, marginBottom: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <h1 className="sd-serif" style={{ fontSize: 24, margin: 0 }}>India 10Y G-Sec</h1>
              <LiveTag live statusLabel={data?.status || "EOD"} />
            </div>
            <p style={{ fontSize: 12.5, color: THEME.creamDim, lineHeight: 1.55, maxWidth: 760 }}>
              India’s 10-year government-security benchmark yield, providing interest-rate context for equity research.
            </p>
            <div style={{ fontSize: 11, color: THEME.inkDim }}>
              {data?.dataProvider === "Upstox-derived"
                ? "Yield calculated from the Upstox NSE price of the current 6.94% GS 2036 benchmark"
                : "Official FBIL annualized par yield · Published EOD data"}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div className="sd-mono" style={{ fontSize: 28 }}>{Number.isFinite(data?.value) ? `${data.value.toFixed(2)}%` : "—"}</div>
            <div style={{ fontSize: 11.5, color: THEME.creamDim, marginTop: 4 }}>Change vs prior publication {Number.isFinite(data?.todayBps) ? `${data.todayBps > 0 ? "+" : ""}${data.todayBps} bps` : "—"}</div>
            <div style={{ fontSize: 10.5, color: THEME.inkDim, marginTop: 5 }}>
              {data?.asOf
                ? `${data.dataProvider || "FBIL"} · ${data.asOf.includes("T") ? formatMarketAsOf(data.asOf) : new Date(`${data.observationDate}T00:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}`
                : "Latest observation unavailable"}
            </div>
          </div>
        </div>
      </Panel>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        {["1M", "3M", "6M", "1Y"].map((item) => <Pill key={item} active={range === item} onClick={() => setRange(item)}>{item}</Pill>)}
      </div>
      <Panel style={{ padding: 16 }}>
        {loading ? <div style={{ height: 320, display: "grid", placeItems: "center", color: THEME.inkDim }}>Loading official yield history...</div>
          : error ? <div style={{ height: 320, display: "grid", placeItems: "center", color: THEME.down }}>{error}</div>
          : <ResponsiveContainer width="100%" height={320}>
              <LineChart data={chartData} margin={{ top: 6, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={THEME.hairline} strokeDasharray="2 4" vertical={false} />
                <XAxis dataKey="date" tick={{ fill: THEME.inkDim, fontSize: 10 }} minTickGap={40} tickLine={false} />
                <YAxis tick={{ fill: THEME.inkDim, fontSize: 10 }} domain={["auto", "auto"]} width={58} tickFormatter={(value) => `${Number(value).toFixed(2)}%`} />
                <Tooltip contentStyle={{ background: THEME.panelAlt, border: `1px solid ${THEME.hairline}`, borderRadius: 4 }} formatter={(value, name, item) => [`${Number(value).toFixed(2)}%${Number.isFinite(item?.payload?.change) ? ` · ${item.payload.change > 0 ? "+" : ""}${item.payload.change} bps` : ""}`, "Yield"]} />
                <Line type="monotone" dataKey="yield" stroke={THEME.gold} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>}
      </Panel>
      <div style={{ marginTop: 40 }}><SectionHeading title="What moved the Yield?" /></div>
      <p style={{ fontSize: 11.5, color: THEME.inkDim, marginTop: -8, marginBottom: 12 }}>Reporting from the last 15 days that explicitly connects developments to Indian government securities or sovereign yields.</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {news.map((article) => <WideNewsTile key={article.id || article.link} article={article} href={article.link} />)}
        {!news.length && <Panel style={{ padding: 20, textAlign: "center", color: THEME.inkDim }}>No sufficiently relevant India G-Sec reporting is available from the last 15 days.</Panel>}
      </div>
    </div>
  );
}

function BenchmarkDetailPage({ indexKey, back, openCompany, watchlist, toggleWatch, compareList, toggleCompare }) {
  const demoConfig = null;
  const isDemo = false;
  const isVix = indexKey === "VIX";
  const [range, setRange] = useState("1Y");
  const [indexData, setIndexData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [news, setNews] = useState([]);
  const [newsLoading, setNewsLoading] = useState(false);
  const [newsError, setNewsError] = useState("");
  const [newsOpen, setNewsOpen] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function loadIndex() {
      setLoading(true);
      setError("");

      if (isDemo) {
        setIndexData(buildDemoIndexDetail(indexKey, range));
        setLoading(false);
        return;
      }

      try {
        const data = await getIndexDetail(indexKey, range);
        if (!cancelled) setIndexData(data);
      } catch (requestError) {
        if (!cancelled) {
          setIndexData(null);
          setError("Unable to load live index data.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadIndex();

    return () => {
      cancelled = true;
    };
  }, [indexKey, range, isDemo]);

  const newsSymbols = (indexData?.constituents || [])
    .slice(0, 10)
    .map((stock) => stock.ticker)
    .join(",");

  useEffect(() => {
    let cancelled = false;

    async function loadIndexNews() {
      if (isVix) {
        setNewsLoading(true);
        setNewsError("");

        try {
          const data = await getVixMarketNews();
          if (!cancelled) {
            setNews(
              (data.articles || []).map((article) => ({
                ...article,
                date: formatNewsDate(article.publishedAt),
                teaser: article.summary || "",
              }))
            );
          }
        } catch (requestError) {
          if (!cancelled) {
            setNews([]);
            setNewsError("Unable to load current volatility news. Please try again shortly.");
          }
        } finally {
          if (!cancelled) setNewsLoading(false);
        }

        return;
      }

      if (isDemo) {
        setNewsError("");
        setNews(
          demoConfig.news.map(([title, teaser], index) => ({
            id: `${indexKey}-demo-news-${index}`,
            title,
            teaser,
            date: "Demo",
            source: "Illustrative StockDekho content",
          }))
        );
        setNewsLoading(false);
        return;
      }

      if (!newsSymbols) {
        setNews([]);
        setNewsError("");
        return;
      }

      setNewsLoading(true);
      setNewsError("");
      const results = await Promise.allSettled(
        newsSymbols.split(",").map(async (ticker) => ({
          ticker,
          data: await getCompanyNews(ticker),
        }))
      );

      if (!cancelled) {
        const seen = new Set();
        const articles = results
          .filter((result) => result.status === "fulfilled")
          .flatMap((result) =>
            (result.value.data.articles || []).map((article) => ({
              ...article,
              companies: [result.value.ticker],
            }))
          )
          .sort(
            (a, b) =>
              newsDateTimestamp(b.publishedAt) - newsDateTimestamp(a.publishedAt)
          )
          .filter((article) => {
            const key = article.link || article.title;
            if (!key || seen.has(key)) return false;
            seen.add(key);
            return true;
          })
          .slice(0, 5)
          .map((article) => ({
            ...article,
            date: formatNewsDate(article.publishedAt),
            teaser: article.summary || article.snippet || "",
          }));

        setNews(articles);
        if (results.every((result) => result.status === "rejected")) {
          setNewsError("Unable to load current constituent news. Please try again shortly.");
        }
        setNewsLoading(false);
      }
    }

    loadIndexNews();

    return () => {
      cancelled = true;
    };
  }, [newsSymbols, isDemo, isVix, indexKey, demoConfig]);

  const constituents = indexData?.constituents || [];
  const series = (indexData?.points || []).map(
    (point) => point.adjustedClose
  );
  const labels = (indexData?.points || []).map((point) =>
    new Date(`${point.date}T00:00:00`).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: series.length > 400 ? "2-digit" : undefined,
    })
  );
  const upcomingVixEvents = VIX_SCHEDULED_EVENTS_2026.filter(
    (event) =>
      event.date >= new Date().toISOString().slice(0, 10) &&
      event.date.startsWith("2026-")
  );

  return (
    <div className="sd-fade-in" style={{ padding: "22px 20px 70px", maxWidth: 1280, margin: "0 auto" }}>
      <button onClick={back} style={{ background: "none", border: "none", color: THEME.gold, cursor: "pointer", fontSize: 12.5, display: "flex", alignItems: "center", gap: 4, marginBottom: 10 }}>
        <ChevronLeft size={14} /> Back to markets
      </button>

      <Panel style={{ padding: 20, marginBottom: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
          <div style={{ maxWidth: 760 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <h1 className="sd-serif" style={{ fontSize: 24, margin: 0 }}>
                {indexData?.name || "Indian benchmark"}
              </h1>
              <LiveTag live={!isDemo} statusLabel={isDemo ? undefined : quoteStatusLabel(indexData)} />
            </div>
            <p style={{ fontSize: 12.5, color: THEME.creamDim, lineHeight: 1.55, margin: "10px 0 0" }}>
              {indexData?.description || "Loading benchmark description..."}
            </p>
            <div style={{ fontSize: 11.5, color: THEME.inkDim, marginTop: 8 }}>
              {isDemo ? "Illustrative benchmark · Demo data" : `Benchmark index · ${marketProviderLabel(indexData?.dataProvider)} market data`}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div className="sd-mono" style={{ fontSize: 28 }}>
              {Number.isFinite(indexData?.value)
                ? indexData.isVix
                  ? fmtNum(indexData.value)
                  : fmtInt(Math.round(indexData.value))
                : "—"}
            </div>
            {Number.isFinite(indexData?.changePercent) && (
              <Move value={indexData.changePercent} size={14} />
            )}
            {Number.isFinite(indexData?.low52) && Number.isFinite(indexData?.high52) && (
              <div style={{ fontSize: 11, color: THEME.inkDim, marginTop: 6 }}>
                52W {fmtInt(Math.round(indexData.low52))} – {fmtInt(Math.round(indexData.high52))}
              </div>
            )}
          </div>
        </div>
      </Panel>

      <div style={{ marginBottom: 12 }}>
        <ReturnRangeSelector active={range} onSelect={setRange} />
      </div>

      <Panel style={{ padding: 16 }}>
        {loading ? (
          <div style={{ height: 320, display: "flex", alignItems: "center", justifyContent: "center", color: THEME.inkDim }}>
            {isDemo ? "Loading illustrative index history..." : "Loading live index history..."}
          </div>
        ) : error ? (
          <div style={{ height: 320, display: "flex", alignItems: "center", justifyContent: "center", color: THEME.down }}>
            {error}
          </div>
        ) : (
          <PriceChart series={series} labels={labels} height={320} color={THEME.gold} />
        )}
      </Panel>

      <div className="sd-grid-4" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginTop: 14 }}>
        {[
          [`${range} performance`, null, indexData?.periodReturn],
          ["Today's change", null, indexData?.changePercent],
          ["Period high", Number.isFinite(indexData?.periodHigh) ? fmtInt(Math.round(indexData.periodHigh)) : "—", null],
          ["Period low", Number.isFinite(indexData?.periodLow) ? fmtInt(Math.round(indexData.periodLow)) : "—", null],
        ].map(([l, v, moveVal]) => (
          <Panel key={l} style={{ padding: 12 }}>
            <div style={{ fontSize: 10.5, color: THEME.inkDim }}>{l}</div>
            <div className="sd-mono" style={{ fontSize: 15, marginTop: 4 }}>
              {Number.isFinite(moveVal) ? <Move value={moveVal} size={14} /> : v || "—"}
            </div>
          </Panel>
        ))}
      </div>

      <div style={{ fontSize: 11, color: THEME.inkDim, marginTop: 12 }}>
        {isDemo
          ? "Chart levels and performance metrics are simulated for demonstration purposes and are not historical market data."
          : `Historical closing levels and performance metrics are calculated from ${marketProviderLabel(indexData?.dataProvider)} data.`}
      </div>

      {isVix && (
        <div style={{ marginTop: 40 }}>
          <SectionHeading title="Major Scheduled Events" />
          <p style={{ fontSize: 11.5, color: THEME.inkDim, marginTop: -8, marginBottom: 12 }}>
            Confirmed upcoming 2026 events that may affect Indian equity volatility. Dates may be revised by the issuing authority.
          </p>
          <Panel style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, minWidth: 780 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${THEME.hairline}` }}>
                  <th style={thStyle}>Date</th>
                  <th style={thStyle}>Category</th>
                  <th style={thStyle}>Scheduled Event</th>
                  <th style={thStyle}>Why It Matters</th>
                  <th style={thStyle}>Source</th>
                </tr>
              </thead>
              <tbody>
                {upcomingVixEvents.map((event) => (
                  <tr key={`${event.date}-${event.event}`} style={{ borderBottom: `1px solid ${THEME.hairline}` }}>
                    <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>
                      {new Date(`${event.date}T00:00:00`).toLocaleDateString("en-IN", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                      {event.endDate
                        ? ` – ${new Date(`${event.endDate}T00:00:00`).toLocaleDateString("en-IN", {
                            day: "2-digit",
                            month: "short",
                          })}`
                        : ""}
                    </td>
                    <td style={tdStyle}>
                      <span style={{ color: THEME.gold, fontWeight: 700 }}>{event.category}</span>
                    </td>
                    <td style={{ ...tdStyle, fontWeight: 600 }}>{event.event}</td>
                    <td style={{ ...tdStyle, color: THEME.creamDim, lineHeight: 1.45 }}>{event.whyItMatters}</td>
                    <td style={tdStyle}>
                      <a href={event.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ color: THEME.gold, textDecoration: "none", whiteSpace: "nowrap" }}>
                        {event.source}
                      </a>
                    </td>
                  </tr>
                ))}
                {upcomingVixEvents.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ ...tdStyle, padding: 24, textAlign: "center", color: THEME.inkDim }}>
                      No remaining confirmed 2026 events are currently listed.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Panel>
        </div>
      )}

      <>
          <div style={{ marginTop: 40 }}>
            <SectionHeading title={isVix ? "What Is Moving the Volatility Index?" : "Index News"} />
          </div>
          <p style={{ fontSize: 11.5, color: THEME.inkDim, marginTop: -8, marginBottom: 12 }}>
            {isVix
              ? "Current reporting filtered for market uncertainty, central banks, foreign flows, crude oil, the rupee, earnings, macro releases and option-market activity."
              : isDemo
              ? `Illustrative sample news for ${indexData?.name || "this benchmark"} — not current reporting.`
              : `Recent developments affecting tracked companies in ${indexData?.name || "this benchmark"}.`}
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 26 }}>
            {news.map((n) => <WideNewsTile key={n.id || n.link || n.title} article={n} onClick={() => setNewsOpen(n)} />)}
            {newsLoading && (
              <Panel style={{ padding: 20, textAlign: "center", color: THEME.inkDim }}>
                {isVix ? "Loading current volatility drivers..." : "Loading current constituent news..."}
              </Panel>
            )}
            {!newsLoading && newsError && (
              <Panel style={{ padding: 20, textAlign: "center", color: THEME.down }}>
                {newsError}
              </Panel>
            )}
            {!newsLoading && !newsError && news.length === 0 && (
              <Panel style={{ padding: 20, textAlign: "center", color: THEME.inkDim }}>
                {isVix ? "No current volatility-driver news is available. Check again later." : "No current constituent news is available. Check again later."}
              </Panel>
            )}
          </div>

          {newsOpen && (
        <div onClick={() => setNewsOpen(null)} style={{ position: "fixed", inset: 0, background: "rgba(5,8,14,0.65)", zIndex: 60, display: "flex", justifyContent: "flex-end" }}>
          <div onClick={(e) => e.stopPropagation()} className="sd-fade-in sd-scroll" style={{ width: 480, maxWidth: "94vw", height: "100%", background: THEME.navyDeep, borderLeft: `1px solid ${THEME.hairline}`, padding: "28px 30px", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <span style={{ fontSize: 11, color: THEME.gold, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6 }}>{indexData?.name}</span>
              <button onClick={() => setNewsOpen(null)} style={{ background: "none", border: "none", color: THEME.inkDim, cursor: "pointer" }}><X size={18} /></button>
            </div>
            <h3 className="sd-serif" style={{ fontSize: 24, margin: "12px 0 8px", lineHeight: 1.3 }}>{newsOpen.title}</h3>
            <div style={{ fontSize: 12, color: THEME.inkDim, marginBottom: 16 }}>{newsOpen.date}</div>
            {newsOpen.teaser && (
              <p style={{ fontSize: 14, lineHeight: 1.6, color: THEME.creamDim, fontStyle: "italic", borderLeft: `2px solid ${THEME.goldSoft}`, paddingLeft: 12, marginBottom: 18 }}>{newsOpen.teaser}</p>
            )}
            {newsOpen.source && (
              <div style={{ fontSize: 12, color: THEME.inkDim, marginTop: 4, marginBottom: 20, borderTop: `1px solid ${THEME.hairline}`, paddingTop: 12 }}>
                <span style={{ textTransform: "uppercase", letterSpacing: 0.5, fontSize: 10.5, color: THEME.gold, display: "block", marginBottom: 3 }}>Source</span>
                {newsOpen.source}
              </div>
            )}
            {newsOpen.link && (
              <a href={newsOpen.link} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", padding: "10px 14px", borderRadius: 4, background: THEME.gold, color: THEME.navyDeep, fontSize: 12.5, fontWeight: 700, textDecoration: "none" }}>
                Read original article →
              </a>
            )}
            {newsOpen.companies && newsOpen.companies.length > 0 && (
              <>
                <div style={{ fontSize: 11.5, textTransform: "uppercase", letterSpacing: 0.5, color: THEME.gold, marginBottom: 8 }}>Related Companies</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {newsOpen.companies.map((r) => (
                    <button key={r} onClick={() => STOCKS_BY_TICKER[r] && openCompany && openCompany(r)} style={{
                      border: `1px solid ${THEME.hairline}`, background: "none", color: THEME.creamDim, borderRadius: 4, padding: "5px 10px", fontSize: 12, cursor: "pointer",
                    }}>{r}</button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
          )}

          {!isVix && (
            <>
              <SectionHeading title="Constituent Stocks" />
              {isDemo && (
                <div style={{ fontSize: 11.5, color: THEME.inkDim, marginTop: -8, marginBottom: 12 }}>
                  Sample companies shown for layout demonstration only; this is not the official index constituent list.
                </div>
              )}
              <Panel style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, minWidth: 680 }}>
          <thead><tr style={{ borderBottom: `1px solid ${THEME.hairline}` }}>
            <th style={thStyle}>Company</th><th style={thStyle}>Price</th><th style={thStyle}>Chg%</th>
            <th style={thStyle}>P/E</th><th style={thStyle}>1Y Return</th>
          </tr></thead>
          <tbody>
            {constituents.map((s) => (
              <tr key={s.ticker} className="sd-row-hover" style={{ borderBottom: `1px solid ${THEME.hairline}` }}>
                <td style={{ ...tdStyle, cursor: "pointer" }} onClick={() => openCompany && openCompany(s.ticker)}>{s.name} <span style={{ color: THEME.inkDim }}>· {s.ticker}</span></td>
                <td style={tdStyle} className="sd-mono">{Number.isFinite(s.price) ? `₹${fmtNum(s.price)}` : "—"}</td>
                <td style={tdStyle}>{Number.isFinite(s.chgPct) ? <Move value={s.chgPct} /> : "—"}</td>
                <td style={tdStyle} className="sd-mono">{Number.isFinite(s.pe) ? fmtNum(s.pe, 1) : "—"}</td>
                <td style={tdStyle}>{Number.isFinite(s.ret1y) ? <Move value={s.ret1y} /> : "—"}</td>
              </tr>
            ))}
            {constituents.length === 0 && (
              <tr><td colSpan={5} style={{ ...tdStyle, textAlign: "center", color: THEME.inkDim, padding: 30 }}>
                {indexData?.isVix ? "India VIX is derived from Nifty option prices and has no equity constituents." : "No tracked constituent data is available."}
              </td></tr>
            )}
          </tbody>
        </table>
              </Panel>
            </>
          )}
      </>
    </div>
  );
}

function EventStrip({ mode, onOpen, events, loading, error }) {
  const [expanded, setExpanded] = useState(false);
  const visibleEvents = events.slice(0, expanded ? 15 : 5);

  return (
    <Panel style={{ padding: 16, marginBottom: 22 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Newspaper size={16} color={THEME.gold} />
          <h3 className="sd-serif" style={{ margin: 0, fontSize: 17 }}>What moved the market?</h3>
        </div>
        <button
          onClick={() => setExpanded((current) => !current)}
          className="sd-underline-link"
          style={{ background: "none", border: "none", color: THEME.gold, fontSize: 12.5 }}
        >
          {expanded ? "Show fewer market events" : "View all market events"}
        </button>
      </div>
      <ModeExplain mode={mode}>This strip links major events to market and sector moves. It explains what happened alongside the move — it isn't a signal telling you to buy or sell.</ModeExplain>
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
        gap: 12,
        marginTop: 12,
        paddingBottom: 4,
      }}>
        {visibleEvents.map((e) => (
          <div key={e.id} onClick={() => onOpen(e)} className="sd-row-hover" style={{
            cursor: "pointer", minWidth: 0, border: `1px solid ${THEME.hairline}`, borderRadius: 5, padding: 12,
          }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 4, fontSize: 10.5 }}>
              <span style={{ color: THEME.gold, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>{e.cat}</span>
              <span style={{ color: THEME.inkDim, lineHeight: 1.3 }}>{e.date}</span>
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, marginTop: 6, lineHeight: 1.35 }}>{e.title}</div>
            <div style={{ fontSize: 11.5, color: THEME.inkDim, marginTop: 6, lineHeight: 1.4 }}>{e.desc}</div>
          </div>
        ))}
        {loading && (
          <div style={{ padding: 20, color: THEME.inkDim, fontSize: 12 }}>
            Loading current market events...
          </div>
        )}
        {!loading && error && (
          <div style={{ padding: 20, color: THEME.down, fontSize: 12 }}>
            {error}
          </div>
        )}
        {!loading && !error && visibleEvents.length === 0 && (
          <div style={{ padding: 20, color: THEME.inkDim, fontSize: 12 }}>
            No current market events are available. Check again later.
          </div>
        )}
      </div>
    </Panel>
  );
}

function MarketsPage({ mode, setPage, openCompany, openBenchmark, watchlist, toggleWatch, compareList, toggleCompare }) {
  const [liveIndices, setLiveIndices] = useState([]);
  const [indicesLoading, setIndicesLoading] = useState(true);
  const [indicesError, setIndicesError] = useState("");
  const [gsec, setGsec] = useState(null);
  const [niftyDetail, setNiftyDetail] = useState(null);
  const [marketEvents, setMarketEvents] = useState([]);
  const [marketEventsLoading, setMarketEventsLoading] = useState(true);
  const [marketEventsError, setMarketEventsError] = useState("");
  const [sectorData, setSectorData] = useState([]);
  const [sectorLoading, setSectorLoading] = useState(true);
  const [sectorError, setSectorError] = useState("");
  const [heatRange, setHeatRange] = useState("1M");
  const [perfTab, setPerfTab] = useState("This Week");
  const [eventOpen, setEventOpen] = useState(null);
  const [capFilter, setCapFilter] = useState("All caps");
  const [performerStocks, setPerformerStocks] = useState([]);
  const [performersLoading, setPerformersLoading] = useState(true);
  const [performersError, setPerformersError] = useState("");

  const performerSymbols = useMemo(
  () => RAW_STOCKS.map((stock) => stock.ticker),
  []
);

const performerDefinitions = useMemo(
  () =>
    new Map(
      RAW_STOCKS.map((stock) => [
        stock.ticker,
        stock,
      ])
    ),
  []
);

const perfMap = {
  "This Week": "1W",
  "This Month": "1M",
  "6 Months": "6M",
  "1 Year": "1Y",
};

const universe = performerStocks.filter(
  (stock) =>
    (capFilter === "All caps" ||
      stock.cap === capFilter) &&
    Number.isFinite(stock.periodReturn)
);

const sortedByRet = [...universe].sort(
  (stockA, stockB) =>
    stockB.periodReturn -
    stockA.periodReturn
);

const mostActive = [...performerStocks]
  .filter(
    (stock) =>
      Number.isFinite(stock.tradedVal) &&
      stock.tradedVal > 0
  )
  .sort(
    (stockA, stockB) =>
      stockB.tradedVal -
      stockA.tradedVal
  )
  .slice(0, 5);

  const leadershipSession = marketSessionDate(niftyDetail?.marketTime);
  const sessionMatchedNiftyStocks = (niftyDetail?.constituents || []).filter(
    (stock) =>
      Number.isFinite(stock?.chgPct) &&
      marketSessionDate(stock?.marketTime) === leadershipSession
  );
  const trackedNiftyStocks = sessionMatchedNiftyStocks.length === 50
    ? sessionMatchedNiftyStocks
    : [];
  const advancing = trackedNiftyStocks.filter((stock) => stock.chgPct > 0.005).length;
  const declining = trackedNiftyStocks.filter((stock) => stock.chgPct < -0.005).length;
  const unchanged = trackedNiftyStocks.filter(
    (stock) =>
      Number.isFinite(stock.chgPct) && Math.abs(stock.chgPct) <= 0.005
  ).length;
  const total = Math.max(1, trackedNiftyStocks.length);
  const rankedNiftyStocks = [...trackedNiftyStocks].sort((stockA, stockB) => stockB.chgPct - stockA.chgPct);
  const leadingStock = rankedNiftyStocks[0];
  const laggingStock = rankedNiftyStocks[rankedNiftyStocks.length - 1];
  const nifty50 = liveIndices.find((idx) => idx.key === "NIFTY50");
  const sensex = liveIndices.find((idx) => idx.key === "SENSEX");
  const newestLeadershipTime = trackedNiftyStocks.length
    ? Math.max(...trackedNiftyStocks.map((stock) => new Date(stock.marketTime).getTime()))
    : NaN;
  const hasLeadershipSnapshot = Boolean(
    nifty50 &&
    sensex &&
    trackedNiftyStocks.length === 50 &&
    leadingStock &&
    laggingStock &&
    marketSessionDate(nifty50.marketTime || nifty50.asOf) === leadershipSession &&
    marketSessionDate(sensex.marketTime || sensex.asOf) === leadershipSession &&
    isCompleteLeadershipObservation(newestLeadershipTime)
  );
  const hasClosingLeadershipSnapshot = hasLeadershipSnapshot &&
    isClosingLeadershipObservation(newestLeadershipTime);
  const leadershipDate = niftyDetail?.marketTime
    ? new Date(niftyDetail.marketTime).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "latest available session";
  const leadershipObservationTime = hasLeadershipSnapshot
    ? [...trackedNiftyStocks]
        .map((stock) => new Date(stock.marketTime).getTime())
        .filter(Number.isFinite)
        .sort((a, b) => b - a)[0]
    : null;
  const leadershipAsOf = Number.isFinite(leadershipObservationTime)
    ? formatMarketAsOf(new Date(leadershipObservationTime).toISOString())
    : leadershipDate;
  const describeIndexMove = (label, value) => {
    const absoluteMove = Math.abs(value);
    if (absoluteMove < 0.005) return `${label} was flat at 0.00%`;
    if (absoluteMove < 0.1) return `${label} was broadly flat at ${value > 0 ? "+" : "-"}${absoluteMove.toFixed(2)}%`;
    return `${label} ${value > 0 ? "rose" : "fell"} ${absoluteMove.toFixed(2)}%`;
  };
  const leadershipHeadline = hasLeadershipSnapshot
    ? Math.abs(nifty50.changePercent) < 0.1
      ? `Nifty 50 stays broadly flat as ${leadingStock.name} leads index constituents`
      : nifty50.changePercent >= 0
      ? `Nifty 50 advances as ${leadingStock.name} leads index constituents`
      : `Nifty 50 declines as ${laggingStock.name} weighs on index constituents`
    : niftyDetail
      ? "Consistent market leadership snapshot unavailable"
      : "Loading the latest Indian market leadership snapshot";
  const leadershipSummary = hasLeadershipSnapshot
    ? `${describeIndexMove("The Nifty 50", nifty50.changePercent)}, while ${describeIndexMove("the Sensex", sensex.changePercent)}. ${leadingStock.name} led the Nifty constituents with a ${leadingStock.chgPct >= 0 ? "gain" : "move"} of ${Math.abs(leadingStock.chgPct).toFixed(2)}%, while ${laggingStock.name} was the weakest at ${laggingStock.chgPct.toFixed(2)}%. Index breadth was ${advancing} advancing, ${unchanged} unchanged and ${declining} declining.${hasClosingLeadershipSnapshot ? "" : " This is the latest complete intraday snapshot; closing breadth is still being refreshed."}`
    : niftyDetail
      ? "The index and constituent observations do not currently belong to the same market session, so StockDekho is withholding the headline and breadth rather than showing mismatched figures."
      : "Current Nifty 50 leadership and breadth data are loading from the market-data provider.";
  const sectorByKey = new Map(
  sectorData.map((sector) => [
    sector.key,
    sector,
  ])
);
    const marketIndexCards = [
  liveIndices.find((idx) => idx.key === "NIFTY50"),
  liveIndices.find((idx) => idx.key === "SENSEX"),
  liveIndices.find((idx) => idx.key === "VIX"),
  gsec ? { ...gsec, isGsec: true } : null,
  liveIndices.find((idx) => idx.key === "BANKNIFTY"),
  liveIndices.find((idx) => idx.key === "NEXT50"),
  liveIndices.find((idx) => idx.key === "MIDCAP150"),
  liveIndices.find((idx) => idx.key === "SMALLCAP250"),
].filter(Boolean);

useEffect(() => {
  let cancelled = false;

  async function loadIndices() {
    setIndicesLoading(true);
    setIndicesError("");

    try {
      const data = await getIndices();

      if (!cancelled) {
        setLiveIndices(
          Array.isArray(data) ? data : []
        );
      }
    } catch (error) {
      console.error(
        "Unable to load live indices:",
        error
      );

      if (!cancelled) {
        setLiveIndices([]);
        setIndicesError(
          "Unable to load live index data."
        );
      }
    } finally {
      if (!cancelled) {
        setIndicesLoading(false);
      }
    }
  }

  loadIndices();
  const refreshTimer = window.setInterval(() => {
    if (isIndianMarketRefreshWindow()) loadIndices();
  }, MARKET_REFRESH_MS);

  return () => {
    cancelled = true;
    window.clearInterval(refreshTimer);
  };
}, []);

useEffect(() => {
  let cancelled = false;
  getIndiaTenYearYield("1M")
    .then((data) => { if (!cancelled) setGsec(data); })
    .catch((error) => {
      console.error("Unable to load India 10Y G-Sec:", error);
      if (!cancelled) setGsec(null);
    });
  return () => { cancelled = true; };
}, []);

useEffect(() => {
  let cancelled = false;

  async function loadMarketContext() {
    setMarketEventsLoading(true);
    setMarketEventsError("");

    try {
      const [detailResult, eventsResult] =
        await Promise.allSettled([
          getIndexDetail("NIFTY50", "1M"),
          getNiftyMarketEvents(),
        ]);

      if (cancelled) {
        return;
      }

      setNiftyDetail(
        detailResult.status === "fulfilled"
          ? detailResult.value
          : null
      );

      const articles =
        eventsResult.status === "fulfilled"
          ? eventsResult.value?.articles || []
          : [];

      if (eventsResult.status === "rejected") {
        setMarketEventsError("Unable to load current market events. Please try again shortly.");
      }

      const blockedMarketEventTerms = [
        "share price",
        "stock price",
        "live bse",
        "live nse",
        "nse/bse",
        "bids offers",
        "buy/sell",
        "f&o quotes",
        "forecast news",
      ];

      const filteredArticles = articles
        .filter((article) => {
          const title = String(
            article.title || ""
          ).toLowerCase();

          return isTodayOrYesterdayNews(article.publishedAt) && !blockedMarketEventTerms.some(
            (term) => title.includes(term)
          );
        })
        .sort((articleA, articleB) => {
  const dateA =
    parseNewsDate(
      articleA.publishedAt
    );

  const dateB =
    parseNewsDate(
      articleB.publishedAt
    );

  if (!dateA && !dateB) {
    return 0;
  }

  if (!dateA) {
    return 1;
  }

  if (!dateB) {
    return -1;
  }

  return (
    dateB.getTime() -
    dateA.getTime()
  );
})
        .slice(0, 15);

      setMarketEvents(
        filteredArticles.map((article) => ({
          id: article.id,
          cat: article.category || "Market",
          title: article.title,
date: formatNewsDate(
  article.publishedAt
),
          desc:
            article.summary ||
            "Open the original report for full details.",
          source: article.source,
          link: article.link,
          related: [],
        }))
      );
    } catch (error) {
      console.error(
        "Unable to load market context:",
        error
      );

      if (!cancelled) {
        setNiftyDetail(null);
        setMarketEvents([]);
        setMarketEventsError("Unable to load current market events. Please try again shortly.");
      }
    } finally {
      if (!cancelled) {
        setMarketEventsLoading(false);
      }
    }
  }

  loadMarketContext();
  const refreshTimer = window.setInterval(() => {
    if (isIndianMarketRefreshWindow()) loadMarketContext();
  }, MARKET_REFRESH_MS);

  return () => {
    cancelled = true;
    window.clearInterval(refreshTimer);
  };
}, []);

useEffect(() => {
  let cancelled = false;

  async function loadSectorData() {
    setSectorLoading(true);
    setSectorError("");

    try {
      const data = await getSectors();

      if (!cancelled) {
        setSectorData(
          Array.isArray(data) ? data : []
        );
      }
    } catch (error) {
      console.error(
        "Unable to load sector data:",
        error
      );

      if (!cancelled) {
        setSectorData([]);
        setSectorError("Unable to load live sector performance. Please try again shortly.");
      }
    } finally {
      if (!cancelled) {
        setSectorLoading(false);
      }
    }
  }

  loadSectorData();

  return () => {
    cancelled = true;
  };
}, []);

useEffect(() => {
  let cancelled = false;

  const rangeByTab = {
    "This Week": "1W",
    "This Month": "1M",
    "6 Months": "6M",
    "1 Year": "1Y",
  };

  async function loadPerformerStocks() {
    setPerformersLoading(true);
    setPerformersError("");

    try {
      const response = await getMarketPerformers(
        performerSymbols,
        rangeByTab[perfTab] || "1M"
      );
      if (cancelled) {
        return;
      }

      const liveStocks = Array.isArray(response?.stocks)
        ? response.stocks
        : [];

      const mergedStocks = liveStocks.map((stock) => {
        const definition =
          performerDefinitions.get(stock.ticker);

        return {
          ...definition,
          ...stock,

          sector:
            definition?.sector ||
            "Other",

          cap:
            definition?.cap ||
            "Large",

          tradedVal:
            stock.tradedValue ?? null,

          periodReturn:
            stock.returnPercent ?? null,
        };
      });

      setPerformerStocks(mergedStocks);
    } catch (error) {
      console.error(
        "Unable to load market performers:",
        error
      );

      if (!cancelled) {
        setPerformerStocks([]);
        setPerformersError(
          "Unable to load live performer data."
        );
      }
    } finally {
      if (!cancelled) {
        setPerformersLoading(false);
      }
    }
  }

  loadPerformerStocks();

  return () => {
    cancelled = true;
  };
}, [
  perfTab,
  performerSymbols,
  performerDefinitions,
]);
  return (
    <div className="sd-fade-in" style={{ padding: "22px 20px 60px", maxWidth: 1280, margin: "0 auto" }}>
      <SectionHeading eyebrow="India Equities · Markets" title="Indian Markets" />

      <div className="sd-scroll" style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 6, marginBottom: 20, alignItems: "flex-start" }}>
        {marketIndexCards.map((idx) => <IndexCard key={idx.key} idx={idx} onOpen={openBenchmark} />)}
        {indicesLoading && (
          <Panel style={{ width: 176, minWidth: 176, height: 128, display: "flex", alignItems: "center", justifyContent: "center", color: THEME.inkDim, fontSize: 11.5 }}>
            Loading live indices...
          </Panel>
        )}
        {!indicesLoading && indicesError && (
          <Panel style={{ width: 220, minWidth: 220, height: 128, display: "flex", alignItems: "center", justifyContent: "center", color: THEME.down, fontSize: 11.5, textAlign: "center", padding: 14 }}>
            {indicesError}
          </Panel>
        )}
        
      </div>

      <Panel style={{ padding: "18px 20px", marginBottom: 22 }}>
        <div style={{ fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: THEME.gold, marginBottom: 6 }}>Market leadership</div>
        <h1 className="sd-serif" style={{ fontSize: 26, margin: "0 0 10px", lineHeight: 1.25 }}>
          {leadershipHeadline}
        </h1>
        <p style={{ fontSize: 13.5, color: THEME.inkDim, lineHeight: 1.55, maxWidth: 820, margin: 0 }}>
          {leadershipSummary}
        </p>
        {hasLeadershipSnapshot && <div style={{ display: "flex", gap: 22, marginTop: 16, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 11, color: THEME.inkDim, marginBottom: 6 }}>
              Nifty 50 breadth ({leadershipAsOf})
            </div>
            <div style={{ display: "flex", height: 8, width: 260, borderRadius: 4, overflow: "hidden" }}>
              <div style={{ width: `${(advancing / total) * 100}%`, background: THEME.up }} />
              <div style={{ width: `${(unchanged / total) * 100}%`, background: THEME.hairline }} />
              <div style={{ width: `${(declining / total) * 100}%`, background: THEME.down }} />
            </div>
            <div style={{ display: "flex", gap: 14, fontSize: 11.5, marginTop: 6 }}>
              <span style={{ color: THEME.up }}>Advancing {advancing}</span>
              <span style={{ color: THEME.inkDim }}>Unchanged {unchanged}</span>
              <span style={{ color: THEME.down }}>Declining {declining}</span>
            </div>
          </div>
        </div>}
      </Panel>

      <EventStrip mode={mode} onOpen={setEventOpen} events={marketEvents} loading={marketEventsLoading} error={marketEventsError} />

      {eventOpen && (
        <div onClick={() => setEventOpen(null)} style={{ position: "fixed", inset: 0, background: "rgba(5,8,14,0.65)", zIndex: 60, display: "flex", justifyContent: "flex-end" }}>
          <div onClick={(e) => e.stopPropagation()} className="sd-fade-in sd-scroll" style={{ width: 480, maxWidth: "94vw", height: "100%", background: THEME.navyDeep, borderLeft: `1px solid ${THEME.hairline}`, padding: "28px 30px", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <span style={{ fontSize: 11, color: THEME.gold, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6 }}>{eventOpen.cat}</span>
              <button onClick={() => setEventOpen(null)} style={{ background: "none", border: "none", color: THEME.inkDim, cursor: "pointer" }}><X size={18} /></button>
            </div>
            <h3 className="sd-serif" style={{ fontSize: 25, margin: "12px 0 8px", lineHeight: 1.3 }}>{eventOpen.title}</h3>
            <div style={{ fontSize: 12, color: THEME.inkDim, marginBottom: 16 }}>{eventOpen.date}</div>
            <p style={{ fontSize: 14, lineHeight: 1.6, color: THEME.creamDim, fontStyle: "italic", borderLeft: `2px solid ${THEME.goldSoft}`, paddingLeft: 12, marginBottom: 18 }}>{eventOpen.desc}</p>
            {(eventOpen.body || []).map((p, i) => (
              <p key={i} style={{ fontSize: 13.5, lineHeight: 1.7, color: THEME.creamDim, marginBottom: 14 }}>{p}</p>
            ))}
            <div style={{ fontSize: 11.5, color: THEME.inkDim, marginTop: 4, marginBottom: 18 }}>
              This is a neutral factual summary. It does not imply certainty of causation and is not investment advice.
            </div>
            {eventOpen.source && (
              <div style={{ fontSize: 12, color: THEME.inkDim, marginBottom: 20, borderTop: `1px solid ${THEME.hairline}`, paddingTop: 12 }}>
                <span style={{ textTransform: "uppercase", letterSpacing: 0.5, fontSize: 10.5, color: THEME.gold, display: "block", marginBottom: 3 }}>Source</span>
                {eventOpen.source}
              </div>
            )}
            {eventOpen.link && (
              <a href={eventOpen.link} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", padding: "10px 14px", borderRadius: 4, background: THEME.gold, color: THEME.navyDeep, fontSize: 12.5, fontWeight: 700, textDecoration: "none", marginBottom: 18 }}>
                Read original article →
              </a>
            )}
            {(eventOpen.related || []).length > 0 && (
              <>
                <div style={{ fontSize: 11.5, textTransform: "uppercase", letterSpacing: 0.5, color: THEME.gold, marginBottom: 8 }}>Related</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {eventOpen.related.map((r) => (
                    <button key={r} onClick={() => STOCKS_BY_TICKER[r] && openCompany(r)} style={{
                      border: `1px solid ${THEME.hairline}`, background: "none", color: THEME.creamDim, borderRadius: 4, padding: "5px 10px", fontSize: 12, cursor: "pointer",
                    }}>{r}</button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}

     <SectionHeading
  title="Sector performance heatmap"
  action={
    <div style={{ display: "flex", gap: 6 }}>
      {["1W", "1M", "3M", "6M", "9M", "1Y"].map((period) => (
        <Pill
          key={period}
          active={heatRange === period}
          onClick={() => setHeatRange(period)}
        >
          {period}
        </Pill>
      ))}
    </div>
  }
/>

{sectorLoading ? (
  <Panel
    style={{
      padding: 30,
      marginBottom: 26,
      textAlign: "center",
      color: THEME.inkDim,
    }}
  >
    Loading live sector performance...
  </Panel>
) : sectorError ? (
  <Panel style={{ padding: 30, marginBottom: 26, textAlign: "center", color: THEME.down }}>
    {sectorError}
  </Panel>
) : (
  <div
    style={{
      display: "grid",
      gridTemplateColumns:
        "repeat(auto-fill, minmax(190px, 1fr))",
      gap: 10,
      marginBottom: 26,
    }}
  >
    {SECTOR_LIST.map((sectorName) => {
      const liveSector = sectorByKey.get(sectorName);

      if (!liveSector) {
        return null;
      }

      const value = Number(
        liveSector.returns?.[heatRange]
      );

      if (!Number.isFinite(value)) {
        return null;
      }

      const intensity = Math.min(
        Math.abs(value) / 20,
        1
      );

      const background =
        value >= 0
          ? `rgba(63,167,114,${0.12 + intensity * 0.35})`
          : `rgba(197,86,74,${0.12 + intensity * 0.35})`;

      return (
        <div
          key={sectorName}
          onClick={() => setPage("sectors")}
          className="sd-row-hover"
          style={{
            cursor: "pointer",
            borderRadius: 6,
            padding: 12,
            background,
            border: `1px solid ${THEME.hairline}`,
          }}
        >
          <div
            style={{
              fontSize: 12.5,
              fontWeight: 700,
            }}
          >
            {sectorName}
          </div>

          <div
            style={{
              fontSize: 9.5,
              color: THEME.inkDim,
              marginTop: 1,
            }}
          >
            {liveSector.benchmarkName}
            {liveSector.proxy ? " (proxy)" : ""}
          </div>

          <div style={{ marginTop: 8 }}>
            <Move value={value} />
          </div>

          {liveSector.leader &&
            liveSector.lagger &&
            liveSector.leader !== liveSector.lagger && (
              <div
                style={{
                  fontSize: 10.5,
                  color: THEME.inkDim,
                  marginTop: 6,
                }}
              >
                Leader {liveSector.leader} · Lagger{" "}
                {liveSector.lagger}
              </div>
            )}
        </div>
      );
    })}
  </div>
)}
      <SectionHeading title="Best & worst performers"
        action={<div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <select value={capFilter} onChange={(e) => setCapFilter(e.target.value)} style={selectStyle}>
            {["All caps", "Large", "Mid", "Small", "Micro"].map((c) => <option key={c}>{c}</option>)}
          </select>
          <div style={{ display: "flex", gap: 6 }}>{Object.keys(perfMap).map((t) => <Pill key={t} active={perfTab === t} onClick={() => setPerfTab(t)}>{t}</Pill>)}</div>
        </div>} />
<ModeExplain mode={mode}>
  Rankings use provider-supplied historical prices across StockDekho's 200 tracked companies. The market-cap filter is based on StockDekho's current stock classifications.
</ModeExplain>
      <div className="sd-grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 12, marginBottom: 26 }}>
  {!performersLoading && sortedByRet.length > 0 && (
  <>
    <RankTable
      title="Top performers"
      rows={sortedByRet.slice(0, 6)}
      metricKey="periodReturn"
      openCompany={openCompany}
      watchlist={watchlist}
      toggleWatch={toggleWatch}
    />

    <RankTable
      title="Bottom performers"
      rows={sortedByRet.slice(-6).reverse()}
      metricKey="periodReturn"
      openCompany={openCompany}
      watchlist={watchlist}
      toggleWatch={toggleWatch}
    />
  </>
)}
      </div>

      <SectionHeading title="Most active by traded value" />
      <div
  className="sd-featured-grid"
  style={{
    fontSize: 11,
    color: THEME.inkDim,
    marginTop: 4,
    marginBottom: 12,
  }}
>
  Ranked across StockDekho's 200 tracked companies by the estimated value of shares traded in the latest available session, using the latest available market data.
</div>
      <RankTable title="" rows={mostActive} metricKey="tradedVal" metricLabel="Traded value (₹Cr)" openCompany={openCompany} watchlist={watchlist} toggleWatch={toggleWatch} wide />

      <div
  style={{
    display: "grid",
    gridTemplateColumns:
      "repeat(auto-fit, minmax(420px, 1fr))",
    gap: 16,
    marginTop: 26,
  }}
>
  <FeaturedChartCard
    title="Nifty 50"
    dataType="index"
    dataKey="NIFTY50"
  />

  <FeaturedChartCard
    title="USD/INR"
    dataType="currency"
    dataKey="USD"
  />
</div>
    </div>
  );
}

const selectStyle = {
  background: THEME.panel, border: `1px solid ${THEME.hairline}`, color: THEME.ink, borderRadius: 4, padding: "6px 8px", fontSize: 12.5,
};

function RankTable({ title, rows, metricKey, metricLabel, openCompany, watchlist, toggleWatch, wide }) {
  return (
    <Panel style={{ padding: 14 }}>
      {title && <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>{title}</div>}
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
        <tbody>
          {rows.map((s) => (
            <tr key={s.ticker} className="sd-row-hover" style={{ borderTop: `1px solid ${THEME.hairline}` }}>
              <td style={{ padding: "7px 4px", width: 24 }}><WatchStar active={watchlist.includes(s.ticker)} onClick={() => toggleWatch(s.ticker)} /></td>
              <td onClick={() => openCompany(s.ticker)} style={{ padding: "7px 4px", cursor: "pointer" }}>
                <div style={{ fontWeight: 600 }}>{s.ticker}</div>
                <div style={{ fontSize: 10.5, color: THEME.inkDim }}>{s.sector}</div>
              </td>
              <td style={{ padding: "7px 4px", textAlign: "right", color: THEME.inkDim }}>₹{fmtNum(s.price)}</td>
              <td style={{ padding: "7px 4px", textAlign: "right", width: wide ? 130 : 90 }}>
                {metricKey === "tradedVal" ? <span className="sd-mono">{fmtCr(s.tradedVal)}</span> : <Move value={s[metricKey]} />}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}

function FeaturedChartCard({
  title,
  dataType,
  dataKey,
}) {
  const [period, setPeriod] = useState("1Y");
  const [history, setHistory] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const chartPeriods = [
    "1W",
    "1M",
    "3M",
    "6M",
    "1Y",
    "3Y",
    "5Y",
    "Max",
  ];

  useEffect(() => {
    let cancelled = false;

    async function loadChartHistory() {
      setLoading(true);
      setError("");

      try {
        const data =
          dataType === "index"
            ? await getIndexDetail(
                dataKey,
                period
              )
            : await getCurrencyHistory(
                dataKey,
                period
              );

        if (!cancelled) {
          setHistory(data);
        }
      } catch (requestError) {
        console.error(
          `Unable to load ${title} history:`,
          requestError
        );

        if (!cancelled) {
          setHistory(null);
          setError(
            `Unable to load live ${title} history.`
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadChartHistory();

    return () => {
      cancelled = true;
    };
  }, [
    title,
    dataType,
    dataKey,
    period,
  ]);

  const points = Array.isArray(history?.points)
    ? history.points
    : [];

  const series = points
    .map((point) =>
      Number(
        point.adjustedClose ??
          point.close
      )
    )
    .filter(Number.isFinite);

  const labels = points.map((point) =>
    new Date(
      `${point.date}T00:00:00`
    ).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year:
        points.length > 400
          ? "2-digit"
          : undefined,
    })
  );

  const firstValue = series[0];
  const lastValue =
    series[series.length - 1];

  const periodReturn =
    Number.isFinite(firstValue) &&
    Number.isFinite(lastValue) &&
    firstValue !== 0
      ? (
          (lastValue / firstValue - 1) *
          100
        )
      : null;

  const latestDate =
    points.length > 0
      ? new Date(
          `${points[
            points.length - 1
          ].date}T00:00:00`
        ).toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        })
      : null;

  return (
    <Panel style={{ padding: 16 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          marginBottom: 10,
        }}
      >
        <div
          style={{
            fontSize: 14,
            fontWeight: 700,
          }}
        >
          {title}
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          {Number.isFinite(periodReturn) && (
            <Move
              value={periodReturn}
              size={12}
            />
          )}

          <LiveTag live small statusLabel={dataType === "currency" ? (isCurrencyMarketOpen() ? "Live" : "EOD") : isIndianMarketOpen() ? "Live" : "EOD"} />
        </div>
      </div>

      <div
        className="sd-scroll"
        style={{
          display: "flex",
          flexWrap: "nowrap",
          alignItems: "center",
          gap: 6,
          overflowX: "auto",
          paddingBottom: 6,
          marginBottom: 10,
        }}
      >
        <span
          style={{
            fontSize: 10.5,
            color: THEME.inkDim,
            whiteSpace: "nowrap",
            marginRight: 2,
          }}
        >
          Period Range:
        </span>

        {chartPeriods.map(
          (rangeOption) => (
            <Pill
              key={rangeOption}
              active={
                period === rangeOption
              }
              onClick={() =>
                setPeriod(rangeOption)
              }
            >
              {rangeOption}
            </Pill>
          )
        )}
      </div>

      {loading ? (
        <div
          style={{
            height: 180,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: THEME.inkDim,
            fontSize: 12,
          }}
        >
          Loading live {title} history...
        </div>
      ) : error ? (
        <div
          style={{
            height: 180,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: THEME.down,
            fontSize: 12,
            textAlign: "center",
          }}
        >
          {error}
        </div>
      ) : series.length < 2 ? (
        <div
          style={{
            height: 180,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: THEME.inkDim,
            fontSize: 12,
          }}
        >
          Historical data is unavailable.
        </div>
      ) : (
        <PriceChart
          series={series}
          labels={labels}
          height={180}
          color={THEME.gold}
        />
      )}

      <div
        style={{
          fontSize: 10.5,
          color: THEME.inkDim,
          marginTop: 6,
        }}
      >
        Market-provider historical data
        {latestDate
          ? ` · latest available session ${latestDate}`
          : ""}
        .
      </div>
    </Panel>
  );
}

/* =========================================================================================
   ALL NSE STOCKS DIRECTORY
   ========================================================================================= */
// Plain-English metric explanations used for column-header tooltips on the Stocks screener.
const METRIC_INFO = {
  price: { what: "The last traded (EOD) price on NSE.", why: "The reference point for everything else on this row.", how: "Not meaningful alone — always read alongside valuation and quality metrics." },
  chgPct: { what: "The daily change in the stock price versus the previous session's close.", why: "Investors use it to understand the direction and scale of the latest market move.", how: "A single day's move is short-term context, not a view of business quality." },
  mcap: { what: "Market capitalisation: share price × total shares outstanding.", why: "Indicates company size and typically its liquidity and volatility profile.", how: "Larger caps are usually more stable; smaller caps can be more volatile and less liquid." },
  tradedVal: { what: "Total value of shares traded on NSE that day.", why: "A proxy for how liquid — how easy to buy/sell without moving the price — a stock is.", how: "Very low traded value can mean wider spreads and higher execution risk." },
  pe: { what: "Price-to-Earnings ratio: share price divided by earnings per share.", why: "A common shorthand for how expensive a stock is relative to its profit.", how: "Compare within the same sector — 'expensive' varies a lot by industry and growth rate." },
  bookValue: { what: "Book value per share: the company's net assets divided by its outstanding shares.", why: "Investors use it to compare the market price with the accounting value attributable to each share.", how: "It is most useful for asset-heavy businesses and should be compared with sector peers." },
  pb: { what: "Price-to-Book ratio: share price divided by book value (net assets) per share.", why: "Shows how the market values a company relative to its accounting net worth.", how: "More useful for asset-heavy businesses like banks; less meaningful for asset-light services firms." },
  roe: { what: "Return on Equity: net profit as a % of shareholder equity.", why: "Measures how efficiently a company generates profit from shareholders' capital.", how: "Higher and more consistent ROE over time generally signals a more efficient, better-run business." },
  roce: { what: "Return on Capital Employed: operating profit as a % of capital used in the business.", why: "Measures how efficiently a company turns capital into operating profit.", how: "Higher and more stable ROCE over time generally signals a more efficient business." },
  de: { what: "Debt-to-Equity: total debt divided by shareholder equity.", why: "Indicates balance-sheet leverage and financial risk.", how: "Lower is generally safer, but 'normal' levels vary a lot by industry (e.g. banks vs. FMCG)." },
  divYield: { what: "Dividend Yield: annual dividend per share as a % of the current share price.", why: "Shows the cash return paid to shareholders relative to what the stock costs today.", how: "High yield alone isn't necessarily attractive — check whether the payout is sustainable from earnings." },
  ret1y: { what: "Total price return over the trailing 1 year.", why: "A simple gauge of recent performance.", how: "Past returns don't predict future ones — pair with fundamentals, not use alone." },
  sector: { what: "Sector Classification group the company belongs to.", why: "Lets you compare a company against true business peers.", how: "Use alongside the Sectors page to see how the whole group is trending." },
};

// Fixed-position tooltip anchored to a measured trigger rect. Deliberately NOT a portal (this
// artifact sandbox doesn't support importing react-dom) — position:fixed alone already escapes
// clipping from an overflow:auto ancestor (e.g. a horizontally-scrollable table wrapper) and
// table paint-order quirks, since none of our ancestors set transform/filter/will-change.
function TooltipPopup({ anchorRect, align = "left", children }) {
  if (!anchorRect) return null;
  const width = 250;
  const margin = 12;
  const viewportWidth = typeof window !== "undefined" ? window.innerWidth : 1200;
  let left = align === "right" ? anchorRect.right - width : anchorRect.left;
  left = Math.max(margin, Math.min(left, viewportWidth - width - margin));
  const top = anchorRect.bottom + 8;
  return (
    <div className="sd-fade-in" style={{
      position: "fixed", zIndex: 500, top, left, width, maxWidth: `calc(100vw - ${margin * 2}px)`, boxSizing: "border-box",
      textAlign: "left", textTransform: "none", fontWeight: 400, fontSize: 11.5, lineHeight: 1.45,
      background: THEME.panelAlt, border: `1px solid ${THEME.hairline}`, borderRadius: 5, padding: 10,
      color: THEME.creamDim, boxShadow: "0 10px 28px rgba(0,0,0,0.5)",
      whiteSpace: "normal", wordBreak: "break-word", overflowWrap: "break-word",
    }}>
      {children}
    </div>
  );
}

function ThTooltip({ label, infoKey, style, align = "left" }) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState(null);
  const ref = useRef(null);
  const info = METRIC_INFO[infoKey];
  const showTooltip = () => { if (ref.current) setRect(ref.current.getBoundingClientRect()); setOpen(true); };
  return (
    <th
      ref={ref}
      onMouseEnter={() => info && showTooltip()}
      onMouseLeave={() => setOpen(false)}
      onClick={() => { if (info) { if (ref.current) setRect(ref.current.getBoundingClientRect()); setOpen((o) => !o); } }}
      style={{ ...thStyle, ...style, cursor: info ? "help" : "default", position: "relative", textAlign: align, whiteSpace: "nowrap" }}
    >
      <span style={{ display: "inline-flex", alignItems: "center", gap: 3, justifyContent: align === "right" ? "flex-end" : "flex-start", width: "100%" }}>
        {label}
        {info && <Info size={10} style={{ opacity: 0.6 }} />}
      </span>
      {open && info && (
        <TooltipPopup anchorRect={rect} align={align}>
          <div style={{ marginBottom: 5 }}><b style={{ color: THEME.gold }}>What: </b>{info.what}</div>
          <div style={{ marginBottom: 5 }}><b style={{ color: THEME.gold }}>Why it matters: </b>{info.why}</div>
          <div><b style={{ color: THEME.gold }}>How to read it: </b>{info.how}</div>
        </TooltipPopup>
      )}
    </th>
  );
}

// Row-oriented version of the Stocks-page metric tooltip, used on the Compare page where
// metrics run down the left column rather than across the header row.
function RowMetricLabel({ label, infoKey }) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState(null);
  const ref = useRef(null);
  const info = METRIC_INFO[infoKey];
  const showTooltip = () => { if (ref.current) setRect(ref.current.getBoundingClientRect()); setOpen(true); };
  return (
    <span
      ref={ref}
      onMouseEnter={() => info && showTooltip()}
      onMouseLeave={() => setOpen(false)}
      onClick={() => { if (info) { if (ref.current) setRect(ref.current.getBoundingClientRect()); setOpen((o) => !o); } }}
      style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: 5, cursor: info ? "pointer" : "default" }}
    >
      {label}{info && <Info size={11} style={{ opacity: 0.6, flexShrink: 0 }} />}
      {open && info && (
        <TooltipPopup anchorRect={rect} align="left">
          <div style={{ marginBottom: 5 }}><b style={{ color: THEME.gold }}>What: </b>{info.what}</div>
          <div style={{ marginBottom: 5 }}><b style={{ color: THEME.gold }}>Why it matters: </b>{info.why}</div>
          <div><b style={{ color: THEME.gold }}>How to read it: </b>{info.how}</div>
        </TooltipPopup>
      )}
    </span>
  );
}

function MetricRangeFilter({ label, value, onChange, options }) {
  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: THEME.inkDim, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6 }}>{label}</div>
      <select value={value} onChange={(event) => onChange(event.target.value)} style={{ ...selectStyle, width: "100%" }}>
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>{optionLabel}</option>
        ))}
      </select>
    </div>
  );
}

function FilterSidebar({ selectedSectors, setSelectedSectors, priceRange, setPriceRange, mcapRange, setMcapRange, peRange, setPeRange,
  chgRange, setChgRange, ret1yRange, setRet1yRange, onReset }) {
  return (
    <Panel className="sd-filter-sidebar" style={{ padding: 16, width: 232, flexShrink: 0, alignSelf: "flex-start", position: "sticky", top: 140 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700 }}>Filters</div>
        <button onClick={onReset} style={{ background: "none", border: "none", color: THEME.gold, fontSize: 11, cursor: "pointer" }}>Reset</button>
      </div>

      <div style={{ fontSize: 11, fontWeight: 700, color: THEME.inkDim, textTransform: "uppercase", letterSpacing: 0.4, margin: "16px 0 6px" }}>Sector Classification</div>
      <div style={{ maxHeight: 210, overflowY: "auto", paddingRight: 4 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, padding: "3px 0", cursor: "pointer" }}>
          <input type="checkbox" checked={selectedSectors.length === 0} onChange={() => setSelectedSectors([])} />
          All sectors
        </label>
        {SECTOR_LIST.map((sectorName) => (
          <label key={sectorName} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, padding: "3px 0", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={selectedSectors.includes(sectorName)}
              onChange={() => setSelectedSectors(
                selectedSectors.includes(sectorName)
                  ? selectedSectors.filter((item) => item !== sectorName)
                  : [...selectedSectors, sectorName]
              )}
            />
            {sectorName}
          </label>
        ))}
      </div>

      <MetricRangeFilter label="EOD Price" value={priceRange} onChange={setPriceRange} options={[
        ["all", "All prices"], ["low", "Under ₹500"], ["mid", "₹500 to ₹2,000"], ["high", "Above ₹2,000"],
      ]} />
      <MetricRangeFilter label="Market Cap" value={mcapRange} onChange={setMcapRange} options={[
        ["all", "All market caps"], ["low", "Under ₹20,000 Cr"], ["mid", "₹20,000 to ₹1,00,000 Cr"], ["high", "Above ₹1,00,000 Cr"],
      ]} />
      <MetricRangeFilter label="P/E" value={peRange} onChange={setPeRange} options={[
        ["all", "All P/E ratios"], ["low", "Under 20"], ["mid", "20 to 40"], ["high", "Above 40"],
      ]} />
      <MetricRangeFilter label="CHG %" value={chgRange} onChange={setChgRange} options={[
        ["all", "All daily changes"], ["negative", "Declining (< 0%)"], ["moderate", "0% to 1%"], ["strong", "Above 1%"],
      ]} />
      <MetricRangeFilter label="1Y Return" value={ret1yRange} onChange={setRet1yRange} options={[
        ["all", "All returns"], ["negative", "Negative (< 0%)"], ["moderate", "0% to 20%"], ["strong", "Above 20%"],
      ]} />
    </Panel>
  );
}

function StocksPage({ mode, setPage, openCompany, watchlist, toggleWatch, compareList, toggleCompare }) {
  const [q, setQ] = useState("");
  const [selectedSectors, setSelectedSectors] = useState([]);
  const [priceRange, setPriceRange] = useState("all");
  const [mcapRange, setMcapRange] = useState("all");
  const [peRange, setPeRange] = useState("all");
  const [chgRange, setChgRange] = useState("all");
  const [ret1yRange, setRet1yRange] = useState("all");
  const [page, setPageN] = useState(1);
  const [liveStocks, setLiveStocks] = useState([]);
  const [stocksLoading, setStocksLoading] = useState(true);
  const [stocksError, setStocksError] = useState("");
  const perPage = 12;
  const stocksAsOf = liveStocks
    .map((stock) => stock.asOf)
    .filter(Boolean)
    .sort()
    .at(-1);

  const stockSymbols = useMemo(
    () => RAW_STOCKS.map((stock) => stock.ticker),
    []
  );
  const stockDefinitions = useMemo(
    () => new Map(RAW_STOCKS.map((stock) => [stock.ticker, stock])),
    []
  );

  useEffect(() => {
    let cancelled = false;

    async function loadStocks() {
      setStocksLoading(true);
      setStocksError("");

      try {
        const data = await getStockUniverse(stockSymbols);

        if (!cancelled) {
          setLiveStocks(
            data.map((stock) => {
              const definition = stockDefinitions.get(stock.ticker);

              return {
                ...stock,
                sector: definition?.sector || "Unclassified",
                cap: definition?.cap || "Unclassified",
                live: true,
              };
            })
          );
        }
      } catch (requestError) {
        if (!cancelled) {
          setLiveStocks([]);
          setStocksError("Unable to load live stock data.");
        }
      } finally {
        if (!cancelled) {
          setStocksLoading(false);
        }
      }
    }

    loadStocks();

    return () => {
      cancelled = true;
    };
  }, [stockDefinitions, stockSymbols]);

  const resetFilters = () => {
    setQ(""); setSelectedSectors([]); setPriceRange("all"); setMcapRange("all"); setPeRange("all");
    setChgRange("all"); setRet1yRange("all");
    setPageN(1);
  };

  let rows = liveStocks.filter((s) => {
    const matchQ = !q || s.name.toLowerCase().includes(q.toLowerCase()) || s.ticker.toLowerCase().includes(q.toLowerCase());
    const matchSector = selectedSectors.length === 0 || selectedSectors.includes(s.sector);
    const matchPrice = priceRange === "all" || (
      Number.isFinite(s.price) && (
        (priceRange === "low" && s.price < 500) ||
        (priceRange === "mid" && s.price >= 500 && s.price <= 2000) ||
        (priceRange === "high" && s.price > 2000)
      )
    );
    const matchMcap = mcapRange === "all" || (
      Number.isFinite(s.mcap) && (
        (mcapRange === "low" && s.mcap < 20000) ||
        (mcapRange === "mid" && s.mcap >= 20000 && s.mcap <= 100000) ||
        (mcapRange === "high" && s.mcap > 100000)
      )
    );
    const matchPe = peRange === "all" || (
      Number.isFinite(s.pe) && (
        (peRange === "low" && s.pe < 20) ||
        (peRange === "mid" && s.pe >= 20 && s.pe <= 40) ||
        (peRange === "high" && s.pe > 40)
      )
    );
    const matchChg = chgRange === "all" || (
      Number.isFinite(s.chgPct) && (
        (chgRange === "negative" && s.chgPct < 0) ||
        (chgRange === "moderate" && s.chgPct >= 0 && s.chgPct <= 1) ||
        (chgRange === "strong" && s.chgPct > 1)
      )
    );
    const matchRet = ret1yRange === "all" || (
      Number.isFinite(s.ret1y) && (
        (ret1yRange === "negative" && s.ret1y < 0) ||
        (ret1yRange === "moderate" && s.ret1y >= 0 && s.ret1y <= 20) ||
        (ret1yRange === "strong" && s.ret1y > 20)
      )
    );
    return matchQ && matchSector && matchPrice && matchMcap && matchPe && matchChg && matchRet;
  });
  rows = [...rows].sort((a, b) => {
    const watchlistDifference =
      Number(watchlist.includes(b.ticker)) -
      Number(watchlist.includes(a.ticker));

    if (watchlistDifference !== 0) {
      return watchlistDifference;
    }

    return (b.mcap ?? -Infinity) - (a.mcap ?? -Infinity);
  });
  const totalPages = Math.max(1, Math.ceil(rows.length / perPage));
  const pageRows = rows.slice((page - 1) * perPage, page * perPage);

  const handleToggleWatch = (ticker) => {
    toggleWatch(ticker);
    setPageN(1);
  };

  const stocksTd = { padding: "12px 14px", whiteSpace: "nowrap", overflow: "hidden" };

  const cols = [
    { key: "ticker", label: "Company", info: null, width: 240, align: "left" },
    { key: "sector", label: "Sector", info: null, width: 168, align: "left" },
    { key: "price", label: "EOD Price", info: "price", width: 104, align: "right" },
    { key: "mcap", label: "Mkt Cap", info: "mcap", width: 116, align: "right" },
    { key: "pe", label: "P/E", info: "pe", width: 72, align: "right" },
    { key: "chgPct", label: "Chg %", info: "chgPct", width: 96, align: "right" },
    { key: "ret1y", label: "1Y Return", info: "ret1y", width: 100, align: "right" },
  ];

  return (
    <div className="sd-fade-in" style={{ padding: "22px 20px 60px", maxWidth: 1280, margin: "0 auto" }}>
      <SectionHeading eyebrow="Screener" title="All NSE Stocks" />
      <p style={{ fontSize: 12.5, color: THEME.inkDim, marginTop: -8, marginBottom: 16, maxWidth: 760 }}>
        Tracks a representative universe of 200 NSE-listed equities across market-cap bands — not only Nifty 50 constituents.
        Prices and performance use the latest available Upstox market data. Explore the universe by{" "}
        <button
          type="button"
          className="sd-underline-link"
          onClick={() => setPage("sectors")}
          style={{
            appearance: "none",
            background: "none",
            border: 0,
            color: "inherit",
            cursor: "pointer",
            font: "inherit",
            padding: 0,
          }}
        >
          Sector Classification
        </button>.
        {stocksAsOf && <> Data as of {formatMarketAsOf(stocksAsOf)}.</>}
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, background: THEME.panel, border: `1px solid ${THEME.hairline}`, borderRadius: 5, padding: "6px 10px", minWidth: 220 }}>
          <Search size={13} color={THEME.inkDim} />
          <input value={q} onChange={(e) => { setQ(e.target.value); setPageN(1); }} placeholder="Search company or ticker"
            style={{ background: "none", border: "none", outline: "none", color: THEME.ink, fontSize: 12.5, width: "100%" }} />
        </div>
      </div>

      <ModeExplain mode={mode}>Use the metric filters on the left to narrow the universe; selected information icons explain unfamiliar concepts. The star adds to Watchlist, the + adds to Compare (up to 5).</ModeExplain>

      <div className="sd-stocks-layout" style={{ display: "flex", gap: 16, marginTop: 12, alignItems: "flex-start" }}>
        <FilterSidebar
          selectedSectors={selectedSectors} setSelectedSectors={(value) => { setSelectedSectors(value); setPageN(1); }}
          priceRange={priceRange} setPriceRange={(value) => { setPriceRange(value); setPageN(1); }}
          mcapRange={mcapRange} setMcapRange={(value) => { setMcapRange(value); setPageN(1); }}
          peRange={peRange} setPeRange={(value) => { setPeRange(value); setPageN(1); }}
          chgRange={chgRange} setChgRange={(value) => { setChgRange(value); setPageN(1); }}
          ret1yRange={ret1yRange} setRet1yRange={(value) => { setRet1yRange(value); setPageN(1); }}
          onReset={resetFilters} />

        <div style={{ flex: 1, minWidth: 0 }}>
          <Panel style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 980, tableLayout: "fixed" }}>
              <colgroup>
                <col style={{ width: 40 }} />
                {cols.map((c) => <col key={c.key} style={{ width: c.width }} />)}
                <col style={{ width: 48 }} />
              </colgroup>
              <thead>
                <tr style={{ borderBottom: `1px solid ${THEME.hairline}` }}>
                  <th style={thStyle}></th>
                  {cols.map((c) => (
                    c.key === "ticker" || c.key === "sector" ? (
                      <th key={c.key} style={{ ...thStyle, textAlign: c.align, padding: "12px 14px" }}>{c.label}</th>
                    ) : (
                      <ThTooltip key={c.key} label={c.label} infoKey={c.info}
                        align={c.align} style={{ padding: "12px 14px" }} />
                    )
                  ))}
                  <th style={thStyle}></th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((s) => (
                  <tr key={s.ticker} className="sd-row-hover" style={{ borderBottom: `1px solid ${THEME.hairline}`, background: watchlist.includes(s.ticker) ? "rgba(201,162,75,0.055)" : "transparent" }}>
                    <td style={{ ...stocksTd }}><WatchStar active={watchlist.includes(s.ticker)} onClick={() => handleToggleWatch(s.ticker)} /></td>
                    <td style={{ ...stocksTd, whiteSpace: "normal" }} onClick={() => openCompany(s.ticker)}>
                      <div style={{ cursor: "pointer", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</div>
                      <div style={{ fontSize: 10.5, color: THEME.inkDim, display: "flex", alignItems: "center", gap: 5, marginTop: 2 }}>{s.ticker} · {s.cap} cap {s.live && <LiveTag live small statusLabel={quoteStatusLabel(s)} />}</div>
                    </td>
                    <td style={{ ...stocksTd, overflow: "hidden", textOverflow: "ellipsis" }}>{s.sector}</td>
                    <td style={{ ...stocksTd, textAlign: "right" }} className="sd-mono">{Number.isFinite(s.price) ? `₹${fmtNum(s.price)}` : "—"}</td>
                    <td style={{ ...stocksTd, textAlign: "right" }} className="sd-mono">{Number.isFinite(s.mcap) ? fmtCr(s.mcap) : "—"}</td>
                    <td style={{ ...stocksTd, textAlign: "right" }} className="sd-mono">{Number.isFinite(s.pe) ? fmtNum(s.pe, 1) : "—"}</td>
                    <td style={{ ...stocksTd, textAlign: "right" }}>{Number.isFinite(s.chgPct) ? <Move value={s.chgPct} /> : "—"}</td>
                    <td style={{ ...stocksTd, textAlign: "right" }}>{Number.isFinite(s.ret1y) ? <Move value={s.ret1y} /> : "—"}</td>
                    <td style={{ ...stocksTd, textAlign: "center" }}>
                      <button onClick={() => toggleCompare(s.ticker)} className="sd-focusable" title="Add to compare" style={{
                        background: compareList.includes(s.ticker) ? "rgba(201,162,75,0.15)" : "none",
                        border: `1px solid ${THEME.hairline}`, borderRadius: 4, color: THEME.gold, cursor: "pointer", padding: "3px 6px",
                      }}><Plus size={12} /></button>
                    </td>
                  </tr>
                ))}
                {!stocksLoading && !stocksError && pageRows.length === 0 && (
                  <tr><td colSpan={cols.length + 2} style={{ ...tdStyle, textAlign: "center", color: THEME.inkDim, padding: 30 }}>No companies match these filters. Adjust a range or select Reset to view the full list.</td></tr>
                )}
                {stocksLoading && (
                  <tr><td colSpan={cols.length + 2} style={{ ...tdStyle, textAlign: "center", color: THEME.inkDim, padding: 30 }}>Loading current market data...</td></tr>
                )}
                {!stocksLoading && stocksError && (
                  <tr><td colSpan={cols.length + 2} style={{ ...tdStyle, textAlign: "center", color: THEME.down, padding: 30 }}>{stocksError}</td></tr>
                )}
              </tbody>
            </table>
          </Panel>

          <div style={{ display: "flex", justifyContent: "center", gap: 10, marginTop: 16, alignItems: "center" }}>
            <button disabled={page === 1} onClick={() => setPageN((p) => p - 1)} style={pagerBtn(page === 1)}><ChevronLeft size={14} /></button>
            <span style={{ fontSize: 12, color: THEME.inkDim }}>Page {page} of {totalPages}</span>
            <button disabled={page === totalPages} onClick={() => setPageN((p) => p + 1)} style={pagerBtn(page === totalPages)}><ChevronRight size={14} /></button>
          </div>
        </div>
      </div>
    </div>
  );
}
const thStyle = { textAlign: "left", padding: "9px 10px", fontSize: 10.5, textTransform: "uppercase", letterSpacing: 0.4, color: THEME.inkDim, fontWeight: 700 };
const tdStyle = { padding: "9px 10px" };
const pagerBtn = (disabled) => ({ border: `1px solid ${THEME.hairline}`, background: "none", color: disabled ? THEME.hairline : THEME.ink, borderRadius: 4, padding: "5px 8px", cursor: disabled ? "not-allowed" : "pointer" });

/* =========================================================================================
   SECTORS PAGE
   ========================================================================================= */
function SectorsPage({ mode, openCompany, openSector, activeSector }) {
  const [sectorData, setSectorData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadSectors() {
      setLoading(true);
      setError("");

      try {
        const data = await getSectors();
        if (!cancelled) setSectorData(data);
      } catch (requestError) {
        if (!cancelled) {
          setSectorData([]);
          setError("Unable to load live sector data.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadSectors();

    return () => {
      cancelled = true;
    };
  }, []);

  if (activeSector) {
    return (
      <SectorDetail
        sector={activeSector}
        mode={mode}
        openCompany={openCompany}
        back={() => openSector(null)}
      />
    );
  }

  const sectorByKey = new Map(
    sectorData.map((item) => [item.key, item])
  );

  return (
    <div className="sd-fade-in" style={{ padding: "22px 20px 60px", maxWidth: 1280, margin: "0 auto" }}>
      <SectionHeading eyebrow="Sector intelligence" title="Where is market leadership occurring?" />
      {loading && (
        <Panel style={{ padding: 30, textAlign: "center", color: THEME.inkDim }}>
          Loading live sector benchmarks...
        </Panel>
      )}
      {error && (
        <Panel style={{ padding: 30, textAlign: "center", color: THEME.down }}>
          {error}
        </Panel>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 }}>
        {SECTOR_LIST.map((s) => {
          const liveSector = sectorByKey.get(s);
          if (!liveSector) return null;

          return (
            <Panel key={s} style={{ padding: 16, cursor: "pointer" }}>
              <div onClick={() => openSector(s)}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <div style={{ fontWeight: 700, fontSize: 14.5 }}>{s}</div>
                  <ChevronRight size={15} color={THEME.inkDim} />
                </div>
                <div style={{ fontSize: 10.5, color: THEME.gold, marginTop: 2 }}>
                  {liveSector.benchmarkName}{liveSector.proxy ? " (proxy)" : ""}
                </div>
                <div style={{ display: "flex", gap: 14, marginTop: 10, fontSize: 11.5 }}>
                  {["1W", "1M", "6M", "1Y"].map((period) => (
                    <div key={period}>
                      <div style={{ color: THEME.inkDim }}>{period}</div>
                      {Number.isFinite(liveSector.returns?.[period])
                        ? <Move value={liveSector.returns[period]} size={11.5} />
                        : "—"}
                    </div>
                  ))}
                </div>
                <div style={{ fontSize: 11, color: THEME.inkDim, marginTop: 10 }}>
                  {liveSector.companyCount} tracked constituents · {Number.isFinite(liveSector.combinedMarketCap)
                    ? `${fmtCr(liveSector.combinedMarketCap)} combined market cap`
                    : "Combined market cap unavailable"}
                </div>
                <div style={{ fontSize: 10.5, color: THEME.inkDim, marginTop: 4 }}>
                  As of {formatMarketAsOf(liveSector.asOf)}
                </div>
                {liveSector.leader &&
                  liveSector.lagger &&
                  liveSector.leader !== liveSector.lagger && (
                  <div style={{ fontSize: 11, marginTop: 4 }}>
                    <div>
                      <span style={{ color: THEME.up }}>Leader {liveSector.leader}</span>
                      {" · "}
                      <span style={{ color: THEME.down }}>Lagger {liveSector.lagger}</span>
                    </div>
                    <div style={{ color: THEME.inkDim, marginTop: 2 }}>
                      Based on 1Y returns
                    </div>
                  </div>
                )}
              </div>
            </Panel>
          );
        })}
      </div>
    </div>
  );
}

function SectorDetail({ sector, mode, openCompany, back }) {
  const [range, setRange] = useState("1Y");
  const [sectorData, setSectorData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sectorNews, setSectorNews] = useState([]);
  const [newsLoading, setNewsLoading] = useState(false);
  const [newsError, setNewsError] = useState("");
  const [newsOpen, setNewsOpen] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function loadSector() {
      setLoading(true);
      setError("");

      try {
        const data = await getSectorDetail(sector, range);
        if (!cancelled) setSectorData(data);
      } catch (requestError) {
        if (!cancelled) {
          setSectorData(null);
          setError("Unable to load live sector details.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadSector();

    return () => {
      cancelled = true;
    };
  }, [sector, range]);

  const newsSymbols = (sectorData?.constituents || [])
    .slice(0, 8)
    .map((stock) => stock.ticker)
    .join(",");

  useEffect(() => {
    let cancelled = false;

    async function loadSectorNews() {
      if (!newsSymbols) {
        setSectorNews([]);
        setNewsError("");
        return;
      }

      setNewsLoading(true);
      setNewsError("");

      const symbols = newsSymbols.split(",");
      const results = await Promise.allSettled(
        symbols.map(async (ticker) => ({
          ticker,
          data: await getCompanyNews(ticker),
        }))
      );

      if (!cancelled) {
        const seen = new Set();
        const articles = results
          .filter((result) => result.status === "fulfilled")
          .flatMap((result) =>
            (result.value.data.articles || []).map((article) => ({
              ...article,
              companies: [result.value.ticker],
            }))
          )
          .sort(
            (a, b) =>
              newsDateTimestamp(b.publishedAt) - newsDateTimestamp(a.publishedAt)
          )
          .filter((article) => {
            const key = article.link || article.title;
            if (!key || seen.has(key)) return false;
            seen.add(key);
            return true;
          })
          .slice(0, 5)
          .map((article) => ({
            ...article,
            date: formatNewsDate(article.publishedAt),
            teaser: article.summary || article.snippet || "",
          }));

        setSectorNews(articles);
        if (results.every((result) => result.status === "rejected")) {
          setNewsError("Unable to load current sector news. Please try again shortly.");
        }
        setNewsLoading(false);
      }
    }

    loadSectorNews();

    return () => {
      cancelled = true;
    };
  }, [newsSymbols]);

  const constituents = sectorData?.constituents || [];
  const chartSeries = (sectorData?.points || []).map(
    (point) => point.adjustedClose
  );
  const chartLabels = (sectorData?.points || []).map((point) =>
    new Date(`${point.date}T00:00:00`).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: chartSeries.length > 400 ? "2-digit" : undefined,
    })
  );

  return (
    <div className="sd-fade-in" style={{ padding: "22px 20px 60px", maxWidth: 1280, margin: "0 auto" }}>
      <button onClick={back} style={{ background: "none", border: "none", color: THEME.gold, cursor: "pointer", fontSize: 12.5, display: "flex", alignItems: "center", gap: 4, marginBottom: 10 }}>
        <ChevronLeft size={14} /> Back to sectors
      </button>
      <SectionHeading eyebrow="Sector Classification" title={sector} />
      <div className="sd-grid-2" style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }}>
        <Panel style={{ padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>
              {sectorData?.benchmarkName || "Sector benchmark"}
              {sectorData?.proxy && <span style={{ color: THEME.inkDim, fontWeight: 400 }}> (proxy)</span>}
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <ReturnRangeSelector active={range} onSelect={setRange} />
          </div>
          {loading ? (
            <div style={{ height: 220, display: "flex", alignItems: "center", justifyContent: "center", color: THEME.inkDim, fontSize: 12 }}>
              Loading live sector history...
            </div>
          ) : error ? (
            <div style={{ height: 220, display: "flex", alignItems: "center", justifyContent: "center", color: THEME.down, fontSize: 12 }}>
              {error}
            </div>
          ) : (
            <PriceChart series={chartSeries} labels={chartLabels} height={220} />
          )}
        </Panel>
        <Panel style={{ padding: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Key sector metrics</div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${THEME.hairline}`, fontSize: 12.5 }}>
            <span style={{ color: THEME.inkDim }}>Benchmark index</span>
            <span>{sectorData ? `${sectorData.benchmarkName}${sectorData.proxy ? " (proxy)" : ""}` : "—"}</span>
          </div>
          {["1W", "1M", "6M", "1Y"].map((period) => (
            <div key={period} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${THEME.hairline}`, fontSize: 12.5 }}>
              <span style={{ color: THEME.inkDim }}>{period} return</span>
              {Number.isFinite(sectorData?.returns?.[period])
                ? <Move value={sectorData.returns[period]} />
                : <span>—</span>}
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 12.5 }}>
            <span style={{ color: THEME.inkDim }}>Companies</span><span>{constituents.length}</span>
          </div>
        </Panel>
      </div>

      <div style={{ marginTop: 40 }}>
        <SectionHeading title="Sector news" />
      </div>
      <p style={{ fontSize: 11.5, color: THEME.inkDim, marginTop: -8, marginBottom: 12, maxWidth: 780 }}>
        Recent developments affecting companies in this sector — neutral factual summaries, not investment advice. Click a story to read more.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 26 }}>
        {sectorNews.map((n) => (
          <Panel key={n.id || n.link || n.title} onClick={() => setNewsOpen(n)} className="sd-row-hover" style={{ padding: 14, cursor: "pointer" }}>
            <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{n.title}</div>
              <div style={{ fontSize: 11, color: THEME.inkDim, whiteSpace: "nowrap" }}>{n.date}</div>
            </div>
            <div style={{ fontSize: 12, color: THEME.creamDim, marginTop: 6, lineHeight: 1.5 }}>{n.teaser}</div>
          </Panel>
        ))}
        {newsLoading && (
          <Panel style={{ padding: 20, textAlign: "center", color: THEME.inkDim, fontSize: 12.5 }}>Loading current constituent news...</Panel>
        )}
        {!newsLoading && newsError && (
          <Panel style={{ padding: 20, textAlign: "center", color: THEME.down, fontSize: 12.5 }}>{newsError}</Panel>
        )}
        {!newsLoading && !newsError && sectorNews.length === 0 && (
          <Panel style={{ padding: 20, textAlign: "center", color: THEME.inkDim, fontSize: 12.5 }}>No current constituent news is available. Check again later.</Panel>
        )}
      </div>

      {newsOpen && (
        <div onClick={() => setNewsOpen(null)} style={{ position: "fixed", inset: 0, background: "rgba(5,8,14,0.65)", zIndex: 60, display: "flex", justifyContent: "flex-end" }}>
          <div onClick={(e) => e.stopPropagation()} className="sd-fade-in sd-scroll" style={{ width: 480, maxWidth: "94vw", height: "100%", background: THEME.navyDeep, borderLeft: `1px solid ${THEME.hairline}`, padding: "28px 30px", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <span style={{ fontSize: 11, color: THEME.gold, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6 }}>{sector}</span>
              <button onClick={() => setNewsOpen(null)} style={{ background: "none", border: "none", color: THEME.inkDim, cursor: "pointer" }}><X size={18} /></button>
            </div>
            <h3 className="sd-serif" style={{ fontSize: 24, margin: "12px 0 8px", lineHeight: 1.3 }}>{newsOpen.title}</h3>
            <div style={{ fontSize: 12, color: THEME.inkDim, marginBottom: 16 }}>{newsOpen.date}</div>
            {newsOpen.teaser ? (
              <p style={{ fontSize: 14, lineHeight: 1.6, color: THEME.creamDim, fontStyle: "italic", borderLeft: `2px solid ${THEME.goldSoft}`, paddingLeft: 12, marginBottom: 18 }}>{newsOpen.teaser}</p>
            ) : (
              <div style={{ fontSize: 12, lineHeight: 1.6, color: THEME.inkDim, marginBottom: 18 }}>
                The publisher feed does not include a reliable summary. Open the original article for full details.
              </div>
            )}
            {newsOpen.body && (
              <p style={{ fontSize: 13.5, lineHeight: 1.7, color: THEME.creamDim, marginBottom: 18 }}>{newsOpen.body}</p>
            )}
            {newsOpen.source && (
              <div style={{ fontSize: 12, color: THEME.inkDim, marginBottom: 20, borderTop: `1px solid ${THEME.hairline}`, paddingTop: 12 }}>
                <span style={{ textTransform: "uppercase", letterSpacing: 0.5, fontSize: 10.5, color: THEME.gold, display: "block", marginBottom: 3 }}>Source</span>
                {newsOpen.source}
              </div>
            )}
            {newsOpen.link && (
              <a
                href={newsOpen.link}
                target="_blank"
                rel="noopener noreferrer"
                style={{ display: "inline-flex", color: THEME.gold, fontSize: 12.5, marginBottom: 20 }}
              >
                Read original article →
              </a>
            )}
            {newsOpen.companies && (
              <>
                <div style={{ fontSize: 11.5, textTransform: "uppercase", letterSpacing: 0.5, color: THEME.gold, marginBottom: 8 }}>Companies affected</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {newsOpen.companies.map((r) => (
                    <button key={r} onClick={() => STOCKS_BY_TICKER[r] && openCompany(r)} style={{
                      border: `1px solid ${THEME.hairline}`, background: "none", color: THEME.creamDim, borderRadius: 4, padding: "5px 10px", fontSize: 12, cursor: "pointer",
                    }}>{r}</button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <SectionHeading title="Constituent stocks" />
      <Panel style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, minWidth: 700 }}>
          <thead><tr style={{ borderBottom: `1px solid ${THEME.hairline}` }}>
            <th style={thStyle}>Company</th><th style={thStyle}>Price</th><th style={thStyle}>Chg%</th><th style={thStyle}>P/E</th><th style={thStyle}>1Y Return</th>
          </tr></thead>
          <tbody>
            {constituents.map((s) => (
              <tr key={s.ticker} className="sd-row-hover" onClick={() => openCompany(s.ticker)} style={{ cursor: "pointer", borderBottom: `1px solid ${THEME.hairline}` }}>
                <td style={tdStyle}>{s.name} <span style={{ color: THEME.inkDim }}>· {s.ticker}</span></td>
                <td style={tdStyle} className="sd-mono">{s.price !== null ? `₹${fmtNum(s.price)}` : "—"}</td>
                <td style={tdStyle}>{s.chgPct !== null ? <Move value={s.chgPct} /> : "—"}</td>
                <td style={tdStyle} className="sd-mono">{s.pe ? fmtNum(s.pe, 1) : "—"}</td>
                <td style={tdStyle}>{s.ret1y !== null ? <Move value={s.ret1y} /> : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}

/* =========================================================================================
   COMPANY RESEARCH PAGE
   ========================================================================================= */
// Overview tab: business profile (left) + interactive Company News (right). Financials tab
// already covers metrics, so this tab intentionally avoids repeating P/E, ROE, etc.
function CompanyOverviewTab({ ticker, liveNews, newsLoading, newsError }) {
  const profile = companyProfile(ticker);
  const [openArticle, setOpenArticle] = useState(null);

 const formattedLiveNews = liveNews.map((article) => ({
  id: article.id,
  headline: article.title,

  date: formatNewsDate(article.publishedAt),

  teaser: article.snippet || "",
  summary: article.summary || article.snippet || "",
  sentiment: article.sentiment || "Neutral",
  impact: Array.isArray(article.impact) ? article.impact : [],

  source: article.source || "Google News",
  link: article.link,
}));

  const news = formattedLiveNews;

  return (
    <div className="sd-grid-2" style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }}>
      <Panel style={{ padding: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Business overview</div>
        <p style={{ fontSize: 13, color: THEME.creamDim, lineHeight: 1.6, margin: 0 }}>{profile.overview}</p>

        <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 0.6, color: THEME.gold, marginTop: 18, marginBottom: 8 }}>Major business segments</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {profile.segments.map((seg) => (
            <div key={seg.name} style={{ borderLeft: `2px solid ${THEME.hairline}`, paddingLeft: 10 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700 }}>{seg.name}</div>
              <div style={{ fontSize: 12, color: THEME.inkDim, marginTop: 2, lineHeight: 1.5 }}>{seg.desc}</div>
            </div>
          ))}
        </div>

        <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 0.6, color: THEME.gold, marginTop: 18, marginBottom: 6 }}>Company background</div>
        <p style={{ fontSize: 12.5, color: THEME.creamDim, lineHeight: 1.6, margin: 0 }}>{profile.background}</p>

        <div style={{ fontSize: 12, marginTop: 16, padding: 10, borderRadius: 4, background: "rgba(201,162,75,0.06)", border: `1px dashed ${THEME.hairline}` }}>
          <b style={{ color: THEME.gold }}>What changed?</b> {whatChangedBlurb(ticker)}
        </div>
      </Panel>

      <Panel style={{ padding: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <Newspaper size={14} color={THEME.gold} />
          <div style={{ fontSize: 13, fontWeight: 700 }}>Company news</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {newsLoading && (
            <div style={{ padding: 18, textAlign: "center", color: THEME.inkDim, fontSize: 12 }}>
              Loading current company news...
            </div>
          )}
          {!newsLoading && newsError && (
            <div style={{ padding: 18, textAlign: "center", color: THEME.down, fontSize: 12 }}>
              {newsError} Please try again shortly.
            </div>
          )}
          {!newsLoading && !newsError && news.length === 0 && (
            <div style={{ padding: 18, textAlign: "center", color: THEME.inkDim, fontSize: 12 }}>
              No relevant company news is currently available. Check again later.
            </div>
          )}
          {!newsLoading && !newsError && news.map((n) => (
            <div key={n.id} onClick={() => setOpenArticle(n)} className="sd-row-hover" style={{
              cursor: "pointer", border: `1px solid ${THEME.hairline}`, borderRadius: 5, padding: 12,
            }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.35 }}>{n.headline}</div>
              {n.teaser && (
  <div
    style={{
      fontSize: 11.5,
      color: THEME.inkDim,
      marginTop: 6,
      lineHeight: 1.4,
    }}
  >
    {n.teaser}
  </div>
)}
            </div>
          ))}
        </div>
      </Panel>

{openArticle && (
  <div
    onClick={() => setOpenArticle(null)}
    style={{
      position: "fixed",
      inset: 0,
      background: "rgba(5,8,14,0.72)",
      zIndex: 60,
      display: "flex",
      justifyContent: "flex-end",
      alignItems: "flex-start",
    }}
  >
    <div
      onClick={(event) => event.stopPropagation()}
      className="sd-fade-in sd-scroll"
      style={{
        width: 520,
        maxWidth: "94vw",
        minHeight: "100vh",
        maxHeight: "100vh",
        background: THEME.navyDeep,
        borderLeft: `1px solid ${THEME.hairline}`,
        padding: "28px 30px",
        overflowY: "auto",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 16,
        }}
      >
        <span
          style={{
            fontSize: 11,
            color: THEME.gold,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: 0.7,
          }}
        >
          Company News
        </span>

        <button
          type="button"
          aria-label="Close news article"
          onClick={() => setOpenArticle(null)}
          style={{
            background: "none",
            border: "none",
            color: THEME.inkDim,
            cursor: "pointer",
            padding: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <X size={18} />
        </button>
      </div>

      <h3
        className="sd-serif"
        style={{
          fontSize: 24,
          margin: "18px 0 12px",
          lineHeight: 1.32,
        }}
      >
        {openArticle.headline}
      </h3>

<div
  style={{
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 24,
    fontSize: 12,
    color: THEME.inkDim,
  }}
>
  <span>{openArticle.source || "Google News"}</span>

  <span
    aria-hidden="true"
    style={{
      color: THEME.hairline,
    }}
  >
    •
  </span>

  <span>{openArticle.date}</span>
</div>

      <section
        style={{
          borderTop: `1px solid ${THEME.hairline}`,
          paddingTop: 20,
        }}
      >
        <div
          style={{
            fontSize: 10.5,
            color: THEME.gold,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: 0.6,
            marginBottom: 9,
          }}
        >
          Summary
        </div>

        <p
          style={{
            fontSize: 14,
            lineHeight: 1.7,
            color: THEME.creamDim,
            margin: 0,
          }}
        >
          {openArticle.summary ||
            openArticle.teaser ||
            "A summary is not available for this article."}
        </p>
      </section>

      {openArticle.impact?.length > 0 && (
        <section
          style={{
            marginTop: 24,
            paddingTop: 20,
            borderTop: `1px solid ${THEME.hairline}`,
          }}
        >
          <div
            style={{
              fontSize: 10.5,
              color: THEME.gold,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: 0.6,
              marginBottom: 12,
            }}
          >
            Why it matters
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 11,
            }}
          >
            {openArticle.impact.map((point, index) => (
              <div
                key={`${openArticle.id}-impact-${index}`}
                style={{
                  display: "grid",
                  gridTemplateColumns: "18px 1fr",
                  gap: 8,
                  alignItems: "flex-start",
                  fontSize: 13,
                  lineHeight: 1.55,
                  color: THEME.creamDim,
                }}
              >
                <span
                  style={{
                    color: THEME.gold,
                    fontWeight: 700,
                  }}
                >
                  •
                </span>

                <span>{point}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section
        style={{
          marginTop: 24,
          paddingTop: 20,
          borderTop: `1px solid ${THEME.hairline}`,
        }}
      >
        <div
          style={{
            fontSize: 10.5,
            color: THEME.gold,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: 0.6,
            marginBottom: 8,
          }}
        >
          Source
        </div>

        <div
          style={{
            fontSize: 13,
            color: THEME.creamDim,
          }}
        >
          {openArticle.source || "Google News"}
        </div>
      </section>

      <div
        style={{
          marginTop: 22,
          padding: 13,
          borderRadius: 5,
          background: "rgba(201,162,75,0.06)",
          border: `1px solid ${THEME.hairline}`,
          fontSize: 11.5,
          lineHeight: 1.55,
          color: THEME.inkDim,
        }}
      >
        StockDekho provides a concise interpretation of the available news
        information. Refer to the original publisher for the complete report.
      </div>

      {openArticle.link && (
        <a
          href={openArticle.link}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            marginTop: 20,
            padding: "11px 15px",
            borderRadius: 4,
            background: THEME.gold,
            color: THEME.navyDeep,
            fontSize: 12.5,
            fontWeight: 700,
            textDecoration: "none",
          }}
        >
          Read original article →
        </a>
      )}
    </div>
  </div>
)}
    </div>
  );
}

const COMPANY_TABS = ["Overview", "Performance", "Financials", "Valuation & Quality", "Events & Reports", "Peers", "Notes"];

function calculateReturns(values) {
  const returns = [];

  for (let index = 1; index < values.length; index += 1) {
    const previous = values[index - 1];
    const current = values[index];

    if (previous > 0 && Number.isFinite(current)) {
      returns.push(current / previous - 1);
    }
  }

  return returns;
}

function calculatePerformanceMetrics(points, useAdjustedClose, fiftyTwoWeekHigh) {
  const priceKey = useAdjustedClose ? "adjustedClose" : "close";
  const benchmarkKey = useAdjustedClose
    ? "benchmarkAdjustedClose"
    : "benchmarkClose";
  const prices = points.map((point) => point[priceKey]).filter(Number.isFinite);
  const benchmarkPrices = points
    .map((point) => point[benchmarkKey])
    .filter(Number.isFinite);

  if (prices.length < 2) {
    return {
      returnPercent: null,
      maxDrawdown: null,
      volatility: null,
      beta: null,
      distanceFromHigh: null,
    };
  }

  const returnPercent = (prices[prices.length - 1] / prices[0] - 1) * 100;

  let peak = prices[0];
  let maxDrawdown = 0;

  prices.forEach((price) => {
    peak = Math.max(peak, price);
    maxDrawdown = Math.min(maxDrawdown, price / peak - 1);
  });

  const stockReturns = calculateReturns(prices);
  const benchmarkReturns = calculateReturns(benchmarkPrices);
  const mean =
    stockReturns.reduce((sum, value) => sum + value, 0) /
    Math.max(stockReturns.length, 1);
  const variance =
    stockReturns.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
    Math.max(stockReturns.length - 1, 1);
  const volatility = Math.sqrt(variance) * Math.sqrt(252) * 100;

  const pairedLength = Math.min(stockReturns.length, benchmarkReturns.length);
  const pairedStockReturns = stockReturns.slice(-pairedLength);
  const pairedBenchmarkReturns = benchmarkReturns.slice(-pairedLength);
  const stockMean =
    pairedStockReturns.reduce((sum, value) => sum + value, 0) /
    Math.max(pairedLength, 1);
  const benchmarkMean =
    pairedBenchmarkReturns.reduce((sum, value) => sum + value, 0) /
    Math.max(pairedLength, 1);
  const covariance =
    pairedStockReturns.reduce(
      (sum, value, index) =>
        sum +
        (value - stockMean) *
          (pairedBenchmarkReturns[index] - benchmarkMean),
      0
    ) / Math.max(pairedLength - 1, 1);
  const benchmarkVariance =
    pairedBenchmarkReturns.reduce(
      (sum, value) => sum + (value - benchmarkMean) ** 2,
      0
    ) / Math.max(pairedLength - 1, 1);
  const beta = benchmarkVariance > 0 ? covariance / benchmarkVariance : null;
  const referenceHigh =
    Number.isFinite(fiftyTwoWeekHigh) && fiftyTwoWeekHigh > 0
      ? fiftyTwoWeekHigh
      : Math.max(...prices.slice(-252));
  const distanceFromHigh =
    referenceHigh > 0
      ? (prices[prices.length - 1] / referenceHigh - 1) * 100
      : null;

  return {
    returnPercent,
    maxDrawdown: maxDrawdown * 100,
    volatility,
    beta,
    distanceFromHigh,
  };
}

function CompanyPage({ ticker, mode, watchlist, toggleWatch, compareList, toggleCompare, notes, setNote, openCompany, }) {
  const s = STOCKS_BY_TICKER[ticker] || STOCKS_BY_TICKER.RELIANCE;
  const [stockData, setStockData] = useState(null);
  const [newsData, setNewsData] = useState(null);
  const [newsLoading, setNewsLoading] = useState(true);
  const [newsError, setNewsError] = useState("");
  const [financialsData, setFinancialsData] = useState(null);
  const [financialsLoading, setFinancialsLoading] = useState(false);
  const [financialsError, setFinancialsError] = useState("");
  const [performanceData, setPerformanceData] = useState(null);
  const [performanceLoading, setPerformanceLoading] = useState(true);
  const [performanceError, setPerformanceError] = useState("");
  const [eventsData, setEventsData] = useState(null);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsError, setEventsError] = useState("");
  const [tab, setTab] = useState("Overview");
  const [range, setRange] = useState("1Y");
  const [returnType, setReturnType] = useState("Price");
  const [showBenchmark, setShowBenchmark] = useState(true);
  const [noteDraft, setNoteDraft] = useState(notes[ticker]?.length ? "" : "");
  const [customRange, setCustomRange] = useState({ start: "", end: "" });
  const quote = stockData || {};
  const liveNews = newsData?.articles || [];
useEffect(() => {
  let isMounted = true;

  async function fetchCompanyData() {
    try {
      setNewsLoading(true);
      setNewsError("");

      const [stockResult, newsResult] =
        await Promise.allSettled([
          getStockQuote(ticker),
          getCompanyNews(ticker),
        ]);

      if (!isMounted) return;

      if (stockResult.status === "fulfilled") {
        setStockData(stockResult.value);
      }

      if (newsResult.status === "fulfilled") {
        setNewsData(newsResult.value);
      } else {
        console.error(newsResult.reason);
        setNewsData(null);
        setNewsError("Unable to load live company news.");
      }

    } catch (error) {
      console.error(error);

      if (!isMounted) return;

      setNewsData(null);
      setNewsError("Unable to load live company news.");
    } finally {
      if (isMounted) {
       setNewsLoading(false);
      }
    }
  }

  fetchCompanyData();
  const refreshTimer = window.setInterval(() => {
    if (isIndianMarketOpen()) fetchCompanyData();
  }, MARKET_REFRESH_MS);

  return () => {
    isMounted = false;
    window.clearInterval(refreshTimer);
  };
}, [ticker]);

  useEffect(() => {
    let isMounted = true;

    if (tab !== "Financials" && tab !== "Valuation & Quality") {
      return () => {
        isMounted = false;
      };
    }

    async function fetchFinancialsData() {
      try {
        setFinancialsLoading(true);
        setFinancialsError("");

        const data = await getCompanyFinancials(ticker);

        if (isMounted) {
          setFinancialsData(data);
        }
      } catch (error) {
        console.error("Unable to load financial statements:", error);

        if (isMounted) {
          setFinancialsData(null);
          setFinancialsError("Unable to load financial statements.");
        }
      } finally {
        if (isMounted) {
          setFinancialsLoading(false);
        }
      }
    }

    fetchFinancialsData();

    return () => {
      isMounted = false;
    };
  }, [ticker, tab]);

  useEffect(() => {
    let isMounted = true;

    async function fetchPerformanceData() {
      if (tab !== "Performance") {
        return;
      }

      if (
        range === "Custom" &&
        (!customRange.start || !customRange.end)
      ) {
        return;
      }

      try {
        setPerformanceLoading(true);
        setPerformanceError("");

        const data = await getPerformanceHistory(ticker, range, customRange);

        if (isMounted) {
          setPerformanceData(data);
        }
      } catch (error) {
        console.error("Unable to load historical performance:", error);

        if (isMounted) {
          setPerformanceData(null);
          setPerformanceError(
            error?.response?.data?.error ||
              "Unable to load historical performance."
          );
        }
      } finally {
        if (isMounted) {
          setPerformanceLoading(false);
        }
      }
    }

    fetchPerformanceData();

    return () => {
      isMounted = false;
    };
  }, [
    ticker,
    tab,
    range,
    customRange.appliedAt,
  ]);

  useEffect(() => {
    let isMounted = true;

    async function fetchEventsData() {
      if (tab !== "Events & Reports") return;

      try {
        setEventsLoading(true);
        setEventsError("");

        const data = await getCompanyEvents(ticker);

        if (isMounted) {
          setEventsData(data);
        }
      } catch (error) {
        console.error("Unable to load company events:", error);

        if (isMounted) {
          setEventsData(null);
          setEventsError(
            error?.response?.data?.error || "Unable to load company events."
          );
        }
      } finally {
        if (isMounted) {
          setEventsLoading(false);
        }
      }
    }

    fetchEventsData();

    return () => {
      isMounted = false;
    };
  }, [ticker, tab]);

  const performancePoints = performanceData?.points || [];
  const useAdjustedClose = returnType === "Total";
  const performancePriceKey = useAdjustedClose ? "adjustedClose" : "close";
  const performanceBenchmarkKey = useAdjustedClose
    ? "benchmarkAdjustedClose"
    : "benchmarkClose";
  const series = performancePoints.map(
    (point) => point[performancePriceKey]
  );
  const benchSeries = performancePoints.map(
    (point) => point[performanceBenchmarkKey]
  );
  const performanceLabels = performancePoints.map((point) => {
    const date = new Date(
      point.date.includes("T") ? point.date : `${point.date}T00:00:00`
    );

    return date.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: performancePoints.length > 400 ? "2-digit" : undefined,
    });
  });

  // When a benchmark overlay is active, the stock's absolute price and the index's absolute
  // level are on completely different scales (e.g. ₹1,300 vs ~23,700), which flattens the chart.
  // Institutional platforms instead rebase every series to a common starting value (100) so
  // relative performance is comparable regardless of each security's absolute price level.
  const rebaseTo100 = (arr) =>
    arr.length > 0 ? arr.map((v) => (v / arr[0]) * 100) : [];
  const chartSeries = showBenchmark ? rebaseTo100(series) : series;
  const chartBenchSeries = showBenchmark ? rebaseTo100(benchSeries) : null;

  const fallbackOneYearHistory = Array.isArray(s.hist?.["1Y"])
    ? s.hist["1Y"].filter(Number.isFinite)
    : [];
  const low52 = fallbackOneYearHistory.length
    ? Math.min(...fallbackOneYearHistory)
    : null;
  const high52 = fallbackOneYearHistory.length
    ? Math.max(...fallbackOneYearHistory)
    : null;
  const performanceMetrics = calculatePerformanceMetrics(
    performancePoints,
    useAdjustedClose,
    quote.fiftyTwoWeekHigh
  );
  const formatMetric = (value, digits = 1, suffix = "") =>
    Number.isFinite(value) ? `${value.toFixed(digits)}${suffix}` : "—";
  const formatEventDate = (value) =>
    value
      ? new Date(value).toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        })
      : "Not available";
  const upcomingEarningsTime = new Date(
    eventsData?.upcomingEarnings?.date
  ).getTime();
  const hasUpcomingEarnings =
    Number.isFinite(upcomingEarningsTime) && upcomingEarningsTime > Date.now();
  const latestIncomeStatement = financialsData?.incomeStatement?.at(-1);
  const latestBalanceSheet = financialsData?.balanceSheet?.at(-1);
  const derivedReturnOnEquity =
    Number.isFinite(latestIncomeStatement?.netIncome) &&
    Number.isFinite(latestBalanceSheet?.shareholdersEquity) &&
    latestBalanceSheet.shareholdersEquity !== 0
      ? (latestIncomeStatement.netIncome / latestBalanceSheet.shareholdersEquity) * 100
      : null;
  const capitalEmployed =
    Number.isFinite(latestBalanceSheet?.totalAssets) &&
    Number.isFinite(latestBalanceSheet?.currentLiabilities)
      ? latestBalanceSheet.totalAssets - latestBalanceSheet.currentLiabilities
      : null;
  const derivedReturnOnCapital =
    Number.isFinite(latestIncomeStatement?.ebit) &&
    Number.isFinite(capitalEmployed) &&
    capitalEmployed !== 0
      ? (latestIncomeStatement.ebit / capitalEmployed) * 100
      : null;
  const derivedDebtToEquity =
    Number.isFinite(latestBalanceSheet?.totalDebt) &&
    Number.isFinite(latestBalanceSheet?.shareholdersEquity) &&
    latestBalanceSheet.shareholdersEquity !== 0
      ? latestBalanceSheet.totalDebt / latestBalanceSheet.shareholdersEquity
      : null;

  return (
    <div className="sd-fade-in" style={{ padding: "22px 20px 70px", maxWidth: 1280, margin: "0 auto" }}>
      <Panel style={{ padding: 20, marginBottom: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
             <h1 className="sd-serif" style={{ fontSize: 24, margin: 0 }}>
  {quote.company || s.name}
</h1>
              <LiveTag live={Boolean(stockData)} statusLabel={stockData ? quoteStatusLabel(stockData) : undefined} />
            </div>
            <div style={{ fontSize: 12.5, color: THEME.inkDim, marginTop: 4 }}>
  {quote.symbol || s.ticker}· {quote.exchange || "NSE"} · {s.sector} · {s.cap} Cap
            </div>
            <p style={{ fontSize: 12.5, color: THEME.creamDim, maxWidth: 560, marginTop: 10, lineHeight: 1.5 }}>
              {companyProfile(s.ticker).overview}
            </p>
          </div>
          <div style={{ textAlign: "right" }}>
<div className="sd-mono" style={{ fontSize: 28 }}>
  {Number.isFinite(quote.price) ? `₹${fmtNum(quote.price)}` : "—"}
</div>

          <Move 
  value={quote.changePercent}
  size={14} 
/>
            
            <div style={{ fontSize: 11, color: THEME.inkDim, marginTop: 6 }}>
  Mkt Cap {Number.isFinite(quote.marketCap) && quote.marketCap > 0 ? fmtCr(quote.marketCap / 10000000) : "—"}
</div>

<div style={{ fontSize: 11, color: THEME.inkDim }}>
  52W ₹
  {fmtNum(quote.fiftyTwoWeekLow ?? low52, 0)}
  {" – "}
  ₹{fmtNum(quote.fiftyTwoWeekHigh ?? high52, 0)}
</div>
            <div style={{ display: "flex", gap: 8, marginTop: 10, justifyContent: "flex-end" }}>
              <IconBtn onClick={() => toggleWatch(s.ticker)} active={watchlist.includes(s.ticker)} icon={<Bookmark size={13} />} label="Watchlist" />
              <IconBtn onClick={() => toggleCompare(s.ticker)} active={compareList.includes(s.ticker)} icon={<Layers size={13} />} label="Compare" />
              <IconBtn onClick={() => setTab("Notes")} icon={<FileText size={13} />} label="Note" />
            </div>
          </div>
        </div>
        <div
  style={{
    fontSize: 11,
    color: THEME.inkDim,
    marginTop: 12,
    borderTop: `1px solid ${THEME.hairline}`,
    paddingTop: 10,
  }}
>
  Market data sourced from {quote.quoteSource || marketProviderLabel(quote.dataProvider)}{quote.supplementalDataProvider ? ` + ${quote.supplementalDataProvider}` : ""} · {quote.isStale ? "Stale snapshot" : quote.dataStatus === "delayed" ? "Delayed snapshot" : "As of"} {formatMarketAsOf(quote.asOf)}. For research purposes only. Not investment advice.
</div>
      </Panel>

      <div className="sd-scroll" style={{ display: "flex", gap: 4, overflowX: "auto", borderBottom: `1px solid ${THEME.hairline}`, marginBottom: 18 }}>
        {COMPANY_TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: "none", border: "none", cursor: "pointer", padding: "10px 14px", fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap",
            color: tab === t ? THEME.cream : THEME.inkDim, borderBottom: tab === t ? `2px solid ${THEME.gold}` : "2px solid transparent",
          }}>{t}</button>
        ))}
      </div>

      {tab === "Overview" && <CompanyOverviewTab
  ticker={ticker}
  liveNews={liveNews}
  newsLoading={newsLoading}
  newsError={newsError}
/>}

      {tab === "Performance" && (
        <div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 12, alignItems: "center", justifyContent: "space-between" }}>
            <ReturnRangeSelector active={range} onSelect={setRange} customRange={customRange} onCustomRange={setCustomRange} />
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <label style={{ fontSize: 12, color: THEME.inkDim, display: "flex", gap: 6 }}>
                <input type="checkbox" checked={showBenchmark} onChange={(e) => setShowBenchmark(e.target.checked)} /> Nifty 50 overlay
              </label>
              <div style={{ display: "flex", gap: 4 }}>{["Price", "Total"].map((r) => <Pill key={r} active={returnType === r} onClick={() => setReturnType(r)}>{r} return</Pill>)}</div>
            </div>
          </div>
          {performanceLoading ? (
            <Panel style={{ padding: 28, color: THEME.inkDim }}>
              Loading historical market data...
            </Panel>
          ) : performanceError ? (
            <Panel style={{ padding: 28, color: "#ff6b6b" }}>
              {performanceError}
            </Panel>
          ) : (
            <>
              <Panel style={{ padding: 16 }}>
                <PriceChart
                  series={chartSeries}
                  labels={performanceLabels}
                  benchmarkSeries={chartBenchSeries}
                  benchmarkLabel="Nifty 50"
                  height={300}
                />
                {showBenchmark && (
                  <div style={{ fontSize: 10.5, color: THEME.inkDim, marginTop: 8 }}>
                    Rebased to 100 at the start of the selected period so {s.ticker} and the Nifty 50 are comparable on the same scale, regardless of absolute price level.
                  </div>
                )}
              </Panel>
              <div className="sd-grid-5" style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, marginTop: 14 }}>
                {[
                  ["Return", formatMetric(performanceMetrics.returnPercent, 1, "%")],
                  ["Max drawdown", formatMetric(performanceMetrics.maxDrawdown, 1, "%")],
                  ["Volatility (ann.)", formatMetric(performanceMetrics.volatility, 1, "%")],
                  ["Beta", formatMetric(performanceMetrics.beta, 2)],
                  ["Dist. from 52W high", formatMetric(performanceMetrics.distanceFromHigh, 1, "%")],
                ].map(([label, value]) => (
                  <Panel key={label} style={{ padding: 12 }}>
                    <div style={{ fontSize: 10.5, color: THEME.inkDim, display: "flex", alignItems: "center" }}>
                      {label}
                      {label === "Beta" && (
                        <MetricExplain mode={mode} text="Beta estimates how strongly a stock has moved relative to the Nifty 50. Investors use it to compare market sensitivity and portfolio risk." />
                      )}
                    </div>
                    <div className="sd-mono" style={{ fontSize: 15, marginTop: 4 }}>{value}</div>
                  </Panel>
                ))}
              </div>
              <div style={{ fontSize: 11, color: THEME.inkDim, marginTop: 10 }}>
                Daily historical prices from {marketProviderLabel(quote.dataProvider)}. Return and drawdown use the selected {returnType.toLowerCase()} series; volatility is annualised from daily returns and beta is measured against the Nifty 50.
              </div>
            </>
          )}
        </div>
      )}

{tab === "Financials" && (
  <div>
    {financialsLoading ? (
      <div style={{ color: THEME.inkDim }}>
        Loading financial statements...
      </div>
    ) : financialsError ? (
      <div style={{ color: "#ff6b6b" }}>
        {financialsError}
      </div>
    ) : (
      <div
        className="sd-grid-3"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: 14,
        }}
      >
        <FinRow
          label="Revenue"
          values={financialsData?.incomeStatement || []}
          field="revenue"
          mode={mode}
          explain="Total sales from operations over the period."
        />

        <FinRow
          label="EBITDA"
          values={financialsData?.incomeStatement || []}
          field="ebitda"
          mode={mode}
          explain="Operating profit before interest, tax, depreciation and amortisation."
        />

        <FinRow
          label="Net income"
          values={financialsData?.incomeStatement || []}
          field="netIncome"
          mode={mode}
          explain="Profit after all expenses, interest and tax."
        />

        <FinRow
          label="EPS"
          values={financialsData?.incomeStatement || []}
          field="basicEPS"
          mode={mode}
          explain="Net income divided by the weighted average number of shares."
        />

        <FinRow
          label="Operating cash flow"
          values={financialsData?.cashFlow || []}
          field="operatingCashFlow"
          mode={mode}
          explain="Cash generated from the company's core business operations."
        />

       <FinRow
  label="Free cash flow"
  values={financialsData?.cashFlow || []}
  field="freeCashFlow"
  mode={mode}
  explain="Operating cash flow after capital expenditure."
/>

<FinRow
  label="Total assets"
  values={financialsData?.balanceSheet || []}
  field="totalAssets"
  mode={mode}
  explain="Total economic resources owned by the company."
/>

<FinRow
  label="Total debt"
  values={financialsData?.balanceSheet || []}
  field="totalDebt"
  mode={mode}
  explain="Short-term and long-term borrowings."
/>

<FinRow
  label="Shareholders' equity"
  values={financialsData?.balanceSheet || []}
  field="shareholdersEquity"
  mode={mode}
  explain="Residual value belonging to shareholders after liabilities."
/>
      </div>
    )}
  </div>
)}
{tab === "Valuation & Quality" && (
        <div className="sd-grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <Panel style={{ padding: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Valuation</div>
            {[
  ["P/E", quote.trailingPE ?? s.pe],
  ["P/B", quote.priceToBook ?? s.pb],
  ["Market Cap", null]
].map(([l, v]) => (
              <MetricLine key={l} label={l} value={
  l === "Market Cap"
    ? (Number.isFinite(quote.marketCap) && quote.marketCap > 0
        ? fmtCr(quote.marketCap / 10000000)
        : fmtCr(s.mcap))
    : v !== null
      ? fmtNum(v, 1)
      : "—"
} mode={mode} explain={
  l.startsWith("EV/EBITDA")
    ? "EV/EBITDA compares total business value with operating earnings before financing and accounting charges. Investors use it to compare companies with different debt levels and depreciation profiles."
    : l.startsWith("PEG")
      ? "PEG compares a company’s P/E ratio with its expected earnings growth. Investors use it to add growth context to an otherwise standalone valuation multiple."
      : undefined
} />
            ))}
          </Panel>
          <Panel style={{ padding: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Quality & growth</div>
            {[["ROE %", quote.returnOnEquity ?? derivedReturnOnEquity ?? s.roe], ["ROCE %", derivedReturnOnCapital ?? s.roce]].map(([l, v]) => (
              <MetricLine key={l} label={l} value={
  v !== null && v !== undefined
    ? l === "Dividend yield %"
      ? `${fmtNum(v, 2)}%`
      : fmtNum(v, 2)
    : "—"
} mode={mode} explain={
  l === "ROCE %"
    ? "ROCE measures operating profit relative to the capital used by the business. Investors use it to assess how efficiently a company converts long-term funding into returns."
    : undefined
} />
            ))}
          </Panel>
          <Panel style={{ padding: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Leverage & dividends</div>
            {[
  ["Debt/Equity", quote.debtToEquity ?? derivedDebtToEquity ?? s.de],
  ["Dividend yield %", quote.dividendYield ?? s.divYield],
].map(([l, v]) => (
              <MetricLine key={l} label={l} value={v !== null && v !== undefined ? fmtNum(v, 2) : "—"} mode={mode} explain={
                l === "Dividend yield %"
                  ? "Dividend yield is the annual dividend relative to the current share price. Investors use it to compare the cash income offered by different investments."
                  : undefined
              } />
            ))}
          </Panel>
          <Panel style={{ padding: 16 }}>
  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>
    Trading statistics
  </div>

  {[
    ["Open", quote.open],
    ["Previous Close", quote.previousClose],
    ["Day High", quote.dayHigh],
    ["Day Low", quote.dayLow],
    ["Volume", quote.volume],
    ["Average Volume (3M)", quote.averageVolume],
  ].map(([label, value]) => (
    <MetricLine
      key={label}
      label={label}
      value={
        value !== null && value !== undefined
          ? label.includes("Volume")
            ? value.toLocaleString("en-IN")
            : fmtNum(value)
          : "—"
      }
      mode={mode}
      explain="Live market statistics from the latest available exchange session."
    />
  ))}
</Panel>
        </div>
      )}

      {tab === "Events & Reports" && (
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Earnings, dividends & reports</div>
          {eventsLoading ? (
            <Panel style={{ padding: 28, color: THEME.inkDim }}>
              Loading company events...
            </Panel>
          ) : eventsError ? (
            <Panel style={{ padding: 28, color: "#ff6b6b" }}>
              {eventsError}
            </Panel>
          ) : (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <Panel style={{ padding: 16 }}>
                  <div style={{ fontSize: 11, color: THEME.gold, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>
                    Upcoming earnings
                  </div>
                  <div className="sd-serif" style={{ fontSize: 20, marginTop: 8 }}>
                    {hasUpcomingEarnings
                      ? formatEventDate(eventsData.upcomingEarnings.date)
                      : "Next earnings date not yet available"}
                  </div>
                  <div style={{ fontSize: 11, color: THEME.inkDim, marginTop: 5 }}>
                    {hasUpcomingEarnings
                      ? eventsData?.upcomingEarnings?.isEstimate
                        ? "Estimated reporting date"
                        : "Reported calendar date"
                      : "No valid future reporting date is currently available."}
                  </div>
                  <div style={{ borderTop: `1px solid ${THEME.hairline}`, marginTop: 14, paddingTop: 10 }}>
                    <MetricLine
                      label="Consensus EPS"
                      value={
                        hasUpcomingEarnings &&
                        Number.isFinite(eventsData?.upcomingEarnings?.epsEstimate)
                          ? `₹${fmtNum(eventsData.upcomingEarnings.epsEstimate, 2)}`
                          : "—"
                      }
                      mode={mode}
                      explain="Yahoo Finance analyst consensus for the upcoming reporting period."
                    />
                    <MetricLine
                      label="EPS estimate range"
                      value={
                        hasUpcomingEarnings &&
                        Number.isFinite(eventsData?.upcomingEarnings?.epsLow) &&
                        Number.isFinite(eventsData?.upcomingEarnings?.epsHigh)
                          ? `₹${fmtNum(eventsData.upcomingEarnings.epsLow, 2)} – ₹${fmtNum(eventsData.upcomingEarnings.epsHigh, 2)}`
                          : "—"
                      }
                      mode={mode}
                      explain="Low-to-high analyst estimate range supplied by Yahoo Finance."
                    />
                    <MetricLine
                      label="Consensus revenue"
                      value={
                        hasUpcomingEarnings &&
                        Number.isFinite(eventsData?.upcomingEarnings?.revenueEstimate)
                          ? fmtCr(eventsData.upcomingEarnings.revenueEstimate / 10000000)
                          : "—"
                      }
                      mode={mode}
                      explain="Yahoo Finance analyst revenue consensus, converted from rupees to crores."
                    />
                  </div>
                </Panel>

                <Panel style={{ padding: 16 }}>
                  <div style={{ fontSize: 11, color: THEME.gold, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>
                    Dividend
                  </div>
                  <div className="sd-serif" style={{ fontSize: 20, marginTop: 8 }}>
                    Ex-dividend {formatEventDate(eventsData?.dividend?.exDividendDate)}
                  </div>
                  <div style={{ borderTop: `1px solid ${THEME.hairline}`, marginTop: 14, paddingTop: 10 }}>
                    <MetricLine
                      label="Annual dividend rate"
                      value={
                        Number.isFinite(eventsData?.dividend?.annualRate)
                          ? `₹${fmtNum(eventsData.dividend.annualRate, 2)}`
                          : "—"
                      }
                      mode={mode}
                      explain="Annualised dividend rate currently reported by Yahoo Finance."
                    />
                    <MetricLine
                      label="Dividend yield"
                      value={
                        Number.isFinite(eventsData?.dividend?.yieldPercent)
                          ? `${fmtNum(eventsData.dividend.yieldPercent, 2)}%`
                          : "—"
                      }
                      mode={mode}
                      explain="Annual dividend rate relative to the current share price."
                    />
                    <MetricLine
                      label="Payout ratio"
                      value={
                        Number.isFinite(eventsData?.dividend?.payoutRatioPercent)
                          ? `${fmtNum(eventsData.dividend.payoutRatioPercent, 1)}%`
                          : "—"
                      }
                      mode={mode}
                      explain="Approximate proportion of earnings distributed as dividends."
                    />
                  </div>
                </Panel>
              </div>

              <div style={{ marginTop: 26 }}>
                <SectionHeading title="Recent earnings performance" />
              </div>
              <Panel style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${THEME.hairline}` }}>
                      <th style={thStyle}>Quarter</th>
                      <th style={thStyle}>Actual EPS</th>
                      <th style={thStyle}>Estimated EPS</th>
                      <th style={thStyle}>Difference</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(eventsData?.earningsHistory || []).map((event) => (
                      <tr key={event.quarter} style={{ borderBottom: `1px solid ${THEME.hairline}` }}>
                        <td style={tdStyle}>{formatEventDate(event.quarter)}</td>
                        <td style={tdStyle}>{Number.isFinite(event.epsActual) ? `₹${fmtNum(event.epsActual, 2)}` : "—"}</td>
                        <td style={tdStyle}>{Number.isFinite(event.epsEstimate) ? `₹${fmtNum(event.epsEstimate, 2)}` : "—"}</td>
                        <td style={tdStyle}>{Number.isFinite(event.epsDifference) ? `₹${fmtNum(event.epsDifference, 2)}` : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {(eventsData?.earningsHistory || []).length === 0 && (
                  <div style={{ padding: 18, fontSize: 12, color: THEME.inkDim }}>
                    Recent earnings history is not available from Yahoo Finance for this company.
                  </div>
                )}
              </Panel>

              <div style={{ marginTop: 26 }}>
                <SectionHeading title="Financial reports" />
              </div>
              <Panel style={{ padding: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <FileText size={15} color={THEME.gold} />
                  <div style={{ fontSize: 12.5 }}>Official report downloads are not available through Yahoo Finance.</div>
                </div>
                <div style={{ fontSize: 11, color: THEME.inkDim, marginTop: 6 }}>
                  This section will remain empty until official company or exchange PDF sources are connected.
                </div>
              </Panel>

              <div style={{ fontSize: 11, color: THEME.inkDim, marginTop: 10 }}>
                Earnings estimates and dividend information are supplied by Yahoo Finance and may be revised.
              </div>
            </>
          )}
        </div>
      )}

      {tab === "Peers" && <PeerTab sector={s.sector} ticker={s.ticker} openCompany={openCompany} />}

      {tab === "Notes" && (
        <Panel style={{ padding: 18 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Your research notes on {s.ticker}</div>
          <div style={{ fontSize: 11.5, color: THEME.inkDim, marginBottom: 12 }}>Session-only — no login required. Notes are cleared if you close this Artifact.</div>
          <textarea value={noteDraft} onChange={(e) => setNoteDraft(e.target.value)} placeholder="What is my thesis? What would change my mind? What needs monitoring?"
            style={{ width: "100%", minHeight: 90, background: THEME.navyDeep, border: `1px solid ${THEME.hairline}`, borderRadius: 5, color: THEME.ink, padding: 10, fontSize: 12.5, resize: "vertical" }} />
          <button onClick={() => { if (noteDraft.trim()) { setNote(ticker, [...(notes[ticker] || []), { text: noteDraft.trim(), ts: new Date().toLocaleString("en-IN") }]); setNoteDraft(""); } }}
            style={{ marginTop: 8, background: THEME.gold, color: THEME.navyDeep, border: "none", borderRadius: 4, padding: "7px 14px", fontWeight: 700, fontSize: 12.5, cursor: "pointer" }}>
            Save note
          </button>
          <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 10 }}>
            {(notes[ticker] || []).slice().reverse().map((n, i) => (
              <div key={i} style={{ border: `1px solid ${THEME.hairline}`, borderRadius: 5, padding: 10 }}>
                <div style={{ fontSize: 10.5, color: THEME.inkDim, display: "flex", justifyContent: "space-between" }}>
                  <span>{n.ts}</span>
                  <button onClick={() => setNote(ticker, notes[ticker].filter((_, idx) => idx !== notes[ticker].length - 1 - i))} style={{ background: "none", border: "none", color: THEME.down, cursor: "pointer" }}><X size={12} /></button>
                </div>
                <div style={{ fontSize: 12.5, marginTop: 4, whiteSpace: "pre-wrap" }}>{n.text}</div>
              </div>
            ))}
            {(!notes[ticker] || notes[ticker].length === 0) && (
              <div style={{ fontSize: 12, color: THEME.inkDim }}>
                No notes yet. Add your investment thesis, questions or developments to monitor using the field above.
              </div>
            )}
          </div>
        </Panel>
      )}
    </div>
  );
}

function IconBtn({ onClick, icon, label, active }) {
  return (
    <button onClick={onClick} className="sd-focusable" style={{
      display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, fontWeight: 600, cursor: "pointer",
      border: `1px solid ${active ? THEME.gold : THEME.hairline}`, borderRadius: 4, padding: "6px 10px",
      background: active ? "rgba(201,162,75,0.12)" : "none", color: active ? THEME.gold : THEME.creamDim,
    }}>{icon}{label}</button>
  );
}

function MetricLine({ label, value, mode, explain }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, padding: "6px 0", borderBottom: `1px solid ${THEME.hairline}` }}>
      <span style={{ color: THEME.inkDim, display: "flex", alignItems: "center" }}>{label}{explain && <MetricExplain mode={mode} text={explain} />}</span>
      <span className="sd-mono">{value}</span>
    </div>
  );
}

function demoFinSeries(ticker, kind) {
  const rnd = seedRandom(ticker + kind);
  const base = { rev: 40000, ebitda: 9000, ni: 5200, eps: 42, ocf: 8100, fcf: 4200 }[kind];
  const years = ["FY23", "FY24", "FY25", "FY26"];
  let v = base * (0.82 + rnd() * 0.1);
  return years.map((y) => {
    v = v * (1.04 + (rnd() - 0.5) * 0.08);
    return { y, v: Math.round(v) };
  });
}

function FinRow({ label, values = [], field, mode, explain }) {
  const isEPS = field === "basicEPS" || field === "dilutedEPS";

  const series = values
    .filter(
      (item) =>
        item &&
        item.year != null &&
        item[field] != null &&
        Number.isFinite(Number(item[field]))
    )
    .map((item) => ({
      year: Number(item.year),
      value: Number(item[field]),
    }))
    .sort((a, b) => a.year - b.year)
    .slice(-5);

  const formatCrores = (absoluteRupees) => {
    if (!Number.isFinite(absoluteRupees)) {
      return "Data unavailable";
    }

    const crores = absoluteRupees / 1e7;
    const absoluteCrores = Math.abs(crores);

    if (absoluteCrores >= 100000) {
      return `${crores < 0 ? "-" : ""}₹${(
        absoluteCrores / 100000
      ).toFixed(2)}L Cr`;
    }

    if (absoluteCrores >= 1000) {
      return `${crores < 0 ? "-" : ""}₹${(
        absoluteCrores / 1000
      ).toFixed(2)}K Cr`;
    }

    return `${crores < 0 ? "-" : ""}₹${absoluteCrores.toLocaleString(
      "en-IN",
      {
        maximumFractionDigits: 2,
      }
    )} Cr`;
  };

  const formatEPS = (value) => {
    if (!Number.isFinite(value)) {
      return "Data unavailable";
    }

    return `${value < 0 ? "-" : ""}₹${Math.abs(value).toLocaleString(
      "en-IN",
      {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }
    )}`;
  };

  const formatValue = (value) =>
    isEPS ? formatEPS(value) : formatCrores(value);

  const latest = series[series.length - 1] || null;
  const previous = series[series.length - 2] || null;

  const growth =
    latest &&
    previous &&
    previous.value !== 0
      ? ((latest.value - previous.value) / Math.abs(previous.value)) * 100
      : null;

  const absoluteValues = series.map((item) => Math.abs(item.value));
  const minimumValue =
    absoluteValues.length > 0 ? Math.min(...absoluteValues) : 0;
  const maximumValue =
    absoluteValues.length > 0 ? Math.max(...absoluteValues) : 1;

  const valueRange = maximumValue - minimumValue;

  const getBarHeight = (value) => {
    if (valueRange === 0) return 44;

    const normalized =
      (Math.abs(value) - minimumValue) / valueRange;

    return 22 + normalized * 38;
  };

  return (
    <Panel
      style={{
        padding: 16,
        minWidth: 0,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 18,
        }}
      >
        <div
          style={{
            fontSize: 12,
            color: THEME.inkDim,
            display: "flex",
            alignItems: "center",
            minWidth: 0,
          }}
        >
          {label}

          <MetricExplain
            mode={mode}
            text={explain}
          />
        </div>

       {growth != null && (
  <div
    style={{
      flexShrink: 0,
      display: "flex",
      alignItems: "center",
      gap: 4,
      fontSize: 11,
      color: THEME.inkDim,
    }}
  >
    <span>YoY Change:</span>

    <span
      className="sd-mono"
      style={{
        color: growth >= 0 ? "#3fb984" : "#e06c75",
        fontWeight: 600,
      }}
    >
      {growth >= 0 ? "+" : ""}
      {growth.toFixed(1)}%
    </span>
  </div>
)}
      </div>

      {series.length === 0 ? (
        <div
          style={{
            height: 100,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 11,
            color: THEME.inkDim,
          }}
        >
          Data unavailable
        </div>
      ) : (
        <div
          style={{
            height: 130,
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-around",
            gap: 14,
            padding: "0 4px",
            borderBottom: `1px solid ${
              mode === "dark"
                ? "rgba(255,255,255,0.08)"
                : "rgba(0,0,0,0.08)"
            }`,
          }}
        >
{series.map((item) => {
  const barHeight = getBarHeight(item.value);
  const isLatest = item.year === latest?.year;

  return (
    <div
      key={item.year}
      title={`FY${String(item.year).slice(-2)}: ${formatValue(item.value)}`}
      style={{
        flex: 1,
        minWidth: 0,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "flex-end",
      }}
    >
      <div
        style={{
          fontSize: 10,
          color: "#E8E8E8",
          fontWeight: 500,
          marginBottom: 8,
          whiteSpace: "nowrap",
        }}
      >
        {formatValue(item.value)}
      </div>

      <div
        style={{
          width: "100%",
          maxWidth: 42,
          height: barHeight,
          background: THEME.gold,
          opacity: isLatest ? 1 : 0.58,
          borderRadius: "6px 6px 2px 2px",
          transition: "all .2s ease",
        }}
      />

      <div
        style={{
          fontSize: 10,
          color: THEME.inkDim,
          marginTop: 7,
          fontWeight: 500,
        }}
      >
        FY{String(item.year).slice(-2)}
      </div>
    </div>
  );
})}
        </div>
      )}

      <div
  style={{
    marginTop: 15,
  }}
>
  <div
    className="sd-mono"
    style={{
      fontSize: 16,
      fontWeight: 600,
      lineHeight: 1.2,
    }}
  >
    {latest
      ? formatValue(latest.value)
      : "Data unavailable"}
  </div>

  {latest && (
    <div
      style={{
        marginTop: 4,
        fontSize: 11,
        color: THEME.inkDim,
      }}
    >
      Latest • FY{String(latest.year).slice(-2)}
    </div>
  )}
</div>
       </Panel>
  );
}
function PeerTab({ sector, ticker, openCompany }) {
  const peerDefinitions = useMemo(
    () => RAW_STOCKS.filter((stock) => stock.sector === sector),
    [sector]
  );
  const peerSymbols = useMemo(
    () => peerDefinitions.map((peer) => peer.ticker),
    [peerDefinitions]
  );
  const [peers, setPeers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadPeers() {
      setLoading(true);
      setError("");

      try {
        const data = await getPeerComparison(peerSymbols);

        if (!cancelled) {
          setPeers(data);
        }
      } catch (requestError) {
        if (!cancelled) {
          setPeers([]);
          setError("Unable to load live peer data.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadPeers();

    return () => {
      cancelled = true;
    };
  }, [peerSymbols]);

  return (
    <div>
      <div style={{ fontSize: 11, color: THEME.inkDim, marginBottom: 12 }}>Latest available market data for StockDekho companies within {sector}. Higher or lower values are shown for context only — not a ranking of which company is "better".</div>
      <Panel style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, minWidth: 720 }}>
          <thead><tr style={{ borderBottom: `1px solid ${THEME.hairline}` }}>
            <th style={thStyle}>Company</th><th style={thStyle}>P/E</th><th style={thStyle}>ROE%</th><th style={thStyle}>D/E</th><th style={thStyle}>Div Yield%</th><th style={thStyle}>1Y Return</th>
          </tr></thead>
          <tbody>
            {peers.map((p) => (
              <tr
                key={p.ticker}
                className="sd-row-hover"
                tabIndex={0}
                onClick={() => openCompany?.(p.ticker)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    openCompany?.(p.ticker);
                  }
                }}
                style={{
                  cursor: "pointer",
                  borderBottom: `1px solid ${THEME.hairline}`,
                  background: p.ticker === ticker ? "rgba(201,162,75,0.08)" : "none",
                }}
              >
                <td style={tdStyle}>{p.company} <span style={{ color: THEME.inkDim }}>· {p.ticker}</span></td>
                <td style={tdStyle} className="sd-mono">{Number.isFinite(p.trailingPE) ? fmtNum(p.trailingPE, 1) : "—"}</td>
                <td style={tdStyle} className="sd-mono">{Number.isFinite(p.returnOnEquity) ? fmtNum(p.returnOnEquity, 1) : "—"}</td>
                <td style={tdStyle} className="sd-mono">{Number.isFinite(p.debtToEquity) ? fmtNum(p.debtToEquity, 2) : "—"}</td>
                <td style={tdStyle} className="sd-mono">{Number.isFinite(p.dividendYield) ? fmtNum(p.dividendYield, 1) : "—"}</td>
                <td style={tdStyle}>{Number.isFinite(p.oneYearReturn) ? <Move value={p.oneYearReturn} /> : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {loading && (
          <div style={{ padding: 18, fontSize: 12, color: THEME.inkDim }}>
            Loading live peer data...
          </div>
        )}
        {!loading && error && (
          <div style={{ padding: 18, fontSize: 12, color: THEME.down }}>
            {error} Please try again shortly.
          </div>
        )}
        {!loading && !error && peers.length === 0 && (
          <div style={{ padding: 18, fontSize: 12, color: THEME.inkDim }}>
            No comparable companies are currently available for this sector.
          </div>
        )}
      </Panel>
    </div>
  );
}

function companyBlurb(ticker) {
  const map = {
    RELIANCE: "Diversified conglomerate spanning energy & petrochemicals, retail, and digital services through Jio.",
    TCS: "India's largest IT services company by revenue, providing consulting, technology and outsourcing services globally.",
    SBIN: "India's largest public-sector bank by assets, offering retail, corporate and treasury banking services.",
    ICICIBANK: "Large private-sector bank with a diversified retail and corporate lending franchise.",
    LT: "Engineering and construction conglomerate spanning infrastructure, defence, IT services and financial services.",
    INFY: "Global IT services and consulting company providing digital transformation, cloud and enterprise application services.",
    HDFCBANK: "India's largest private-sector bank by assets, offering retail banking, wholesale banking and treasury services.",
    ITC: "Diversified consumer conglomerate spanning cigarettes, FMCG, hotels, paperboard and agri-business.",
    SUNPHARMA: "India's largest pharmaceutical company by revenue, manufacturing generic and specialty drugs globally.",
    MARUTI: "India's largest passenger-vehicle manufacturer, producing hatchbacks, sedans and SUVs.",
    HCLTECH: "Global IT services company providing engineering, cloud, digital and enterprise technology services.",
    WIPRO: "Global IT services and consulting company offering digital transformation and engineering services.",
    BAJFINANCE: "One of India's largest non-banking financial companies, offering consumer, SME and commercial lending.",
    "M&M": "Diversified automotive and farm-equipment manufacturer producing SUVs, tractors and electric vehicles.",
    BHARTIARTL: "One of India's largest telecom operators, providing mobile, broadband and digital services in India and Africa.",
    AXISBANK: "One of India's largest private-sector banks, offering retail, corporate and SME banking products.",
    TITAN: "Consumer products company known for jewellery, watches and eyewear under the Tanishq and Titan brands.",
    TATASTEEL: "One of India's largest integrated steel producers, with manufacturing operations in India and Europe.",
    ULTRACEMCO: "India's largest cement manufacturer, producing grey cement, ready-mix concrete and building products.",
    NTPC: "India's largest power-generation company, operating thermal, hydro and renewable generation capacity.",
    POWERGRID: "India's principal electricity transmission utility, operating a majority of the interstate transmission network.",
    DLF: "One of India's largest real-estate developers, with residential and commercial projects mainly in the NCR.",
    OBEROIRLTY: "Mumbai-focused real-estate developer known for premium residential, commercial and hospitality projects.",
    IDEA: "Indian telecom operator formed from the merger of Vodafone India and Idea Cellular, providing mobile services.",
    BIOCON: "Biopharmaceutical company producing generics, biosimilars and novel biologics through its subsidiaries.",
    IOC: "India's largest oil-marketing and refining company, operating refineries, pipelines and fuel retail outlets.",
    DABUR: "Consumer-goods company known for ayurvedic health, personal-care and food products.",
    SIEMENS: "Indian listed arm of the German engineering group, providing industrial automation and energy solutions.",
    IDFCFIRSTB: "Private-sector bank formed from the merger of IDFC Bank and Capital First, offering retail and wholesale banking.",
    PERSISTENT: "Mid-sized IT services company specialising in software product engineering and digital services.",
    CROMPTON: "Consumer electricals manufacturer producing fans, pumps, lighting and appliances.",
    GRANULES: "Pharmaceutical company manufacturing active pharmaceutical ingredients, intermediates and finished dosages.",
    KARURVYSYA: "Tamil Nadu-headquartered private-sector bank offering retail, MSME and corporate banking, mainly in South India.",
    SONACOMS: "Automotive-components manufacturer specialising in precision forged and machined products, including for EVs.",
    SUZLON: "Indian wind-turbine manufacturer providing turbine supply, installation and operations & maintenance services.",
    NAVINFLUOR: "Specialty chemicals company manufacturing fluorochemicals, refrigerants and agrochemical intermediates.",
    TIPSFILMS: "Music and film-content company that owns and licenses a large catalogue of Indian film and music rights.",
    SHRIRAMFIN: "Large non-banking financial company focused on commercial-vehicle finance and MSME lending.",
    TATACONSUM: "Consumer-goods company with a portfolio spanning tea, coffee, salt and packaged foods.",
  };
  return map[ticker] || "Company profile information is not currently available from the configured data providers.";
}
function whatChangedBlurb(ticker) {
  const map = {
    RELIANCE: "Traded firmer on 24 Jul as one of the Sensex's better performers amid a broadly weak session.",
    TCS: "Reported stable Q1 FY27 revenue and a $9.5B order book; stock traded in a narrow range post-results.",
    INFY: "Trimmed FY27 growth guidance citing client-specific softness; leadership transition remains on track.",
  };
  return map[ticker] || "No major company-specific catalyst identified in this session; move broadly tracked the sector.";
}

// Business-profile detail (core operations, segments, background) shown on the Overview tab.
const COMPANY_PROFILE = {
  RELIANCE: {
    overview: "Reliance Industries is India's largest private-sector company by revenue and market capitalisation, operating an integrated business spanning energy, materials, retail and digital services.",
    segments: [
      { name: "Oil-to-Chemicals (O2C)", desc: "Refining, petrochemicals and fuel retailing — historically the company's largest single revenue contributor." },
      { name: "Reliance Retail", desc: "India's largest retailer by revenue, spanning grocery, fashion, consumer electronics and e-commerce." },
      { name: "Reliance Jio", desc: "Telecom and digital-services arm; India's largest wireless operator by subscriber base." },
      { name: "New Energy", desc: "Newer renewables and battery-storage manufacturing initiative positioned as a future growth segment." },
    ],
    background: "Founded by Dhirubhai Ambani and now led by Mukesh Ambani, Reliance has evolved from a textiles and petrochemicals business into a diversified conglomerate spanning energy, retail and telecom over four decades.",
  },
  TCS: {
    overview: "Tata Consultancy Services is India's largest IT services company by revenue, providing consulting, technology and business-process outsourcing services to clients across banking, retail, manufacturing and healthcare.",
    segments: [
      { name: "BFSI", desc: "Banking, financial services and insurance clients — historically the largest vertical by revenue contribution." },
      { name: "Retail & Consumer", desc: "Technology and consulting services for retail and consumer-goods companies globally." },
      { name: "Cloud & AI services", desc: "Growing practice area covering cloud migration, data platforms and applied AI engagements." },
    ],
    background: "Part of the Tata Group, TCS has grown from a domestic technology-services provider into one of the world's largest IT services firms, with a workforce spread across delivery centres in India and abroad.",
  },
  INFY: {
    overview: "Infosys is a global IT services and consulting company, providing digital transformation, cloud and enterprise application services to clients across North America, Europe and Asia-Pacific.",
    segments: [
      { name: "Digital services", desc: "Cloud, data and digital-experience engagements — the company's fastest-growing revenue category." },
      { name: "Core services", desc: "Legacy application maintenance, enterprise resource planning and infrastructure management." },
      { name: "Products & platforms", desc: "Finacle and other proprietary software platforms sold to banking and enterprise clients." },
    ],
    background: "Co-founded in 1981, Infosys was among the early Indian IT companies to build a large-scale global delivery model and remains one of the country's most widely held technology stocks.",
  },
  SBIN: {
    overview: "State Bank of India is the country's largest bank by assets and branch network, offering retail banking, corporate lending, treasury operations and financial services through its subsidiaries.",
    segments: [
      { name: "Retail banking", desc: "Deposits, home loans and personal loans for individual customers across India." },
      { name: "Corporate & commercial banking", desc: "Lending and banking services to large corporates, SMEs and institutional clients." },
      { name: "Treasury operations", desc: "Investment book, government securities trading and foreign-exchange operations." },
      { name: "Insurance & asset management", desc: "SBI Life, SBI Mutual Fund and other subsidiaries extending the group beyond core banking." },
    ],
    background: "A government-owned bank tracing its roots to the early 19th century, SBI operates one of India's largest branch and ATM networks and remains the primary banking relationship for a large share of Indian households.",
  },
  ICICIBANK: {
    overview: "ICICI Bank is one of India's largest private-sector banks, offering retail banking, corporate lending and a range of financial products through its banking and insurance subsidiaries.",
    segments: [
      { name: "Retail banking", desc: "Home loans, personal loans, credit cards and deposits for individual customers." },
      { name: "Wholesale banking", desc: "Corporate lending, working-capital finance and transaction banking for large businesses." },
      { name: "Treasury", desc: "Investment portfolio, government securities and foreign-exchange operations." },
      { name: "Life & general insurance", desc: "ICICI Prudential Life and ICICI Lombard extend the group into insurance." },
    ],
    background: "ICICI Bank has grown into one of India's largest private lenders since its formation in the 1990s, with a broad digital banking platform and a nationwide branch network.",
  },
  LT: {
    overview: "Larsen & Toubro is a diversified engineering and construction conglomerate with operations spanning infrastructure, heavy engineering, defence, IT services and financial services.",
    segments: [
      { name: "Infrastructure", desc: "Construction of roads, buildings, power transmission and water infrastructure projects." },
      { name: "Energy", desc: "Hydrocarbon and power-sector engineering, procurement and construction (EPC) projects." },
      { name: "Defence & precision engineering", desc: "Manufacturing for defence, aerospace and heavy-engineering applications." },
      { name: "IT & technology services", desc: "LTIMindtree and L&T Technology Services extend the group into listed and unlisted technology revenue." },
    ],
    background: "Founded in 1938, L&T has grown into one of India's largest engineering and construction groups, with a substantial order book spanning domestic and international infrastructure projects.",
  },
  HDFCBANK: {
    overview: "HDFC Bank is India's largest private-sector bank by assets, offering retail banking, wholesale banking and a broad suite of financial products following its 2023 merger with parent HDFC Ltd.",
    segments: [
      { name: "Retail banking", desc: "Deposits, home loans, personal loans, credit cards and retail liabilities." },
      { name: "Wholesale banking", desc: "Corporate lending, trade finance and cash-management services for businesses." },
      { name: "Treasury", desc: "Investment book, money-market and foreign-exchange operations." },
    ],
    background: "Established in 1994, HDFC Bank has grown into India's largest private lender by balance sheet, with its scale increasing further after absorbing housing-finance major HDFC Ltd.",
  },
  ITC: {
    overview: "ITC is a diversified consumer conglomerate with businesses spanning cigarettes, FMCG, hotels, paperboard and agri-business.",
    segments: [
      { name: "Cigarettes", desc: "India's largest cigarette manufacturer and historically the group's largest profit contributor." },
      { name: "FMCG — Others", desc: "Packaged foods, personal care, stationery and other branded consumer-goods businesses." },
      { name: "Hotels", desc: "Hotels operated under the ITC Hotels brand, demerged as a separate listed entity from 2025." },
      { name: "Paperboard & agri-business", desc: "Paper, packaging and agricultural commodity trading and processing." },
    ],
    background: "Originally established as a tobacco company in 1910, ITC has diversified extensively into packaged foods, personal care and other consumer businesses over recent decades.",
  },
  SUNPHARMA: {
    overview: "Sun Pharmaceutical Industries is India's largest pharmaceutical company by revenue, manufacturing and marketing generic and specialty drugs across India, the US and other global markets.",
    segments: [
      { name: "India branded generics", desc: "Domestic prescription-drug business across multiple therapeutic areas." },
      { name: "US generics & specialty", desc: "Generic and specialty drug sales in the US, including dermatology and ophthalmology brands." },
      { name: "Emerging markets & ROW", desc: "Formulations sold across other international markets." },
    ],
    background: "Built through organic growth and acquisitions including Ranbaxy, Sun Pharma has become one of the largest specialty generic pharmaceutical companies globally by prescriptions.",
  },
  MARUTI: {
    overview: "Maruti Suzuki India is the country's largest passenger-vehicle manufacturer, producing cars ranging from entry-level hatchbacks to SUVs through its dealership and export network.",
    segments: [
      { name: "Passenger vehicles", desc: "Hatchbacks, sedans and SUVs sold under the Maruti Suzuki brand across India." },
      { name: "Exports", desc: "Vehicle exports to markets in Africa, Latin America and the Middle East." },
      { name: "Spare parts & services", desc: "After-sales service and spare-parts revenue through its dealer network." },
    ],
    background: "A subsidiary of Japan's Suzuki Motor Corporation, Maruti Suzuki has led India's passenger-vehicle market since the 1980s and remains the largest carmaker by volume.",
  },
  HCLTECH: {
    overview: "HCL Technologies is a global IT services company providing engineering, cloud, digital and enterprise technology services to clients across industries.",
    segments: [
      { name: "IT & business services", desc: "Application development, infrastructure management and consulting services." },
      { name: "Engineering & R&D services", desc: "Product engineering and R&D outsourcing for technology and industrial clients." },
      { name: "HCLSoftware", desc: "Proprietary enterprise software products sold to global customers." },
    ],
    background: "Founded in 1976 as part of the HCL Group, HCL Technologies has grown into one of India's largest IT services exporters with a global delivery footprint.",
  },
  WIPRO: {
    overview: "Wipro is a global IT services and consulting company offering digital transformation, cloud and engineering services to clients across banking, healthcare, manufacturing and other sectors.",
    segments: [
      { name: "IT services", desc: "Application development, infrastructure and consulting services for global enterprise clients." },
      { name: "Engineering & R&D", desc: "Product-engineering services for technology and industrial companies." },
    ],
    background: "Originally a consumer-products and vegetable-oil business, Wipro transformed into a leading IT services exporter from the 1980s onward and now operates delivery centres worldwide.",
  },
  BAJFINANCE: {
    overview: "Bajaj Finance is one of India's largest non-banking financial companies (NBFCs), offering consumer lending, SME finance and commercial lending products.",
    segments: [
      { name: "Consumer finance", desc: "Personal loans, consumer-durable financing and digital lending products for retail customers." },
      { name: "SME lending", desc: "Working-capital and business loans for small and medium enterprises." },
      { name: "Commercial & rural lending", desc: "Loans against property, rural finance and other secured lending lines." },
    ],
    background: "Part of the Bajaj Group, Bajaj Finance has grown rapidly into one of India's largest diversified NBFCs, known for its wide consumer-lending distribution network.",
  },
  "M&M": {
    overview: "Mahindra & Mahindra is a diversified automotive and farm-equipment manufacturer, producing SUVs, commercial vehicles, tractors and electric vehicles.",
    segments: [
      { name: "Automotive", desc: "SUVs, pick-ups and commercial vehicles sold under the Mahindra brand." },
      { name: "Farm equipment", desc: "Tractors and farm machinery — India's largest tractor manufacturer by volume." },
      { name: "Financial services & others", desc: "Mahindra Finance and other group businesses contributing to consolidated performance." },
    ],
    background: "Founded in 1945, Mahindra & Mahindra has built leadership positions in both the SUV and tractor segments and has expanded into electric vehicles in recent years.",
  },
  BHARTIARTL: {
    overview: "Bharti Airtel is one of India's largest telecom operators, providing mobile, broadband and digital services domestically and across several African markets.",
    segments: [
      { name: "Mobile services — India", desc: "Voice and data services for retail and enterprise mobile subscribers in India." },
      { name: "Airtel Africa", desc: "Telecom and mobile-money operations across multiple African markets." },
      { name: "Homes & enterprise", desc: "Broadband, DTH and enterprise connectivity services." },
    ],
    background: "Founded in 1995, Bharti Airtel has grown into one of the world's largest telecom operators by subscriber base, with a significant African operating footprint through Airtel Africa.",
  },
  AXISBANK: {
    overview: "Axis Bank is one of India's largest private-sector banks, offering retail, corporate and SME banking products through a nationwide branch and digital network.",
    segments: [
      { name: "Retail banking", desc: "Deposits, home loans, personal loans and credit cards for individual customers." },
      { name: "Wholesale banking", desc: "Corporate lending and transaction banking for large businesses." },
      { name: "Treasury", desc: "Investment book and foreign-exchange operations." },
    ],
    background: "Established in the early 1990s as one of the first new private banks post-liberalisation, Axis Bank has grown into a large diversified lender with an expanding digital banking platform.",
  },
  TITAN: {
    overview: "Titan Company is a consumer products company best known for jewellery, watches and eyewear, operating brands including Tanishq, Titan and Fastrack.",
    segments: [
      { name: "Jewellery (Tanishq)", desc: "India's largest organised jewellery retail business by revenue." },
      { name: "Watches & wearables", desc: "Titan and Fastrack branded watches and wearable devices." },
      { name: "Eyewear", desc: "Titan Eye+ retail eyewear business." },
    ],
    background: "A joint venture originally between the Tata Group and Tamil Nadu government bodies, Titan has built market-leading positions in organised jewellery and watch retail in India.",
  },
  TATASTEEL: {
    overview: "Tata Steel is one of India's largest integrated steel producers, with manufacturing operations in India and Europe.",
    segments: [
      { name: "India operations", desc: "Integrated steel manufacturing and downstream products for domestic and export markets." },
      { name: "Europe operations", desc: "Steel manufacturing and processing operations in the UK and Netherlands." },
    ],
    background: "Founded in 1907, Tata Steel was among Asia's first integrated steel plants and has since expanded internationally, including through the acquisition of Corus in Europe.",
  },
  ULTRACEMCO: {
    overview: "UltraTech Cement is India's largest cement manufacturer, producing grey cement, ready-mix concrete and building products.",
    segments: [
      { name: "Grey cement", desc: "Core cement manufacturing and sales — the company's largest revenue segment." },
      { name: "Ready-mix concrete", desc: "RMC supplied to construction and infrastructure projects." },
      { name: "Building products", desc: "White cement, putty and other building-material products." },
    ],
    background: "Part of the Aditya Birla Group, UltraTech has grown into India's largest cement producer through organic capacity additions and acquisitions.",
  },
  NTPC: {
    overview: "NTPC is India's largest power-generation company, operating thermal, hydro, solar and other renewable generation capacity.",
    segments: [
      { name: "Thermal generation", desc: "Coal and gas-based power plants — the company's largest capacity base." },
      { name: "Renewable energy", desc: "Solar, wind and other renewable generation capacity under expansion." },
      { name: "Hydro & other generation", desc: "Hydroelectric and other diversified generation assets." },
    ],
    background: "A government-owned enterprise established in 1975, NTPC is India's largest power generator and a key supplier to the national grid.",
  },
  POWERGRID: {
    overview: "Power Grid Corporation of India is the country's principal electricity transmission utility, operating a substantial share of India's interstate transmission network.",
    segments: [
      { name: "Transmission", desc: "Ownership and operation of high-voltage transmission lines connecting India's power grid." },
      { name: "Consultancy & telecom", desc: "Consultancy services and a telecom infrastructure business built on its transmission assets." },
    ],
    background: "A government-owned utility established in 1989, Power Grid operates the majority of India's interstate electricity transmission network under long-term regulated tariffs.",
  },
  DLF: {
    overview: "DLF is one of India's largest real-estate developers, with a portfolio spanning residential, commercial and retail developments primarily in the National Capital Region.",
    segments: [
      { name: "Residential development", desc: "Housing and residential projects sold to homebuyers." },
      { name: "Rental & commercial (DCCDL)", desc: "Office and retail assets generating annuity rental income." },
    ],
    background: "Founded in 1946, DLF became one of India's largest listed real-estate developers, with a significant annuity-generating commercial portfolio alongside its residential business.",
  },
  OBEROIRLTY: {
    overview: "Oberoi Realty is a Mumbai-focused real-estate developer known for premium residential, commercial and hospitality projects.",
    segments: [
      { name: "Residential", desc: "Premium and luxury residential developments across Mumbai and its suburbs." },
      { name: "Commercial & retail", desc: "Office and retail developments generating rental income." },
      { name: "Hospitality", desc: "Hotel operations under long-term management arrangements." },
    ],
    background: "Oberoi Realty has built a reputation for premium, design-led developments concentrated primarily in the Mumbai Metropolitan Region.",
  },
  IDEA: {
    overview: "Vodafone Idea is an Indian telecom operator formed from the merger of Vodafone India and Idea Cellular, providing mobile voice and data services.",
    segments: [
      { name: "Mobile services", desc: "Prepaid and postpaid voice and data services across India." },
      { name: "Enterprise & other services", desc: "Enterprise connectivity and other telecom services." },
    ],
    background: "Formed via the 2018 merger of Vodafone India and Idea Cellular, the company has faced significant competitive and balance-sheet pressure in India's telecom market since the merger.",
  },
  BIOCON: {
    overview: "Biocon is a biopharmaceutical company producing generics, biosimilars and novel biologics through its listed subsidiary Biocon Biologics.",
    segments: [
      { name: "Generics", desc: "Small-molecule active pharmaceutical ingredients and formulations." },
      { name: "Biosimilars (Biocon Biologics)", desc: "Biosimilar versions of insulin, monoclonal antibodies and other biologic drugs." },
    ],
    background: "Founded in 1978, Biocon has grown from an enzymes business into one of India's leading biopharmaceutical companies with a global biosimilars franchise.",
  },
  IOC: {
    overview: "Indian Oil Corporation is India's largest oil-marketing and refining company, operating refineries, pipelines and a nationwide fuel-retail network.",
    segments: [
      { name: "Refining", desc: "Crude-oil refining across multiple refineries nationwide." },
      { name: "Marketing", desc: "Retail sale of petrol, diesel and LPG through its distribution network." },
      { name: "Petrochemicals", desc: "Petrochemical products manufactured as refinery by-products." },
    ],
    background: "A government-owned enterprise, Indian Oil is India's largest fuel retailer and refiner, operating one of the country's most extensive downstream oil infrastructure networks.",
  },
  DABUR: {
    overview: "Dabur India is a consumer-goods company known for ayurvedic and natural health, personal-care and food products.",
    segments: [
      { name: "Health care", desc: "Ayurvedic and health-supplement products including Chyawanprash and Honey." },
      { name: "Home & personal care", desc: "Oral care, hair care and skin-care branded products." },
      { name: "Foods & beverages", desc: "Juices and food products including Real fruit juice." },
    ],
    background: "Founded in 1884, Dabur has grown from an ayurvedic-medicine business into one of India's largest FMCG companies with a broad portfolio of natural and health-focused brands.",
  },
  SIEMENS: {
    overview: "Siemens Ltd is the Indian listed arm of the German engineering group, providing industrial automation, energy and mobility solutions.",
    segments: [
      { name: "Digital industries", desc: "Automation and digitalisation solutions for manufacturing clients." },
      { name: "Energy", desc: "Power-generation and grid-technology equipment and services." },
      { name: "Mobility", desc: "Rail and transportation infrastructure solutions." },
    ],
    background: "Operating in India since the early 1900s, Siemens Ltd is the listed Indian subsidiary of Germany's Siemens AG, serving industrial, energy and infrastructure customers.",
  },
  IDFCFIRSTB: {
    overview: "IDFC First Bank is a private-sector bank formed from the merger of IDFC Bank and Capital First, offering retail and wholesale banking products.",
    segments: [
      { name: "Retail banking", desc: "Deposits, loans and credit cards for individual customers — a segment the bank has prioritised growing." },
      { name: "Wholesale banking", desc: "Corporate and infrastructure lending inherited from its IDFC Bank origins." },
    ],
    background: "Formed via the 2018 merger of infrastructure-focused IDFC Bank and retail-lender Capital First, the bank has been shifting its loan book toward retail banking.",
  },
  PERSISTENT: {
    overview: "Persistent Systems is a mid-sized IT services company specialising in software product engineering, digital and cloud services.",
    segments: [
      { name: "Software product engineering", desc: "Outsourced product-development services for technology companies." },
      { name: "Digital & cloud services", desc: "Cloud migration, data and digital-transformation consulting for enterprise clients." },
    ],
    background: "Founded in 1990, Persistent Systems has built a reputation as a specialist software-engineering partner, particularly for technology and independent software-vendor clients.",
  },
  CROMPTON: {
    overview: "Crompton Greaves Consumer Electricals manufactures consumer electrical products including fans, pumps, lighting and appliances.",
    segments: [
      { name: "Electrical consumer durables", desc: "Fans, pumps and other electrical appliances sold under the Crompton brand." },
      { name: "Lighting", desc: "LED lighting products for residential and commercial use." },
    ],
    background: "Demerged from the erstwhile Crompton Greaves industrial business in 2016, the company has focused on consumer-facing electrical appliance categories.",
  },
  GRANULES: {
    overview: "Granules India is a pharmaceutical company manufacturing active pharmaceutical ingredients (APIs), intermediates and finished dosages.",
    segments: [
      { name: "APIs & intermediates", desc: "Bulk active pharmaceutical ingredients supplied to formulators globally." },
      { name: "Finished dosages", desc: "Branded and generic finished-dose formulations sold in regulated and emerging markets." },
    ],
    background: "Granules India has built a vertically integrated model spanning API manufacturing through to finished dosage forms, with a focus on cost-competitive, high-volume generics.",
  },
  KARURVYSYA: {
    overview: "Karur Vysya Bank is a Tamil Nadu-headquartered private-sector bank offering retail, MSME and corporate banking services, primarily in southern India.",
    segments: [
      { name: "Retail & MSME banking", desc: "Deposits and lending products for retail customers and small businesses." },
      { name: "Corporate banking", desc: "Lending and banking services to corporate clients." },
    ],
    background: "Founded in 1916, Karur Vysya Bank has a long-standing presence in South India, particularly among small and medium enterprises.",
  },
  SONACOMS: {
    overview: "Sona BLW Precision Forgings is an automotive-components manufacturer specialising in precision forged and machined products, including for electric vehicles.",
    segments: [
      { name: "EV components", desc: "Motors and driveline components supplied to electric-vehicle manufacturers globally." },
      { name: "Conventional driveline products", desc: "Differential gears and other forged components for conventional vehicles." },
    ],
    background: "Sona Comstar has positioned itself as a supplier to both conventional and electric-vehicle manufacturers, with a growing share of revenue linked to global EV programmes.",
  },
  SUZLON: {
    overview: "Suzlon Energy is an Indian wind-turbine manufacturer providing turbine supply, installation and operations & maintenance services.",
    segments: [
      { name: "Wind turbine manufacturing", desc: "Design and manufacture of wind turbine generators." },
      { name: "Operations & maintenance", desc: "Long-term O&M services for installed wind assets, a recurring revenue stream." },
    ],
    background: "Founded in 1995, Suzlon became one of India's leading wind-energy companies before undergoing a significant balance-sheet restructuring in the years that followed rapid early expansion.",
  },
  NAVINFLUOR: {
    overview: "Navin Fluorine International is a specialty chemicals company manufacturing fluorochemicals, refrigerants and agrochemical intermediates.",
    segments: [
      { name: "Specialty chemicals", desc: "Fluorine-based specialty chemicals for pharmaceutical and agrochemical customers." },
      { name: "Refrigerants", desc: "Industrial and consumer refrigerant gas manufacturing." },
    ],
    background: "Part of the Arvind Mafatlal Group, Navin Fluorine has built a specialised fluorochemicals franchise serving pharmaceutical, agrochemical and industrial customers.",
  },
  TIPSFILMS: {
    overview: "Tips Industries is a music and film-content company that owns and licenses a large catalogue of Indian film and music rights.",
    segments: [
      { name: "Music licensing", desc: "Licensing of music catalogue rights across streaming, television and digital platforms." },
      { name: "Film production & distribution", desc: "Production and distribution of Hindi film content." },
    ],
    background: "Tips Industries holds one of India's older independent music catalogues, monetised increasingly through digital streaming licensing in recent years.",
  },
  SHRIRAMFIN: {
    overview: "Shriram Finance is a large non-banking financial company focused on commercial-vehicle finance, MSME lending and other retail credit products.",
    segments: [
      { name: "Commercial vehicle finance", desc: "Financing for trucks and commercial vehicles, historically the company's core business." },
      { name: "MSME & other retail lending", desc: "Business loans, gold loans and other retail lending products." },
    ],
    background: "Formed through the merger of Shriram Transport Finance and Shriram City Union Finance, the company is one of India's largest vehicle-finance-focused NBFCs.",
  },
  TATACONSUM: {
    overview: "Tata Consumer Products is a consumer-goods company with a portfolio spanning tea, coffee, salt and packaged foods.",
    segments: [
      { name: "Beverages", desc: "Tea and coffee brands including Tata Tea and Tetley, sold in India and internationally." },
      { name: "Foods", desc: "Salt (Tata Salt), spices and other packaged food products." },
    ],
    background: "Reorganised in 2020 to consolidate the Tata Group's consumer-food and beverage businesses, Tata Consumer Products has been expanding beyond its historical tea and salt franchise into wider packaged foods.",
  },
};
const SECTOR_PROFILE_CONTEXT = {
  Financials: {
    activity: "financial services",
    focus: "lending, deposits, investment products, insurance or other financial services, depending on the company’s disclosed business mix",
  },
  "Information Technology": {
    activity: "information technology",
    focus: "software, digital services, technology consulting or related products, depending on the company’s disclosed business mix",
  },
  Energy: {
    activity: "energy",
    focus: "oil, gas, fuels or related energy activities, depending on the company’s disclosed business mix",
  },
  "Consumer Staples": {
    activity: "consumer staples",
    focus: "frequently purchased food, beverage, household or personal-care products, depending on the company’s disclosed business mix",
  },
  "Consumer Discretionary": {
    activity: "consumer discretionary",
    focus: "automotive, retail, hospitality or other discretionary consumer products and services, depending on the company’s disclosed business mix",
  },
  "Health Care": {
    activity: "health care",
    focus: "pharmaceuticals, hospitals, diagnostics or other health-care products and services, depending on the company’s disclosed business mix",
  },
  Industrials: {
    activity: "industrials",
    focus: "capital goods, engineering, construction, transport or industrial services, depending on the company’s disclosed business mix",
  },
  Materials: {
    activity: "materials",
    focus: "metals, mining, chemicals, cement or related materials, depending on the company’s disclosed business mix",
  },
  Utilities: {
    activity: "utilities",
    focus: "power generation, transmission, distribution or related infrastructure, depending on the company’s disclosed business mix",
  },
  "Communication Services": {
    activity: "communication services",
    focus: "telecommunications, connectivity or related communication services, depending on the company’s disclosed business mix",
  },
  "Real Estate": {
    activity: "real estate",
    focus: "property development, leasing or related real-estate activities, depending on the company’s disclosed business mix",
  },
};

function companyProfile(ticker) {
  if (COMPANY_PROFILE[ticker]) return COMPANY_PROFILE[ticker];

  const stock = STOCKS_BY_TICKER[ticker];
  const name = stock?.name || ticker;
  const sector = stock?.sector || "Unclassified";
  const context = SECTOR_PROFILE_CONTEXT[sector] || {
    activity: "listed business operations",
    focus: "the activities described in the company’s latest exchange filings and investor disclosures",
  };

  return {
    overview: `${name} is an NSE-listed company in StockDekho’s ${sector} classification. Its detailed company-specific business description is not currently supplied by the configured market-data providers.`,
    segments: [
      {
        name: `${sector} operations`,
        desc: `The company is classified within ${context.activity}; this can include ${context.focus}. Consult its latest annual report for the company’s exact segment breakdown.`,
      },
    ],
    background: `${name} is included in StockDekho’s tracked Nifty 200 universe. Price, performance, financial, event, peer and news sections use the latest information available from StockDekho’s configured providers; unavailable fields remain blank rather than being estimated.`,
  };
}

// Demo company-news items shown on the Overview tab. Each item expands into a short editorial
// article (what happened / why / why it matters / implications) written as flowing paragraphs.
const COMPANY_NEWS = {
  RELIANCE: [
    {
      id: "rel-1", headline: "Reliance Jio crosses 500 million subscriber mark", date: "21 Jul 2026",
      teaser: "The telecom arm becomes the first Indian operator to reach the milestone, reinforcing its market-leading position.",
      body: [
        "Reliance Jio confirmed it has crossed 500 million wireless subscribers, making it the first Indian telecom operator to reach that scale and extending its lead over its two main private-sector rivals.",
        "The milestone follows several quarters of steady subscriber additions as Jio has continued to bundle broadband, streaming and telecom services, an approach that has kept churn relatively low even as the overall market has matured and tariff increases have worked through the system.",
        "For Reliance, the telecom arm is one of the group's largest sources of recurring cash flow, so subscriber scale feeds directly into the digital-services segment's revenue base and, over time, its ability to fund capital-intensive network investment without leaning as heavily on the group's other businesses.",
      ],
      source: "Economic Times",
    },
    {
      id: "rel-2", headline: "Reliance Retail opens 50th large-format store in tier-2 cities", date: "16 Jul 2026",
      teaser: "Expansion push continues into smaller cities as the retail arm looks for its next leg of store-count growth.",
      body: [
        "Reliance Retail said it has opened its 50th large-format store across tier-2 Indian cities this year, part of a broader push to extend its physical footprint beyond the metro markets where it is already well established.",
        "Tier-2 and tier-3 cities have become an increasingly important growth avenue for large Indian retailers as metro markets mature and rents rise, with rising disposable incomes in smaller cities supporting demand for organised retail formats that were previously concentrated in larger urban centres.",
        "A larger store footprint in these markets gives Reliance Retail more physical touchpoints to cross-sell across its grocery, fashion and electronics formats, which is relevant to investors tracking the segment's same-store sales growth and overall revenue mix over coming quarters.",
      ],
      source: "Mint",
    },
  ],
  TCS: [
    {
      id: "tcs-1", headline: "TCS wins multi-year cloud transformation deal with European bank", date: "20 Jul 2026",
      teaser: "New large deal adds to the order book as the company looks to sustain growth amid a cautious IT-spending environment.",
      body: [
        "TCS announced a multi-year cloud transformation engagement with a large European banking client, though the company did not disclose the exact contract value in line with its usual practice for individual deal announcements.",
        "Large deal wins of this kind matter for IT-services investors because they provide forward revenue visibility in an environment where overall discretionary technology spending by clients has been comparatively cautious, with many enterprises prioritising cost-efficiency and cloud-migration projects over new digital initiatives.",
        "Banking, financial services and insurance remains TCS's largest vertical by revenue, so a new large-scale engagement in that segment is generally read as supportive of near-term order-book momentum, though the pace of actual revenue recognition depends on how quickly the engagement ramps up.",
      ],
      source: "Business Standard",
    },
  ],
  INFY: [
    {
      id: "infy-1", headline: "Infosys trims FY27 revenue growth guidance", date: "19 Jul 2026",
      teaser: "Management cites client-specific softness in a few large accounts; leadership transition remains on track.",
      body: [
        "Infosys narrowed its FY27 constant-currency revenue growth guidance range following its latest quarterly results, with management attributing the revision primarily to softness at a small number of large client accounts rather than a broad-based demand slowdown.",
        "The company reiterated that its ongoing leadership transition remains on track and that deal-pipeline metrics, including large-deal total contract value, have held up better than the guidance revision alone might suggest, which is one reason the stock's reaction to the announcement was relatively contained.",
        "For investors, a guidance trim tied to a handful of named accounts is generally treated differently from an economy-wide pullback in technology spending — the distinction matters for how durable the growth deceleration is likely to be into the following fiscal year.",
      ],
      source: "Livemint",
    },
  ],
};
function companyNews(ticker) {
  if (COMPANY_NEWS[ticker]) return COMPANY_NEWS[ticker];
  return [];
}

/* =========================================================================================
   COMPARE PAGE
   ========================================================================================= */
function ComparePage({ compareList, toggleCompare, openCompany }) {
  const [q, setQ] = useState("");
  const [range, setRange] = useState("1Y");
  const [liveStocks, setLiveStocks] = useState([]);
  const [histories, setHistories] = useState({});
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [historyError, setHistoryError] = useState("");
  const stocks = compareList.map((t) => STOCKS_BY_TICKER[t]).filter(Boolean);
  const results = q ? RAW_STOCKS.filter((s) => (s.name.toLowerCase().includes(q.toLowerCase()) || s.ticker.toLowerCase().includes(q.toLowerCase())) && !compareList.includes(s.ticker)).slice(0, 6) : [];

  useEffect(() => {
    let cancelled = false;

    async function loadComparisonData() {
      if (compareList.length === 0) {
        setLiveStocks([]);
        setHistories({});
        setLoadError("");
        setHistoryError("");
        return;
      }

      setLoading(true);
      setLoadError("");
      setHistoryError("");

      try {
        const universe = await getStockUniverse(compareList);
        const historyResults = await Promise.allSettled(
          compareList.map(async (ticker) => {
            const history = await getPerformanceHistory(ticker, range);
            return [ticker, history];
          })
        );

        const availableHistories = historyResults
          .filter((result) => result.status === "fulfilled")
          .map((result) => result.value);

        if (!cancelled) {
          setLiveStocks(universe);
          setHistories(Object.fromEntries(availableHistories));
          if (availableHistories.length < compareList.length) {
            setHistoryError(
              availableHistories.length === 0
                ? "Historical comparison is temporarily unavailable. The live company metrics below are still available."
                : "Some historical series are temporarily unavailable. Available companies are shown below."
            );
          }
        }
      } catch (error) {
        if (!cancelled) {
          setLiveStocks([]);
          setHistories({});
          setLoadError("Unable to load live comparison data.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadComparisonData();

    return () => {
      cancelled = true;
    };
  }, [compareList, range]);

  const metrics = [
    { key: "pe", label: "P/E", fmt: (v) => (v ? fmtNum(v, 2) : "—") },
    { key: "roe", label: "ROE %", fmt: (v) => (v !== null ? fmtNum(v, 2) : "—") },
    { key: "bookValue", label: "Book Value / Share", fmt: (v) => (v !== null && v !== undefined ? `₹${fmtNum(v, 2)}` : "—") },
    { key: "de", label: "D/E", fmt: (v) => (v !== null && v !== undefined ? fmtNum(v, 2) : "—") },
    { key: "divYield", label: "Div Yield %", fmt: (v) => fmtNum(v, 2) },
    { key: "ret1y", label: "1Y Return %", fmt: (v) => fmtNum(v, 2), isMove: true },
    { key: "chgPct", label: "Today's Chg %", fmt: (v) => fmtNum(v, 2), isMove: true },
  ];
  const visibleMetrics = metrics.filter((metric) =>
    liveStocks.some((stock) => {
      const value = stock?.[metric.key];
      return value !== null && value !== undefined && Number.isFinite(Number(value));
    })
  );

  function bestWorst(key) {
    const vals = liveStocks.map((s) => s[key]).filter((v) => v !== null && v !== undefined);
    if (!vals.length) return {};
    return { max: Math.max(...vals), min: Math.min(...vals) };
  }

  return (
    <div className="sd-fade-in" style={{ padding: "22px 20px 60px", maxWidth: 1280, margin: "0 auto" }}>
      <SectionHeading eyebrow="Research workspace" title="Compare companies" />
      <p style={{ fontSize: 12.5, color: THEME.inkDim, marginTop: -8, marginBottom: 16 }}>Select 2–5 stocks. Highlighting shows relative context only — not a recommendation.</p>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        {stocks.map((s) => (
          <div key={s.ticker} style={{ display: "flex", alignItems: "center", gap: 6, background: THEME.panel, border: `1px solid ${THEME.hairline}`, borderRadius: 20, padding: "6px 10px", fontSize: 12.5 }}>
            {s.ticker} <button onClick={() => toggleCompare(s.ticker)} style={{ background: "none", border: "none", color: THEME.inkDim, cursor: "pointer", display: "flex" }}><X size={13} /></button>
          </div>
        ))}
        {stocks.length < 5 && (
          <div style={{ position: "relative" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, background: THEME.panel, border: `1px dashed ${THEME.hairline}`, borderRadius: 20, padding: "6px 10px" }}>
              <Search size={13} color={THEME.inkDim} />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Add company…" style={{ background: "none", border: "none", outline: "none", color: THEME.ink, fontSize: 12.5, width: 130 }} />
            </div>
            {results.length > 0 && (
              <div className="sd-fade-in" style={{ position: "absolute", top: 34, left: 0, width: 220, background: THEME.panelAlt, border: `1px solid ${THEME.hairline}`, borderRadius: 5, zIndex: 10 }}>
                {results.map((r) => (
                  <div key={r.ticker} className="sd-row-hover" onClick={() => { toggleCompare(r.ticker); setQ(""); }} style={{ padding: "8px 10px", cursor: "pointer", fontSize: 12.5, borderBottom: `1px solid ${THEME.hairline}` }}>
                    {r.ticker} <span style={{ color: THEME.inkDim }}>· {r.name}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {stocks.length === 0 && (
        <Panel style={{ padding: 40, textAlign: "center" }}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>Start a comparison</div>
          <div style={{ fontSize: 12.5, color: THEME.inkDim }}>Search above and add 2–5 companies to compare their performance, valuation and risk in one place.</div>
        </Panel>
      )}

      {stocks.length > 0 && (
        <>
          <Panel style={{ padding: 16, marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>Price / total return</div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <ReturnRangeSelector active={range} onSelect={setRange} />
            </div>
            {loading ? (
              <div style={{ height: 280, display: "flex", alignItems: "center", justifyContent: "center", color: THEME.inkDim, fontSize: 12 }}>
                Loading live comparison data...
              </div>
            ) : loadError ? (
              <div style={{ height: 280, display: "flex", alignItems: "center", justifyContent: "center", color: THEME.down, fontSize: 12 }}>
                {loadError}
              </div>
            ) : historyError && Object.keys(histories).length === 0 ? (
              <div style={{ height: 280, display: "flex", alignItems: "center", justifyContent: "center", color: THEME.inkDim, fontSize: 12, textAlign: "center", padding: 20 }}>
                {historyError}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <LineChart>
                  <CartesianGrid stroke={THEME.hairline} strokeDasharray="2 4" vertical={false} />
                  <XAxis dataKey="i" type="number" domain={[0, 100]} hide />
                  <YAxis tick={{ fill: THEME.inkDim, fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ background: THEME.panelAlt, border: `1px solid ${THEME.hairline}`, borderRadius: 4 }}
                    formatter={(value) => [`${fmtNum(value, 2)}%`, undefined]}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {stocks.map((s, idx) => {
                    const points = histories[s.ticker]?.points || [];
                    const firstValue = points[0]?.adjustedClose;
                    const series = points.map((point, index) => ({
                      i: points.length > 1 ? (index / (points.length - 1)) * 100 : 0,
                      [s.ticker]: Number.isFinite(firstValue) && firstValue !== 0
                        ? (point.adjustedClose / firstValue) * 100 - 100
                        : null,
                    }));
                    const colors = [THEME.gold, THEME.up, THEME.down, "#7C9CBF", "#B47EC9"];
                    return <Line key={s.ticker} data={series} type="monotone" dataKey={s.ticker} stroke={colors[idx % colors.length]} dot={false} strokeWidth={2} />;
                  })}
                </LineChart>
              </ResponsiveContainer>
            )}
            {historyError && Object.keys(histories).length > 0 && (
              <div style={{ fontSize: 11, color: THEME.inkDim, marginTop: 8 }}>{historyError}</div>
            )}
            <div style={{ fontSize: 10.5, color: THEME.inkDim, marginTop: 6 }}>Provider-supplied closing prices rebased to 0 at the selected period start.</div>
          </Panel>

          <Panel style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, minWidth: 700 }}>
              <thead><tr style={{ borderBottom: `1px solid ${THEME.hairline}` }}>
                <th style={thStyle}>Metric</th>
                {stocks.map((s) => <th key={s.ticker} style={{ ...thStyle, textAlign: "right", cursor: "pointer" }} onClick={() => openCompany(s.ticker)}>{s.ticker}</th>)}
              </tr></thead>
              <tbody>
                {visibleMetrics.map((m) => {
                  const bw = bestWorst(m.key);
                  return (
                    <tr key={m.key} style={{ borderBottom: `1px solid ${THEME.hairline}` }}>
                      <td style={tdStyle}><RowMetricLabel label={m.label} infoKey={m.key} /></td>
                      {stocks.map((s) => {
                        const liveStock = liveStocks.find((item) => item.ticker === s.ticker);
                        const v = liveStock?.[m.key];
                        const hasValue = v !== null && v !== undefined;
                        const highlight = hasValue && v === bw.max
                          ? "rgba(63,167,114,0.12)"
                          : hasValue && v === bw.min
                            ? "rgba(197,86,74,0.1)"
                            : "none";
                        return (
                          <td key={s.ticker} style={{ ...tdStyle, textAlign: "right", background: highlight }}>
                            {m.isMove && v !== null && v !== undefined ? <Move value={v} /> : m.fmt(v)}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Panel>
        </>
      )}
    </div>
  );
}

/* =========================================================================================
   CURRENCIES PAGE
   ========================================================================================= */
function formatCurrencyMarketTime(value) {
  if (!value) return "Yahoo Finance";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "Yahoo Finance";

  return `Yahoo Finance, ${date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })}`;
}

function CurrencyDetail({ currency, back }) {
  const c = currency;
  const [period, setPeriod] = useState("1Y");
  const [history, setHistory] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadHistory() {
      setHistoryLoading(true);
      setHistoryError("");

      try {
        const data = await getCurrencyHistory(c.code, period);

        if (!cancelled) {
          setHistory(data);
        }
      } catch (error) {
        if (!cancelled) {
          setHistory(null);
          setHistoryError("Unable to load live currency history.");
        }
      } finally {
        if (!cancelled) {
          setHistoryLoading(false);
        }
      }
    }

    loadHistory();

    return () => {
      cancelled = true;
    };
  }, [c.code, period]);

  const series = (history?.points || []).map((point) => point.close);
  const labels = (history?.points || []).map((point) =>
    new Date(`${point.date}T00:00:00`).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: (history?.points || []).length > 400 ? "2-digit" : undefined,
    })
  );
  const precision = c.code === "JPY" ? 3 : 2;

  return (
    <div className="sd-fade-in" style={{ padding: "22px 20px 60px", maxWidth: 1280, margin: "0 auto" }}>
      <button onClick={back} style={{ background: "none", border: "none", color: THEME.gold, cursor: "pointer", fontSize: 12.5, display: "flex", alignItems: "center", gap: 4, marginBottom: 10 }}>
        <ChevronLeft size={14} /> Back to Global
      </button>
      <SectionHeading eyebrow="Reference rate" title={`${c.code}/INR`} />
      <div className="sd-grid-2" style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }}>
        <Panel style={{ padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div>
              <div className="sd-mono" style={{ fontSize: 24 }}>
                {Number.isFinite(c.rate) ? `₹${fmtNum(c.rate, precision)}` : "—"}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                <span style={{ fontSize: 10.5, color: THEME.inkDim }}>Daily</span>
                {Number.isFinite(c.chgPct) ? <Move value={c.chgPct} size={12.5} /> : "—"}
              </div>
            </div>
            <LiveTag live statusLabel={hasFreshCurrencyQuote(c) ? "Live" : "EOD"} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <ReturnRangeSelector active={period} onSelect={setPeriod} />
          </div>
          {historyLoading ? (
            <div style={{ height: 240, display: "flex", alignItems: "center", justifyContent: "center", color: THEME.inkDim, fontSize: 12 }}>
              Loading live currency history...
            </div>
          ) : historyError ? (
            <div style={{ height: 240, display: "flex", alignItems: "center", justifyContent: "center", color: THEME.down, fontSize: 12 }}>
              {historyError}
            </div>
          ) : (
            <PriceChart series={series} labels={labels} height={240} />
          )}
          <div style={{ fontSize: 10.5, color: THEME.inkDim, marginTop: 6 }}>
            Historical reference-rate series supplied by Yahoo Finance. Not a live tradable quote.
          </div>
        </Panel>
        <Panel style={{ padding: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Key statistics</div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${THEME.hairline}`, fontSize: 12.5 }}>
            <span style={{ color: THEME.inkDim }}>{period} performance</span>
            {Number.isFinite(history?.returnPercent) ? <Move value={history.returnPercent} /> : <span>—</span>}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${THEME.hairline}`, fontSize: 12.5 }}>
            <span style={{ color: THEME.inkDim }}>Latest change</span>
            {Number.isFinite(c.chgPct) ? <Move value={c.chgPct} /> : <span>—</span>}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${THEME.hairline}`, fontSize: 12.5 }}>
            <span style={{ color: THEME.inkDim }}>52W range</span>
            <span className="sd-mono">
              {Number.isFinite(c.low52) && Number.isFinite(c.high52)
                ? `₹${fmtNum(c.low52, precision)}–₹${fmtNum(c.high52, precision)}`
                : "—"}
            </span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 12.5 }}>
            <span style={{ color: THEME.inkDim }}>Source</span>
            <span style={{ textAlign: "right" }}>{c.sourceDate}</span>
          </div>
        </Panel>
      </div>
    </div>
  );
}

function GlobalIndexDetailPage({ indexKey, back }) {
  const [range, setRange] = useState("1Y");
  const [data, setData] = useState(null);
  const [news, setNews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    getGlobalIndexDetail(indexKey, range)
      .then((result) => { if (!cancelled) setData(result); })
      .catch(() => { if (!cancelled) { setData(null); setError("This index is currently unavailable from the market-data providers."); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [indexKey, range]);

  useEffect(() => {
    let cancelled = false;
    getGlobalIndexNews(indexKey)
      .then((result) => { if (!cancelled) setNews(result.articles || []); })
      .catch(() => { if (!cancelled) setNews([]); });
    return () => { cancelled = true; };
  }, [indexKey]);

  const series = (data?.points || []).map((point) => point.adjustedClose);
  const labels = (data?.points || []).map((point) => new Date(`${point.date}T00:00:00`).toLocaleDateString("en-IN", {
    day: "2-digit", month: "short", year: series.length > 400 ? "2-digit" : undefined,
  }));

  return (
    <div className="sd-fade-in" style={{ padding: "22px 20px 70px", maxWidth: 1280, margin: "0 auto" }}>
      <button onClick={back} style={{ background: "none", border: "none", color: THEME.gold, cursor: "pointer", fontSize: 12.5, display: "flex", alignItems: "center", gap: 4, marginBottom: 10 }}>
        <ChevronLeft size={14} /> Back to Global
      </button>
      <Panel style={{ padding: 20, marginBottom: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div style={{ maxWidth: 760 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <h1 className="sd-serif" style={{ fontSize: 24, margin: 0 }}>{data?.name || "Global index"}</h1>
              {data && <LiveTag live statusLabel={quoteStatusLabel(data)} />}
            </div>
            <p style={{ fontSize: 12.5, color: THEME.creamDim, lineHeight: 1.55 }}>{data?.description || "Global equity-market benchmark."}</p>
            <div style={{ fontSize: 11, color: THEME.inkDim }}>{data ? `${marketProviderLabel(data.dataProvider)} market data · ${data.sessionDateOnly ? `Latest session ${new Date(`${data.asOf}T00:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}` : `As of ${formatMarketAsOf(data.asOf || data.marketTime)}`}` : "Loading market source..."}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div className="sd-mono" style={{ fontSize: 28 }}>{Number.isFinite(data?.value) ? fmtNum(data.value, 2) : "—"}</div>
            {Number.isFinite(data?.changePercent) && <Move value={data.changePercent} size={14} />}
          </div>
        </div>
      </Panel>
      <div style={{ marginBottom: 12 }}><ReturnRangeSelector active={range} onSelect={setRange} /></div>
      <Panel style={{ padding: 16 }}>
        {loading ? <div style={{ height: 320, display: "grid", placeItems: "center", color: THEME.inkDim }}>Loading historical index data...</div>
          : error ? <div style={{ height: 320, display: "grid", placeItems: "center", color: THEME.down }}>{error}</div>
          : <PriceChart series={series} labels={labels} height={320} color={THEME.gold} />}
      </Panel>
      <div className="sd-grid-4" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginTop: 14 }}>
        {[[`${range} performance`, data?.periodReturn, null], ["Today's change", data?.changePercent, null], ["Period high", null, data?.periodHigh], ["Period low", null, data?.periodLow]].map(([label, move, value]) => (
          <Panel key={label} style={{ padding: 12 }}><div style={{ fontSize: 10.5, color: THEME.inkDim }}>{label}</div><div className="sd-mono" style={{ fontSize: 15, marginTop: 4 }}>{Number.isFinite(move) ? <Move value={move} size={14} /> : Number.isFinite(value) ? fmtNum(value, 2) : "—"}</div></Panel>
        ))}
      </div>
      <div style={{ marginTop: 40 }}><SectionHeading title="Index News" /></div>
      <p style={{ fontSize: 11.5, color: THEME.inkDim, marginTop: -8, marginBottom: 12 }}>Reporting from the last 15 days that explicitly relates to this index.</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {news.map((article) => <WideNewsTile key={article.id || article.link} article={article} href={article.link} />)}
        {!news.length && <Panel style={{ padding: 20, color: THEME.inkDim, textAlign: "center" }}>No sufficiently relevant reporting is currently available from the last 15 days.</Panel>}
      </div>
    </div>
  );
}

function CurrenciesPage() {
  const [activeCode, setActiveCode] = useState(null);
  const [activeGlobalIndex, setActiveGlobalIndex] = useState(null);
  const [globalIndices, setGlobalIndices] = useState([]);
  const [globalIndicesLoading, setGlobalIndicesLoading] = useState(true);
  const [globalIndicesError, setGlobalIndicesError] = useState("");
  const [globalRegion, setGlobalRegion] = useState("All Regions");
  const [newsOpen, setNewsOpen] = useState(null);
  const [currencyData, setCurrencyData] = useState([]);
  const [currenciesLoading, setCurrenciesLoading] = useState(true);
  const [currenciesError, setCurrenciesError] = useState("");
  const [globalNewsData, setGlobalNewsData] = useState([]);
  const [globalNewsLoading, setGlobalNewsLoading] = useState(true);
  const [globalNewsError, setGlobalNewsError] = useState("");
  const [globalNewsPage, setGlobalNewsPage] = useState(1);

  useEffect(() => {
    let cancelled = false;
    getGlobalIndices()
      .then((result) => { if (!cancelled) setGlobalIndices(result); })
      .catch(() => { if (!cancelled) { setGlobalIndices([]); setGlobalIndicesError("Global index data is currently unavailable."); } })
      .finally(() => { if (!cancelled) setGlobalIndicesLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadCurrencies() {
      setCurrenciesLoading(true);
      setCurrenciesError("");

      try {
        const data = await getCurrencies();

        if (!cancelled) {
          setCurrencyData(data);
        }
      } catch (error) {
        if (!cancelled) {
          setCurrencyData([]);
          setCurrenciesError("Unable to load live currency data.");
        }
      } finally {
        if (!cancelled) {
          setCurrenciesLoading(false);
        }
      }
    }

    loadCurrencies();
    const refreshTimer = window.setInterval(loadCurrencies, 2 * 60 * 1000);

    return () => {
      cancelled = true;
      window.clearInterval(refreshTimer);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadGlobalNews() {
      setGlobalNewsLoading(true);
      setGlobalNewsError("");

      try {
        const data = await getGlobalMarketNews();

        if (!cancelled) {
          setGlobalNewsData(data.articles || []);
          setGlobalNewsPage(1);
        }
      } catch (error) {
        if (!cancelled) {
          setGlobalNewsData([]);
          setGlobalNewsError("Unable to load current global market news.");
        }
      } finally {
        if (!cancelled) {
          setGlobalNewsLoading(false);
        }
      }
    }

    loadGlobalNews();

    return () => {
      cancelled = true;
    };
  }, []);

  const currencies = CURRENCIES.map((definition) => {
    const live = currencyData.find((item) => item.code === definition.code);

    return {
      code: definition.code,
      name: definition.name,
      rate: live?.rate ?? null,
      chgPct: live?.changePercent ?? null,
      low52: live?.fiftyTwoWeekLow ?? null,
      high52: live?.fiftyTwoWeekHigh ?? null,
      spark: live?.sparkline || [],
      marketTime: live?.marketTime || null,
      sourceDate: formatCurrencyMarketTime(live?.marketTime),
    };
  });
const globalMarketNews = globalNewsData.map((article) => ({
  id: article.id,
  topic: article.topic,
  title: article.title,

  date: formatNewsDate(
    article.publishedAt
  ),

  teaser: article.summary,
  body: article.summary,
  source: article.source,
  link: article.link,
}));
  const globalNewsPerPage = 8;
  const globalNewsTotalPages = Math.max(
    1,
    Math.min(4, Math.ceil(globalMarketNews.length / globalNewsPerPage))
  );
  const paginatedGlobalMarketNews = globalMarketNews.slice(
    (globalNewsPage - 1) * globalNewsPerPage,
    globalNewsPage * globalNewsPerPage
  );
  const active = currencies.find((currency) => currency.code === activeCode);
  const visibleGlobalIndices = globalRegion === "All Regions" ? globalIndices : globalIndices.filter((index) => index.region === globalRegion);

  if (active) return <CurrencyDetail currency={active} back={() => setActiveCode(null)} />;
  if (activeGlobalIndex) return <GlobalIndexDetailPage indexKey={activeGlobalIndex} back={() => setActiveGlobalIndex(null)} />;

  return (
    <div className="sd-fade-in" style={{ padding: "22px 20px 60px", maxWidth: 1280, margin: "0 auto" }}>
      <SectionHeading eyebrow="Global" title="Global Indices" action={
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11.5, color: THEME.inkDim, transform: "translateY(24px)" }}>
          Filter by Region
          <select value={globalRegion} onChange={(event) => setGlobalRegion(event.target.value)} style={{ background: THEME.panel, border: `1px solid ${THEME.hairline}`, color: THEME.creamDim, borderRadius: 4, padding: "6px 8px", fontSize: 11.5 }}>
            {["All Regions", "Americas", "EMEA", "APAC"].map((region) => <option key={region}>{region}</option>)}
          </select>
        </label>
      } />
      <div className="sd-scroll" style={{ display: "flex", gap: 14, marginBottom: 32, overflowX: "auto", paddingBottom: 8 }}>
        {globalIndicesLoading && <Panel style={{ padding: 24, color: THEME.inkDim }}>Loading global indices...</Panel>}
        {!globalIndicesLoading && globalIndicesError && <Panel style={{ padding: 24, color: THEME.down }}>{globalIndicesError}</Panel>}
        {!globalIndicesLoading && !globalIndicesError && visibleGlobalIndices.map((index) => <IndexCard key={index.key} idx={index} onOpen={setActiveGlobalIndex} />)}
      </div>

      <SectionHeading title="INR reference rates" />
      <p style={{ fontSize: 12.5, color: THEME.inkDim, marginTop: -8, marginBottom: 16 }}>
        Latest available Yahoo Finance reference rates. Not live tradable FX quotes. Shown for research context, not currency forecasting.
      </p>
      <div className="sd-scroll" style={{ display: "flex", gap: 14, marginBottom: 32, overflowX: "auto", paddingBottom: 8 }}>
        {currenciesLoading && (
          <Panel style={{ padding: 24, color: THEME.inkDim, gridColumn: "1 / -1" }}>
            Loading live currency data...
          </Panel>
        )}
        {!currenciesLoading && currenciesError && (
          <Panel style={{ padding: 24, color: THEME.down, gridColumn: "1 / -1" }}>
            {currenciesError}
          </Panel>
        )}
        {!currenciesLoading && !currenciesError && currencies.map((c) => (
          <Panel key={c.code} onClick={() => setActiveCode(c.code)} className="sd-row-hover" style={{ padding: 14, cursor: "pointer", width: 220, minWidth: 220, flexShrink: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <div style={{ fontWeight: 700, fontSize: 13.5 }}>{c.code}/INR</div>
              <LiveTag live small statusLabel={hasFreshCurrencyQuote(c) ? "Live" : "EOD"} />
            </div>
            <div style={{ fontSize: 11, color: THEME.inkDim }}>{c.name}</div>
            <div className="sd-mono" style={{ fontSize: 20, marginTop: 6 }}>
              {Number.isFinite(c.rate) ? `₹${fmtNum(c.rate, c.code === "JPY" ? 3 : 2)}` : "—"}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 1, marginBottom: 8 }}>
              <span style={{ fontSize: 10.5, color: THEME.inkDim }}>Daily</span>
              {Number.isFinite(c.chgPct) ? <Move value={c.chgPct} /> : <span>—</span>}
            </div>
            {c.spark.length > 1 && <Sparkline data={c.spark} width={140} height={30} />}
            <div style={{ fontSize: 10, color: THEME.inkDim, marginTop: 4 }}>
              {Number.isFinite(c.low52) && Number.isFinite(c.high52)
                ? `1M daily trend · 52W ₹${fmtNum(c.low52, c.code === "JPY" ? 3 : 2)}–₹${fmtNum(c.high52, c.code === "JPY" ? 3 : 2)} · ${c.sourceDate}`
                : `1M daily trend · ${c.sourceDate}`}
            </div>
          </Panel>
        ))}
      </div>

      <SectionHeading title="Global Markets" />
      <p style={{ fontSize: 11.5, color: THEME.inkDim, marginTop: -8, marginBottom: 12, maxWidth: 780 }}>
        Key developments shaping global markets across energy, technology, monetary policy, trade and commodities.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
        {globalNewsLoading && (
          <Panel style={{ padding: 20, color: THEME.inkDim }}>
            Loading current global market news...
          </Panel>
        )}
        {!globalNewsLoading && globalNewsError && (
          <Panel style={{ padding: 20, color: THEME.down }}>
            {globalNewsError}
          </Panel>
        )}
        {!globalNewsLoading && !globalNewsError && globalMarketNews.length === 0 && (
          <Panel style={{ padding: 20, color: THEME.inkDim }}>
            No trusted-source global market articles are available for the last 14 days.
          </Panel>
        )}
        {!globalNewsLoading && !globalNewsError && paginatedGlobalMarketNews.map((n) => <WideNewsTile key={n.id} article={n} onClick={() => setNewsOpen(n)} />)}
      </div>
      {!globalNewsLoading && !globalNewsError && globalMarketNews.length > 0 && (
        <div style={{ display: "flex", justifyContent: "center", gap: 10, marginTop: -4, marginBottom: 24, alignItems: "center" }}>
          <button
            disabled={globalNewsPage === 1}
            onClick={() => setGlobalNewsPage((page) => Math.max(1, page - 1))}
            style={pagerBtn(globalNewsPage === 1)}
            aria-label="Previous global news page"
          >
            <ChevronLeft size={14} />
          </button>
          <span style={{ fontSize: 12, color: THEME.inkDim }}>
            Page {globalNewsPage} of {globalNewsTotalPages}
          </span>
          <button
            disabled={globalNewsPage === globalNewsTotalPages}
            onClick={() =>
              setGlobalNewsPage((page) =>
                Math.min(globalNewsTotalPages, page + 1)
              )
            }
            style={pagerBtn(globalNewsPage === globalNewsTotalPages)}
            aria-label="Next global news page"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      )}

      {newsOpen && (
        <div onClick={() => setNewsOpen(null)} style={{ position: "fixed", inset: 0, background: "rgba(5,8,14,0.65)", zIndex: 60, display: "flex", justifyContent: "flex-end" }}>
          <div onClick={(e) => e.stopPropagation()} className="sd-fade-in sd-scroll" style={{ width: 480, maxWidth: "94vw", height: "100%", background: THEME.navyDeep, borderLeft: `1px solid ${THEME.hairline}`, padding: "28px 30px", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <span style={{ fontSize: 11, color: THEME.gold, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6 }}>Global Markets{newsOpen.topic ? ` · ${newsOpen.topic}` : ""}</span>
              <button onClick={() => setNewsOpen(null)} style={{ background: "none", border: "none", color: THEME.inkDim, cursor: "pointer" }}><X size={18} /></button>
            </div>
            <h3 className="sd-serif" style={{ fontSize: 24, margin: "12px 0 8px", lineHeight: 1.3 }}>{newsOpen.title}</h3>
            <div style={{ fontSize: 12, color: THEME.inkDim, marginBottom: 16 }}>{newsOpen.date}</div>
            <p style={{ fontSize: 14, lineHeight: 1.6, color: THEME.creamDim, fontStyle: "italic", borderLeft: `2px solid ${THEME.goldSoft}`, paddingLeft: 12, marginBottom: 18 }}>{newsOpen.teaser}</p>
            <p style={{ fontSize: 13.5, lineHeight: 1.7, color: THEME.creamDim, marginBottom: 18 }}>{newsOpen.body}</p>
            {newsOpen.source && (
              <div style={{ fontSize: 12, color: THEME.inkDim, marginBottom: 20, borderTop: `1px solid ${THEME.hairline}`, paddingTop: 12 }}>
                <span style={{ textTransform: "uppercase", letterSpacing: 0.5, fontSize: 10.5, color: THEME.gold, display: "block", marginBottom: 3 }}>Source</span>
                {newsOpen.source}
              </div>
            )}
            {newsOpen.link && (
              <a href={newsOpen.link} target="_blank" rel="noopener noreferrer" style={{
                display: "inline-flex", alignItems: "center", marginTop: 4, padding: "10px 14px",
                borderRadius: 4, background: THEME.gold, color: THEME.navyDeep,
                fontSize: 12.5, fontWeight: 700, textDecoration: "none",
              }}>
                Read original article →
              </a>
            )}
            {newsOpen.currencies && (
              <>
                <div style={{ fontSize: 11.5, textTransform: "uppercase", letterSpacing: 0.5, color: THEME.gold, marginBottom: 8 }}>Currencies affected</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {newsOpen.currencies.map((code) => (
                    <button key={code} onClick={() => { setNewsOpen(null); setActiveCode(code); }} style={{
                      border: `1px solid ${THEME.hairline}`, background: "none", color: THEME.creamDim, borderRadius: 4, padding: "5px 10px", fontSize: 12, cursor: "pointer",
                    }}>{code}/INR</button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <div style={{ fontSize: 11, color: THEME.inkDim, marginTop: 14, lineHeight: 1.5, maxWidth: 780 }}>
        Educational context: currency levels reflect trade flows, interest-rate differentials and capital flows between
        India and the relevant economy. This page does not forecast future currency movements.
      </div>
    </div>
  );
}

/* =========================================================================================
   SEARCH RESULTS PAGE
   ========================================================================================= */
const SEARCH_TOPIC_TICKERS = {
  "global markets": [], "united states": [], china: [], "hong kong": [], japan: [], "south korea": [], taiwan: [], europe: [], "united kingdom": [], germany: [],
  "artificial intelligence": ["TCS", "INFY", "HCLTECH", "TECHM", "PERSISTENT", "TATAELXSI", "DIXON"],
  semiconductors: ["DIXON", "CGPOWER", "TATAELXSI", "BEL"],
  defence: ["HAL", "BEL", "BDL", "MAZDOCK", "COCHINSHIP", "SOLARINDS"],
  banking: ["HDFCBANK", "ICICIBANK", "SBIN", "AXISBANK", "KOTAKBANK", "BANKBARODA", "PNB"],
  insurance: ["HDFCLIFE", "SBILIFE", "ICICIGI", "POLICYBZR"],
  nbfc: ["BAJFINANCE", "SHRIRAMFIN", "CHOLAFIN", "MUTHOOTFIN", "M&MFIN", "LTF"],
  fintech: ["PAYTM", "JIOFIN", "POLICYBZR", "GROWW", "SBICARD"],
  "asset management": ["HDFCAMC", "ICICIAMC", "360ONE", "MOTILALOFS"],
  "stock exchanges": ["BSE", "MCX"],
  automobiles: ["MARUTI", "M&M", "HYUNDAI", "TMCV", "TMPV", "BAJAJ-AUTO", "TVSMOTOR", "EICHERMOT", "ASHOKLEY"],
  "electric vehicles": ["M&M", "TMPV", "TVSMOTOR", "BAJAJ-AUTO", "EXIDEIND"],
  telecom: ["BHARTIARTL", "IDEA", "INDUSTOWER", "TATACOMM"],
  "it services": ["TCS", "INFY", "HCLTECH", "WIPRO", "TECHM", "COFORGE", "LTM", "MPHASIS", "PERSISTENT"],
  railways: ["IRCTC", "IRFC", "RVNL", "CONCOR"], aviation: ["INDIGO", "GMRAIRPORT"],
  ports: ["ADANIPORTS", "CONCOR"], logistics: ["ADANIPORTS", "CONCOR"],
  power: ["NTPC", "POWERGRID", "TATAPOWER", "ADANIPOWER", "JSWENERGY", "NHPC"],
  "renewable energy": ["SUZLON", "ADANIGREEN", "TATAPOWER", "NTPC", "IREDA", "PREMIERENE", "WAAREEENER"],
  "oil and gas": ["RELIANCE", "ONGC", "OIL", "IOC", "BPCL", "HINDPETRO", "GAIL", "ATGL"],
  metals: ["TATASTEEL", "JSWSTEEL", "HINDALCO", "VEDL", "HINDZINC", "SAIL", "NMDC", "NATIONALUM"],
  cement: ["ULTRACEMCO", "AMBUJACEM", "SHREECEM", "GRASIM"],
  chemicals: ["PIDILITIND", "SRF", "PIIND", "UPL", "COROMANDEL"],
  pharmaceuticals: ["SUNPHARMA", "DRREDDY", "CIPLA", "DIVISLAB", "LUPIN", "AUROPHARMA", "ZYDUSLIFE", "ALKEM"],
  hospitals: ["APOLLOHOSP", "MAXHEALTH", "FORTIS"],
  fmcg: ["HINDUNILVR", "ITC", "NESTLEIND", "BRITANNIA", "DABUR", "MARICO", "GODREJCP", "COLPAL"],
  retail: ["DMART", "TRENT", "NYKAA", "VMM", "LENSKART", "ETERNAL", "SWIGGY"], hotels: ["INDHOTEL"],
  "real estate": ["DLF", "LODHA", "GODREJPROP", "OBEROIRLTY", "PHOENIXLTD", "PRESTIGE"],
  "consumer electronics": ["DIXON", "VOLTAS", "BLUESTARCO", "HAVELLS", "LGEINDIA"],
  jewellery: ["TITAN", "KALYANKJIL"], "food delivery": ["ETERNAL", "SWIGGY", "JUBLFOOD"],
};

const SEARCH_TOPIC_ALIASES = {
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
  telecommunications: "telecom", it: "it services", technology: "it services", software: "it services",
  railway: "railways", airport: "aviation", airports: "aviation", port: "ports",
  utilities: "power", renewable: "renewable energy", renewables: "renewable energy", "clean energy": "renewable energy",
  oil: "oil and gas", gas: "oil and gas", metal: "metals", steel: "metals",
  chemical: "chemicals", pharma: "pharmaceuticals", pharmaceutical: "pharmaceuticals",
  healthcare: "hospitals", hospital: "hospitals", "consumer staples": "fmcg",
  property: "real estate", electronics: "consumer electronics", jewelry: "jewellery",
};

function SearchResultsPage({ searchTerm, openCompany }) {
  const [stocks, setStocks] = useState([]);
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const normalized = searchTerm.trim().toLowerCase();
  const canonicalTopic = SEARCH_TOPIC_ALIASES[normalized] || normalized;
  const globalTopicTerms = {
    "global markets": ["global", "world markets"],
    "united states": ["united states", "u.s.", "us stocks", "wall street", "s&p 500", "nasdaq", "dow jones"],
    china: ["china", "chinese stocks", "csi 300", "shanghai composite"],
    "hong kong": ["hong kong", "hang seng"], japan: ["japan", "nikkei"],
    "south korea": ["south korea", "korean stocks", "kospi"], taiwan: ["taiwan", "taiex", "taiwan weighted"],
    europe: ["europe", "european stocks", "euro stoxx"], "united kingdom": ["united kingdom", "uk stocks", "ftse"], germany: ["germany", "german stocks", "dax"],
  };

  const matchingDefinitions = useMemo(() => {
    if (!normalized) return [];
    const aliases = new Set(SEARCH_TOPIC_TICKERS[canonicalTopic] || []);
    return RAW_STOCKS.filter((stock) =>
      aliases.has(stock.ticker) ||
      [stock.ticker, stock.name, stock.sector, stock.industry, stock.description]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalized)
    ).slice(0, 20);
  }, [normalized, canonicalTopic]);

  useEffect(() => {
    let cancelled = false;
    async function loadResults() {
      setLoading(true);
      const companyNewsResults = await Promise.allSettled(
        matchingDefinitions.slice(0, 4).map((stock) => getCompanyNews(stock.ticker))
      );
      const [stockResult, globalResult, marketResult] = await Promise.allSettled([
        matchingDefinitions.length
          ? getStockUniverse(matchingDefinitions.map((stock) => stock.ticker))
          : Promise.resolve([]),
        getGlobalMarketNews(),
        getNiftyMarketEvents(),
      ]);
      if (cancelled) return;
      setStocks(stockResult.status === "fulfilled" ? stockResult.value : matchingDefinitions);
      const combined = [
        ...(globalResult.status === "fulfilled" ? globalResult.value?.articles || [] : []),
        ...(marketResult.status === "fulfilled" ? marketResult.value?.articles || [] : []),
        ...companyNewsResults.flatMap((result) => result.status === "fulfilled" ? result.value?.articles || [] : []),
      ];
      const topicTerms = new Set([
        normalized,
        canonicalTopic,
        ...Object.entries(SEARCH_TOPIC_ALIASES)
          .filter(([, topic]) => topic === canonicalTopic)
          .map(([alias]) => alias),
        ...(globalTopicTerms[canonicalTopic] || []),
        ...matchingDefinitions.flatMap((stock) => [stock.ticker.toLowerCase(), stock.name?.toLowerCase()]).filter(Boolean),
      ]);
      const seen = new Set();
      setArticles(combined.filter((article) => {
        const haystack = [article.title, article.topic, article.teaser, article.body, article.summary]
          .filter(Boolean).join(" ").toLowerCase();
        const key = article.link || article.url || article.title;
        if (![...topicTerms].some((term) => term && haystack.includes(term)) || seen.has(key)) return false;
        seen.add(key);
        return true;
      }).slice(0, 15));
      setLoading(false);
    }
    loadResults();
    return () => { cancelled = true; };
  }, [normalized, matchingDefinitions]);

  return (
    <div className="sd-fade-in" style={{ padding: "22px 20px 60px", maxWidth: 1280, margin: "0 auto", width: "100%" }}>
      <SectionHeading eyebrow="Search" title={`Results for “${searchTerm}”`} />
      <SectionHeading title="Relevant Stocks" />
      {loading && <div style={{ color: THEME.inkDim, fontSize: 12 }}>Loading relevant companies…</div>}
      {!loading && stocks.length === 0 && <Panel style={{ padding: 18, color: THEME.inkDim, fontSize: 12.5 }}>No tracked companies directly match this topic.</Panel>}
      {stocks.length > 0 && (
        <div className="sd-scroll" style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 10, marginBottom: 24 }}>
          {stocks.map((stock) => {
            const definition = RAW_STOCKS.find((item) => item.ticker === stock.ticker) || stock;
            return (
              <Panel key={stock.ticker} onClick={() => openCompany(stock.ticker)} style={{ minWidth: 235, padding: 16, cursor: "pointer" }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: THEME.cream }}>{definition.name || stock.name}</div>
                <div style={{ fontSize: 11, color: THEME.inkDim, margin: "4px 0 12px" }}>{stock.ticker} · {definition.sector}</div>
                {Number.isFinite(stock.price) && <div className="sd-mono" style={{ fontSize: 18 }}>₹{fmtNum(stock.price)}</div>}
                {Number.isFinite(stock.chgPct) && <Move value={stock.chgPct} size={12} />}
              </Panel>
            );
          })}
        </div>
      )}

      <SectionHeading title={`Relevant topics related to ${searchTerm}`} />
      {!loading && articles.length === 0 && <Panel style={{ padding: 18, color: THEME.inkDim, fontSize: 12.5 }}>No current matching articles are available.</Panel>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
        {articles.map((article, index) => (
          <Panel key={article.link || article.url || `${article.title}-${index}`} style={{ padding: 16 }}>
            <div style={{ color: THEME.gold, fontSize: 10.5, textTransform: "uppercase", fontWeight: 700, marginBottom: 6 }}>{article.topic || "Market"}</div>
            <div style={{ fontSize: 13.5, fontWeight: 700, lineHeight: 1.35, marginBottom: 7 }}>{article.title}</div>
            <div style={{ color: THEME.inkDim, fontSize: 11, marginBottom: 8 }}>{formatNewsDate(article.publishedAt || article.date)}</div>
            <div style={{ color: THEME.creamDim, fontSize: 12, lineHeight: 1.45 }}>{article.teaser || article.summary || "Open the original report for full details."}</div>
            {(article.link || article.url) && <a href={article.link || article.url} target="_blank" rel="noopener noreferrer" style={{ display: "inline-block", color: THEME.gold, fontSize: 11.5, marginTop: 10 }}>Read original article →</a>}
          </Panel>
        ))}
      </div>
    </div>
  );
}

/* =========================================================================================
   WATCHLIST PAGE
   ========================================================================================= */
function WatchlistPage({ watchlist, toggleWatch, openCompany, setPage }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadWatchlist() {
      if (watchlist.length === 0) {
        setRows([]);
        setLoadError("");
        return;
      }

      setLoading(true);
      setLoadError("");

      try {
        const data = await getStockUniverse(watchlist);
        const detailResults = await Promise.allSettled(
          data.map((stock) => getStockQuote(stock.ticker))
        );
        const detailedByTicker = new Map(
          detailResults
            .map((result, index) => [data[index]?.ticker, result])
            .filter(([ticker, result]) => ticker && result.status === "fulfilled")
            .map(([ticker, result]) => [ticker, result.value])
        );
        const enriched = data.map((stock) => {
          const detail = detailedByTicker.get(stock.ticker);
          const definition = STOCKS_BY_TICKER[stock.ticker];
          const calculatedRoe = Number.isFinite(detail?.trailingEps) && Number.isFinite(detail?.bookValue) && detail.bookValue !== 0
            ? (detail.trailingEps / detail.bookValue) * 100
            : null;
          return {
            ...stock,
            roe: detail?.returnOnEquity ?? calculatedRoe ?? stock.roe ?? definition?.roe ?? null,
            de: detail?.debtToEquity ?? stock.de ?? definition?.de ?? null,
            ret1y: detail?.oneYearReturn ?? stock.ret1y,
          };
        });
        if (!cancelled) setRows(enriched);
      } catch (error) {
        if (!cancelled) {
          setRows([]);
          setLoadError("Unable to load live watchlist data.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadWatchlist();

    return () => {
      cancelled = true;
    };
  }, [watchlist]);

  return (
    <div className="sd-fade-in" style={{ padding: "22px 20px 60px", maxWidth: 1280, margin: "0 auto" }}>
      <SectionHeading eyebrow="Research workspace" title="Watchlist" />
      <Panel style={{ padding: 18, marginBottom: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>Your Watchlist</div>
        <div style={{ fontSize: 12.5, color: THEME.inkDim }}>
          Save companies you're researching so you can monitor them in one place and quickly return later.
        </div>
      </Panel>
      {watchlist.length === 0 ? (
        <Panel style={{ padding: 50, textAlign: "center" }}>
          <Star size={26} color={THEME.gold} style={{ marginBottom: 10 }} />
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>Build your watchlist</div>
          <div style={{ fontSize: 12.5, color: THEME.inkDim, marginBottom: 14 }}>Select the star beside any company to save it here for quick access.</div>
          <button onClick={() => setPage("stocks")} style={{ background: THEME.gold, color: THEME.navyDeep, border: "none", borderRadius: 4, padding: "8px 16px", fontWeight: 700, cursor: "pointer" }}>Browse All NSE Stocks</button>
        </Panel>
      ) : loading ? (
        <Panel style={{ padding: 50, textAlign: "center", color: THEME.inkDim }}>
          Loading live watchlist data...
        </Panel>
      ) : loadError ? (
        <Panel style={{ padding: 50, textAlign: "center", color: THEME.down }}>
          {loadError}
        </Panel>
      ) : (
        <Panel style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, minWidth: 1080 }}>
            <thead><tr style={{ borderBottom: `1px solid ${THEME.hairline}` }}>
              <th style={thStyle}></th><th style={thStyle}>Company</th><th style={thStyle}>Price</th><th style={thStyle}>Chg%</th><th style={thStyle}>1Y Return</th><th style={thStyle}>Market Cap</th><th style={thStyle}>P/E</th><th style={thStyle}>ROE%</th><th style={thStyle}>D/E</th><th style={thStyle}>Div Yield%</th>
            </tr></thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.ticker} className="sd-row-hover" style={{ borderBottom: `1px solid ${THEME.hairline}` }}>
                  <td style={tdStyle}><button onClick={() => toggleWatch(s.ticker)} style={{ background: "none", border: "none", color: THEME.down, cursor: "pointer" }}><X size={13} /></button></td>
                  <td style={tdStyle} onClick={() => openCompany(s.ticker)}><span style={{ cursor: "pointer", fontWeight: 600 }}>{s.name}</span> <span style={{ color: THEME.inkDim }}>· {s.ticker}</span></td>
                  <td style={tdStyle} className="sd-mono">₹{fmtNum(s.price)}</td>
                  <td style={tdStyle}>{s.chgPct !== null ? <Move value={s.chgPct} /> : "—"}</td>
                  <td style={tdStyle}>{s.ret1y !== null ? <Move value={s.ret1y} /> : "—"}</td>
                  <td style={tdStyle} className="sd-mono">{fmtCr(s.mcap)}</td>
                  <td style={tdStyle} className="sd-mono">{s.pe ? fmtNum(s.pe, 1) : "—"}</td>
                  <td style={tdStyle} className="sd-mono">{s.roe !== null ? fmtNum(s.roe, 1) : "—"}</td>
                  <td style={tdStyle} className="sd-mono">{s.de !== null ? fmtNum(s.de, 2) : "—"}</td>
                  <td style={tdStyle} className="sd-mono">{s.divYield !== null ? `${fmtNum(s.divYield, 2)}%` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}
    </div>
  );
}

/* =========================================================================================
   FOOTER
   ========================================================================================= */
function Footer() {
  const [drawer, setDrawer] = useState(null);
  const links = ["Data sources", "Methodology", "Metric definitions", "Risk disclosures", "Corporate-action treatment", "End-of-day data timing"];
  const content = {
    "Data sources": "Indian equity and index quotes and historical series are retrieved primarily through Upstox and cached by StockDekho, with Yahoo Finance retained as a fallback and for selected fundamentals and events. Currency reference rates use Yahoo Finance. News is aggregated from configured news providers and filtered for relevance.",
    Methodology: "Returns, drawdown, volatility and beta are calculated from the available daily historical series. Comparisons provide research context only and are not certified index calculations or recommendations.",
    "Metric definitions": "Hover or tap a visible (i) icon for a concise definition, why investors use the metric and how to interpret it.",
    "Risk disclosures": "Equity investments carry risk of loss. Past performance is not indicative of future results. This Artifact is for information and research purposes only.",
    "Corporate-action treatment": "Historical performance uses adjusted closing prices where the provider supplies them. Corporate-action records are shown only when returned by the configured provider.",
    "End-of-day data timing": "NSE/BSE trading runs 09:15–15:30 IST. EOD values refer to the latest completed session available from the data provider; timestamps are shown in IST where available.",
  };
  return (
    <div style={{ borderTop: `1px solid ${THEME.hairline}`, background: THEME.navyDeep, padding: "22px 20px 40px" }}>
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <ShieldCheck size={15} color={THEME.gold} />
          <span style={{ fontSize: 12, color: THEME.inkDim }}>For information and research purposes only. Not investment advice. Past performance is not indicative of future results.</span>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, fontSize: 12 }}>
          {links.map((l) => (
            <button key={l} onClick={() => setDrawer(l)} className="sd-underline-link" style={{ background: "none", border: "none", color: THEME.gold, cursor: "pointer", padding: 0 }}>{l}</button>
          ))}
        </div>
        <div style={{ fontSize: 11, color: THEME.inkDim, marginTop: 14 }}>
          Eventual live deployment would require appropriately licensed market-data sources. StockDekho does not claim direct exchange integration or regulatory registration.
          {" "}© 2026 StockDekho (prototype) <span style={{ color: THEME.hairline }}>·</span> <span style={{ color: THEME.gold }}>A product by Kane Basu</span>
        </div>
      </div>
      {drawer && (
        <div onClick={() => setDrawer(null)} style={{ position: "fixed", inset: 0, background: "rgba(5,8,14,0.6)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: 460, maxWidth: "90vw", background: THEME.panel, border: `1px solid ${THEME.hairline}`, borderRadius: 8, padding: 22 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
              <h3 className="sd-serif" style={{ margin: 0, fontSize: 18 }}>{drawer}</h3>
              <button onClick={() => setDrawer(null)} style={{ background: "none", border: "none", color: THEME.inkDim, cursor: "pointer" }}><X size={16} /></button>
            </div>
            <p style={{ fontSize: 13, lineHeight: 1.6, color: THEME.creamDim }}>{content[drawer]}</p>
          </div>
        </div>
      )}
    </div>
  );
}

/* =========================================================================================
   APP ROOT
   ========================================================================================= */
export default function StockDekho() {
 

const [page, setPage] = useState("markets");
const [mode, setMode] = useState("explore");
const [activeTicker, setActiveTicker] = useState("RELIANCE");
const [activeSector, setActiveSector] = useState(null);
const [activeBenchmark, setActiveBenchmark] = useState("NIFTY50");
const [watchlist, setWatchlist] = useState(["RELIANCE", "TCS"]);
const [compareList, setCompareList] = useState(["RELIANCE", "TCS", "INFY"]);
const [query, setQuery] = useState("");
const [searchTerm, setSearchTerm] = useState("");
const [notes, setNotes] = useState({});  


  const toggleWatch = (t) => setWatchlist((w) => (w.includes(t) ? w.filter((x) => x !== t) : [...w, t]));
  const toggleCompare = (t) => setCompareList((c) => (c.includes(t) ? c.filter((x) => x !== t) : c.length >= 5 ? c : [...c, t]));
  const openCompany = (t) => { setActiveTicker(t); setPage("company"); };
  const openBenchmark = (key) => { setActiveBenchmark(key); setPage("benchmark"); };
  const openSearch = (term) => { setSearchTerm(term); setQuery(term); setPage("search"); };
  const setNote = (ticker, arr) => setNotes((n) => ({ ...n, [ticker]: arr }));

  return (
    <div className="sd-root" style={{ background: THEME.navy, minHeight: "100vh", display: "flex", flexDirection: "column" }}>

     <GlobalStyle />


      <Header page={page} setPage={setPage} mode={mode} setMode={setMode} watchlist={watchlist} compareList={compareList}
        query={query} setQuery={setQuery} onSelectSearch={openCompany} onSearchTopic={openSearch} />
      <div style={{ flex: 1 }}>
        {page === "markets" && <MarketsPage mode={mode} setPage={setPage} openCompany={openCompany} openBenchmark={openBenchmark} watchlist={watchlist} toggleWatch={toggleWatch} compareList={compareList} toggleCompare={toggleCompare} />}
        {page === "benchmark" && (activeBenchmark === "INDIA10Y"
          ? <GsecDetailPage back={() => setPage("markets")} />
          : <BenchmarkDetailPage indexKey={activeBenchmark} back={() => setPage("markets")} openCompany={openCompany} watchlist={watchlist} toggleWatch={toggleWatch} compareList={compareList} toggleCompare={toggleCompare} />)}
        {page === "stocks" && <StocksPage mode={mode} setPage={setPage} openCompany={openCompany} watchlist={watchlist} toggleWatch={toggleWatch} compareList={compareList} toggleCompare={toggleCompare} />}
        {page === "sectors" && <SectorsPage mode={mode} openCompany={openCompany} openSector={setActiveSector} activeSector={activeSector} />}
        {page === "company" && <CompanyPage ticker={activeTicker} mode={mode} watchlist={watchlist} toggleWatch={toggleWatch} compareList={compareList} toggleCompare={toggleCompare} notes={notes} setNote={setNote} openCompany={openCompany} />}
        {page === "compare" && <ComparePage compareList={compareList} toggleCompare={toggleCompare} openCompany={openCompany} />}
        {page === "currencies" && <CurrenciesPage />}
        {page === "watchlist" && <WatchlistPage watchlist={watchlist} toggleWatch={toggleWatch} openCompany={openCompany} setPage={setPage} />}
        {page === "search" && <SearchResultsPage searchTerm={searchTerm} openCompany={openCompany} />}
      </div>
      <Footer />
    </div>
  );
}
