import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export function PriceChartRenderer({
  series,
  labels,
  height = 280,
  benchmarkSeries,
  benchmarkLabel,
  color,
  theme,
  formatNumber,
}) {
  const data = series.map((value, index) => {
    const row = { i: labels ? labels[index] : index, price: value };
    if (benchmarkSeries) row.benchmark = benchmarkSeries[index];
    return row;
  });

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 6, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={theme.hairline} strokeDasharray="2 4" vertical={false} />
        <XAxis dataKey="i" tick={{ fill: theme.inkDim, fontSize: 10 }} minTickGap={40} axisLine={{ stroke: theme.hairline }} tickLine={false} />
        <YAxis tick={{ fill: theme.inkDim, fontSize: 10 }} axisLine={false} tickLine={false} domain={["auto", "auto"]} width={54} />
        <Tooltip
          contentStyle={{ background: theme.panelAlt, border: `1px solid ${theme.hairline}`, borderRadius: 4, fontSize: 12 }}
          labelStyle={{ color: theme.inkDim }}
          itemStyle={{ color: theme.ink }}
          formatter={(value) => formatNumber(value, 2)}
        />
        {benchmarkSeries && <Legend wrapperStyle={{ fontSize: 11, color: theme.inkDim }} />}
        <Line type="monotone" dataKey="price" name="Price" stroke={color} strokeWidth={2} dot={false} />
        {benchmarkSeries && (
          <Line
            type="monotone"
            dataKey="benchmark"
            name={benchmarkLabel || "Benchmark"}
            stroke={theme.inkDim}
            strokeWidth={1.4}
            dot={false}
            strokeDasharray="3 3"
          />
        )}
      </LineChart>
    </ResponsiveContainer>
  );
}

export function YieldHistoryChart({ data, theme }) {
  return (
    <ResponsiveContainer width="100%" height={320}>
      <LineChart data={data} margin={{ top: 6, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={theme.hairline} strokeDasharray="2 4" vertical={false} />
        <XAxis dataKey="date" tick={{ fill: theme.inkDim, fontSize: 10 }} minTickGap={40} tickLine={false} />
        <YAxis tick={{ fill: theme.inkDim, fontSize: 10 }} domain={["auto", "auto"]} width={58} tickFormatter={(value) => `${Number(value).toFixed(2)}%`} />
        <Tooltip
          contentStyle={{ background: theme.panelAlt, border: `1px solid ${theme.hairline}`, borderRadius: 4 }}
          formatter={(value, _name, item) => [
            `${Number(value).toFixed(2)}%${Number.isFinite(item?.payload?.change) ? ` · ${item.payload.change > 0 ? "+" : ""}${item.payload.change} bps` : ""}`,
            "Yield",
          ]}
        />
        <Line type="monotone" dataKey="yield" stroke={theme.gold} strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function ComparisonReturnsChart({ stocks, histories, theme, formatNumber }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart>
        <CartesianGrid stroke={theme.hairline} strokeDasharray="2 4" vertical={false} />
        <XAxis dataKey="i" type="number" domain={[0, 100]} hide />
        <YAxis tick={{ fill: theme.inkDim, fontSize: 10 }} axisLine={false} tickLine={false} />
        <Tooltip
          contentStyle={{ background: theme.panelAlt, border: `1px solid ${theme.hairline}`, borderRadius: 4 }}
          formatter={(value) => [`${formatNumber(value, 2)}%`, undefined]}
        />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        {stocks.map((stock, index) => {
          const points = histories[stock.ticker]?.points || [];
          const firstValue = points[0]?.adjustedClose;
          const series = points.map((point, pointIndex) => ({
            i: points.length > 1 ? (pointIndex / (points.length - 1)) * 100 : 0,
            [stock.ticker]: Number.isFinite(firstValue) && firstValue !== 0
              ? (point.adjustedClose / firstValue) * 100 - 100
              : null,
          }));
          const colors = [theme.gold, theme.up, theme.down, "#7C9CBF", "#B47EC9"];
          return <Line key={stock.ticker} data={series} type="monotone" dataKey={stock.ticker} stroke={colors[index % colors.length]} dot={false} strokeWidth={2} />;
        })}
      </LineChart>
    </ResponsiveContainer>
  );
}
