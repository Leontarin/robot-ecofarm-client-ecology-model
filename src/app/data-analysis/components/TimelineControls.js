import { TIME_SCALE_OPTIONS, formatBucketLabel, getTimelineBuckets } from "../lib/mockTomatoData";

function pct(value) {
  return `${Math.round(value * 100)}%`;
}

function SparseBucketLabels({ buckets, timeScale }) {
  if (!buckets.length) return null;
  const wanted = new Set([0, buckets.length - 1, Math.floor(buckets.length * 0.25), Math.floor(buckets.length * 0.5), Math.floor(buckets.length * 0.75)]);

  return (
    <div className="mt-2 flex justify-between text-[11px] text-slate-500">
      {buckets.map((bucket, index) => (
        <span key={`${bucket.bucketKey}-${index}`} className={wanted.has(index) ? "" : "opacity-0"}>
          {formatBucketLabel(bucket, timeScale)}
        </span>
      ))}
    </div>
  );
}

export default function TimelineControls({ bucketPosition, setBucketPosition, layer, setLayer, timeScale, setTimeScale }) {
  const buckets = getTimelineBuckets(timeScale);
  const maxBucket = Math.max(0, buckets.length - 1);
  const activePosition = Math.min(bucketPosition, maxBucket);
  const currentBucket = buckets[activePosition] ?? buckets[0];

  function changeScale(nextScale) {
    const currentBucketKey = currentBucket?.bucketKey ?? 0;
    const nextBuckets = getTimelineBuckets(nextScale);
    const closestIndex = nextBuckets.reduce((best, bucket, index) => {
      const bestDistance = Math.abs(nextBuckets[best].startMs - (currentBucket?.startMs ?? 0));
      const distance = Math.abs(bucket.startMs - (currentBucket?.startMs ?? 0));
      return distance < bestDistance ? index : best;
    }, 0);

    setTimeScale(nextScale);
    setBucketPosition(nextBuckets.length ? closestIndex : 0);
  }

  return (
    <section className="rounded-[2rem] border border-slate-800 bg-slate-900/65 p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-cyan-300">Timeline aggregation</div>
          <h2 className="mt-2 text-xl font-semibold text-white">
            Accumulated map up to {formatBucketLabel(currentBucket, timeScale)}
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-400">
            Seconds, minutes, hours, and days are aggregation scales for the same scan samples. If 30 scans happened in hour 1 and 2 scans happened in hour 5, the hourly view shows hour 1 and hour 5 as update buckets.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {[
            ["observed", "Observed"],
            ["kriging", "Kriging"],
            ["uncertainty", "Uncertainty"],
          ].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setLayer(key)}
              className={`rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] transition ${
                layer === key
                  ? "border-cyan-400/60 bg-cyan-400/15 text-cyan-100"
                  : "border-slate-700 bg-slate-950/70 text-slate-400 hover:border-slate-500 hover:text-white"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {Object.entries(TIME_SCALE_OPTIONS).map(([key, option]) => (
          <button
            key={key}
            onClick={() => changeScale(key)}
            className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] transition ${
              timeScale === key
                ? "border-emerald-400/60 bg-emerald-400/15 text-emerald-100"
                : "border-slate-700 bg-slate-950/70 text-slate-400 hover:border-slate-500 hover:text-white"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_360px] lg:items-center">
        <div>
          <input
            type="range"
            min="0"
            max={maxBucket}
            value={activePosition}
            onChange={(e) => setBucketPosition(Number(e.target.value))}
            className="w-full accent-cyan-400"
          />
          <SparseBucketLabels buckets={buckets} timeScale={timeScale} />
        </div>

        <div className="grid grid-cols-3 gap-2 rounded-2xl border border-slate-800 bg-slate-950/75 p-2 text-sm text-slate-300">
          <div className="rounded-xl bg-slate-900/80 p-2">
            <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">bucket</div>
            <div className="font-semibold text-white">{formatBucketLabel(currentBucket, timeScale)}</div>
          </div>
          <div className="rounded-xl bg-slate-900/80 p-2">
            <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">scans</div>
            <div className="font-semibold text-white">{currentBucket?.sampleCount ?? 0}</div>
          </div>
          <div className="rounded-xl bg-slate-900/80 p-2">
            <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">linear next</div>
            <div className="font-semibold text-white">{currentBucket ? pct(currentBucket.expectedNextMaturity) : "—"}</div>
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-3xl border border-slate-800 bg-slate-950/60 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-white">Tomato maturity expectancy</div>
            <p className="mt-1 text-xs leading-5 text-slate-400">
              The trend is a simple linear estimate from the previous aggregation bucket to the current bucket. It is a prototype placeholder until repeated real YOLO12M scans exist.
            </p>
          </div>
          <div className="text-sm text-slate-300">
            current avg <span className="font-semibold text-white">{currentBucket ? pct(currentBucket.avgMaturity) : "—"}</span>
            <span className="mx-2 text-slate-600">→</span>
            expected next <span className="font-semibold text-emerald-200">{currentBucket ? pct(currentBucket.expectedNextMaturity) : "—"}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
