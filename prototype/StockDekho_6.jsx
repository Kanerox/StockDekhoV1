import React, { useState, useMemo, useRef, useEffect } from "react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine, Legend,
} from "recharts";
import {
  Search, ChevronDown, ChevronRight, X, Plus, Star, StarOff, TrendingUp, TrendingDown,
  BookOpen, FlaskConical, Info, ArrowUpRight, ArrowDownRight, FileText, Clock, ChevronLeft,
  Bell, Bookmark, Layers, PieChart, BarChart2, Newspaper, ShieldCheck, ExternalLink,
} from "lucide-react";

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

// ---- shared extended return-period support (SI / YTD / 3M / 6M / 9M / 1Y / 3Y / 5Y / 10Y / Max + custom) ----
const EXTENDED_RANGES = ["SI", "YTD", "3M", "6M", "9M", "1Y", "3Y", "5Y", "10Y", "Max"];
const RANGE_TRADING_DAYS = {
  "1M": 22, "3M": 66, "6M": 130, "9M": 195, "1Y": 250, "2Y": 500, "3Y": 750,
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
const PERIOD_MAGNITUDE = { SI: 180, YTD: 14, "3M": 9, "6M": 15, "9M": 19, "1Y": 22, "3Y": 55, "5Y": 85, "10Y": 160, Max: 190, Custom: 12 };
function demoPeriodReturn(seed, period) {
  const rnd = seedRandom(seed + "RET" + period);
  const magnitude = PERIOD_MAGNITUDE[period] || 20;
  return +((rnd() - 0.42) * magnitude).toFixed(2);
}
function demoSmallReturn(seed, magnitude) {
  const rnd = seedRandom(seed);
  return +((rnd() - 0.48) * magnitude).toFixed(2);
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
const RAW_STOCKS = [
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

const STOCKS_BY_TICKER = Object.fromEntries(RAW_STOCKS.map((s) => [s.ticker, s]));

// Demo constituent membership for each benchmark index, drawn from the representative stock
// universe above. A live product would source the actual, licensed index membership lists.
const INDEX_CONSTITUENTS = {
  NIFTY50: RAW_STOCKS.filter((s) => s.cap === "Large").map((s) => s.ticker),
  NEXT50: RAW_STOCKS.filter((s) => s.cap === "Large").slice(8, 20).map((s) => s.ticker),
  MIDCAP150: RAW_STOCKS.filter((s) => s.cap === "Mid").map((s) => s.ticker),
  SMALLCAP250: RAW_STOCKS.filter((s) => s.cap === "Small" || s.cap === "Micro").map((s) => s.ticker),
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

function LiveTag({ live, approx, small }) {
  if (live) {
    return (
      <span title={approx ? "Live-anchored (approximate reference level)" : "Live-anchored EOD snapshot"}
        style={{
          fontSize: small ? 9 : 10, letterSpacing: 0.5, textTransform: "uppercase", fontWeight: 700,
          color: THEME.up, border: `1px solid ${THEME.up}55`, borderRadius: 3, padding: small ? "1px 5px" : "2px 6px",
          background: "rgba(63,167,114,0.08)",
        }}>
        {approx ? "Live · approx" : "Live EOD"}
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

function Move({ value, suffix = "%", size = 13 }) {
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
      <span>Live-anchored EOD snapshot — indices as of <b style={{ color: THEME.ink }}>{SNAPSHOT_META.indicesAsOf}</b>, fetched {SNAPSHOT_META.fetchedAt}. Financial statements, ownership and multi-year charts are demo/illustrative.</span>
      <span style={{ marginLeft: "auto" }}>Not investment advice.</span>
    </div>
  );
}

function SectionHeading({ eyebrow, title, action }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 14 }}>
      <div>
        {eyebrow && <div style={{ fontSize: 11, letterSpacing: 1.2, textTransform: "uppercase", color: THEME.gold, marginBottom: 4 }}>{eyebrow}</div>}
        <h2 className="sd-serif" style={{ fontSize: 22, margin: 0, fontWeight: 600 }}>{title}</h2>
      </div>
      {action}
    </div>
  );
}

function Panel({ children, style, ...rest }) {
  return <div style={{ background: THEME.panel, border: `1px solid ${THEME.hairline}`, borderRadius: 6, ...style }} {...rest}>{children}</div>;
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

// Richer return-period control: SI / YTD / 3M / 6M / 9M / 1Y / 3Y / 5Y / 10Y / Max, plus a custom
// start–end date range. Meant to sit alongside a page's existing simple range pills, not replace them.
function ReturnRangeSelector({ active, onSelect, customRange, onCustomRange }) {
  const [customOpen, setCustomOpen] = useState(false);
  const dateInputStyle = {
    background: THEME.navyDeep, border: `1px solid ${THEME.hairline}`, color: THEME.ink,
    borderRadius: 4, padding: "5px 7px", fontSize: 11.5, colorScheme: "dark",
  };
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
      <span style={{ fontSize: 10.5, color: THEME.inkDim, marginRight: 2 }}>Period Range:</span>
      {EXTENDED_RANGES.map((r) => (
        <Pill key={r} active={active === r} onClick={() => { onSelect(r); setCustomOpen(false); }}>{r}</Pill>
      ))}
      <Pill active={active === "Custom" || customOpen} onClick={() => setCustomOpen((o) => !o)}>Custom</Pill>
      {customOpen && (
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input type="date" style={dateInputStyle} value={customRange?.start || ""} onChange={(e) => onCustomRange({ ...customRange, start: e.target.value })} />
          <span style={{ color: THEME.inkDim, fontSize: 11 }}>→</span>
          <input type="date" style={dateInputStyle} value={customRange?.end || ""} onChange={(e) => onCustomRange({ ...customRange, end: e.target.value })} />
          <button onClick={() => customRange?.start && customRange?.end && onSelect("Custom")} className="sd-focusable" style={{
            background: THEME.gold, color: THEME.navyDeep, border: "none", borderRadius: 4, padding: "5px 10px", fontSize: 11.5, fontWeight: 700, cursor: "pointer",
          }}>Apply</button>
        </div>
      )}
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
function Header({ page, setPage, mode, setMode, watchlist, compareList, query, setQuery, onSelectSearch }) {
  const [searchOpen, setSearchOpen] = useState(false);
  const results = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.trim().toLowerCase();
    return RAW_STOCKS.filter((s) => s.ticker.toLowerCase().includes(q) || s.name.toLowerCase().includes(q)).slice(0, 8);
  }, [query]);

  const navItems = [
    { key: "markets", label: "Markets" },
    { key: "stocks", label: "Stocks" },
    { key: "sectors", label: "Sectors" },
    { key: "compare", label: "Compare" },
    { key: "currencies", label: "Currencies" },
    { key: "watchlist", label: "Watchlist" },
  ];

  return (
    <div style={{ position: "sticky", top: 0, zIndex: 40, background: THEME.navy, borderBottom: `1px solid ${THEME.hairline}` }}>
      <DemoBanner />
      <div style={{ display: "flex", alignItems: "center", gap: 22, padding: "10px 20px" }}>
        <div onClick={() => setPage("markets")} style={{ cursor: "pointer", display: "flex", alignItems: "baseline", gap: 0, flexShrink: 0 }}>
          <span className="sd-serif" style={{ fontSize: 21, fontWeight: 700, color: THEME.cream, letterSpacing: 0.3 }}>StockDekho</span>
          <span style={{ color: THEME.gold, fontSize: 42, lineHeight: 0, position: "relative", top: 1, marginLeft: 1 }}>.</span>
        </div>

        <nav style={{ display: "flex", gap: 4 }}>
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

        <div style={{ position: "relative", flex: 1, maxWidth: 380, marginLeft: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, background: THEME.panel, border: `1px solid ${THEME.hairline}`, borderRadius: 5, padding: "7px 10px" }}>
            <Search size={14} color={THEME.inkDim} />
            <input
              value={query}
              onChange={(e) => { setQuery(e.target.value); setSearchOpen(true); }}
              onFocus={() => setSearchOpen(true)}
              placeholder="Search RELIANCE, TCS, INFY…"
              style={{ background: "none", border: "none", outline: "none", color: THEME.ink, fontSize: 13, width: "100%" }}
            />
            <span className="sd-mono" style={{ fontSize: 10, color: THEME.inkDim, border: `1px solid ${THEME.hairline}`, borderRadius: 3, padding: "1px 5px" }}>/</span>
          </div>
          {searchOpen && results.length > 0 && (
            <div className="sd-fade-in" style={{ position: "absolute", top: 40, left: 0, right: 0, background: THEME.panelAlt, border: `1px solid ${THEME.hairline}`, borderRadius: 6, overflow: "hidden", boxShadow: "0 12px 28px rgba(0,0,0,0.4)" }}>
              {results.map((r) => (
                <div key={r.ticker} className="sd-row-hover" onClick={() => { onSelectSearch(r.ticker); setSearchOpen(false); setQuery(""); }}
                  style={{ padding: "9px 12px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `1px solid ${THEME.hairline}` }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{r.name} <span style={{ color: THEME.inkDim, fontWeight: 400 }}>· {r.ticker}</span></div>
                    <div style={{ fontSize: 11, color: THEME.inkDim }}>{r.sector}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div className="sd-mono" style={{ fontSize: 13 }}>₹{fmtNum(r.price)}</div>
                    <Move value={r.chgPct} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: "flex", background: THEME.panel, border: `1px solid ${THEME.hairline}`, borderRadius: 20, padding: 3, flexShrink: 0 }}>
          <button onClick={() => setMode("explore")} className="sd-focusable" style={{
            border: "none", cursor: "pointer", padding: "6px 12px", borderRadius: 16, fontSize: 12, fontWeight: 700,
            background: mode === "explore" ? THEME.gold : "transparent", color: mode === "explore" ? THEME.navyDeep : THEME.inkDim,
            display: "flex", alignItems: "center", gap: 5,
          }}><BookOpen size={13} />Explore</button>
          <button onClick={() => setMode("research")} className="sd-focusable" style={{
            border: "none", cursor: "pointer", padding: "6px 12px", borderRadius: 16, fontSize: 12, fontWeight: 700,
            background: mode === "research" ? THEME.gold : "transparent", color: mode === "research" ? THEME.navyDeep : THEME.inkDim,
            display: "flex", alignItems: "center", gap: 5,
          }}><FlaskConical size={13} />Research</button>
        </div>
      </div>
    </div>
  );
}

/* =========================================================================================
   MARKETS HOME PAGE
   ========================================================================================= */
function IndexCard({ idx, onOpen }) {
  return (
    <div onClick={() => onOpen(idx.key)} className="sd-row-hover" style={{
      cursor: "pointer", border: `1px solid ${THEME.hairline}`, borderRadius: 6, padding: "12px 14px",
      background: THEME.panel, width: 176, minWidth: 176, height: 128, display: "flex", flexDirection: "column", justifyContent: "space-between", flexShrink: 0,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: THEME.creamDim, lineHeight: 1.3, minHeight: 32, display: "flex", alignItems: "flex-start" }}>{idx.name}</div>
          <div className="sd-mono" style={{ fontSize: 17, marginTop: 3 }}>{idx.isVix ? fmtNum(idx.value) : fmtInt(Math.round(idx.value))}</div>
        </div>
        <LiveTag live={idx.live} approx={idx.approx} small />
      </div>
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Move value={idx.chgPct} size={12} />
          <Sparkline data={idx.spark} width={70} height={24} />
        </div>
        <div style={{ fontSize: 10, color: THEME.inkDim, marginTop: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>EOD · {idx.sourceDate}</div>
      </div>
    </div>
  );
}

/* =========================================================================================
   BENCHMARK RESEARCH PAGE — opened by clicking any index card on the Markets homepage
   ========================================================================================= */
function BenchmarkDetailPage({ indexKey, back, openCompany, watchlist, toggleWatch, compareList, toggleCompare }) {
  const idx = INDICES.find((i) => i.key === indexKey) || INDICES[0];
  const [range, setRange] = useState("1Y");
  const [customRange, setCustomRange] = useState({ start: "", end: "" });
  const [newsOpen, setNewsOpen] = useState(null);
  const series = getSeriesForRange("BENCHDETAIL" + idx.key, idx.value, range, customRange, 0.012);
  const periodReturn = demoPeriodReturn(idx.key, range);
  const low = Math.min(...series), high = Math.max(...series);
  const constituents = (INDEX_CONSTITUENTS[idx.key] || []).map((t) => STOCKS_BY_TICKER[t]).filter(Boolean);
  const news = indexNews(idx.key);

  return (
    <div className="sd-fade-in" style={{ padding: "22px 20px 70px", maxWidth: 1280, margin: "0 auto" }}>
      <button onClick={back} style={{ background: "none", border: "none", color: THEME.gold, cursor: "pointer", fontSize: 12.5, display: "flex", alignItems: "center", gap: 4, marginBottom: 10 }}>
        <ChevronLeft size={14} /> Back to markets
      </button>

      <Panel style={{ padding: 20, marginBottom: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <h1 className="sd-serif" style={{ fontSize: 24, margin: 0 }}>{idx.name}</h1>
              <LiveTag live={idx.live} approx={idx.approx} />
            </div>
            <div style={{ fontSize: 12.5, color: THEME.inkDim, marginTop: 4 }}>Benchmark index · EOD · {idx.sourceDate}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div className="sd-mono" style={{ fontSize: 28 }}>{idx.isVix ? fmtNum(idx.value) : fmtInt(Math.round(idx.value))}</div>
            <Move value={idx.chgPct} size={14} />
            {idx.low52 !== undefined && idx.high52 !== undefined && (
              <div style={{ fontSize: 11, color: THEME.inkDim, marginTop: 6 }}>52W {fmtInt(Math.round(idx.low52))} – {fmtInt(Math.round(idx.high52))}</div>
            )}
          </div>
        </div>
        <div style={{ fontSize: 11, color: THEME.inkDim, marginTop: 12, borderTop: `1px solid ${THEME.hairline}`, paddingTop: 10 }}>
          Demo EOD benchmark snapshot{idx.approx ? " — aggregator-referenced, approximate" : ", live-anchored"}. Not investment advice. Historical chart series below are demo/illustrative.
        </div>
      </Panel>

      <div style={{ marginBottom: 12 }}>
        <ReturnRangeSelector active={range} onSelect={setRange} customRange={customRange} onCustomRange={setCustomRange} />
      </div>

      <Panel style={{ padding: 16 }}>
        <PriceChart series={series} height={320} color={THEME.gold} />
      </Panel>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginTop: 14 }}>
        {[
          [`${range} performance (demo)`, null, periodReturn],
          ["Today's change", null, idx.chg !== undefined ? idx.chgPct : null],
          ["Period high", fmtInt(Math.round(high)), null],
          ["Period low", fmtInt(Math.round(low)), null],
        ].map(([l, v, moveVal]) => (
          <Panel key={l} style={{ padding: 12 }}>
            <div style={{ fontSize: 10.5, color: THEME.inkDim }}>{l}</div>
            <div className="sd-mono" style={{ fontSize: 15, marginTop: 4 }}>
              {moveVal !== null ? <Move value={moveVal} size={14} /> : v}
            </div>
          </Panel>
        ))}
      </div>

      <div style={{ fontSize: 11, color: THEME.inkDim, marginTop: 12 }}>
        Calculation methodology is illustrative demo data. Chart series generated for internal consistency, not real historical index prints.
      </div>

      <div style={{ marginTop: 40 }}>
        <SectionHeading title="Index News" />
      </div>
      <p style={{ fontSize: 11.5, color: THEME.inkDim, marginTop: -8, marginBottom: 12, maxWidth: 780 }}>
        Recent developments affecting companies that form part of {idx.name} — neutral factual summaries, not investment advice.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 26 }}>
        {news.map((n, i) => (
          <Panel key={i} onClick={() => setNewsOpen(n)} className="sd-row-hover" style={{ padding: 14, cursor: "pointer" }}>
            <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{n.title}</div>
              <div style={{ fontSize: 11, color: THEME.inkDim, whiteSpace: "nowrap" }}>{n.date}</div>
            </div>
            <div style={{ fontSize: 12, color: THEME.creamDim, marginTop: 6, lineHeight: 1.5 }}>{n.teaser}</div>
          </Panel>
        ))}
      </div>

      {newsOpen && (
        <div onClick={() => setNewsOpen(null)} style={{ position: "fixed", inset: 0, background: "rgba(5,8,14,0.65)", zIndex: 60, display: "flex", justifyContent: "flex-end" }}>
          <div onClick={(e) => e.stopPropagation()} className="sd-fade-in sd-scroll" style={{ width: 480, maxWidth: "94vw", height: "100%", background: THEME.navyDeep, borderLeft: `1px solid ${THEME.hairline}`, padding: "28px 30px", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <span style={{ fontSize: 11, color: THEME.gold, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6 }}>{idx.name}</span>
              <button onClick={() => setNewsOpen(null)} style={{ background: "none", border: "none", color: THEME.inkDim, cursor: "pointer" }}><X size={18} /></button>
            </div>
            <h3 className="sd-serif" style={{ fontSize: 24, margin: "12px 0 8px", lineHeight: 1.3 }}>{newsOpen.title}</h3>
            <div style={{ fontSize: 12, color: THEME.inkDim, marginBottom: 16 }}>{newsOpen.date}</div>
            <p style={{ fontSize: 14, lineHeight: 1.6, color: THEME.creamDim, fontStyle: "italic", borderLeft: `2px solid ${THEME.goldSoft}`, paddingLeft: 12, marginBottom: 18 }}>{newsOpen.teaser}</p>
            {newsOpen.body.map((p, i) => (
              <p key={i} style={{ fontSize: 13.5, lineHeight: 1.7, color: THEME.creamDim, marginBottom: 14 }}>{p}</p>
            ))}
            {newsOpen.source && (
              <div style={{ fontSize: 12, color: THEME.inkDim, marginTop: 4, marginBottom: 20, borderTop: `1px solid ${THEME.hairline}`, paddingTop: 12 }}>
                <span style={{ textTransform: "uppercase", letterSpacing: 0.5, fontSize: 10.5, color: THEME.gold, display: "block", marginBottom: 3 }}>Source</span>
                {newsOpen.source}
              </div>
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

      <SectionHeading title="Constituent Stocks" />
      <Panel style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, minWidth: 760 }}>
          <thead><tr style={{ borderBottom: `1px solid ${THEME.hairline}` }}>
            <th style={thStyle}>Company</th><th style={thStyle}>Price</th><th style={thStyle}>Chg%</th>
            <th style={thStyle}>Mkt Cap</th><th style={thStyle}>P/E</th><th style={thStyle}>1Y Return</th>
            <th style={{ ...thStyle, textAlign: "center" }}>Watchlist</th><th style={{ ...thStyle, textAlign: "center" }}>Compare</th>
          </tr></thead>
          <tbody>
            {constituents.map((s) => (
              <tr key={s.ticker} className="sd-row-hover" style={{ borderBottom: `1px solid ${THEME.hairline}` }}>
                <td style={{ ...tdStyle, cursor: "pointer" }} onClick={() => openCompany && openCompany(s.ticker)}>{s.name} <span style={{ color: THEME.inkDim }}>· {s.ticker}</span></td>
                <td style={tdStyle} className="sd-mono">₹{fmtNum(s.price)}</td>
                <td style={tdStyle}><Move value={s.chgPct} /></td>
                <td style={tdStyle} className="sd-mono">{fmtCr(s.mcap)}</td>
                <td style={tdStyle} className="sd-mono">{s.pe ? fmtNum(s.pe, 2) : "—"}</td>
                <td style={tdStyle}><Move value={s.ret1y} /></td>
                <td style={{ ...tdStyle, textAlign: "center" }}>
                  {toggleWatch ? <WatchStar active={watchlist && watchlist.includes(s.ticker)} onClick={() => toggleWatch(s.ticker)} /> : "—"}
                </td>
                <td style={{ ...tdStyle, textAlign: "center" }}>
                  {toggleCompare ? (
                    <button onClick={() => toggleCompare(s.ticker)} className="sd-focusable" title="Add to compare" style={{
                      background: compareList && compareList.includes(s.ticker) ? "rgba(201,162,75,0.15)" : "none",
                      border: `1px solid ${THEME.hairline}`, borderRadius: 4, color: THEME.gold, cursor: "pointer", padding: "3px 6px",
                    }}><Plus size={12} /></button>
                  ) : "—"}
                </td>
              </tr>
            ))}
            {constituents.length === 0 && (
              <tr><td colSpan={8} style={{ ...tdStyle, textAlign: "center", color: THEME.inkDim, padding: 30 }}>
                {idx.isVix ? "India VIX is a volatility index derived from Nifty option prices and has no equity constituents." : "No constituent data available for this benchmark in this demo dataset."}
              </td></tr>
            )}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}

function EventStrip({ mode, onOpen }) {
  return (
    <Panel style={{ padding: 16, marginBottom: 22 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Newspaper size={16} color={THEME.gold} />
          <h3 className="sd-serif" style={{ margin: 0, fontSize: 17 }}>What moved the market?</h3>
        </div>
        <button className="sd-underline-link" style={{ background: "none", border: "none", color: THEME.gold, fontSize: 12.5 }}>View all market events</button>
      </div>
      <ModeExplain mode={mode}>This strip links major events to market and sector moves. It explains what happened alongside the move — it isn't a signal telling you to buy or sell.</ModeExplain>
      <div className="sd-scroll" style={{ display: "flex", gap: 12, overflowX: "auto", marginTop: 12, paddingBottom: 4 }}>
        {MARKET_EVENTS.map((e) => (
          <div key={e.id} onClick={() => onOpen(e)} className="sd-row-hover" style={{
            cursor: "pointer", minWidth: 260, maxWidth: 260, border: `1px solid ${THEME.hairline}`, borderRadius: 5, padding: 12, flexShrink: 0,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5 }}>
              <span style={{ color: THEME.gold, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>{e.cat}</span>
              <span style={{ color: THEME.inkDim }}>{e.date}</span>
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, marginTop: 6, lineHeight: 1.35 }}>{e.title}</div>
            <div style={{ fontSize: 11.5, color: THEME.inkDim, marginTop: 6, lineHeight: 1.4 }}>{e.desc}</div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function MarketsPage({ mode, setPage, openCompany, openBenchmark, watchlist, toggleWatch, compareList, toggleCompare }) {
  const [heatRange, setHeatRange] = useState("1M");
  const [perfTab, setPerfTab] = useState("This Week");
  const [eventOpen, setEventOpen] = useState(null);
  const [capFilter, setCapFilter] = useState("All caps");

  const perfMap = { "This Week": "retWeek", "This Month": "retMonth", "6 Months": "ret6m", "1 Year": "ret1y" };
  const perfKey = perfMap[perfTab];

  const universe = RAW_STOCKS.filter((s) => capFilter === "All caps" || s.cap === capFilter);
  const sortedByRet = [...universe].sort((a, b) => b[perfKey] - a[perfKey]);
  const gainers = [...universe].sort((a, b) => b.chgPct - a.chgPct).slice(0, 6);
  const losers = [...universe].sort((a, b) => a.chgPct - b.chgPct).slice(0, 6);
  const mostActive = [...universe].sort((a, b) => b.tradedVal - a.tradedVal).slice(0, 6);

  const advancing = 2050, declining = 1961, unchanged = 196;
  const total = advancing + declining + unchanged;

  return (
    <div className="sd-fade-in" style={{ padding: "22px 20px 60px", maxWidth: 1280, margin: "0 auto" }}>
      <SectionHeading eyebrow="India Equities · Markets" title="What is happening in Indian equities today?" />

      <div className="sd-scroll" style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 6, marginBottom: 20, alignItems: "flex-start" }}>
        {INDICES.map((idx) => <IndexCard key={idx.key} idx={idx} onOpen={openBenchmark} />)}
      </div>

      <Panel style={{ padding: "18px 20px", marginBottom: 22 }}>
        <div style={{ fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: THEME.gold, marginBottom: 6 }}>Market leadership</div>
        <h1 className="sd-serif" style={{ fontSize: 26, margin: "0 0 10px", lineHeight: 1.25 }}>
          Fifth straight session of losses as oil and FII selling weigh, though IT holds up
        </h1>
        <p style={{ fontSize: 13.5, color: THEME.inkDim, lineHeight: 1.55, maxWidth: 820, margin: 0 }}>
          The Nifty 50 and Sensex both closed down 0.43% on 24 Jul 2026, extending a five-session decline as
          crude oil above $100/bbl and continued FII selling weighed on sentiment. Auto, metal and energy stocks
          led the fall, while information technology names — including HCL Technologies, Cipla and Wipro — bucked
          the trend. Market breadth stayed close to even, with advances only narrowly ahead of declines.
        </p>
        <div style={{ display: "flex", gap: 22, marginTop: 16, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 11, color: THEME.inkDim, marginBottom: 6 }}>Market breadth (NSE, 24 Jul 2026)</div>
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
        </div>
      </Panel>

      <EventStrip mode={mode} onOpen={setEventOpen} />

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
            <div style={{ fontSize: 11.5, textTransform: "uppercase", letterSpacing: 0.5, color: THEME.gold, marginBottom: 8 }}>Related</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {eventOpen.related.map((r) => (
                <button key={r} onClick={() => STOCKS_BY_TICKER[r] && openCompany(r)} style={{
                  border: `1px solid ${THEME.hairline}`, background: "none", color: THEME.creamDim, borderRadius: 4, padding: "5px 10px", fontSize: 12, cursor: "pointer",
                }}>{r}</button>
              ))}
            </div>
          </div>
        </div>
      )}

      <SectionHeading title="Sector performance heatmap"
        action={<div style={{ display: "flex", gap: 6 }}>{["1W", "1M", "6M", "1Y"].map((r) => <Pill key={r} active={heatRange === r} onClick={() => setHeatRange(r)}>{r}</Pill>)}</div>} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 10, marginBottom: 26 }}>
        {SECTOR_LIST.map((s) => {
          const perf = SECTOR_PERF_SEED[s];
          const val = { "1W": perf.w1, "1M": perf.m1, "6M": perf.m6, "1Y": perf.y1 }[heatRange];
          const intensity = Math.min(Math.abs(val) / 8, 1);
          const bg = val >= 0 ? `rgba(63,167,114,${0.12 + intensity * 0.35})` : `rgba(197,86,74,${0.12 + intensity * 0.35})`;
          return (
            <div key={s} onClick={() => setPage("sectors")} className="sd-row-hover" style={{ cursor: "pointer", borderRadius: 6, padding: 12, background: bg, border: `1px solid ${THEME.hairline}` }}>
              <div style={{ fontSize: 12.5, fontWeight: 700 }}>{s}</div>
              <div style={{ fontSize: 9.5, color: THEME.inkDim, marginTop: 1 }}>{SECTOR_INDEX_MAP[s]}</div>
              <div style={{ marginTop: 8 }}><Move value={val} /></div>
              <div style={{ fontSize: 10.5, color: THEME.inkDim, marginTop: 6 }}>Leader {perf.leader} · Lagger {perf.lagger}</div>
            </div>
          );
        })}
      </div>

      <SectionHeading title="Best & worst performers"
        action={<div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <select value={capFilter} onChange={(e) => setCapFilter(e.target.value)} style={selectStyle}>
            {["All caps", "Large", "Mid", "Small", "Micro"].map((c) => <option key={c}>{c}</option>)}
          </select>
          <div style={{ display: "flex", gap: 6 }}>{Object.keys(perfMap).map((t) => <Pill key={t} active={perfTab === t} onClick={() => setPerfTab(t)}>{t}</Pill>)}</div>
        </div>} />
      <ModeExplain mode={mode}>Market-cap and liquidity filters are applied so illiquid microcaps don't dominate the rankings.</ModeExplain>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 12, marginBottom: 26 }}>
        <RankTable title="Top performers" rows={sortedByRet.slice(0, 6)} metricKey={perfKey} openCompany={openCompany} watchlist={watchlist} toggleWatch={toggleWatch} />
        <RankTable title="Bottom performers" rows={sortedByRet.slice(-6).reverse()} metricKey={perfKey} openCompany={openCompany} watchlist={watchlist} toggleWatch={toggleWatch} />
      </div>

      <SectionHeading title="Most active by traded value" />
      <RankTable title="" rows={mostActive} metricKey="tradedVal" metricLabel="Traded value (₹Cr)" openCompany={openCompany} watchlist={watchlist} toggleWatch={toggleWatch} wide />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 26 }}>
        <FeaturedChartCard title="Nifty 50" seedKey="NIFTY50FEATURED" endValue={INDICES[0].value} live sourceDate={INDICES[0].sourceDate} volatility={0.006} />
        <FeaturedChartCard title="USD/INR" seedKey="USDINRFEATURED" endValue={CURRENCIES[0].rate} live sourceDate={CURRENCIES[0].sourceDate} volatility={0.003} />
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

function FeaturedChartCard({ title, seedKey, endValue, live, sourceDate, volatility = 0.006 }) {
  const [period, setPeriod] = useState("1Y");
  const [customRange, setCustomRange] = useState({ start: "", end: "" });
  const series = getSeriesForRange(seedKey, endValue, period, customRange, volatility);
  const periodReturn = demoPeriodReturn(seedKey, period);
  return (
    <Panel style={{ padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>{title}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Move value={periodReturn} size={12} />
          <LiveTag live={live} small />
        </div>
      </div>
      <div style={{ marginBottom: 10 }}>
        <ReturnRangeSelector active={period} onSelect={setPeriod} customRange={customRange} onCustomRange={setCustomRange} />
      </div>
      <PriceChart series={series} height={180} />
      <div style={{ fontSize: 10.5, color: THEME.inkDim, marginTop: 6 }}>Demo trend anchored to live reference as of {sourceDate}.</div>
    </Panel>
  );
}

/* =========================================================================================
   ALL NSE STOCKS DIRECTORY
   ========================================================================================= */
// Plain-English metric explanations used for column-header tooltips on the Stocks screener.
const METRIC_INFO = {
  price: { what: "The last traded (EOD) price on NSE.", why: "The reference point for everything else on this row.", how: "Not meaningful alone — always read alongside valuation and quality metrics." },
  chgPct: { what: "Change versus the previous session's close.", why: "Shows short-term momentum for the stock.", how: "A single day's move says little about the business — treat as context, not a signal." },
  mcap: { what: "Market capitalisation: share price × total shares outstanding.", why: "Indicates company size and typically its liquidity and volatility profile.", how: "Larger caps are usually more stable; smaller caps can be more volatile and less liquid." },
  tradedVal: { what: "Total value of shares traded on NSE that day.", why: "A proxy for how liquid — how easy to buy/sell without moving the price — a stock is.", how: "Very low traded value can mean wider spreads and higher execution risk." },
  pe: { what: "Price-to-Earnings ratio: share price divided by earnings per share.", why: "A common shorthand for how expensive a stock is relative to its profit.", how: "Compare within the same sector — 'expensive' varies a lot by industry and growth rate." },
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

function ThTooltip({ label, infoKey, sortActive, sortDir, onClick, style, align = "left" }) {
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
      onClick={() => { onClick(); if (info) { if (ref.current) setRect(ref.current.getBoundingClientRect()); setOpen((o) => !o); } }}
      style={{ ...thStyle, ...style, cursor: "pointer", position: "relative", textAlign: align, whiteSpace: "nowrap" }}
    >
      <span style={{ display: "inline-flex", alignItems: "center", gap: 3, justifyContent: align === "right" ? "flex-end" : "flex-start", width: "100%" }}>
        {label}{sortActive && <ChevronDown size={12} style={{ transform: sortDir === "asc" ? "rotate(180deg)" : "none" }} />}
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

function FilterSidebar({ mode, sector, setSector, capSet, setCapSet, peMin, setPeMin, peMax, setPeMax,
  roeMin, setRoeMin, roceMin, setRoceMin, divMin, setDivMin, deMax, setDeMax, liqMin, setLiqMin, ret1yMin, setRet1yMin, onReset }) {
  const numInputStyle = { width: 70, background: THEME.navyDeep, border: `1px solid ${THEME.hairline}`, color: THEME.ink, borderRadius: 4, padding: "5px 6px", fontSize: 12 };
  return (
    <Panel style={{ padding: 16, width: 232, flexShrink: 0, alignSelf: "flex-start", position: "sticky", top: 140 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700 }}>Filters</div>
        <button onClick={onReset} style={{ background: "none", border: "none", color: THEME.gold, fontSize: 11, cursor: "pointer" }}>Reset</button>
      </div>

      <div style={{ fontSize: 11, fontWeight: 700, color: THEME.inkDim, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6 }}>Market Capitalisation</div>
      {["Large", "Mid", "Small"].map((c) => (
        <label key={c} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, padding: "3px 0", cursor: "pointer" }}>
          <input type="checkbox" checked={capSet[c]} onChange={(e) => setCapSet({ ...capSet, [c]: e.target.checked })} />
          {c} Cap
        </label>
      ))}
      <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, padding: "3px 0", cursor: "pointer", color: THEME.inkDim }}>
        <input type="checkbox" checked={capSet.Micro} onChange={(e) => setCapSet({ ...capSet, Micro: e.target.checked })} />
        Micro Cap
      </label>
      <ModeExplain mode={mode}>Large caps are typically the most established and liquid; Mid and Small caps can offer more growth potential with more volatility.</ModeExplain>

      <div style={{ fontSize: 11, fontWeight: 700, color: THEME.inkDim, textTransform: "uppercase", letterSpacing: 0.4, margin: "16px 0 6px" }}>Sector Classification</div>
      <select value={sector} onChange={(e) => setSector(e.target.value)} style={{ ...selectStyle, width: "100%" }}>
        <option>All sectors</option>
        {SECTOR_LIST.map((s) => <option key={s}>{s}</option>)}
      </select>

      <div style={{ fontSize: 11, fontWeight: 700, color: THEME.inkDim, textTransform: "uppercase", letterSpacing: 0.4, margin: "16px 0 6px" }}>P/E range</div>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <input type="number" placeholder="Min" value={peMin} onChange={(e) => setPeMin(e.target.value)} style={numInputStyle} />
        <span style={{ color: THEME.inkDim, fontSize: 11 }}>–</span>
        <input type="number" placeholder="Max" value={peMax} onChange={(e) => setPeMax(e.target.value)} style={numInputStyle} />
      </div>
      <ModeExplain mode={mode}>P/E compares price to profit. A "low" or "high" P/E only means something relative to the sector and growth rate — there's no universal good number.</ModeExplain>

      {mode === "research" && (
        <>
          <div style={{ borderTop: `1px solid ${THEME.hairline}`, margin: "18px 0 12px" }} />
          <div style={{ fontSize: 11, fontWeight: 700, color: THEME.gold, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 10 }}>Advanced filters</div>

          <div style={{ fontSize: 11.5, color: THEME.inkDim, marginBottom: 4 }}>Min ROE %</div>
          <input type="number" value={roeMin} onChange={(e) => setRoeMin(e.target.value)} style={{ ...numInputStyle, width: "100%", marginBottom: 10 }} />

          <div style={{ fontSize: 11.5, color: THEME.inkDim, marginBottom: 4 }}>Min ROCE %</div>
          <input type="number" value={roceMin} onChange={(e) => setRoceMin(e.target.value)} style={{ ...numInputStyle, width: "100%", marginBottom: 10 }} />

          <div style={{ fontSize: 11.5, color: THEME.inkDim, marginBottom: 4 }}>Min dividend yield %</div>
          <input type="number" value={divMin} onChange={(e) => setDivMin(e.target.value)} style={{ ...numInputStyle, width: "100%", marginBottom: 10 }} />

          <div style={{ fontSize: 11.5, color: THEME.inkDim, marginBottom: 4 }}>Max debt/equity</div>
          <input type="number" value={deMax} onChange={(e) => setDeMax(e.target.value)} style={{ ...numInputStyle, width: "100%", marginBottom: 10 }} />

          <div style={{ fontSize: 11.5, color: THEME.inkDim, marginBottom: 4 }}>Min traded value (₹Cr)</div>
          <input type="number" value={liqMin} onChange={(e) => setLiqMin(e.target.value)} style={{ ...numInputStyle, width: "100%", marginBottom: 10 }} />

          <div style={{ fontSize: 11.5, color: THEME.inkDim, marginBottom: 4 }}>Min 1Y return %</div>
          <input type="number" value={ret1yMin} onChange={(e) => setRet1yMin(e.target.value)} style={{ ...numInputStyle, width: "100%" }} />
        </>
      )}
    </Panel>
  );
}

function StocksPage({ mode, openCompany, watchlist, toggleWatch, compareList, toggleCompare }) {
  const [q, setQ] = useState("");
  const [sector, setSector] = useState("All sectors");
  const [capSet, setCapSet] = useState({ Large: true, Mid: true, Small: true, Micro: true });
  const [peMin, setPeMin] = useState("");
  const [peMax, setPeMax] = useState("");
  const [roeMin, setRoeMin] = useState("");
  const [roceMin, setRoceMin] = useState("");
  const [divMin, setDivMin] = useState("");
  const [deMax, setDeMax] = useState("");
  const [liqMin, setLiqMin] = useState("");
  const [ret1yMin, setRet1yMin] = useState("");
  const [sortKey, setSortKey] = useState("mcap");
  const [sortDir, setSortDir] = useState("desc");
  const [page, setPageN] = useState(1);
  const perPage = 12;

  const resetFilters = () => {
    setQ(""); setSector("All sectors"); setCapSet({ Large: true, Mid: true, Small: true, Micro: true });
    setPeMin(""); setPeMax(""); setRoeMin(""); setRoceMin(""); setDivMin(""); setDeMax(""); setLiqMin(""); setRet1yMin("");
    setPageN(1);
  };

  let rows = RAW_STOCKS.filter((s) => {
    const matchQ = !q || s.name.toLowerCase().includes(q.toLowerCase()) || s.ticker.toLowerCase().includes(q.toLowerCase());
    const matchSector = sector === "All sectors" || s.sector === sector;
    const matchCap = capSet[s.cap];
    const matchPeMin = !peMin || (s.pe !== null && s.pe >= parseFloat(peMin));
    const matchPeMax = !peMax || (s.pe !== null && s.pe <= parseFloat(peMax));
    const matchRoe = !roeMin || (s.roe !== null && s.roe !== undefined && s.roe >= parseFloat(roeMin));
    const matchRoce = !roceMin || (s.roce !== null && s.roce !== undefined && s.roce >= parseFloat(roceMin));
    const matchDiv = !divMin || s.divYield >= parseFloat(divMin);
    const matchDe = !deMax || (s.de !== null && s.de !== undefined && s.de <= parseFloat(deMax));
    const matchLiq = !liqMin || s.tradedVal >= parseFloat(liqMin);
    const matchRet = !ret1yMin || s.ret1y >= parseFloat(ret1yMin);
    return matchQ && matchSector && matchCap && matchPeMin && matchPeMax && matchRoe && matchRoce && matchDiv && matchDe && matchLiq && matchRet;
  });
  rows = [...rows].sort((a, b) => {
    const av = a[sortKey] ?? -Infinity, bv = b[sortKey] ?? -Infinity;
    return sortDir === "desc" ? bv - av : av - bv;
  });
  const totalPages = Math.max(1, Math.ceil(rows.length / perPage));
  const pageRows = rows.slice((page - 1) * perPage, page * perPage);

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else { setSortKey(key); setSortDir("desc"); }
  };

  const stocksTd = { padding: "12px 14px", whiteSpace: "nowrap", overflow: "hidden" };

  const cols = [
    { key: "ticker", label: "Company", info: null, width: 240, align: "left" },
    { key: "sector", label: "Sector", info: "sector", width: 168, align: "left" },
    { key: "price", label: "EOD Price", info: "price", width: 104, align: "right" },
    { key: "chgPct", label: "Chg %", info: "chgPct", width: 96, align: "right" },
    { key: "mcap", label: "Mkt Cap", info: "mcap", width: 116, align: "right" },
    { key: "tradedVal", label: "Traded Val", info: "tradedVal", width: 112, align: "right" },
    { key: "pe", label: "P/E", info: "pe", width: 72, align: "right" },
    { key: "roce", label: "ROCE", info: "roce", width: 80, align: "right" },
    { key: "de", label: "D/E", info: "de", width: 72, align: "right" },
    { key: "ret1y", label: "1Y Return", info: "ret1y", width: 100, align: "right" },
  ];

  return (
    <div className="sd-fade-in" style={{ padding: "22px 20px 60px", maxWidth: 1280, margin: "0 auto" }}>
      <SectionHeading eyebrow="Screener" title="All NSE Stocks" />
      <p style={{ fontSize: 12.5, color: THEME.inkDim, marginTop: -8, marginBottom: 16, maxWidth: 760 }}>
        Represents the broader universe of NSE-listed equities across market-cap bands — not only Nifty 50 constituents.
        This Artifact uses a representative demo universe; a live product would use the complete licensed NSE-listed
        equity universe under <span className="sd-underline-link">Sector Classification</span>.
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, background: THEME.panel, border: `1px solid ${THEME.hairline}`, borderRadius: 5, padding: "6px 10px", minWidth: 220 }}>
          <Search size={13} color={THEME.inkDim} />
          <input value={q} onChange={(e) => { setQ(e.target.value); setPageN(1); }} placeholder="Search company or ticker"
            style={{ background: "none", border: "none", outline: "none", color: THEME.ink, fontSize: 12.5, width: "100%" }} />
        </div>
        <div style={{ marginLeft: "auto", fontSize: 12, color: THEME.inkDim, alignSelf: "center" }}>{rows.length} matching companies</div>
      </div>

      <ModeExplain mode={mode}>Use the filters on the left to narrow the universe. Hover (or tap) any column header for a plain-English explanation of that metric. Click a header to sort. The star adds to Watchlist, the + adds to Compare (up to 5).</ModeExplain>

      <div style={{ display: "flex", gap: 16, marginTop: 12, alignItems: "flex-start" }}>
        <FilterSidebar mode={mode} sector={sector} setSector={(v) => { setSector(v); setPageN(1); }}
          capSet={capSet} setCapSet={(v) => { setCapSet(v); setPageN(1); }}
          peMin={peMin} setPeMin={(v) => { setPeMin(v); setPageN(1); }} peMax={peMax} setPeMax={(v) => { setPeMax(v); setPageN(1); }}
          roeMin={roeMin} setRoeMin={(v) => { setRoeMin(v); setPageN(1); }} roceMin={roceMin} setRoceMin={(v) => { setRoceMin(v); setPageN(1); }}
          divMin={divMin} setDivMin={(v) => { setDivMin(v); setPageN(1); }} deMax={deMax} setDeMax={(v) => { setDeMax(v); setPageN(1); }}
          liqMin={liqMin} setLiqMin={(v) => { setLiqMin(v); setPageN(1); }} ret1yMin={ret1yMin} setRet1yMin={(v) => { setRet1yMin(v); setPageN(1); }}
          onReset={resetFilters} />

        <div style={{ flex: 1, minWidth: 0 }}>
          <Panel style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 1180, tableLayout: "fixed" }}>
              <colgroup>
                <col style={{ width: 40 }} />
                {cols.map((c) => <col key={c.key} style={{ width: c.width }} />)}
                <col style={{ width: 48 }} />
              </colgroup>
              <thead>
                <tr style={{ borderBottom: `1px solid ${THEME.hairline}` }}>
                  <th style={thStyle}></th>
                  {cols.map((c) => (
                    <ThTooltip key={c.key} label={c.label} infoKey={c.info} sortActive={sortKey === c.key} sortDir={sortDir} onClick={() => toggleSort(c.key)}
                      align={c.align} style={{ padding: "12px 14px" }} />
                  ))}
                  <th style={thStyle}></th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((s) => (
                  <tr key={s.ticker} className="sd-row-hover" style={{ borderBottom: `1px solid ${THEME.hairline}` }}>
                    <td style={{ ...stocksTd }}><WatchStar active={watchlist.includes(s.ticker)} onClick={() => toggleWatch(s.ticker)} /></td>
                    <td style={{ ...stocksTd, whiteSpace: "normal" }} onClick={() => openCompany(s.ticker)}>
                      <div style={{ cursor: "pointer", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</div>
                      <div style={{ fontSize: 10.5, color: THEME.inkDim, display: "flex", alignItems: "center", gap: 5, marginTop: 2 }}>{s.ticker} · {s.cap} cap {s.live && <LiveTag live small />}</div>
                    </td>
                    <td style={{ ...stocksTd, overflow: "hidden", textOverflow: "ellipsis" }}>{s.sector}</td>
                    <td style={{ ...stocksTd, textAlign: "right" }} className="sd-mono">₹{fmtNum(s.price)}</td>
                    <td style={{ ...stocksTd, textAlign: "right" }}><Move value={s.chgPct} /></td>
                    <td style={{ ...stocksTd, textAlign: "right" }} className="sd-mono">{fmtCr(s.mcap)}</td>
                    <td style={{ ...stocksTd, textAlign: "right" }} className="sd-mono">{fmtCr(s.tradedVal)}</td>
                    <td style={{ ...stocksTd, textAlign: "right" }} className="sd-mono">{s.pe ? fmtNum(s.pe, 1) : "—"}</td>
                    <td style={{ ...stocksTd, textAlign: "right" }} className="sd-mono">{s.roce ? `${fmtNum(s.roce, 1)}%` : "—"}</td>
                    <td style={{ ...stocksTd, textAlign: "right" }} className="sd-mono">{s.de !== null ? fmtNum(s.de, 2) : "—"}</td>
                    <td style={{ ...stocksTd, textAlign: "right" }}><Move value={s.ret1y} /></td>
                    <td style={{ ...stocksTd, textAlign: "center" }}>
                      <button onClick={() => toggleCompare(s.ticker)} className="sd-focusable" title="Add to compare" style={{
                        background: compareList.includes(s.ticker) ? "rgba(201,162,75,0.15)" : "none",
                        border: `1px solid ${THEME.hairline}`, borderRadius: 4, color: THEME.gold, cursor: "pointer", padding: "3px 6px",
                      }}><Plus size={12} /></button>
                    </td>
                  </tr>
                ))}
                {pageRows.length === 0 && (
                  <tr><td colSpan={12} style={{ ...tdStyle, textAlign: "center", color: THEME.inkDim, padding: 30 }}>No companies match these filters.</td></tr>
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
  if (activeSector) return <SectorDetail sector={activeSector} mode={mode} openCompany={openCompany} back={() => openSector(null)} />;
  return (
    <div className="sd-fade-in" style={{ padding: "22px 20px 60px", maxWidth: 1280, margin: "0 auto" }}>
      <SectionHeading eyebrow="Sector intelligence" title="Where is market leadership occurring?" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 }}>
        {SECTOR_LIST.map((s) => {
          const perf = SECTOR_PERF_SEED[s];
          const constituents = RAW_STOCKS.filter((r) => r.sector === s);
          const mcapShare = constituents.reduce((a, b) => a + b.mcap, 0);
          return (
            <Panel key={s} style={{ padding: 16, cursor: "pointer" }}>
              <div onClick={() => openSector(s)}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <div style={{ fontWeight: 700, fontSize: 14.5 }}>{s}</div>
                  <ChevronRight size={15} color={THEME.inkDim} />
                </div>
                <div style={{ fontSize: 10.5, color: THEME.gold, marginTop: 2 }}>{SECTOR_INDEX_MAP[s]}</div>
                <div style={{ display: "flex", gap: 14, marginTop: 10, fontSize: 11.5 }}>
                  <div><div style={{ color: THEME.inkDim }}>1W</div><Move value={perf.w1} size={11.5} /></div>
                  <div><div style={{ color: THEME.inkDim }}>1M</div><Move value={perf.m1} size={11.5} /></div>
                  <div><div style={{ color: THEME.inkDim }}>6M</div><Move value={perf.m6} size={11.5} /></div>
                  <div><div style={{ color: THEME.inkDim }}>1Y</div><Move value={perf.y1} size={11.5} /></div>
                </div>
                <div style={{ fontSize: 11, color: THEME.inkDim, marginTop: 10 }}>
                  {constituents.length} companies in universe · {fmtCr(mcapShare)} combined market cap
                </div>
                <div style={{ fontSize: 11, marginTop: 4 }}>
                  <span style={{ color: THEME.up }}>Leader {perf.leader}</span> · <span style={{ color: THEME.down }}>Lagger {perf.lagger}</span>
                </div>
              </div>
            </Panel>
          );
        })}
      </div>
    </div>
  );
}

function SectorDetail({ sector, mode, openCompany, back }) {
  const perf = SECTOR_PERF_SEED[sector];
  const constituents = RAW_STOCKS.filter((s) => s.sector === sector);
  const chartSeries = genSeries("SECTOR" + sector, 90, 1000 * (1 + perf.y1 / 100), 0.012);
  const [newsOpen, setNewsOpen] = useState(null);
  return (
    <div className="sd-fade-in" style={{ padding: "22px 20px 60px", maxWidth: 1280, margin: "0 auto" }}>
      <button onClick={back} style={{ background: "none", border: "none", color: THEME.gold, cursor: "pointer", fontSize: 12.5, display: "flex", alignItems: "center", gap: 4, marginBottom: 10 }}>
        <ChevronLeft size={14} /> Back to sectors
      </button>
      <SectionHeading eyebrow="Sector Classification" title={sector} />
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }}>
        <Panel style={{ padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>{SECTOR_INDEX_MAP[sector] || "Sector index"} <span style={{ color: THEME.inkDim, fontWeight: 400 }}>(demo)</span></div>
          </div>
          <PriceChart series={chartSeries} height={220} />
        </Panel>
        <Panel style={{ padding: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Key sector metrics</div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${THEME.hairline}`, fontSize: 12.5 }}>
            <span style={{ color: THEME.inkDim }}>Benchmark index</span><span>{SECTOR_INDEX_MAP[sector] || "—"}</span>
          </div>
          {[["1W", perf.w1], ["1M", perf.m1], ["6M", perf.m6], ["1Y", perf.y1]].map(([l, v]) => (
            <div key={l} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${THEME.hairline}`, fontSize: 12.5 }}>
              <span style={{ color: THEME.inkDim }}>{l} return</span><Move value={v} />
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
        {(SECTOR_NEWS[sector] || []).map((n, i) => (
          <Panel key={i} onClick={() => setNewsOpen(n)} className="sd-row-hover" style={{ padding: 14, cursor: "pointer" }}>
            <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{n.title}</div>
              <div style={{ fontSize: 11, color: THEME.inkDim, whiteSpace: "nowrap" }}>{n.date}</div>
            </div>
            <div style={{ fontSize: 12, color: THEME.creamDim, marginTop: 6, lineHeight: 1.5 }}>{n.teaser}</div>
          </Panel>
        ))}
        {(!SECTOR_NEWS[sector] || SECTOR_NEWS[sector].length === 0) && (
          <Panel style={{ padding: 20, textAlign: "center", color: THEME.inkDim, fontSize: 12.5 }}>No notable sector news in this demo dataset.</Panel>
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
            <p style={{ fontSize: 14, lineHeight: 1.6, color: THEME.creamDim, fontStyle: "italic", borderLeft: `2px solid ${THEME.goldSoft}`, paddingLeft: 12, marginBottom: 18 }}>{newsOpen.teaser}</p>
            <p style={{ fontSize: 13.5, lineHeight: 1.7, color: THEME.creamDim, marginBottom: 18 }}>{newsOpen.body}</p>
            {newsOpen.source && (
              <div style={{ fontSize: 12, color: THEME.inkDim, marginBottom: 20, borderTop: `1px solid ${THEME.hairline}`, paddingTop: 12 }}>
                <span style={{ textTransform: "uppercase", letterSpacing: 0.5, fontSize: 10.5, color: THEME.gold, display: "block", marginBottom: 3 }}>Source</span>
                {newsOpen.source}
              </div>
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
                <td style={tdStyle} className="sd-mono">₹{fmtNum(s.price)}</td>
                <td style={tdStyle}><Move value={s.chgPct} /></td>
                <td style={tdStyle} className="sd-mono">{s.pe ? fmtNum(s.pe, 1) : "—"}</td>
                <td style={tdStyle}><Move value={s.ret1y} /></td>
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
function CompanyOverviewTab({ ticker }) {
  const profile = companyProfile(ticker);
  const news = companyNews(ticker);
  const [openArticle, setOpenArticle] = useState(null);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }}>
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
        <div style={{ fontSize: 11.5, color: THEME.inkDim, marginTop: 10 }}>Next corporate event: Q2 FY27 results — mid-Oct 2026 (demo date)</div>
      </Panel>

      <Panel style={{ padding: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <Newspaper size={14} color={THEME.gold} />
          <div style={{ fontSize: 13, fontWeight: 700 }}>Company news</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {news.map((n) => (
            <div key={n.id} onClick={() => setOpenArticle(n)} className="sd-row-hover" style={{
              cursor: "pointer", border: `1px solid ${THEME.hairline}`, borderRadius: 5, padding: 12,
            }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.35 }}>{n.headline}</div>
              <div style={{ fontSize: 11.5, color: THEME.inkDim, marginTop: 6, lineHeight: 1.4 }}>{n.teaser}</div>
            </div>
          ))}
        </div>
      </Panel>

      {openArticle && (
        <div onClick={() => setOpenArticle(null)} style={{ position: "fixed", inset: 0, background: "rgba(5,8,14,0.65)", zIndex: 60, display: "flex", justifyContent: "flex-end" }}>
          <div onClick={(e) => e.stopPropagation()} className="sd-fade-in sd-scroll" style={{ width: 480, maxWidth: "94vw", height: "100%", background: THEME.navyDeep, borderLeft: `1px solid ${THEME.hairline}`, padding: "28px 30px", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <span style={{ fontSize: 11, color: THEME.gold, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6 }}>Company News</span>
              <button onClick={() => setOpenArticle(null)} style={{ background: "none", border: "none", color: THEME.inkDim, cursor: "pointer" }}><X size={18} /></button>
            </div>
            <h3 className="sd-serif" style={{ fontSize: 22, margin: "12px 0 8px", lineHeight: 1.3 }}>{openArticle.headline}</h3>
            <div style={{ fontSize: 12, color: THEME.inkDim, marginBottom: 16 }}>{openArticle.date}</div>
            <p style={{ fontSize: 14, lineHeight: 1.6, color: THEME.creamDim, fontStyle: "italic", borderLeft: `2px solid ${THEME.goldSoft}`, paddingLeft: 12, marginBottom: 18 }}>{openArticle.teaser}</p>
            {openArticle.body.map((p, i) => (
              <p key={i} style={{ fontSize: 13.5, lineHeight: 1.7, color: THEME.creamDim, marginBottom: 14 }}>{p}</p>
            ))}
            {openArticle.source && (
              <div style={{ fontSize: 12, color: THEME.inkDim, marginTop: 4, borderTop: `1px solid ${THEME.hairline}`, paddingTop: 12 }}>
                <span style={{ textTransform: "uppercase", letterSpacing: 0.5, fontSize: 10.5, color: THEME.gold, display: "block", marginBottom: 3 }}>Source</span>
                {openArticle.source}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const COMPANY_TABS = ["Overview", "Performance", "Financials", "Valuation & Quality", "Ownership & Disclosures", "Events & Filings", "Peers", "Notes"];

function CompanyPage({ ticker, mode, watchlist, toggleWatch, compareList, toggleCompare, notes, setNote }) {
  const s = STOCKS_BY_TICKER[ticker] || STOCKS_BY_TICKER.RELIANCE;
  const [tab, setTab] = useState("Overview");
  const [range, setRange] = useState("1Y");
  const [returnType, setReturnType] = useState("Price");
  const [showBenchmark, setShowBenchmark] = useState(true);
  const [standalone, setStandalone] = useState("Consolidated");
  const [noteDraft, setNoteDraft] = useState(notes[ticker]?.length ? "" : "");
  const [customRange, setCustomRange] = useState({ start: "", end: "" });

  const series = s.hist[range] || getSeriesForRange(ticker, s.price, range, customRange, 0.02);
  const benchSeries = showBenchmark ? genSeries("BENCH" + ticker + range, series.length, INDICES[0].value, 0.01) : null;

  // When a benchmark overlay is active, the stock's absolute price and the index's absolute
  // level are on completely different scales (e.g. ₹1,300 vs ~23,700), which flattens the chart.
  // Institutional platforms instead rebase every series to a common starting value (100) so
  // relative performance is comparable regardless of each security's absolute price level.
  const rebaseTo100 = (arr) => arr.map((v) => (v / arr[0]) * 100);
  const chartSeries = showBenchmark ? rebaseTo100(series) : series;
  const chartBenchSeries = showBenchmark && benchSeries ? rebaseTo100(benchSeries) : null;

  const low52 = Math.min(...s.hist["1Y"]);
  const high52 = Math.max(...s.hist["1Y"]);

  return (
    <div className="sd-fade-in" style={{ padding: "22px 20px 70px", maxWidth: 1280, margin: "0 auto" }}>
      <Panel style={{ padding: 20, marginBottom: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <h1 className="sd-serif" style={{ fontSize: 24, margin: 0 }}>{s.name}</h1>
              <LiveTag live={s.live} />
            </div>
            <div style={{ fontSize: 12.5, color: THEME.inkDim, marginTop: 4 }}>{s.ticker} · NSE · {s.sector} · {s.cap} Cap</div>
            <p style={{ fontSize: 12.5, color: THEME.creamDim, maxWidth: 560, marginTop: 10, lineHeight: 1.5 }}>
              {companyBlurb(s.ticker)}
            </p>
          </div>
          <div style={{ textAlign: "right" }}>
            <div className="sd-mono" style={{ fontSize: 28 }}>₹{fmtNum(s.price)}</div>
            <Move value={s.chgPct} size={14} />
            <div style={{ fontSize: 11, color: THEME.inkDim, marginTop: 6 }}>Mkt Cap {fmtCr(s.mcap)}</div>
            <div style={{ fontSize: 11, color: THEME.inkDim }}>52W ₹{fmtNum(low52, 0)} – ₹{fmtNum(high52, 0)}</div>
            <div style={{ display: "flex", gap: 8, marginTop: 10, justifyContent: "flex-end" }}>
              <IconBtn onClick={() => toggleWatch(s.ticker)} active={watchlist.includes(s.ticker)} icon={<Bookmark size={13} />} label="Watchlist" />
              <IconBtn onClick={() => toggleCompare(s.ticker)} active={compareList.includes(s.ticker)} icon={<Layers size={13} />} label="Compare" />
              <IconBtn onClick={() => setTab("Notes")} icon={<FileText size={13} />} label="Note" />
            </div>
          </div>
        </div>
        <div style={{ fontSize: 11, color: THEME.inkDim, marginTop: 12, borderTop: `1px solid ${THEME.hairline}`, paddingTop: 10 }}>
          {s.live ? `Demo EOD price snapshot — live-anchored, ${s.sourceNote}. ` : "Demo EOD price — illustrative. "}
          Not investment advice. Historical chart series below are demo/illustrative regardless of price-anchor status.
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

      {tab === "Overview" && <CompanyOverviewTab ticker={s.ticker} />}

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
          <Panel style={{ padding: 16 }}>
            <PriceChart series={chartSeries} benchmarkSeries={chartBenchSeries} benchmarkLabel="Nifty 50 (demo)" height={300} />
            {showBenchmark && (
              <div style={{ fontSize: 10.5, color: THEME.inkDim, marginTop: 8 }}>
                Rebased to 100 at the start of the selected period so {s.ticker} and the benchmark are comparable on the same scale, regardless of absolute price level.
              </div>
            )}
          </Panel>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, marginTop: 14 }}>
            {[["CAGR (demo)", "12.4%"], ["Max drawdown", "-18.6%"], ["Volatility (ann.)", "22.1%"], ["Beta", "0.93"], ["Dist. from 52W high", `${(((s.price - high52) / high52) * 100).toFixed(1)}%`]].map(([l, v]) => (
              <Panel key={l} style={{ padding: 12 }}><div style={{ fontSize: 10.5, color: THEME.inkDim }}>{l}</div><div className="sd-mono" style={{ fontSize: 15, marginTop: 4 }}>{v}</div></Panel>
            ))}
          </div>
          <div style={{ fontSize: 11, color: THEME.inkDim, marginTop: 10 }}>Calculation methodology is illustrative demo data. Chart series generated for internal consistency, not real historical prints.</div>
        </div>
      )}

      {tab === "Financials" && (
        <div>
          <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>{["Consolidated", "Standalone"].map((o) => <Pill key={o} active={standalone === o} onClick={() => setStandalone(o)}>{o}</Pill>)}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
            <FinRow label="Revenue" values={demoFinSeries(s.ticker, "rev")} mode={mode} explain="Total sales from operations over the period." />
            <FinRow label="EBITDA" values={demoFinSeries(s.ticker, "ebitda")} mode={mode} explain="Operating profit before interest, tax, depreciation & amortisation." />
            <FinRow label="Net income" values={demoFinSeries(s.ticker, "ni")} mode={mode} explain="Profit after all expenses, interest and tax." />
            <FinRow label="EPS (₹)" values={demoFinSeries(s.ticker, "eps")} mode={mode} explain="Net income divided by shares outstanding." />
            <FinRow label="Operating cash flow" values={demoFinSeries(s.ticker, "ocf")} mode={mode} explain="Cash generated from core business operations." />
            <FinRow label="Free cash flow" values={demoFinSeries(s.ticker, "fcf")} mode={mode} explain="Operating cash flow minus capital expenditure." />
          </div>
        </div>
      )}

      {tab === "Valuation & Quality" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <Panel style={{ padding: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Valuation</div>
            {[["P/E", s.pe], ["Forward P/E (demo)", s.pe ? s.pe * 0.92 : null], ["P/B", s.pb], ["EV/EBITDA (demo)", s.pe ? s.pe * 0.8 : null], ["PEG (demo)", 1.4], ["Market Cap", null]].map(([l, v]) => (
              <MetricLine key={l} label={l} value={l === "Market Cap" ? fmtCr(s.mcap) : v !== null ? fmtNum(v, 1) : "—"} mode={mode} explain="Valuation multiples relative to earnings, book value or cash flow — shown with sector/peer context, not as isolated signals." />
            ))}
          </Panel>
          <Panel style={{ padding: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Quality & growth</div>
            {[["ROE %", s.roe], ["ROCE %", s.roce], ["Gross margin % (demo)", 38.4], ["Operating margin % (demo)", 21.2], ["Net margin % (demo)", 14.6], ["Revenue growth 3Y CAGR % (demo)", 9.8]].map(([l, v]) => (
              <MetricLine key={l} label={l} value={v !== null && v !== undefined ? `${fmtNum(v, 1)}%` : "—"} mode={mode} explain="Profitability and efficiency ratios, shown as trends rather than single-period snapshots." />
            ))}
          </Panel>
          <Panel style={{ padding: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Leverage & dividends</div>
            {[["Debt/Equity", s.de], ["Interest coverage (demo)", 8.4], ["Current ratio (demo)", 1.6], ["Dividend yield %", s.divYield], ["Payout ratio % (demo)", 24.5]].map(([l, v]) => (
              <MetricLine key={l} label={l} value={v !== null && v !== undefined ? fmtNum(v, 2) : "—"} mode={mode} explain="Balance-sheet strength and shareholder distribution history." />
            ))}
          </Panel>
        </div>
      )}

      {tab === "Ownership & Disclosures" && (
        <div>
          <ModeExplain mode={mode}>Ownership changes provide context on who holds shares and how that has shifted — they are not automatic buy/sell signals.</ModeExplain>
          <Panel style={{ padding: 16, marginTop: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Ownership breakdown (demo)</div>
            <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
              {[["Promoter", 48.2], ["FII", 22.1], ["DII", 16.4], ["Public & others", 13.3]].map(([l, v]) => (
                <div key={l} style={{ minWidth: 120 }}>
                  <div style={{ fontSize: 11, color: THEME.inkDim }}>{l}</div>
                  <div className="sd-mono" style={{ fontSize: 18 }}>{v}%</div>
                </div>
              ))}
            </div>
          </Panel>
          <SectionHeading title="Recent disclosed changes" />
          <Panel style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
              <thead><tr style={{ borderBottom: `1px solid ${THEME.hairline}` }}><th style={thStyle}>Date</th><th style={thStyle}>Nature of change</th><th style={thStyle}>Source</th></tr></thead>
              <tbody>
                {[["12 Jul 2026", "FII holding increased 0.8pp QoQ", "Shareholding pattern, BSE/NSE"], ["30 Jun 2026", "No promoter pledge outstanding", "Corporate governance disclosure"], ["18 Jun 2026", "Independent director reappointed", "Exchange filing"]].map((r, i) => (
                  <tr key={i} style={{ borderBottom: `1px solid ${THEME.hairline}` }}>
                    <td style={tdStyle}>{r[0]}</td><td style={tdStyle}>{r[1]}</td>
                    <td style={tdStyle}><span className="sd-underline-link" style={{ color: THEME.gold, display: "inline-flex", alignItems: "center", gap: 4 }}>{r[2]} <ExternalLink size={11} /></span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        </div>
      )}

      {tab === "Events & Filings" && (
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Why did the stock move?</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[
              { d: "24 Jul 2026", t: "Earnings", desc: "Quarterly results released; management commentary on demand outlook.", doc: "Q1 FY27 Results.pdf" },
              { d: "10 Jul 2026", t: "Filing", desc: "Investor presentation posted ahead of results.", doc: "Investor Presentation.pdf" },
              { d: "02 Jul 2026", t: "Corporate Action", desc: "Record date confirmed for dividend distribution.", doc: "Corporate Action Notice.pdf" },
              { d: "18 Jun 2026", t: "Credit Rating", desc: "Rating agency affirmed outlook as Stable.", doc: "Rating Rationale.pdf" },
            ].map((e, i) => (
              <Panel key={i} style={{ padding: 14, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                <div>
                  <div style={{ fontSize: 11, color: THEME.gold, fontWeight: 700, textTransform: "uppercase" }}>{e.t} · {e.d}</div>
                  <div style={{ fontSize: 12.5, marginTop: 4 }}>{e.desc}</div>
                </div>
                <div className="sd-row-hover" style={{ display: "flex", alignItems: "center", gap: 6, border: `1px solid ${THEME.hairline}`, borderRadius: 4, padding: "6px 10px", cursor: "pointer" }}>
                  <FileText size={13} color={THEME.gold} /><span style={{ fontSize: 11.5 }}>{e.doc}</span>
                </div>
              </Panel>
            ))}
          </div>
          <div style={{ fontSize: 11, color: THEME.inkDim, marginTop: 10 }}>Source material shown as neutral factual highlights. No AI summaries in this version.</div>
        </div>
      )}

      {tab === "Peers" && <PeerTab sector={s.sector} ticker={s.ticker} />}

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
            {(!notes[ticker] || notes[ticker].length === 0) && <div style={{ fontSize: 12, color: THEME.inkDim }}>No notes yet.</div>}
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
      <span style={{ color: THEME.inkDim, display: "flex", alignItems: "center" }}>{label}<MetricExplain mode={mode} text={explain} /></span>
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

function FinRow({ label, values, mode, explain }) {
  return (
    <Panel style={{ padding: 14 }}>
      <div style={{ fontSize: 12, color: THEME.inkDim, display: "flex", alignItems: "center", marginBottom: 8 }}>{label}<MetricExplain mode={mode} text={explain} /></div>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-end", height: 70 }}>
        {values.map((r) => {
          const max = Math.max(...values.map((x) => x.v));
          const h = Math.max(6, (r.v / max) * 60);
          return (
            <div key={r.y} style={{ flex: 1, textAlign: "center" }}>
              <div style={{ height: h, background: THEME.gold, opacity: 0.75, borderRadius: 2 }} />
              <div style={{ fontSize: 9.5, color: THEME.inkDim, marginTop: 4 }}>{r.y}</div>
            </div>
          );
        })}
      </div>
      <div className="sd-mono" style={{ fontSize: 13, marginTop: 8 }}>{fmtCr(values[values.length - 1].v)}</div>
    </Panel>
  );
}

function PeerTab({ sector, ticker }) {
  const peers = RAW_STOCKS.filter((s) => s.sector === sector);
  return (
    <div>
      <div style={{ fontSize: 11, color: THEME.inkDim, marginBottom: 12 }}>Peers within {sector}. Higher or lower values are shown for context only — not a ranking of which company is "better".</div>
      <Panel style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, minWidth: 720 }}>
          <thead><tr style={{ borderBottom: `1px solid ${THEME.hairline}` }}>
            <th style={thStyle}>Company</th><th style={thStyle}>P/E</th><th style={thStyle}>ROE%</th><th style={thStyle}>D/E</th><th style={thStyle}>Div Yield%</th><th style={thStyle}>1Y Return</th>
          </tr></thead>
          <tbody>
            {peers.map((p) => (
              <tr key={p.ticker} style={{ borderBottom: `1px solid ${THEME.hairline}`, background: p.ticker === ticker ? "rgba(201,162,75,0.08)" : "none" }}>
                <td style={tdStyle}>{p.name} <span style={{ color: THEME.inkDim }}>· {p.ticker}</span></td>
                <td style={tdStyle} className="sd-mono">{p.pe ? fmtNum(p.pe, 1) : "—"}</td>
                <td style={tdStyle} className="sd-mono">{p.roe ? fmtNum(p.roe, 1) : "—"}</td>
                <td style={tdStyle} className="sd-mono">{p.de !== null ? fmtNum(p.de, 2) : "—"}</td>
                <td style={tdStyle} className="sd-mono">{fmtNum(p.divYield, 1)}</td>
                <td style={tdStyle}><Move value={p.ret1y} /></td>
              </tr>
            ))}
          </tbody>
        </table>
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
  };
  return map[ticker] || "Diversified NSE-listed business; demo business description for this Artifact.";
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
};
function companyProfile(ticker) {
  return COMPANY_PROFILE[ticker] || {
    overview: companyBlurb(ticker),
    segments: [{ name: "Core operations", desc: "Primary revenue-generating business activity for this company." }],
    background: "Demo business background for this Artifact — a live product would source this from company filings and investor presentations.",
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
  const s = STOCKS_BY_TICKER[ticker];
  const sector = s?.sector || "the sector";
  return [
    {
      id: ticker + "-generic-1", headline: `${s ? s.name : ticker}: no major company-specific news this session`, date: "24 Jul 2026",
      teaser: `Trading broadly tracked moves in ${sector} rather than any company-specific catalyst.`,
      body: [
        `There was no significant company-specific announcement for ${s ? s.name : ticker} in the most recent session, and the stock's move largely tracked the broader trend in ${sector}.`,
        `In the absence of a specific catalyst, single-session price moves are generally read as noise relative to a company's underlying fundamentals, which are better assessed through the Financials and Valuation & Quality tabs on this page.`,
        `This is placeholder demo commentary for this Artifact — a live product would source real-time company news from licensed financial-news providers and exchange filings.`,
      ],
      source: "StockDekho demo desk",
    },
  ];
}

/* =========================================================================================
   COMPARE PAGE
   ========================================================================================= */
function ComparePage({ compareList, toggleCompare, openCompany }) {
  const [q, setQ] = useState("");
  const [range, setRange] = useState("1Y");
  const [customRange, setCustomRange] = useState({ start: "", end: "" });
  const stocks = compareList.map((t) => STOCKS_BY_TICKER[t]).filter(Boolean);
  const seriesFor = (s) => s.hist[range] || getSeriesForRange(s.ticker, s.price, range, customRange, 0.02);
  const results = q ? RAW_STOCKS.filter((s) => (s.name.toLowerCase().includes(q.toLowerCase()) || s.ticker.toLowerCase().includes(q.toLowerCase())) && !compareList.includes(s.ticker)).slice(0, 6) : [];

  const metrics = [
    { key: "pe", label: "P/E", fmt: (v) => (v ? fmtNum(v, 2) : "—") },
    { key: "pb", label: "P/B", fmt: (v) => (v ? fmtNum(v, 2) : "—") },
    { key: "roe", label: "ROE %", fmt: (v) => (v !== null ? fmtNum(v, 2) : "—") },
    { key: "roce", label: "ROCE %", fmt: (v) => (v !== null && v !== undefined ? fmtNum(v, 2) : "—") },
    { key: "de", label: "D/E", fmt: (v) => (v !== null && v !== undefined ? fmtNum(v, 2) : "—") },
    { key: "divYield", label: "Div Yield %", fmt: (v) => fmtNum(v, 2) },
    { key: "ret1y", label: "1Y Return %", fmt: (v) => fmtNum(v, 2), isMove: true },
    { key: "chgPct", label: "Today's Chg %", fmt: (v) => fmtNum(v, 2), isMove: true },
  ];

  function bestWorst(key) {
    const vals = stocks.map((s) => s[key]).filter((v) => v !== null && v !== undefined);
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
        <Panel style={{ padding: 40, textAlign: "center", color: THEME.inkDim }}>Add 2–5 companies above to start comparing performance, valuation and risk.</Panel>
      )}

      {stocks.length > 0 && (
        <>
          <Panel style={{ padding: 16, marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>Price / total return</div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <ReturnRangeSelector active={range} onSelect={setRange} customRange={customRange} onCustomRange={setCustomRange} />
            </div>
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
                  const base = seriesFor(s);
                  const series = base.map((v, i) => ({ i, [s.ticker]: (v / base[0]) * 100 - 100 }));
                  const colors = [THEME.gold, THEME.up, THEME.down, "#7C9CBF", "#B47EC9"];
                  return <Line key={s.ticker} data={series} type="monotone" dataKey={s.ticker} stroke={colors[idx % colors.length]} dot={false} strokeWidth={2} />;
                })}
              </LineChart>
            </ResponsiveContainer>
            <div style={{ fontSize: 10.5, color: THEME.inkDim, marginTop: 6 }}>Rebased to 0 at period start. Benchmark: Nifty 50 (demo). Illustrative demo data.</div>
          </Panel>

          <Panel style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, minWidth: 700 }}>
              <thead><tr style={{ borderBottom: `1px solid ${THEME.hairline}` }}>
                <th style={thStyle}>Metric</th>
                {stocks.map((s) => <th key={s.ticker} style={{ ...thStyle, textAlign: "right", cursor: "pointer" }} onClick={() => openCompany(s.ticker)}>{s.ticker}</th>)}
              </tr></thead>
              <tbody>
                {metrics.map((m) => {
                  const bw = bestWorst(m.key);
                  return (
                    <tr key={m.key} style={{ borderBottom: `1px solid ${THEME.hairline}` }}>
                      <td style={tdStyle}><RowMetricLabel label={m.label} infoKey={m.key} /></td>
                      {stocks.map((s) => {
                        const v = s[m.key];
                        const highlight = v === bw.max ? "rgba(63,167,114,0.12)" : v === bw.min ? "rgba(197,86,74,0.1)" : "none";
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
function CurrencyDetail({ currency, back }) {
  const c = currency;
  const [period, setPeriod] = useState("1Y");
  const [customRange, setCustomRange] = useState({ start: "", end: "" });
  const series = getSeriesForRange("FXDETAIL" + c.code, c.rate, period, customRange, 0.004);
  const periodReturn = demoPeriodReturn("FX" + c.code, period);
  return (
    <div className="sd-fade-in" style={{ padding: "22px 20px 60px", maxWidth: 1280, margin: "0 auto" }}>
      <button onClick={back} style={{ background: "none", border: "none", color: THEME.gold, cursor: "pointer", fontSize: 12.5, display: "flex", alignItems: "center", gap: 4, marginBottom: 10 }}>
        <ChevronLeft size={14} /> Back to currencies
      </button>
      <SectionHeading eyebrow="Reference rate" title={`${c.code}/INR`} />
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }}>
        <Panel style={{ padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div>
              <div className="sd-mono" style={{ fontSize: 24 }}>₹{fmtNum(c.rate, c.code === "JPY" ? 3 : 2)}</div>
              <Move value={c.chgPct} size={12.5} />
            </div>
            <LiveTag live={c.live} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <ReturnRangeSelector active={period} onSelect={setPeriod} customRange={customRange} onCustomRange={setCustomRange} />
          </div>
          <PriceChart series={series} height={240} />
          <div style={{ fontSize: 10.5, color: THEME.inkDim, marginTop: 6 }}>Demo trend anchored to live reference, {c.sourceDate}. Reference rate, not a live tradable quote.</div>
        </Panel>
        <Panel style={{ padding: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Key statistics</div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${THEME.hairline}`, fontSize: 12.5 }}>
            <span style={{ color: THEME.inkDim }}>{period} performance (demo)</span><Move value={periodReturn} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${THEME.hairline}`, fontSize: 12.5 }}>
            <span style={{ color: THEME.inkDim }}>Today's change</span><Move value={c.chgPct} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${THEME.hairline}`, fontSize: 12.5 }}>
            <span style={{ color: THEME.inkDim }}>52W range</span><span className="sd-mono">₹{fmtNum(c.low52, 2)}–₹{fmtNum(c.high52, 2)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 12.5 }}>
            <span style={{ color: THEME.inkDim }}>Source</span><span style={{ textAlign: "right" }}>{c.sourceDate}</span>
          </div>
        </Panel>
      </div>
    </div>
  );
}

function CurrenciesPage() {
  const [activeCode, setActiveCode] = useState(null);
  const [newsOpen, setNewsOpen] = useState(null);
  const active = CURRENCIES.find((c) => c.code === activeCode);
  if (active) return <CurrencyDetail currency={active} back={() => setActiveCode(null)} />;

  return (
    <div className="sd-fade-in" style={{ padding: "22px 20px 60px", maxWidth: 1280, margin: "0 auto" }}>
      <SectionHeading eyebrow="Currencies" title="INR reference rates" />
      <p style={{ fontSize: 12.5, color: THEME.inkDim, marginTop: -8, marginBottom: 16 }}>Reference rates, not live tradable FX quotes. Shown for research context, not currency forecasting.</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 14, marginBottom: 32 }}>
        {CURRENCIES.map((c) => (
          <Panel key={c.code} onClick={() => setActiveCode(c.code)} className="sd-row-hover" style={{ padding: 14, cursor: "pointer" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <div style={{ fontWeight: 700, fontSize: 13.5 }}>{c.code}/INR</div>
              <LiveTag live={c.live} small />
            </div>
            <div style={{ fontSize: 11, color: THEME.inkDim }}>{c.name}</div>
            <div className="sd-mono" style={{ fontSize: 20, marginTop: 8 }}>₹{fmtNum(c.rate, c.code === "JPY" ? 3 : 2)}</div>
            <Move value={c.chgPct} />
            <Sparkline data={c.spark} width={140} height={30} />
            <div style={{ fontSize: 10, color: THEME.inkDim, marginTop: 4 }}>52W ₹{fmtNum(c.low52, 2)}–₹{fmtNum(c.high52, 2)} · {c.sourceDate}</div>
          </Panel>
        ))}
      </div>

      <SectionHeading title="Global Markets" />
      <p style={{ fontSize: 11.5, color: THEME.inkDim, marginTop: -8, marginBottom: 12, maxWidth: 780 }}>
        Macro developments affecting the INR relative to the currencies shown above — for understanding market drivers, not forecasting.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
        {GLOBAL_MARKETS_NEWS.map((n, i) => (
          <Panel key={i} onClick={() => setNewsOpen(n)} className="sd-row-hover" style={{ padding: 14, cursor: "pointer" }}>
            <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{n.title}</div>
              <div style={{ fontSize: 11, color: THEME.inkDim, whiteSpace: "nowrap" }}>{n.date}</div>
            </div>
            <div style={{ fontSize: 12, color: THEME.creamDim, marginTop: 6, lineHeight: 1.5 }}>{n.teaser}</div>
          </Panel>
        ))}
      </div>

      {newsOpen && (
        <div onClick={() => setNewsOpen(null)} style={{ position: "fixed", inset: 0, background: "rgba(5,8,14,0.65)", zIndex: 60, display: "flex", justifyContent: "flex-end" }}>
          <div onClick={(e) => e.stopPropagation()} className="sd-fade-in sd-scroll" style={{ width: 480, maxWidth: "94vw", height: "100%", background: THEME.navyDeep, borderLeft: `1px solid ${THEME.hairline}`, padding: "28px 30px", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <span style={{ fontSize: 11, color: THEME.gold, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6 }}>Global Markets</span>
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
            {newsOpen.currencies && (
              <>
                <div style={{ fontSize: 11.5, textTransform: "uppercase", letterSpacing: 0.5, color: THEME.gold, marginBottom: 8 }}>Currencies affected</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {newsOpen.currencies.map((code) => (
                    <button key={code} onClick={() => setActiveCode(code)} style={{
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
   WATCHLIST PAGE
   ========================================================================================= */
function WatchlistPage({ watchlist, toggleWatch, openCompany, setPage }) {
  const rows = watchlist.map((t) => STOCKS_BY_TICKER[t]).filter(Boolean);
  return (
    <div className="sd-fade-in" style={{ padding: "22px 20px 60px", maxWidth: 1280, margin: "0 auto" }}>
      <SectionHeading eyebrow="No login required" title="Watchlist" />
      {rows.length === 0 ? (
        <Panel style={{ padding: 50, textAlign: "center" }}>
          <Star size={26} color={THEME.gold} style={{ marginBottom: 10 }} />
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>Nothing saved yet</div>
          <div style={{ fontSize: 12.5, color: THEME.inkDim, marginBottom: 14 }}>Add companies from Markets, Stocks, a company page, or Compare — the star icon adds them here for the rest of this session.</div>
          <button onClick={() => setPage("stocks")} style={{ background: THEME.gold, color: THEME.navyDeep, border: "none", borderRadius: 4, padding: "8px 16px", fontWeight: 700, cursor: "pointer" }}>Browse All NSE Stocks</button>
        </Panel>
      ) : (
        <Panel style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, minWidth: 760 }}>
            <thead><tr style={{ borderBottom: `1px solid ${THEME.hairline}` }}>
              <th style={thStyle}></th><th style={thStyle}>Company</th><th style={thStyle}>Price</th><th style={thStyle}>Chg%</th><th style={thStyle}>P/E</th><th style={thStyle}>1Y Return</th><th style={thStyle}>Next event</th>
            </tr></thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.ticker} className="sd-row-hover" style={{ borderBottom: `1px solid ${THEME.hairline}` }}>
                  <td style={tdStyle}><button onClick={() => toggleWatch(s.ticker)} style={{ background: "none", border: "none", color: THEME.down, cursor: "pointer" }}><X size={13} /></button></td>
                  <td style={tdStyle} onClick={() => openCompany(s.ticker)}><span style={{ cursor: "pointer", fontWeight: 600 }}>{s.name}</span> <span style={{ color: THEME.inkDim }}>· {s.ticker}</span></td>
                  <td style={tdStyle} className="sd-mono">₹{fmtNum(s.price)}</td>
                  <td style={tdStyle}><Move value={s.chgPct} /></td>
                  <td style={tdStyle} className="sd-mono">{s.pe ? fmtNum(s.pe, 1) : "—"}</td>
                  <td style={tdStyle}><Move value={s.ret1y} /></td>
                  <td style={tdStyle}>Mid-Oct 2026 (demo)</td>
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
    "Data sources": "Benchmark indices, 5 large-cap stock prices and 5 currency pairs are live-anchored from public market-data sources gathered via web search on 26 Jul 2026, for the last completed NSE/BSE session. All other prices, financials, ownership records and historical series are demo/illustrative and internally seeded for consistency.",
    Methodology: "Performance statistics (CAGR, drawdown, volatility, beta) shown on company and compare pages use illustrative demo calculations against a demo benchmark series, not certified index methodology.",
    "Metric definitions": "Hover the (i) icon next to a metric in Explore mode for a plain-English definition.",
    "Risk disclosures": "Equity investments carry risk of loss. Past performance is not indicative of future results. This Artifact is for information and research purposes only.",
    "Corporate-action treatment": "Demo corporate actions (dividends, splits) are illustrative and not adjusted into historical series with certified precision.",
    "End-of-day data timing": "NSE/BSE trading runs 09:15–15:30 IST. 'EOD' here refers to the last completed session's closing values where sourced live, or an illustrative equivalent otherwise.",
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
          {" "}© 2026 StockDekho (demo) <span style={{ color: THEME.hairline }}>·</span> <span style={{ color: THEME.gold }}>A product by Kane Basu</span>
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
  const [notes, setNotes] = useState({});

  const toggleWatch = (t) => setWatchlist((w) => (w.includes(t) ? w.filter((x) => x !== t) : [...w, t]));
  const toggleCompare = (t) => setCompareList((c) => (c.includes(t) ? c.filter((x) => x !== t) : c.length >= 5 ? c : [...c, t]));
  const openCompany = (t) => { setActiveTicker(t); setPage("company"); };
  const openBenchmark = (key) => { setActiveBenchmark(key); setPage("benchmark"); };
  const setNote = (ticker, arr) => setNotes((n) => ({ ...n, [ticker]: arr }));

  return (
    <div className="sd-root" style={{ background: THEME.navy, minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <GlobalStyle />
      <Header page={page} setPage={setPage} mode={mode} setMode={setMode} watchlist={watchlist} compareList={compareList}
        query={query} setQuery={setQuery} onSelectSearch={openCompany} />
      <div style={{ flex: 1 }}>
        {page === "markets" && <MarketsPage mode={mode} setPage={setPage} openCompany={openCompany} openBenchmark={openBenchmark} watchlist={watchlist} toggleWatch={toggleWatch} compareList={compareList} toggleCompare={toggleCompare} />}
        {page === "benchmark" && <BenchmarkDetailPage indexKey={activeBenchmark} back={() => setPage("markets")} openCompany={openCompany} watchlist={watchlist} toggleWatch={toggleWatch} compareList={compareList} toggleCompare={toggleCompare} />}
        {page === "stocks" && <StocksPage mode={mode} openCompany={openCompany} watchlist={watchlist} toggleWatch={toggleWatch} compareList={compareList} toggleCompare={toggleCompare} />}
        {page === "sectors" && <SectorsPage mode={mode} openCompany={openCompany} openSector={setActiveSector} activeSector={activeSector} />}
        {page === "company" && <CompanyPage ticker={activeTicker} mode={mode} watchlist={watchlist} toggleWatch={toggleWatch} compareList={compareList} toggleCompare={toggleCompare} notes={notes} setNote={setNote} />}
        {page === "compare" && <ComparePage compareList={compareList} toggleCompare={toggleCompare} openCompany={openCompany} />}
        {page === "currencies" && <CurrenciesPage />}
        {page === "watchlist" && <WatchlistPage watchlist={watchlist} toggleWatch={toggleWatch} openCompany={openCompany} setPage={setPage} />}
      </div>
      <Footer />
    </div>
  );
}
