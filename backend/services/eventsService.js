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

function futureDateOrNull(value) {
  const date = dateOrNull(value);
  return date && new Date(date).getTime() > Date.now() ? date : null;
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
    ].filter((value) => {
      const time = new Date(value).getTime();
      return Number.isFinite(time) && time > Date.now();
    });
    partial = true;
    result = {
      calendarEvents: {
        earnings: {
          earningsDate: earningsCandidates.slice(0, 1),
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

  return {
    symbol: String(symbol).trim().toUpperCase(),
    currency: summary.currency || "INR",
    availability: partial ? "partial" : "full",
    upcomingEarnings: {
      date: futureDateOrNull(earnings.earningsDate?.[0]),
      isEstimate: Boolean(earnings.isEarningsDateEstimate),
      epsEstimate: numberOrNull(earnings.earningsAverage),
      epsLow: numberOrNull(earnings.earningsLow),
      epsHigh: numberOrNull(earnings.earningsHigh),
      revenueEstimate: numberOrNull(earnings.revenueAverage),
      revenueLow: numberOrNull(earnings.revenueLow),
      revenueHigh: numberOrNull(earnings.revenueHigh),
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
};
