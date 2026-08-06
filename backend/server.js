const express = require("express");
const cors = require("cors");
const currencyRoutes = require("./routes/currencyRoutes");
const eventsRoutes = require("./routes/eventsRoutes");
const financialsRoutes = require("./routes/financialsRoutes");
const historyRoutes = require("./routes/historyRoutes");
const indexRoutes = require("./routes/indexRoutes");
const marketRoutes = require("./routes/marketRoutes");
const newsRoutes = require("./routes/newsRoutes");
const sectorRoutes = require("./routes/sectorRoutes");
const { port } = require("./config/config");
const {
  getMarketDataProviderName,
} = require("./providers/marketData");
const apiRateLimit = require("./middleware/apiRateLimit");

const app = express();

app.use(cors());
app.use(express.json());
app.set("trust proxy", 1);
app.use("/api", apiRateLimit);
app.use("/api/currencies", currencyRoutes);
app.use("/api/events", eventsRoutes);
app.use("/api/financials", financialsRoutes);
app.use("/api/history", historyRoutes);
app.use("/api/indices", indexRoutes);

app.get("/", (req, res) => {
  res.json({
    message: "StockDekho Backend is running!",
    marketDataProvider: getMarketDataProviderName(),
  });
});

app.use("/api/market", marketRoutes);
app.use("/api/news", newsRoutes);
app.use("/api/sectors", sectorRoutes);

const PORT = process.env.PORT || port;

app.listen(PORT, "0.0.0.0", () => {
  console.log(
    `Server running on port ${PORT} with ${getMarketDataProviderName()} market data`
  );
});
