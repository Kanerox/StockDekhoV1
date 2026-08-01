import React, { useState, useMemo, useRef, useEffect } from "react";
import {
  ResponsiveContainer, LineChart, Line, AreaChart, Area, XAxis, YAxis,
  Tooltip, CartesianGrid, ScatterChart, Scatter, ZAxis, ReferenceLine,
} from "recharts";
import {
  Search, ChevronRight, ChevronDown, Plus, X, TrendingUp, TrendingDown,
  Star, Info, FileText, ArrowUpRight, ArrowDownRight, BookmarkPlus,
  BookmarkCheck, Clock, ExternalLink, Check, SlidersHorizontal, ArrowRight,
  BarChart3, Layers, Newspaper, PenLine, Trash2, Command,
} from "lucide-react";

/* ============================================================================
   THEME TOKENS
   Institutional-terminal navy shell + warm editorial paper surfaces.
   Gold/saffron is the only brand accent; green/red are reserved for
   market movement and are always paired with an arrow + sign, never
   colour alone.
============================================================================ */
const T = {
  navy950: "#0A0F1E",
  navy900: "#0F1729",
  navy850: "#131E36",
  navy800: "#182541",
  navy700: "#20304F",
  line: "#293A5C",
  lineSoft: "#1C2A48",
  paper: "#F5EFE2",
  paperDim: "#EDE4D0",
  paperLine: "#DCCFAD",
  ink: "#1A1712",
  inkDim: "#66604E",
  gold: "#C6A15B",
  goldDeep: "#8F702F",
  goldSoft: "#E7D9B4",
  up: "#3D8B62",
  upBg: "#16241D",
  upBgPaper: "#DEEAE1",
  down: "#B24B3C",
  downBg: "#2B1917",
  downBgPaper: "#F1DFDA",
  muted: "#8D96B3",
  mutedDark: "#5C6790",
};

const FONT_IMPORT = "@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,380;9..144,480;9..144,560;9..144,650&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap');";

const fontDisplay = "'Fraunces', Georgia, serif";
const fontBody = "'Inter', -apple-system, BlinkMacSystemFont, sans-serif";
const fontMono = "'IBM Plex Mono', ui-monospace, monospace";

/* ============================================================================
   FORMATTERS
============================================================================ */
const inr = (v, dp = 0) => v.toLocaleString("en-IN", { maximumFractionDigits: dp, minimumFractionDigits: dp });
function fmtPrice(v) { return `\u20B9${inr(v, 2)}`; }
function fmtCr(v) {
  if (Math.abs(v) >= 100000) return `\u20B9${inr(v / 100000, 2)} L Cr`;
  return `\u20B9${inr(v, 0)} Cr`;
}
function fmtPct(v, dp = 2) { const s = v >= 0 ? "+" : ""; return `${s}${v.toFixed(dp)}%`; }
function fmtNum(v, dp = 2) { return inr(v, dp); }
function fmtDate(d) { return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }); }
function fmtDateShort(d) { return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }); }
function cx(...a) { return a.filter(Boolean).join(" "); }

/* ============================================================================
   SEEDED RANDOM + SERIES ENGINE
   Everything below is generated once at module load from fixed seeds, so
   the demo data is internally consistent and stable across the session
   (no external calls, no live data).
============================================================================ */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gauss(rnd) {
  const u1 = Math.max(rnd(), 1e-9), u2 = rnd();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

const END_DATE = new Date(2026, 6, 24); // Friday 24 Jul 2026 (last EOD close)
function tradingDates(n) {
  const out = []; let d = new Date(END_DATE);
  while (out.length < n) {
    const day = d.getDay();
    if (day !== 0 && day !== 6) out.push(new Date(d));
    d.setDate(d.getDate() - 1);
  }
  return out.reverse();
}
const N_DAYS = 1260; // ~5 trading years
const DATES = tradingDates(N_DAYS);

// Random walk rescaled so the final value equals `target` exactly, so the
// series' last close always matches the ticker's quoted EOD price.
function genSeries(seed, target, n, driftAnnual, volAnnual, startFactor = 0.55) {
  const rnd = mulberry32(seed);
  const dDrift = driftAnnual / 252, dVol = volAnnual / Math.sqrt(252);
  let p = target * startFactor;
  const arr = [];
  for (let i = 0; i < n; i++) {
    const ret = dDrift + dVol * gauss(rnd);
    p = Math.max(p * (1 + ret), target * 0.05);
    arr.push(p);
  }
  const scale = target / arr[arr.length - 1];
  return arr.map((p) => p * scale);
}
// Mean-reverting series (used for India VIX) — no rescale, doesn't need to
// coincide with any other figure.
function genMeanRevert(seed, mean, n, vol, reversion = 0.04) {
  const rnd = mulberry32(seed);
  let p = mean; const arr = [];
  for (let i = 0; i < n; i++) {
    p = p + reversion * (mean - p) + vol * gauss(rnd);
    p = Math.max(p, 8);
    arr.push(p);
  }
  return arr;
}
function seriesReturn(series, days) {
  const n = series.length;
  const i = Math.max(0, n - 1 - days);
  if (series[i] === 0) return 0;
  return (series[n - 1] / series[i] - 1) * 100;
}
function windowReturn(series, idx, days = 3) {
  const j = Math.max(0, idx - days);
  if (!series[j]) return 0;
  return (series[idx] / series[j] - 1) * 100;
}
function withDates(series) { return series.map((v, i) => ({ date: DATES[i], close: v })); }

/* ============================================================================
   SECTORS  (Sector Classification — proprietary, not GICS)
============================================================================ */
const SECTORS = [
  { id: "financials", name: "Financials", blurb: "Banks, NBFCs and lenders financing India's credit cycle." },
  { id: "it", name: "Information Technology", blurb: "Software services, consulting and digital engineering exporters." },
  { id: "energy", name: "Energy", blurb: "Refining, petrochemicals and integrated energy conglomerates." },
  { id: "staples", name: "Consumer Staples", blurb: "Everyday consumption — food, tobacco and household goods." },
  { id: "discretionary", name: "Consumer Discretionary", blurb: "Autos and durables tied to discretionary household spending." },
  { id: "healthcare", name: "Health Care", blurb: "Pharmaceuticals, generics and formulations exporters." },
  { id: "industrials", name: "Industrials", blurb: "Capital goods, engineering and infrastructure execution." },
  { id: "materials", name: "Materials", blurb: "Metals, mining and core commodity producers." },
  { id: "utilities", name: "Utilities", blurb: "Power generation and regulated infrastructure operators." },
  { id: "communication", name: "Communication Services", blurb: "Telecom carriers and connectivity infrastructure." },
  { id: "realestate", name: "Real Estate", blurb: "Residential and commercial developers." },
];
const sectorById = Object.fromEntries(SECTORS.map((s) => [s.id, s]));

/* ============================================================================
   COMPANY BASE DATA — 20 NSE-listed names across all 11 sectors.
   price / mcapCr / pe / pb / divYield / de / promoter are the authored
   "quoted" figures; ROE, ROCE, EPS, revenue, book equity and debt are all
   *derived* below so every screen stays numerically consistent.
============================================================================ */
const ROCE_K = {
  financials: 0.85, it: 1.15, energy: 0.9, staples: 1.25, discretionary: 1.0,
  healthcare: 1.1, industrials: 0.95, materials: 0.9, utilities: 0.8,
  communication: 0.75, realestate: 0.8,
};
const NET_MARGIN = {
  financials: 0.22, it: 0.18, energy: 0.06, staples: 0.16, discretionary: 0.07,
  healthcare: 0.16, industrials: 0.07, materials: 0.08, utilities: 0.18,
  communication: 0.09, realestate: 0.18,
};
const EBITDA_MARGIN = {
  financials: 0.34, it: 0.26, energy: 0.12, staples: 0.24, discretionary: 0.11,
  healthcare: 0.24, industrials: 0.11, materials: 0.17, utilities: 0.40,
  communication: 0.48, realestate: 0.32,
};
const REV_GROWTH = {
  financials: 0.14, it: 0.10, energy: 0.09, staples: 0.08, discretionary: 0.11,
  healthcare: 0.10, industrials: 0.13, materials: 0.07, utilities: 0.06,
  communication: 0.12, realestate: 0.15,
};
const CAPEX_PCT = {
  financials: 0.015, it: 0.04, energy: 0.09, staples: 0.05, discretionary: 0.06,
  healthcare: 0.06, industrials: 0.07, materials: 0.10, utilities: 0.16,
  communication: 0.18, realestate: 0.05,
};
const RISK = {
  financials: [0.14, 0.26], it: [0.12, 0.23], energy: [0.10, 0.22], staples: [0.09, 0.16],
  discretionary: [0.13, 0.29], healthcare: [0.11, 0.23], industrials: [0.15, 0.28],
  materials: [0.08, 0.33], utilities: [0.07, 0.18], communication: [0.15, 0.29],
  realestate: [0.12, 0.35],
};

const COMPANIES_BASE = [
  { ticker: "RELIANCE", name: "Reliance Industries Ltd.", sector: "energy", listed: 1977,
    desc: "Diversified conglomerate spanning oil-to-chemicals refining, digital services through Jio, and organised retail.",
    price: 3120.40, mcapCr: 2111000, pe: 24.6, pb: 2.28, divYield: 0.35, de: 0.36, promoter: 50.3, pledge: 0 },
  { ticker: "TCS", name: "Tata Consultancy Services Ltd.", sector: "it", listed: 2004,
    desc: "India's largest IT services company, providing consulting, technology and digital transformation services globally.",
    price: 3852.15, mcapCr: 1395000, pe: 27.1, pb: 13.4, divYield: 1.62, de: 0.02, promoter: 71.8, pledge: 0 },
  { ticker: "INFY", name: "Infosys Ltd.", sector: "it", listed: 1993,
    desc: "Global IT services and consulting major, with strength in digital engineering, cloud and enterprise platforms.",
    price: 1782.60, mcapCr: 738000, pe: 25.3, pb: 8.1, divYield: 2.38, de: 0.02, promoter: 13.0, pledge: 0 },
  { ticker: "HCLTECH", name: "HCL Technologies Ltd.", sector: "it", listed: 1999,
    desc: "IT services and engineering R&D company with a large product & platforms business alongside services.",
    price: 1618.30, mcapCr: 440000, pe: 23.9, pb: 6.7, divYield: 3.12, de: 0.05, promoter: 60.8, pledge: 0 },
  { ticker: "HDFCBANK", name: "HDFC Bank Ltd.", sector: "financials", listed: 1995,
    desc: "India's largest private-sector bank by assets, spanning retail, wholesale and digital banking.",
    price: 1721.75, mcapCr: 1310000, pe: 19.4, pb: 2.68, divYield: 1.12, de: 6.20, promoter: 0, pledge: 0 },
  { ticker: "ICICIBANK", name: "ICICI Bank Ltd.", sector: "financials", listed: 1997,
    desc: "Private-sector bank with a diversified retail and corporate lending franchise and large insurance/AMC subsidiaries.",
    price: 1289.90, mcapCr: 910000, pe: 18.0, pb: 3.05, divYield: 0.78, de: 6.80, promoter: 0, pledge: 0 },
  { ticker: "SBIN", name: "State Bank of India", sector: "financials", listed: 1995,
    desc: "India's largest public-sector bank, with the widest branch and ATM network in the country.",
    price: 845.20, mcapCr: 754000, pe: 10.2, pb: 1.68, divYield: 1.92, de: 11.5, promoter: 57.4, pledge: 0 },
  { ticker: "AXISBANK", name: "Axis Bank Ltd.", sector: "financials", listed: 1998,
    desc: "Private-sector bank with a growing retail deposit franchise and expanding card and payments business.",
    price: 1178.55, mcapCr: 365000, pe: 13.7, pb: 1.98, divYield: 0.12, de: 7.90, promoter: 8.2, pledge: 0 },
  { ticker: "BAJFINANCE", name: "Bajaj Finance Ltd.", sector: "financials", listed: 1995,
    desc: "Leading diversified NBFC financing consumer durables, personal loans, SME lending and digital credit products.",
    price: 7248.90, mcapCr: 448000, pe: 30.4, pb: 5.85, divYield: 0.42, de: 3.80, promoter: 54.7, pledge: 0 },
  { ticker: "ITC", name: "ITC Ltd.", sector: "staples", listed: 1970,
    desc: "Diversified FMCG major with leadership in cigarettes, packaged foods, personal care, paperboards and agri-business.",
    price: 464.35, mcapCr: 582000, pe: 27.9, pb: 7.05, divYield: 3.18, de: 0.02, promoter: 29.1, pledge: 0 },
  { ticker: "NESTLEIND", name: "Nestle India Ltd.", sector: "staples", listed: 1973,
    desc: "Packaged foods and beverages company with a portfolio spanning infant nutrition, dairy, beverages and confectionery.",
    price: 2278.40, mcapCr: 219700, pe: 65.8, pb: 74.6, divYield: 1.18, de: 0.15, promoter: 62.8, pledge: 0 },
  { ticker: "MARUTI", name: "Maruti Suzuki India Ltd.", sector: "discretionary", listed: 2003,
    desc: "India's largest passenger-vehicle manufacturer by volume, with a wide dealer and service network.",
    price: 12804.50, mcapCr: 405000, pe: 27.4, pb: 4.42, divYield: 0.88, de: 0.03, promoter: 58.2, pledge: 0 },
  { ticker: "TATAMOTORS", name: "Tata Motors Ltd.", sector: "discretionary", listed: 1998,
    desc: "Commercial and passenger vehicle manufacturer with global operations through its Jaguar Land Rover subsidiary.",
    price: 689.75, mcapCr: 254000, pe: 9.1, pb: 2.92, divYield: 0.42, de: 1.42, promoter: 42.6, pledge: 0 },
  { ticker: "SUNPHARMA", name: "Sun Pharmaceutical Industries Ltd.", sector: "healthcare", listed: 1994,
    desc: "India's largest pharmaceutical company by revenue, with a global generics and specialty portfolio.",
    price: 1779.60, mcapCr: 427000, pe: 33.5, pb: 6.05, divYield: 0.68, de: 0.05, promoter: 54.5, pledge: 0 },
  { ticker: "DRREDDY", name: "Dr. Reddy's Laboratories Ltd.", sector: "healthcare", listed: 1986,
    desc: "Pharmaceutical company focused on generics, APIs and biosimilars across regulated and emerging markets.",
    price: 1288.15, mcapCr: 215000, pe: 19.1, pb: 3.58, divYield: 0.62, de: 0.06, promoter: 50.5, pledge: 0 },
  { ticker: "LT", name: "Larsen & Toubro Ltd.", sector: "industrials", listed: 1950,
    desc: "Diversified engineering, construction and technology conglomerate with a large order book across infrastructure verticals.",
    price: 3548.20, mcapCr: 488000, pe: 32.0, pb: 4.85, divYield: 0.82, de: 1.08, promoter: 0, pledge: 0 },
  { ticker: "BHARTIARTL", name: "Bharti Airtel Ltd.", sector: "communication", listed: 2002,
    desc: "Integrated telecom operator providing mobile, broadband and digital services across India and Africa.",
    price: 1782.90, mcapCr: 1065000, pe: 72.4, pb: 11.7, divYield: 0.39, de: 1.34, promoter: 54.7, pledge: 3.4 },
  { ticker: "TATASTEEL", name: "Tata Steel Ltd.", sector: "materials", listed: 1907,
    desc: "Integrated steel producer with domestic and European operations across flat and long steel products.",
    price: 167.85, mcapCr: 209000, pe: 22.7, pb: 1.78, divYield: 3.28, de: 0.86, promoter: 33.2, pledge: 0 },
  { ticker: "NTPC", name: "NTPC Ltd.", sector: "utilities", listed: 2004,
    desc: "India's largest power generation company, with a coal, gas and fast-growing renewables portfolio.",
    price: 385.10, mcapCr: 373000, pe: 16.4, pb: 2.06, divYield: 2.48, de: 1.58, promoter: 51.1, pledge: 0 },
  { ticker: "DLF", name: "DLF Ltd.", sector: "realestate", listed: 1972,
    desc: "India's largest listed real-estate developer, with a residential and commercial portfolio concentrated in the NCR.",
    price: 829.65, mcapCr: 205000, pe: 38.6, pb: 3.35, divYield: 0.48, de: 0.06, promoter: 74.1, pledge: 0.8 },

  /* -- Broader coverage: additional NSE-listed names across cap bands -- */
  { ticker: "FEDERALBNK", name: "Federal Bank Ltd.", sector: "financials", listed: 1994,
    desc: "Kerala-headquartered private-sector bank with a strong NRI remittance franchise and expanding retail book.",
    price: 210.50, mcapCr: 51000, pe: 11.8, pb: 1.42, divYield: 0.92, de: 8.5, promoter: 0, pledge: 0 },
  { ticker: "CANBK", name: "Canara Bank", sector: "financials", listed: 2002,
    desc: "Public-sector bank with a large pan-India branch network across retail and priority-sector lending.",
    price: 118.40, mcapCr: 107000, pe: 6.8, pb: 1.15, divYield: 3.12, de: 13.0, promoter: 62.9, pledge: 0 },
  { ticker: "IDFCFIRSTB", name: "IDFC First Bank Ltd.", sector: "financials", listed: 2015,
    desc: "Private-sector bank built from an infrastructure-finance NBFC, scaling up retail deposits and lending.",
    price: 76.30, mcapCr: 55000, pe: 24.5, pb: 1.92, divYield: 0, de: 8.9, promoter: 0, pledge: 0 },
  { ticker: "CHOLAFIN", name: "Cholamandalam Investment & Finance Co. Ltd.", sector: "financials", listed: 1995,
    desc: "Diversified NBFC financing vehicles, home loans and SME credit through the Murugappa Group.",
    price: 1385.20, mcapCr: 118000, pe: 32.0, pb: 6.8, divYield: 0.15, de: 6.4, promoter: 51.2, pledge: 0 },
  { ticker: "LTIMINDTREE", name: "LTIMindtree Ltd.", sector: "it", listed: 2001,
    desc: "IT services and consulting company formed from the merger of Larsen & Toubro Infotech and Mindtree.",
    price: 5620.80, mcapCr: 166000, pe: 30.5, pb: 7.2, divYield: 1.6, de: 0.02, promoter: 68.7, pledge: 0 },
  { ticker: "PERSISTENT", name: "Persistent Systems Ltd.", sector: "it", listed: 2010,
    desc: "IT services company focused on software product engineering and digital transformation.",
    price: 5980.40, mcapCr: 92000, pe: 46.8, pb: 12.5, divYield: 0.3, de: 0.02, promoter: 30.1, pledge: 0 },
  { ticker: "COFORGE", name: "Coforge Ltd.", sector: "it", listed: 1992,
    desc: "Mid-tier IT services company with a strong presence in travel, insurance and BFS verticals.",
    price: 8420.10, mcapCr: 55000, pe: 42.5, pb: 11.8, divYield: 0.5, de: 0.1, promoter: 15.4, pledge: 0 },
  { ticker: "MPHASIS", name: "Mphasis Ltd.", sector: "it", listed: 1993,
    desc: "IT services company with a concentrated BFSI client base and a direct-to-core digital services model.",
    price: 2845.60, mcapCr: 54000, pe: 28.9, pb: 6.9, divYield: 1.9, de: 0.03, promoter: 56.2, pledge: 0 },
  { ticker: "REDINGTON", name: "Redington Ltd.", sector: "it", listed: 2007,
    desc: "Technology products distribution company supplying IT hardware and devices across emerging markets.",
    price: 285.40, mcapCr: 14200, pe: 16.5, pb: 3.1, divYield: 2.1, de: 0.3, promoter: 0, pledge: 0 },
  { ticker: "ONGC", name: "Oil & Natural Gas Corporation Ltd.", sector: "energy", listed: 1994,
    desc: "India's largest crude oil and natural gas exploration & production company, majority government-owned.",
    price: 258.40, mcapCr: 325000, pe: 8.5, pb: 0.9, divYield: 4.8, de: 0.3, promoter: 58.9, pledge: 0 },
  { ticker: "IOC", name: "Indian Oil Corporation Ltd.", sector: "energy", listed: 1959,
    desc: "India's largest downstream oil marketing and refining company, with a nationwide fuel retail network.",
    price: 148.20, mcapCr: 209000, pe: 9.8, pb: 1.3, divYield: 6.5, de: 0.9, promoter: 51.5, pledge: 0 },
  { ticker: "GAIL", name: "GAIL (India) Ltd.", sector: "energy", listed: 1997,
    desc: "India's largest natural gas processing and distribution company, operating a nationwide pipeline network.",
    price: 195.60, mcapCr: 128500, pe: 10.9, pb: 1.6, divYield: 3.6, de: 0.2, promoter: 51.9, pledge: 0 },
  { ticker: "BRITANNIA", name: "Britannia Industries Ltd.", sector: "staples", listed: 1978,
    desc: "Leading biscuits, bakery and dairy products company with one of India's most recognised food brands.",
    price: 5480.30, mcapCr: 132000, pe: 54.6, pb: 33.5, divYield: 1.4, de: 0.5, promoter: 50.6, pledge: 0 },
  { ticker: "DABUR", name: "Dabur India Ltd.", sector: "staples", listed: 1994,
    desc: "FMCG company with a portfolio spanning ayurvedic healthcare, personal care and packaged foods.",
    price: 512.40, mcapCr: 90700, pe: 44.5, pb: 8.9, divYield: 1.6, de: 0.1, promoter: 67.0, pledge: 0 },
  { ticker: "MARICO", name: "Marico Ltd.", sector: "staples", listed: 1996,
    desc: "FMCG company known for edible oils, hair care and skin care brands across India and select overseas markets.",
    price: 675.20, mcapCr: 87200, pe: 48.2, pb: 15.6, divYield: 1.4, de: 0.05, promoter: 59.1, pledge: 0 },
  { ticker: "TATACONSUM", name: "Tata Consumer Products Ltd.", sector: "staples", listed: 1963,
    desc: "Consumer products company spanning tea, coffee, salt and a growing packaged-foods portfolio.",
    price: 1085.40, mcapCr: 104000, pe: 62.4, pb: 5.8, divYield: 0.9, de: 0.2, promoter: 33.9, pledge: 0 },
  { ticker: "BAJAJ-AUTO", name: "Bajaj Auto Ltd.", sector: "discretionary", listed: 2008,
    desc: "Two- and three-wheeler manufacturer with a large domestic and export franchise.",
    price: 8940.50, mcapCr: 249000, pe: 30.8, pb: 8.2, divYield: 1.1, de: 0.02, promoter: 54.9, pledge: 0 },
  { ticker: "TITAN", name: "Titan Company Ltd.", sector: "discretionary", listed: 1987,
    desc: "Consumer products company spanning jewellery, watches and eyewear, majority owned with the Tata Group.",
    price: 3585.20, mcapCr: 318000, pe: 68.5, pb: 24.9, divYield: 0.3, de: 0.4, promoter: 52.9, pledge: 0 },
  { ticker: "EICHERMOT", name: "Eicher Motors Ltd.", sector: "discretionary", listed: 1986,
    desc: "Two-wheeler manufacturer known for the Royal Enfield brand, with a growing commercial vehicles JV.",
    price: 4890.30, mcapCr: 134000, pe: 28.4, pb: 6.5, divYield: 0.6, de: 0.02, promoter: 49.2, pledge: 0 },
  { ticker: "TRENT", name: "Trent Ltd.", sector: "discretionary", listed: 1961,
    desc: "Fashion and value retail company operating the Westside and Zudio store formats, part of the Tata Group.",
    price: 5240.80, mcapCr: 186000, pe: 112.5, pb: 28.9, divYield: 0.1, de: 0.15, promoter: 37.1, pledge: 0 },
  { ticker: "CIPLA", name: "Cipla Ltd.", sector: "healthcare", listed: 1946,
    desc: "Pharmaceutical company with strength in respiratory therapeutics and a broad generics portfolio.",
    price: 1512.60, mcapCr: 122000, pe: 25.8, pb: 4.1, divYield: 0.7, de: 0.03, promoter: 33.5, pledge: 0 },
  { ticker: "DIVISLAB", name: "Divi's Laboratories Ltd.", sector: "healthcare", listed: 1995,
    desc: "Active pharmaceutical ingredients and custom-synthesis manufacturer serving global pharma companies.",
    price: 5680.40, mcapCr: 151000, pe: 68.9, pb: 12.4, divYield: 0.6, de: 0.01, promoter: 51.9, pledge: 0 },
  { ticker: "APOLLOHOSP", name: "Apollo Hospitals Enterprise Ltd.", sector: "healthcare", listed: 1995,
    desc: "India's largest hospital chain by capacity, with a growing digital health and pharmacy distribution business.",
    price: 7120.90, mcapCr: 102400, pe: 68.4, pb: 13.9, divYield: 0.2, de: 0.4, promoter: 29.3, pledge: 0 },
  { ticker: "AUROPHARMA", name: "Aurobindo Pharma Ltd.", sector: "healthcare", listed: 1995,
    desc: "Generics manufacturer with a large formulations and API export business across regulated markets.",
    price: 1385.20, mcapCr: 81100, pe: 20.4, pb: 3.4, divYield: 0.5, de: 0.2, promoter: 51.8, pledge: 0 },
  { ticker: "SIEMENS", name: "Siemens Ltd.", sector: "industrials", listed: 1957,
    desc: "Engineering company supplying automation, electrification and digitalisation equipment to industry and infrastructure.",
    price: 6980.40, mcapCr: 248500, pe: 78.5, pb: 13.9, divYield: 0.2, de: 0.02, promoter: 75.0, pledge: 0 },
  { ticker: "BEL", name: "Bharat Electronics Ltd.", sector: "industrials", listed: 1980,
    desc: "Defence public-sector undertaking manufacturing electronics and communication systems for the armed forces.",
    price: 318.60, mcapCr: 232700, pe: 48.2, pb: 15.8, divYield: 0.6, de: 0.01, promoter: 51.1, pledge: 0 },
  { ticker: "CUMMINSIND", name: "Cummins India Ltd.", sector: "industrials", listed: 1965,
    desc: "Manufacturer of diesel and natural gas engines and power generation equipment.",
    price: 3620.80, mcapCr: 100200, pe: 52.4, pb: 15.2, divYield: 1.0, de: 0.01, promoter: 51.0, pledge: 0 },
  { ticker: "RAILTEL", name: "RailTel Corporation of India Ltd.", sector: "industrials", listed: 2021,
    desc: "Telecom infrastructure provider laying and operating fibre networks along Indian Railways' right of way.",
    price: 385.40, mcapCr: 12700, pe: 32.5, pb: 6.8, divYield: 1.0, de: 0.05, promoter: 72.8, pledge: 0 },
  { ticker: "IRCON", name: "Ircon International Ltd.", sector: "industrials", listed: 2018,
    desc: "Railway infrastructure construction company executing domestic and international rail projects.",
    price: 198.60, mcapCr: 25700, pe: 22.4, pb: 3.9, divYield: 1.8, de: 0.1, promoter: 66.4, pledge: 0 },
  { ticker: "MSTCLTD", name: "MSTC Ltd.", sector: "industrials", listed: 2019,
    desc: "Government-owned e-commerce and materials trading company running online auction platforms.",
    price: 385.20, mcapCr: 3200, pe: 18.5, pb: 3.9, divYield: 3.5, de: 0.02, promoter: 64.8, pledge: 0 },
  { ticker: "HINDALCO", name: "Hindalco Industries Ltd.", sector: "materials", listed: 1962,
    desc: "Aluminium and copper producer with a large global footprint through its Novelis subsidiary.",
    price: 685.40, mcapCr: 154000, pe: 12.8, pb: 1.9, divYield: 0.6, de: 0.6, promoter: 34.6, pledge: 0 },
  { ticker: "JSWSTEEL", name: "JSW Steel Ltd.", sector: "materials", listed: 1995,
    desc: "Integrated steel producer with a growing domestic capacity base and export franchise.",
    price: 985.60, mcapCr: 240600, pe: 34.5, pb: 3.4, divYield: 0.4, de: 0.9, promoter: 44.9, pledge: 0 },
  { ticker: "VEDL", name: "Vedanta Ltd.", sector: "materials", listed: 1965,
    desc: "Diversified natural resources company spanning zinc, aluminium, oil & gas and power.",
    price: 452.30, mcapCr: 168000, pe: 14.6, pb: 4.8, divYield: 6.2, de: 1.6, promoter: 56.4, pledge: 5.2 },
  { ticker: "NATIONALUM", name: "National Aluminium Company Ltd.", sector: "materials", listed: 1989,
    desc: "Government-owned integrated aluminium producer spanning bauxite mining, alumina refining and smelting.",
    price: 198.40, mcapCr: 36400, pe: 10.9, pb: 2.1, divYield: 2.8, de: 0.05, promoter: 51.5, pledge: 0 },
  { ticker: "POWERGRID", name: "Power Grid Corporation of India Ltd.", sector: "utilities", listed: 2007,
    desc: "India's principal electricity transmission utility, operating the interstate transmission backbone.",
    price: 318.50, mcapCr: 296200, pe: 17.5, pb: 3.4, divYield: 4.1, de: 1.4, promoter: 51.3, pledge: 0 },
  { ticker: "TATAPOWER", name: "Tata Power Company Ltd.", sector: "utilities", listed: 1957,
    desc: "Integrated power utility with generation, transmission, distribution and a fast-growing renewables arm.",
    price: 412.60, mcapCr: 132000, pe: 28.9, pb: 3.6, divYield: 0.4, de: 1.1, promoter: 46.9, pledge: 0 },
  { ticker: "TORNTPOWER", name: "Torrent Power Ltd.", sector: "utilities", listed: 2006,
    desc: "Private-sector power generation, transmission and distribution utility across several Indian states.",
    price: 1685.40, mcapCr: 84000, pe: 25.4, pb: 6.8, divYield: 0.6, de: 0.9, promoter: 49.6, pledge: 0 },
  { ticker: "IEX", name: "Indian Energy Exchange Ltd.", sector: "utilities", listed: 2017,
    desc: "Operator of India's leading electronic power trading exchange for short-term electricity contracts.",
    price: 185.40, mcapCr: 16700, pe: 38.9, pb: 15.4, divYield: 1.8, de: 0.01, promoter: 0, pledge: 0 },
  { ticker: "INDUSTOWER", name: "Indus Towers Ltd.", sector: "communication", listed: 2013,
    desc: "Telecom towers infrastructure company leasing passive tower capacity to mobile network operators.",
    price: 385.60, mcapCr: 102000, pe: 15.8, pb: 4.9, divYield: 3.9, de: 0.4, promoter: 50.1, pledge: 0 },
  { ticker: "TATACOMM", name: "Tata Communications Ltd.", sector: "communication", listed: 1986,
    desc: "Global digital infrastructure and enterprise connectivity provider operating an international network backbone.",
    price: 1685.20, mcapCr: 48200, pe: 34.5, pb: 12.4, divYield: 0.9, de: 1.8, promoter: 32.1, pledge: 0 },
  { ticker: "TANLA", name: "Tanla Platforms Ltd.", sector: "communication", listed: 1995,
    desc: "Cloud communications platform company providing CPaaS messaging infrastructure to enterprises and telcos.",
    price: 685.40, mcapCr: 4300, pe: 12.5, pb: 2.8, divYield: 1.0, de: 0.02, promoter: 44.5, pledge: 0 },
  { ticker: "ROUTE", name: "Route Mobile Ltd.", sector: "communication", listed: 2020,
    desc: "Cloud communications platform provider offering messaging, voice and email APIs to enterprises.",
    price: 1385.60, mcapCr: 6100, pe: 21.5, pb: 3.4, divYield: 0.3, de: 0.05, promoter: 33.8, pledge: 0 },
  { ticker: "GODREJPROP", name: "Godrej Properties Ltd.", sector: "realestate", listed: 2010,
    desc: "Residential and commercial real-estate developer operating across major Indian metro markets.",
    price: 2385.40, mcapCr: 72700, pe: 45.6, pb: 5.8, divYield: 0.1, de: 0.5, promoter: 62.5, pledge: 0 },
  { ticker: "OBEROIRLTY", name: "Oberoi Realty Ltd.", sector: "realestate", listed: 2010,
    desc: "Mumbai-focused premium real-estate developer with residential, retail and hospitality assets.",
    price: 1685.20, mcapCr: 61200, pe: 24.8, pb: 4.6, divYield: 0.2, de: 0.15, promoter: 67.8, pledge: 0 },
  { ticker: "SOBHA", name: "Sobha Ltd.", sector: "realestate", listed: 2006,
    desc: "Bengaluru-headquartered real-estate developer known for in-house construction and contracting capability.",
    price: 1385.60, mcapCr: 14600, pe: 58.2, pb: 4.2, divYield: 0.3, de: 0.9, promoter: 51.6, pledge: 0 },
];


/* ============================================================================
   DERIVATION ENGINE — builds series, financials, ownership and events for
   every company from the base fields above, plus indices, currencies,
   breadth and event feeds. Runs once at module load.
============================================================================ */
function buildCompany(base, idx) {
  const seed = 1000 + idx * 137;
  const [volLo, volHi] = RISK[base.sector];
  const volAnnual = volLo + ((idx * 37) % 100) / 100 * (volHi - volLo);
  const driftAnnual = 0.07 + ((idx * 53) % 100) / 100 * 0.12;
  const series = genSeries(seed, base.price, N_DAYS, driftAnnual, volAnnual);

  const netMargin = NET_MARGIN[base.sector];
  const ebitdaMargin = EBITDA_MARGIN[base.sector];
  const capexPct = CAPEX_PCT[base.sector];

  const netIncomeCr = base.mcapCr / base.pe;
  const revenueCr = netIncomeCr / netMargin;
  const bookEquityCr = base.mcapCr / base.pb;
  const debtCr = base.de * bookEquityCr;
  const roe = (netIncomeCr / bookEquityCr) * 100;
  const roce = roe * ROCE_K[base.sector];
  const sharesCr = base.mcapCr / base.price; // shares outstanding, in crores of shares
  const eps = base.price / base.pe;
  const bookValuePerShare = base.price / base.pb;

  // Annual financials — 6 fiscal years, back-solved from the revenue growth
  // rate with light seeded noise so trends look organic but coherent.
  const rnd = mulberry32(seed + 991);
  const years = 6;
  const annual = [];
  for (let y = years - 1; y >= 0; y--) {
    const back = Math.pow(1 + REV_GROWTH[base.sector], y);
    const noise = 1 + (rnd() - 0.5) * 0.05;
    const revenue = (revenueCr / back) * noise;
    const ebitda = revenue * ebitdaMargin * (1 + (rnd() - 0.5) * 0.06);
    const netIncome = revenue * netMargin * (1 + (rnd() - 0.5) * 0.09);
    const ocf = ebitda * 0.78 * (1 + (rnd() - 0.5) * 0.12);
    const capex = revenue * capexPct * (1 + (rnd() - 0.5) * 0.2);
    annual.push({
      fy: `FY${(21 + years - 1 - y).toString().padStart(2, "0")}`,
      revenue, ebitda, netIncome, ocf, fcf: ocf - capex, capex,
      eps: (netIncome / sharesCr),
      debt: debtCr * (0.75 + (years - 1 - y) * 0.05) * (1 + (rnd() - 0.5) * 0.1),
    });
  }
  annual[annual.length - 1].revenue = revenueCr;
  annual[annual.length - 1].netIncome = netIncomeCr;
  annual[annual.length - 1].eps = eps;
  annual[annual.length - 1].debt = debtCr;

  // Quarterly — trailing 8 quarters, seasonal noise around annual/4.
  const quarterly = [];
  const qLabels = ["Q1FY25", "Q2FY25", "Q3FY25", "Q4FY25", "Q1FY26", "Q2FY26", "Q3FY26", "Q4FY26"];
  for (let q = 0; q < 8; q++) {
    const seasonal = 1 + Math.sin(q * 1.4) * 0.05 + (rnd() - 0.5) * 0.08;
    const growth = Math.pow(1 + REV_GROWTH[base.sector] / 4, q - 7);
    const revenue = (revenueCr / 4) * growth * seasonal;
    const ebitda = revenue * ebitdaMargin * (1 + (rnd() - 0.5) * 0.05);
    const netIncome = revenue * netMargin * (1 + (rnd() - 0.5) * 0.08);
    quarterly.push({ q: qLabels[q], revenue, ebitda, netIncome, eps: netIncome / sharesCr });
  }

  // Ownership — last 4 quarters, promoter trending gently to today's base.
  const ownership = [];
  const remainder = 100 - base.promoter;
  const fiiBase = remainder * 0.42, diiBase = remainder * 0.33;
  for (let q = 0; q < 4; q++) {
    const drift = (3 - q) * (rnd() - 0.5) * 0.6;
    const promoter = base.promoter + drift;
    const fii = fiiBase + (rnd() - 0.5) * 2.2;
    const dii = diiBase + (rnd() - 0.5) * 1.6;
    const pledge = q === 3 ? base.pledge : Math.max(0, base.pledge + (rnd() - 0.5) * 0.6);
    ownership.push({
      q: qLabels[q + 4], promoter: +promoter.toFixed(2), fii: +fii.toFixed(2), dii: +dii.toFixed(2),
      public: +(100 - promoter - fii - dii).toFixed(2), pledge: +pledge.toFixed(2),
    });
  }

  // KMP disclosures — role-based, not named individuals (demo data only).
  const roles = ["Whole-time Director", "Chief Financial Officer", "Company Secretary", "Non-Executive Director"]
    .concat(base.promoter > 0 ? ["Promoter Group entity"] : []);
  const natures = ["Market purchase", "Market sale", "ESOP exercise & allotment", "Inter-se transfer"];
  const kmp = [];
  for (let i = 0; i < 3; i++) {
    const di = 40 + i * 130 + Math.floor(rnd() * 60);
    kmp.push({
      date: DATES[N_DAYS - 1 - di], role: roles[Math.floor(rnd() * roles.length)],
      nature: natures[Math.floor(rnd() * natures.length)],
      shares: Math.floor(2000 + rnd() * 48000),
      valueCr: +((2000 + rnd() * 48000) * base.price / 1e7).toFixed(2),
    });
  }

  // Events & filings — spread over the last ~2 years, anchored to real
  // series indices so "impact" figures are internally consistent.
  const catTemplates = [
    { cat: "Result", tpl: (n) => `${n} quarterly results` },
    { cat: "Dividend", tpl: (n) => `${n} board recommends dividend` },
    { cat: "Rating", tpl: (n) => `Credit rating action on ${n}` },
    { cat: "Corporate Action", tpl: (n) => `${n} corporate action record date` },
    { cat: "Investor Presentation", tpl: (n) => `${n} investor presentation` },
    { cat: "Shareholding", tpl: (n) => `${n} shareholding pattern filed` },
  ];
  const events = [];
  for (let i = 0; i < 9; i++) {
    const offset = 15 + i * 52 + Math.floor(rnd() * 20);
    const idxDate = Math.max(3, N_DAYS - 1 - offset);
    const t = catTemplates[i % catTemplates.length];
    const before = series[Math.max(0, idxDate - 1)];
    const after = series[Math.min(N_DAYS - 1, idxDate + 2)];
    events.push({
      id: `${base.ticker}-ev-${i}`, date: DATES[idxDate], cat: t.cat,
      headline: t.tpl(base.name.split(" ")[0]),
      impactPct: ((after / before) - 1) * 100,
      doc: `${base.ticker}_${t.cat.replace(/\s/g, "")}_${DATES[idxDate].getFullYear()}.pdf`,
    });
  }
  events.sort((a, b) => b.date - a.date);

  const dates = DATES;
  const last252 = series.slice(-252);
  const week52High = Math.max(...last252);
  const week52Low = Math.min(...last252);
  const tradedValueCr = base.mcapCr * (0.0015 + ((idx * 29) % 100) / 100 * 0.014);

  return {
    ...base, series, dates, roe, roce, eps, bookValuePerShare, revenueCr, netIncomeCr,
    ebitdaMargin, netMargin, annual, quarterly, ownership, kmp, events,
    week52High, week52Low, tradedValueCr, sharesCr, evEbitda: (base.mcapCr + debtCr) / annual[annual.length - 1].ebitda,
    peg: base.pe / (REV_GROWTH[base.sector] * 100 * 0.9),
    interestCoverage: 3.2 + ((idx * 61) % 100) / 100 * 9,
    currentRatio: 0.9 + ((idx * 43) % 100) / 100 * 1.6,
    payoutRatio: (base.divYield * base.price / eps) || 0,
  };
}

const COMPANIES = COMPANIES_BASE.map(buildCompany);
const companyByTicker = Object.fromEntries(COMPANIES.map((c) => [c.ticker, c]));

function ret(c, days) { return seriesReturn(c.series, days); }
const RANGE_DAYS = { "1D": 1, "1W": 5, "1M": 21, "3M": 63, "6M": 126, "1Y": 252, "2Y": 504, "3Y": 756, "5Y": 1260 };

/* ---- Indices ---- */
const INDEX_DEFS = [
  { id: "NIFTY50", name: "Nifty 50", price: 24958.30, drift: 0.11, vol: 0.13, seed: 9001 },
  { id: "NIFTYNEXT50", name: "Nifty Next 50", price: 68210.55, drift: 0.14, vol: 0.17, seed: 9002 },
  { id: "MIDCAP150", name: "Nifty Midcap 150", price: 21846.90, drift: 0.16, vol: 0.19, seed: 9003 },
  { id: "SMALLCAP250", name: "Nifty Smallcap 250", price: 17652.15, drift: 0.15, vol: 0.23, seed: 9004 },
  { id: "NIFTY500", name: "Nifty 500", price: 23842.60, drift: 0.12, vol: 0.14, seed: 9008 },
  { id: "NIFTYBANK", name: "Nifty Bank", price: 53412.75, drift: 0.12, vol: 0.15, seed: 9005 },
  { id: "SENSEX", name: "S&P BSE Sensex", price: 81624.15, drift: 0.11, vol: 0.13, seed: 9007 },
];
const INDICES = INDEX_DEFS.map((d) => ({ ...d, series: genSeries(d.seed, d.price, N_DAYS, d.drift, d.vol) }));
const VIX = { id: "INDIAVIX", name: "India VIX", series: genMeanRevert(9006, 13.4, N_DAYS, 0.9, 0.05) };
VIX.price = VIX.series[VIX.series.length - 1];
const indexByName = Object.fromEntries(INDICES.map((i) => [i.id, i]));

/* ---- Currencies ---- */
const CURRENCY_DEFS = [
  { id: "USDINR", pair: "USD / INR", price: 86.34, drift: 0.03, vol: 0.06, seed: 9101 },
  { id: "EURINR", pair: "EUR / INR", price: 93.78, drift: 0.02, vol: 0.07, seed: 9102 },
  { id: "GBPINR", pair: "GBP / INR", price: 109.42, drift: 0.025, vol: 0.075, seed: 9103 },
  { id: "JPYINR", pair: "JPY / INR (100)", price: 58.12, drift: 0.01, vol: 0.08, seed: 9104 },
  { id: "AEDINR", pair: "AED / INR", price: 23.51, drift: 0.03, vol: 0.05, seed: 9105 },
];
const CURRENCIES = CURRENCY_DEFS.map((d) => ({ ...d, series: genSeries(d.seed, d.price, N_DAYS, d.drift, d.vol, 0.85) }));

/* ---- Sector aggregates (mcap-weighted returns of constituents) ---- */
function sectorConstituents(sectorId) { return COMPANIES.filter((c) => c.sector === sectorId); }
function sectorReturn(sectorId, days) {
  const cons = sectorConstituents(sectorId);
  const totalMcap = cons.reduce((s, c) => s + c.mcapCr, 0);
  if (!totalMcap) return 0;
  return cons.reduce((s, c) => s + c.mcapCr * ret(c, days), 0) / totalMcap;
}
const SECTOR_TABLE = SECTORS.map((s) => {
  const cons = sectorConstituents(s.id);
  const totalMcap = cons.reduce((s2, c) => s2 + c.mcapCr, 0);
  const sorted = [...cons].sort((a, b) => ret(b, RANGE_DAYS["1M"]) - ret(a, RANGE_DAYS["1M"]));
  return {
    ...s, count: cons.length, mcapCr: totalMcap,
    leader: sorted[0], laggard: sorted[sorted.length - 1],
    r1w: sectorReturn(s.id, RANGE_DAYS["1W"]), r1m: sectorReturn(s.id, RANGE_DAYS["1M"]),
    r6m: sectorReturn(s.id, RANGE_DAYS["6M"]), r1y: sectorReturn(s.id, RANGE_DAYS["1Y"]),
  };
});

/* ---- Market breadth (simulated over a broader ~500-stock universe) ---- */
const breadthRnd = mulberry32(42042);
const advancing = 210 + Math.floor(breadthRnd() * 140);
const unchanged = 8 + Math.floor(breadthRnd() * 14);
const declining = 500 - advancing - unchanged;
const MARKET_BREADTH = { advancing, declining, unchanged, total: 500 };

/* ---- "What moved the market" event stream ---- */
const MARKET_EVENT_CATEGORIES = ["Earnings", "Corporate Action", "Ownership", "Macro", "Sector", "Rating", "Filing"];
const MARKET_EVENTS_RAW = [
  { offset: 2, category: "Macro", sector: "financials", relatedLabel: "Nifty Bank",
    headline: "RBI holds repo rate at 6.50%; commentary read as growth-supportive for lenders.",
    detail: "The Monetary Policy Committee kept the policy rate unchanged for a fourth consecutive review, alongside commentary on durable liquidity. Rate-sensitive financials and lenders were in focus through the session." },
  { offset: 6, category: "Sector", sector: "it", relatedLabel: "IT sector",
    headline: "Softer US inflation print lifts risk appetite; IT exporters track a weaker dollar-cost narrative.",
    detail: "A cooler-than-expected US CPI reading supported global risk sentiment overnight. Export-linked IT services names, which draw a large share of revenue from US clients, moved in step with the broader risk-on tone." },
  { offset: 11, category: "Macro", sector: "energy", relatedLabel: "Energy sector",
    headline: "Brent crude eases below $80/bbl, easing input-cost pressure across refiners and paints.",
    detail: "Crude benchmarks slipped on demand concerns out of key importing economies. Lower crude typically eases input costs for refiners, paints and other crude-linked manufacturers, though pass-through varies by company." },
  { offset: 18, category: "Earnings", sector: "financials", relatedLabel: "HDFCBANK, ICICIBANK",
    headline: "Large private banks post steady quarterly loan growth; asset-quality commentary stays benign.",
    detail: "A cluster of private banks reported quarterly results in the same week, with commentary on loan growth and credit costs broadly in line with prior guidance. Individual filings carry the full disclosure detail." },
  { offset: 24, category: "Ownership", sector: "discretionary", relatedLabel: "Auto & discretionary",
    headline: "FPIs turn net buyers after a multi-week selling streak, led by autos and discretionary names.",
    detail: "Foreign portfolio investor flow data turned net positive for the first time in several weeks, with incremental buying concentrated in auto and consumer-discretionary counters per exchange-published provisional data." },
  { offset: 29, category: "Corporate Action", sector: "staples", relatedLabel: "Staples sector",
    headline: "A large FMCG major's board approves a bonus share issue and record date.",
    detail: "The board recommended a bonus issue, subject to shareholder approval, with a record date to be notified separately. Bonus issues do not change underlying company value but do adjust the number of shares outstanding." },
  { offset: 33, category: "Macro", sector: "industrials", relatedLabel: "Nifty 50",
    headline: "Government reiterates capex push in infrastructure spending review; order-book optimism builds.",
    detail: "A periodic government review reaffirmed planned capital expenditure across roads, rail and power transmission. Order-book-driven industrials and capital-goods names were in focus on the back of the commentary." },
  { offset: 38, category: "Rating", sector: "financials", relatedLabel: "Financials sector",
    headline: "A global rating agency revises its outlook on Indian sovereign credit to positive.",
    detail: "The revised outlook cited improving fiscal metrics and growth resilience. Sovereign rating actions can influence borrowing costs economy-wide and are often read across into bank and NBFC funding costs." },
  { offset: 41, category: "Macro", sector: "it", relatedLabel: "USD/INR",
    headline: "Rupee weakens past \u20B986.5/USD, a modest tailwind for export-linked earnings.",
    detail: "The rupee touched a fresh multi-week low against the dollar amid broader emerging-market currency weakness. A weaker rupee is generally read as a modest tailwind for dollar-revenue exporters such as IT services." },
  { offset: 47, category: "Filing", sector: "discretionary", relatedLabel: "Auto sector",
    headline: "Several auto manufacturers file updated capex guidance in investor presentations.",
    detail: "Multiple auto majors filed investor-presentation updates outlining capacity-expansion and EV-transition capex plans for the coming fiscal years, alongside their routine quarterly disclosures." },
  { offset: 55, category: "Sector", sector: "communication", relatedLabel: "Communication sector",
    headline: "Telecom tariff-hike speculation resurfaces ahead of the next spectrum auction cycle.",
    detail: "Media reports pointed to renewed industry discussion around tariff increases ahead of an upcoming spectrum auction window, a recurring theme that has periodically moved telecom operator and tower-company stocks." },
  { offset: 62, category: "Corporate Action", sector: "materials", relatedLabel: "Materials sector",
    headline: "A leading metals producer announces a stock-split record date.",
    detail: "The company set a record date for a previously approved stock split. Splits increase the number of shares outstanding and proportionally reduce the per-share price, without changing overall market value." },
];
const MARKET_EVENTS = MARKET_EVENTS_RAW.map((e, i) => {
  const idx = N_DAYS - 1 - e.offset;
  const refSeries = e.sector ? buildSectorIndexSeries(e.sector) : indexByName.NIFTY50.series;
  return { id: `mkt-ev-${i}`, date: DATES[idx], idx, category: e.category, sector: e.sector, relatedLabel: e.relatedLabel,
    headline: e.headline, detail: e.detail, movePct: windowReturn(refSeries, idx, 3), refSeries };
});


/* ---- Most active (by traded value) ---- */
const MOST_ACTIVE = [...COMPANIES].sort((a, b) => b.tradedValueCr - a.tradedValueCr).slice(0, 8);

/* ============================================================================
   UI ATOMS
============================================================================ */
function Sparkline({ series, width = 96, height = 32, positive, strokeWidth = 1.6 }) {
  if (!series || series.length < 2) return null;
  const min = Math.min(...series), max = Math.max(...series);
  const span = max - min || 1;
  const pts = series.map((v, i) => {
    const x = (i / (series.length - 1)) * (width - 2) + 1;
    const y = height - 2 - ((v - min) / span) * (height - 4);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const color = positive ? T.up : T.down;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: "block" }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function MoveTag({ value, dp = 2, size = 13, dim }) {
  const pos = value >= 0;
  const Icon = pos ? ArrowUpRight : ArrowDownRight;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 2, fontFamily: fontMono,
      fontSize: size, fontWeight: 600, color: pos ? T.up : T.down, opacity: dim ? 0.85 : 1,
    }}>
      <Icon size={size + 1} strokeWidth={2.4} />
      {fmtPct(value, dp)}
    </span>
  );
}

function DemoBadge({ light }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6, fontFamily: fontBody,
      fontSize: 11, fontWeight: 600, letterSpacing: 0.3, padding: "4px 9px", borderRadius: 3,
      color: light ? T.goldDeep : T.gold, background: light ? "rgba(198,161,91,0.14)" : "rgba(198,161,91,0.12)",
      border: `1px solid ${light ? "rgba(143,112,47,0.3)" : "rgba(198,161,91,0.35)"}`,
    }}>
      <Clock size={11.5} /> Demo EOD data · As of {fmtDateShort(END_DATE)}, 15:30 IST
    </span>
  );
}

function SectionHeading({ eyebrow, title, sub, right }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, marginBottom: 16, flexWrap: "wrap" }}>
      <div>
        {eyebrow && <div style={{ fontFamily: fontBody, fontSize: 11.5, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase", color: T.gold, marginBottom: 6 }}>{eyebrow}</div>}
        <h2 style={{ fontFamily: fontDisplay, fontSize: 26, fontWeight: 560, color: T.paper, margin: 0, letterSpacing: -0.2 }}>{title}</h2>
        {sub && <div style={{ fontFamily: fontBody, fontSize: 13.5, color: T.muted, marginTop: 6, maxWidth: 640 }}>{sub}</div>}
      </div>
      {right}
    </div>
  );
}

function RangeTabs({ options, value, onChange, size = "sm", light }) {
  return (
    <div style={{
      display: "inline-flex", padding: 3, borderRadius: 7, gap: 2,
      background: light ? T.paperDim : T.navy900, border: `1px solid ${light ? T.paperLine : T.line}`,
    }}>
      {options.map((o) => {
        const active = o === value;
        return (
          <button key={o} onClick={() => onChange(o)} style={{
            fontFamily: fontBody, fontSize: size === "sm" ? 12 : 13, fontWeight: 600, cursor: "pointer",
            padding: size === "sm" ? "5px 10px" : "6px 13px", borderRadius: 5, border: "none",
            color: active ? (light ? T.ink : T.navy950) : (light ? T.inkDim : T.muted),
            background: active ? T.gold : "transparent", transition: "all .12s ease",
          }}>{o}</button>
        );
      })}
    </div>
  );
}

function Chip({ children, onRemove, tone = "gold" }) {
  const bg = tone === "gold" ? "rgba(198,161,91,0.14)" : "rgba(255,255,255,0.06)";
  const bd = tone === "gold" ? "rgba(198,161,91,0.4)" : T.line;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 7, padding: "6px 8px 6px 12px", borderRadius: 20,
      background: bg, border: `1px solid ${bd}`, fontFamily: fontBody, fontSize: 13, fontWeight: 600, color: T.paper,
    }}>
      {children}
      {onRemove && (
        <button onClick={onRemove} style={{ display: "flex", cursor: "pointer", background: "rgba(255,255,255,0.08)", border: "none", borderRadius: "50%", padding: 3, color: T.muted }}>
          <X size={11} strokeWidth={2.5} />
        </button>
      )}
    </span>
  );
}

function InfoTip({ text, mode }) {
  const [open, setOpen] = useState(false);
  return (
    <span style={{ position: "relative", display: "inline-flex", marginLeft: 5 }}
      onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <Info size={13} style={{ color: T.muted, cursor: "help" }} />
      {open && (
        <span style={{
          position: "absolute", bottom: "130%", left: "50%", transform: "translateX(-50%)", width: 220,
          background: T.navy950, border: `1px solid ${T.line}`, borderRadius: 7, padding: "9px 11px",
          fontFamily: fontBody, fontSize: 12, lineHeight: 1.5, color: T.paper, zIndex: 40,
          boxShadow: "0 8px 24px rgba(0,0,0,0.4)", fontWeight: 400,
        }}>{text}</span>
      )}
    </span>
  );
}

function ExplainRow({ mode, text }) {
  if (mode !== "explore") return null;
  return <div style={{ fontFamily: fontBody, fontSize: 12, color: T.inkDim, marginTop: 4, lineHeight: 1.5 }}>{text}</div>;
}

/* Gates dense/technical content behind Explore mode; offers a direct switch to Research mode. */
function ModeUpsell({ setMode, label, summary }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap",
      background: T.navy850, border: `1px dashed ${T.line}`, borderRadius: 10, padding: "13px 16px",
    }}>
      <div style={{ fontFamily: fontBody, fontSize: 12.5, color: T.muted, lineHeight: 1.5, maxWidth: 480 }}>{summary}</div>
      <button onClick={() => setMode && setMode("research")} style={{
        display: "flex", alignItems: "center", gap: 6, flexShrink: 0, background: "none", cursor: "pointer",
        border: `1px solid ${T.gold}66`, color: T.gold, borderRadius: 6, padding: "7px 12px", fontFamily: fontBody, fontSize: 12, fontWeight: 700,
      }}>{label || "Switch to Research mode"} <ArrowRight size={12} /></button>
    </div>
  );
}

function EmptyState({ icon: Icon, title, body, action }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center",
      padding: "64px 24px", border: `1px dashed ${T.line}`, borderRadius: 12, gap: 10,
    }}>
      <div style={{ width: 48, height: 48, borderRadius: "50%", background: "rgba(198,161,91,0.1)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 6 }}>
        <Icon size={22} style={{ color: T.gold }} />
      </div>
      <div style={{ fontFamily: fontDisplay, fontSize: 19, color: T.paper, fontWeight: 560 }}>{title}</div>
      <div style={{ fontFamily: fontBody, fontSize: 13.5, color: T.muted, maxWidth: 360, lineHeight: 1.6 }}>{body}</div>
      {action}
    </div>
  );
}

function GoldButton({ children, onClick, small, outline, icon: Icon }) {
  return (
    <button onClick={onClick} style={{
      display: "inline-flex", alignItems: "center", gap: 7, cursor: "pointer",
      fontFamily: fontBody, fontWeight: 700, fontSize: small ? 12.5 : 13.5, letterSpacing: 0.1,
      padding: small ? "7px 12px" : "9px 16px", borderRadius: 6,
      background: outline ? "transparent" : T.gold, color: outline ? T.gold : T.navy950,
      border: `1px solid ${T.gold}`,
    }}>
      {Icon && <Icon size={small ? 13 : 15} />}
      {children}
    </button>
  );
}

function IconGhostButton({ children, onClick, active, title }) {
  return (
    <button onClick={onClick} title={title} style={{
      display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer",
      fontFamily: fontBody, fontWeight: 600, fontSize: 12.5, padding: "7px 11px", borderRadius: 6,
      background: active ? "rgba(198,161,91,0.14)" : "transparent",
      border: `1px solid ${active ? "rgba(198,161,91,0.4)" : T.line}`,
      color: active ? T.gold : T.muted,
    }}>{children}</button>
  );
}

function Drawer({ title, onClose, children }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", justifyContent: "flex-end" }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(6,10,20,0.6)" }} />
      <div style={{
        position: "relative", width: "min(440px, 92vw)", height: "100%", background: T.navy900,
        borderLeft: `1px solid ${T.line}`, padding: "26px 28px", overflowY: "auto",
        boxShadow: "-16px 0 40px rgba(0,0,0,0.35)",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
          <h3 style={{ fontFamily: fontDisplay, fontSize: 22, color: T.paper, margin: 0, fontWeight: 560 }}>{title}</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: T.muted, padding: 4 }}><X size={20} /></button>
        </div>
        <div style={{ fontFamily: fontBody, fontSize: 13.5, color: T.muted, lineHeight: 1.75 }}>{children}</div>
      </div>
    </div>
  );
}

function Th({ children, align = "left", width }) {
  return (
    <th style={{
      textAlign: align, fontFamily: fontBody, fontSize: 11, fontWeight: 700, letterSpacing: 0.5,
      textTransform: "uppercase", color: T.mutedDark, padding: "9px 12px", whiteSpace: "nowrap", width,
      borderBottom: `1px solid ${T.line}`, position: "sticky", top: 0, background: T.navy850, zIndex: 1,
    }}>{children}</th>
  );
}
function Td({ children, align = "left", mono, strong, color, width }) {
  return (
    <td style={{
      textAlign: align, fontFamily: mono ? fontMono : fontBody, fontSize: 13, padding: "10px 12px",
      color: color || T.paper, fontWeight: strong ? 700 : 400, borderBottom: `1px solid ${T.lineSoft}`,
      whiteSpace: "nowrap", width,
    }}>{children}</td>
  );
}

/* ============================================================================
   HEADER + GLOBAL SEARCH
============================================================================ */
const NAV_ITEMS = [
  { id: "markets", label: "Markets" },
  { id: "stocks", label: "Stocks" },
  { id: "sectors", label: "Sectors" },
  { id: "compare", label: "Compare" },
  { id: "currencies", label: "Currencies" },
  { id: "watchlist", label: "Watchlist" },
];

function SearchResults({ query, onPick }) {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  const matches = COMPANIES.filter((c) =>
    c.ticker.toLowerCase().includes(q) || c.name.toLowerCase().includes(q) || sectorById[c.sector].name.toLowerCase().includes(q)
  ).slice(0, 8);
  return (
    <div style={{
      position: "absolute", top: "calc(100% + 8px)", left: 0, right: 0, background: T.navy850,
      border: `1px solid ${T.line}`, borderRadius: 10, boxShadow: "0 20px 50px rgba(0,0,0,0.45)",
      overflow: "hidden", zIndex: 200,
    }}>
      {matches.length === 0 ? (
        <div style={{ padding: "22px 18px", fontFamily: fontBody, fontSize: 13, color: T.muted }}>
          No matches for &ldquo;{query}&rdquo;. Try a ticker like RELIANCE or TCS.
        </div>
      ) : matches.map((c) => {
        const day = ret(c, 1);
        return (
          <button key={c.ticker} onClick={() => onPick(c.ticker)} style={{
            display: "flex", width: "100%", alignItems: "center", justifyContent: "space-between",
            gap: 14, padding: "11px 16px", background: "transparent", border: "none", cursor: "pointer",
            borderBottom: `1px solid ${T.lineSoft}`, textAlign: "left",
          }}
            onMouseEnter={(e) => (e.currentTarget.style.background = T.navy800)}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontFamily: fontMono, fontSize: 12.5, fontWeight: 700, color: T.gold }}>{c.ticker}</span>
                <span style={{ fontFamily: fontBody, fontSize: 13, color: T.paper, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
              </div>
              <div style={{ fontFamily: fontBody, fontSize: 11.5, color: T.muted, marginTop: 2 }}>{sectorById[c.sector].name}</div>
            </div>
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <div style={{ fontFamily: fontMono, fontSize: 13, color: T.paper, fontWeight: 600 }}>{fmtPrice(c.price)}</div>
              <MoveTag value={day} size={11.5} />
            </div>
          </button>
        );
      })}
    </div>
  );
}

function GlobalSearch({ onPick, placeholder = "Search RELIANCE, TCS, HDFC Bank\u2026", full }) {
  const [q, setQ] = useState("");
  const [focused, setFocused] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    function onKey(e) {
      const tag = (e.target.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea") return;
      if (e.key === "/" || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k")) {
        e.preventDefault(); ref.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <div style={{ position: "relative", width: full ? "100%" : 340 }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 9, background: T.navy900, border: `1px solid ${focused ? T.gold : T.line}`,
        borderRadius: 8, padding: "9px 12px", transition: "border-color .12s ease",
      }}>
        <Search size={15} style={{ color: focused ? T.gold : T.muted, flexShrink: 0 }} />
        <input
          ref={ref} value={q} placeholder={placeholder}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          style={{
            flex: 1, background: "transparent", border: "none", outline: "none", fontFamily: fontBody,
            fontSize: 13.5, color: T.paper, minWidth: 0,
          }}
        />
        {!focused && !q && (
          <span style={{
            display: "flex", alignItems: "center", gap: 3, fontFamily: fontMono, fontSize: 10.5, color: T.mutedDark,
            border: `1px solid ${T.line}`, borderRadius: 4, padding: "2px 5px", flexShrink: 0,
          }}><Command size={10} />K</span>
        )}
        {q && <button onClick={() => setQ("")} style={{ background: "none", border: "none", cursor: "pointer", color: T.muted, display: "flex" }}><X size={14} /></button>}
      </div>
      {focused && q && <SearchResults query={q} onPick={(t) => { onPick(t); setQ(""); }} />}
    </div>
  );
}

function Header({ mode, setMode, page, navigate, watchlistCount, compareCount }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  return (
    <header style={{ position: "sticky", top: 0, zIndex: 90, background: T.navy950, borderBottom: `1px solid ${T.line}` }}>
      <div style={{ maxWidth: 1360, margin: "0 auto", padding: "0 24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 24, height: 62 }}>
          <button onClick={() => navigate("markets")} style={{ display: "flex", alignItems: "baseline", gap: 3, background: "none", border: "none", cursor: "pointer", flexShrink: 0 }}>
            <span style={{ fontFamily: fontDisplay, fontSize: 22, fontWeight: 650, color: T.paper, letterSpacing: -0.3 }}>StockDekho</span>
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: T.gold, marginLeft: 2, marginBottom: 3 }} />
          </button>

          <nav style={{ display: "flex", alignItems: "center", gap: 2 }} className="sd-desktop-nav">
            {NAV_ITEMS.map((n) => (
              <button key={n.id} onClick={() => navigate(n.id)} style={{
                fontFamily: fontBody, fontSize: 13.5, fontWeight: 600, padding: "8px 12px", borderRadius: 6,
                background: page === n.id ? T.navy800 : "transparent", color: page === n.id ? T.paper : T.muted,
                border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap",
              }}>
                {n.label}
                {n.id === "watchlist" && watchlistCount > 0 && (
                  <span style={{ fontFamily: fontMono, fontSize: 10.5, background: T.gold, color: T.navy950, borderRadius: 10, padding: "1px 6px", fontWeight: 700 }}>{watchlistCount}</span>
                )}
                {n.id === "compare" && compareCount > 0 && (
                  <span style={{ fontFamily: fontMono, fontSize: 10.5, background: T.gold, color: T.navy950, borderRadius: 10, padding: "1px 6px", fontWeight: 700 }}>{compareCount}</span>
                )}
              </button>
            ))}
          </nav>

          <div style={{ flex: 1 }} />

          <div className="sd-desktop-search"><GlobalSearch onPick={(t) => navigate("company", { ticker: t })} /></div>

          <div style={{
            display: "flex", padding: 3, borderRadius: 8, background: T.navy900, border: `1px solid ${T.line}`, flexShrink: 0,
          }}>
            {["explore", "research"].map((m) => (
              <button key={m} onClick={() => setMode(m)} style={{
                fontFamily: fontBody, fontSize: 12.5, fontWeight: 700, padding: "7px 13px", borderRadius: 6,
                border: "none", cursor: "pointer", textTransform: "capitalize",
                background: mode === m ? T.gold : "transparent", color: mode === m ? T.navy950 : T.muted,
              }}>{m}</button>
            ))}
          </div>

          <button className="sd-mobile-toggle" onClick={() => setMobileOpen((v) => !v)} style={{ display: "none", background: "none", border: "none", color: T.paper, cursor: "pointer" }}>
            <SlidersHorizontal size={20} />
          </button>
        </div>

        {mobileOpen && (
          <div className="sd-mobile-nav" style={{ display: "flex", flexDirection: "column", gap: 4, paddingBottom: 14 }}>
            <GlobalSearch full onPick={(t) => { navigate("company", { ticker: t }); setMobileOpen(false); }} />
            {NAV_ITEMS.map((n) => (
              <button key={n.id} onClick={() => { navigate(n.id); setMobileOpen(false); }} style={{
                textAlign: "left", fontFamily: fontBody, fontSize: 14, fontWeight: 600, padding: "10px 6px",
                background: "transparent", border: "none", color: page === n.id ? T.gold : T.paper, cursor: "pointer",
              }}>{n.label}</button>
            ))}
          </div>
        )}
      </div>
    </header>
  );
}

/* ============================================================================
   MARKETS HOME PAGE
============================================================================ */
function MiniAreaChart({ data, positive, height = 220, gridLines = true }) {
  const color = positive ? T.up : T.down;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={`fill-${positive ? "up" : "down"}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.32} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        {gridLines && <CartesianGrid stroke={T.lineSoft} strokeDasharray="2 4" vertical={false} />}
        <XAxis dataKey="label" tick={{ fill: T.mutedDark, fontFamily: fontMono, fontSize: 10 }} axisLine={{ stroke: T.line }} tickLine={false} minTickGap={40} />
        <YAxis domain={["dataMin", "dataMax"]} hide />
        <Tooltip content={<ChartTooltip />} />
        <Area type="monotone" dataKey="value" stroke={color} strokeWidth={2} fill={`url(#fill-${positive ? "up" : "down"})`} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
function ChartTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div style={{ background: T.navy950, border: `1px solid ${T.line}`, borderRadius: 6, padding: "8px 11px", fontFamily: fontMono, fontSize: 12 }}>
      <div style={{ color: T.muted, marginBottom: 2 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color || T.paper, fontWeight: 600 }}>{typeof p.value === "number" ? fmtNum(p.value, 2) : p.value}{p.name && p.name !== "value" ? ` \u00B7 ${p.name}` : ""}</div>
      ))}
    </div>
  );
}

function IndexStripCard({ idx, isVix, onClick }) {
  const series = idx.series;
  const day = seriesReturn(series, 1);
  const price = series[series.length - 1];
  const spark = series.slice(-42);
  return (
    <button onClick={onClick} style={{
      minWidth: 190, background: T.navy850, border: `1px solid ${T.line}`, borderRadius: 10, padding: "14px 16px",
      display: "flex", flexDirection: "column", gap: 8, flex: "1 1 190px", cursor: "pointer", textAlign: "left", font: "inherit",
    }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = T.gold)}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = T.line)}>
      <div style={{ fontFamily: fontBody, fontSize: 12, fontWeight: 700, color: T.muted, letterSpacing: 0.2 }}>{idx.name}</div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
        <span style={{ fontFamily: fontMono, fontSize: 19, fontWeight: 700, color: T.paper }}>{isVix ? price.toFixed(2) : inr(price, 2)}</span>
        <Sparkline series={spark} positive={day >= 0} width={64} height={26} />
      </div>
      <MoveTag value={day} size={12.5} />
    </button>
  );
}

function BenchmarkDrawerContent({ idxObj, isVix }) {
  const [range, setRange] = useState("1Y");
  const series = idxObj.series;
  const days = RANGE_DAYS[range];
  const slice = series.slice(-days).map((v, i, arr) => ({ label: fmtDateShort(DATES[DATES.length - arr.length + i]), value: v }));
  const chRet = seriesReturn(series, days);
  const price = series[series.length - 1];
  const last252 = series.slice(-252);
  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 4 }}>
        <span style={{ fontFamily: fontMono, fontSize: 26, fontWeight: 700, color: T.paper }}>{isVix ? price.toFixed(2) : inr(price, 2)}</span>
        <MoveTag value={seriesReturn(series, 1)} />
      </div>
      <div style={{ fontFamily: fontBody, fontSize: 11.5, color: T.mutedDark, marginBottom: 14 }}>
        52W range: {isVix ? Math.min(...last252).toFixed(2) : inr(Math.min(...last252), 2)} \u2013 {isVix ? Math.max(...last252).toFixed(2) : inr(Math.max(...last252), 2)}
      </div>
      <div style={{ marginBottom: 12 }}><RangeTabs options={["1M", "3M", "6M", "1Y", "3Y", "5Y"]} value={range} onChange={setRange} /></div>
      <MiniAreaChart data={slice} positive={chRet >= 0} height={220} />
      <div style={{ fontFamily: fontBody, fontSize: 11.5, color: T.mutedDark, marginTop: 12 }}>
        {isVix ? "India VIX is an implied-volatility gauge derived from Nifty options premiums \u2014 higher readings signal the market is pricing in larger near-term swings." : "Demo EOD index level shown for research context. Not a tradable instrument."}
      </div>
    </div>
  );
}

function SectorHeatmap({ range, onPick }) {
  const key = { "1W": "r1w", "1M": "r1m", "6M": "r6m", "1Y": "r1y" }[range];
  const vals = SECTOR_TABLE.map((s) => s[key]);
  const maxAbs = Math.max(...vals.map((v) => Math.abs(v)), 1);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 8 }}>
      {SECTOR_TABLE.map((s) => {
        const v = s[key];
        const intensity = Math.min(Math.abs(v) / maxAbs, 1);
        const color = v >= 0 ? T.up : T.down;
        const bg = v >= 0 ? `rgba(61,139,98,${0.14 + intensity * 0.34})` : `rgba(178,75,60,${0.14 + intensity * 0.34})`;
        return (
          <button key={s.id} onClick={() => onPick(s.id)} style={{
            background: bg, border: `1px solid ${color}55`, borderRadius: 9, padding: "13px 14px", textAlign: "left",
            cursor: "pointer", display: "flex", flexDirection: "column", gap: 5, minHeight: 78,
          }}>
            <span style={{ fontFamily: fontBody, fontSize: 12.5, fontWeight: 700, color: T.paper, lineHeight: 1.25 }}>{s.name}</span>
            <MoveTag value={v} size={13} />
            <span style={{ fontFamily: fontMono, fontSize: 10.5, color: T.muted }}>{s.count} stocks</span>
          </button>
        );
      })}
    </div>
  );
}

function PerformersTable({ title, rows, positive, onPick, watchlist, toggleWatch }) {
  return (
    <div style={{ flex: 1, minWidth: 280 }}>
      <div style={{ fontFamily: fontBody, fontSize: 12.5, fontWeight: 700, color: T.muted, marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
        {positive ? <TrendingUp size={14} style={{ color: T.up }} /> : <TrendingDown size={14} style={{ color: T.down }} />} {title}
      </div>
      <div style={{ border: `1px solid ${T.line}`, borderRadius: 10, overflow: "hidden" }}>
        {rows.map((c, i) => (
          <button key={c.ticker} onClick={() => onPick(c.ticker)} style={{
            width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
            padding: "10px 13px", background: i % 2 ? T.navy900 : T.navy850, border: "none", borderTop: i ? `1px solid ${T.lineSoft}` : "none",
            cursor: "pointer", textAlign: "left",
          }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: fontMono, fontSize: 12.5, fontWeight: 700, color: T.paper }}>{c.ticker}</div>
              <div style={{ fontFamily: fontBody, fontSize: 11, color: T.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 160 }}>{c.name}</div>
            </div>
            <MoveTag value={c._r} size={12.5} />
          </button>
        ))}
      </div>
    </div>
  );
}

/* ---- "What moved the market" editorial event strip ---- */
const EVENT_CATEGORY_COLOR = {
  Earnings: T.gold, "Corporate Action": T.mutedDark, Ownership: T.down, Macro: "#4B9BC9",
  Sector: T.up, Rating: "#8B7FD1", Filing: "#C98A4B",
};
function MarketEventCard({ e, onClick, compact }) {
  return (
    <button onClick={onClick} style={{
      textAlign: "left", display: "flex", flexDirection: "column", gap: 8, background: T.navy850, border: `1px solid ${T.line}`,
      borderRadius: 11, padding: compact ? "13px 14px" : "16px 18px", cursor: "pointer", height: "100%",
    }}
      onMouseEnter={(e2) => (e2.currentTarget.style.borderColor = T.gold)}
      onMouseLeave={(e2) => (e2.currentTarget.style.borderColor = T.line)}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span style={{
          fontFamily: fontBody, fontSize: 10, fontWeight: 700, color: EVENT_CATEGORY_COLOR[e.category] || T.gold,
          textTransform: "uppercase", letterSpacing: 0.5, border: `1px solid ${EVENT_CATEGORY_COLOR[e.category] || T.gold}55`,
          borderRadius: 20, padding: "3px 9px",
        }}>{e.category}</span>
        <span style={{ fontFamily: fontMono, fontSize: 10.5, color: T.mutedDark }}>{fmtDateShort(e.date)}</span>
      </div>
      <div style={{ fontFamily: fontBody, fontSize: 13.5, color: T.paper, lineHeight: 1.5, flex: 1 }}>{e.headline}</div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, paddingTop: 6, borderTop: `1px solid ${T.lineSoft}` }}>
        <span style={{ fontFamily: fontBody, fontSize: 11, color: T.muted }}>{e.relatedLabel}</span>
        <MoveTag value={e.movePct} size={11.5} />
      </div>
    </button>
  );
}
function MarketEventDetail({ e }) {
  const chartData = e.refSeries.slice(Math.max(0, e.idx - 20), e.idx + 20).map((v, i, arr) => ({ label: `D${i - 20}`, value: v }));
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{
          fontFamily: fontBody, fontSize: 10.5, fontWeight: 700, color: EVENT_CATEGORY_COLOR[e.category] || T.gold,
          textTransform: "uppercase", letterSpacing: 0.5, border: `1px solid ${EVENT_CATEGORY_COLOR[e.category] || T.gold}55`, borderRadius: 20, padding: "3px 10px",
        }}>{e.category}</span>
        <span style={{ fontFamily: fontMono, fontSize: 12, color: T.mutedDark }}>{fmtDate(e.date)}, 15:30 IST</span>
      </div>
      <p style={{ fontFamily: fontBody, fontSize: 14, color: T.paper, lineHeight: 1.65, marginTop: 0 }}>{e.detail}</p>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <span style={{ fontFamily: fontBody, fontSize: 12, color: T.muted }}>Related: {e.relatedLabel}</span>
        <MoveTag value={e.movePct} />
      </div>
      <div style={{ fontFamily: fontBody, fontSize: 11.5, fontWeight: 700, color: T.mutedDark, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 8 }}>Related price movement, \u00B120 sessions</div>
      <MiniAreaChart data={chartData} positive={e.movePct >= 0} height={160} gridLines={false} />
      <div style={{ fontFamily: fontBody, fontSize: 11.5, color: T.mutedDark, marginTop: 12, lineHeight: 1.55 }}>
        This is a factual, neutral account of a disclosed or reported event and the nearby price move \u2014 it does not assert that the event caused the move, and is not investment advice.
      </div>
    </div>
  );
}
function MarketEventsListDrawerContent({ onPick }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {[...MARKET_EVENTS].sort((a, b) => b.date - a.date).map((e) => (
        <button key={e.id} onClick={() => onPick(e)} style={{
          textAlign: "left", display: "flex", gap: 10, background: T.navy900, border: `1px solid ${T.lineSoft}`,
          borderRadius: 9, padding: "11px 13px", cursor: "pointer",
        }}>
          <div style={{ width: 3, borderRadius: 2, background: EVENT_CATEGORY_COLOR[e.category] || T.gold, flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 3, flexWrap: "wrap" }}>
              <span style={{ fontFamily: fontBody, fontSize: 10, fontWeight: 700, color: EVENT_CATEGORY_COLOR[e.category] || T.gold, textTransform: "uppercase", letterSpacing: 0.4 }}>{e.category}</span>
              <span style={{ fontFamily: fontMono, fontSize: 10.5, color: T.mutedDark }}>{fmtDateShort(e.date)}</span>
            </div>
            <div style={{ fontFamily: fontBody, fontSize: 12.5, color: T.paper, lineHeight: 1.45 }}>{e.headline}</div>
          </div>
          <MoveTag value={e.movePct} size={11} />
        </button>
      ))}
    </div>
  );
}
function MarketEventStrip({ navigate }) {
  const [drawer, setDrawer] = useState(null); // { type: 'detail', event } | { type: 'list' } | null
  const featured = [...MARKET_EVENTS].sort((a, b) => b.date - a.date).slice(0, 4);
  return (
    <div style={{ marginBottom: 32 }}>
      <SectionHeading eyebrow="Context" title="What moved the market?"
        sub="High-signal events from the last few sessions, with the nearby move in the related market, sector or stock. Not a claim of cause and effect."
        right={<GoldButton small outline onClick={() => setDrawer({ type: "list" })}>View all market events</GoldButton>} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
        {featured.map((e) => <MarketEventCard key={e.id} e={e} onClick={() => setDrawer({ type: "detail", event: e })} />)}
      </div>
      {drawer && drawer.type === "detail" && (
        <Drawer title="Market event" onClose={() => setDrawer(null)}><MarketEventDetail e={drawer.event} /></Drawer>
      )}
      {drawer && drawer.type === "list" && (
        <Drawer title="All market events" onClose={() => setDrawer(null)}>
          <MarketEventsListDrawerContent onPick={(e) => setDrawer({ type: "detail", event: e })} />
        </Drawer>
      )}
    </div>
  );
}

function MarketsPage({ navigate, watchlist, toggleWatch }) {
  const [heatRange, setHeatRange] = useState("1M");
  const [perfRange, setPerfRange] = useState("This Week");
  const [excludeSmall, setExcludeSmall] = useState(true);
  const [benchmarkDrawer, setBenchmarkDrawer] = useState(null); // { idx, isVix } | null
  const perfDays = { "This Week": "1W", "This Month": "1M", "6 Months": "6M", "1 Year": "1Y" }[perfRange];
  const nifty = indexByName.NIFTY50;
  const usdinr = CURRENCIES[0];

  const universe = useMemo(() => COMPANIES.filter((c) => !excludeSmall || c.mcapCr >= 50000), [excludeSmall]);
  const withReturns = universe.map((c) => ({ ...c, _r: ret(c, RANGE_DAYS[perfDays]) })).sort((a, b) => b._r - a._r);
  const gainers = withReturns.slice(0, 5);
  const losers = [...withReturns].reverse().slice(0, 5);

  const topSectorByMonth = [...SECTOR_TABLE].sort((a, b) => b.r1m - a.r1m)[0];
  const breadthTilt = MARKET_BREADTH.advancing > MARKET_BREADTH.declining ? "improves" : "narrows";
  const niftyDay = seriesReturn(nifty.series, 1);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, flexWrap: "wrap", gap: 10 }}>
        <DemoBadge />
      </div>

      {/* 1. Benchmark strip */}
      <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 4, marginBottom: 28 }}>
        {INDICES.filter((idx) => idx.id !== "SENSEX").map((idx) => (
          <IndexStripCard key={idx.id} idx={idx} onClick={() => setBenchmarkDrawer({ idx, isVix: false })} />
        ))}
        <IndexStripCard idx={VIX} isVix onClick={() => setBenchmarkDrawer({ idx: VIX, isVix: true })} />
        <IndexStripCard idx={indexByName.SENSEX} onClick={() => setBenchmarkDrawer({ idx: indexByName.SENSEX, isVix: false })} />
      </div>
      {benchmarkDrawer && (
        <Drawer title={benchmarkDrawer.idx.name} onClose={() => setBenchmarkDrawer(null)}>
          <BenchmarkDrawerContent idxObj={benchmarkDrawer.idx} isVix={benchmarkDrawer.isVix} />
        </Drawer>
      )}

      {/* 2. Headline */}
      <div style={{
        background: `linear-gradient(135deg, ${T.navy850}, ${T.navy900})`, border: `1px solid ${T.line}`,
        borderRadius: 14, padding: "30px 32px", marginBottom: 32, display: "flex", justifyContent: "space-between", gap: 24, flexWrap: "wrap",
      }}>
        <div style={{ maxWidth: 620 }}>
          <div style={{ fontFamily: fontBody, fontSize: 11.5, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase", color: T.gold, marginBottom: 10 }}>Market leadership</div>
          <h1 style={{ fontFamily: fontDisplay, fontSize: 34, fontWeight: 600, color: T.paper, margin: 0, lineHeight: 1.15, letterSpacing: -0.4 }}>
            {topSectorByMonth.name} lead{topSectorByMonth.name.endsWith("s") ? "" : "s"} as market breadth {breadthTilt}
          </h1>
          <p style={{ fontFamily: fontBody, fontSize: 14.5, color: T.muted, marginTop: 14, lineHeight: 1.65 }}>
            The Nifty 50 is {niftyDay >= 0 ? "higher" : "lower"} at today's close, with {topSectorByMonth.name.toLowerCase()} the strongest sector
            over the past month ({fmtPct(topSectorByMonth.r1m)}). {MARKET_BREADTH.advancing} stocks advanced against {MARKET_BREADTH.declining} decliners
            in the broader sample, a breadth picture that has {breadthTilt === "improves" ? "improved" : "narrowed"} through the session.
          </p>
        </div>
        <div style={{ display: "flex", gap: 22, flexWrap: "wrap", alignItems: "center" }}>
          <BreadthGauge />
        </div>
      </div>

      {/* 3. What moved the market \u2014 immediately after strip + headline, before heatmap/performers */}
      <MarketEventStrip navigate={navigate} />

      {/* Sector heatmap */}
      <div style={{ marginBottom: 32 }}>
        <SectionHeading eyebrow="Sector rotation" title="Where is leadership occurring?"
          sub="Sector Classification performance, weighted by free-float market capitalisation."
          right={<RangeTabs options={["1W", "1M", "6M", "1Y"]} value={heatRange} onChange={setHeatRange} />} />
        <SectorHeatmap range={heatRange} onPick={(id) => navigate("sectors", { sectorId: id })} />
      </div>

      {/* Performers */}
      <div style={{ marginBottom: 32 }}>
        <SectionHeading eyebrow="Screeners" title="Best & worst performers"
          right={<RangeTabs options={["This Week", "This Month", "6 Months", "1 Year"]} value={perfRange} onChange={setPerfRange} />} />
        <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, fontFamily: fontBody, fontSize: 12.5, color: T.muted, cursor: "pointer" }}>
          <input type="checkbox" checked={excludeSmall} onChange={(e) => setExcludeSmall(e.target.checked)} style={{ accentColor: T.gold }} />
          Exclude small & illiquid names (&lt; \u20B950,000 Cr market cap)
        </label>
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
          <PerformersTable title={`Top gainers \u00B7 ${perfRange}`} rows={gainers} positive onPick={(t) => navigate("company", { ticker: t })} />
          <PerformersTable title={`Top losers \u00B7 ${perfRange}`} rows={losers} onPick={(t) => navigate("company", { ticker: t })} />
        </div>
      </div>

      {/* Most active */}
      <div style={{ marginBottom: 32 }}>
        <SectionHeading eyebrow="Liquidity" title="Most active by traded value" />
        <div style={{ border: `1px solid ${T.line}`, borderRadius: 10, overflow: "hidden", maxWidth: 640 }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><Th>Company</Th><Th align="right">LTP</Th><Th align="right">Chg</Th><Th align="right">Traded value</Th></tr></thead>
            <tbody>
              {MOST_ACTIVE.map((c) => (
                <tr key={c.ticker} onClick={() => navigate("company", { ticker: c.ticker })} style={{ cursor: "pointer" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = T.navy900)} onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                  <Td><span style={{ fontFamily: fontMono, fontWeight: 700, color: T.gold, marginRight: 8 }}>{c.ticker}</span><span style={{ color: T.muted, fontSize: 12 }}>{sectorById[c.sector].name}</span></Td>
                  <Td align="right" mono>{fmtPrice(c.price)}</Td>
                  <Td align="right"><MoveTag value={ret(c, 1)} size={12} /></Td>
                  <Td align="right" mono>{fmtCr(c.tradedValueCr)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Featured charts */}
      <div>
        <SectionHeading eyebrow="Featured" title="Benchmarks at a glance" />
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
          <FeaturedChartCard title="Nifty 50" series={nifty.series} price={nifty.series[nifty.series.length - 1]} isPrice />
          <FeaturedChartCard title="INR / USD" series={usdinr.series} price={usdinr.series[usdinr.series.length - 1]} />
        </div>
      </div>
    </div>
  );
}

function BreadthGauge() {
  const { advancing, declining, unchanged, total } = MARKET_BREADTH;
  const advPct = (advancing / total) * 100, decPct = (declining / total) * 100;
  return (
    <div style={{ minWidth: 220 }}>
      <div style={{ fontFamily: fontBody, fontSize: 11.5, fontWeight: 700, color: T.muted, letterSpacing: 0.4, marginBottom: 10, textTransform: "uppercase" }}>Market breadth</div>
      <div style={{ display: "flex", height: 10, borderRadius: 6, overflow: "hidden", marginBottom: 10 }}>
        <div style={{ width: `${advPct}%`, background: T.up }} />
        <div style={{ width: `${(unchanged / total) * 100}%`, background: T.muted }} />
        <div style={{ width: `${decPct}%`, background: T.down }} />
      </div>
      <div style={{ display: "flex", gap: 16, fontFamily: fontMono, fontSize: 12.5 }}>
        <span style={{ color: T.up }}>{advancing} adv</span>
        <span style={{ color: T.muted }}>{unchanged} flat</span>
        <span style={{ color: T.down }}>{declining} dec</span>
      </div>
    </div>
  );
}

function FeaturedChartCard({ title, series, price, isPrice }) {
  const [range, setRange] = useState("1Y");
  const days = RANGE_DAYS[range];
  const slice = series.slice(-days).map((v, i, arr) => ({ label: fmtDateShort(DATES[DATES.length - arr.length + i]), value: v }));
  const chRet = seriesReturn(series, days);
  return (
    <div style={{ flex: "1 1 420px", background: T.navy850, border: `1px solid ${T.line}`, borderRadius: 12, padding: "18px 20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10, flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ fontFamily: fontBody, fontSize: 13, fontWeight: 700, color: T.paper }}>{title}</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 4 }}>
            <span style={{ fontFamily: fontMono, fontSize: 20, fontWeight: 700, color: T.paper }}>{isPrice ? inr(price, 2) : price.toFixed(3)}</span>
            <MoveTag value={chRet} />
          </div>
        </div>
        <RangeTabs options={["1M", "6M", "1Y", "5Y"]} value={range} onChange={setRange} />
      </div>
      <MiniAreaChart data={slice} positive={chRet >= 0} height={170} />
    </div>
  );
}

/* ============================================================================
   ALL NSE STOCKS — directory & screener
============================================================================ */
const METRIC_HELP = {
  pe: "Price-to-Earnings compares the share price to per-share profit. A higher P/E means investors are paying more for each rupee of current earnings.",
  pb: "Price-to-Book compares the share price to per-share net worth. Useful for capital-heavy businesses like banks.",
  roe: "Return on Equity shows how efficiently a company turns shareholders' capital into profit.",
  roce: "Return on Capital Employed measures profit generated on all capital used, including debt \u2014 useful for comparing capital-intensive businesses.",
  divYield: "Dividend Yield is the annual dividend per share divided by the current share price.",
  de: "Debt-to-Equity shows how much borrowed capital a company uses relative to shareholders' funds. Lower is generally more conservative.",
  ret1y: "The share price change over the trailing one year, excluding dividends.",
  tradedValueCr: "The rupee value of shares that changed hands in a day \u2014 a proxy for how easily a stock can be bought or sold without moving the price.",
};
const METRIC_WHY = {
  pe: "A very high P/E versus peers can mean the market expects strong future growth \u2014 or that the stock is simply expensive.",
  pb: "Useful for checking whether a stock trades close to, above, or below the accounting value of its net assets.",
  roe: "Consistently high ROE alongside low debt is often a sign of a durable, capital-efficient business.",
  roce: "Compares more fairly across companies that use different amounts of debt to fund growth.",
  divYield: "Higher yield can mean steady cash returns, but can also signal the market expects limited price growth.",
  de: "Higher leverage amplifies both gains and losses, and adds sensitivity to interest-rate changes.",
  ret1y: "Shows momentum over the last year, but says nothing about valuation or business quality on its own.",
  tradedValueCr: "Thinly traded stocks can be harder to enter or exit at the quoted price, especially in size.",
};
function TwoPartTip({ metricKey }) {
  return (
    <span style={{ display: "inline-flex", gap: 2 }}>
      <InfoTip text={`What does this mean? ${METRIC_HELP[metricKey]}`} />
    </span>
  );
}
const MCAP_BANDS = [
  { id: "all", label: "All caps", test: () => true },
  { id: "large", label: "Large Cap (\u2265 \u20B975,000 Cr)", test: (c) => c.mcapCr >= 75000 },
  { id: "mid", label: "Mid Cap (\u20B920,000\u201375,000 Cr)", test: (c) => c.mcapCr >= 20000 && c.mcapCr < 75000 },
  { id: "small", label: "Small Cap (\u20B95,000\u201320,000 Cr)", test: (c) => c.mcapCr >= 5000 && c.mcapCr < 20000 },
  { id: "micro", label: "Micro Cap (< \u20B95,000 Cr)", test: (c) => c.mcapCr < 5000 },
];
const VAL_BANDS = [
  { id: "all", label: "Any valuation", test: () => true },
  { id: "value", label: "Value (P/E < 20)", test: (c) => c.pe < 20 },
  { id: "core", label: "Core (P/E 20\u201335)", test: (c) => c.pe >= 20 && c.pe <= 35 },
  { id: "premium", label: "Premium (P/E > 35)", test: (c) => c.pe > 35 },
];
const PROFIT_BANDS = [
  { id: "all", label: "Any profitability", test: () => true },
  { id: "high", label: "ROE \u2265 20%", test: (c) => c.roe >= 20 },
  { id: "mid", label: "ROE 10\u201320%", test: (c) => c.roe >= 10 && c.roe < 20 },
  { id: "low", label: "ROE < 10%", test: (c) => c.roe < 10 },
];
const GROWTH_BANDS = [
  { id: "all", label: "Any growth", test: () => true },
  { id: "high", label: "High growth (3Y rev. \u2265 12%)", test: (c) => c._g3 >= 12 },
  { id: "mod", label: "Moderate (3Y rev. 5\u201312%)", test: (c) => c._g3 >= 5 && c._g3 < 12 },
  { id: "low", label: "Low (3Y rev. < 5%)", test: (c) => c._g3 < 5 },
];
const LEVERAGE_BANDS = [
  { id: "all", label: "Any leverage", test: () => true },
  { id: "low", label: "Low D/E (< 0.5x)", test: (c) => c.de < 0.5 },
  { id: "mod", label: "Moderate D/E (0.5\u20132x)", test: (c) => c.de >= 0.5 && c.de <= 2 },
  { id: "high", label: "High D/E (> 2x)", test: (c) => c.de > 2 },
];
const OWNERSHIP_BANDS = [
  { id: "all", label: "Any ownership", test: () => true },
  { id: "high", label: "Promoter \u2265 50%", test: (c) => c.promoter >= 50 },
  { id: "mod", label: "Promoter 25\u201350%", test: (c) => c.promoter >= 25 && c.promoter < 50 },
  { id: "low", label: "Promoter < 25%", test: (c) => c.promoter < 25 },
];
const LIQUIDITY_BANDS = [
  { id: "all", label: "Any liquidity" },
  { id: "high", label: "High (\u2265 \u20B92,000 Cr/day)" },
  { id: "mid", label: "Medium (\u20B9500\u20132,000 Cr/day)" },
  { id: "low", label: "Low (< \u20B9500 Cr/day)" },
];
const RET_PERIOD_OPTIONS = ["1W", "1M", "3M", "6M", "1Y", "3Y", "5Y"];
const PAGE_SIZE = 20;

function SelectBox({ value, onChange, options }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} style={{
      fontFamily: fontBody, fontSize: 12.5, fontWeight: 600, color: T.paper, background: T.navy900,
      border: `1px solid ${T.line}`, borderRadius: 7, padding: "8px 10px", cursor: "pointer", outline: "none",
    }}>
      {options.map((o) => <option key={o.id} value={o.id} style={{ background: T.navy900 }}>{o.label}</option>)}
    </select>
  );
}

function ColHead({ label, sortKey, sort, setSort, align = "right", metricKey, mode }) {
  const active = sort.key === sortKey;
  return (
    <Th align={align}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 3, cursor: "pointer", justifyContent: align === "right" ? "flex-end" : "flex-start" }}
        onClick={() => setSort((s) => ({ key: sortKey, dir: s.key === sortKey ? -s.dir : -1 }))}>
        {label}
        {active ? (sort.dir === 1 ? <ChevronUpMini /> : <ChevronDown size={12} />) : null}
        {metricKey && mode === "explore" && <InfoTip text={METRIC_HELP[metricKey]} />}
      </span>
    </Th>
  );
}
function ChevronUpMini() { return <ChevronDown size={12} style={{ transform: "rotate(180deg)" }} />; }

function StocksPage({ navigate, mode, setMode, watchlist, toggleWatch, compareList, toggleCompare }) {
  const [q, setQ] = useState("");
  const [sectorFilter, setSectorFilter] = useState("all");
  const [mcapFilter, setMcapFilter] = useState("all");
  const [valFilter, setValFilter] = useState("all");
  const [profitFilter, setProfitFilter] = useState("all");
  const [growthFilter, setGrowthFilter] = useState("all");
  const [leverageFilter, setLeverageFilter] = useState("all");
  const [ownershipFilter, setOwnershipFilter] = useState("all");
  const [liquidityFilter, setLiquidityFilter] = useState("all");
  const [retRange, setRetRange] = useState("1Y");
  const [sort, setSort] = useState({ key: "mcapCr", dir: -1 });
  const [showAdvanced, setShowAdvanced] = useState(mode === "research");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  useEffect(() => { setShowAdvanced(mode === "research"); }, [mode]);
  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [q, sectorFilter, mcapFilter, valFilter, profitFilter, growthFilter, leverageFilter, ownershipFilter, liquidityFilter, retRange, sort, mode]);

  const universe = useMemo(() => COMPANIES.map((c) => {
    const a = c.annual, g3 = (Math.pow(a[a.length - 1].revenue / a[Math.max(0, a.length - 4)].revenue, 1 / 3) - 1) * 100;
    return { ...c, _g3: g3 };
  }), []);

  const filtered = useMemo(() => {
    let r = universe.map((c) => ({ ...c, _day: ret(c, 1), _ret: ret(c, RANGE_DAYS[retRange]) }));
    if (q.trim()) { const qq = q.toLowerCase(); r = r.filter((c) => c.name.toLowerCase().includes(qq) || c.ticker.toLowerCase().includes(qq)); }
    if (sectorFilter !== "all") r = r.filter((c) => c.sector === sectorFilter);
    r = r.filter(MCAP_BANDS.find((b) => b.id === mcapFilter).test);
    if (liquidityFilter !== "all") {
      r = r.filter((c) => liquidityFilter === "high" ? c.tradedValueCr >= 2000 : liquidityFilter === "mid" ? c.tradedValueCr >= 500 && c.tradedValueCr < 2000 : c.tradedValueCr < 500);
    }
    if (mode === "research" || showAdvanced) {
      r = r.filter(VAL_BANDS.find((b) => b.id === valFilter).test);
      r = r.filter(PROFIT_BANDS.find((b) => b.id === profitFilter).test);
      r = r.filter(GROWTH_BANDS.find((b) => b.id === growthFilter).test);
      r = r.filter(LEVERAGE_BANDS.find((b) => b.id === leverageFilter).test);
      r = r.filter(OWNERSHIP_BANDS.find((b) => b.id === ownershipFilter).test);
    }
    r.sort((a, b) => (a[sort.key] - b[sort.key]) * sort.dir);
    return r;
  }, [universe, q, sectorFilter, mcapFilter, valFilter, profitFilter, growthFilter, leverageFilter, ownershipFilter, liquidityFilter, retRange, sort, mode, showAdvanced]);

  const rows = filtered.slice(0, visibleCount);
  const dense = mode === "research";

  return (
    <div>
      <SectionHeading eyebrow="Screener" title="All NSE Stocks"
        sub="Search and filter across the coverage universe \u2014 spanning large, mid, small and micro caps. Add companies to Compare or your Watchlist directly from the table."
        right={<DemoBadge />} />

      <div style={{
        fontFamily: fontBody, fontSize: 11.5, color: T.mutedDark, background: T.navy850, border: `1px solid ${T.lineSoft}`,
        borderRadius: 8, padding: "8px 12px", marginBottom: 16, maxWidth: 720, lineHeight: 1.5,
      }}>
        This Artifact uses a representative demo dataset across sectors and market-cap bands. A live product would draw on the complete, licensed universe of NSE-listed equities.
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12, alignItems: "center" }}>
        <div style={{ position: "relative", flex: "1 1 240px", maxWidth: 320 }}>
          <Search size={14} style={{ position: "absolute", left: 11, top: 10, color: T.muted }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by company name or ticker"
            style={{ width: "100%", fontFamily: fontBody, fontSize: 12.5, background: T.navy900, border: `1px solid ${T.line}`, borderRadius: 7, padding: "8px 10px 8px 32px", color: T.paper, outline: "none", boxSizing: "border-box" }} />
        </div>
        <SelectBox value={sectorFilter} onChange={setSectorFilter} options={[{ id: "all", label: "All sectors" }, ...SECTORS.map((s) => ({ id: s.id, label: s.name }))]} />
        <SelectBox value={mcapFilter} onChange={setMcapFilter} options={MCAP_BANDS} />
        <SelectBox value={liquidityFilter} onChange={setLiquidityFilter} options={LIQUIDITY_BANDS} />
        <div style={{ flex: 1 }} />
        <RangeTabs options={RET_PERIOD_OPTIONS} value={retRange} onChange={setRetRange} />
      </div>

      {mode === "explore" && (
        <button onClick={() => setShowAdvanced((v) => !v)} style={{
          display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer",
          fontFamily: fontBody, fontSize: 12.5, fontWeight: 600, color: T.gold, padding: "4px 0", marginBottom: 10,
        }}>
          <SlidersHorizontal size={13} /> {showAdvanced ? "Hide" : "More"} filters (valuation, profitability, growth, leverage, ownership)
          <ChevronDown size={13} style={{ transform: showAdvanced ? "rotate(180deg)" : "none" }} />
        </button>
      )}

      {(mode === "research" || showAdvanced) && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16, padding: "12px 14px", background: T.navy850, border: `1px solid ${T.lineSoft}`, borderRadius: 9 }}>
          <SelectBox value={valFilter} onChange={setValFilter} options={VAL_BANDS} />
          <SelectBox value={profitFilter} onChange={setProfitFilter} options={PROFIT_BANDS} />
          <SelectBox value={growthFilter} onChange={setGrowthFilter} options={GROWTH_BANDS} />
          <SelectBox value={leverageFilter} onChange={setLeverageFilter} options={LEVERAGE_BANDS} />
          <SelectBox value={ownershipFilter} onChange={setOwnershipFilter} options={OWNERSHIP_BANDS} />
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
        <div style={{ fontFamily: fontBody, fontSize: 12.5, color: T.muted }}>
          <strong style={{ color: T.paper }}>{filtered.length}</strong> {filtered.length === 1 ? "company matches" : "companies match"} your filters
        </div>
        {mode === "research" && <div style={{ fontFamily: fontBody, fontSize: 11, color: T.mutedDark }}>Research mode \u2014 full column set &amp; screening controls</div>}
      </div>

      <ExplainRow mode={mode} text="Tip: use the band filters to narrow the universe (e.g. large-cap, reasonably valued, profitable), then sort by any column to build your own shortlist." />

      <div style={{ border: `1px solid ${T.line}`, borderRadius: 10, overflow: "auto", marginTop: 10, maxHeight: 640 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: dense ? 1180 : 760 }}>
          <thead>
            <tr>
              <Th width={230}>Company</Th>
              <ColHead label="Price" sortKey="price" sort={sort} setSort={setSort} />
              <ColHead label="1D" sortKey="_day" sort={sort} setSort={setSort} />
              <ColHead label={`${retRange} Ret`} sortKey="_ret" sort={sort} setSort={setSort} metricKey="ret1y" mode={mode} />
              <ColHead label="Mkt Cap" sortKey="mcapCr" sort={sort} setSort={setSort} />
              {dense && <ColHead label="Traded Val." sortKey="tradedValueCr" sort={sort} setSort={setSort} metricKey="tradedValueCr" mode={mode} />}
              <ColHead label="P/E" sortKey="pe" sort={sort} setSort={setSort} metricKey="pe" mode={mode} />
              {dense && <ColHead label="P/B" sortKey="pb" sort={sort} setSort={setSort} metricKey="pb" mode={mode} />}
              {dense && <ColHead label="ROE" sortKey="roe" sort={sort} setSort={setSort} metricKey="roe" mode={mode} />}
              <ColHead label="ROCE" sortKey="roce" sort={sort} setSort={setSort} metricKey="roce" mode={mode} />
              {dense && <ColHead label="Div Yld" sortKey="divYield" sort={sort} setSort={setSort} metricKey="divYield" mode={mode} />}
              <ColHead label="D/E" sortKey="de" sort={sort} setSort={setSort} metricKey="de" mode={mode} />
              <Th align="center" width={90}>Actions</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.ticker} style={{ cursor: "pointer" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = T.navy900)}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                <Td>
                  <div onClick={() => navigate("company", { ticker: c.ticker })}>
                    <span style={{ fontFamily: fontMono, fontWeight: 700, color: T.gold }}>{c.ticker}</span>
                    <div style={{ fontFamily: fontBody, fontSize: 11.5, color: T.muted, whiteSpace: "normal" }}>{c.name} \u00B7 {sectorById[c.sector].name}</div>
                  </div>
                </Td>
                <Td align="right" mono onClick={() => navigate("company", { ticker: c.ticker })}>{fmtPrice(c.price)}</Td>
                <Td align="right"><MoveTag value={c._day} size={12} /></Td>
                <Td align="right"><MoveTag value={c._ret} size={12} /></Td>
                <Td align="right" mono>{fmtCr(c.mcapCr)}</Td>
                {dense && <Td align="right" mono>{fmtCr(c.tradedValueCr)}</Td>}
                <Td align="right" mono>{c.pe.toFixed(1)}</Td>
                {dense && <Td align="right" mono>{c.pb.toFixed(1)}</Td>}
                {dense && <Td align="right" mono>{c.roe.toFixed(1)}%</Td>}
                <Td align="right" mono>{c.roce.toFixed(1)}%</Td>
                {dense && <Td align="right" mono>{c.divYield.toFixed(2)}%</Td>}
                <Td align="right" mono>{c.de.toFixed(2)}</Td>
                <Td align="center">
                  <div style={{ display: "flex", gap: 6, justifyContent: "center" }}>
                    <button title="Add to watchlist" onClick={() => toggleWatch(c.ticker)} style={{ background: "none", border: "none", cursor: "pointer", color: watchlist.includes(c.ticker) ? T.gold : T.mutedDark }}>
                      <Star size={15} fill={watchlist.includes(c.ticker) ? T.gold : "none"} />
                    </button>
                    <button title="Add to compare" onClick={() => toggleCompare(c.ticker)} style={{ background: "none", border: "none", cursor: "pointer", color: compareList.includes(c.ticker) ? T.gold : T.mutedDark }}>
                      <Layers size={15} />
                    </button>
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <div style={{ padding: 40, textAlign: "center", fontFamily: fontBody, color: T.muted, fontSize: 13 }}>No companies match these filters.</div>}
      </div>

      {visibleCount < filtered.length && (
        <div style={{ display: "flex", justifyContent: "center", marginTop: 16 }}>
          <GoldButton outline onClick={() => setVisibleCount((v) => v + PAGE_SIZE)}>
            Load more \u00B7 showing {rows.length} of {filtered.length}
          </GoldButton>
        </div>
      )}
    </div>
  );
}

/* ============================================================================
   COMPANY RESEARCH PAGE
============================================================================ */
const COMPANY_TABS = [
  { id: "overview", label: "Overview" },
  { id: "performance", label: "Performance" },
  { id: "financials", label: "Financials" },
  { id: "valuation", label: "Valuation & Quality" },
  { id: "ownership", label: "Ownership & Disclosures" },
  { id: "events", label: "Events & Filings" },
  { id: "peers", label: "Peers" },
  { id: "notes", label: "Notes" },
];


function StatBlock({ label, value, sub, help, mode }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", fontFamily: fontBody, fontSize: 11, fontWeight: 700, color: T.mutedDark, textTransform: "uppercase", letterSpacing: 0.4 }}>
        {label}{help && mode === "explore" && <InfoTip text={help} />}
      </div>
      <div style={{ fontFamily: fontMono, fontSize: 17, fontWeight: 700, color: T.paper, marginTop: 4 }}>{value}</div>
      {sub && <div style={{ fontFamily: fontBody, fontSize: 11.5, color: T.muted, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function CompanyHeader({ c, mode, watchlist, toggleWatch, compareList, toggleCompare, notesCount, onAddNote }) {
  const day = ret(c, 1);
  const dist52 = ((c.price - c.week52High) / c.week52High) * 100;
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 20, flexWrap: "wrap" }}>
        <div style={{ maxWidth: 640 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 6 }}>
            <span style={{ fontFamily: fontMono, fontSize: 13, fontWeight: 700, color: T.gold, border: `1px solid ${T.gold}55`, borderRadius: 5, padding: "2px 8px" }}>{c.ticker}</span>
            <span style={{ fontFamily: fontBody, fontSize: 12, color: T.muted }}>NSE \u00B7 {sectorById[c.sector].name}</span>
          </div>
          <h1 style={{ fontFamily: fontDisplay, fontSize: 30, fontWeight: 600, color: T.paper, margin: 0, letterSpacing: -0.3 }}>{c.name}</h1>
          <p style={{ fontFamily: fontBody, fontSize: 13.5, color: T.muted, marginTop: 8, lineHeight: 1.6, maxWidth: 600 }}>{c.desc}</p>
          <div style={{ marginTop: 12 }}><DemoBadge /></div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontFamily: fontMono, fontSize: 32, fontWeight: 700, color: T.paper }}>{fmtPrice(c.price)}</div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 4 }}><MoveTag value={day} size={15} /></div>
          <div style={{ fontFamily: fontBody, fontSize: 11.5, color: T.muted, marginTop: 6 }}>52W: {fmtPrice(c.week52Low)} \u2013 {fmtPrice(c.week52High)}</div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 22, flexWrap: "wrap", marginTop: 20, padding: "16px 20px", background: T.navy850, border: `1px solid ${T.line}`, borderRadius: 12 }}>
        <StatBlock label="Market cap" value={fmtCr(c.mcapCr)} mode={mode} />
        <StatBlock label="P/E (TTM)" value={c.pe.toFixed(1) + "x"} mode={mode} help={METRIC_HELP.pe} />
        <StatBlock label="ROE" value={c.roe.toFixed(1) + "%"} mode={mode} help={METRIC_HELP.roe} />
        <StatBlock label="Dividend yield" value={c.divYield.toFixed(2) + "%"} mode={mode} help={METRIC_HELP.divYield} />
        <StatBlock label="From 52W high" value={fmtPct(dist52, 1)} mode={mode} />
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <GoldButton small outline={!watchlist.includes(c.ticker)} icon={watchlist.includes(c.ticker) ? BookmarkCheck : BookmarkPlus} onClick={() => toggleWatch(c.ticker)}>
            {watchlist.includes(c.ticker) ? "On watchlist" : "Add to watchlist"}
          </GoldButton>
          <IconGhostButton onClick={() => toggleCompare(c.ticker)} active={compareList.includes(c.ticker)}><Layers size={13} /> Compare</IconGhostButton>
          <IconGhostButton onClick={onAddNote}><PenLine size={13} /> Add note{notesCount ? ` (${notesCount})` : ""}</IconGhostButton>
        </div>
      </div>
    </div>
  );
}

/* ---- Overview ---- */
function OverviewTab({ c, mode, navigate }) {
  const m1 = ret(c, RANGE_DAYS["1M"]), m6 = ret(c, RANGE_DAYS["6M"]), y1 = ret(c, RANGE_DAYS["1Y"]);
  const latestEvent = c.events[0];
  const nextResult = new Date(END_DATE); nextResult.setDate(nextResult.getDate() + 38);
  return (
    <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
      <div style={{ flex: "2 1 480px" }}>
        <SectionHeading eyebrow="Performance summary" title="How has the stock moved?" />
        <div style={{ display: "flex", gap: 14, marginBottom: 20, flexWrap: "wrap" }}>
          <StatBlock label="1 Month" value={fmtPct(m1)} mode={mode} />
          <StatBlock label="6 Months" value={fmtPct(m6)} mode={mode} />
          <StatBlock label="1 Year" value={fmtPct(y1)} mode={mode} />
        </div>
        <MiniAreaChart data={c.series.slice(-252).map((v, i, arr) => ({ label: fmtDateShort(c.dates[c.dates.length - arr.length + i]), value: v }))} positive={y1 >= 0} height={200} />

        <SectionHeading eyebrow="What changed?" title="Neutral summary" sub={null} />
        <p style={{ fontFamily: fontBody, fontSize: 13.5, color: T.muted, lineHeight: 1.7, maxWidth: 640 }}>
          Over the past month, {c.ticker} moved {fmtPct(m1)}, compared with a Nifty 50 move of {fmtPct(seriesReturn(indexByName.NIFTY50.series, RANGE_DAYS["1M"]))} over the
          same period. The most recent disclosed event was a <strong style={{ color: T.paper }}>{latestEvent.cat.toLowerCase()}</strong> on {fmtDate(latestEvent.date)}.
          This is a factual, neutral read of recent activity \u2014 not an interpretation of intent or a forecast.
        </p>

        <ExplainRow mode={mode} text="This overview blends price action with the most recent disclosed events so you can see performance and context side by side, without a buy/sell opinion attached." />
      </div>

      <div style={{ flex: "1 1 260px" }}>
        <div style={{ background: T.navy850, border: `1px solid ${T.line}`, borderRadius: 12, padding: "18px 20px", marginBottom: 16 }}>
          <div style={{ fontFamily: fontBody, fontSize: 12, fontWeight: 700, color: T.muted, marginBottom: 10 }}>Business description</div>
          <p style={{ fontFamily: fontBody, fontSize: 13, color: T.paper, lineHeight: 1.65, margin: 0 }}>{c.desc}</p>
        </div>
        <div style={{ background: T.navy850, border: `1px solid ${T.line}`, borderRadius: 12, padding: "18px 20px" }}>
          <div style={{ fontFamily: fontBody, fontSize: 12, fontWeight: 700, color: T.muted, marginBottom: 10 }}>Upcoming corporate event</div>
          <div style={{ fontFamily: fontBody, fontSize: 13, color: T.paper }}>Quarterly results (expected)</div>
          <div style={{ fontFamily: fontMono, fontSize: 13, color: T.gold, marginTop: 3 }}>{fmtDate(nextResult)}</div>
          <div style={{ fontFamily: fontBody, fontSize: 11.5, color: T.muted, marginTop: 6 }}>Illustrative demo date, not an official filing calendar.</div>
        </div>
      </div>
    </div>
  );
}

/* ---- Performance ---- */
function PerformanceTab({ c, mode, setMode }) {
  const [range, setRange] = useState("1Y");
  const [mode2, setMode2] = useState("price");
  const [showNifty, setShowNifty] = useState(true);
  const [showSector, setShowSector] = useState(false);
  const [showStats, setShowStats] = useState(mode === "research");
  useEffect(() => setShowStats(mode === "research"), [mode]);
  const days = RANGE_DAYS[range] === undefined ? c.series.length - 1 : RANGE_DAYS[range];
  const n = Math.min(days, c.series.length - 1);
  const sliceIdx = c.series.length - 1 - n;
  const base = c.series[sliceIdx];
  const niftyBase = indexByName.NIFTY50.series[sliceIdx];
  const sectorCons = sectorConstituents(c.sector);
  const chartData = c.series.slice(sliceIdx).map((v, i) => {
    const idx = sliceIdx + i;
    const row = { label: fmtDateShort(c.dates[idx]), stock: mode2 === "total" ? ((v / base - 1) * 100) + (c.divYield / 252) * i : (v / base - 1) * 100 };
    if (showNifty) row.nifty = (indexByName.NIFTY50.series[idx] / niftyBase - 1) * 100;
    return row;
  });
  const cagr = (Math.pow(c.series[c.series.length - 1] / base, 252 / Math.max(n, 1)) - 1) * 100;
  const window = c.series.slice(sliceIdx);
  let peak = window[0], maxDD = 0;
  window.forEach((v) => { peak = Math.max(peak, v); maxDD = Math.min(maxDD, (v / peak - 1) * 100); });
  const rets = window.slice(1).map((v, i) => v / window[i] - 1);
  const vol = (Math.sqrt(rets.reduce((s, r) => s + r * r, 0) / rets.length) * Math.sqrt(252) * 100);
  const covar = rets.reduce((s, r, i) => {
    const nr = indexByName.NIFTY50.series[sliceIdx + i + 1] / indexByName.NIFTY50.series[sliceIdx + i] - 1;
    return s + r * nr;
  }, 0) / rets.length;
  const marketVar = rets.reduce((s, r, i) => {
    const nr = indexByName.NIFTY50.series[sliceIdx + i + 1] / indexByName.NIFTY50.series[sliceIdx + i] - 1;
    return s + nr * nr;
  }, 0) / rets.length;
  const beta = marketVar ? covar / marketVar : 1;
  const dist52 = ((c.price - c.week52High) / c.week52High) * 100;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 14 }}>
        <RangeTabs options={["1M", "3M", "6M", "1Y", "2Y", "3Y", "5Y"]} value={range === "Max" ? "5Y" : range} onChange={setRange} />
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {mode === "research" && <button onClick={() => setRange("Max")} style={{ fontFamily: fontBody, fontSize: 12, fontWeight: 600, color: range === "Max" ? T.gold : T.muted, background: "none", border: `1px solid ${range === "Max" ? T.gold : T.line}`, borderRadius: 6, padding: "5px 10px", cursor: "pointer" }}>Since Listing</button>}
          {mode === "research" && <RangeTabs options={["price", "total"]} value={mode2} onChange={setMode2} />}
          <IconGhostButton active={showNifty} onClick={() => setShowNifty((v) => !v)}>Nifty 50</IconGhostButton>
          {mode === "research" && <IconGhostButton active={showSector} onClick={() => setShowSector((v) => !v)}>{sectorById[c.sector].name}</IconGhostButton>}
        </div>
      </div>

      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={chartData} margin={{ top: 6, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={T.lineSoft} strokeDasharray="2 4" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: T.mutedDark, fontFamily: fontMono, fontSize: 10 }} axisLine={{ stroke: T.line }} tickLine={false} minTickGap={50} />
          <YAxis tick={{ fill: T.mutedDark, fontFamily: fontMono, fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v.toFixed(0)}%`} width={44} />
          <Tooltip content={<ChartTooltip />} />
          <ReferenceLine y={0} stroke={T.line} />
          <Line type="monotone" dataKey="stock" name={c.ticker} stroke={T.gold} strokeWidth={2.2} dot={false} />
          {showNifty && <Line type="monotone" dataKey="nifty" name="Nifty 50" stroke={T.muted} strokeWidth={1.6} dot={false} strokeDasharray="4 3" />}
        </LineChart>
      </ResponsiveContainer>
      <div style={{ fontFamily: fontBody, fontSize: 11, color: T.mutedDark, marginTop: 6 }}>Indexed to 0% at range start \u00B7 {mode2 === "total" ? "Total return (price + reinvested dividend, illustrative)" : "Price return"}</div>

      <div style={{ marginTop: 26 }}>
        {!showStats ? (
          <button onClick={() => setShowStats(true)} style={{
            display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer",
            fontFamily: fontBody, fontSize: 12.5, fontWeight: 600, color: T.gold, padding: "4px 0",
          }}><SlidersHorizontal size={13} /> Show advanced performance statistics (CAGR, drawdown, volatility, beta) <ChevronDown size={13} /></button>
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 16, padding: "18px 20px", background: T.navy850, border: `1px solid ${T.line}`, borderRadius: 12 }}>
              <StatBlock label="CAGR (period)" value={fmtPct(cagr)} mode={mode} />
              <StatBlock label="Max drawdown" value={fmtPct(maxDD)} mode={mode} />
              <StatBlock label="Volatility (ann.)" value={vol.toFixed(1) + "%"} mode={mode} />
              <StatBlock label="Beta vs Nifty 50" value={beta.toFixed(2)} mode={mode} />
              <StatBlock label="52W high / low" value={`${fmtPrice(c.week52High)} / ${fmtPrice(c.week52Low)}`} mode={mode} />
              <StatBlock label="From 52W high" value={fmtPct(dist52, 1)} mode={mode} />
            </div>
            <ExplainRow mode={mode} text="CAGR, drawdown, volatility and beta are calculated from the illustrative demo price series above using a standard methodology \u2014 they are for orientation only, not verified exchange analytics." />
          </>
        )}
      </div>
    </div>
  );
}

/* ---- Financials ---- */
function FinFmt(v) { return `\u20B9${inr(v, 0)} Cr`; }
function BarRow({ label, rows, field, mode, isRatio, help }) {
  const vals = rows.map((r) => r[field]);
  const maxAbs = Math.max(...vals.map((v) => Math.abs(v)), 1);
  return (
    <tr>
      <Td strong>{label}{help && mode === "explore" && <InfoTip text={help} />}</Td>
      {rows.map((r, i) => (
        <Td key={i} align="right" mono>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3 }}>
            <span>{isRatio ? r[field].toFixed(1) + "%" : FinFmt(r[field])}</span>
            <span style={{ width: 46, height: 4, borderRadius: 2, background: T.lineSoft, position: "relative", overflow: "hidden" }}>
              <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${Math.max((Math.abs(r[field]) / maxAbs) * 100, 4)}%`, background: r[field] >= 0 ? T.gold : T.down }} />
            </span>
          </div>
        </Td>
      ))}
    </tr>
  );
}
function FinancialsTab({ c, mode, setMode }) {
  const [period, setPeriod] = useState("Annual");
  const [basis, setBasis] = useState("Consolidated");
  const rows = period === "Annual" ? c.annual : c.quarterly;
  const labelKey = period === "Annual" ? "fy" : "q";
  const basisFactor = basis === "Standalone" ? 0.94 : 1;
  const latest = c.annual[c.annual.length - 1];

  if (mode === "explore") {
    const chartData = c.annual.map((r) => ({ label: r.fy, Revenue: r.revenue, "Net income": r.netIncome }));
    return (
      <div>
        <SectionHeading eyebrow="Summary" title="Revenue & profit, at a glance"
          sub="A condensed view for quick orientation. Switch to Research mode for the full annual/quarterly statement." />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 16, marginBottom: 20 }}>
          <StatBlock label="Revenue (latest FY)" value={fmtCr(latest.revenue)} mode={mode} />
          <StatBlock label="Net income (latest FY)" value={fmtCr(latest.netIncome)} mode={mode} />
          <StatBlock label="EPS (latest FY)" value={`\u20B9${latest.eps.toFixed(2)}`} mode={mode} />
        </div>
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={chartData} margin={{ top: 6, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={T.lineSoft} strokeDasharray="2 4" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: T.mutedDark, fontFamily: fontMono, fontSize: 10 }} axisLine={{ stroke: T.line }} tickLine={false} />
            <YAxis tick={{ fill: T.mutedDark, fontFamily: fontMono, fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => fmtCr(v)} width={70} />
            <Tooltip content={<ChartTooltip />} />
            <Line type="monotone" dataKey="Revenue" stroke={T.gold} strokeWidth={2.2} dot={false} />
            <Line type="monotone" dataKey="Net income" stroke={T.muted} strokeWidth={1.8} dot={false} strokeDasharray="4 3" />
          </LineChart>
        </ResponsiveContainer>
        <div style={{ marginTop: 22 }}>
          <ModeUpsell setMode={setMode} label="Switch to Research mode"
            summary="See the full annual and quarterly statement \u2014 EBITDA, operating and free cash flow, total debt, and standalone/consolidated basis \u2014 in Research mode." />
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 10, marginBottom: 18, flexWrap: "wrap", justifyContent: "space-between" }}>
        <RangeTabs options={["Annual", "Quarterly"]} value={period} onChange={setPeriod} />
        <RangeTabs options={["Consolidated", "Standalone"]} value={basis} onChange={setBasis} />
      </div>
      <ExplainRow mode={mode} text="Consolidated figures include subsidiaries and joint ventures; standalone reflects the parent entity only. Figures below are illustrative demo data." />
      <div style={{ overflowX: "auto", marginTop: 14 }}>
        <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 640 }}>
          <thead><tr><Th>\u20B9 Cr, unless stated</Th>{rows.map((r) => <Th key={r[labelKey]} align="right">{r[labelKey]}</Th>)}</tr></thead>
          <tbody>
            <BarRow label="Revenue" rows={rows.map(r => ({ revenue: r.revenue * basisFactor }))} field="revenue" mode={mode} />
            <BarRow label="EBITDA" rows={rows.map(r => ({ ebitda: r.ebitda * basisFactor }))} field="ebitda" mode={mode} help="Earnings before interest, tax, depreciation & amortisation \u2014 a proxy for core operating profit." />
            <BarRow label="Net income" rows={rows.map(r => ({ netIncome: r.netIncome * basisFactor }))} field="netIncome" mode={mode} />
            {period === "Annual" && <BarRow label="Operating cash flow" rows={rows} field="ocf" mode={mode} />}
            {period === "Annual" && <BarRow label="Free cash flow" rows={rows} field="fcf" mode={mode} help="Operating cash flow minus capital expenditure \u2014 cash left after reinvesting in the business." />}
            {period === "Annual" && <BarRow label="Total debt" rows={rows} field="debt" mode={mode} />}
            <tr>
              <Td strong>EPS (\u20B9)</Td>
              {rows.map((r, i) => <Td key={i} align="right" mono>{r.eps.toFixed(2)}</Td>)}
            </tr>
          </tbody>
        </table>
      </div>
      <div style={{ fontFamily: fontBody, fontSize: 11, color: T.mutedDark, marginTop: 14 }}>
        Source: demo financial dataset, generated for this prototype \u00B7 last refreshed {fmtDate(END_DATE)}. A production build would cite the originating filing for each line.
      </div>
    </div>
  );
}

/* ---- Valuation & Quality ---- */
function ValuationTab({ c, mode, setMode }) {
  const peers = sectorConstituents(c.sector).filter((p) => p.ticker !== c.ticker);
  const sectorAvgPe = peers.length ? peers.reduce((s, p) => s + p.pe, 0) / peers.length : c.pe;
  const g1 = seriesReturn(c.series, RANGE_DAYS["1Y"]);
  const rev3 = (Math.pow(c.annual[c.annual.length - 1].revenue / c.annual[Math.max(0, c.annual.length - 4)].revenue, 1 / 3) - 1) * 100;
  const rev5 = (Math.pow(c.annual[c.annual.length - 1].revenue / c.annual[0].revenue, 1 / (c.annual.length - 1)) - 1) * 100;

  if (mode === "explore") {
    return (
      <div style={{ maxWidth: 560 }}>
        <SectionHeading eyebrow="Valuation & quality" title="The core numbers" />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, background: T.navy850, border: `1px solid ${T.line}`, borderRadius: 12, padding: "18px 20px", marginBottom: 20 }}>
          <StatBlock label="P/E (TTM)" value={c.pe.toFixed(1) + "x"} mode={mode} help={METRIC_HELP.pe} sub={`Sector avg ${sectorAvgPe.toFixed(1)}x`} />
          <StatBlock label="P/B" value={c.pb.toFixed(1) + "x"} mode={mode} help={METRIC_HELP.pb} />
          <StatBlock label="ROE" value={c.roe.toFixed(1) + "%"} mode={mode} help={METRIC_HELP.roe} />
          <StatBlock label="Dividend yield" value={c.divYield.toFixed(2) + "%"} mode={mode} help={METRIC_HELP.divYield} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, background: T.navy850, border: `1px solid ${T.line}`, borderRadius: 12, padding: "18px 20px", marginBottom: 20 }}>
          <StatBlock label="Revenue growth, 3Y" value={fmtPct(rev3)} mode={mode} />
          <StatBlock label="Debt / Equity" value={c.de.toFixed(2) + "x"} mode={mode} help={METRIC_HELP.de} />
        </div>
        <ModeUpsell setMode={setMode} summary="See forward P/E, EV/EBITDA, PEG, margins, leverage detail, interest coverage and dividend payout history in Research mode." />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
      <div style={{ flex: "1 1 320px" }}>
        <SectionHeading eyebrow="Valuation" title="Price multiples" />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, background: T.navy850, border: `1px solid ${T.line}`, borderRadius: 12, padding: "18px 20px", marginBottom: 20 }}>
          <StatBlock label="P/E (TTM)" value={c.pe.toFixed(1) + "x"} mode={mode} help={METRIC_HELP.pe} sub={`Sector avg ${sectorAvgPe.toFixed(1)}x`} />
          <StatBlock label="Forward P/E (est.)" value={(c.pe * 0.9).toFixed(1) + "x"} mode={mode} />
          <StatBlock label="P/B" value={c.pb.toFixed(1) + "x"} mode={mode} help={METRIC_HELP.pb} />
          <StatBlock label="EV / EBITDA" value={c.evEbitda.toFixed(1) + "x"} mode={mode} help="Enterprise value (market cap + debt) divided by EBITDA \u2014 comparable across differing capital structures." />
          <StatBlock label="PEG ratio" value={c.peg.toFixed(2)} mode={mode} help="P/E divided by expected earnings growth. Below 1 is often read as reasonably priced relative to growth." />
          <StatBlock label="Market cap" value={fmtCr(c.mcapCr)} mode={mode} />
        </div>

        <SectionHeading eyebrow="Quality" title="Profitability & margins" />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, background: T.navy850, border: `1px solid ${T.line}`, borderRadius: 12, padding: "18px 20px" }}>
          <StatBlock label="ROE" value={c.roe.toFixed(1) + "%"} mode={mode} help={METRIC_HELP.roe} />
          <StatBlock label="ROCE" value={c.roce.toFixed(1) + "%"} mode={mode} help={METRIC_HELP.roce} />
          <StatBlock label="Gross / EBITDA margin" value={(c.ebitdaMargin * 100).toFixed(1) + "%"} mode={mode} />
          <StatBlock label="Net margin" value={(c.netMargin * 100).toFixed(1) + "%"} mode={mode} />
          <StatBlock label="FCF conversion" value={((c.annual[c.annual.length - 1].fcf / c.annual[c.annual.length - 1].netIncome) * 100).toFixed(0) + "%"} mode={mode} help="Free cash flow as a share of net income \u2014 how much reported profit shows up as actual cash." />
        </div>
      </div>

      <div style={{ flex: "1 1 320px" }}>
        <SectionHeading eyebrow="Growth" title="1Y / 3Y / 5Y trends" />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, background: T.navy850, border: `1px solid ${T.line}`, borderRadius: 12, padding: "18px 20px", marginBottom: 20 }}>
          <StatBlock label="Price, 1Y" value={fmtPct(g1)} mode={mode} />
          <StatBlock label="Revenue CAGR, 3Y" value={fmtPct(rev3)} mode={mode} />
          <StatBlock label="Revenue CAGR, 5Y" value={fmtPct(rev5)} mode={mode} />
        </div>

        <SectionHeading eyebrow="Balance sheet" title="Leverage & liquidity" />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, background: T.navy850, border: `1px solid ${T.line}`, borderRadius: 12, padding: "18px 20px", marginBottom: 20 }}>
          <StatBlock label="Debt / Equity" value={c.de.toFixed(2) + "x"} mode={mode} help={METRIC_HELP.de} />
          <StatBlock label="Interest coverage" value={c.interestCoverage.toFixed(1) + "x"} mode={mode} help="EBIT divided by interest expense \u2014 how comfortably operating profit covers interest obligations." />
          <StatBlock label="Current ratio" value={c.currentRatio.toFixed(2)} mode={mode} help="Current assets divided by current liabilities \u2014 a short-term liquidity buffer." />
        </div>

        <SectionHeading eyebrow="Dividends" title="Payout & history" />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, background: T.navy850, border: `1px solid ${T.line}`, borderRadius: 12, padding: "18px 20px" }}>
          <StatBlock label="Dividend yield" value={c.divYield.toFixed(2) + "%"} mode={mode} help={METRIC_HELP.divYield} />
          <StatBlock label="Payout ratio" value={Math.min(c.payoutRatio * 100, 100).toFixed(0) + "%"} mode={mode} help="Share of net income paid out as dividends, rather than retained for reinvestment." />
        </div>
      </div>
    </div>
  );
}

/* ---- Ownership & Disclosures ---- */
function OwnershipTab({ c, mode, setMode }) {
  const latest = c.ownership[c.ownership.length - 1];

  if (mode === "explore") {
    return (
      <div style={{ maxWidth: 560 }}>
        <SectionHeading eyebrow="Shareholding" title="Ownership snapshot" sub="Latest disclosed shareholding pattern. Ownership changes are context for research, not an automatic buy or sell signal." />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, background: T.navy850, border: `1px solid ${T.line}`, borderRadius: 12, padding: "18px 20px", marginBottom: 20 }}>
          <StatBlock label="Promoter holding" value={latest.promoter.toFixed(1) + "%"} mode={mode} />
          <StatBlock label="Promoter pledge" value={latest.pledge.toFixed(1) + "%"} mode={mode} help="Shares promoters have pledged as loan collateral. A rising trend is worth monitoring." />
          <StatBlock label="FII holding" value={latest.fii.toFixed(1) + "%"} mode={mode} help="Foreign institutional / portfolio investor holding." />
          <StatBlock label="DII / MF holding" value={latest.dii.toFixed(1) + "%"} mode={mode} help="Domestic institutional and mutual-fund holding." />
        </div>
        <ModeUpsell setMode={setMode} summary={`See the full quarter-by-quarter ownership trend and ${c.kmp.length} recent director/KMP disclosures in Research mode.`} />
      </div>
    );
  }

  return (
    <div>
      <SectionHeading eyebrow="Shareholding" title="Ownership over time" sub="Quarter-end disclosed shareholding pattern. Changes are context for research, not an automatic buy or sell signal." />
      <ExplainRow mode={mode} text="Promoters are the founding/controlling group. FII/DII are institutional investors (foreign and domestic). A rising pledge percentage means promoters have pledged more of their shares as loan collateral, which is worth monitoring." />
      <div style={{ overflowX: "auto", marginTop: 14 }}>
        <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 560 }}>
          <thead><tr><Th>Quarter</Th><Th align="right">Promoter %</Th><Th align="right">Promoter pledge %</Th><Th align="right">FII %</Th><Th align="right">DII/MF %</Th><Th align="right">Public & others %</Th></tr></thead>
          <tbody>
            {c.ownership.map((o) => (
              <tr key={o.q}>
                <Td strong>{o.q}</Td>
                <Td align="right" mono>{o.promoter.toFixed(2)}%</Td>
                <Td align="right" mono color={o.pledge > 1 ? T.down : T.paper}>{o.pledge.toFixed(2)}%</Td>
                <Td align="right" mono>{o.fii.toFixed(2)}%</Td>
                <Td align="right" mono>{o.dii.toFixed(2)}%</Td>
                <Td align="right" mono>{o.public.toFixed(2)}%</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 30 }}>
        <SectionHeading eyebrow="Disclosures" title="Director / KMP transactions" sub="Role-based disclosure summary. Names of individuals are withheld in this demo; refer to the linked filing for identified parties." />
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {c.kmp.map((k, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, background: T.navy850, border: `1px solid ${T.line}`, borderRadius: 9, padding: "12px 16px" }}>
              <div>
                <div style={{ fontFamily: fontBody, fontSize: 13, color: T.paper, fontWeight: 600 }}>{k.role} \u2014 {k.nature}</div>
                <div style={{ fontFamily: fontMono, fontSize: 11.5, color: T.muted, marginTop: 3 }}>{fmtDate(k.date)} \u00B7 {k.shares.toLocaleString("en-IN")} shares \u00B7 {fmtCr(k.valueCr)}</div>
              </div>
              <button style={{ display: "flex", alignItems: "center", gap: 5, fontFamily: fontBody, fontSize: 12, color: T.gold, background: "none", border: `1px solid ${T.gold}55`, borderRadius: 6, padding: "6px 10px", cursor: "pointer" }}>
                <FileText size={12} /> View filing
              </button>
            </div>
          ))}
        </div>
        <div style={{ fontFamily: fontBody, fontSize: 11, color: T.mutedDark, marginTop: 14 }}>
          Source: demo shareholding dataset, illustrative of quarter-end exchange disclosures \u00B7 last refreshed {fmtDate(END_DATE)}.
        </div>
      </div>
    </div>
  );
}

/* ---- Events & Filings ---- */
const EVENT_CAT_COLOR = {
  Result: T.gold, Dividend: T.up, Rating: "#8B7FD1", "Corporate Action": T.mutedDark,
  "Investor Presentation": "#4B9BC9", Shareholding: T.down,
};
function EventsTab({ c, mode }) {
  const [filter, setFilter] = useState("All");
  const cats = ["All", ...Array.from(new Set(c.events.map((e) => e.cat)))];
  const filtered = filter === "All" ? c.events : c.events.filter((e) => e.cat === filter);
  return (
    <div>
      <SectionHeading eyebrow="Why did the stock move?" title="Events & filings timeline"
        sub="Original-source documents and disclosures, ordered by date. No AI-generated summaries \u2014 just the source material and factual highlights." />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
        {cats.map((cat) => (
          <button key={cat} onClick={() => setFilter(cat)} style={{
            fontFamily: fontBody, fontSize: 12, fontWeight: 600, padding: "6px 12px", borderRadius: 20, cursor: "pointer",
            background: filter === cat ? T.gold : "transparent", color: filter === cat ? T.navy950 : T.muted,
            border: `1px solid ${filter === cat ? T.gold : T.line}`,
          }}>{cat}</button>
        ))}
      </div>
      <div style={{ position: "relative", paddingLeft: 22 }}>
        <div style={{ position: "absolute", left: 5, top: 6, bottom: 6, width: 2, background: T.line }} />
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {filtered.map((e) => (
            <div key={e.id} style={{ position: "relative" }}>
              <div style={{ position: "absolute", left: -22, top: 6, width: 10, height: 10, borderRadius: "50%", background: EVENT_CAT_COLOR[e.cat] || T.gold, border: `2px solid ${T.navy950}` }} />
              <div style={{ background: T.navy850, border: `1px solid ${T.line}`, borderRadius: 10, padding: "14px 16px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 6 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ fontFamily: fontBody, fontSize: 10.5, fontWeight: 700, color: EVENT_CAT_COLOR[e.cat] || T.gold, textTransform: "uppercase", letterSpacing: 0.4 }}>{e.cat}</span>
                    <span style={{ fontFamily: fontMono, fontSize: 11, color: T.mutedDark }}>{fmtDate(e.date)}</span>
                  </div>
                  <MoveTag value={e.impactPct} size={11.5} />
                </div>
                <div style={{ fontFamily: fontBody, fontSize: 13.5, color: T.paper, marginBottom: 10 }}>{e.headline}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, background: T.navy900, border: `1px solid ${T.lineSoft}`, borderRadius: 7, padding: "8px 11px", width: "fit-content" }}>
                  <FileText size={13} style={{ color: T.gold }} />
                  <span style={{ fontFamily: fontMono, fontSize: 11.5, color: T.muted }}>{e.doc}</span>
                  <ExternalLink size={11} style={{ color: T.mutedDark }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      {mode === "research" && (
        <div style={{ fontFamily: fontBody, fontSize: 11, color: T.mutedDark, marginTop: 18 }}>
          Source: demo events dataset generated for this prototype, illustrative of exchange filings and disclosures \u00B7 last refreshed {fmtDate(END_DATE)}. See Methodology in the footer for how impact figures are calculated.
        </div>
      )}
    </div>
  );
}

/* ---- Peers ---- */
function PeerMapChart({ peers, xKey, yKey, xLabel, yLabel }) {
  const data = peers.map((p) => ({ ...p, x: p[xKey], y: p[yKey], z: Math.sqrt(p.mcapCr) }));
  return (
    <ResponsiveContainer width="100%" height={280}>
      <ScatterChart margin={{ top: 10, right: 20, left: 0, bottom: 6 }}>
        <CartesianGrid stroke={T.lineSoft} strokeDasharray="2 4" />
        <XAxis type="number" dataKey="x" name={xLabel} tick={{ fill: T.mutedDark, fontFamily: fontMono, fontSize: 10 }} axisLine={{ stroke: T.line }} tickLine={false} label={{ value: xLabel, position: "insideBottom", offset: -3, fill: T.mutedDark, fontSize: 10.5, fontFamily: fontBody }} />
        <YAxis type="number" dataKey="y" name={yLabel} tick={{ fill: T.mutedDark, fontFamily: fontMono, fontSize: 10 }} axisLine={false} tickLine={false} label={{ value: yLabel, angle: -90, position: "insideLeft", fill: T.mutedDark, fontSize: 10.5, fontFamily: fontBody }} />
        <ZAxis type="number" dataKey="z" range={[60, 400]} />
        <Tooltip cursor={{ strokeDasharray: "3 3" }} content={({ active, payload }) => {
          if (!active || !payload?.length) return null;
          const p = payload[0].payload;
          return <div style={{ background: T.navy950, border: `1px solid ${T.line}`, borderRadius: 6, padding: "7px 10px", fontFamily: fontMono, fontSize: 11.5, color: T.paper }}>{p.ticker}<br />{xLabel}: {p.x.toFixed(1)} \u00B7 {yLabel}: {p.y.toFixed(1)}</div>;
        }} />
        <Scatter data={data} fill={T.gold} fillOpacity={0.75} />
      </ScatterChart>
    </ResponsiveContainer>
  );
}
function PeersTab({ c, mode, navigate }) {
  const peers = [c, ...sectorConstituents(c.sector).filter((p) => p.ticker !== c.ticker)];
  return (
    <div>
      <SectionHeading eyebrow={sectorById[c.sector].name} title="Peer comparison"
        sub="Metrics across the sector. Position in a chart or table is not a ranking or recommendation \u2014 read each metric in the context of the business." />
      <div style={{ overflowX: "auto", marginBottom: 30 }}>
        <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 900 }}>
          <thead><tr><Th>Company</Th><Th align="right">Price</Th><Th align="right">1Y ret.</Th><Th align="right">Mkt cap</Th><Th align="right">P/E</Th><Th align="right">ROE</Th><Th align="right">Rev CAGR 3Y</Th><Th align="right">D/E</Th><Th align="right">Div yld</Th></tr></thead>
          <tbody>
            {peers.map((p) => {
              const rev3 = (Math.pow(p.annual[p.annual.length - 1].revenue / p.annual[Math.max(0, p.annual.length - 4)].revenue, 1 / 3) - 1) * 100;
              return (
                <tr key={p.ticker} onClick={() => p.ticker !== c.ticker && navigate("company", { ticker: p.ticker })}
                  style={{ cursor: p.ticker !== c.ticker ? "pointer" : "default", background: p.ticker === c.ticker ? "rgba(198,161,91,0.08)" : "transparent" }}>
                  <Td strong={p.ticker === c.ticker}><span style={{ fontFamily: fontMono, fontWeight: 700, color: p.ticker === c.ticker ? T.gold : T.paper }}>{p.ticker}</span></Td>
                  <Td align="right" mono>{fmtPrice(p.price)}</Td>
                  <Td align="right"><MoveTag value={ret(p, RANGE_DAYS["1Y"])} size={12} /></Td>
                  <Td align="right" mono>{fmtCr(p.mcapCr)}</Td>
                  <Td align="right" mono>{p.pe.toFixed(1)}</Td>
                  <Td align="right" mono>{p.roe.toFixed(1)}%</Td>
                  <Td align="right" mono>{fmtPct(rev3)}</Td>
                  <Td align="right" mono>{p.de.toFixed(2)}</Td>
                  <Td align="right" mono>{p.divYield.toFixed(2)}%</Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {peers.length > 1 ? (
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 380px", background: T.navy850, border: `1px solid ${T.line}`, borderRadius: 12, padding: "16px 18px" }}>
            <div style={{ fontFamily: fontBody, fontSize: 12.5, fontWeight: 700, color: T.muted, marginBottom: 6 }}>Valuation vs. growth</div>
            <PeerMapChart peers={peers} xKey="pe" yKey="roe" xLabel="P/E (x)" yLabel="ROE (%)" />
          </div>
          <div style={{ flex: "1 1 380px", background: T.navy850, border: `1px solid ${T.line}`, borderRadius: 12, padding: "16px 18px" }}>
            <div style={{ fontFamily: fontBody, fontSize: 12.5, fontWeight: 700, color: T.muted, marginBottom: 6 }}>Profitability vs. leverage</div>
            <PeerMapChart peers={peers} xKey="de" yKey="roce" xLabel="Debt/Equity (x)" yLabel="ROCE (%)" />
          </div>
        </div>
      ) : <div style={{ fontFamily: fontBody, fontSize: 13, color: T.muted }}>No other companies in this sector are in coverage yet.</div>}
    </div>
  );
}

/* ---- Notes ---- */
function NotesTab({ c, notes, addNote, updateNote, deleteNote }) {
  const [draft, setDraft] = useState("");
  const list = notes[c.ticker] || [];
  return (
    <div style={{ maxWidth: 720 }}>
      <SectionHeading eyebrow="Private" title="Research notes" sub="Session-only \u2014 no login required, and nothing here is saved once you leave this Artifact." />
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
        <textarea value={draft} onChange={(e) => setDraft(e.target.value)}
          placeholder="What is my thesis? What would change my mind? What needs monitoring?"
          rows={4} style={{
            fontFamily: fontBody, fontSize: 13.5, color: T.paper, background: T.navy850, border: `1px solid ${T.line}`,
            borderRadius: 10, padding: "12px 14px", resize: "vertical", outline: "none", lineHeight: 1.6,
          }} />
        <div><GoldButton small icon={Plus} onClick={() => { if (draft.trim()) { addNote(c.ticker, draft.trim()); setDraft(""); } }}>Save note</GoldButton></div>
      </div>
      {list.length === 0 ? (
        <EmptyState icon={PenLine} title="No notes yet" body="Jot down your thesis, watch-outs and open questions for this company. They'll stay right here for the rest of your session." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {list.map((n) => (
            <div key={n.id} style={{ background: T.navy850, border: `1px solid ${T.line}`, borderRadius: 10, padding: "12px 14px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 6 }}>
                <span style={{ fontFamily: fontMono, fontSize: 11, color: T.mutedDark }}>{fmtDate(new Date(n.ts))}</span>
                <button onClick={() => deleteNote(c.ticker, n.id)} style={{ background: "none", border: "none", cursor: "pointer", color: T.mutedDark, display: "flex" }}><Trash2 size={13} /></button>
              </div>
              <div style={{ fontFamily: fontBody, fontSize: 13.5, color: T.paper, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{n.text}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---- Company page shell ---- */
function CompanyPage({ ticker, navigate, mode, setMode, watchlist, toggleWatch, compareList, toggleCompare, notes, addNote, updateNote, deleteNote }) {
  const [tab, setTab] = useState("overview");
  const c = companyByTicker[ticker] || COMPANIES[0];
  useEffect(() => { setTab("overview"); }, [ticker]);
  const noteCount = (notes[c.ticker] || []).length;

  return (
    <div>
      <CompanyHeader c={c} mode={mode} watchlist={watchlist} toggleWatch={toggleWatch} compareList={compareList}
        toggleCompare={toggleCompare} notesCount={noteCount} onAddNote={() => setTab("notes")} />

      <div style={{ display: "flex", gap: 4, borderBottom: `1px solid ${T.line}`, marginBottom: 26, overflowX: "auto" }}>
        {COMPANY_TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            fontFamily: fontBody, fontSize: 13, fontWeight: 600, padding: "10px 14px", background: "none",
            border: "none", cursor: "pointer", whiteSpace: "nowrap", color: tab === t.id ? T.gold : T.muted,
            borderBottom: `2px solid ${tab === t.id ? T.gold : "transparent"}`, marginBottom: -1,
          }}>{t.label}{t.id === "notes" && noteCount > 0 ? ` (${noteCount})` : ""}</button>
        ))}
      </div>

      {tab === "overview" && <OverviewTab c={c} mode={mode} navigate={navigate} />}
      {tab === "performance" && <PerformanceTab c={c} mode={mode} setMode={setMode} />}
      {tab === "financials" && <FinancialsTab c={c} mode={mode} setMode={setMode} />}
      {tab === "valuation" && <ValuationTab c={c} mode={mode} setMode={setMode} />}
      {tab === "ownership" && <OwnershipTab c={c} mode={mode} setMode={setMode} />}
      {tab === "events" && <EventsTab c={c} mode={mode} />}
      {tab === "peers" && <PeersTab c={c} mode={mode} navigate={navigate} />}
      {tab === "notes" && <NotesTab c={c} notes={notes} addNote={addNote} updateNote={updateNote} deleteNote={deleteNote} />}
    </div>
  );
}

/* ============================================================================
   COMPARE PAGE
============================================================================ */
const COMPARE_LINE_COLORS = [T.gold, "#6FB3D9", "#8FBF8A", "#D19A6A", "#B893D1"];
function ComparePage({ compareList, toggleCompare, navigate, mode, setMode }) {
  const [range, setRange] = useState("1Y");
  const [showNifty, setShowNifty] = useState(true);
  const companies = compareList.map((t) => companyByTicker[t]).filter(Boolean);
  const days = RANGE_DAYS[range];
  const dense = mode === "research";

  const chartData = useMemo(() => {
    if (!companies.length) return [];
    const n = Math.min(days, N_DAYS - 1);
    const startIdx = N_DAYS - 1 - n;
    const bases = companies.map((c) => c.series[startIdx]);
    const niftyBase = indexByName.NIFTY50.series[startIdx];
    const out = [];
    for (let i = startIdx; i < N_DAYS; i++) {
      const row = { label: fmtDateShort(DATES[i]) };
      companies.forEach((c, ci) => { row[c.ticker] = (c.series[i] / bases[ci] - 1) * 100; });
      if (showNifty) row.Nifty50 = (indexByName.NIFTY50.series[i] / niftyBase - 1) * 100;
      out.push(row);
    }
    return out;
  }, [companies.map((c) => c.ticker).join(","), days, showNifty]);

  const condensedMetrics = [
    { key: "pe", label: "P/E (x)", dp: 1 }, { key: "roe", label: "ROE (%)", dp: 1 },
    { key: "divYield", label: "Div yield (%)", dp: 2 }, { key: "mcapCr", label: "Market cap", dp: 0, fmt: fmtCr },
  ];
  const fullMetrics = [
    { key: "pe", label: "P/E (x)", dp: 1 }, { key: "pb", label: "P/B (x)", dp: 1 },
    { key: "roe", label: "ROE (%)", dp: 1 }, { key: "roce", label: "ROCE (%)", dp: 1 },
    { key: "_g3", label: "Revenue CAGR, 3Y (%)", dp: 1 },
    { key: "de", label: "Debt/Equity", dp: 2 }, { key: "divYield", label: "Div yield (%)", dp: 2 },
    { key: "mcapCr", label: "Market cap", dp: 0, fmt: fmtCr }, { key: "tradedValueCr", label: "Traded value", dp: 0, fmt: fmtCr },
  ];
  const metrics = dense ? fullMetrics : condensedMetrics;
  const returnRows = dense ? ["1M", "6M", "1Y"] : ["1Y"];
  const rangeReturns = { "1M": RANGE_DAYS["1M"], "6M": RANGE_DAYS["6M"], "1Y": RANGE_DAYS["1Y"] };
  const compRows = useMemo(() => companies.map((c) => {
    const a = c.annual;
    return { ...c, _g3: (Math.pow(a[a.length - 1].revenue / a[Math.max(0, a.length - 4)].revenue, 1 / 3) - 1) * 100 };
  }), [companies.map((c) => c.ticker).join(",")]);

  function cellShade(vals, v, higherIsExtreme = true) {
    const max = Math.max(...vals), min = Math.min(...vals);
    if (max === min) return "transparent";
    if (v === max) return "rgba(198,161,91,0.16)";
    if (v === min) return "rgba(141,150,179,0.10)";
    return "transparent";
  }

  return (
    <div>
      <SectionHeading eyebrow="Research workspace" title="Compare companies"
        sub="Select two to five companies to compare price performance, valuation, profitability, growth, leverage and risk side by side." right={<DemoBadge />} />

      <div style={{ display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap", marginBottom: 20 }}>
        <div style={{ flex: "0 0 320px" }}>
          <GlobalSearch full placeholder="Add a company to compare\u2026" onPick={(t) => companies.length < 5 && toggleCompare(t)} />
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", flex: 1 }}>
          {companies.map((c, i) => (
            <Chip key={c.ticker} onRemove={() => toggleCompare(c.ticker)}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: COMPARE_LINE_COLORS[i] }} />
              {c.ticker}
            </Chip>
          ))}
          {companies.length === 0 && <span style={{ fontFamily: fontBody, fontSize: 12.5, color: T.muted, padding: "8px 0" }}>Search above, or add companies from the Stocks directory using the layers icon.</span>}
        </div>
      </div>

      {companies.length < 2 ? (
        <EmptyState icon={Layers} title="Add at least two companies" body="Compare price performance and fundamentals side by side once you've added a couple of names \u2014 try RELIANCE and TCS to get started." />
      ) : (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
            <RangeTabs options={dense ? ["1M", "3M", "6M", "1Y", "2Y", "5Y"] : ["1M", "6M", "1Y"]} value={range} onChange={setRange} />
            <IconGhostButton active={showNifty} onClick={() => setShowNifty((v) => !v)}>Nifty 50 benchmark</IconGhostButton>
          </div>
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={chartData} margin={{ top: 6, right: 14, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={T.lineSoft} strokeDasharray="2 4" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: T.mutedDark, fontFamily: fontMono, fontSize: 10 }} axisLine={{ stroke: T.line }} tickLine={false} minTickGap={50} />
              <YAxis tick={{ fill: T.mutedDark, fontFamily: fontMono, fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v.toFixed(0)}%`} width={44} />
              <Tooltip content={<ChartTooltip />} />
              <ReferenceLine y={0} stroke={T.line} />
              {companies.map((c, i) => <Line key={c.ticker} type="monotone" dataKey={c.ticker} stroke={COMPARE_LINE_COLORS[i]} strokeWidth={2} dot={false} />)}
              {showNifty && <Line type="monotone" dataKey="Nifty50" stroke={T.muted} strokeWidth={1.4} strokeDasharray="4 3" dot={false} />}
            </LineChart>
          </ResponsiveContainer>

          <div style={{ marginTop: 30, overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%", minWidth: dense ? 760 : 520 }}>
              <thead>
                <tr>
                  <Th>Metric</Th>
                  {companies.map((c) => <Th key={c.ticker} align="right">{c.ticker}</Th>)}
                </tr>
              </thead>
              <tbody>
                {returnRows.map((rk) => {
                  const vals = companies.map((c) => ret(c, rangeReturns[rk]));
                  return (
                    <tr key={rk}>
                      <Td strong>Return, {rk}</Td>
                      {companies.map((c, i) => (
                        <Td key={c.ticker} align="right">
                          <div style={{ background: cellShade(vals, vals[i]), margin: "-10px -12px", padding: "10px 12px" }}><MoveTag value={vals[i]} size={12.5} /></div>
                        </Td>
                      ))}
                    </tr>
                  );
                })}
                {metrics.map((m) => {
                  const vals = compRows.map((c) => c[m.key]);
                  return (
                    <tr key={m.key}>
                      <Td strong>{m.label}</Td>
                      {compRows.map((c, i) => (
                        <Td key={c.ticker} align="right" mono>
                          <div style={{ background: cellShade(vals, vals[i]), margin: "-10px -12px", padding: "10px 12px" }}>
                            {m.fmt ? m.fmt(c[m.key]) : c[m.key].toFixed(m.dp)}
                          </div>
                        </Td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ fontFamily: fontBody, fontSize: 11.5, color: T.mutedDark, marginTop: 10 }}>
            Highlighted cells show the highest (gold) and lowest (grey) value per row for quick scanning \u2014 this is a visual aid, not a recommendation.
          </div>
          {!dense && (
            <div style={{ marginTop: 16 }}>
              <ModeUpsell setMode={setMode} summary="See ROCE, revenue growth, traded value and more return periods side by side in Research mode." />
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ============================================================================
   SECTORS PAGE
============================================================================ */
function buildSectorIndexSeries(sectorId) {
  const cons = sectorConstituents(sectorId);
  const totalMcap = cons.reduce((s, c) => s + c.mcapCr, 0);
  const out = new Array(N_DAYS).fill(0);
  for (let i = 0; i < N_DAYS; i++) {
    out[i] = cons.reduce((s, c) => s + c.mcapCr * (c.series[i] / c.series[0]), 0) / totalMcap * 100;
  }
  return out;
}

function SectorRotationChart(onPick) {
  const data = SECTOR_TABLE.map((s) => ({ ...s, x: s.r1m, y: s.r6m, z: Math.sqrt(s.mcapCr) }));
  return (
    <ResponsiveContainer width="100%" height={320}>
      <ScatterChart margin={{ top: 10, right: 24, left: 4, bottom: 10 }}>
        <CartesianGrid stroke={T.lineSoft} strokeDasharray="2 4" />
        <XAxis type="number" dataKey="x" name="1M momentum" tick={{ fill: T.mutedDark, fontFamily: fontMono, fontSize: 10 }} axisLine={{ stroke: T.line }} tickLine={false}
          label={{ value: "1-Month return (momentum) \u2192", position: "insideBottom", offset: -4, fill: T.mutedDark, fontSize: 10.5, fontFamily: fontBody }} />
        <YAxis type="number" dataKey="y" name="6M trend" tick={{ fill: T.mutedDark, fontFamily: fontMono, fontSize: 10 }} axisLine={false} tickLine={false}
          label={{ value: "6-Month return (trend) \u2192", angle: -90, position: "insideLeft", fill: T.mutedDark, fontSize: 10.5, fontFamily: fontBody }} />
        <ZAxis type="number" dataKey="z" range={[80, 500]} />
        <ReferenceLine x={0} stroke={T.line} /><ReferenceLine y={0} stroke={T.line} />
        <Tooltip cursor={{ strokeDasharray: "3 3" }} content={({ active, payload }) => {
          if (!active || !payload?.length) return null;
          const s = payload[0].payload;
          return <div style={{ background: T.navy950, border: `1px solid ${T.line}`, borderRadius: 6, padding: "8px 11px", fontFamily: fontBody, fontSize: 12, color: T.paper }}>
            <strong>{s.name}</strong><br /><span style={{ fontFamily: fontMono, fontSize: 11 }}>1M {fmtPct(s.x)} \u00B7 6M {fmtPct(s.y)}</span>
          </div>;
        }} />
        <Scatter data={data} fill={T.gold} fillOpacity={0.8} />
      </ScatterChart>
    </ResponsiveContainer>
  );
}

function SectorDetail({ sectorId, navigate, mode, watchlist, toggleWatch, compareList, toggleCompare, back }) {
  const s = SECTOR_TABLE.find((x) => x.id === sectorId);
  const [range, setRange] = useState("1Y");
  const cons = sectorConstituents(sectorId).map((c) => ({ ...c, _ret: ret(c, RANGE_DAYS[range]) })).sort((a, b) => b._ret - a._ret);
  const idxSeries = useMemo(() => buildSectorIndexSeries(sectorId), [sectorId]);
  const chartData = idxSeries.slice(-RANGE_DAYS[range]).map((v, i, arr) => ({ label: fmtDateShort(DATES[DATES.length - arr.length + i]), value: v }));
  const idxRet = seriesReturn(idxSeries, RANGE_DAYS[range]);

  return (
    <div>
      <button onClick={back} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: T.muted, fontFamily: fontBody, fontSize: 12.5, marginBottom: 16 }}>
        <ChevronRight size={14} style={{ transform: "rotate(180deg)" }} /> All sectors
      </button>
      <SectionHeading eyebrow="Sector Classification" title={s.name} sub={s.blurb} right={<RangeTabs options={["1M", "6M", "1Y", "3Y"]} value={range} onChange={setRange} />} />

      <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginBottom: 26 }}>
        <div style={{ flex: "2 1 420px" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 8 }}>
            <span style={{ fontFamily: fontMono, fontSize: 22, fontWeight: 700, color: T.paper }}>{idxSeries[idxSeries.length - 1].toFixed(1)}</span>
            <MoveTag value={idxRet} />
            <span style={{ fontFamily: fontBody, fontSize: 11.5, color: T.mutedDark }}>Sector index, mcap-weighted, rebased to 100</span>
          </div>
          <MiniAreaChart data={chartData} positive={idxRet >= 0} height={230} />
        </div>
        <div style={{ flex: "1 1 220px", display: "flex", flexDirection: "column", gap: 12 }}>
          <StatBlock label="Constituents in coverage" value={s.count} mode={mode} />
          <StatBlock label="Combined market cap" value={fmtCr(s.mcapCr)} mode={mode} />
          <StatBlock label="Leading stock (1M)" value={s.leader?.ticker || "\u2014"} mode={mode} />
          <StatBlock label="Lagging stock (1M)" value={s.laggard?.ticker || "\u2014"} mode={mode} />
        </div>
      </div>

      <SectionHeading eyebrow="Constituents" title="Companies in this sector" />
      <div style={{ border: `1px solid ${T.line}`, borderRadius: 10, overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
          <thead><tr><Th>Company</Th><Th align="right">Price</Th><Th align="right">{range} Ret</Th><Th align="right">Mkt cap</Th><Th align="right">P/E</Th><Th align="right">ROE</Th><Th align="center">Actions</Th></tr></thead>
          <tbody>
            {cons.map((c) => (
              <tr key={c.ticker} style={{ cursor: "pointer" }} onClick={() => navigate("company", { ticker: c.ticker })}
                onMouseEnter={(e) => (e.currentTarget.style.background = T.navy900)} onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                <Td><span style={{ fontFamily: fontMono, fontWeight: 700, color: T.gold }}>{c.ticker}</span><div style={{ fontFamily: fontBody, fontSize: 11.5, color: T.muted, whiteSpace: "normal" }}>{c.name}</div></Td>
                <Td align="right" mono>{fmtPrice(c.price)}</Td>
                <Td align="right"><MoveTag value={c._ret} size={12} /></Td>
                <Td align="right" mono>{fmtCr(c.mcapCr)}</Td>
                <Td align="right" mono>{c.pe.toFixed(1)}</Td>
                <Td align="right" mono>{c.roe.toFixed(1)}%</Td>
                <Td align="center">
                  <div style={{ display: "flex", gap: 6, justifyContent: "center" }} onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => toggleWatch(c.ticker)} style={{ background: "none", border: "none", cursor: "pointer", color: watchlist.includes(c.ticker) ? T.gold : T.mutedDark }}><Star size={14} fill={watchlist.includes(c.ticker) ? T.gold : "none"} /></button>
                    <button onClick={() => toggleCompare(c.ticker)} style={{ background: "none", border: "none", cursor: "pointer", color: compareList.includes(c.ticker) ? T.gold : T.mutedDark }}><Layers size={14} /></button>
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SectorsPage({ navigate, mode, watchlist, toggleWatch, compareList, toggleCompare, sectorId, setSectorId }) {
  const [range, setRange] = useState("1M");
  if (sectorId) return <SectorDetail sectorId={sectorId} navigate={navigate} mode={mode} watchlist={watchlist} toggleWatch={toggleWatch} compareList={compareList} toggleCompare={toggleCompare} back={() => setSectorId(null)} />;
  const key = { "1W": "r1w", "1M": "r1m", "6M": "r6m", "1Y": "r1y" }[range];
  return (
    <div>
      <SectionHeading eyebrow="Sector intelligence" title="Where is market leadership occurring?"
        sub="Sector Classification performance across all 11 sectors in coverage." right={<RangeTabs options={["1W", "1M", "6M", "1Y"]} value={range} onChange={setRange} />} />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14, marginBottom: 34 }}>
        {[...SECTOR_TABLE].sort((a, b) => b[key] - a[key]).map((s) => (
          <button key={s.id} onClick={() => setSectorId(s.id)} style={{
            textAlign: "left", background: T.navy850, border: `1px solid ${T.line}`, borderRadius: 12, padding: "16px 18px",
            cursor: "pointer", display: "flex", flexDirection: "column", gap: 10,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
              <span style={{ fontFamily: fontDisplay, fontSize: 16.5, fontWeight: 560, color: T.paper }}>{s.name}</span>
              <MoveTag value={s[key]} size={13} />
            </div>
            <div style={{ fontFamily: fontBody, fontSize: 11.5, color: T.muted, lineHeight: 1.5 }}>{s.blurb}</div>
            <div style={{ display: "flex", justifyContent: "space-between", fontFamily: fontMono, fontSize: 11, color: T.mutedDark, paddingTop: 6, borderTop: `1px solid ${T.lineSoft}` }}>
              <span>{s.count} stocks \u00B7 {fmtCr(s.mcapCr)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontFamily: fontBody, fontSize: 11.5 }}>
              <span style={{ color: T.up }}>\u25B2 {s.leader?.ticker}</span>
              <span style={{ color: T.down }}>\u25BC {s.laggard?.ticker}</span>
            </div>
          </button>
        ))}
      </div>

      <SectionHeading eyebrow="Rotation" title="Momentum vs. trend" sub="Each bubble is a sector, sized by market cap \u2014 upper-right quadrant shows both near-term momentum and a sustained 6-month trend." />
      <div style={{ background: T.navy850, border: `1px solid ${T.line}`, borderRadius: 12, padding: "16px 18px", marginBottom: 30 }}>
        {SectorRotationChart()}
      </div>

      <SectionHeading eyebrow="Heatmap" title="Sector performance heatmap" right={null} />
      <SectorHeatmap range={range} onPick={setSectorId} />
    </div>
  );
}

/* ============================================================================
   CURRENCIES PAGE
============================================================================ */
function CurrenciesPage({ mode }) {
  const [active, setActive] = useState("USDINR");
  const [range, setRange] = useState("1Y");
  const cur = CURRENCIES.find((c) => c.id === active);
  const days = RANGE_DAYS[range];
  const chg = seriesReturn(cur.series, days);
  const last252 = cur.series.slice(-252);
  const hi = Math.max(...last252), lo = Math.min(...last252);
  const chartData = cur.series.slice(-days).map((v, i, arr) => ({ label: fmtDateShort(DATES[DATES.length - arr.length + i]), value: v }));

  return (
    <div>
      <SectionHeading eyebrow="INR reference rates" title="Currencies" sub="Reference rates, not live tradable FX quotes." right={<DemoBadge />} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 10, marginBottom: 26 }}>
        {CURRENCIES.map((c) => {
          const d = seriesReturn(c.series, 1);
          const p = c.series[c.series.length - 1];
          return (
            <button key={c.id} onClick={() => setActive(c.id)} style={{
              textAlign: "left", background: active === c.id ? "rgba(198,161,91,0.1)" : T.navy850, border: `1px solid ${active === c.id ? T.gold : T.line}`,
              borderRadius: 10, padding: "13px 15px", cursor: "pointer", display: "flex", flexDirection: "column", gap: 6,
            }}>
              <span style={{ fontFamily: fontBody, fontSize: 12, fontWeight: 700, color: T.muted }}>{c.pair}</span>
              <span style={{ fontFamily: fontMono, fontSize: 18, fontWeight: 700, color: T.paper }}>{p.toFixed(3)}</span>
              <MoveTag value={d} size={12} />
            </button>
          );
        })}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
        <div>
          <div style={{ fontFamily: fontBody, fontSize: 13, fontWeight: 700, color: T.paper }}>{cur.pair}</div>
          <div style={{ fontFamily: fontBody, fontSize: 11.5, color: T.mutedDark }}>52W range {lo.toFixed(3)} \u2013 {hi.toFixed(3)}</div>
        </div>
        <RangeTabs options={["1M", "3M", "6M", "1Y", "3Y", "5Y"]} value={range} onChange={setRange} />
      </div>
      <div style={{ background: T.navy850, border: `1px solid ${T.line}`, borderRadius: 12, padding: "18px 20px" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 10 }}>
          <span style={{ fontFamily: fontMono, fontSize: 24, fontWeight: 700, color: T.paper }}>{cur.series[cur.series.length - 1].toFixed(3)}</span>
          <MoveTag value={chg} />
        </div>
        <MiniAreaChart data={chartData} positive={chg >= 0} height={240} />
      </div>
      <ExplainRow mode={mode} text="Reference rates are illustrative end-of-day levels for research context \u2014 not a live, tradable quote, and not a forecast of future currency movement." />
    </div>
  );
}

/* ============================================================================
   WATCHLIST PAGE
============================================================================ */
function WatchlistPage({ watchlist, toggleWatch, navigate }) {
  const rows = watchlist.map((t) => companyByTicker[t]).filter(Boolean);
  return (
    <div>
      <SectionHeading eyebrow="No login required" title="Watchlist" sub="Persists for this session only. Add companies from any page using the star icon." right={<DemoBadge />} />
      {rows.length === 0 ? (
        <EmptyState icon={Star} title="Your watchlist is empty" body="Search for a company or browse the Stocks directory, then tap the star to start tracking it here."
          action={<GoldButton small onClick={() => navigate("stocks")}>Browse stocks</GoldButton>} />
      ) : (
        <div style={{ border: `1px solid ${T.line}`, borderRadius: 10, overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
            <thead><tr><Th>Company</Th><Th align="right">Price</Th><Th align="right">1D</Th><Th align="right">1Y ret.</Th><Th align="right">P/E</Th><Th align="right">Div yld</Th><Th align="right">Next results (est.)</Th><Th align="center">Remove</Th></tr></thead>
            <tbody>
              {rows.map((c) => {
                const nextResult = new Date(END_DATE); nextResult.setDate(nextResult.getDate() + 38);
                return (
                  <tr key={c.ticker} style={{ cursor: "pointer" }} onClick={() => navigate("company", { ticker: c.ticker })}
                    onMouseEnter={(e) => (e.currentTarget.style.background = T.navy900)} onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                    <Td><span style={{ fontFamily: fontMono, fontWeight: 700, color: T.gold }}>{c.ticker}</span><div style={{ fontFamily: fontBody, fontSize: 11.5, color: T.muted, whiteSpace: "normal" }}>{c.name}</div></Td>
                    <Td align="right" mono>{fmtPrice(c.price)}</Td>
                    <Td align="right"><MoveTag value={ret(c, 1)} size={12} /></Td>
                    <Td align="right"><MoveTag value={ret(c, RANGE_DAYS["1Y"])} size={12} /></Td>
                    <Td align="right" mono>{c.pe.toFixed(1)}</Td>
                    <Td align="right" mono>{c.divYield.toFixed(2)}%</Td>
                    <Td align="right" mono>{fmtDateShort(nextResult)}</Td>
                    <Td align="center">
                      <button onClick={(e) => { e.stopPropagation(); toggleWatch(c.ticker); }} style={{ background: "none", border: "none", cursor: "pointer", color: T.mutedDark }}><X size={15} /></button>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ============================================================================
   FOOTER + TRUST DRAWERS
============================================================================ */
const DRAWER_CONTENT = {
  sources: {
    title: "Data sources",
    body: (
      <>
        <p>Every figure in StockDekho is generated demo data produced for this prototype \u2014 there is no live connection to NSE, BSE, any data vendor, or company filings.</p>
        <p>In a production deployment, market and reference data would need to come from appropriately licensed sources: a recognised stock exchange or its authorised data vendors, and audited company filings for financials, shareholding and disclosures.</p>
      </>
    ),
  },
  methodology: {
    title: "Methodology",
    body: (
      <>
        <p>Performance statistics (CAGR, drawdown, volatility, beta) are calculated using standard formulas over the illustrative demo price series shown on each page.</p>
        <p>Sector performance is market-cap-weighted across the constituent companies in coverage. Peer comparisons and heatmaps use the same underlying demo dataset throughout, so figures stay internally consistent as you navigate \u2014 but they do not reflect real market outcomes.</p>
      </>
    ),
  },
  definitions: {
    title: "Metric definitions",
    body: (
      <>
        {Object.entries(METRIC_HELP).map(([k, v]) => (
          <p key={k}><strong style={{ color: T.paper }}>{k.toUpperCase()}</strong> \u2014 {v}</p>
        ))}
      </>
    ),
  },
  risk: {
    title: "Risk disclosures",
    body: (
      <>
        <p>StockDekho is an information and research product only. It is not a broker, trading platform, investment adviser, or a source of personalised investment advice.</p>
        <p>Nothing on this site is a recommendation to buy, sell or hold any security. Past performance shown in demo data is not, and is not intended to be, indicative of future results. Equity investments carry risk, including loss of principal.</p>
      </>
    ),
  },
  corpAction: {
    title: "Corporate-action treatment",
    body: (
      <>
        <p>In this prototype, price history is shown on a simplified basis and does not model specific corporate actions such as stock splits, bonus issues or rights issues.</p>
        <p>A production system would adjust historical prices for splits and bonuses, and treat dividends separately in total-return calculations, consistent with standard index-provider conventions.</p>
      </>
    ),
  },
  eodTiming: {
    title: "End-of-day data timing",
    body: (
      <>
        <p>All prices in this demo are labelled as end-of-day (EOD) and dated {fmtDate(END_DATE)}, 15:30 IST \u2014 illustrative of a typical post-close data refresh.</p>
        <p>StockDekho does not display live, intraday, or real-time tick data in this prototype.</p>
      </>
    ),
  },
};

function Footer({ openDrawer }) {
  const links = [
    { id: "sources", label: "Data sources" }, { id: "methodology", label: "Methodology" },
    { id: "definitions", label: "Metric definitions" }, { id: "risk", label: "Risk disclosures" },
    { id: "corpAction", label: "Corporate-action treatment" }, { id: "eodTiming", label: "EOD data timing" },
  ];
  return (
    <footer style={{ borderTop: `1px solid ${T.line}`, marginTop: 60, background: T.navy950 }}>
      <div style={{ maxWidth: 1360, margin: "0 auto", padding: "34px 24px 44px" }}>
        <div style={{
          background: T.navy850, border: `1px solid ${T.line}`, borderRadius: 10, padding: "14px 18px",
          fontFamily: fontBody, fontSize: 12.5, color: T.muted, marginBottom: 22, lineHeight: 1.6,
        }}>
          For information and research purposes only. Not investment advice. Past performance is not indicative of future results. StockDekho is not a broker,
          exchange member, or registered investment adviser, and displays demo/mock end-of-day data throughout this prototype.
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontFamily: fontDisplay, fontSize: 17, fontWeight: 650, color: T.paper }}>StockDekho</span>
            <span style={{ fontFamily: fontBody, fontSize: 11.5, color: T.mutedDark }}>\u00A9 2026 \u00B7 Research prototype</span>
          </div>
          <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
            {links.map((l) => (
              <button key={l.id} onClick={() => openDrawer(l.id)} style={{ background: "none", border: "none", cursor: "pointer", fontFamily: fontBody, fontSize: 12, color: T.muted }}>{l.label}</button>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}

/* ============================================================================
   APP ROOT
============================================================================ */
export default function App() {
  const [mode, setMode] = useState("explore");
  const [page, setPage] = useState("markets");
  const [ticker, setTicker] = useState("RELIANCE");
  const [sectorId, setSectorId] = useState(null);
  const [watchlist, setWatchlist] = useState(["RELIANCE", "TCS", "HDFCBANK"]);
  const [compareList, setCompareList] = useState(["TCS", "INFY"]);
  const [notes, setNotes] = useState({});
  const [drawer, setDrawer] = useState(null);

  function navigate(p, params = {}) {
    if (p === "company" && params.ticker) setTicker(params.ticker);
    if (p === "sectors") setSectorId(params.sectorId || null);
    if (p !== "sectors") setSectorId(null);
    setPage(p);
    window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
  }
  function toggleWatch(t) { setWatchlist((w) => (w.includes(t) ? w.filter((x) => x !== t) : [...w, t])); }
  function toggleCompare(t) {
    setCompareList((c) => {
      if (c.includes(t)) return c.filter((x) => x !== t);
      if (c.length >= 5) return c;
      return [...c, t];
    });
  }
  function addNote(t, text) {
    setNotes((n) => ({ ...n, [t]: [...(n[t] || []), { id: `${t}-${Date.now()}`, text, ts: Date.now() }] }));
  }
  function updateNote(t, id, text) {
    setNotes((n) => ({ ...n, [t]: (n[t] || []).map((x) => (x.id === id ? { ...x, text } : x)) }));
  }
  function deleteNote(t, id) {
    setNotes((n) => ({ ...n, [t]: (n[t] || []).filter((x) => x.id !== id) }));
  }

  return (
    <div style={{ minHeight: "100vh", background: T.navy950, fontFamily: fontBody, color: T.paper }}>
      <style>{`
        ${FONT_IMPORT}
        * { box-sizing: border-box; }
        body, html { margin: 0; padding: 0; }
        ::selection { background: rgba(198,161,91,0.35); }
        table { font-variant-numeric: tabular-nums; }
        input::placeholder, textarea::placeholder { color: ${T.mutedDark}; }
        button { font: inherit; }
        ::-webkit-scrollbar { width: 9px; height: 9px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: ${T.line}; border-radius: 5px; }
        .sd-mobile-toggle { display: none; }
        @media (max-width: 860px) {
          .sd-desktop-nav, .sd-desktop-search { display: none !important; }
          .sd-mobile-toggle { display: flex !important; }
        }
        @media (min-width: 861px) {
          .sd-mobile-nav { display: none !important; }
        }
      `}</style>

      <Header mode={mode} setMode={setMode} page={page} navigate={navigate} watchlistCount={watchlist.length} compareCount={compareList.length} />

      <main style={{ maxWidth: 1360, margin: "0 auto", padding: "28px 24px 20px" }}>
        {page === "markets" && <MarketsPage navigate={navigate} watchlist={watchlist} toggleWatch={toggleWatch} />}
        {page === "stocks" && <StocksPage navigate={navigate} mode={mode} setMode={setMode} watchlist={watchlist} toggleWatch={toggleWatch} compareList={compareList} toggleCompare={toggleCompare} />}
        {page === "company" && <CompanyPage ticker={ticker} navigate={navigate} mode={mode} setMode={setMode} watchlist={watchlist} toggleWatch={toggleWatch} compareList={compareList} toggleCompare={toggleCompare} notes={notes} addNote={addNote} updateNote={updateNote} deleteNote={deleteNote} />}
        {page === "compare" && <ComparePage compareList={compareList} toggleCompare={toggleCompare} navigate={navigate} mode={mode} setMode={setMode} />}
        {page === "sectors" && <SectorsPage navigate={navigate} mode={mode} watchlist={watchlist} toggleWatch={toggleWatch} compareList={compareList} toggleCompare={toggleCompare} sectorId={sectorId} setSectorId={(id) => setSectorId(id)} />}
        {page === "currencies" && <CurrenciesPage mode={mode} />}
        {page === "watchlist" && <WatchlistPage watchlist={watchlist} toggleWatch={toggleWatch} navigate={navigate} />}
      </main>

      <Footer openDrawer={setDrawer} />
      {drawer && <Drawer title={DRAWER_CONTENT[drawer].title} onClose={() => setDrawer(null)}>{DRAWER_CONTENT[drawer].body}</Drawer>}
    </div>
  );
}
