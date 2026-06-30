"use client";

import { useEffect, useMemo, useState } from "react";
import { TIME_SCALE_OPTIONS } from "../lib/sessionTimeline";

function scaleLabel(scale) {
  return TIME_SCALE_OPTIONS[scale]?.label ?? scale;
}

function compactClockLabel(bucket) {
  if (!bucket?.label) return "—";
  return bucket.label;
}

function Metric({ label, value, detail }) {
  return (
    <div className="rounded-2xl border border-slate-700/80 bg-slate-950/75 px-3 py-2.5">
      <div className="text-[9px] font-semibold uppercase tracking-[0.2em] text-slate-500">{label}</div>
      <div className="mt-1 text-base font-semibold leading-none text-white">{value}</div>
      {detail ? <div className="mt-1 text-[10px] text-slate-500">{detail}</div> : null}
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
  const safeIndex = Math.max(0, Math.min(bucketPosition ?? 0, Math.max(0, buckets.length - 1)));
  const selected = buckets[safeIndex] ?? null;
  const progress = buckets.length > 1 ? Math.round((safeIndex / (buckets.length - 1)) * 100) : 100;

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
          <div className="text-[10px] font-semibold uppercase tracking-[0.28em] text-purple-300">Scan Playback</div>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <h3 className="text-base font-semibold text-white">Cumulative session timeline</h3>
            <span className="text-xs text-slate-500">{compactClockLabel(selected)} · {safeIndex + 1}/{buckets.length}</span>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 sm:min-w-[360px]">
          <Metric label="Findings" value={selected?.totalKnownDetections ?? 0} detail="known landmarks" />
          <Metric label="Updates" value={selected?.updateCount ?? 0} detail="this step" />
          <Metric label="Progress" value={`${progress}%`} detail={`${timeScale} steps`} />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <ControlButton onClick={() => { setPlaying(false); setBucketPosition(0); }}>Start</ControlButton>
        <ControlButton onClick={() => { setPlaying(false); setBucketPosition((value) => Math.max(0, (value ?? safeIndex) - 1)); }}>Prev</ControlButton>
        <ControlButton active={playing} onClick={() => setPlaying((value) => !value)}>
          {playing ? "Pause" : "Play"}
        </ControlButton>
        <ControlButton onClick={() => { setPlaying(false); setBucketPosition((value) => Math.min(buckets.length - 1, (value ?? safeIndex) + 1)); }}>Next</ControlButton>
        <ControlButton onClick={() => { setPlaying(false); setBucketPosition(buckets.length - 1); }}>End</ControlButton>

        <div className="mx-1 hidden h-7 w-px bg-slate-700 sm:block" />

        <div className="flex flex-wrap items-center gap-1.5">
          {Object.keys(TIME_SCALE_OPTIONS).map((scale) => (
            <button
              key={scale}
              type="button"
              onClick={() => { setPlaying(false); setTimeScale(scale); setBucketPosition(0); }}
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
          {[['observed', 'Observed'], ['kriging', 'Kriging']].map(([value, label]) => (
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

      <div className="mt-4 flex items-center gap-2">
        <input
          type="range"
          min="0"
          max={Math.max(0, buckets.length - 1)}
          step="1"
          value={safeIndex}
          onChange={(event) => {
            setPlaying(false);
            setBucketPosition(Number(event.target.value));
          }}
          className="h-2 min-w-0 flex-1 cursor-pointer accent-cyan-400"
          aria-label="Selected session timeline"
        />
        <span className="min-w-[52px] text-right text-xs font-semibold text-cyan-200">{progress}%</span>
      </div>
    </div>
  );
}
