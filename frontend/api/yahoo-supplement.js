import YahooFinance from "yahoo-finance2";

const yahooFinance = new YahooFinance({
  suppressNotices: ["yahooSurvey"],
});

function normalizeSymbol(symbol) {
  const value = String(symbol || "").trim().toUpperCase();
  if (!value) return null;
  return value.endsWith(".NS") || value.endsWith(".BO")
    ? value
    : `${value}.NS`;
}

function ticker(symbol) {
  return String(symbol || "").toUpperCase().replace(/\.(NS|BO)$/, "");
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function isoDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function futureDate(values) {
  return (Array.isArray(values) ? values : [values])
    .map(isoDate)
    .filter((value) => value && new Date(value).getTime() > Date.now())
    .sort()[0] || null;
}

function quoteSupplement(quote) {
  return {
    ticker: ticker(quote.symbol),
    company: quote.longName || quote.shortName || ticker(quote.symbol),
    regularMarketPrice: finite(quote.regularMarketPrice),
    regularMarketChange: finite(quote.regularMarketChange),
    regularMarketChangePercent: finite(quote.regularMarketChangePercent),
    regularMarketTime: isoDate(quote.regularMarketTime),
    marketCap: finite(quote.marketCap),
    trailingPE: finite(quote.trailingPE),
    priceToBook: finite(quote.priceToBook),
    bookValue: finite(quote.bookValue),
    trailingEps: finite(quote.epsTrailingTwelveMonths),
    dividendYield: finite(quote.dividendYield),
    averageVolume: finite(quote.averageDailyVolume3Month),
    regularMarketOpen: finite(quote.regularMarketOpen),
    regularMarketPreviousClose: finite(quote.regularMarketPreviousClose),
    regularMarketDayHigh: finite(quote.regularMarketDayHigh),
    regularMarketDayLow: finite(quote.regularMarketDayLow),
    regularMarketVolume: finite(quote.regularMarketVolume),
    fiftyTwoWeekHigh: finite(quote.fiftyTwoWeekHigh),
    fiftyTwoWeekLow: finite(quote.fiftyTwoWeekLow),
  };
}

function normalizeEvents(symbol, result) {
  const calendar = result?.calendarEvents || {};
  const earnings = calendar.earnings || {};
  const summary = result?.summaryDetail || {};
  const upcomingDate = futureDate(earnings.earningsDate || []);

  return {
    symbol: ticker(symbol),
    currency: summary.currency || "INR",
    availability: "full",
    upcomingEarnings: {
      date: upcomingDate,
      status: upcomingDate ? "scheduled" : "not_available",
      isEstimate: Boolean(upcomingDate && earnings.isEarningsDateEstimate),
      epsEstimate: upcomingDate ? finite(earnings.earningsAverage) : null,
      epsLow: upcomingDate ? finite(earnings.earningsLow) : null,
      epsHigh: upcomingDate ? finite(earnings.earningsHigh) : null,
      revenueEstimate: upcomingDate ? finite(earnings.revenueAverage) : null,
      revenueLow: upcomingDate ? finite(earnings.revenueLow) : null,
      revenueHigh: upcomingDate ? finite(earnings.revenueHigh) : null,
    },
    dividend: {
      exDividendDate: isoDate(calendar.exDividendDate || summary.exDividendDate),
      annualRate: finite(summary.dividendRate),
      yieldPercent: finite(summary.dividendYield) === null
        ? null
        : finite(summary.dividendYield) * 100,
      payoutRatioPercent: finite(summary.payoutRatio) === null
        ? null
        : finite(summary.payoutRatio) * 100,
      fiveYearAverageYieldPercent: finite(summary.fiveYearAvgDividendYield),
    },
    earningsHistory: (result?.earningsHistory?.history || [])
      .map((item) => ({
        quarter: isoDate(item.quarter),
        epsActual: finite(item.epsActual),
        epsEstimate: finite(item.epsEstimate),
        epsDifference: finite(item.epsDifference),
        surprisePercent: finite(item.surprisePercent) === null
          ? null
          : finite(item.surprisePercent) * 100,
      }))
      .filter((item) => item.quarter),
  };
}

function historyPeriod(query) {
  const period2 = query?.end ? new Date(query.end) : new Date();
  period2.setDate(period2.getDate() + 1);
  const period1 = query?.start ? new Date(query.start) : new Date();
  const range = String(query?.range || "1Y").toUpperCase();

  if (!query?.start) {
    if (range === "1W") period1.setDate(period1.getDate() - 10);
    else if (range === "1M") period1.setMonth(period1.getMonth() - 1);
    else if (range === "3M") period1.setMonth(period1.getMonth() - 3);
    else if (range === "6M") period1.setMonth(period1.getMonth() - 6);
    else if (range === "9M") period1.setMonth(period1.getMonth() - 9);
    else if (range === "3Y") period1.setFullYear(period1.getFullYear() - 3);
    else if (range === "5Y") period1.setFullYear(period1.getFullYear() - 5);
    else if (range === "MAX" || range === "SI") period1.setTime(new Date("1990-01-01").getTime());
    else period1.setFullYear(period1.getFullYear() - 1);
  }

  return { period1, period2 };
}

function chartPoints(result) {
  return (result?.quotes || [])
    .filter((quote) => quote?.date && Number.isFinite(quote?.close))
    .map((quote) => ({
      date: new Date(quote.date).toISOString().slice(0, 10),
      close: quote.close,
      adjustedClose: Number.isFinite(quote.adjclose) ? quote.adjclose : quote.close,
    }));
}

async function historySupplement(symbol, query) {
  const { period1, period2 } = historyPeriod(query);
  const options = { period1, period2, interval: "1d" };
  const [stockResult, benchmarkResult, stockQuote, benchmarkQuote] = await Promise.all([
    yahooFinance.chart(symbol, options),
    yahooFinance.chart("^NSEI", options),
    yahooFinance.quote(symbol),
    yahooFinance.quote("^NSEI"),
  ]);
  const stockPoints = chartPoints(stockResult);
  const benchmarkPoints = chartPoints(benchmarkResult);
  const stockQuoteDate = isoDate(stockQuote?.regularMarketTime)?.slice(0, 10);
  const benchmarkQuoteDate = isoDate(benchmarkQuote?.regularMarketTime)?.slice(0, 10);

  if (
    stockQuoteDate &&
    stockQuoteDate === benchmarkQuoteDate &&
    Number.isFinite(stockQuote?.regularMarketPrice) &&
    Number.isFinite(benchmarkQuote?.regularMarketPrice)
  ) {
    stockPoints.push({
      date: stockQuoteDate,
      close: stockQuote.regularMarketPrice,
      adjustedClose: stockQuote.regularMarketPrice,
    });
    benchmarkPoints.push({
      date: benchmarkQuoteDate,
      close: benchmarkQuote.regularMarketPrice,
      adjustedClose: benchmarkQuote.regularMarketPrice,
    });
  }

  const benchmarkByDate = new Map(
    benchmarkPoints.map((point) => [point.date, point])
  );
  const stockByDate = new Map(stockPoints.map((point) => [point.date, point]));

  return {
    points: [...stockByDate.values()]
      .map((point) => {
        const benchmark = benchmarkByDate.get(point.date);
        return benchmark ? {
          ...point,
          benchmarkClose: benchmark.close,
          benchmarkAdjustedClose: benchmark.adjustedClose,
        } : null;
      })
      .filter(Boolean)
      .sort((a, b) => a.date.localeCompare(b.date)),
  };
}

export default async function handler(request, response) {
  try {
    const action = String(request.query?.action || "quotes");
    response.setHeader(
      "Cache-Control",
      action === "events"
        ? "public, s-maxage=600, stale-while-revalidate=3600"
        : "public, s-maxage=120, stale-while-revalidate=600"
    );
    const symbols = String(request.query?.symbols || request.query?.symbol || "")
      .split(",")
      .map(normalizeSymbol)
      .filter(Boolean)
      .slice(0, 40);

    if (symbols.length === 0) {
      return response.status(400).json({ error: "At least one symbol is required" });
    }

    if (action === "events") {
      const symbol = symbols[0];
      const result = await yahooFinance.quoteSummary(symbol, {
        modules: ["calendarEvents", "summaryDetail", "earningsHistory"],
      }, { validateResult: false });
      return response.status(200).json(normalizeEvents(symbol, result));
    }

    if (action === "history") {
      return response.status(200).json(
        await historySupplement(symbols[0], request.query)
      );
    }

    if (action === "company") {
      const symbol = symbols[0];
      const [quote, summary] = await Promise.all([
        yahooFinance.quote(symbol),
        yahooFinance.quoteSummary(symbol, {
          modules: ["financialData"],
        }, { validateResult: false }),
      ]);
      const financialData = summary?.financialData || {};
      return response.status(200).json({
        ...quoteSupplement(quote),
        returnOnEquity: finite(financialData.returnOnEquity) === null
          ? null
          : finite(financialData.returnOnEquity) * 100,
        debtToEquity: finite(financialData.debtToEquity) === null
          ? null
          : finite(financialData.debtToEquity) / 100,
      });
    }

    const result = await yahooFinance.quote(symbols);
    const quotes = (Array.isArray(result) ? result : [result])
      .filter(Boolean)
      .map(quoteSupplement);
    return response.status(200).json({ quotes });
  } catch (error) {
    return response.status(503).json({
      error: "Yahoo Finance supplemental data is temporarily unavailable",
      details: error.message,
    });
  }
}
