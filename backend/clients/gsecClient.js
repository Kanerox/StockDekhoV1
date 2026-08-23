const axios = require("axios");
const { unzipSync, strFromU8 } = require("fflate");
const { getCachedValue, setCacheEntry } = require("./cacheClient");

const FBIL_BASE_URL = "https://www.fbil.org.in/wasdm/gsec";
const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_LIST_TTL_MS = 6 * 60 * 60 * 1000;
const OBSERVATION_RETENTION_MS = 5 * 365 * DAY_MS;
const RANGE_DAYS = { "1M": 35, "3M": 100, "6M": 190, "1Y": 370 };

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
      results[index] = await mapper(values[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, worker));
  return results;
}

async function getIndiaTenYearYield(range = "1M") {
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
  const points = await mapWithConcurrency(selectedDates, 5, fetchObservation);
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

module.exports = { getIndiaTenYearYield, parseTenYearYield };
