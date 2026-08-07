import { cachedGet } from "./apiClient";

export async function getStockQuote(symbol) {
  try {
    const response = await cachedGet(`/market/${symbol}`);
    return response.data;
  } catch (error) {
    console.error("Failed to fetch stock quote:", error);
    throw error;
  }
}

export async function getPeerComparison(symbols) {
  try {
    const response = await cachedGet("/market/peers", {
      params: {
        symbols: symbols.join(","),
      },
    });

    return response.data.peers || [];
  } catch (error) {
    console.error("Failed to fetch peer comparison:", error);
    throw error;
  }
}

export async function getStockUniverse(symbols) {
  try {
    const response = await cachedGet("/market/stocks", {
      params: {
        symbols: symbols.join(","),
      },
    });

    return response.data.stocks || [];
  } catch (error) {
    console.error("Failed to fetch live stock universe:", error);
    throw error;
  }
}
export async function getMarketPerformers(
  symbols,
  range = "1M"
) {
  try {
    const response = await cachedGet(
      "/market/performers",
      {
        params: {
          symbols: symbols.join(","),
          range,
        },
      }
    );

    return response.data;
  } catch (error) {
    console.error(
      "Failed to fetch market performers:",
      error
    );
    throw error;
  }
}
