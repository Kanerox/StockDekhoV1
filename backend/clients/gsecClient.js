const axios = require("axios");
const { unzipSync, strFromU8 } = require("fflate");
const { getCachedValue, setCacheEntry } = require("./cacheClient");

const FBIL_BASE_URL = "https://www.fbil.org.in/wasdm/gsec";
const UPSTOX_API_BASE_URL = "https://api.upstox.com";
const BENCHMARK_INSTRUMENT_KEY = "NSE_EQ|IN0020260025";
const BENCHMARK_SYMBOL = "694GS2036";
const BENCHMARK_COUPON_PERCENT = 6.94;
const BENCHMARK_MATURITY = "2036-05-11";
const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_LIST_TTL_MS = 6 * 60 * 60 * 1000;
const OBSERVATION_RETENTION_MS = 5 * 365 * DAY_MS;
const RANGE_DAYS = { "1M": 35, "3M": 100, "6M": 190, "1Y": 370 };

function upstoxHeaders() {
  const token = String(process.env.UPSTOX_ANALYTICS_TOKEN || "").trim();
  if (!token) throw new Error("UPSTOX_ANALYTICS_TOKEN is not configured");
  return { Accept: "application/json", Authorization: `Bearer ${token}` };
}

function dateOnly(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function couponDatesAround(settlement) {
  const year = settlement.getUTCFullYear();
  const candidates = [];
  for (let candidateYear = year - 1; candidateYear <= year + 1; candidateYear += 1) {
    candidates.push(
      new Date(Date.UTC(candidateYear, 4, 11)),
      new Date(Date.UTC(candidateYear, 10, 11))
    );
  }
  candidates.sort((a, b) => a - b);
  return {
    previous: [...candidates].reverse().find((date) => date <= settlement),
    next: candidates.find((date) => date > settlement),
  };
}

function yieldFromCleanPrice(cleanPrice, settlementValue) {
  const price = Number(cleanPrice);
  const settlement = new Date(`${dateOnly(settlementValue)}T00:00:00Z`);
  const maturity = new Date(`${BENCHMARK_MATURITY}T00:00:00Z`);
  if (!Number.isFinite(price) || price <= 0 || Number.isNaN(settlement.getTime()) || settlement >= maturity) {
    return null;
  }

  const coupon = BENCHMARK_COUPON_PERCENT / 2;
  const { previous, next } = couponDatesAround(settlement);
  if (!previous || !next) return null;
  const periodMs = next.getTime() - previous.getTime();
  const elapsedFraction = (settlement.getTime() - previous.getTime()) / periodMs;
  const firstPeriodFraction = (next.getTime() - settlement.getTime()) / periodMs;
  const dirtyPrice = price + coupon * elapsedFraction;
  const cashFlows = [];
  let paymentDate = new Date(next);
  let periodIndex = 0;
  while (paymentDate <= maturity) {
    cashFlows.push({
      amount: coupon + (paymentDate.getTime() === maturity.getTime() ? 100 : 0),
      periods: firstPeriodFraction + periodIndex,
    });
    paymentDate = new Date(Date.UTC(
      paymentDate.getUTCFullYear(),
      paymentDate.getUTCMonth() + 6,
      11
    ));
    periodIndex += 1;
  }

  const presentValue = (annualYield) => cashFlows.reduce(
    (sum, flow) => sum + flow.amount / Math.pow(1 + annualYield / 2, flow.periods),
    0
  );
  let low = -0.5;
  let high = 0.5;
  for (let iteration = 0; iteration < 100; iteration += 1) {
    const middle = (low + high) / 2;
    if (presentValue(middle) > dirtyPrice) low = middle;
    else high = middle;
  }
  return ((low + high) / 2) * 100;
}

async function fetchUpstoxBenchmarkQuote() {
  const response = await axios.get(`${UPSTOX_API_BASE_URL}/v2/market-quote/quotes`, {
    headers: upstoxHeaders(),
    params: { instrument_key: BENCHMARK_INSTRUMENT_KEY },
    timeout: 15000,
  });
  const quote = Object.values(response?.data?.data || {})[0];
  const price = Number(quote?.last_price);
  const timestampValue = Number(quote?.last_trade_time) || Number(quote?.timestamp);
  const milliseconds = timestampValue < 1e12 ? timestampValue * 1000 : timestampValue;
  const timestamp = Number.isFinite(milliseconds)
    ? new Date(milliseconds).toISOString()
    : null;
  if (!Number.isFinite(price) || price <= 0 || !timestamp) {
    throw new Error("Upstox returned an invalid benchmark G-Sec quote");
  }
  return { price, timestamp };
}

async function fetchUpstoxBenchmarkHistory(from, to) {
  const response = await axios.get(
    `${UPSTOX_API_BASE_URL}/v3/historical-candle/${encodeURIComponent(BENCHMARK_INSTRUMENT_KEY)}/days/1/${to}/${from}`,
    { headers: upstoxHeaders(), timeout: 20000 }
  );
  return (response?.data?.data?.candles || [])
    .map((candle) => ({
      date: dateOnly(candle[0]),
      yield: yieldFromCleanPrice(Number(candle[4]), candle[0]),
    }))
    .filter((point) => point.date && Number.isFinite(point.yield))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function decodeXml(value = "") {
  return String(value)
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function parseSharedStrings(xml = "") {
  return [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((match) =>
    decodeXml(
      [...match[1].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)]
        .map((part) => part[1])
        .join("")
    )
  );
}

function parseTenYearYield(workbookBuffer) {
  const files = unzipSync(new Uint8Array(workbookBuffer));
  const sheet = files["xl/worksheets/sheet2.xml"];
  const shared = files["xl/sharedStrings.xml"];
  if (!sheet) throw new Error("FBIL par-yield worksheet is unavailable");

  const sheetXml = strFromU8(sheet);
  const sharedStrings = shared ? parseSharedStrings(strFromU8(shared)) : [];
  const rows = [...sheetXml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)];

  for (const row of rows) {
    const cells = {};
    for (const cell of row[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
      const ref = /\br="([A-Z]+)\d+"/.exec(cell[1])?.[1];
      const raw = /<v>([\s\S]*?)<\/v>/.exec(cell[2])?.[1];
      if (!ref || raw === undefined) continue;
      cells[ref] = /\bt="s"/.test(cell[1]) ? sharedStrings[Number(raw)] : Number(raw);
    }

    if (Number(cells.A) === 10 && Number.isFinite(Number(cells.C))) {
      return Number(cells.C);
    }
  }

  throw new Error("FBIL 10-year annualized par yield was not found");
}

async function fetchObservation(date) {
  const key = `gsec:india10y:${date}`;
  const cached = await getCachedValue(key, OBSERVATION_RETENTION_MS);
  if (cached) return cached;

  const response = await axios.get(`${FBIL_BASE_URL}/downloadPublished`, {
    params: { date },
    responseType: "arraybuffer",
    timeout: 15000,
    headers: { Accept: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
  });
  const observation = { date, yield: parseTenYearYield(response.data) };
  await setCacheEntry(key, observation, OBSERVATION_RETENTION_MS);
  return observation;
}

async function fetchPublicationDates(fromDate, toDate) {
  const key = `gsec:dates:${fromDate}:${toDate}`;
  const cached = await getCachedValue(key, DATE_LIST_TTL_MS);
  if (cached) return cached;

  const response = await axios.get(`${FBIL_BASE_URL}/fetchfiltered`, {
    params: { fromDate, toDate, authenticated: false },
    timeout: 15000,
  });
  const dates = (Array.isArray(response.data) ? response.data : [])
    .map((item) => item.processRunDate)
    .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date))
    .sort();
  await setCacheEntry(key, dates, DATE_LIST_TTL_MS);
  return dates;
}

function sampleDates(dates, maximumPoints = 36) {
  if (dates.length <= maximumPoints) return dates;
  const sampled = [];
  for (let index = 0; index < maximumPoints; index += 1) {
    sampled.push(dates[Math.round((index * (dates.length - 1)) / (maximumPoints - 1))]);
  }
  return [...new Set(sampled)];
}

async function mapWithConcurrency(values, limit, mapper) {
  const results = new Array(values.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < values.length) {
      const index = nextIndex++;
      try {
        results[index] = await mapper(values[index]);
      } catch (error) {
        console.warn(`Skipping unavailable FBIL G-Sec publication ${values[index]}: ${error.message}`);
        results[index] = null;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, worker));
  return results;
}

async function getFbilIndiaTenYearYield(range = "1M") {
  const normalizedRange = RANGE_DAYS[range] ? range : "1M";
  const to = new Date();
  const from = new Date(to.getTime() - RANGE_DAYS[normalizedRange] * DAY_MS);
  const dates = await fetchPublicationDates(isoDate(from), isoDate(to));
  if (!dates.length) throw new Error("No FBIL G-Sec publications are available for this range");

  const latestPublicationDate = dates.at(-1);
  const monthTargetDate = new Date(`${latestPublicationDate}T00:00:00Z`);
  monthTargetDate.setUTCMonth(monthTargetDate.getUTCMonth() - 1);
  const monthBaselineDate = [...dates].reverse().find((date) => date <= isoDate(monthTargetDate));
  const selectedDates = [...new Set([
    ...sampleDates(dates, normalizedRange === "1M" ? 12 : 36),
    ...dates.slice(-2),
    ...(monthBaselineDate ? [monthBaselineDate] : []),
  ])].sort();
  const points = (await mapWithConcurrency(selectedDates, 5, fetchObservation)).filter(Boolean);
  if (points.length < 2) throw new Error("Insufficient FBIL G-Sec observations are available for this range");
  const latest = points.at(-1);
  const previous = points.at(-2) || latest;
  const monthReference = [...points]
    .reverse()
    .find((point) => point.date <= isoDate(monthTargetDate)) || points[0];

  return {
    key: "INDIA10Y",
    name: "India 10Y G-Sec",
    value: latest.yield,
    todayBps: Math.round((latest.yield - previous.yield) * 100),
    oneMonthBps: Math.round((latest.yield - monthReference.yield) * 100),
    observationDate: latest.date,
    asOf: latest.date,
    status: "EOD",
    dataProvider: "FBIL",
    sourceUrl: "https://www.fbil.org.in/",
    points: points.map((point) => ({ date: point.date, yield: point.yield })),
    sparkline: points.slice(-20).map((point) => point.yield),
    range: normalizedRange,
    description: "FBIL's published annualized 10-year Government of India par yield, shown as EOD interest-rate context for equity research.",
  };
}

async function getUpstoxIndiaTenYearYield(range = "1M") {
  const normalizedRange = RANGE_DAYS[range] ? range : "1M";
  const toDate = new Date();
  const fromDate = new Date(toDate.getTime() - RANGE_DAYS[normalizedRange] * DAY_MS);
  const [history, quote] = await Promise.all([
    fetchUpstoxBenchmarkHistory(isoDate(fromDate), isoDate(toDate)),
    fetchUpstoxBenchmarkQuote(),
  ]);
  const quoteDate = dateOnly(quote.timestamp);
  const quoteYield = yieldFromCleanPrice(quote.price, quote.timestamp);
  if (!Number.isFinite(quoteYield)) {
    throw new Error("Unable to calculate the Upstox benchmark G-Sec yield");
  }

  const byDate = new Map(history.map((point) => [point.date, point]));
  byDate.set(quoteDate, { date: quoteDate, yield: quoteYield });
  const points = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  if (points.length < 2) throw new Error("Insufficient Upstox G-Sec history");
  const latest = points.at(-1);
  const previous = points.at(-2);
  const monthTarget = new Date(`${latest.date}T00:00:00Z`);
  monthTarget.setUTCMonth(monthTarget.getUTCMonth() - 1);
  const monthReference = [...points]
    .reverse()
    .find((point) => point.date <= isoDate(monthTarget)) || points[0];
  const asOf = latest.date === quoteDate
    ? quote.timestamp
    : `${latest.date}T10:30:00.000Z`;
  const observationAgeMs = Date.now() - new Date(asOf).getTime();
  const status = observationAgeMs <= DAY_MS ? "Delayed" : "EOD";

  return {
    key: "INDIA10Y",
    name: "India 10Y G-Sec",
    value: latest.yield,
    todayBps: Math.round((latest.yield - previous.yield) * 100),
    oneMonthBps: Math.round((latest.yield - monthReference.yield) * 100),
    observationDate: latest.date,
    asOf,
    status,
    dataProvider: "Upstox-derived",
    sourceUrl: "https://upstox.com/developer/api-documentation/get-full-market-quote/",
    points,
    sparkline: points.slice(-20).map((point) => point.yield),
    range: normalizedRange,
    description: `Yield calculated from the Upstox NSE price of ${BENCHMARK_SYMBOL} (6.94% GS 2036), with the provider's actual trade timestamp.`,
  };
}

async function getIndiaTenYearYield(range = "1M") {
  try {
    return await getUpstoxIndiaTenYearYield(range);
  } catch (error) {
    console.warn(`Upstox G-Sec yield unavailable; using FBIL: ${error.message}`);
    return getFbilIndiaTenYearYield(range);
  }
}

module.exports = {
  getIndiaTenYearYield,
  getUpstoxIndiaTenYearYield,
  getFbilIndiaTenYearYield,
  parseTenYearYield,
  yieldFromCleanPrice,
};
