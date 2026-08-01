const { fetchCompanyEvents } = require("../clients/eventsClient");

function numberOrNull(value) {
  return Number.isFinite(value) ? value : null;
}

function dateOrNull(value) {
  if (!value) return null;

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

async function getCompanyEvents(symbol) {
  const result = await fetchCompanyEvents(symbol);
  const calendar = result.calendarEvents || {};
  const earnings = calendar.earnings || {};
  const summary = result.summaryDetail || {};
  const earningsHistory = result.earningsHistory?.history || [];

  return {
    symbol: String(symbol).trim().toUpperCase(),
    currency: summary.currency || "INR",
    upcomingEarnings: {
      date: dateOrNull(earnings.earningsDate?.[0]),
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
