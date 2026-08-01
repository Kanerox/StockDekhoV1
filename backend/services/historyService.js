const { fetchHistoricalPrices } = require("../clients/historyClient");

const BENCHMARK_SYMBOL = "^NSEI";

function startOfDay(date) {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

function resolvePeriod(range, customStart, customEnd) {
  const period2 = startOfDay(customEnd ? new Date(customEnd) : new Date());
  period2.setDate(period2.getDate() + 1);

  if (Number.isNaN(period2.getTime())) {
    throw new Error("Invalid end date");
  }

  if (range === "Custom") {
    const period1 = startOfDay(new Date(customStart));

    if (Number.isNaN(period1.getTime()) || !customEnd) {
      throw new Error("Valid custom start and end dates are required");
    }

    if (period1 >= period2) {
      throw new Error("Start date must be before end date");
    }

    return { period1, period2 };
  }

  const period1 = startOfDay(new Date());

  switch (range) {
    case "1D":
      period1.setDate(period1.getDate() - 7);
      break;
    case "1W":
      period1.setDate(period1.getDate() - 10);
      break;
    case "1M":
      period1.setMonth(period1.getMonth() - 1);
      break;
    case "SI":
    case "Max":
      return { period1: new Date("1990-01-01"), period2 };
    case "YTD":
      return { period1: new Date(period1.getFullYear(), 0, 1), period2 };
    case "3M":
      period1.setMonth(period1.getMonth() - 3);
      break;
    case "6M":
      period1.setMonth(period1.getMonth() - 6);
      break;
    case "9M":
      period1.setMonth(period1.getMonth() - 9);
      break;
    case "3Y":
      period1.setFullYear(period1.getFullYear() - 3);
      break;
    case "5Y":
      period1.setFullYear(period1.getFullYear() - 5);
      break;
    case "10Y":
      period1.setFullYear(period1.getFullYear() - 10);
      break;
    case "1Y":
    default:
      period1.setFullYear(period1.getFullYear() - 1);
      break;
  }

  return { period1, period2 };
}

function toDateKey(value) {
  return new Date(value).toISOString().slice(0, 10);
}

function alignSeries(stockPrices, benchmarkPrices) {
  const benchmarkByDate = new Map(
    benchmarkPrices.map((point) => [toDateKey(point.date), point])
  );

  return stockPrices
    .map((stockPoint) => {
      const date = toDateKey(stockPoint.date);
      const benchmarkPoint = benchmarkByDate.get(date);

      if (!benchmarkPoint) return null;

      return {
        date,
        close: stockPoint.close,
        adjustedClose: stockPoint.adjustedClose,
        benchmarkClose: benchmarkPoint.close,
        benchmarkAdjustedClose: benchmarkPoint.adjustedClose,
      };
    })
    .filter(Boolean);
}

async function getHistoricalPerformance(symbol, options = {}) {
  const range = options.range || "1Y";
  const { period1, period2 } = resolvePeriod(
    range,
    options.start,
    options.end
  );

  const [stockPrices, benchmarkPrices] = await Promise.all([
    fetchHistoricalPrices(symbol, period1, period2),
    fetchHistoricalPrices(BENCHMARK_SYMBOL, period1, period2),
  ]);

  let points = alignSeries(stockPrices, benchmarkPrices);

  if (range === "1D") {
    points = points.slice(-2);
  } else if (range === "1W") {
    points = points.slice(-6);
  }

  if (points.length < 2) {
    throw new Error("Insufficient historical data for the selected period");
  }

  return {
    symbol: String(symbol).trim().toUpperCase(),
    benchmarkSymbol: BENCHMARK_SYMBOL,
    benchmarkName: "Nifty 50",
    range,
    startDate: points[0].date,
    endDate: points[points.length - 1].date,
    points,
  };
}

module.exports = {
  getHistoricalPerformance,
};
