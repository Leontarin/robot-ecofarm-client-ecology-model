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

function TooltipCard({ point, sx, sy, timeScale }) {
  if (!point) return null;

  const x = sx(point.x);
  const y = sy(point.y);
  const width = 250;
  const height = 168;
  const offsetX = x > 455 ? -width - 18 : 18;
  const offsetY = y > 640 ? -height - 18 : 18;

  return (
    <foreignObject x={x + offsetX} y={y + offsetY} width={width} height={height}>
      <div className="rounded-2xl border border-slate-600 bg-slate-950/95 p-3 text-left shadow-2xl shadow-black/60">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300">Selected tomato cluster</div>
            <div className="mt-1 text-lg font-semibold text-white">{point.id}</div>
          </div>
          <span className="rounded-full border border-slate-700 px-2 py-1 text-[10px] font-semibold text-slate-300">class {point.classId}</span>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-xl bg-slate-900/90 p-2">
            <div className="text-slate-500">Maturity</div>
            <div className="font-semibold text-white">{Math.round(point.maturityScore * 100)}%</div>
          </div>
          <div className="rounded-xl bg-slate-900/90 p-2">
            <div className="text-slate-500">Confidence</div>
            <div className="font-semibold text-white">{Math.round(point.confidence * 100)}%</div>
          </div>
          <div className="rounded-xl bg-slate-900/90 p-2">
            <div className="text-slate-500">Count</div>
            <div className="font-semibold text-white">{point.count}</div>
          </div>
          <div className="rounded-xl bg-slate-900/90 p-2">
            <div className="text-slate-500">Seen at</div>
            <div className="font-semibold text-white">{formatTimelineTime(point.timestampMs, timeScale)}</div>
          </div>
        </div>
        <div className="mt-2 text-xs leading-5 text-slate-300">
          {point.label} · row {point.row}. Scanned from {point.scanPose?.aisle ?? "robot aisle"} at x={point.scanPose?.x?.toFixed(1)}m, y={point.scanPose?.y?.toFixed(1)}m.
        </div>
      </div>
    </foreignObject>
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
  const selectedPoint = samples.find((point) => point.id === selectedId) ?? null;

  return (
    <section className="rounded-[2rem] border border-slate-800 bg-slate-900/65 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-emerald-300">Spatial ecological model</div>
          <h2 className="mt-2 text-2xl font-semibold text-white">Top-down greenhouse maturity map</h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-400">
            The robot scans from aisles between rows. The map stacks all detections known up to the selected time bucket; only the current robot pose is shown, not the full robot path.
          </p>
        </div>
        <div className="rounded-full border border-slate-700 bg-slate-950/70 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">{layer}</div>
      </div>

      <div className="mt-5 overflow-hidden rounded-3xl border border-slate-800 bg-slate-950/80">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-[680px] w-full">
          <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(148,163,184,0.12)" strokeWidth="1" />
            </pattern>
            <marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth">
              <path d="M0,0 L0,6 L9,3 z" fill="rgba(167,139,250,0.95)" />
            </marker>
          </defs>

          <rect x="0" y="0" width={width} height={height} fill="#020617" />
          <rect x={pad} y={pad} width={width - pad * 2} height={height - pad * 2} fill="url(#grid)" stroke="rgba(56,189,248,0.25)" />

          {layout.aisles?.map((aisle) => (
            <g key={aisle.id}>
              <line x1={sx(aisle.x)} y1={sy(1.2)} x2={sx(aisle.x)} y2={sy(22.8)} stroke="rgba(148,163,184,0.22)" strokeWidth="10" strokeLinecap="round" />
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
                rx="12"
                fill="rgba(34,197,94,0.12)"
                stroke="rgba(34,197,94,0.24)"
              />
              <text x={sx(row.x) - 9} y={sy(row.y2) - 10} fill="rgba(226,232,240,0.62)" fontSize="12">{row.id}</text>
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
              opacity={layer === "uncertainty" ? cell.uncertainty * 0.65 : opacityForUncertainty(cell.uncertainty) * 0.55}
            />
          ))}

          {currentDetections.map((point) => (
            <line
              key={`scan-${point.id}`}
              x1={sx(point.scanPose.x)}
              y1={sy(point.scanPose.y)}
              x2={sx(point.x)}
              y2={sy(point.y)}
              stroke="rgba(125,211,252,0.22)"
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
              <g key={point.id} onClick={() => onSelect(point)} className="cursor-pointer">
                <circle cx={sx(point.x)} cy={sy(point.y)} r={selected ? 15 : 10 + Math.min(point.count, 8)} fill={point.color} stroke={selected ? "#ffffff" : "rgba(255,255,255,0.42)"} strokeWidth={selected ? 3 : 1.5} />
                <text x={sx(point.x) + 13} y={sy(point.y) - 12} fill="rgba(226,232,240,0.78)" fontSize="11">{point.id}</text>
              </g>
            );
          })}

          <TooltipCard point={selectedPoint} sx={sx} sy={sy} timeScale={timeScale} />
        </svg>
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
