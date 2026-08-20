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
