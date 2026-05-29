// src/app/data-analysis/page.js
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { fetchEnvAnalysis } from "@/lib/api";

const FORECAST_STEPS = 5;

const TIME_MODES = {
  seconds: {
    label: "Seconds",
    stepSec: 1,
    axisUnit: "s",
    bucketText: "1-second averages",
  },
  minutes: {
    label: "Minutes",
    stepSec: 60,
    axisUnit: "m",
    bucketText: "1-minute averages",
  },
  hours: {
    label: "Hours",
    stepSec: 3600,
    axisUnit: "h",
    bucketText: "1-hour averages",
  },
};

const Y_AXIS_MODES = {
  farm: {
    label: "Farm Range",
    description: "Shows realistic farm/environment ranges and threshold zones.",
  },
  data: {
    label: "Data Range",
    description: "Zooms the graph to the min/max values from the current data.",
  },
};

const METRICS = {
  tempC: {
    label: "Temperature",
    short: "Temp",
    unit: "°C",
    color: "#fb7185",
    soft: "rgba(251,113,133,0.16)",
    digits: 1,
    farmRange: [10, 40],
    thresholds: [
      { from: 10, to: 18, label: "Cold", fill: "rgba(59,130,246,0.12)" },
      { from: 18, to: 26, label: "Target", fill: "rgba(16,185,129,0.12)" },
      { from: 26, to: 30, label: "Warm", fill: "rgba(234,179,8,0.12)" },
      { from: 30, to: 35, label: "Heat", fill: "rgba(249,115,22,0.14)" },
      { from: 35, to: 40, label: "Severe heat", fill: "rgba(239,68,68,0.16)" },
    ],
  },
  humidityPct: {
    label: "Humidity",
    short: "Humidity",
    unit: "%",
    color: "#38bdf8",
    soft: "rgba(56,189,248,0.16)",
    digits: 1,
    farmRange: [20, 100],
    thresholds: [
      { from: 20, to: 40, label: "Dry", fill: "rgba(234,179,8,0.14)" },
      { from: 40, to: 50, label: "Low", fill: "rgba(59,130,246,0.10)" },
      { from: 50, to: 70, label: "Target", fill: "rgba(16,185,129,0.12)" },
      { from: 70, to: 80, label: "Humid", fill: "rgba(6,182,212,0.12)" },
      { from: 80, to: 100, label: "Disease risk", fill: "rgba(245,158,11,0.16)" },
    ],
  },
  pressureHpa: {
    label: "Pressure",
    short: "Pressure",
    unit: "hPa",
    color: "#a3e635",
    soft: "rgba(163,230,53,0.16)",
    digits: 1,
    farmRange: [970, 1040],
    thresholds: [
      { from: 970, to: 990, label: "Low pressure", fill: "rgba(59,130,246,0.12)" },
      { from: 990, to: 1025, label: "Normal", fill: "rgba(16,185,129,0.12)" },
      { from: 1025, to: 1040, label: "High pressure", fill: "rgba(234,179,8,0.12)" },
    ],
  },
  gasKohm: {
    label: "Gas Resistance",
    short: "Gas",
    unit: "kΩ",
    color: "#f59e0b",
    soft: "rgba(245,158,11,0.16)",
    digits: 1,
    farmRange: [0, 500],
    thresholds: [
      { from: 0, to: 50, label: "Low air quality", fill: "rgba(239,68,68,0.16)" },
      { from: 50, to: 100, label: "Watch", fill: "rgba(245,158,11,0.15)" },
      { from: 100, to: 300, label: "Normal", fill: "rgba(16,185,129,0.12)" },
      { from: 300, to: 500, label: "High resistance", fill: "rgba(59,130,246,0.10)" },
    ],
  },
};

const METRIC_KEYS = Object.keys(METRICS);

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function fmt(value, digits = 1) {
  const n = toNumber(value);
  return n === null ? "—" : n.toFixed(digits);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function mean(values) {
  const clean = values.map(toNumber).filter((v) => v !== null);
  if (!clean.length) return null;
  return clean.reduce((sum, v) => sum + v, 0) / clean.length;
}

function std(values) {
  const clean = values.map(toNumber).filter((v) => v !== null);
  if (clean.length < 2) return 0;

  const avg = mean(clean);
  const variance =
    clean.reduce((sum, v) => sum + (v - avg) ** 2, 0) / (clean.length - 1);

  return Math.sqrt(variance);
}

function compactTime(sec) {
  const s = Math.max(0, Math.round(toNumber(sec) ?? 0));

  if (s < 60) return `${s}s`;

  if (s < 3600) {
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${String(r).padStart(2, "0")}`;
  }

  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}h ${m}m`;
}

function stepLabel(step, timeMode) {
  const mode = TIME_MODES[timeMode];

  if (timeMode === "seconds") return `${step}s`;
  if (timeMode === "minutes") return `${step}m`;
  if (timeMode === "hours") return `${step}h`;

  return `${step}${mode.axisUnit}`;
}

function normalizeSeries(rawSeries = []) {
  const rows = rawSeries
    .map((item, index) => {
      const timestampMs = toNumber(
        item.timestampMs ??
          item.timestamp_ms ??
          item.timeMs ??
          item.tMs ??
          item.t_ms,
      );

      const rawTime =
        timestampMs ??
        toNumber(item.tSec ?? item.t_sec ?? item.t ?? item.time) ??
        index;

      return {
        index,
        timestampMs,
        rawTime,
        tempC: toNumber(item.tempC ?? item.temp_c ?? item.temperature),
        humidityPct: toNumber(item.humidityPct ?? item.humidity_pct ?? item.humidity),
        pressureHpa: toNumber(item.pressureHpa ?? item.pressure_hpa ?? item.pressure),
        gasKohm: toNumber(item.gasKohm ?? item.gas_kohm ?? item.gas),
      };
    })
    .filter((row) => METRIC_KEYS.some((key) => row[key] !== null));

  if (!rows.length) return [];

  const firstTimestamp = rows.find((row) => row.timestampMs !== null)?.timestampMs ?? null;
  const firstRawTime = rows[0].rawTime;

  return rows.map((row, index) => {
    let tSec;

    if (row.timestampMs !== null && firstTimestamp !== null) {
      tSec = (row.timestampMs - firstTimestamp) / 1000;
    } else {
      const rawLooksLikeMs = firstRawTime > 100000;
      tSec = rawLooksLikeMs
        ? (row.rawTime - firstRawTime) / 1000
        : row.rawTime - firstRawTime;
    }

    return {
      ...row,
      index,
      tSec: Math.max(0, tSec),
    };
  });
}

function aggregateByTime(series, timeMode) {
  const stepSec = TIME_MODES[timeMode].stepSec;

  if (!series.length) return [];

  const buckets = new Map();

  for (const row of series) {
    const step = Math.floor((row.tSec ?? 0) / stepSec);

    if (!buckets.has(step)) {
      buckets.set(step, {
        step,
        tSec: step * stepSec,
        sampleCount: 0,
        values: Object.fromEntries(METRIC_KEYS.map((key) => [key, []])),
      });
    }

    const bucket = buckets.get(step);
    bucket.sampleCount += 1;

    for (const key of METRIC_KEYS) {
      if (row[key] !== null) bucket.values[key].push(row[key]);
    }
  }

  const lastRealStep = Math.max(
    ...Array.from(buckets.keys()),
    0,
  );

  const finalStep = lastRealStep + FORECAST_STEPS;

  const output = [];

  for (let step = 0; step <= finalStep; step += 1) {
    const bucket = buckets.get(step);

    if (!bucket) {
      output.push({
        step,
        tSec: step * stepSec,
        sampleCount: 0,
        isEmpty: true,
        isPredictionArea: step > lastRealStep,
        ...Object.fromEntries(METRIC_KEYS.map((key) => [key, null])),
      });
      continue;
    }

    output.push({
      step,
      tSec: bucket.tSec,
      sampleCount: bucket.sampleCount,
      isEmpty: false,
      isPredictionArea: false,
      ...Object.fromEntries(
        METRIC_KEYS.map((key) => [key, mean(bucket.values[key])]),
      ),
    });
  }

  return output;
}

function metricStats(series, key) {
  const values = series.map((row) => row[key]).filter((v) => v !== null);
  const current = values.length ? values[values.length - 1] : null;
  const first = values.length ? values[0] : null;

  return {
    count: values.length,
    current,
    first,
    delta: current !== null && first !== null ? current - first : null,
    min: values.length ? Math.min(...values) : null,
    max: values.length ? Math.max(...values) : null,
    avg: mean(values),
    std: std(values),
  };
}

function linearForecast(aggregated, key, timeMode) {
  const stepSec = TIME_MODES[timeMode].stepSec;

  const points = aggregated
    .filter((row) => !row.isPredictionArea && row[key] !== null)
    .map((row) => ({
      x: row.step,
      y: row[key],
    }));

  if (!points.length) {
    return {
      current: null,
      predicted: null,
      delta: null,
      trend: "flat",
      confidence: 0,
      points: [],
    };
  }

  const last = points[points.length - 1];

  if (points.length < 2) {
    const flatPoints = Array.from({ length: FORECAST_STEPS }, (_, i) => ({
      step: last.x + i + 1,
      tSec: (last.x + i + 1) * stepSec,
      y: last.y,
      delta: 0,
    }));

    return {
      current: last.y,
      predicted: last.y,
      delta: 0,
      trend: "flat",
      confidence: 0,
      points: flatPoints,
    };
  }

  const recent = points.slice(-20);
  const mx = mean(recent.map((p) => p.x));
  const my = mean(recent.map((p) => p.y));

  let numerator = 0;
  let denominator = 0;

  for (const p of recent) {
    numerator += (p.x - mx) * (p.y - my);
    denominator += (p.x - mx) ** 2;
  }

  const slope = denominator === 0 ? 0 : numerator / denominator;
  const intercept = my - slope * mx;

  let sst = 0;
  let sse = 0;

  for (const p of recent) {
    const pred = intercept + slope * p.x;
    sst += (p.y - my) ** 2;
    sse += (p.y - pred) ** 2;
  }

  const confidence = sst === 0 ? 1 : clamp(1 - sse / sst, 0, 1);

  const future = Array.from({ length: FORECAST_STEPS }, (_, i) => {
    const step = last.x + i + 1;
    const y = intercept + slope * step;

    return {
      step,
      tSec: step * stepSec,
      y,
      delta: y - last.y,
    };
  });

  const final = future[future.length - 1];
  const delta = final.y - last.y;

  let trend = "flat";
  if (delta > 0.15) trend = "up";
  if (delta < -0.15) trend = "down";

  return {
    current: last.y,
    predicted: final.y,
    delta,
    trend,
    confidence,
    points: future,
  };
}

function trendArrow(trend) {
  if (trend === "up") return "↗";
  if (trend === "down") return "↘";
  return "→";
}

function trendText(trend) {
  if (trend === "up") return "Rising";
  if (trend === "down") return "Falling";
  return "Stable";
}

function getYDomain(metricKey, stats, forecast, aggregated, yAxisMode) {
  const meta = METRICS[metricKey];

  const actualValues = aggregated
    .filter((row) => !row.isPredictionArea && row[metricKey] !== null)
    .map((row) => row[metricKey]);

  const forecastValues = forecast.points.map((p) => p.y);

  let values = [
    ...actualValues,
    ...forecastValues,
    stats.current,
    stats.min,
    stats.max,
    stats.avg,
    forecast.predicted,
  ].filter((v) => Number.isFinite(Number(v)));

  if (yAxisMode === "farm") {
    values = [
      ...values,
      ...meta.farmRange,
      ...meta.thresholds.flatMap((t) => [t.from, t.to]),
    ];
  }

  if (!values.length) return [0, 1];

  let min = Math.min(...values);
  let max = Math.max(...values);

  if (min === max) {
    const pad = Math.max(Math.abs(min) * 0.05, 1);
    return [min - pad, max + pad];
  }

  const range = max - min;
  const padRatio = yAxisMode === "data" ? 0.18 : 0.06;

  return [min - range * padRatio, max + range * padRatio];
}

function chartWidth(pointCount, timeMode) {
  if (timeMode === "seconds") return Math.max(900, pointCount * 34);
  if (timeMode === "minutes") return Math.max(900, pointCount * 90);
  return Math.max(900, pointCount * 150);
}

function classifyCondition(row) {
  const t = row.tempC;
  const h = row.humidityPct;

  if (t === null || h === null) return "Missing";
  if (t >= 18 && t <= 26 && h >= 50 && h <= 70) return "Optimal";
  if (t > 35) return "Severe heat";
  if (t > 30) return "Heat";
  if (t < 10) return "Cold";
  if (h > 80) return "Disease risk";
  if (h < 40) return "Dry";
  return "Watch";
}

function conditionDistribution(series) {
  const colors = {
    Optimal: "#10b981",
    Watch: "#94a3b8",
    "Severe heat": "#ef4444",
    Heat: "#f97316",
    Cold: "#60a5fa",
    "Disease risk": "#f59e0b",
    Dry: "#eab308",
    Missing: "#475569",
  };

  const counts = {};

  for (const row of series) {
    const label = classifyCondition(row);
    counts[label] = (counts[label] ?? 0) + 1;
  }

  const total = Math.max(series.length, 1);

  return Object.entries(counts)
    .map(([label, count]) => ({
      label,
      count,
      pct: count / total,
      color: colors[label] ?? "#94a3b8",
    }))
    .sort((a, b) => b.count - a.count);
}

function correlation(xValues, yValues) {
  if (xValues.length !== yValues.length || xValues.length < 2) return null;

  const mx = mean(xValues);
  const my = mean(yValues);

  let numerator = 0;
  let xDen = 0;
  let yDen = 0;

  for (let i = 0; i < xValues.length; i += 1) {
    const dx = xValues[i] - mx;
    const dy = yValues[i] - my;

    numerator += dx * dy;
    xDen += dx * dx;
    yDen += dy * dy;
  }

  if (xDen === 0 || yDen === 0) return null;

  return numerator / Math.sqrt(xDen * yDen);
}

function correlationMatrix(series) {
  const matrix = {};

  for (const a of METRIC_KEYS) {
    matrix[a] = {};

    for (const b of METRIC_KEYS) {
      if (a === b) {
        matrix[a][b] = 1;
        continue;
      }

      const pairs = series
        .filter((row) => row[a] !== null && row[b] !== null)
        .map((row) => [row[a], row[b]]);

      matrix[a][b] = correlation(
        pairs.map((p) => p[0]),
        pairs.map((p) => p[1]),
      );
    }
  }

  return matrix;
}

function TinyStat({ label, value, tone = "text-white" }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/70 px-3 py-2">
      <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500">
        {label}
      </div>
      <div className={`mt-1 text-lg font-semibold ${tone}`}>{value}</div>
    </div>
  );
}

function ToggleGroup({ label, options, value, onChange, activeClass }) {
  return (
    <div>
      <div className="mb-1 text-[10px] uppercase tracking-[0.22em] text-slate-500">
        {label}
      </div>

      <div className="flex flex-wrap gap-2">
        {Object.entries(options).map(([key, option]) => (
          <button
            key={key}
            type="button"
            title={option.description}
            onClick={() => onChange(key)}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] transition ${
              value === key
                ? activeClass
                : "border-slate-700 bg-slate-950/50 text-slate-400 hover:border-slate-500 hover:text-slate-200"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function MetricCard({ metricKey, stats, forecast, active, onClick }) {
  const meta = METRICS[metricKey];

  return (
    <button
      type="button"
      onClick={() => onClick(metricKey)}
      className={`rounded-3xl border p-4 text-left transition ${
        active
          ? "border-slate-500 bg-slate-900 shadow-lg shadow-black/20"
          : "border-slate-800 bg-slate-900/60 hover:border-slate-600"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
            {meta.label}
          </div>

          <div className="mt-2 flex items-end gap-2">
            <div className="text-3xl font-semibold text-white">
              {fmt(stats.current, meta.digits)}
            </div>
            <div className="pb-1 text-sm text-slate-400">{meta.unit}</div>
          </div>
        </div>

        <div
          className="rounded-full px-2.5 py-1 text-sm font-semibold"
          style={{ color: meta.color, backgroundColor: meta.soft }}
        >
          {trendArrow(forecast.trend)} {fmt(forecast.predicted, meta.digits)}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 text-xs text-slate-400">
        <div>min {fmt(stats.min, meta.digits)}</div>
        <div>avg {fmt(stats.avg, meta.digits)}</div>
        <div>max {fmt(stats.max, meta.digits)}</div>
      </div>
    </button>
  );
}

function MainChart({
  aggregated,
  rawSeries,
  metricKey,
  stats,
  forecast,
  timeMode,
  setTimeMode,
  yAxisMode,
  setYAxisMode,
}) {
  const chartRef = useRef(null);
  const [hover, setHover] = useState(null);

  const meta = METRICS[metricKey];
  const time = TIME_MODES[timeMode];

  const actualPoints = aggregated
    .filter((row) => !row.isPredictionArea && !row.isEmpty && row[metricKey] !== null)
    .map((row) => ({
      step: row.step,
      tSec: row.tSec,
      y: row[metricKey],
      sampleCount: row.sampleCount,
      prediction: false,
    }));

  const predictionPoints = forecast.points.map((p) => ({
    step: p.step,
    tSec: p.tSec,
    y: p.y,
    sampleCount: 0,
    prediction: true,
  }));

  const allHoverPoints = [...actualPoints, ...predictionPoints];

  const lastActual = actualPoints[actualPoints.length - 1] ?? null;
  const maxStep = Math.max(
    aggregated[aggregated.length - 1]?.step ?? 0,
    predictionPoints[predictionPoints.length - 1]?.step ?? 0,
    FORECAST_STEPS,
  );

  const width = chartWidth(maxStep + 1, timeMode);
  const height = 430;

  const padL = 70;
  const padR = 55;
  const padT = 34;
  const padB = 64;

  const [yMin, yMax] = getYDomain(metricKey, stats, forecast, aggregated, yAxisMode);
  const yRange = yMax - yMin || 1;
  const xRange = maxStep || 1;

  const sx = (step) => padL + (step / xRange) * (width - padL - padR);
  const sy = (value) =>
    height - padB - ((value - yMin) / yRange) * (height - padT - padB);

  const actualPolyline = actualPoints.map((p) => `${sx(p.step)},${sy(p.y)}`).join(" ");

  const predictionPolyline =
    lastActual && predictionPoints.length
      ? [
          `${sx(lastActual.step)},${sy(lastActual.y)}`,
          ...predictionPoints.map((p) => `${sx(p.step)},${sy(p.y)}`),
        ].join(" ")
      : "";

  const avgY = stats.avg !== null ? sy(stats.avg) : null;

  const minPoint = actualPoints.reduce(
    (best, p) => (best === null || p.y < best.y ? p : best),
    null,
  );

  const maxPoint = actualPoints.reduce(
    (best, p) => (best === null || p.y > best.y ? p : best),
    null,
  );

  function onMouseMove(event) {
    const rect = chartRef.current?.getBoundingClientRect();
    if (!rect || !allHoverPoints.length) return;

    const mouseX = ((event.clientX - rect.left) / rect.width) * width;

    let nearest = allHoverPoints[0];
    let bestDist = Math.abs(sx(nearest.step) - mouseX);

    for (const point of allHoverPoints) {
      const dist = Math.abs(sx(point.step) - mouseX);
      if (dist < bestDist) {
        nearest = point;
        bestDist = dist;
      }
    }

    setHover(nearest);
  }

  const tickEvery =
    timeMode === "seconds" && maxStep > 30
      ? 10
      : timeMode === "seconds"
        ? 5
        : 1;

  const ticks = Array.from({ length: maxStep + 1 }, (_, step) => step).filter(
    (step) => step % tickEvery === 0 || step === maxStep,
  );

  const tooltipX = hover ? clamp(sx(hover.step) + 14, padL + 8, width - 250) : 0;
  const tooltipY = hover ? clamp(sy(hover.y) - 72, padT + 8, height - padB - 112) : 0;

  return (
    <section className="rounded-[2rem] border border-slate-800 bg-slate-900/65 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-[11px] uppercase tracking-[0.28em] text-slate-500">
            Main graph · {time.bucketText}
          </div>

          <h2 className="mt-2 text-2xl font-semibold text-white">{meta.label}</h2>

          <p className="mt-2 max-w-3xl text-sm text-slate-400">
            Prediction: {trendText(forecast.trend).toLowerCase()} from{" "}
            <span className="text-slate-200">{fmt(forecast.current, meta.digits)}</span>{" "}
            to{" "}
            <span className="text-slate-200">{fmt(forecast.predicted, meta.digits)}</span>{" "}
            {meta.unit} after {FORECAST_STEPS}
            {time.axisUnit}. Fit: {(forecast.confidence * 100).toFixed(0)}%.
          </p>
        </div>

        <div className="space-y-3">
          <ToggleGroup
            label="Time scale"
            options={TIME_MODES}
            value={timeMode}
            onChange={setTimeMode}
            activeClass="border-emerald-400/50 bg-emerald-400/10 text-emerald-200"
          />

          <ToggleGroup
            label="Y-axis range"
            options={Y_AXIS_MODES}
            value={yAxisMode}
            onChange={setYAxisMode}
            activeClass="border-sky-400/50 bg-sky-400/10 text-sky-200"
          />
        </div>
      </div>

      <div className="mt-5 grid gap-2 sm:grid-cols-5">
        <TinyStat label="Min" value={`${fmt(stats.min, meta.digits)} ${meta.unit}`} />
        <TinyStat label="Avg" value={`${fmt(stats.avg, meta.digits)} ${meta.unit}`} />
        <TinyStat label="Max" value={`${fmt(stats.max, meta.digits)} ${meta.unit}`} />
        <TinyStat label="Now" value={`${fmt(stats.current, meta.digits)} ${meta.unit}`} />
        <TinyStat
          label={`+${FORECAST_STEPS}${time.axisUnit}`}
          value={`${fmt(forecast.predicted, meta.digits)} ${meta.unit}`}
          tone={
            forecast.trend === "up"
              ? "text-rose-300"
              : forecast.trend === "down"
                ? "text-sky-300"
                : "text-white"
          }
        />
      </div>

      <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-3 text-xs text-slate-400">
        Raw run duration: <span className="text-slate-200">{compactTime(rawSeries.at(-1)?.tSec ?? 0)}</span>.
        Each point is a {time.bucketText.replace(" averages", "")} average. Y-axis mode:{" "}
        <span className="text-slate-200">{Y_AXIS_MODES[yAxisMode].label}</span>.
      </div>

      <div className="mt-5 overflow-x-auto overflow-y-hidden rounded-[1.5rem] border border-slate-800 bg-slate-950/85">
        <svg
          ref={chartRef}
          viewBox={`0 0 ${width} ${height}`}
          style={{ minWidth: `${width}px` }}
          className="h-[430px] cursor-crosshair select-none"
          onMouseMove={onMouseMove}
          onMouseLeave={() => setHover(null)}
        >
          <rect x="0" y="0" width={width} height={height} fill="rgba(2,6,23,0.92)" />

          {meta.thresholds.map((zone) => {
            const top = clamp(zone.to, yMin, yMax);
            const bottom = clamp(zone.from, yMin, yMax);

            if (top <= yMin || bottom >= yMax) return null;

            return (
              <g key={`${zone.label}-${zone.from}-${zone.to}`}>
                <rect
                  x={padL}
                  y={sy(top)}
                  width={width - padL - padR}
                  height={Math.max(0, sy(bottom) - sy(top))}
                  fill={zone.fill}
                />

                <text
                  x={padL + 10}
                  y={clamp(sy(top) + 16, padT + 12, height - padB - 8)}
                  fontSize="11"
                  fill="rgba(226,232,240,0.45)"
                >
                  {zone.label}
                </text>
              </g>
            );
          })}

          {[0.2, 0.4, 0.6, 0.8].map((ratio) => {
            const y = padT + ratio * (height - padT - padB);

            return (
              <line
                key={ratio}
                x1={padL}
                y1={y}
                x2={width - padR}
                y2={y}
                stroke="rgba(148,163,184,0.13)"
              />
            );
          })}

          {ticks.map((step) => (
            <g key={step}>
              <line
                x1={sx(step)}
                y1={padT}
                x2={sx(step)}
                y2={height - padB}
                stroke="rgba(148,163,184,0.08)"
              />

              <text
                x={sx(step)}
                y={height - 24}
                textAnchor="middle"
                fontSize="12"
                fill="rgba(148,163,184,0.75)"
              >
                {stepLabel(step, timeMode)}
              </text>
            </g>
          ))}

          <line
            x1={padL}
            y1={padT}
            x2={padL}
            y2={height - padB}
            stroke="rgba(148,163,184,0.22)"
          />

          <line
            x1={padL}
            y1={height - padB}
            x2={width - padR}
            y2={height - padB}
            stroke="rgba(148,163,184,0.22)"
          />

          {avgY !== null && (
            <>
              <line
                x1={padL}
                y1={avgY}
                x2={width - padR}
                y2={avgY}
                stroke="rgba(226,232,240,0.35)"
                strokeDasharray="6 6"
              />

              <text
                x={width - padR - 8}
                y={avgY - 8}
                textAnchor="end"
                fontSize="12"
                fill="rgba(226,232,240,0.75)"
              >
                avg {fmt(stats.avg, meta.digits)} {meta.unit}
              </text>
            </>
          )}

          {actualPoints.length > 1 && (
            <polyline
              fill="none"
              stroke={meta.color}
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              points={actualPolyline}
            />
          )}

          {actualPoints.map((p) => (
            <circle
              key={`actual-${p.step}`}
              cx={sx(p.step)}
              cy={sy(p.y)}
              r="4"
              fill={meta.color}
            />
          ))}

          {lastActual && predictionPoints.length > 0 && (
            <>
              <rect
                x={sx(lastActual.step)}
                y={padT}
                width={Math.max(0, sx(maxStep) - sx(lastActual.step))}
                height={height - padT - padB}
                fill={meta.soft}
              />

              <polyline
                fill="none"
                stroke={meta.color}
                strokeWidth="2.5"
                strokeDasharray="7 6"
                strokeLinecap="round"
                strokeLinejoin="round"
                points={predictionPolyline}
              />

              <text x={sx(lastActual.step) + 12} y={padT + 22} fontSize="12" fill={meta.color}>
                prediction overlay: next {FORECAST_STEPS} {time.axisUnit}-steps
              </text>

              <text
                x={sx(lastActual.step) + 12}
                y={padT + 42}
                fontSize="12"
                fill="rgba(226,232,240,0.78)"
              >
                {trendText(forecast.trend)} · Δ {fmt(forecast.delta, meta.digits)} {meta.unit}
              </text>

              {predictionPoints.map((p, index) => (
                <g key={`pred-${p.step}`}>
                  <rect
                    x={sx(p.step) - 4}
                    y={sy(p.y) - 4}
                    width="8"
                    height="8"
                    transform={`rotate(45 ${sx(p.step)} ${sy(p.y)})`}
                    fill={meta.color}
                  />

                  <text
                    x={sx(p.step)}
                    y={clamp(sy(p.y) - 12, padT + 12, height - padB - 10)}
                    textAnchor="middle"
                    fontSize="11"
                    fill={meta.color}
                  >
                    +{index + 1}
                    {time.axisUnit}
                  </text>
                </g>
              ))}
            </>
          )}

          {minPoint && (
            <>
              <circle cx={sx(minPoint.step)} cy={sy(minPoint.y)} r="5" fill="#ffffff" />

              <text
                x={clamp(sx(minPoint.step) + 8, padL + 8, width - 120)}
                y={clamp(sy(minPoint.y) + 18, padT + 16, height - padB - 10)}
                fontSize="12"
                fill="rgba(226,232,240,0.9)"
              >
                min {fmt(minPoint.y, meta.digits)}
              </text>
            </>
          )}

          {maxPoint && (
            <>
              <circle cx={sx(maxPoint.step)} cy={sy(maxPoint.y)} r="5" fill="#ffffff" />

              <text
                x={clamp(sx(maxPoint.step) + 8, padL + 8, width - 120)}
                y={clamp(sy(maxPoint.y) - 12, padT + 12, height - padB - 10)}
                fontSize="12"
                fill="rgba(226,232,240,0.9)"
              >
                max {fmt(maxPoint.y, meta.digits)}
              </text>
            </>
          )}

          {lastActual && (
            <>
              <circle cx={sx(lastActual.step)} cy={sy(lastActual.y)} r="5.5" fill="#ffffff" />

              <text
                x={clamp(sx(lastActual.step) - 8, padL + 80, width - 12)}
                y={clamp(sy(lastActual.y) - 12, padT + 12, height - padB - 10)}
                textAnchor="end"
                fontSize="12"
                fill="#ffffff"
              >
                now {fmt(lastActual.y, meta.digits)}
              </text>
            </>
          )}

          {hover && (
            <>
              <line
                x1={sx(hover.step)}
                y1={padT}
                x2={sx(hover.step)}
                y2={height - padB}
                stroke="rgba(226,232,240,0.45)"
                strokeDasharray="4 5"
              />

              <circle
                cx={sx(hover.step)}
                cy={sy(hover.y)}
                r="6"
                fill="rgba(15,23,42,1)"
                stroke={hover.prediction ? "#ffffff" : meta.color}
                strokeWidth="3"
              />

              <g>
                <rect
                  x={tooltipX}
                  y={tooltipY}
                  width="236"
                  height="104"
                  rx="16"
                  fill="rgba(15,23,42,0.97)"
                  stroke="rgba(148,163,184,0.28)"
                />

                <text
                  x={tooltipX + 14}
                  y={tooltipY + 23}
                  fontSize="12"
                  fill="rgba(148,163,184,1)"
                >
                  {hover.prediction
                    ? `prediction: +${hover.step - lastActual.step}${time.axisUnit}`
                    : `bucket: ${stepLabel(hover.step, timeMode)}`}
                </text>

                <text
                  x={tooltipX + 14}
                  y={tooltipY + 45}
                  fontSize="11"
                  fill="rgba(148,163,184,0.78)"
                >
                  {hover.prediction
                    ? `projected after ${compactTime(hover.tSec)}`
                    : `${hover.sampleCount} sample${hover.sampleCount === 1 ? "" : "s"} averaged`}
                </text>

                <text
                  x={tooltipX + 14}
                  y={tooltipY + 74}
                  fontSize="22"
                  fontWeight="700"
                  fill="#ffffff"
                >
                  {fmt(hover.y, meta.digits)} {meta.unit}
                </text>

                <text
                  x={tooltipX + 14}
                  y={tooltipY + 95}
                  fontSize="12"
                  fill={hover.prediction ? "#ffffff" : meta.color}
                >
                  {hover.prediction ? "Predicted value" : "Observed value"}
                </text>
              </g>
            </>
          )}

          <text x="12" y={padT + 4} fontSize="12" fill="rgba(148,163,184,0.8)">
            {fmt(yMax, meta.digits)}
          </text>

          <text
            x="12"
            y={height - padB + 4}
            fontSize="12"
            fill="rgba(148,163,184,0.8)"
          >
            {fmt(yMin, meta.digits)}
          </text>
        </svg>
      </div>
    </section>
  );
}

function ForecastPanel({ forecasts, timeMode }) {
  const time = TIME_MODES[timeMode];

  return (
    <section className="rounded-[2rem] border border-slate-800 bg-slate-900/65 p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-white">Short-Term Projection</h2>

        <div className="rounded-full border border-slate-700 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
          next {FORECAST_STEPS}
          {time.axisUnit}
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {METRIC_KEYS.map((key) => {
          const meta = METRICS[key];
          const forecast = forecasts[key];

          return (
            <div
              key={key}
              className="rounded-3xl border border-slate-800 bg-slate-950/70 p-4"
            >
              <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">
                {meta.label}
              </div>

              <div className="mt-2 text-3xl font-semibold" style={{ color: meta.color }}>
                {trendArrow(forecast.trend)} {fmt(forecast.predicted, meta.digits)}
              </div>

              <div className="mt-1 text-sm text-slate-400">{meta.unit}</div>

              <div className="mt-3 text-xs leading-5 text-slate-500">
                {trendText(forecast.trend)} from {fmt(forecast.current, meta.digits)} to{" "}
                {fmt(forecast.predicted, meta.digits)} {meta.unit}. Δ{" "}
                {fmt(forecast.delta, meta.digits)} {meta.unit}. Fit{" "}
                {(forecast.confidence * 100).toFixed(0)}%.
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ConditionsPanel({ zones, stabilityScore }) {
  return (
    <section className="rounded-[2rem] border border-slate-800 bg-slate-900/65 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold text-white">Observed Conditions</h2>

          <div className="mt-4 h-4 w-full overflow-hidden rounded-full bg-slate-950">
            <div className="flex h-full w-full">
              {zones.map((zone) => (
                <div
                  key={zone.label}
                  style={{
                    width: `${zone.pct * 100}%`,
                    backgroundColor: zone.color,
                  }}
                  title={`${zone.label}: ${(zone.pct * 100).toFixed(1)}%`}
                />
              ))}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {zones.map((zone) => (
              <div
                key={zone.label}
                className="rounded-full border border-slate-800 bg-slate-950/70 px-3 py-1.5 text-sm text-slate-200"
              >
                <span
                  className="mr-2 inline-block h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: zone.color }}
                />
                {zone.label} {(zone.pct * 100).toFixed(1)}%
              </div>
            ))}
          </div>
        </div>

        <TinyStat
          label="Stability"
          value={`${stabilityScore.toFixed(0)}/100`}
          tone={
            stabilityScore >= 75
              ? "text-emerald-300"
              : stabilityScore >= 50
                ? "text-amber-300"
                : "text-rose-300"
          }
        />
      </div>
    </section>
  );
}

function CorrelationPanel({ matrix }) {
  function cellStyle(value) {
    const v = toNumber(value);

    if (v === null) {
      return {
        backgroundColor: "rgba(51,65,85,0.4)",
        color: "#e2e8f0",
      };
    }

    if (v >= 0) {
      return {
        backgroundColor: `rgba(16,185,129,${0.12 + Math.abs(v) * 0.38})`,
        color: "#d1fae5",
      };
    }

    return {
      backgroundColor: `rgba(239,68,68,${0.12 + Math.abs(v) * 0.38})`,
      color: "#fecaca",
    };
  }

  return (
    <section className="rounded-[2rem] border border-slate-800 bg-slate-900/65 p-5">
      <h2 className="text-lg font-semibold text-white">Correlations</h2>

      <div className="mt-4 overflow-auto">
        <div
          className="grid gap-2"
          style={{
            gridTemplateColumns: `120px repeat(${METRIC_KEYS.length}, minmax(92px, 1fr))`,
          }}
        >
          <div />

          {METRIC_KEYS.map((key) => (
            <div
              key={key}
              className="px-2 text-center text-xs font-semibold uppercase tracking-[0.18em] text-slate-500"
            >
              {METRICS[key].short}
            </div>
          ))}

          {METRIC_KEYS.map((row) => (
            <div key={row} className="contents">
              <div className="flex items-center px-2 text-sm font-semibold text-slate-300">
                {METRICS[row].short}
              </div>

              {METRIC_KEYS.map((col) => (
                <div
                  key={`${row}-${col}`}
                  className="rounded-2xl border border-slate-800 px-2 py-4 text-center text-sm font-semibold"
                  style={cellStyle(matrix[row]?.[col])}
                >
                  {fmt(matrix[row]?.[col], 2)}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default function DataAnalysisPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [activeMetric, setActiveMetric] = useState("tempC");
  const [timeMode, setTimeMode] = useState("seconds");
  const [yAxisMode, setYAxisMode] = useState("farm");

  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        const payload = await fetchEnvAnalysis();

        if (!alive) return;

        setData(payload);
        setError(null);
      } catch (err) {
        if (!alive) return;
        setError(err?.message || "Failed to load analysis data.");
      }
    }

    load();

    return () => {
      alive = false;
    };
  }, []);

  const analysis = useMemo(() => {
    if (!data) return null;

    const rawSeries = normalizeSeries(data.series ?? []);
    const aggregated = aggregateByTime(rawSeries, timeMode);

    const rawStats = Object.fromEntries(
      METRIC_KEYS.map((key) => [key, metricStats(rawSeries, key)]),
    );

    const aggregatedStats = Object.fromEntries(
      METRIC_KEYS.map((key) => [key, metricStats(aggregated, key)]),
    );

    const forecasts = Object.fromEntries(
      METRIC_KEYS.map((key) => [key, linearForecast(aggregated, key, timeMode)]),
    );

    const zones = conditionDistribution(rawSeries);
    const matrix = correlationMatrix(rawSeries);

    const envValidity =
      toNumber(data.validity?.envPct) ??
      (toNumber(data.sampleCount) && toNumber(data.totalEntries)
        ? data.sampleCount / data.totalEntries
        : 0);

    const tempStd = rawStats.tempC.std ?? 0;
    const humidityStd = rawStats.humidityPct.std ?? 0;
    const gasAvg = rawStats.gasKohm.avg ?? 0;
    const gasStd = rawStats.gasKohm.std ?? 0;

    const gasCv = gasAvg !== 0 ? Math.abs(gasStd / gasAvg) * 100 : 0;

    const stabilityScore = clamp(
      100 -
        clamp(tempStd * 6, 0, 28) -
        clamp(humidityStd * 1.2, 0, 28) -
        clamp(gasCv, 0, 24) -
        clamp((1 - envValidity) * 100, 0, 30),
      0,
      100,
    );

    return {
      rawSeries,
      aggregated,
      rawStats,
      aggregatedStats,
      forecasts,
      zones,
      matrix,
      envValidity,
      stabilityScore,
      sampleCount: toNumber(data.sampleCount) ?? rawSeries.length,
      totalEntries: toNumber(data.totalEntries) ?? rawSeries.length,
      validity: data.validity ?? {},
    };
  }, [data, timeMode]);

  return (
    <main className="space-y-6">
      <section className="overflow-hidden rounded-[2rem] border border-slate-800 bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.18),_transparent_24%),radial-gradient(circle_at_top_right,_rgba(16,185,129,0.16),_transparent_24%),linear-gradient(180deg,rgba(2,6,23,0.98),rgba(15,23,42,0.92))] p-6 shadow-[0_28px_90px_rgba(2,6,23,0.55)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.34em] text-emerald-300">
              Data Analysis
            </div>

            <h1 className="mt-3 text-4xl font-semibold tracking-tight text-white">
              M5Stick Ecological Analysis
            </h1>

            <div className="mt-3 flex flex-wrap gap-2">
              <div className="rounded-full border border-slate-700 bg-slate-950/60 px-3 py-1.5 text-sm text-slate-200">
                {analysis ? `${analysis.sampleCount} ENV samples` : "Loading"}
              </div>

              <div className="rounded-full border border-slate-700 bg-slate-950/60 px-3 py-1.5 text-sm text-slate-200">
                {analysis ? compactTime(analysis.rawSeries.at(-1)?.tSec ?? 0) : "—"} raw run
              </div>

              <div className="rounded-full border border-slate-700 bg-slate-950/60 px-3 py-1.5 text-sm text-slate-200">
                {TIME_MODES[timeMode].bucketText}
              </div>

              <div className="rounded-full border border-slate-700 bg-slate-950/60 px-3 py-1.5 text-sm text-slate-200">
                {Y_AXIS_MODES[yAxisMode].label}
              </div>
            </div>
          </div>

          {analysis && (
            <div className="grid grid-cols-2 gap-3">
              <TinyStat
                label="ENV valid"
                value={`${(analysis.envValidity * 100).toFixed(1)}%`}
                tone={
                  analysis.envValidity >= 0.9
                    ? "text-emerald-300"
                    : analysis.envValidity >= 0.7
                      ? "text-amber-300"
                      : "text-rose-300"
                }
              />

              <TinyStat
                label="Projection"
                value={`+${FORECAST_STEPS}${TIME_MODES[timeMode].axisUnit}`}
                tone="text-sky-300"
              />
            </div>
          )}
        </div>
      </section>

      {error && (
        <section className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {error}
        </section>
      )}

      {!analysis ? (
        <section className="rounded-3xl border border-slate-800 bg-slate-900/65 p-8 text-sm text-slate-300">
          Loading analysis...
        </section>
      ) : (
        <>
          <section className="grid gap-4 xl:grid-cols-4">
            {METRIC_KEYS.map((key) => (
              <MetricCard
                key={key}
                metricKey={key}
                stats={analysis.rawStats[key]}
                forecast={analysis.forecasts[key]}
                active={activeMetric === key}
                onClick={setActiveMetric}
              />
            ))}
          </section>

          <MainChart
            aggregated={analysis.aggregated}
            rawSeries={analysis.rawSeries}
            metricKey={activeMetric}
            stats={analysis.aggregatedStats[activeMetric]}
            forecast={analysis.forecasts[activeMetric]}
            timeMode={timeMode}
            setTimeMode={setTimeMode}
            yAxisMode={yAxisMode}
            setYAxisMode={setYAxisMode}
          />

          <ForecastPanel forecasts={analysis.forecasts} timeMode={timeMode} />

          <section className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
            <ConditionsPanel
              zones={analysis.zones}
              stabilityScore={analysis.stabilityScore}
            />

            <CorrelationPanel matrix={analysis.matrix} />
          </section>
        </>
      )}
    </main>
  );
}