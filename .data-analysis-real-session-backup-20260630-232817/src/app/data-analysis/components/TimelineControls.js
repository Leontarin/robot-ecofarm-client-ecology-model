import { getTimelineBuckets } from "../lib/mockTomatoData";

function scaleLabel(scale) {
  if (scale === "seconds") return "sec";
  if (scale === "minutes") return "min";
  if (scale === "hours") return "hour";
  return "day";
}

function stackPercent(bucket) {
  const groups = bucket?.maturityGroups ?? { green: 0, turning: 0, ripe: 0, total: 0 };
  const total = groups.total || 1;
  return {
    green: (groups.green / total) * 100,
    turning: (groups.turning / total) * 100,
    ripe: (groups.ripe / total) * 100,
  };
}

function buildAreaPath(series, width, height, topPad, bottomPad, y0Key, y1Key) {
  if (!series.length) return "";
  const usableH = height - topPad - bottomPad;
  const xFor = (i) => series[i].x;
  const yFor = (value) => topPad + (100 - value) / 100 * usableH;

  const upper = series.map((point, i) => `${i === 0 ? "M" : "L"} ${xFor(i).toFixed(2)} ${yFor(point[y1Key]).toFixed(2)}`).join(" ");
  const lower = [...series].reverse().map((point, reverseIndex) => {
    const i = series.length - 1 - reverseIndex;
    return `L ${xFor(i).toFixed(2)} ${yFor(point[y0Key]).toFixed(2)}`;
  }).join(" ");

  return `${upper} ${lower} Z`;
}

function GraphTimeline({ buckets, selectedBucketIndex, onSelectBucket, timeScale }) {
  const height = 210;
  const topPad = 16;
  const bottomPad = 44;
  const unitWidthByScale = {
    seconds: 12,
    minutes: 42,
    hours: 72,
    days: 96,
  };
  const unitWidth = unitWidthByScale[timeScale] ?? 42;
  const width = Math.max(760, buckets.length * unitWidth);
  const usableH = height - topPad - bottomPad;
  const safeSelectedIndex = Math.min(Math.max(selectedBucketIndex ?? 0, 0), Math.max(0, buckets.length - 1));
  const selectedX = safeSelectedIndex * unitWidth + unitWidth / 2;
  const tickEvery = Math.max(1, Math.ceil(78 / unitWidth));

  const series = buckets.map((bucket, index) => {
    const p = stackPercent(bucket);
    const ripeTop = p.ripe;
    const turningTop = ripeTop + p.turning;
    const greenTop = turningTop + p.green;
    return {
      x: index * unitWidth + unitWidth / 2,
      ripe0: 0,
      ripe1: ripeTop,
      turning0: ripeTop,
      turning1: turningTop,
      green0: turningTop,
      green1: greenTop,
      maturity: bucket.avgMaturityPercent ?? 0,
    };
  });

  const handleClick = (event) => {
    const svg = event.currentTarget;
    const rect = svg.getBoundingClientRect();
    const ratio = width / rect.width;
    const x = (event.clientX - rect.left) * ratio;
    const index = Math.min(Math.max(Math.floor(x / unitWidth), 0), buckets.length - 1);
    onSelectBucket(index);
  };

  return (
    <div className="mt-4 rounded-3xl border border-slate-800 bg-slate-950/70 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-white">Maturity timeline</div>
          <p className="mt-1 text-xs text-slate-400">
            Stacked percentage view. Each {scaleLabel(timeScale)} has equal width; empty periods keep the last known map state.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-300">
          <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-rose-500" />Ripe</span>
          <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-amber-400" />Turning / mixed</span>
          <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-emerald-500" />Green / unripe</span>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto overflow-y-hidden rounded-2xl border border-slate-800 bg-slate-900/60 pb-2">
        <svg width={width} height={height} className="block cursor-crosshair select-none" onClick={handleClick}>
          <rect x="0" y="0" width={width} height={height} fill="rgba(2,6,23,0.55)" />

          {[0, 25, 50, 75, 100].map((value) => {
            const y = topPad + (100 - value) / 100 * usableH;
            return (
              <g key={value}>
                <line x1="0" x2={width} y1={y} y2={y} stroke="rgba(148,163,184,0.16)" strokeDasharray="4 8" />
                <text x="8" y={y - 4} fill="rgba(203,213,225,0.68)" fontSize="11">{value}%</text>
              </g>
            );
          })}

          <path d={buildAreaPath(series, width, height, topPad, bottomPad, "ripe0", "ripe1")} fill="rgba(244,63,94,0.82)" />
          <path d={buildAreaPath(series, width, height, topPad, bottomPad, "turning0", "turning1")} fill="rgba(245,158,11,0.82)" />
          <path d={buildAreaPath(series, width, height, topPad, bottomPad, "green0", "green1")} fill="rgba(34,197,94,0.78)" />

          <polyline
            points={series.map((point) => `${point.x.toFixed(2)},${(topPad + (100 - point.maturity) / 100 * usableH).toFixed(2)}`).join(" ")}
            fill="none"
            stroke="rgba(255,255,255,0.82)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {buckets.map((bucket, index) => {
            const x = index * unitWidth + unitWidth / 2;
            const major = index % tickEvery === 0 || index === buckets.length - 1;
            return (
              <g key={bucket.id}>
                <line x1={x} x2={x} y1={height - bottomPad + 8} y2={height - bottomPad + (major ? 20 : 14)} stroke="rgba(148,163,184,0.46)" />
                {major && (
                  <text x={x} y={height - 10} textAnchor="middle" fill="rgba(203,213,225,0.76)" fontSize="11">
                    {bucket.label}
                  </text>
                )}
              </g>
            );
          })}

          <rect x={safeSelectedIndex * unitWidth} y="0" width={unitWidth} height={height - bottomPad + 24} fill="rgba(56,189,248,0.08)" />
          <line x1={selectedX} x2={selectedX} y1="0" y2={height - 18} stroke="rgba(56,189,248,0.95)" strokeWidth="2.5" />
          <circle cx={selectedX} cy={topPad + 4} r="4" fill="#38bdf8" />
        </svg>
      </div>
    </div>
  );
}

export default function TimelineControls({ timeScale, setTimeScale, bucketPosition, setBucketPosition, layer, setLayer }) {
  const safeBuckets = getTimelineBuckets(timeScale);
  const selectedBucketIndex = Math.min(Math.max(bucketPosition ?? 0, 0), Math.max(0, safeBuckets.length - 1));
  const selectedBucket = safeBuckets[selectedBucketIndex] ?? safeBuckets[0];
  const onSelectBucket = (index) => setBucketPosition(index);

  return (
    <section className="rounded-[2rem] border border-slate-800 bg-slate-900/65 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-cyan-300">Temporal aggregation</div>
          <h2 className="mt-2 text-2xl font-semibold text-white">Time-scale view</h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-400">
            The map is cumulative: choosing a time position shows everything the robot has scanned up to that time.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {["seconds", "minutes", "hours", "days"].map((scale) => (
            <button
              key={scale}
              type="button"
              onClick={() => { setTimeScale(scale); setBucketPosition(0); }}
              className={`rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] transition ${
                timeScale === scale
                  ? "border-cyan-300 bg-cyan-300 text-slate-950"
                  : "border-slate-700 bg-slate-950/60 text-slate-300 hover:border-slate-500"
              }`}
            >
              {scale}
            </button>
          ))}
        </div>
      </div>


      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Map layer</span>
        {[
          ["observed", "Observed"],
          ["kriging", "Kriging prediction"],
        ].map(([value, label]) => (
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

      {selectedBucket && (
        <div className="mt-4 grid gap-3 text-sm md:grid-cols-4">
          <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
            <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Selected</div>
            <div className="mt-2 text-lg font-semibold text-white">{selectedBucket.label}</div>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
            <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Known clusters</div>
            <div className="mt-2 text-lg font-semibold text-white">{selectedBucket.totalKnownDetections}</div>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
            <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Avg maturity</div>
            <div className="mt-2 text-lg font-semibold text-white">{selectedBucket.avgMaturityPercent}%</div>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
            <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Updates in bucket</div>
            <div className="mt-2 text-lg font-semibold text-white">{selectedBucket.updateCount}</div>
          </div>
        </div>
      )}

      <GraphTimeline buckets={safeBuckets} selectedBucketIndex={selectedBucketIndex} onSelectBucket={onSelectBucket} timeScale={timeScale} />
    </section>
  );
}
