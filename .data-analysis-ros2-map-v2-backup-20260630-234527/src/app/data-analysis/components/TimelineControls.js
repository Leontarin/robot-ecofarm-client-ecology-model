"use client";

import { TIME_SCALE_OPTIONS } from "../lib/sessionTimeline";

function scaleLabel(scale) {
  return TIME_SCALE_OPTIONS[scale]?.label ?? scale;
}

function groupPercent(bucket) {
  const groups = bucket?.maturityGroups ?? { green: 0, turning: 0, ripe: 0, total: 0 };
  const total = Math.max(groups.total ?? 0, 1);
  return {
    green: ((groups.green ?? 0) / total) * 100,
    turning: ((groups.turning ?? 0) / total) * 100,
    ripe: ((groups.ripe ?? 0) / total) * 100,
  };
}

function MiniCard({ label, value, detail }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-3">
      <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-white">{value}</div>
      {detail ? <div className="mt-1 text-xs text-slate-500">{detail}</div> : null}
    </div>
  );
}

function TimelineChart({ buckets, selectedIndex, onSelect }) {
  const width = Math.max(760, buckets.length * 34);
  const height = 188;
  const top = 16;
  const bottom = 38;
  const usableHeight = height - top - bottom;
  const columnWidth = width / Math.max(buckets.length, 1);
  const selected = Math.max(0, Math.min(selectedIndex, Math.max(buckets.length - 1, 0)));

  function y(percent) {
    return top + ((100 - percent) / 100) * usableHeight;
  }

  return (
    <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-800 bg-slate-950/70">
      <svg
        width={width}
        height={height}
        className="block cursor-pointer select-none"
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const x = ((event.clientX - rect.left) / Math.max(rect.width, 1)) * width;
          onSelect(Math.max(0, Math.min(buckets.length - 1, Math.floor(x / columnWidth))));
        }}
      >
        <rect width={width} height={height} fill="rgba(2,6,23,0.5)" />
        {[0, 25, 50, 75, 100].map((value) => (
          <g key={value}>
            <line x1="0" x2={width} y1={y(value)} y2={y(value)} stroke="rgba(148,163,184,0.17)" strokeDasharray="4 8" />
            <text x="7" y={y(value) - 3} fill="rgba(203,213,225,0.65)" fontSize="10">{value}%</text>
          </g>
        ))}
        {buckets.map((bucket, index) => {
          const values = groupPercent(bucket);
          const x = index * columnWidth + 2;
          const barWidth = Math.max(2, columnWidth - 4);
          const ripeHeight = (values.ripe / 100) * usableHeight;
          const turningHeight = (values.turning / 100) * usableHeight;
          const greenHeight = (values.green / 100) * usableHeight;
          const isSelected = index === selected;
          return (
            <g key={bucket.id}>
              {isSelected ? <rect x={index * columnWidth} y="0" width={columnWidth} height={height} fill="rgba(56,189,248,0.12)" /> : null}
              <rect x={x} y={top + usableHeight - ripeHeight} width={barWidth} height={ripeHeight} fill="#dc2626" fillOpacity="0.82" />
              <rect x={x} y={top + usableHeight - ripeHeight - turningHeight} width={barWidth} height={turningHeight} fill="#f59e0b" fillOpacity="0.82" />
              <rect x={x} y={top + usableHeight - ripeHeight - turningHeight - greenHeight} width={barWidth} height={greenHeight} fill="#22c55e" fillOpacity="0.78" />
              {index % Math.max(1, Math.ceil(buckets.length / 8)) === 0 || index === buckets.length - 1 ? (
                <text x={index * columnWidth + columnWidth / 2} y={height - 11} textAnchor="middle" fill="rgba(203,213,225,0.7)" fontSize="10">{bucket.label}</text>
              ) : null}
            </g>
          );
        })}
        <line x1={selected * columnWidth + columnWidth / 2} x2={selected * columnWidth + columnWidth / 2} y1="0" y2={height - bottom + 8} stroke="#38bdf8" strokeWidth="2" />
      </svg>
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
  const safeIndex = Math.max(0, Math.min(bucketPosition ?? 0, Math.max(0, buckets.length - 1)));
  const selected = buckets[safeIndex] ?? null;

  if (!buckets.length) {
    return (
      <section className="rounded-[2rem] border border-slate-800 bg-slate-900/65 p-5 text-sm text-slate-400">
        No timestamped selected-session observations are available for a temporal spatial replay.
      </section>
    );
  }

  return (
    <section className="rounded-[2rem] border border-slate-800 bg-slate-900/65 p-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-cyan-300">Selected-session temporal replay</div>
          <h2 className="mt-2 text-2xl font-semibold text-white">Cumulative map knowledge</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-400">
            Moving the timeline only reveals real detections and landmarks recorded up to that session time. Earlier landmark positions remain fixed in the shared map frame.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {Object.keys(TIME_SCALE_OPTIONS).map((scale) => (
            <button
              key={scale}
              type="button"
              onClick={() => { setTimeScale(scale); setBucketPosition(0); }}
              className={`rounded-full border px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] transition ${
                timeScale === scale
                  ? "border-cyan-300 bg-cyan-300 text-slate-950"
                  : "border-slate-700 bg-slate-950/60 text-slate-300 hover:border-slate-500"
              }`}
            >
              {scaleLabel(scale)}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="mr-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Map layer</span>
        {[["observed", "Observed anchors"], ["kriging", "Kriging estimate"]].map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setLayer(value)}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
              layer === value
                ? "border-emerald-300 bg-emerald-300 text-slate-950"
                : "border-slate-700 bg-slate-950/60 text-slate-300 hover:border-slate-500"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-4">
        <MiniCard label="Selected" value={selected?.label ?? "—"} detail={`${safeIndex + 1} of ${buckets.length} ${timeScale} bucket${buckets.length === 1 ? "" : "s"}`} />
        <MiniCard label="Known landmarks" value={selected?.totalKnownDetections ?? 0} detail="Cumulative real spatial anchors" />
        <MiniCard label="Avg maturity" value={`${selected?.avgMaturityPercent ?? 0}%`} detail="Class-derived index" />
        <MiniCard label="Updates in bucket" value={selected?.updateCount ?? 0} detail="Accepted source observations" />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setBucketPosition(0)} className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-semibold text-slate-300 hover:border-cyan-300 hover:text-white">Start</button>
        <button type="button" onClick={() => setBucketPosition((value) => Math.max(0, (value ?? safeIndex) - 1))} className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-semibold text-slate-300 hover:border-cyan-300 hover:text-white">Prev</button>
        <input type="range" min="0" max={Math.max(0, buckets.length - 1)} value={safeIndex} onChange={(event) => setBucketPosition(Number(event.target.value))} className="h-2 min-w-[180px] flex-1 cursor-pointer accent-cyan-400" aria-label="Session timeline position" />
        <button type="button" onClick={() => setBucketPosition((value) => Math.min(buckets.length - 1, (value ?? safeIndex) + 1))} className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-semibold text-slate-300 hover:border-cyan-300 hover:text-white">Next</button>
        <button type="button" onClick={() => setBucketPosition(buckets.length - 1)} className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-semibold text-slate-300 hover:border-cyan-300 hover:text-white">End</button>
      </div>

      <TimelineChart buckets={buckets} selectedIndex={safeIndex} onSelect={setBucketPosition} />
    </section>
  );
}
