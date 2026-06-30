"use client";

import { useEffect, useMemo, useState } from "react";
import { getPredictionAt } from "../lib/spatialModel";

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function formatNumber(value, digits = 2) {
  return Number.isFinite(value) ? value.toFixed(digits) : "—";
}

function formatPercent(value, digits = 0) {
  return Number.isFinite(value) ? `${(value * 100).toFixed(digits)}%` : "—";
}

function maturityColor(value) {
  const maturity = clamp(Number(value) || 0.5, 0, 1);
  if (maturity <= 0.18) return "#15803d";
  if (maturity <= 0.38) return "#22c55e";
  if (maturity <= 0.58) return "#f59e0b";
  if (maturity <= 0.78) return "#f97316";
  return "#dc2626";
}

function formatTime(value) {
  if (!value) return "—";
  const text = String(value);
  return text.includes("T") ? text.replace("T", " ").replace(/\.\d+/, "") : text;
}

function Metric({ label, value, detail }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/65 p-3">
      <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-white">{value}</div>
      {detail ? <div className="mt-1 text-[11px] leading-4 text-slate-500">{detail}</div> : null}
    </div>
  );
}

function ClassLegend({ classes = [] }) {
  return (
    <div className="mt-4 rounded-3xl border border-slate-800 bg-slate-950/65 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="text-sm font-semibold text-white">Real detection classes</div>
          <p className="mt-1 text-xs leading-5 text-slate-400">
            Marker colors follow the greenhouse-map class scheme. Each marker represents one spatially grouped landmark derived from accepted saved YOLO detections.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {classes.map((item) => (
            <span key={item.key} className="flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-200">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
              {item.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function TomatoTooltip({ landmark, prediction, position, onClose }) {
  if (!landmark || !position) return null;

  const width = 440;
  const viewportWidth = typeof window === "undefined" ? 1280 : window.innerWidth;
  const viewportHeight = typeof window === "undefined" ? 920 : window.innerHeight;
  const left = Math.min(position.x + 16, Math.max(16, viewportWidth - width - 16));
  const top = Math.min(position.y + 16, Math.max(16, viewportHeight - 700));
  const representative = landmark.representative ?? landmark.observations?.[0] ?? null;
  const bbox = representative?.bbox ?? null;

  return (
    <div
      data-real-tomato-tooltip="true"
      className="fixed z-[9999] max-h-[calc(100vh-32px)] overflow-y-auto rounded-[1.5rem] border border-slate-500 bg-slate-950/98 p-4 text-left shadow-2xl shadow-black/70"
      style={{ left, top, width, maxWidth: "calc(100vw - 32px)" }}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-300">Real YOLO landmark</div>
          <h3 className="mt-1 text-2xl font-semibold text-white">{landmark.label}</h3>
          <p className="mt-1 text-sm text-slate-400">{landmark.observationCount} accepted observation{landmark.observationCount === 1 ? "" : "s"} grouped at this session-map location.</p>
        </div>
        <button
          type="button"
          aria-label="Close tomato details"
          onClick={onClose}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-700 bg-slate-900 text-xl leading-none text-slate-200 transition hover:border-cyan-300 hover:text-white"
        >
          ×
        </button>
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-slate-800 bg-black/70 p-2">
        {representative?.imageUrl ? (
          <img
            src={representative.imageUrl}
            alt={`Annotated ${landmark.label} detection frame`}
            className="max-h-[420px] w-full object-contain"
          />
        ) : (
          <div className="flex min-h-44 items-center justify-center p-5 text-center text-sm text-slate-400">
            No retained annotated image path is available for this saved detection.
          </div>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <Metric label="Best confidence" value={formatPercent(landmark.bestConfidence)} detail={`mean ${formatPercent(landmark.confidence)}`} />
        <Metric label="Class maturity index" value={formatPercent(landmark.maturityScore)} detail="Class-derived ecological score" />
        <Metric label="Map coordinate" value={`${formatNumber(landmark.x)} / ${formatNumber(landmark.y)} m`} detail="Saved session-map X / Y" />
        <Metric label="First seen" value={formatTime(landmark.firstTimestampLocal)} detail={`last ${formatTime(landmark.latestTimestampLocal)}`} />
      </div>

      <div className="mt-3 rounded-2xl border border-fuchsia-400/20 bg-fuchsia-400/5 p-3">
        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-fuchsia-200">Kriging at selected marker</div>
        <div className="mt-2 grid grid-cols-2 gap-3">
          <Metric label="Maturity estimate" value={prediction ? formatPercent(prediction.value) : "—"} detail={prediction?.method ?? "No prediction grid"} />
          <Metric label="Model uncertainty" value={prediction ? formatPercent(prediction.uncertainty) : "—"} detail="Lower means stronger nearby support" />
        </div>
      </div>

      <div className="mt-3 rounded-2xl border border-slate-800 bg-slate-900/60 p-3 text-xs leading-5 text-slate-400">
        {bbox?.valid ? (
          <div>BBox: x {formatNumber(bbox.x, 0)}, y {formatNumber(bbox.y, 0)}, w {formatNumber(bbox.w, 0)}, h {formatNumber(bbox.h, 0)} px.</div>
        ) : (
          <div>BBox metadata was not present in the saved detection record.</div>
        )}
        <div className="mt-1">The underlying exporter describes these camera-bearing, fixed-distance map projections as approximate; they are suitable for spatial review, not verified tomato depth coordinates.</div>
      </div>
    </div>
  );
}

function SpatialSummary({ summary }) {
  const variogram = summary?.variogram;

  return (
    <aside className="space-y-3 rounded-3xl border border-slate-800 bg-slate-950/70 p-4">
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-fuchsia-300">Real-session spatial model</div>
        <h3 className="mt-1 text-lg font-semibold text-white">Ordinary Kriging</h3>
        <p className="mt-1 text-xs leading-5 text-slate-400">
          Spatial prediction uses the selected session’s grouped tomato anchors and a fitted spherical variogram.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Metric label="Method" value={summary?.method === "ordinary-kriging" ? "Kriging" : "IDW fallback"} detail={`${summary?.anchorCount ?? 0} spatial anchors`} />
        <Metric label="Coverage" value={`${Math.round(summary?.coverage ?? 0)}%`} detail="Approx. modeled support" />
        <Metric label="Moran’s I" value={formatNumber(summary?.moran?.value)} detail={summary?.moran?.label ?? "—"} />
        <Metric label="Geary’s C" value={formatNumber(summary?.geary?.value)} detail={summary?.geary?.label ?? "—"} />
        <Metric label="Variogram range" value={`${formatNumber(variogram?.rangeMeters)} m`} detail={variogram?.model ?? "—"} />
        <Metric label="Avg uncertainty" value={formatPercent(summary?.uncertaintyAverage)} detail="Prediction-grid average" />
      </div>
      <div className="rounded-2xl border border-slate-800 bg-slate-900/55 p-3 text-xs leading-5 text-slate-400">
        The maturity value is a class-derived index: unripe classes are green/low and ripe classes are red/high. It is not a laboratory ripeness measurement.
      </div>
    </aside>
  );
}

export default function GreenhouseMap({
  layout,
  classes = [],
  samples = [],
  currentDetections = [],
  currentRobotPose = null,
  robotTrail = [],
  spatialSummary = null,
  layer = "kriging",
  selectedId,
  onSelect,
}) {
  const width = 1000;
  const height = 720;
  const pad = 58;
  const [tooltipPosition, setTooltipPosition] = useState(null);

  const safeLayout = layout ?? { minX: -1, maxX: 1, minY: -1, maxY: 1, widthM: 2, heightM: 2 };
  const spanX = Math.max(0.001, safeLayout.maxX - safeLayout.minX);
  const spanY = Math.max(0.001, safeLayout.maxY - safeLayout.minY);
  const toSvg = (x, y) => ({
    x: pad + ((x - safeLayout.minX) / spanX) * (width - pad * 2),
    y: height - pad - ((y - safeLayout.minY) / spanY) * (height - pad * 2),
  });
  const toSvgLength = (meters) => (meters / Math.max(spanX / (width - pad * 2), spanY / (height - pad * 2)));

  const selected = samples.find((item) => item.id === selectedId) ?? null;
  const prediction = useMemo(
    () => (selected ? getPredictionAt(spatialSummary?.grid, selected) : null),
    [selected, spatialSummary?.grid],
  );
  const activeObservationIds = new Set(currentDetections.map((item) => item.id));

  useEffect(() => {
    if (!selectedId) return undefined;

    const closeOutside = (event) => {
      if (event.target?.closest?.("[data-real-tomato-tooltip='true'], [data-real-tomato-point='true']")) return;
      setTooltipPosition(null);
      onSelect?.(null);
    };

    document.addEventListener("click", closeOutside);
    return () => document.removeEventListener("click", closeOutside);
  }, [selectedId, onSelect]);

  useEffect(() => {
    if (!selectedId) setTooltipPosition(null);
  }, [selectedId]);

  const trailPoints = robotTrail
    .map((pose) => toSvg(pose.x, pose.y))
    .map((point) => `${point.x},${point.y}`)
    .join(" ");

  return (
    <section className="rounded-[2rem] border border-slate-800 bg-slate-900/65 p-5">
      <div className="flex flex-col gap-5 2xl:flex-row 2xl:items-start 2xl:justify-between">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-emerald-300">Selected-session greenhouse map</div>
          <h2 className="mt-2 text-2xl font-semibold text-white">Real YOLO landmarks with Kriging maturity estimate</h2>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-400">
            The static map uses the complete selected session. The timeline controls which collected landmark knowledge is visible; the Kriging layer is recomputed from that cumulative real-session state.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
          <span className="rounded-full border border-slate-700 bg-slate-950/70 px-3 py-1.5">{samples.length} visible landmarks</span>
          <span className="rounded-full border border-slate-700 bg-slate-950/70 px-3 py-1.5">{currentDetections.length} accepted updates in selection</span>
          <span className="rounded-full border border-fuchsia-400/30 bg-fuchsia-400/10 px-3 py-1.5 text-fuchsia-100">{layer === "kriging" ? "Kriging layer" : "Observed anchors"}</span>
        </div>
      </div>

      <div className="mt-5 grid gap-5 2xl:grid-cols-[minmax(0,1fr)_330px]">
        <div className="overflow-hidden rounded-3xl border border-slate-800 bg-[#050b14]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 bg-slate-950/80 px-4 py-3 text-xs text-slate-400">
            <span>Click any tomato dot to open its annotated detection and spatial statistics.</span>
            <span>saved session-map X / Y coordinates</span>
          </div>
          <div className="aspect-[25/18] min-h-[440px] w-full">
            <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full" role="img" aria-label="Real selected-session tomato map with Kriging prediction">
              <defs>
                <pattern id="data-analysis-map-grid" width="36" height="36" patternUnits="userSpaceOnUse">
                  <path d="M 36 0 L 0 0 0 36" fill="none" stroke="#1e293b" strokeWidth="1" />
                </pattern>
                <filter id="data-analysis-dot-glow" x="-100%" y="-100%" width="300%" height="300%">
                  <feGaussianBlur stdDeviation="3" result="blur" />
                  <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
              </defs>
              <rect width={width} height={height} fill="#030712" />
              <rect x={pad} y={pad} width={width - pad * 2} height={height - pad * 2} rx="16" fill="url(#data-analysis-map-grid)" stroke="#334155" strokeWidth="1.5" />

              {layer === "kriging" && spatialSummary?.grid?.map((cell) => {
                const point = toSvg(cell.x, cell.y);
                const size = toSvgLength(cell.cellSizeM ?? 0.12);
                return (
                  <rect
                    key={`grid-${cell.x}-${cell.y}`}
                    x={point.x - size / 2}
                    y={point.y - size / 2}
                    width={size + 0.5}
                    height={size + 0.5}
                    fill={maturityColor(cell.value)}
                    fillOpacity={0.12 + (1 - clamp(cell.uncertainty ?? 1, 0, 1)) * 0.48}
                    pointerEvents="none"
                  />
                );
              })}

              {trailPoints ? <polyline points={trailPoints} fill="none" stroke="#38bdf8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.75" /> : null}

              {currentRobotPose ? (() => {
                const point = toSvg(currentRobotPose.x, currentRobotPose.y);
                return (
                  <g pointerEvents="none">
                    <circle cx={point.x} cy={point.y} r="11" fill="#22d3ee" fillOpacity="0.16" stroke="#22d3ee" strokeOpacity="0.7" />
                    <circle cx={point.x} cy={point.y} r="4.5" fill="#67e8f9" stroke="#ffffff" strokeWidth="1.3" />
                    <text x={point.x + 13} y={point.y - 12} fill="#e2e8f0" fontSize="11" fontWeight="700">robot</text>
                  </g>
                );
              })() : null}

              {samples.map((landmark) => {
                const point = toSvg(landmark.x, landmark.y);
                const selectedMarker = landmark.id === selectedId;
                const updated = landmark.observations?.some((item) => activeObservationIds.has(item.id));
                const radius = selectedMarker ? 10 : updated ? 8.5 : 7;
                return (
                  <g
                    key={landmark.id}
                    data-real-tomato-point="true"
                    role="button"
                    tabIndex={0}
                    className="cursor-pointer"
                    aria-label={`Open ${landmark.label} details`}
                    onClick={(event) => {
                      event.stopPropagation();
                      setTooltipPosition({ x: event.clientX, y: event.clientY });
                      onSelect?.(landmark);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        const rect = event.currentTarget.ownerSVGElement?.getBoundingClientRect();
                        setTooltipPosition({ x: rect ? rect.left + point.x * (rect.width / width) : 120, y: rect ? rect.top + point.y * (rect.height / height) : 120 });
                        onSelect?.(landmark);
                      }
                    }}
                  >
                    <circle cx={point.x} cy={point.y} r={radius + 5} fill={landmark.color} fillOpacity={selectedMarker ? "0.26" : "0.12"} filter={selectedMarker ? "url(#data-analysis-dot-glow)" : undefined} />
                    <circle cx={point.x} cy={point.y} r={radius} fill={landmark.color} stroke="#f8fafc" strokeWidth={selectedMarker ? "2.5" : "1.5"} />
                    <text x={point.x} y={point.y + 3.5} textAnchor="middle" fill="#ffffff" fontSize="9" fontWeight="800" pointerEvents="none">{landmark.observationCount}</text>
                  </g>
                );
              })}

              <text x={pad + 14} y={pad + 22} fill="#cbd5e1" fontSize="12" fontWeight="700">REAL SESSION MAP</text>
              <text x={pad + 14} y={pad + 40} fill="#64748b" fontSize="11">accepted detections · grouped landmarks · approximate projection coordinates</text>
            </svg>
          </div>
        </div>
        <SpatialSummary summary={spatialSummary} />
      </div>

      <ClassLegend classes={classes.filter((item) => item.key !== "unknown")} />

      <p className="mt-4 rounded-2xl border border-amber-400/20 bg-amber-400/5 p-3 text-xs leading-5 text-amber-100/85">
        Spatial anchors come from <code>detections_on_map.jsonl</code>. The source exporter marks the camera-bearing fixed-distance tomato projections as approximate. Ordinary Kriging is therefore a session-analysis visualization rather than verified greenhouse-world localization.
      </p>

      <TomatoTooltip landmark={selected} prediction={prediction} position={tooltipPosition} onClose={() => { setTooltipPosition(null); onSelect?.(null); }} />
    </section>
  );
}
