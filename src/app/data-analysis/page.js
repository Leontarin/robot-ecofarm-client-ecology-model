"use client";

import { useEffect, useState } from "react";
import { fetchEnvAnalysis } from "@/lib/api";

function SummaryCard({ title, value, hint }) {
  return (
    <div className="rounded-3xl border border-slate-800 bg-slate-900/65 p-5">
      <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
        {title}
      </div>
      <div className="mt-3 text-3xl font-semibold text-white">{value}</div>
      <div className="mt-2 text-sm text-slate-400">{hint}</div>
    </div>
  );
}

function MetricStats({ label, stats, unit }) {
  return (
    <div className="rounded-3xl border border-slate-800 bg-slate-900/65 p-5">
      <div className="text-lg font-semibold text-white">{label}</div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-3">
          <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500">
            Min
          </div>
          <div className="mt-2 text-xl font-semibold text-white">
            {stats.min?.toFixed(2)} {unit}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-3">
          <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500">
            Avg
          </div>
          <div className="mt-2 text-xl font-semibold text-white">
            {stats.avg?.toFixed(2)} {unit}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-3">
          <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500">
            Max
          </div>
          <div className="mt-2 text-xl font-semibold text-white">
            {stats.max?.toFixed(2)} {unit}
          </div>
        </div>
      </div>
    </div>
  );
}

function TrendChart({ title, color, data, dataKey, unit }) {
  if (!data.length) return null;

  const width = 640;
  const height = 180;
  const padding = 16;
  const values = data.map((item) => item[dataKey]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const points = data
    .map((item, index) => {
      const x =
        padding + (index / Math.max(data.length - 1, 1)) * (width - padding * 2);
      const y =
        height -
        padding -
        ((item[dataKey] - min) / range) * (height - padding * 2);
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <div className="rounded-3xl border border-slate-800 bg-slate-900/65 p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="text-lg font-semibold text-white">{title}</div>
        <div className="text-sm text-slate-400">
          {min.toFixed(2)} to {max.toFixed(2)} {unit}
        </div>
      </div>

      <svg viewBox={`0 0 ${width} ${height}`} className="mt-4 w-full">
        <rect
          x="0"
          y="0"
          width={width}
          height={height}
          rx="24"
          fill="rgba(2,6,23,0.7)"
        />
        <polyline
          fill="none"
          stroke={color}
          strokeWidth="3"
          points={points}
        />
      </svg>
    </div>
  );
}

function CorrelationCard({ label, value }) {
  const tone =
    Math.abs(value) > 0.9
      ? "text-emerald-300"
      : Math.abs(value) > 0.7
        ? "text-cyan-300"
        : Math.abs(value) > 0.4
          ? "text-amber-300"
          : "text-slate-300";

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
      <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">
        {label}
      </div>
      <div className={`mt-2 text-2xl font-semibold ${tone}`}>
        {value.toFixed(4)}
      </div>
    </div>
  );
}

export default function DataAnalysisPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

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
        setError(err?.message || "Failed to load analysis");
      }
    }

    load();

    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[2rem] border border-slate-800 bg-[radial-gradient(circle_at_top_left,_rgba(245,158,11,0.18),_transparent_28%),radial-gradient(circle_at_top_right,_rgba(34,197,94,0.16),_transparent_24%),linear-gradient(180deg,rgba(2,6,23,0.96),rgba(15,23,42,0.88))] p-6 shadow-[0_28px_90px_rgba(2,6,23,0.55)]">
        <div className="max-w-4xl">
          <div className="text-[11px] font-semibold uppercase tracking-[0.34em] text-amber-300">
            Data Analysis
          </div>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-white">
            ENV correlation prep from the robot debug log
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
            This page is prepared for statistical analysis on the M5Stick ENV
            telemetry stream. It summarizes valid samples, shows trend lines,
            and surfaces correlation coefficients between temperature, humidity,
            pressure, and gas resistance.
          </p>
        </div>
      </section>

      {error && (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {error}
        </div>
      )}

      {!data ? (
        <div className="rounded-3xl border border-slate-800 bg-slate-900/65 p-8 text-sm text-slate-300">
          Loading ENV analysis...
        </div>
      ) : (
        <>
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <SummaryCard
              title="Valid ENV Samples"
              value={String(data.sampleCount)}
              hint={`out of ${data.totalEntries} debug entries`}
            />
            <SummaryCard
              title="ENV Validity"
              value={`${(data.validity.envPct * 100).toFixed(1)}%`}
              hint="how often ENV data was valid in the log"
            />
            <SummaryCard
              title="LiDAR Validity"
              value={`${(data.validity.lidarPct * 100).toFixed(1)}%`}
              hint="useful when checking environment vs navigation stability"
            />
            <SummaryCard
              title="Detection Validity"
              value={`${(data.validity.detectionsPct * 100).toFixed(1)}%`}
              hint="useful when checking climate vs perception availability"
            />
          </section>

          <section className="grid gap-4 xl:grid-cols-2">
            <MetricStats
              label="Temperature"
              stats={data.summary.temperature}
              unit="deg C"
            />
            <MetricStats
              label="Humidity"
              stats={data.summary.humidity}
              unit="%"
            />
            <MetricStats
              label="Pressure"
              stats={data.summary.pressure}
              unit="hPa"
            />
            <MetricStats
              label="Gas Resistance"
              stats={data.summary.gas}
              unit="kOhm"
            />
          </section>

          <section className="rounded-3xl border border-slate-800 bg-slate-900/65 p-5">
            <div className="text-lg font-semibold text-white">Correlation Matrix</div>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <CorrelationCard
                label="Temp vs Humidity"
                value={data.correlations.tempHumidity}
              />
              <CorrelationCard
                label="Temp vs Pressure"
                value={data.correlations.tempPressure}
              />
              <CorrelationCard
                label="Temp vs Gas"
                value={data.correlations.tempGas}
              />
              <CorrelationCard
                label="Humidity vs Pressure"
                value={data.correlations.humidityPressure}
              />
              <CorrelationCard
                label="Humidity vs Gas"
                value={data.correlations.humidityGas}
              />
              <CorrelationCard
                label="Pressure vs Gas"
                value={data.correlations.pressureGas}
              />
            </div>
          </section>

          <section className="rounded-3xl border border-slate-800 bg-slate-900/65 p-5">
            <div className="text-lg font-semibold text-white">Auto Findings</div>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {data.findings.map((finding) => (
                <div
                  key={finding.pair}
                  className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4"
                >
                  <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">
                    {finding.pair}
                  </div>
                  <div className="mt-2 text-xl font-semibold text-white">
                    {finding.correlation.toFixed(4)}
                  </div>
                  <div className="mt-2 text-sm text-slate-400">
                    {finding.strength} relationship
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="grid gap-4 xl:grid-cols-2">
            <TrendChart
              title="Temperature Trend"
              color="#fb7185"
              data={data.series}
              dataKey="tempC"
              unit="deg C"
            />
            <TrendChart
              title="Humidity Trend"
              color="#38bdf8"
              data={data.series}
              dataKey="humidityPct"
              unit="%"
            />
            <TrendChart
              title="Pressure Trend"
              color="#a3e635"
              data={data.series}
              dataKey="pressureHpa"
              unit="hPa"
            />
            <TrendChart
              title="Gas Resistance Trend"
              color="#f59e0b"
              data={data.series}
              dataKey="gasKohm"
              unit="kOhm"
            />
          </section>
        </>
      )}
    </div>
  );
}
