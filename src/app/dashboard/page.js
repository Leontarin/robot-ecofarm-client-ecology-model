"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { fetchDashboardSessions, fetchMap } from "@/lib/api";
import MapPanel from "@/components/MapPanel";

const DEFAULT_FILTERS = {
  categories: {
    ripe_tomato: true,
    unripe_tomato: true,
    ripe_bunch: true,
    unripe_bunch: true,
    unknown: true,
  },
  quality: {
    strong: true,
    weak: true,
  },
};

const CATEGORY_OPTIONS = [
  { id: "ripe_tomato", label: "Ripe tomato", dot: "bg-emerald-400" },
  { id: "unripe_tomato", label: "Unripe tomato", dot: "bg-lime-400" },
  { id: "ripe_bunch", label: "Ripe bunch", dot: "bg-teal-400" },
  { id: "unripe_bunch", label: "Unripe bunch", dot: "bg-orange-400" },
  { id: "unknown", label: "Unknown", dot: "bg-slate-400" },
];

function formatNumber(value, digits = 1) {
  const num = Number(value);
  return Number.isFinite(num) ? num.toFixed(digits) : "—";
}

function formatInt(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num.toLocaleString("en-US") : "—";
}

function formatDateTime(value) {
  if (!value) return "—";
  return String(value);
}

function formatSessionLabel(session) {
  if (!session) return "Select scan session";
  return session.startedAt || session.label || session.id;
}

function Card({ children, className = "" }) {
  return (
    <section className={`rounded-[1.5rem] border border-slate-800 bg-slate-950/70 shadow-[0_18px_60px_rgba(2,6,23,0.24)] ${className}`}>
      {children}
    </section>
  );
}

function MiniMetric({ label, value, hint, tone = "slate" }) {
  const tones = {
    slate: "border-slate-800 bg-slate-950/70",
    cyan: "border-cyan-400/20 bg-cyan-400/8",
    emerald: "border-emerald-400/20 bg-emerald-400/8",
    amber: "border-amber-400/20 bg-amber-400/8",
    purple: "border-purple-400/20 bg-purple-400/8",
  };

  return (
    <div className={`rounded-2xl border px-3 py-2 ${tones[tone] ?? tones.slate}`}>
      <div className="text-[9px] font-semibold uppercase tracking-[0.22em] text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-semibold leading-none text-white">{value}</div>
      {hint && <div className="mt-1 truncate text-[11px] text-slate-400">{hint}</div>}
    </div>
  );
}

function ToggleChip({ checked, label, dotClass, onChange }) {
  return (
    <button
      type="button"
      onClick={onChange}
      className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left text-xs transition ${
        checked
          ? "border-cyan-400/35 bg-cyan-400/10 text-slate-100"
          : "border-slate-800 bg-slate-950/50 text-slate-500"
      }`}
    >
      <span className="flex items-center gap-2">
        {dotClass && <span className={`h-2.5 w-2.5 rounded-full ${dotClass}`} />}
        {label}
      </span>
      <span className="text-[10px]">{checked ? "ON" : "OFF"}</span>
    </button>
  );
}


function PanelChrome({ panelId, title, subtitle, accent = "cyan", collapsed, onToggle, children }) {
  const accentText = { cyan: "text-cyan-300", emerald: "text-emerald-300", purple: "text-purple-300", amber: "text-amber-300" }[accent] ?? "text-cyan-300";

  if (collapsed) {
    return (
      <Card className="flex items-center justify-between gap-3 px-3 py-2">
        <div className="min-w-0">
          <div className={`text-[9px] font-semibold uppercase tracking-[0.24em] ${accentText}`}>
            {title}
          </div>
          {subtitle && <div className="mt-0.5 truncate text-[11px] text-slate-500">{subtitle}</div>}
        </div>
        <button
          type="button"
          onClick={() => onToggle(panelId)}
          className="shrink-0 rounded-full border border-emerald-400/35 bg-emerald-400/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-100 hover:bg-emerald-400/15"
          aria-label={`Open ${title}`}
        >
          Open
        </button>
      </Card>
    );
  }

  return (
    <div className="relative group">
      {children}
      <button
        type="button"
        onClick={() => onToggle(panelId)}
        className="absolute -right-1.5 -top-1.5 z-20 flex h-5 w-5 items-center justify-center rounded-full border border-red-200/70 bg-red-600 text-[13px] font-black leading-none text-white shadow-[0_0_16px_rgba(220,38,38,0.35)] transition hover:scale-105 hover:bg-red-500"
        aria-label={`Collapse ${title}`}
        title={`Minimize ${title}`}
      >
        −
      </button>
    </div>
  );
}

function readCollapsedPanels() {
  if (typeof window === "undefined") {
    return { environment: true, filters: true };
  }
  try {
    const raw = window.localStorage.getItem("rbv2-dashboard-collapsed-panels");
    if (!raw) return { environment: true, filters: true };
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : { environment: true, filters: true };
  } catch {
    return { environment: true, filters: true };
  }
}

function writeCollapsedPanels(value) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem("rbv2-dashboard-collapsed-panels", JSON.stringify(value));
  } catch {
    // localStorage may be unavailable in private browser modes.
  }
}

function FiltersPanel({ filters, setFilters, visibleCount, totalCount }) {
  function toggleCategory(categoryId) {
    setFilters((current) => ({
      ...current,
      categories: {
        ...current.categories,
        [categoryId]: !current.categories[categoryId],
      },
    }));
  }

  function toggleQuality(qualityId) {
    setFilters((current) => ({
      ...current,
      quality: {
        ...current.quality,
        [qualityId]: !current.quality[qualityId],
      },
    }));
  }

  return (
    <Card className="p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[9px] font-semibold uppercase tracking-[0.24em] text-cyan-300">
            Detection Filters
          </div>
          <h3 className="mt-0.5 text-sm font-semibold text-white">Tomato markers</h3>
        </div>
        <div className="rounded-full border border-slate-700 bg-slate-900 px-2.5 py-1 text-[11px] text-slate-300">
          {visibleCount}/{totalCount}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        {CATEGORY_OPTIONS.map((option) => (
          <ToggleChip
            key={option.id}
            checked={filters.categories[option.id]}
            label={option.label}
            dotClass={option.dot}
            onChange={() => toggleCategory(option.id)}
          />
        ))}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <ToggleChip
          checked={filters.quality.strong}
          label="Strong"
          dotClass="bg-emerald-400"
          onChange={() => toggleQuality("strong")}
        />
        <ToggleChip
          checked={filters.quality.weak}
          label="Weak"
          dotClass="bg-amber-400"
          onChange={() => toggleQuality("weak")}
        />
      </div>
    </Card>
  );
}

function TimelineControl({ map, playbackIndex, setPlaybackIndex, visibleDetections }) {
  const trail = map?.trail ?? [];
  const maxIndex = Math.max(0, trail.length - 1);
  const current = trail[playbackIndex] ?? trail[0] ?? null;
  const progress = maxIndex > 0 ? Math.round((playbackIndex / maxIndex) * 100) : 0;

  return (
    <Card className="p-3">
      <div className="text-[9px] font-semibold uppercase tracking-[0.26em] text-purple-300">
        Scan Playback
      </div>
      <div className="mt-1 flex items-end justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-white">Manual timeline</h3>
          <p className="mt-0.5 text-[11px] leading-4 text-slate-400">
            Move the bar to reveal route and detections.
          </p>
        </div>
        <div className="rounded-full border border-slate-700 bg-slate-900 px-2 py-1 text-[10px] text-slate-400">
          {progress}%
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[10px] text-slate-300">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 px-2 py-2">
          <div className="text-slate-500">Time</div>
          <div className="mt-1 font-semibold text-white">{current?.timestampLocal?.slice(-8) ?? "—"}</div>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 px-2 py-2">
          <div className="text-slate-500">Route</div>
          <div className="mt-1 font-semibold text-white">{playbackIndex + 1}/{trail.length || 1}</div>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 px-2 py-2">
          <div className="text-slate-500">Findings</div>
          <div className="mt-1 font-semibold text-white">{visibleDetections.length}</div>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setPlaybackIndex(0)}
          className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800"
        >
          Start
        </button>
        <input
          type="range"
          min="0"
          max={maxIndex}
          value={playbackIndex}
          onChange={(event) => setPlaybackIndex(Number(event.target.value))}
          className="h-2 min-w-0 flex-1 cursor-pointer accent-cyan-400"
          aria-label="Scan playback timeline"
        />
        <button
          type="button"
          onClick={() => setPlaybackIndex(maxIndex)}
          className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800"
        >
          End
        </button>
      </div>

      <div className="mt-2 flex items-center justify-between text-[10px] text-slate-500">
        <span>{map?.session?.startedAt?.slice(-8) ?? "start"}</span>
        <span>{map?.session?.stoppedAt?.slice(-8) ?? "end"}</span>
      </div>
    </Card>
  );
}

function EnvironmentSnapshot({ sample, stats }) {
  const gasValue = Number.isFinite(sample?.gasKohm)
    ? `${formatNumber(sample.gasKohm, 1)} kΩ`
    : Number.isFinite(sample?.gasDeltaPct)
      ? `${formatNumber(sample.gasDeltaPct, 1)}%`
      : "—";

  const gasHint = Number.isFinite(sample?.gasKohm)
    ? "Gas resistance"
    : Number.isFinite(sample?.gasDeltaPct)
      ? "Change from start"
      : "No gas data";

  return (
    <Card className="p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[9px] font-semibold uppercase tracking-[0.26em] text-emerald-300">
            Environment
          </div>
          <h3 className="mt-0.5 text-sm font-semibold text-white">Sensor snapshot</h3>
        </div>
        <div className="rounded-full border border-slate-700 bg-slate-900 px-2 py-1 text-[10px] text-slate-400">
          {sample?.timestampLocal?.slice(-8) ?? "—"}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <MiniMetric label="Temp" value={`${formatNumber(sample?.tempC, 1)}°C`} hint="Greenhouse air" tone="emerald" />
        <MiniMetric label="Humidity" value={`${formatNumber(sample?.humidityPct, 1)}%`} hint="Relative humidity" tone="cyan" />
        <MiniMetric label="Gas" value={gasValue} hint={gasHint} tone="amber" />
        <MiniMetric label="Pressure" value={`${formatNumber(sample?.pressureHpa, 1)}`} hint="hPa" tone="purple" />
      </div>

      {stats?.samples ? (
        <div className="mt-2 text-[10px] text-slate-500">
          {stats.samples} sensor samples synced with the scan timeline.
        </div>
      ) : null}
    </Card>
  );
}


function percent(value, digits = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? `${(num * 100).toFixed(digits)}%` : "—";
}

function bboxColor(candidate) {
  if (candidate?.weak) return "#22d3ee";
  switch (candidate?.category) {
    case "ripe_bunch":
      return "#a855f7";
    case "unripe_bunch":
      return "#f97316";
    case "ripe_tomato":
      return "#ef4444";
    case "unripe_tomato":
      return "#22c55e";
    default:
      return "#94a3b8";
  }
}

function bboxColorName(candidate) {
  if (candidate?.weak) return "Weak detection / cyan";
  switch (candidate?.category) {
    case "ripe_bunch":
      return "Ripe bunch / purple";
    case "unripe_bunch":
      return "Unripe bunch / orange";
    case "ripe_tomato":
      return "Ripe tomato / red";
    case "unripe_tomato":
      return "Unripe tomato / green";
    default:
      return "Unknown / gray";
  }
}

function normalizeReasonLabel(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return raw.replaceAll("_", " ");
}

function candidateTypeLabel(candidate) {
  const reason = String(candidate?.roi?.reason || "").toLowerCase();
  if (candidate?.roi?.pass && (candidate?.weak || reason.includes("weak"))) return "ROI weak";
  if (candidate?.roi?.pass) return "ROI re-check";
  if (reason.includes("weak")) return "ROI weak";
  if (reason) return "ROI review";
  if (candidate?.weak) return "Weak";
  return "Strong";
}

function candidateRoiLabel(candidate) {
  const reason = normalizeReasonLabel(candidate?.roi?.reason);
  if (reason) return reason;
  if (candidate?.roi?.pass) return `pass · group ${candidate.roi.groupSize || 0}`;
  if (candidate?.displaySource) return normalizeReasonLabel(candidate.displaySource);
  if (candidate?.promotionReason) return normalizeReasonLabel(candidate.promotionReason);
  return "—";
}

function candidateShortLabel(candidate) {
  return candidate?.categoryLabel || candidate?.label || "candidate";
}

function candidateConfLabel(candidate) {
  return Number.isFinite(Number(candidate?.confidencePct)) ? `${candidate.confidencePct}%` : "conf —";
}

function collectRoiKinds(evidence) {
  const candidates = [...(evidence?.finalCandidates ?? []), ...(evidence?.rawCandidates ?? [])];
  const kinds = new Set();
  for (const candidate of candidates) {
    const label = candidateShortLabel(candidate);
    const conf = candidateConfLabel(candidate);
    const reason = normalizeReasonLabel(candidate?.roi?.reason);
    if (reason) kinds.add(`${label} ${conf}: ${reason}`);
    if (candidate?.roi?.pass) kinds.add(`${label} ${conf}: roi pass`);
    if (candidate?.displaySource) kinds.add(`${label}: ${normalizeReasonLabel(candidate.displaySource)}`);
    if (candidate?.rejectReason) kinds.add(`rejected ${label} ${conf}: ${normalizeReasonLabel(candidate.rejectReason)}`);
  }
  return [...kinds].filter(Boolean);
}

function imageSourceForEvidence(evidence, detection) {
  return evidence?.image?.rawUrl || detection?.image?.rawUrl || evidence?.image?.annotatedUrl || detection?.image?.annotatedUrl;
}

function finalFrameBoxes(evidence) {
  const finalBoxes = evidence?.finalCandidates ?? [];
  if (finalBoxes.length) return finalBoxes;
  return evidence?.rawCandidates ?? [];
}

function EvidenceFrameViewer({ evidence, detection, selectedBoxId, onSelectBox }) {
  const dragRef = useRef({ active: false, x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [showAnnotations, setShowAnnotations] = useState(true);

  const src = imageSourceForEvidence(evidence, detection);
  const allBoxes = finalFrameBoxes(evidence);
  const visibleBoxes = showAnnotations
    ? selectedBoxId
      ? allBoxes.filter((box) => box.id === selectedBoxId)
      : allBoxes
    : [];
  const frameWidth = Number(evidence?.frame?.width) || 1280;
  const frameHeight = Number(evidence?.frame?.height) || 720;

  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setShowAnnotations(true);
  }, [src, evidence?.key]);

  function clampZoom(value) {
    return Math.min(6, Math.max(1, value));
  }

  function changeZoom(multiplier) {
    setZoom((current) => clampZoom(current * multiplier));
  }

  function resetView() {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }

  function handleMouseDown(event) {
    if (zoom <= 1) return;
    dragRef.current = { active: true, x: event.clientX, y: event.clientY };
  }

  function handleMouseMove(event) {
    if (!dragRef.current.active) return;
    const dx = event.clientX - dragRef.current.x;
    const dy = event.clientY - dragRef.current.y;
    dragRef.current.x = event.clientX;
    dragRef.current.y = event.clientY;
    setPan((current) => ({ x: current.x + dx, y: current.y + dy }));
  }

  function stopDrag() {
    dragRef.current.active = false;
  }

  return (
    <div className="flex h-full min-h-0 flex-col rounded-[1.4rem] border border-slate-700 bg-slate-900/60">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-700 bg-slate-900/70 px-3 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowAnnotations((current) => !current)}
            className={`rounded-xl border px-3 py-2 text-xs font-semibold transition ${
              showAnnotations
                ? "border-cyan-300 bg-cyan-400/15 text-cyan-100"
                : "border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800"
            }`}
          >
            {showAnnotations ? "Clean image" : "Show annotations"}
          </button>
          {selectedBoxId ? (
            <button
              type="button"
              onClick={() => onSelectBox(null)}
              className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800"
            >
              Show all BBOX
            </button>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <button type="button" onClick={() => changeZoom(1.25)} className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 font-semibold text-slate-200 hover:bg-slate-800">Zoom +</button>
          <button type="button" onClick={() => changeZoom(1 / 1.25)} className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 font-semibold text-slate-200 hover:bg-slate-800">Zoom -</button>
          <button type="button" onClick={resetView} className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 font-semibold text-slate-200 hover:bg-slate-800">Reset</button>
          <div className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-2 font-semibold text-cyan-100">{Math.round(zoom * 100)}%</div>
        </div>
      </div>

      <div
        className={`relative min-h-0 flex-1 overflow-hidden rounded-b-[1.4rem] bg-black ${zoom > 1 ? "cursor-grab active:cursor-grabbing" : "cursor-default"}`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={stopDrag}
        onMouseLeave={stopDrag}
        onDoubleClick={resetView}
      >
        {src ? (
          <svg
            viewBox={`0 0 ${frameWidth} ${frameHeight}`}
            preserveAspectRatio="xMidYMid meet"
            className="h-full w-full select-none transition-transform duration-75"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: "center center",
            }}
          >
            <image href={src} x="0" y="0" width={frameWidth} height={frameHeight} preserveAspectRatio="xMidYMid meet" />
            {visibleBoxes.map((box) => {
              const bbox = box.bbox;
              if (!bbox?.valid) return null;
              const color = bboxColor(box);
              const selected = box.id === selectedBoxId;
              const label = `${box.categoryLabel} ${box.confidencePct ?? "—"}%${box.weak ? " weak" : ""}`;
              return (
                <g key={box.id} onClick={(event) => { event.stopPropagation(); onSelectBox(box.id); }} className="cursor-pointer">
                  <rect
                    x={bbox.x}
                    y={bbox.y}
                    width={bbox.w}
                    height={bbox.h}
                    fill="transparent"
                    stroke={selected ? "#fde047" : color}
                    strokeWidth={selected ? 6 : 4}
                    vectorEffect="non-scaling-stroke"
                    rx="4"
                  />
                  <rect
                    x={bbox.x}
                    y={Math.max(0, bbox.y - 26)}
                    width={Math.min(frameWidth - bbox.x, Math.max(118, label.length * 8 + 20))}
                    height="26"
                    fill={selected ? "#fde047" : color}
                    opacity="0.94"
                    rx="4"
                  />
                  <text
                    x={bbox.x + 6}
                    y={Math.max(17, bbox.y - 8)}
                    fill={selected ? "#111827" : "#020617"}
                    fontSize="15"
                    fontWeight="800"
                  >
                    {label}
                  </text>
                </g>
              );
            })}
          </svg>
        ) : (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-slate-500">
            No raw or annotated frame was found for this detection.
          </div>
        )}
      </div>
    </div>
  );
}

function EvidenceInsightSummary({ evidence, detection }) {
  const boxes = finalFrameBoxes(evidence);
  const summary = evidence?.summary;
  const roiKinds = collectRoiKinds(evidence);
  const hasSupportedCluster = boxes.some((box) => box.support?.memberCount > 0 || String(box.displaySource || "").includes("supported"));
  const conflictCount = summary?.conflictCount ?? 0;
  const weakCount = boxes.filter((box) => box.weak).length;
  const strongCount = boxes.filter((box) => !box.weak).length;

  let mainNote = "Review the frame evidence before treating the map point as a precise agronomic finding.";
  if (conflictCount > 0) {
    mainNote = "Model review recommended: ROI or child-tomato evidence may not fully agree with the cluster label.";
  } else if (hasSupportedCluster) {
    mainNote = "Cluster decision is supported by single-tomato evidence inside or near the ROI.";
  } else if (weakCount > strongCount) {
    mainNote = "Many detections in this frame are weak, so the result should be treated as lower confidence.";
  }

  return (
    <div className="rounded-[1.2rem] border border-slate-700 bg-slate-900/70 p-3">
      <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-amber-300">Frame insight</div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <MiniMetric label="Objects" value={formatInt(boxes.length)} hint={`${strongCount} strong / ${weakCount} weak`} tone="cyan" />
        <MiniMetric label="ROI re-checks" value={formatInt(summary?.final?.roiPass ?? 0)} hint={roiKinds[0] || "metadata"} tone={(summary?.final?.roiPass ?? 0) ? "purple" : "slate"} />
        <MiniMetric label="Raw candidates" value={formatInt(summary?.raw?.total)} hint="before filtering" tone="purple" />
        <MiniMetric label="Map X/Y" value={`${formatNumber(detection?.projection?.x, 2)} / ${formatNumber(detection?.projection?.y, 2)} m`} hint="estimated" tone="slate" />
      </div>
      <div className="mt-3 rounded-2xl border border-slate-800 bg-slate-900/50 p-3 text-xs leading-5 text-slate-300">
        {mainNote}
      </div>
      {roiKinds.length ? (
        <div className="mt-2 max-h-24 overflow-auto pr-1">
          <div className="flex flex-wrap gap-2">
          {roiKinds.slice(0, 10).map((kind) => (
            <span key={kind} className="rounded-xl border border-cyan-400/20 bg-cyan-400/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-cyan-100">
              {kind}
            </span>
          ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function FrameBoxList({ boxes, selectedBoxId, onSelectBox }) {
  if (!boxes.length) {
    return <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-3 text-xs text-slate-500">No BBOX metadata was found for this frame.</div>;
  }

  return (
    <div className="max-h-[260px] overflow-auto rounded-2xl border border-slate-800 bg-slate-950/60">
      <table className="w-full text-left text-[11px] text-slate-300">
        <thead className="sticky top-0 bg-slate-950 text-slate-500">
          <tr>
            <th className="px-3 py-2">#</th>
            <th className="px-3 py-2">Label</th>
            <th className="px-3 py-2">Conf</th>
            <th className="px-3 py-2">Type</th>
            <th className="px-3 py-2">ROI / Source</th>
          </tr>
        </thead>
        <tbody>
          {boxes.map((box, index) => {
            const selected = box.id === selectedBoxId;
            const color = bboxColor(box);
            return (
              <tr
                key={box.id}
                onClick={() => onSelectBox(box.id)}
                className={`cursor-pointer border-t border-slate-900 transition hover:bg-slate-900/80 ${selected ? "bg-amber-400/10 text-amber-100" : ""}`}
              >
                <td className="px-3 py-2">{index + 1}</td>
                <td className="px-3 py-2 font-semibold">
                  <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
                  {box.categoryLabel}
                </td>
                <td className="px-3 py-2">{box.confidencePct ?? "—"}%</td>
                <td className="px-3 py-2">{candidateTypeLabel(box)}</td>
                <td className="max-w-[170px] truncate px-3 py-2" title={candidateRoiLabel(box)}>{candidateRoiLabel(box)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SelectedBoxDetails({ box }) {
  if (!box) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-3 text-xs leading-5 text-slate-500">
        Select a row from the Frame BBOX list to isolate one BBOX on the image and inspect its full metadata.
      </div>
    );
  }

  return (
    <div className="grid gap-2">
      <div className="grid grid-cols-2 gap-2">
        <Info label="Label" value={box.label} />
        <Info label="Confidence" value={`${box.confidencePct ?? "—"}%`} />
        <Info label="Type" value={candidateTypeLabel(box)} />
        <Info label="Color rule" value={bboxColorName(box)} />
        <Info label="BBox" value={box.bbox?.valid ? `${formatNumber(box.bbox.x, 0)}, ${formatNumber(box.bbox.y, 0)}, ${formatNumber(box.bbox.w, 0)}×${formatNumber(box.bbox.h, 0)}` : "—"} />
        <Info label="Track" value={box.trackId >= 0 ? `#${box.trackId} · hits ${box.trackHits}` : "—"} />
      </div>

      {(box.roi?.pass || box.roi?.reason || box.rejectReason || box.displaySource || box.support?.memberCount) ? (
        <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 p-3 text-xs leading-5 text-cyan-50">
          {box.roi?.pass ? <div>ROI re-check passed · group size {box.roi.groupSize}</div> : null}
          {box.roi?.reason ? <div>ROI reason: {normalizeReasonLabel(box.roi.reason)}</div> : null}
          {box.displaySource ? <div>Display source: {normalizeReasonLabel(box.displaySource)}</div> : null}
          {box.rejectReason ? <div className="text-amber-100">Review / rejection: {normalizeReasonLabel(box.rejectReason)}</div> : null}
          {box.support?.memberCount ? <div>Support: {box.support.memberCount} members · ripe {box.support.ripeCount} / unripe {box.support.unripeCount}</div> : null}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-2">
        <Info label="Mask density" value={box.metrics?.maskDensity == null ? "—" : percent(box.metrics.maskDensity, 0)} />
        <Info label="Warm color" value={box.metrics?.warmRatio == null ? "—" : percent(box.metrics.warmRatio, 0)} />
        <Info label="Red ratio" value={box.metrics?.redRatio == null ? "—" : percent(box.metrics.redRatio, 0)} />
        <Info label="Green/yellow" value={box.metrics?.greenYellowRatio == null ? "—" : percent(box.metrics.greenYellowRatio, 0)} />
      </div>
    </div>
  );
}

function FullMetadataJson({ evidence, selectedBox }) {
  const payload = selectedBox
    ? selectedBox
    : {
        frame: evidence?.frame,
        summary: evidence?.summary,
        reviewTags: evidence?.reviewTags,
        roiInsights: evidence?.roiInsights,
        image: evidence?.image,
      };

  return (
    <details className="rounded-2xl border border-slate-800 bg-slate-950/70 p-3 text-xs text-slate-400" open>
      <summary className="cursor-pointer font-semibold text-slate-200">Full metadata JSON</summary>
      <pre className="mt-3 max-h-[240px] overflow-auto whitespace-pre-wrap text-[10px] leading-4 text-slate-400">
        {JSON.stringify(payload, null, 2)}
      </pre>
    </details>
  );
}

function DetectionEvidenceModal({ detection, evidence, onClose }) {
  const [selectedBoxId, setSelectedBoxId] = useState(null);

  useEffect(() => {
    setSelectedBoxId(null);
  }, [detection?.id, evidence?.key]);

  useEffect(() => {
    if (!detection) return undefined;
    function onKeyDown(event) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [detection, onClose]);

  if (!detection) return null;

  const boxes = finalFrameBoxes(evidence);
  const selectedBox = selectedBoxId ? boxes.find((box) => box.id === selectedBoxId) ?? null : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/78 p-3 backdrop-blur-sm">
      <section className="flex h-[92vh] w-[min(1680px,98vw)] flex-col overflow-hidden rounded-[1.7rem] border border-slate-600 bg-slate-900 shadow-[0_30px_120px_rgba(0,0,0,0.68),0_0_0_1px_rgba(34,211,238,0.06)]">
        <div className="flex flex-none flex-wrap items-start justify-between gap-3 border-b border-slate-700 bg-slate-900/95 px-5 py-3">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.32em] text-amber-300">Detection Evidence Review</div>
            <h3 className="mt-1 text-2xl font-semibold text-white">{detection.categoryLabel}</h3>
            <p className="text-sm text-slate-400">{detection.timestampLocal ?? "No timestamp"}</p>
            {evidence?.reviewTags?.length ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {evidence.reviewTags.map((tag) => (
                  <span key={tag} className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-100">
                    {tag}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
          <div className="flex items-center gap-3">
            <span className={`rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] ${detection.weak ? "border-amber-400/35 bg-amber-400/10 text-amber-200" : "border-emerald-400/35 bg-emerald-400/10 text-emerald-200"}`}>
              {detection.weak ? "Weak" : "Strong"}
            </span>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-800"
            >
              Close
            </button>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 gap-4 overflow-hidden p-3 lg:grid-cols-[minmax(0,1.35fr)_470px]">
          <div className="min-h-0">
            <EvidenceFrameViewer
              evidence={evidence}
              detection={detection}
              selectedBoxId={selectedBoxId}
              onSelectBox={setSelectedBoxId}
            />
          </div>

          <aside className="grid min-h-0 content-start gap-3 overflow-y-auto overflow-x-hidden pr-2">
            <EvidenceInsightSummary evidence={evidence} detection={detection} />

            <div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">Frame BBOX list</div>
                {selectedBoxId ? (
                  <button type="button" onClick={() => setSelectedBoxId(null)} className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-[10px] font-semibold text-slate-300 hover:bg-slate-800">
                    Show all
                  </button>
                ) : null}
              </div>
              <FrameBoxList boxes={boxes} selectedBoxId={selectedBoxId} onSelectBox={setSelectedBoxId} />
            </div>

            <div>
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">Selected BBOX details</div>
              <SelectedBoxDetails box={selectedBox} />
            </div>

            <FullMetadataJson evidence={evidence} selectedBox={selectedBox} />
          </aside>
        </div>
      </section>
    </div>
  );
}

function Info({ label, value }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 px-3 py-2">
      <div className="text-[9px] uppercase tracking-[0.22em] text-slate-500">{label}</div>
      <div className="mt-1 font-semibold text-white">{value ?? "—"}</div>
    </div>
  );
}

function VideoPanel({ map }) {
  const videoRef = useRef(null);
  const videoUrl = map?.media?.videoUrl;
  const [videoError, setVideoError] = useState(false);

  useEffect(() => {
    setVideoError(false);
  }, [videoUrl]);

  function jump(seconds) {
    if (!videoRef.current) return;
    videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime + seconds);
  }

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-slate-800 px-3 py-2.5">
        <div className="text-[9px] font-semibold uppercase tracking-[0.26em] text-emerald-300">
          Robot Video
        </div>
        <h3 className="mt-0.5 text-sm font-semibold text-white">Scan recording</h3>
      </div>

      {videoUrl ? (
        <>
          <div className="bg-black p-2">
            <video
              ref={videoRef}
              className="max-h-[170px] w-full rounded-2xl border border-slate-800 bg-black object-contain"
              controls
              preload="metadata"
              onError={() => setVideoError(true)}
            >
              <source src={videoUrl} type={map?.media?.mimeType || "video/mp4"} />
            </video>
          </div>
          <div className="grid grid-cols-4 gap-2 px-3 py-2.5">
            <button className="rounded-xl border border-slate-700 bg-slate-900 px-2 py-1.5 text-[11px] text-slate-200 hover:bg-slate-800" onClick={() => videoRef.current?.play()} type="button">
              Play
            </button>
            <button className="rounded-xl border border-slate-700 bg-slate-900 px-2 py-1.5 text-[11px] text-slate-200 hover:bg-slate-800" onClick={() => videoRef.current?.pause()} type="button">
              Pause
            </button>
            <button className="rounded-xl border border-slate-700 bg-slate-900 px-2 py-1.5 text-[11px] text-slate-200 hover:bg-slate-800" onClick={() => jump(-5)} type="button">
              -5s
            </button>
            <button className="rounded-xl border border-slate-700 bg-slate-900 px-2 py-1.5 text-[11px] text-slate-200 hover:bg-slate-800" onClick={() => jump(5)} type="button">
              +5s
            </button>
          </div>
          {videoError && (
            <div className="mx-3 mb-3 rounded-2xl border border-amber-400/20 bg-amber-400/10 p-3 text-xs leading-5 text-amber-100">
              The video file was found, but the browser cannot play its codec. Run <span className="font-semibold">npm run prepare-dashboard-media</span> locally, or let Vercel run the same step during build, to create a browser-ready H.264 copy.
            </div>
          )}
        </>
      ) : (
        <div className="p-4 text-sm text-slate-400">No video file was found in this session.</div>
      )}
    </Card>
  );
}


function DashboardHeaderPanel({
  map,
  sessions,
  selectedSession,
  setSelectedSession,
  selectedSessionItem,
  open,
  setOpen,
}) {
  const stats = map?.stats?.detections ?? {};
  const byCategory = stats.byCategory ?? {};
  const expanded = open || !map;

  return (
    <section className="overflow-hidden rounded-[1.35rem] border border-slate-800 bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.13),_transparent_28%),radial-gradient(circle_at_top_right,_rgba(56,189,248,0.12),_transparent_24%),linear-gradient(180deg,rgba(2,6,23,0.97),rgba(15,23,42,0.88))] shadow-[0_18px_55px_rgba(2,6,23,0.42)]">
      <div className="flex flex-col gap-3 px-4 py-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0">
          <div className="text-[9px] font-semibold uppercase tracking-[0.32em] text-emerald-300">Robot Eco Farm</div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="text-xl font-semibold tracking-tight text-white xl:text-2xl">Greenhouse Scan Dashboard</h1>
            <span className="max-w-full truncate rounded-full border border-slate-700 bg-slate-950/65 px-3 py-1 text-[11px] text-slate-300">
              {selectedSessionItem ? formatSessionLabel(selectedSessionItem) : "No scan selected"}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
          <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1">Total {formatInt(stats.total)}</span>
          <span className="rounded-full border border-purple-400/20 bg-purple-400/10 px-3 py-1">Strong / Weak {formatInt(stats.strong)} / {formatInt(stats.weak)}</span>
          <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1">Distance {formatNumber(stats.estimatedScannedDistanceM, 2)} m</span>
          <span className="rounded-full border border-slate-700 bg-slate-950/70 px-3 py-1">Route {formatInt(map?.stats?.trailPoints)}</span>
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 font-semibold text-slate-100 transition hover:border-cyan-400/40 hover:bg-cyan-400/10"
          >
            {expanded ? "Minimize setup" : "Session / summary"}
          </button>
        </div>
      </div>

      {expanded ? (
        <div className="grid gap-3 border-t border-slate-800 px-4 py-3 xl:grid-cols-[minmax(0,1fr)_minmax(380px,560px)] xl:items-start">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-3 backdrop-blur">
            <label className="text-[10px] font-semibold uppercase tracking-[0.28em] text-slate-400">
              Scan Session
            </label>
            <select
              value={selectedSession}
              onChange={(event) => setSelectedSession(event.target.value)}
              className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white outline-none focus:border-cyan-400"
            >
              {sessions.map((session) => (
                <option key={session.id} value={session.id}>
                  {formatSessionLabel(session)} — {session.id}
                  {!session.mapAvailable ? " — no ROS2 map" : ""}
                </option>
              ))}
            </select>
            <div className="mt-2 text-xs text-slate-400">
              {selectedSessionItem
                ? `${selectedSessionItem.counts?.detectionEvents ?? 0} detection events · ${selectedSessionItem.counts?.poseRows ?? 0} route samples${selectedSessionItem.mapAvailable ? "" : " · missing ROS2 map files"}`
                : "Place session folders under src/session-data"}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <MiniMetric label="Ripe tomatoes" value={formatInt(byCategory.ripe_tomato)} hint="single ripe" tone="emerald" />
            <MiniMetric label="Unripe tomatoes" value={formatInt(byCategory.unripe_tomato)} hint="single unripe" tone="amber" />
            <MiniMetric label="Ripe bunches" value={formatInt(byCategory.ripe_bunch)} hint="clusters" tone="emerald" />
            <MiniMetric label="Unripe bunches" value={formatInt(byCategory.unripe_bunch)} hint="clusters" tone="amber" />
            <MiniMetric label="First detection" value={formatDateTime(stats.firstDetectionTime)} hint="start" tone="slate" />
            <MiniMetric label="Last detection" value={formatDateTime(stats.lastDetectionTime)} hint="end" tone="slate" />
            <MiniMetric label="Environment" value={formatInt(map?.environment?.stats?.samples)} hint="samples" tone="purple" />
            <MiniMetric label="Session date" value={map?.session?.startedAt?.slice(0, 10) ?? "—"} hint={map?.session?.startedAt?.slice(-8) ?? "date"} tone="slate" />
          </div>
        </div>
      ) : null}
    </section>
  );
}


function reviewedStorageKey(sessionId) {
  return sessionId ? `rbv2.dashboard.reviewedDetections.${sessionId}` : "";
}

function readReviewedDetectionIds(sessionId) {
  if (typeof window === "undefined" || !sessionId) return new Set();
  try {
    const raw = window.localStorage.getItem(reviewedStorageKey(sessionId));
    const ids = JSON.parse(raw || "[]");
    return new Set(Array.isArray(ids) ? ids.filter(Boolean) : []);
  } catch {
    return new Set();
  }
}

function writeReviewedDetectionIds(sessionId, ids) {
  if (typeof window === "undefined" || !sessionId) return;
  try {
    window.localStorage.setItem(reviewedStorageKey(sessionId), JSON.stringify([...ids]));
  } catch {
    // Local storage can fail in private mode; the dashboard should still work for the current page state.
  }
}

function DetectionReviewList({
  detections,
  reviewedIds,
  focusedDetectionId,
  reviewMode,
  onReviewModeChange,
  onFocusDetection,
  onOpenEvidence,
  onReturnToMap,
  onClearReviewed,
}) {
  const allCount = detections.length;
  const reviewedCount = detections.filter((detection) => reviewedIds.has(detection.id)).length;
  const pendingCount = Math.max(0, allCount - reviewedCount);
  const listDetections = detections.filter((detection) => {
    const reviewed = reviewedIds.has(detection.id);
    if (reviewMode === "pending") return !reviewed;
    if (reviewMode === "checked") return reviewed;
    return true;
  });

  const reviewTabs = [
    { id: "all", label: "All", count: allCount, hint: "filtered" },
    { id: "pending", label: "Pending", count: pendingCount, hint: "still on map" },
    { id: "checked", label: "Checked", count: reviewedCount, hint: "reviewed" },
  ];

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-slate-800 px-3 py-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.28em] text-purple-300">
              Review Checklist
            </div>
            <h3 className="mt-1 text-sm font-semibold text-white">Filtered map points</h3>
            <p className="mt-1 text-[11px] leading-4 text-slate-400">
              Checked markers are hidden until you return them.
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            <div className="rounded-full border border-purple-400/25 bg-purple-400/10 px-3 py-1 text-xs font-semibold text-purple-100">
              {reviewedCount}/{allCount}
            </div>
            <button
              type="button"
              onClick={onClearReviewed}
              disabled={reviewedCount === 0}
              className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-300 transition hover:border-rose-400/40 hover:bg-rose-400/10 hover:text-rose-100 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-slate-700 disabled:hover:bg-slate-900 disabled:hover:text-slate-300"
              title="Return all checked points to the map for this session"
            >
              Reset checked
            </button>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2">
          {reviewTabs.map((tab) => {
            const active = reviewMode === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onReviewModeChange(tab.id)}
                className={`rounded-2xl border px-2.5 py-2 text-left transition ${
                  active
                    ? tab.id === "checked"
                      ? "border-purple-300/45 bg-purple-400/18 text-purple-50 shadow-[0_0_0_1px_rgba(216,180,254,0.12)]"
                      : tab.id === "pending"
                        ? "border-cyan-300/45 bg-cyan-400/16 text-cyan-50 shadow-[0_0_0_1px_rgba(34,211,238,0.12)]"
                        : "border-slate-400/45 bg-slate-400/12 text-white shadow-[0_0_0_1px_rgba(148,163,184,0.1)]"
                    : "border-slate-800 bg-slate-950/55 text-slate-400 hover:border-cyan-400/25 hover:bg-slate-900/70"
                }`}
              >
                <div className="text-[9px] font-semibold uppercase tracking-[0.22em] text-slate-500">{tab.label}</div>
                <div className="mt-1 text-lg font-semibold leading-none text-white">{formatInt(tab.count)}</div>
                <div className="mt-1 truncate text-[11px] text-slate-400">{tab.hint}</div>
              </button>
            );
          })}
        </div>
      </div>

      {listDetections.length ? (
        <div className="max-h-[calc(100vh-430px)] min-h-[260px] overflow-auto p-2">
          <div className="grid gap-2">
            {listDetections.map((detection, index) => {
              const reviewed = reviewedIds.has(detection.id);
              const focused = focusedDetectionId === detection.id;
              const color = detection.weak ? "bg-amber-400" : "bg-emerald-400";
              return (
                <div
                  key={detection.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => onFocusDetection(detection)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") onFocusDetection(detection);
                  }}
                  className={`rounded-2xl border p-3 text-left transition ${
                    focused
                      ? "border-purple-300 bg-purple-400/15 shadow-[0_0_0_1px_rgba(216,180,254,0.16)]"
                      : reviewed
                        ? "border-slate-700 bg-slate-900/70"
                        : "border-slate-800 bg-slate-950/55 hover:border-cyan-400/30 hover:bg-slate-900/70"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-sm font-semibold text-white">
                        <span className="text-xs text-slate-500">#{index + 1}</span>
                        <span className={`h-2.5 w-2.5 rounded-full ${reviewed ? "bg-purple-300" : color}`} />
                        <span className="truncate">{detection.categoryLabel}</span>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-slate-400">
                        <span>{detection.timestampLocal?.slice(-8) ?? "—"}</span>
                        <span>{detection.confidencePct ?? "—"}%</span>
                        <span>{detection.weak ? "weak" : "strong"}</span>
                        <span>{formatNumber(detection.projection?.x, 2)} / {formatNumber(detection.projection?.y, 2)} m</span>
                      </div>
                    </div>
                    <span className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${
                      reviewed
                        ? "border-purple-300/30 bg-purple-400/10 text-purple-100"
                        : "border-cyan-300/25 bg-cyan-400/10 text-cyan-100"
                    }`}>
                      {reviewed ? "Checked" : "On map"}
                    </span>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onOpenEvidence(detection);
                      }}
                      className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-1.5 text-[11px] font-semibold text-slate-200 hover:bg-slate-800"
                    >
                      Open evidence
                    </button>

                    {reviewed ? (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onReturnToMap(detection);
                        }}
                        className="rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-3 py-1.5 text-[11px] font-semibold text-cyan-100 hover:bg-cyan-400/15"
                      >
                        Return to map
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="p-4 text-sm leading-6 text-slate-500">
          {detections.length
            ? `No ${reviewMode === "all" ? "points" : reviewMode} markers match the active checklist view.`
            : "No tomato markers match the active filters and timeline position."}
        </div>
      )}
    </Card>
  );
}

function filterDetections(detections, filters, timeMs = null) {
  return (detections ?? []).filter((detection) => {
    if (Number.isFinite(timeMs) && detection.timestampMs > timeMs) return false;
    if (!filters.categories[detection.category]) return false;
    if (detection.weak && !filters.quality.weak) return false;
    if (!detection.weak && !filters.quality.strong) return false;
    return true;
  });
}

function findClosestEnvironmentSample(environmentTimeline, timeMs) {
  const timeline = Array.isArray(environmentTimeline) ? environmentTimeline : [];
  if (!timeline.length) return null;
  if (!Number.isFinite(timeMs)) return timeline.at(-1);

  let best = timeline[0];
  let bestDelta = Math.abs((best.timestampMs ?? 0) - timeMs);

  for (const sample of timeline) {
    const delta = Math.abs((sample.timestampMs ?? 0) - timeMs);
    if (delta < bestDelta) {
      best = sample;
      bestDelta = delta;
    }
  }

  return best;
}

export default function DashboardPage() {
  const [sessions, setSessions] = useState([]);
  const [selectedSession, setSelectedSession] = useState("");
  const [sessionsError, setSessionsError] = useState(null);
  const [map, setMap] = useState(null);
  const [mapError, setMapError] = useState(null);
  const [loadingMap, setLoadingMap] = useState(false);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [playbackIndex, setPlaybackIndex] = useState(0);
  const [selectedDetection, setSelectedDetection] = useState(null);
  const [reviewedDetectionIds, setReviewedDetectionIds] = useState(() => new Set());
  const [focusedListDetectionId, setFocusedListDetectionId] = useState(null);
  const [reviewListMode, setReviewListMode] = useState("pending");
  const [setupPanelOpen, setSetupPanelOpen] = useState(false);
  const [collapsedPanels, setCollapsedPanels] = useState(() => readCollapsedPanels());

  useEffect(() => {
    let alive = true;

    async function loadSessions() {
      try {
        const data = await fetchDashboardSessions();
        if (!alive) return;
        const availableSessions = Array.isArray(data.sessions) ? data.sessions : [];
        setSessions(availableSessions);
        setSelectedSession((current) => current || data.selected || availableSessions[0]?.id || "");
        setSessionsError(null);
      } catch (error) {
        if (!alive) return;
        setSessionsError(error?.message || "Failed to load sessions");
      }
    }

    loadSessions();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedSession) return;
    setReviewedDetectionIds(readReviewedDetectionIds(selectedSession));
    setFocusedListDetectionId(null);
    setReviewListMode("pending");
  }, [selectedSession]);

  useEffect(() => {
    if (!selectedSession) return;
    let alive = true;

    async function loadMap() {
      setLoadingMap(true);
      setMap(null);
      setMapError(null);
      try {
        const data = await fetchMap(selectedSession);
        if (!alive) return;
        setMap(data);
        setMapError(null);
        setPlaybackIndex(0);
        setSelectedDetection(null);
        setFocusedListDetectionId(null);
      } catch (error) {
        if (!alive) return;
        setMap(null);
        setMapError(error?.message || "Failed to load map");
      } finally {
        if (alive) setLoadingMap(false);
      }
    }

    loadMap();
    return () => {
      alive = false;
    };
  }, [selectedSession]);

  const currentTimeMs = map?.trail?.[playbackIndex]?.timestampMs ?? map?.timeline?.startTimestampMs ?? null;
  const filteredDetections = useMemo(
    () => filterDetections(map?.detections, filters, currentTimeMs),
    [map, filters, currentTimeMs],
  );
  const visibleDetections = useMemo(
    () => filteredDetections.filter((detection) => !reviewedDetectionIds.has(detection.id)),
    [filteredDetections, reviewedDetectionIds],
  );
  const focusedListDetection = useMemo(
    () => filteredDetections.find((detection) => detection.id === focusedListDetectionId) ?? null,
    [filteredDetections, focusedListDetectionId],
  );
  const currentEnvironment = useMemo(
    () => findClosestEnvironmentSample(map?.environment?.timeline, currentTimeMs),
    [map, currentTimeMs],
  );
  const selectedSessionItem = sessions.find((session) => session.id === selectedSession);
  const evidenceByKey = useMemo(
    () => new Map((map?.evidenceEvents ?? []).map((item) => [item.key, item])),
    [map],
  );
  const selectedEvidence = selectedDetection ? evidenceByKey.get(selectedDetection.evidenceKey) ?? null : null;

  const selectedDetectionIsVisible = selectedDetection
    ? filteredDetections.some((item) => item.id === selectedDetection.id)
    : false;

  useEffect(() => {
    if (selectedDetection && !selectedDetectionIsVisible) {
      setSelectedDetection(null);
    }
  }, [selectedDetection, selectedDetectionIsVisible]);

  useEffect(() => {
    if (focusedListDetectionId && !focusedListDetection) {
      setFocusedListDetectionId(null);
    }
  }, [focusedListDetectionId, focusedListDetection]);

  function updateReviewedDetections(nextIds) {
    setReviewedDetectionIds(nextIds);
    writeReviewedDetectionIds(selectedSession, nextIds);
  }

  function markDetectionAsReviewed(detection) {
    if (!detection?.id) return;
    const nextIds = new Set(reviewedDetectionIds);
    nextIds.add(detection.id);
    updateReviewedDetections(nextIds);
  }

  function returnDetectionToMap(detection) {
    if (!detection?.id) return;
    const nextIds = new Set(reviewedDetectionIds);
    nextIds.delete(detection.id);
    updateReviewedDetections(nextIds);
    setFocusedListDetectionId(null);
  }

  function clearReviewedDetections() {
    if (reviewedDetectionIds.size === 0) return;
    const confirmed = window.confirm("Return all checked markers to the map for this scan session?");
    if (!confirmed) return;
    updateReviewedDetections(new Set());
    setFocusedListDetectionId(null);
  }

  function handleMapDetectionSelect(detection) {
    markDetectionAsReviewed(detection);
    setFocusedListDetectionId(null);
    setSelectedDetection(detection);
  }

  function handleOpenEvidenceFromList(detection) {
    markDetectionAsReviewed(detection);
    setFocusedListDetectionId(null);
    setSelectedDetection(detection);
  }

  function togglePanel(panelId) {
    setCollapsedPanels((current) => {
      const next = { ...current, [panelId]: !current?.[panelId] };
      writeCollapsedPanels(next);
      return next;
    });
  }

  function activateFocusMode() {
    const next = {
      ...collapsedPanels,
      environment: true,
      filters: true,
      setup: true,
      timeline: false,
      video: false,
      review: false,
    };
    setCollapsedPanels(next);
    writeCollapsedPanels(next);
    setSetupPanelOpen(false);
  }

  function openAllSidePanels() {
    const next = {
      timeline: false,
      environment: false,
      video: false,
      filters: false,
      review: false,
    };
    setCollapsedPanels(next);
    writeCollapsedPanels(next);
  }

  return (
    <div className="space-y-3">
      <DashboardHeaderPanel
        map={map}
        sessions={sessions}
        selectedSession={selectedSession}
        setSelectedSession={setSelectedSession}
        selectedSessionItem={selectedSessionItem}
        open={setupPanelOpen}
        setOpen={setSetupPanelOpen}
      />

      {sessionsError && (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {sessionsError}
        </div>
      )}

      {mapError && (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {mapError}
        </div>
      )}

      {loadingMap && (
        <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5 text-sm text-slate-300">
          Loading selected scan session...
        </div>
      )}


      {map && (
        <>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={activateFocusMode}
              className="rounded-full border border-rose-400/35 bg-rose-500/15 px-4 py-2 text-[11px] font-black uppercase tracking-[0.16em] text-rose-100 shadow-[0_0_18px_rgba(244,63,94,0.12)] hover:bg-rose-500/25"
            >
              Focus map view
            </button>
            <button
              type="button"
              onClick={openAllSidePanels}
              className="rounded-full border border-slate-700 bg-slate-900 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-300 hover:bg-slate-800"
            >
              Open side panels
            </button>
          </div>

          <div className="grid gap-3 xl:grid-cols-[300px_minmax(0,1fr)_380px] 2xl:grid-cols-[315px_minmax(0,1fr)_400px]">
            <div className="space-y-3 xl:self-start">
              <PanelChrome
                panelId="timeline"
                title="Scan Playback"
                subtitle="Timeline control"
                accent="purple"
                collapsed={!!collapsedPanels.timeline}
                onToggle={togglePanel}
              >
                <TimelineControl
                  map={map}
                  playbackIndex={playbackIndex}
                  setPlaybackIndex={setPlaybackIndex}
                  visibleDetections={visibleDetections}
                />
              </PanelChrome>

              <PanelChrome
                panelId="environment"
                title="Environment"
                subtitle="Sensor snapshot hidden"
                accent="emerald"
                collapsed={!!collapsedPanels.environment}
                onToggle={togglePanel}
              >
                <EnvironmentSnapshot sample={currentEnvironment} stats={map?.environment?.stats} />
              </PanelChrome>

              <PanelChrome
                panelId="video"
                title="Robot Video"
                subtitle="Scan recording"
                accent="emerald"
                collapsed={!!collapsedPanels.video}
                onToggle={togglePanel}
              >
                <VideoPanel map={map} />
              </PanelChrome>
            </div>

            <div className="min-w-0">
              <MapPanel
                map={map}
                playbackTimeMs={currentTimeMs}
                filters={filters}
                selectedDetectionId={selectedDetection?.id ?? null}
                onSelectDetection={handleMapDetectionSelect}
                detectionsOverride={visibleDetections}
                reviewFocusDetection={focusedListDetection}
                height={600}
              />
            </div>

            <div className="space-y-3 xl:self-start">
              <PanelChrome
                panelId="filters"
                title="Detection Filters"
                subtitle={`${visibleDetections.length}/${map?.detections?.length ?? 0} markers visible`}
                accent="cyan"
                collapsed={!!collapsedPanels.filters}
                onToggle={togglePanel}
              >
                <FiltersPanel
                  filters={filters}
                  setFilters={setFilters}
                  visibleCount={visibleDetections.length}
                  totalCount={map?.detections?.length ?? 0}
                />
              </PanelChrome>

              <PanelChrome
                panelId="review"
                title="Review Checklist"
                subtitle={`${reviewedDetectionIds.size} checked markers`}
                accent="purple"
                collapsed={!!collapsedPanels.review}
                onToggle={togglePanel}
              >
                <DetectionReviewList
                  detections={filteredDetections}
                  reviewedIds={reviewedDetectionIds}
                  focusedDetectionId={focusedListDetectionId}
                  reviewMode={reviewListMode}
                  onReviewModeChange={setReviewListMode}
                  onFocusDetection={(detection) => setFocusedListDetectionId(detection.id)}
                  onOpenEvidence={handleOpenEvidenceFromList}
                  onReturnToMap={returnDetectionToMap}
                  onClearReviewed={clearReviewedDetections}
                />
              </PanelChrome>
            </div>
          </div>
        </>
      )}

      {selectedDetection && (
        <DetectionEvidenceModal
          detection={selectedDetection}
          evidence={selectedEvidence}
          onClose={() => setSelectedDetection(null)}
        />
      )}

      {!loadingMap && !map && !mapError && (
        <Card className="p-8 text-sm text-slate-300">
          No ROS2 scan session was found. Add folders like src/session-data/session_YYYYMMDD_HHMMSS.
        </Card>
      )}
    </div>
  );
}
