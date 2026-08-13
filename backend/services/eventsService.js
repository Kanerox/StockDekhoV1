const { fetchCompanyEvents } = require("../clients/eventsClient");
const { fetchMarketData } = require("../clients/marketClient");

function numberOrNull(value) {
  return Number.isFinite(value) ? value : null;
}

function dateOrNull(value) {
  if (!value) return null;

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function selectFutureDate(values, now = Date.now()) {
  const candidates = (Array.isArray(values) ? values : [values])
    .map(dateOrNull)
    .filter(Boolean)
    .filter((date) => new Date(date).getTime() > now)
    .sort((dateA, dateB) => new Date(dateA) - new Date(dateB));

  return candidates[0] || null;
}

async function getCompanyEvents(symbol) {
  let result;
  let partial = false;

  try {
    result = await fetchCompanyEvents(symbol);
  } catch (error) {
    const quote = await fetchMarketData(symbol);
    const earningsCandidates = [
      quote.earningsTimestamp,
      quote.earningsTimestampStart,
      quote.earningsTimestampEnd,
    ];
    partial = true;
    result = {
      calendarEvents: {
        earnings: {
          earningsDate: [selectFutureDate(earningsCandidates)].filter(Boolean),
        },
        exDividendDate: quote.exDividendDate,
      },
      summaryDetail: {
        currency: quote.currency,
        exDividendDate: quote.exDividendDate,
        dividendRate: quote.dividendRate,
        dividendYield: Number.isFinite(quote.dividendYield)
          ? quote.dividendYield / 100
          : null,
        payoutRatio: quote.payoutRatio,
      },
      earningsHistory: { history: [] },
    };
  }
  const calendar = result.calendarEvents || {};
  const earnings = calendar.earnings || {};
  const summary = result.summaryDetail || {};
  const earningsHistory = result.earningsHistory?.history || [];
  const upcomingEarningsDate = selectFutureDate(earnings.earningsDate || []);

  return {
    symbol: String(symbol).trim().toUpperCase(),
    currency: summary.currency || "INR",
    availability: partial ? "partial" : "full",
    upcomingEarnings: {
      date: upcomingEarningsDate,
      status: upcomingEarningsDate ? "scheduled" : "not_available",
      isEstimate: Boolean(
        upcomingEarningsDate && earnings.isEarningsDateEstimate
      ),
      epsEstimate: upcomingEarningsDate
        ? numberOrNull(earnings.earningsAverage)
        : null,
      epsLow: upcomingEarningsDate ? numberOrNull(earnings.earningsLow) : null,
      epsHigh: upcomingEarningsDate ? numberOrNull(earnings.earningsHigh) : null,
      revenueEstimate: upcomingEarningsDate
        ? numberOrNull(earnings.revenueAverage)
        : null,
      revenueLow: upcomingEarningsDate
        ? numberOrNull(earnings.revenueLow)
        : null,
      revenueHigh: upcomingEarningsDate
        ? numberOrNull(earnings.revenueHigh)
        : null,
    },
    dividend: {
      exDividendDate: dateOrNull(
        calendar.exDividendDate || summary.exDividendDate
      ),
      annualRate: numberOrNull(summary.dividendRate),
      yieldPercent: Number.isFinite(summary.dividendYield)
        ? summary.dividendYield * 100
        : null,
      payoutRatioPercent: Number.isFinite(summary.payoutRatio)
        ? summary.payoutRatio * 100
        : null,
      fiveYearAverageYieldPercent: numberOrNull(
        summary.fiveYearAvgDividendYield
      ),
    },
    earningsHistory: earningsHistory
      .map((item) => ({
        quarter: dateOrNull(item.quarter),
        epsActual: numberOrNull(item.epsActual),
        epsEstimate: numberOrNull(item.epsEstimate),
        epsDifference: numberOrNull(item.epsDifference),
        surprisePercent: Number.isFinite(item.surprisePercent)
          ? item.surprisePercent * 100
          : null,
      }))
      .filter((item) => item.quarter),
  };
}

module.exports = {
  getCompanyEvents,
  selectFutureDate,
};
