import Image from "next/image";
import { useEffect, useState } from "react";
import { TOMATO_CLASSES, formatTimelineTime } from "../lib/mockTomatoData";

function maturityColor(value) {
  const v = Math.max(0, Math.min(1, value));
  if (v < 0.2) return "#15803d";
  if (v < 0.4) return "#22c55e";
  if (v < 0.6) return "#f59e0b";
  if (v < 0.8) return "#f97316";
  return "#dc2626";
}

function opacityForUncertainty(value) {
  return Math.max(0.15, Math.min(0.9, 1 - value));
}

function TooltipCard({ point, position, timeScale, onClose }) {
  if (!point || !position) return null;

  const width = 400;
  const viewportWidth = typeof window === "undefined" ? 1200 : window.innerWidth;
  const viewportHeight = typeof window === "undefined" ? 900 : window.innerHeight;
  const left = Math.min(position.x + 18, Math.max(18, viewportWidth - width - 18));
  const top = Math.min(position.y + 18, Math.max(18, viewportHeight - 470));
  const scanX = Number.isFinite(point.scanPose?.x) ? `${point.scanPose.x.toFixed(1)}m` : "unknown";
  const scanY = Number.isFinite(point.scanPose?.y) ? `${point.scanPose.y.toFixed(1)}m` : "unknown";

  return (
    <div
      data-tomato-tooltip="true"
      className="fixed z-[9999] box-border rounded-[1.5rem] border border-slate-500 bg-slate-950/98 p-5 text-left shadow-2xl shadow-black/70"
      style={{ left, top, width, maxWidth: "calc(100vw - 36px)", pointerEvents: "auto" }}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold uppercase tracking-[0.16em] text-cyan-300">Tomato cluster</div>
          <div className="mt-1 text-3xl font-semibold text-white">{point.id}</div>
        </div>
        <div className="flex items-start gap-2">
          <span className="rounded-full border border-slate-700 px-3 py-1.5 text-base font-semibold text-slate-300">class {point.classId}</span>
          <button
            type="button"
            aria-label="Close tooltip"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-700 bg-slate-900 text-xl font-semibold leading-none text-slate-200 hover:border-cyan-300 hover:text-white"
            onClick={(event) => {
              event.stopPropagation();
              onClose?.();
            }}
          >
            ×
          </button>
        </div>
      </div>

      {point.image && (
        <div className="mt-4 overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/90">
          <Image
            src={point.image}
            alt={`${point.label ?? "Tomato"} mock observation`}
            className="h-56 w-full object-cover"
            width={720}
            height={420}
            sizes="(max-width: 640px) calc(100vw - 72px), 400px"
            priority={false}
          />
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-3 text-base">
        <div className="rounded-2xl bg-slate-900/90 p-3">
          <div className="text-slate-500">Maturity</div>
          <div className="text-2xl font-semibold text-white">{Math.round(point.maturityScore * 100)}%</div>
        </div>
        <div className="rounded-2xl bg-slate-900/90 p-3">
          <div className="text-slate-500">Confidence</div>
          <div className="text-2xl font-semibold text-white">{Math.round(point.confidence * 100)}%</div>
        </div>
        <div className="rounded-2xl bg-slate-900/90 p-3">
          <div className="text-slate-500">Count</div>
          <div className="text-2xl font-semibold text-white">{point.count}</div>
        </div>
        <div className="rounded-2xl bg-slate-900/90 p-3">
          <div className="text-slate-500">Seen at</div>
          <div className="text-2xl font-semibold text-white">{formatTimelineTime(point.timestampMs, timeScale)}</div>
        </div>
      </div>

      <div className="mt-4 text-base leading-7 text-slate-300">
        {point.label} · row {point.row}. Scanned from {point.scanPose?.aisle ?? "robot aisle"} at x={scanX}, y={scanY}.
      </div>
    </div>
  );
}

function MetricCard({ label, value, detail }) {
  return (
    <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-4">
      <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-white">{value}</div>
      <div className="mt-1 min-h-[2.5rem] text-sm text-slate-400">{detail}</div>
    </div>
  );
}

function SpatialStatsView({ summary }) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-fuchsia-300">
        Spatial statistics
      </div>

      <h3 className="mt-2 text-xl font-semibold text-white">
        Autocorrelation and Kriging readiness
      </h3>

      <p className="mt-1 text-sm text-slate-400">
        These values are prototype indicators based on the tomato maturity map. Replace the mock YOLO12M log with real detections when available.
      </p>

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <MetricCard
          label="Moran's I"
          value={summary.moran.value.toFixed(2)}
          detail={summary.moran.label}
        />

        <MetricCard
          label="Geary's C"
          value={summary.geary.value.toFixed(2)}
          detail={summary.geary.label}
        />

        <MetricCard
          label="Variogram range"
          value={`${summary.variogram.rangeMeters.toFixed(1)}m`}
          detail={`Model: ${summary.variogram.model}, sill ${summary.variogram.sill.toFixed(2)}`}
        />

        <MetricCard
          label="Avg uncertainty"
          value={`${Math.round(summary.uncertaintyAverage * 100)}%`}
          detail="Lower uncertainty means the robot sampled nearby points."
        />

        <MetricCard
          label="Moran p-value"
          value={summary.moranTest?.pValue != null ? summary.moranTest.pValue.toFixed(3) : "—"}
          detail="Permutation test for spatial autocorrelation"
        />
      </div>

      <div className="mt-5 rounded-3xl border border-slate-800 bg-slate-950/70 p-4">
        <div className="text-sm font-semibold text-white">Interpretation for the course</div>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          If nearby tomato clusters have similar maturity, the map should show positive spatial autocorrelation.
          The Kriging-style prediction layer then uses that spatial structure to estimate maturity in unsampled greenhouse cells and to show where prediction uncertainty is high.
        </p>
      </div>
    </div>
  );
}

function MaturityLegend() {
  const classes = [5, 3, 2, 4, 1, 0];

  return (
    <div className="mt-4 rounded-3xl border border-slate-800 bg-slate-950/65 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="text-sm font-semibold text-white">Maturity color scale</div>
          <p className="mt-1 text-xs leading-5 text-slate-400">Green means unripe, yellow/orange means transition or mixed bunches, red means ripe. Kriging uses the same 0–1 maturity score.</p>
        </div>
        <div className="h-3 min-w-[260px] rounded-full bg-gradient-to-r from-green-700 via-yellow-500 via-orange-500 to-red-700" />
      </div>

      <div className="mt-4 grid gap-2 md:grid-cols-3 xl:grid-cols-6">
        {classes.map((classId) => {
          const item = TOMATO_CLASSES[classId];
          return (
            <div key={classId} className="rounded-2xl border border-slate-800 bg-slate-900/70 p-3">
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: item.color }} />
                <span className="text-xs font-semibold text-white">Class {classId}</span>
              </div>
              <div className="mt-1 text-[11px] leading-4 text-slate-400">{item.label}</div>
              <div className="mt-1 text-[11px] text-slate-500">score {item.score.toFixed(1)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function GreenhouseMap({ layout, samples, currentDetections = [], currentRobotPose, spatialSummary, layer, selectedId, onSelect, timeScale = "minutes" }) {
  const width = 700;
  const height = 900;
  const pad = 36;
  const sx = (x) => pad + (x / layout.widthM) * (width - pad * 2);
  const sy = (y) => height - pad - (y / layout.heightM) * (height - pad * 2);
  const cellW = ((width - pad * 2) / layout.widthM) * 0.75;
  const cellH = ((height - pad * 2) / layout.heightM) * 0.75;
  const [tooltipPosition, setTooltipPosition] = useState(null);
  const [viewMode, setViewMode] = useState("map");
  const selectedPoint = samples.find((point) => point.id === selectedId) ?? null;

  useEffect(() => {
    if (!selectedId) return undefined;

    const closePinnedTooltip = (event) => {
      if (event.target?.closest?.('[data-tomato-tooltip="true"], [data-tomato-point="true"]')) return;
      setTooltipPosition(null);
      onSelect(null);
    };

    document.addEventListener("click", closePinnedTooltip);
    return () => document.removeEventListener("click", closePinnedTooltip);
  }, [selectedId, onSelect]);

  useEffect(() => {
    if (!selectedId) setTooltipPosition(null);
  }, [selectedId]);

  return (
  <section className="rounded-[2rem] border border-slate-800 bg-slate-900/65 p-5">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-emerald-300">
          Spatial ecological model
        </div>
        <h2 className="mt-2 text-2xl font-semibold text-white">
          Greenhouse spatial model
        </h2>
        <p className="mt-1 max-w-3xl text-sm text-slate-400">
          This tab combines the greenhouse maturity map with the spatial statistics used for autocorrelation and Kriging-style prediction.
        </p>
      </div>

      <div className="rounded-full border border-slate-700 bg-slate-950/70 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">
        {layer}
      </div>
    </div>

   <div className="mt-5 grid gap-5 xl:grid-cols-[0.75fr_1.25fr]">
      <div className="overflow-visible rounded-3xl border border-slate-800 bg-slate-950/80 p-3">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-[680px] w-full overflow-visible"
          style={{ overflow: "visible" }}
          onClick={() => {
            setTooltipPosition(null);
            onSelect(null);
          }}
        >
          <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(148,163,184,0.12)" strokeWidth="1" />
            </pattern>
          </defs>

          <rect x="0" y="0" width={width} height={height} fill="#020617" />
          <rect x={pad} y={pad} width={width - pad * 2} height={height - pad * 2} fill="url(#grid)" stroke="rgba(56,189,248,0.25)" />

          {layout.aisles?.map((aisle) => (
            <g key={aisle.id}>
              <line x1={sx(aisle.x)} y1={sy(1.2)} x2={sx(aisle.x)} y2={sy(22.8)} stroke="rgba(148,163,184,0.22)" strokeWidth="12" strokeLinecap="round" />
              <text x={sx(aisle.x) - 22} y={sy(23.2)} fill="rgba(226,232,240,0.5)" fontSize="11">{aisle.label}</text>
            </g>
          ))}

          {layout.rows.map((row) => (
            <g key={row.id}>
              <rect
                x={sx(row.x - row.width / 2)}
                y={sy(row.y2)}
                width={(row.width / layout.widthM) * (width - pad * 2)}
                height={sy(row.y1) - sy(row.y2)}
                rx="14"
                fill="rgba(34,197,94,0.16)"
                stroke="rgba(34,197,94,0.40)"
                strokeWidth="1.5"
              />
              <text x={sx(row.x) - 10} y={sy(row.y2) - 10} fill="rgba(226,232,240,0.72)" fontSize="12">{row.id}</text>
            </g>
          ))}

          {(layer === "kriging" || layer === "uncertainty") && spatialSummary.grid.map((cell, i) => (
            <rect
              key={i}
              x={sx(cell.x) - cellW / 2}
              y={sy(cell.y) - cellH / 2}
              width={cellW}
              height={cellH}
              fill={layer === "uncertainty" ? "#38bdf8" : maturityColor(cell.value)}
              opacity={layer === "uncertainty" ? cell.uncertainty * 0.48 : opacityForUncertainty(cell.uncertainty) * 0.34}
            />
          ))}

          {currentDetections
            .filter((point) => point?.scanPose && Number.isFinite(point.scanPose.x) && Number.isFinite(point.scanPose.y))
            .map((point) => (
              <line
                key={`scan-${point.id}`}
                x1={sx(point.scanPose.x)}
                y1={sy(point.scanPose.y)}
                x2={sx(point.x)}
                y2={sy(point.y)}
                stroke="rgba(125,211,252,0.24)"
                strokeWidth="1.5"
                strokeDasharray="5 7"
              />
            ))}

          {currentRobotPose && (
            <g>
              <circle cx={sx(currentRobotPose.x)} cy={sy(currentRobotPose.y)} r="8" fill="#a78bfa" opacity="0.95" />
              <circle cx={sx(currentRobotPose.x)} cy={sy(currentRobotPose.y)} r="16" fill="none" stroke="rgba(167,139,250,0.35)" />
              <text x={sx(currentRobotPose.x) + 15} y={sy(currentRobotPose.y) - 10} fill="rgba(226,232,240,0.8)" fontSize="11">current robot</text>
            </g>
          )}

          {samples.map((point) => {
            const selected = selectedId === point.id;
            return (
              <g
                key={point.id}
                data-tomato-point="true"
                onClick={(event) => {
                  event.stopPropagation();
                  setTooltipPosition({ x: event.clientX, y: event.clientY });
                  onSelect(point);
                }}
                className="cursor-pointer"
              >
                <circle cx={sx(point.x)} cy={sy(point.y)} r={selected ? 15 : 10 + Math.min(point.count, 8)} fill={point.color} stroke={selected ? "#ffffff" : "rgba(255,255,255,0.42)"} strokeWidth={selected ? 3 : 1.5} />
                <text x={sx(point.x) + 13} y={sy(point.y) - 12} fill="rgba(226,232,240,0.78)" fontSize="11">{point.id}</text>
              </g>
            );
          })}
        </svg>

        <TooltipCard
          point={selectedPoint}
          position={tooltipPosition}
          timeScale={timeScale}
          onClose={() => {
            setTooltipPosition(null);
            onSelect(null);
          }}
        />
      </div>

      <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-4">
        <SpatialStatsView summary={spatialSummary} />
      </div>
    </div>

    <div className="mt-4 grid gap-3 text-xs text-slate-400 sm:grid-cols-4">
      <div><span className="inline-block h-3 w-3 rounded-full bg-violet-400" /> current robot pose</div>
      <div><span className="inline-block h-1 w-8 rounded-full bg-sky-300/50" /> scan link to tomato</div>
      <div><span className="inline-block h-3 w-8 rounded-full bg-gradient-to-r from-green-700 to-red-700" /> maturity score</div>
      <div><span className="inline-block h-3 w-8 rounded-full bg-cyan-400/60" /> uncertainty layer</div>
    </div>

    <MaturityLegend />
  </section>
);
}
