function ticker(symbol) {
  return String(symbol || "").trim().toUpperCase().replace(/\.(NS|BO)$/, "");
}

async function supplementalRequest(params) {
  const query = new URLSearchParams(params);
  const response = await fetch(`/api/yahoo-supplement?${query.toString()}`);
  if (!response.ok) throw new Error("Yahoo supplemental request failed");
  return response.json();
}

export async function getYahooCompanySupplement(symbol) {
  try {
    return await supplementalRequest({ action: "company", symbol: ticker(symbol) });
  } catch (error) {
    console.warn("Yahoo company supplement unavailable:", error);
    return null;
  }
}

export async function getYahooQuoteSupplements(symbols) {
  try {
    const chunks = [];
    for (let index = 0; index < symbols.length; index += 40) {
      chunks.push(symbols.slice(index, index + 40));
    }
    const responses = await Promise.all(
      chunks.map((chunk) => supplementalRequest({
        action: "quotes",
        symbols: chunk.map(ticker).join(","),
      }))
    );
    return responses.flatMap((data) =>
      Array.isArray(data?.quotes) ? data.quotes : []
    );
  } catch (error) {
    console.warn("Yahoo quote supplements unavailable:", error);
    return [];
  }
}

export async function getYahooHistorySupplement(symbol, range, customRange = {}) {
  try {
    return await supplementalRequest({
      action: "history",
      symbol: ticker(symbol),
      range,
      ...(customRange.start ? { start: customRange.start } : {}),
      ...(customRange.end ? { end: customRange.end } : {}),
    });
  } catch (error) {
    console.warn("Yahoo history supplement unavailable:", error);
    return null;
  }
}

export async function getYahooEventSupplement(symbol) {
  try {
    return await supplementalRequest({ action: "events", symbol: ticker(symbol) });
  } catch (error) {
    console.warn("Yahoo event supplement unavailable:", error);
    return null;
  }
}
