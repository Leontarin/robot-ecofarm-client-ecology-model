"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { TIME_SCALE_OPTIONS } from "../lib/sessionTimeline";

function scaleLabel(scale) {
  return TIME_SCALE_OPTIONS[scale]?.label ?? scale;
}

function compactClockLabel(bucket) {
  return bucket?.label ?? "—";
}

function maturityPercentages(bucket) {
  const groups = bucket?.maturityGroups ?? {
    green: 0,
    turning: 0,
    ripe: 0,
    total: 0,
  };
  const total = Math.max(Number(groups.total) || 0, 1);

  return {
    green: ((Number(groups.green) || 0) / total) * 100,
    turning: ((Number(groups.turning) || 0) / total) * 100,
    ripe: ((Number(groups.ripe) || 0) / total) * 100,
  };
}

function Metric({ label, value, detail }) {
  return (
    <div className="rounded-2xl border border-slate-700/80 bg-slate-950/75 px-3 py-2.5">
      <div className="text-[9px] font-semibold uppercase tracking-[0.2em] text-slate-500">
        {label}
      </div>
      <div className="mt-1 text-base font-semibold leading-none text-white">
        {value}
      </div>
      {detail ? (
        <div className="mt-1 text-[10px] text-slate-500">{detail}</div>
      ) : null}
    </div>
  );
}

function ControlButton({ children, onClick, active = false, title }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`rounded-xl border px-3 py-2 text-xs font-semibold transition ${
        active
          ? "border-cyan-300/70 bg-cyan-300 text-slate-950"
          : "border-slate-700 bg-slate-900 text-slate-200 hover:border-cyan-300 hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}

function LegendItem({ color, label }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
      <span
        className="h-2.5 w-2.5 rounded-sm"
        style={{ backgroundColor: color }}
      />
      {label}
    </span>
  );
}

function MaturityTimelineChart({ buckets, selectedIndex, onSelect }) {
  const scrollRef = useRef(null);
  const width = Math.max(760, buckets.length * 36);
  const height = 194;
  const top = 18;
  const bottom = 40;
  const usableHeight = height - top - bottom;
  const columnWidth = width / Math.max(buckets.length, 1);
  const selected = Math.max(
    0,
    Math.min(selectedIndex, Math.max(buckets.length - 1, 0)),
  );

  useEffect(() => {
    const container = scrollRef.current;
    if (!container || !buckets.length) return;

    const selectedX = selected * columnWidth + columnWidth / 2;
    const target = Math.max(
      0,
      selectedX - container.clientWidth / 2,
    );

    container.scrollTo({ left: target, behavior: "smooth" });
  }, [buckets.length, columnWidth, selected]);

  function y(percent) {
    return top + ((100 - percent) / 100) * usableHeight;
  }

  function selectAtClientX(event) {
    const rect = event.currentTarget.getBoundingClientRect();
    const svgX =
      ((event.clientX - rect.left) / Math.max(rect.width, 1)) * width;
    const index = Math.floor(svgX / columnWidth);
    onSelect(Math.max(0, Math.min(buckets.length - 1, index)));
  }

  return (
    <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/75">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-3 py-2.5">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-200">
            Cumulative tomato maturity composition
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            Click a colored column to jump to that timeline step.
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <LegendItem color="#22c55e" label="Green" />
          <LegendItem color="#f59e0b" label="Turning" />
          <LegendItem color="#dc2626" label="Ripe" />
        </div>
      </div>

      <div
        ref={scrollRef}
        className="overflow-x-auto overscroll-x-contain"
      >
        <svg
          width={width}
          height={height}
          className="block min-w-full cursor-pointer select-none"
          role="img"
          aria-label="Timeline chart showing the cumulative green, turning, and ripe tomato composition by selected session time bucket"
          onClick={selectAtClientX}
        >
          <rect width={width} height={height} fill="rgba(2,6,23,0.46)" />
          {[0, 25, 50, 75, 100].map((value) => (
            <g key={value}>
              <line
                x1="0"
                x2={width}
                y1={y(value)}
                y2={y(value)}
                stroke="rgba(148,163,184,0.18)"
                strokeDasharray="4 8"
              />
              <text
                x="8"
                y={y(value) - 4}
                fill="rgba(203,213,225,0.62)"
                fontSize="10"
              >
                {value}%
              </text>
            </g>
          ))}

          {buckets.map((bucket, index) => {
            const values = maturityPercentages(bucket);
            const x = index * columnWidth + 2;
            const barWidth = Math.max(3, columnWidth - 4);
            const ripeHeight = (values.ripe / 100) * usableHeight;
            const turningHeight = (values.turning / 100) * usableHeight;
            const greenHeight = (values.green / 100) * usableHeight;
            const isSelected = index === selected;
            const shouldShowLabel =
              index % Math.max(1, Math.ceil(buckets.length / 8)) === 0 ||
              index === buckets.length - 1;

            return (
              <g key={bucket.id}>
                {isSelected ? (
                  <rect
                    x={index * columnWidth}
                    y="0"
                    width={columnWidth}
                    height={height}
                    fill="rgba(56,189,248,0.14)"
                  />
                ) : null}
                <rect
                  x={x}
                  y={top + usableHeight - ripeHeight}
                  width={barWidth}
                  height={ripeHeight}
                  fill="#dc2626"
                  fillOpacity="0.9"
                />
                <rect
                  x={x}
                  y={top + usableHeight - ripeHeight - turningHeight}
                  width={barWidth}
                  height={turningHeight}
                  fill="#f59e0b"
                  fillOpacity="0.9"
                />
                <rect
                  x={x}
                  y={top + usableHeight - ripeHeight - turningHeight - greenHeight}
                  width={barWidth}
                  height={greenHeight}
                  fill="#22c55e"
                  fillOpacity="0.86"
                />
                {shouldShowLabel ? (
                  <text
                    x={index * columnWidth + columnWidth / 2}
                    y={height - 12}
                    textAnchor="middle"
                    fill="rgba(203,213,225,0.72)"
                    fontSize="10"
                  >
                    {bucket.label}
                  </text>
                ) : null}
              </g>
            );
          })}

          <line
            x1={selected * columnWidth + columnWidth / 2}
            x2={selected * columnWidth + columnWidth / 2}
            y1="0"
            y2={height - bottom + 9}
            stroke="#38bdf8"
            strokeWidth="2"
          />
          <circle
            cx={selected * columnWidth + columnWidth / 2}
            cy={top - 3}
            r="4"
            fill="#67e8f9"
            stroke="#e0f2fe"
            strokeWidth="1"
          />
        </svg>
      </div>
    </div>
  );
}

export default function TimelineControls({
  buckets = [],
  bucketPosition,
  setBucketPosition,
  layer,
  setLayer,
  timeScale,
  setTimeScale,
}) {
  const [playing, setPlaying] = useState(false);
  const safeIndex = Math.max(
    0,
    Math.min(bucketPosition ?? 0, Math.max(0, buckets.length - 1)),
  );
  const selected = buckets[safeIndex] ?? null;
  const progress =
    buckets.length > 1
      ? Math.round((safeIndex / (buckets.length - 1)) * 100)
      : 100;

  useEffect(() => {
    setPlaying(false);
  }, [buckets.length, timeScale]);

  useEffect(() => {
    if (!playing || buckets.length < 2) return undefined;

    const timer = window.setInterval(() => {
      setBucketPosition((current) => {
        const currentIndex = Number.isFinite(current) ? current : 0;
        if (currentIndex >= buckets.length - 1) {
          setPlaying(false);
          return buckets.length - 1;
        }
        return currentIndex + 1;
      });
    }, 430);

    return () => window.clearInterval(timer);
  }, [playing, buckets.length, setBucketPosition]);

  const selectedGroupSummary = useMemo(() => {
    const values = maturityPercentages(selected);
    return `${Math.round(values.green)}% green · ${Math.round(values.turning)}% turning · ${Math.round(values.ripe)}% ripe`;
  }, [selected]);

  if (!buckets.length) {
    return (
      <div className="border-t border-slate-800 bg-slate-950/90 px-4 py-4 text-sm text-slate-400">
        No timestamped selected-session observations are available for timeline playback.
      </div>
    );
  }

  return (
    <div className="border-t border-slate-800 bg-slate-950/95 p-4">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-[0.28em] text-purple-300">
            Scan Playback
          </div>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <h3 className="text-base font-semibold text-white">
              Cumulative session timeline
            </h3>
            <span className="text-xs text-slate-500">
              {compactClockLabel(selected)} · {safeIndex + 1}/{buckets.length}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 sm:min-w-[360px]">
          <Metric
            label="Findings"
            value={selected?.totalKnownDetections ?? 0}
            detail="known landmarks"
          />
          <Metric
            label="Updates"
            value={selected?.updateCount ?? 0}
            detail="this step"
          />
          <Metric
            label="Progress"
            value={`${progress}%`}
            detail={selectedGroupSummary}
          />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <ControlButton
          onClick={() => {
            setPlaying(false);
            setBucketPosition(0);
          }}
        >
          Start
        </ControlButton>
        <ControlButton
          onClick={() => {
            setPlaying(false);
            setBucketPosition((value) => Math.max(0, (value ?? safeIndex) - 1));
          }}
        >
          Prev
        </ControlButton>
        <ControlButton active={playing} onClick={() => setPlaying((value) => !value)}>
          {playing ? "Pause" : "Play"}
        </ControlButton>
        <ControlButton
          onClick={() => {
            setPlaying(false);
            setBucketPosition((value) =>
              Math.min(buckets.length - 1, (value ?? safeIndex) + 1),
            );
          }}
        >
          Next
        </ControlButton>
        <ControlButton
          onClick={() => {
            setPlaying(false);
            setBucketPosition(buckets.length - 1);
          }}
        >
          End
        </ControlButton>

        <div className="mx-1 hidden h-7 w-px bg-slate-700 sm:block" />

        <div className="flex flex-wrap items-center gap-1.5">
          {Object.keys(TIME_SCALE_OPTIONS).map((scale) => (
            <button
              key={scale}
              type="button"
              onClick={() => {
                setPlaying(false);
                setTimeScale(scale);
                setBucketPosition(0);
              }}
              className={`rounded-lg border px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] transition ${
                timeScale === scale
                  ? "border-purple-300/70 bg-purple-300/15 text-purple-100"
                  : "border-slate-700 bg-slate-900 text-slate-400 hover:border-slate-500 hover:text-slate-200"
              }`}
            >
              {scaleLabel(scale)}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          {[
            ["observed", "Observed"],
            ["kriging", "Kriging"],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setLayer(value)}
              className={`rounded-lg border px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] transition ${
                layer === value
                  ? "border-emerald-300/70 bg-emerald-300/15 text-emerald-100"
                  : "border-slate-700 bg-slate-900 text-slate-400 hover:border-slate-500 hover:text-slate-200"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <MaturityTimelineChart
        buckets={buckets}
        selectedIndex={safeIndex}
        onSelect={(index) => {
          setPlaying(false);
          setBucketPosition(index);
        }}
      />
    </div>
  );
}
