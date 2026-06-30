"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getPredictionAt } from "../lib/spatialModel";
import TimelineControls from "./TimelineControls";

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

function hexToRgba(color, opacity) {
  const value = String(color ?? "#64748b").replace("#", "");
  const full = value.length === 3
    ? value.split("").map((item) => `${item}${item}`).join("")
    : value.padEnd(6, "0").slice(0, 6);
  const red = Number.parseInt(full.slice(0, 2), 16) || 0;
  const green = Number.parseInt(full.slice(2, 4), 16) || 0;
  const blue = Number.parseInt(full.slice(4, 6), 16) || 0;
  return `rgba(${red}, ${green}, ${blue}, ${clamp(opacity, 0, 1)})`;
}

function decodeBase64Bytes(base64) {
  if (!base64 || typeof window === "undefined") return null;

  try {
    const binary = window.atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  } catch {
    return null;
  }
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
            Large clickable markers preserve the greenhouse-map class scheme. Each marker represents one spatially grouped landmark from accepted saved YOLO detections.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {classes.map((item) => (
            <span key={item.key} className="flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-200">
              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: item.color }} />
              {item.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function RawTomatoFrame({ representative, landmarkLabel }) {
  const [imageSize, setImageSize] = useState({ width: null, height: null });
  const rawImageUrl = representative?.rawImageUrl ?? null;
  const bbox = representative?.bbox ?? null;

  useEffect(() => {
    setImageSize({ width: null, height: null });
  }, [rawImageUrl]);
  const hasValidBbox =
    bbox?.valid &&
    Number.isFinite(imageSize.width) &&
    Number.isFinite(imageSize.height) &&
    imageSize.width > 0 &&
    imageSize.height > 0;

  const leftPct = hasValidBbox
    ? clamp((bbox.x / imageSize.width) * 100, 0, 100)
    : 0;
  const topPct = hasValidBbox
    ? clamp((bbox.y / imageSize.height) * 100, 0, 100)
    : 0;
  const widthPct = hasValidBbox
    ? clamp((bbox.w / imageSize.width) * 100, 0, 100 - leftPct)
    : 0;
  const heightPct = hasValidBbox
    ? clamp((bbox.h / imageSize.height) * 100, 0, 100 - topPct)
    : 0;

  if (!rawImageUrl) {
    return (
      <div className="flex min-h-44 items-center justify-center p-5 text-center text-sm text-slate-400">
        The raw camera frame for this accepted detection is not available in the selected session.
      </div>
    );
  }

  return (
    <div className="flex min-h-44 items-center justify-center">
      <div className="relative inline-block max-w-full overflow-hidden rounded-xl bg-black">
        <img
          src={rawImageUrl}
          alt={`Raw camera frame containing the selected ${landmarkLabel} detection`}
          className="block h-auto max-h-[420px] w-auto max-w-full object-contain"
          onLoad={(event) => {
            setImageSize({
              width: event.currentTarget.naturalWidth,
              height: event.currentTarget.naturalHeight,
            });
          }}
        />

        {hasValidBbox ? (
          <>
            <div
              className="pointer-events-none absolute border-[3px] border-emerald-300 shadow-[0_0_0_1px_rgba(2,6,23,0.9),0_0_18px_rgba(52,211,153,0.9)]"
              style={{
                left: `${leftPct}%`,
                top: `${topPct}%`,
                width: `${widthPct}%`,
                height: `${heightPct}%`,
              }}
            />
            <div
              className="pointer-events-none absolute -translate-y-full rounded-t-md border border-emerald-200/70 bg-emerald-500/90 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-slate-950 shadow-lg"
              style={{ left: `${leftPct}%`, top: `${topPct}%` }}
            >
              Strong · {Math.round((representative?.confidence ?? 0) * 100)}%
            </div>
          </>
        ) : null}
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
          <p className="mt-1 text-sm text-slate-400">
            {landmark.observationCount} strong accepted observation{landmark.observationCount === 1 ? "" : "s"} grouped at this ROS2 map location.
          </p>
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
        <RawTomatoFrame representative={representative} landmarkLabel={landmark.label} />
      </div>
      <div className="mt-2 text-xs leading-5 text-slate-400">
        Raw camera frame. The green bbox marks only this selected strong accepted detection; weak candidate detections are intentionally excluded.
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <Metric label="Best confidence" value={formatPercent(landmark.bestConfidence)} detail={`mean ${formatPercent(landmark.confidence)}`} />
        <Metric label="Class maturity index" value={formatPercent(landmark.maturityScore)} detail="Class-derived ecological score" />
        <Metric label="Map coordinate" value={`${formatNumber(landmark.x)} / ${formatNumber(landmark.y)} m`} detail="ROS2 map-image X / Y" />
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
        <div className="mt-1">
          This frame uses the saved raw image from <code>images_ok_raw</code> when available. The exporter marks the corresponding map projection as approximate, so it is useful for spatial review rather than verified tomato-depth localization.
        </div>
      </div>
    </div>
  );
}

function SpatialSummary({ summary, rosMap }) {
  const variogram = summary?.variogram;

  return (
    <aside className="space-y-3 rounded-3xl border border-slate-800 bg-slate-950/70 p-4">
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-fuchsia-300">Real-session spatial model</div>
        <h3 className="mt-1 text-lg font-semibold text-white">Ordinary Kriging</h3>
        <p className="mt-1 text-xs leading-5 text-slate-400">
          The maturity surface uses grouped tomato anchors over the selected session’s saved ROS2 map frame.
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
      <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/5 p-3 text-xs leading-5 text-cyan-100/80">
        {rosMap?.valid ? (
          <>
            <div className="font-semibold text-cyan-100">ROS2 SLAM raster loaded</div>
            <div className="mt-1">{rosMap.width} × {rosMap.height} px · {formatNumber(rosMap.resolutionM, 3)} m/px</div>
          </>
        ) : (
          <>
            <div className="font-semibold text-cyan-100">ROS2 map raster unavailable</div>
            <div className="mt-1">The fallback coordinate extent is shown instead.</div>
          </>
        )}
      </div>
      <div className="rounded-2xl border border-slate-800 bg-slate-900/55 p-3 text-xs leading-5 text-slate-400">
        The maturity value is a class-derived index: unripe classes are green/low and ripe classes are red/high. It is not a laboratory ripeness measurement.
      </div>
    </aside>
  );
}

function drawRobot(ctx, point, yawDeg) {
  if (!point) return;

  const yaw = ((Number(yawDeg) || 0) * Math.PI) / 180;
  const size = 19;
  const tip = {
    x: point.x + Math.sin(yaw) * size,
    y: point.y - Math.cos(yaw) * size,
  };
  const left = {
    x: point.x + Math.sin(yaw + (140 * Math.PI) / 180) * (size * 0.78),
    y: point.y - Math.cos(yaw + (140 * Math.PI) / 180) * (size * 0.78),
  };
  const right = {
    x: point.x + Math.sin(yaw - (140 * Math.PI) / 180) * (size * 0.78),
    y: point.y - Math.cos(yaw - (140 * Math.PI) / 180) * (size * 0.78),
  };

  ctx.fillStyle = "rgba(34, 211, 238, 0.14)";
  ctx.strokeStyle = "rgba(34, 211, 238, 0.88)";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(point.x, point.y, 22, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "rgba(248, 250, 252, 0.98)";
  ctx.strokeStyle = "rgba(2, 6, 23, 0.96)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(tip.x, tip.y);
  ctx.lineTo(left.x, left.y);
  ctx.lineTo(right.x, right.y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "rgba(226, 232, 240, 0.95)";
  ctx.font = "700 12px Arial";
  ctx.fillText("ROBOT", point.x + 18, point.y + 3);
}

export default function GreenhouseMap({
  layout,
  rosMap = null,
  classes = [],
  samples = [],
  currentDetections = [],
  currentRobotPose = null,
  robotTrail = [],
  spatialSummary = null,
  timelineBuckets = [],
  bucketPosition = 0,
  setBucketPosition,
  layer = "kriging",
  setLayer,
  timeScale,
  setTimeScale,
  selectedId,
  onSelect,
}) {
  const canvasRef = useRef(null);
  const wrapperRef = useRef(null);
  const dragRef = useRef(null);
  const screenLandmarksRef = useRef([]);
  const wheelActionRef = useRef(null);
  const [canvasSize, setCanvasSize] = useState({ width: 1000, height: 680 });
  const [tooltipPosition, setTooltipPosition] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  const safeLayout = layout ?? { minX: -1, maxX: 1, minY: -1, maxY: 1, widthM: 2, heightM: 2 };
  const hasRosRaster = Boolean(
    rosMap?.valid &&
      Number.isFinite(rosMap?.width) &&
      Number.isFinite(rosMap?.height) &&
      Number.isFinite(rosMap?.resolutionM),
  );
  const rasterWidth = hasRosRaster ? Math.max(1, Number(rosMap.width)) : 1000;
  const rasterHeight = hasRosRaster ? Math.max(1, Number(rosMap.height)) : 720;
  const rasterResolution = hasRosRaster ? Math.max(0.001, Number(rosMap.resolutionM)) : null;
  const rasterBytes = useMemo(
    () => decodeBase64Bytes(rosMap?.image?.data),
    [rosMap?.image?.data],
  );

  const safeBucketIndex = Math.max(0, Math.min(bucketPosition ?? 0, Math.max(0, timelineBuckets.length - 1)));
  const selectedBucket = timelineBuckets[safeBucketIndex] ?? null;
  const timelineEndMs = selectedBucket?.endTimestampMs ?? Number.POSITIVE_INFINITY;
  const activeObservationIds = useMemo(
    () => new Set(currentDetections.map((item) => item.id)),
    [currentDetections],
  );
  const visibleTrail = useMemo(
    () => robotTrail.filter((pose) => (pose.timestampMs ?? Infinity) <= timelineEndMs),
    [robotTrail, timelineEndMs],
  );
  const selected = samples.find((item) => item.id === selectedId) ?? null;
  const prediction = useMemo(
    () => (selected ? getPredictionAt(spatialSummary?.grid, selected) : null),
    [selected, spatialSummary?.grid],
  );

  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setTooltipPosition(null);
  }, [rosMap?.paths?.pgm, layout?.minX, layout?.maxX, layout?.minY, layout?.maxY]);

  useEffect(() => {
    if (!wrapperRef.current) return undefined;

    const observer = new ResizeObserver(([entry]) => {
      setCanvasSize({
        width: Math.max(320, Math.floor(entry.contentRect.width)),
        height: 680,
      });
    });

    observer.observe(wrapperRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!selectedId) setTooltipPosition(null);
  }, [selectedId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const handleNativeWheel = (event) => {
      wheelActionRef.current?.(event);
    };

    canvas.addEventListener("wheel", handleNativeWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", handleNativeWheel);
  }, []);

  function worldToRaster(x, y) {
    if (hasRosRaster) {
      return { x: x / rasterResolution, y: y / rasterResolution };
    }

    const spanX = Math.max(0.001, safeLayout.maxX - safeLayout.minX);
    const spanY = Math.max(0.001, safeLayout.maxY - safeLayout.minY);
    return {
      x: ((x - safeLayout.minX) / spanX) * rasterWidth,
      y: rasterHeight - ((y - safeLayout.minY) / spanY) * rasterHeight,
    };
  }

  function getViewMetrics(nextZoom = zoom, nextPan = pan) {
    const padding = 24;
    const fitScale = Math.min(
      (canvasSize.width - padding * 2) / rasterWidth,
      (canvasSize.height - padding * 2) / rasterHeight,
    );
    const scale = fitScale * nextZoom;
    const drawWidth = rasterWidth * scale;
    const drawHeight = rasterHeight * scale;
    const offsetX = (canvasSize.width - drawWidth) / 2 + nextPan.x;
    const offsetY = (canvasSize.height - drawHeight) / 2 + nextPan.y;
    return { fitScale, scale, drawWidth, drawHeight, offsetX, offsetY };
  }

  function resetView() {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }

  function zoomAt(canvasX, canvasY, nextZoom) {
    const boundedZoom = clamp(nextZoom, 0.75, 5);
    const oldMetrics = getViewMetrics(zoom, pan);
    const rasterX = (canvasX - oldMetrics.offsetX) / oldMetrics.scale;
    const rasterY = (canvasY - oldMetrics.offsetY) / oldMetrics.scale;
    const newDrawWidth = rasterWidth * oldMetrics.fitScale * boundedZoom;
    const newDrawHeight = rasterHeight * oldMetrics.fitScale * boundedZoom;
    const baseOffsetX = (canvasSize.width - newDrawWidth) / 2;
    const baseOffsetY = (canvasSize.height - newDrawHeight) / 2;

    setZoom(boundedZoom);
    setPan({
      x: canvasX - rasterX * oldMetrics.fitScale * boundedZoom - baseOffsetX,
      y: canvasY - rasterY * oldMetrics.fitScale * boundedZoom - baseOffsetY,
    });
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    const dpr = window.devicePixelRatio || 1;
    const { scale, drawWidth, drawHeight, offsetX, offsetY } = getViewMetrics();

    canvas.width = Math.floor(canvasSize.width * dpr);
    canvas.height = Math.floor(canvasSize.height * dpr);
    canvas.style.width = `${canvasSize.width}px`;
    canvas.style.height = `${canvasSize.height}px`;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, canvasSize.width, canvasSize.height);
    context.fillStyle = "#020617";
    context.fillRect(0, 0, canvasSize.width, canvasSize.height);

    const toScreen = (x, y) => {
      const point = worldToRaster(x, y);
      return {
        x: offsetX + point.x * scale,
        y: offsetY + point.y * scale,
      };
    };

    context.save();
    context.beginPath();
    context.rect(offsetX, offsetY, drawWidth, drawHeight);
    context.clip();

    if (hasRosRaster && rasterBytes?.length === rasterWidth * rasterHeight) {
      const imageData = context.createImageData(rasterWidth, rasterHeight);
      for (let index = 0; index < rasterBytes.length; index += 1) {
        const value = rasterBytes[index];
        const output = index * 4;
        imageData.data[output] = value;
        imageData.data[output + 1] = value;
        imageData.data[output + 2] = value;
        imageData.data[output + 3] = 255;
      }
      const offscreen = document.createElement("canvas");
      offscreen.width = rasterWidth;
      offscreen.height = rasterHeight;
      const offscreenContext = offscreen.getContext("2d");
      offscreenContext?.putImageData(imageData, 0, 0);

      // In Kriging mode the real ROS2 raster remains visible but is intentionally
      // softened to 50%, so the original prediction grid can be read above it.
      context.save();
      context.globalAlpha = layer === "kriging" ? 0.5 : 1;
      context.imageSmoothingEnabled = false;
      context.drawImage(offscreen, offsetX, offsetY, drawWidth, drawHeight);
      context.imageSmoothingEnabled = true;
      context.restore();
    } else {
      context.fillStyle = "#07111e";
      context.fillRect(offsetX, offsetY, drawWidth, drawHeight);
    }

    const gridStepM = 0.5;
    const minGridX = hasRosRaster ? 0 : safeLayout.minX;
    const maxGridX = hasRosRaster ? rosMap.widthM : safeLayout.maxX;
    const minGridY = hasRosRaster ? 0 : safeLayout.minY;
    const maxGridY = hasRosRaster ? rosMap.heightM : safeLayout.maxY;
    context.strokeStyle = "rgba(15, 23, 42, 0.28)";
    context.lineWidth = Math.max(0.8, Math.min(1.5, zoom));

    for (let x = Math.ceil(minGridX / gridStepM) * gridStepM; x <= maxGridX; x += gridStepM) {
      const start = toScreen(x, minGridY);
      const end = toScreen(x, maxGridY);
      context.beginPath();
      context.moveTo(start.x, start.y);
      context.lineTo(end.x, end.y);
      context.stroke();
    }
    for (let y = Math.ceil(minGridY / gridStepM) * gridStepM; y <= maxGridY; y += gridStepM) {
      const start = toScreen(minGridX, y);
      const end = toScreen(maxGridX, y);
      context.beginPath();
      context.moveTo(start.x, start.y);
      context.lineTo(end.x, end.y);
      context.stroke();
    }

    if (layer === "kriging") {
      (spatialSummary?.grid ?? []).forEach((cell) => {
        const center = toScreen(cell.x, cell.y);
        const cellPixels = hasRosRaster
          ? (cell.cellSizeM ?? 0.12) / rasterResolution
          : Math.max(8, (cell.cellSizeM ?? 0.12) * (rasterWidth / Math.max(0.001, safeLayout.widthM)));
        const side = cellPixels * scale;
        const support = 1 - clamp(cell.uncertainty ?? 1, 0, 1);
        const opacity = 0.3 + support * 0.5;
        const color = maturityColor(cell.value);

        context.fillStyle = hexToRgba(color, opacity);
        context.fillRect(center.x - side / 2, center.y - side / 2, side + 1.2, side + 1.2);

        // Keeps individual Kriging cells legible against the semi-transparent
        // ROS2 raster without changing the spatial calculation itself.
        context.strokeStyle = hexToRgba(color, Math.max(0.12, opacity * 0.42));
        context.lineWidth = 0.55;
        context.strokeRect(center.x - side / 2, center.y - side / 2, side + 1.2, side + 1.2);
      });
    }

    function drawTrail(points, color, width, opacity) {
      if (points.length < 2) return;
      context.strokeStyle = color;
      context.globalAlpha = opacity;
      context.lineWidth = width;
      context.lineJoin = "round";
      context.lineCap = "round";
      context.beginPath();
      points.forEach((pose, index) => {
        const point = toScreen(pose.x, pose.y);
        if (index === 0) context.moveTo(point.x, point.y);
        else context.lineTo(point.x, point.y);
      });
      context.stroke();
      context.globalAlpha = 1;
    }

    drawTrail(robotTrail, "#334155", 2.1, 0.56);
    drawTrail(visibleTrail, "#38bdf8", Math.max(2.5, 3.2 * Math.sqrt(zoom)), 0.92);

    if (robotTrail[0]) {
      const start = toScreen(robotTrail[0].x, robotTrail[0].y);
      context.strokeStyle = "rgba(139, 92, 246, 0.95)";
      context.lineWidth = 2;
      context.beginPath();
      context.arc(start.x, start.y, 8, 0, Math.PI * 2);
      context.stroke();
      context.fillStyle = "rgba(221, 214, 254, 0.96)";
      context.font = "700 11px Arial";
      context.fillText("START", start.x + 10, start.y - 9);
    }

    const screenLandmarks = [];
    samples.forEach((landmark) => {
      const point = toScreen(landmark.x, landmark.y);
      const isSelected = landmark.id === selectedId;
      const updated = landmark.observations?.some((item) => activeObservationIds.has(item.id));
      const radius = isSelected ? 18 : updated ? 16 : 14;

      context.fillStyle = hexToRgba(landmark.color, isSelected ? 0.28 : 0.16);
      context.beginPath();
      context.arc(point.x, point.y, radius + 8, 0, Math.PI * 2);
      context.fill();

      context.fillStyle = landmark.color;
      context.strokeStyle = isSelected ? "rgba(255,255,255,0.98)" : "rgba(15, 23, 42, 0.94)";
      context.lineWidth = isSelected ? 3 : 2;
      context.beginPath();
      context.arc(point.x, point.y, radius, 0, Math.PI * 2);
      context.fill();
      context.stroke();

      if (isSelected) {
        context.strokeStyle = "rgba(250, 204, 21, 0.92)";
        context.lineWidth = 2.3;
        context.beginPath();
        context.arc(point.x, point.y, radius + 12, 0, Math.PI * 2);
        context.stroke();
      }

      context.fillStyle = "#ffffff";
      context.font = "800 11px Arial";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(String(landmark.observationCount ?? 1), point.x, point.y + 0.5);
      context.textAlign = "start";
      context.textBaseline = "alphabetic";

      screenLandmarks.push({ landmark, x: point.x, y: point.y, hitRadius: radius + 15 });
    });
    screenLandmarksRef.current = screenLandmarks;

    if (currentRobotPose) {
      drawRobot(context, toScreen(currentRobotPose.x, currentRobotPose.y), currentRobotPose.yawDeg);
    }

    context.strokeStyle = "rgba(148, 163, 184, 0.42)";
    context.lineWidth = 1.2;
    context.strokeRect(offsetX, offsetY, drawWidth, drawHeight);
    context.restore();

    context.fillStyle = "rgba(226, 232, 240, 0.93)";
    context.font = "700 12px Arial";
    context.fillText(hasRosRaster ? "ROS2 SLAM MAP · PGM RASTER" : "SESSION MAP COORDINATES", 18, 28);
    context.fillStyle = "rgba(148, 163, 184, 0.84)";
    context.font = "11px Arial";
    context.fillText(
      hasRosRaster
        ? `${rasterWidth} × ${rasterHeight} px · ${formatNumber(rasterResolution, 3)} m/px · ${layer === "kriging" ? "SLAM raster 50% · " : ""}drag to pan · scroll to zoom`
        : "Fallback coordinate extent · drag to pan · scroll to zoom",
      18,
      47,
    );
  }, [
    activeObservationIds,
    canvasSize,
    currentRobotPose,
    hasRosRaster,
    layer,
    rasterBytes,
    rasterHeight,
    rasterResolution,
    rasterWidth,
    robotTrail,
    rosMap?.heightM,
    rosMap?.widthM,
    safeLayout.maxX,
    safeLayout.maxY,
    safeLayout.minX,
    safeLayout.minY,
    safeLayout.widthM,
    selectedId,
    samples,
    spatialSummary?.grid,
    visibleTrail,
    zoom,
    pan,
  ]);

  function localCanvasPoint(event) {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / Math.max(rect.width, 1)) * canvasSize.width,
      y: ((event.clientY - rect.top) / Math.max(rect.height, 1)) * canvasSize.height,
    };
  }

  function selectMarkerAt(canvasX, canvasY, clientX, clientY) {
    const candidate = screenLandmarksRef.current
      .map((item) => ({ ...item, distance: Math.hypot(item.x - canvasX, item.y - canvasY) }))
      .filter((item) => item.distance <= item.hitRadius)
      .sort((a, b) => a.distance - b.distance)[0] ?? null;

    if (!candidate) {
      setTooltipPosition(null);
      onSelect?.(null);
      return;
    }

    setTooltipPosition({ x: clientX, y: clientY });
    onSelect?.(candidate.landmark);
  }

  function handlePointerDown(event) {
    if (event.button !== 0) return;
    const point = localCanvasPoint(event);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      startPan: pan,
      moved: false,
      canvasX: point.x,
      canvasY: point.y,
    };
  }

  function handlePointerMove(event) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - drag.clientX;
    const deltaY = event.clientY - drag.clientY;
    if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) drag.moved = true;
    if (!drag.moved) return;

    setPan({ x: drag.startPan.x + deltaX, y: drag.startPan.y + deltaY });
  }

  function handlePointerUp(event) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);

    if (!drag.moved) {
      const point = localCanvasPoint(event);
      selectMarkerAt(point.x, point.y, event.clientX, event.clientY);
    }
  }

  wheelActionRef.current = (event) => {
    if (event.cancelable) event.preventDefault();
    event.stopPropagation();
    const point = localCanvasPoint(event);
    zoomAt(point.x, point.y, zoom + (event.deltaY < 0 ? 0.16 : -0.16));
  };

  return (
    <section className="rounded-[2rem] border border-slate-800 bg-slate-900/65 p-5">
      <div className="flex flex-col gap-5 2xl:flex-row 2xl:items-start 2xl:justify-between">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-emerald-300">Selected-session greenhouse map</div>
          <h2 className="mt-2 text-2xl font-semibold text-white">ROS2 SLAM map with real tomato landmarks</h2>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-400">
            The saved ROS2 PGM map is the spatial background. The robot route, current robot pose, cumulative tomato landmarks, and the original Kriging prediction grid are drawn in the same selected-session map frame. In Kriging mode the SLAM raster is rendered at 50% opacity so the color surface stays readable.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
          <span className="rounded-full border border-slate-700 bg-slate-950/70 px-3 py-1.5">{samples.length} visible landmarks</span>
          <span className="rounded-full border border-slate-700 bg-slate-950/70 px-3 py-1.5">{currentDetections.length} accepted updates in step</span>
          <span className="rounded-full border border-fuchsia-400/30 bg-fuchsia-400/10 px-3 py-1.5 text-fuchsia-100">{layer === "kriging" ? "Kriging layer · SLAM 50%" : "Observed anchors"}</span>
        </div>
      </div>

      <div className="mt-5 grid gap-5 2xl:grid-cols-[minmax(0,1fr)_330px]">
        <div className="overflow-hidden rounded-3xl border border-slate-800 bg-[#050b14]" ref={wrapperRef}>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 bg-slate-950/80 px-4 py-3 text-xs text-slate-400">
            <span>Click a large tomato marker to open its bbox frame, confidence, and Kriging estimate.</span>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setZoom((value) => clamp(value - 0.2, 0.75, 5))} className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-700 bg-slate-900 text-lg text-slate-200 hover:border-cyan-300" aria-label="Zoom out">−</button>
              <span className="min-w-[52px] text-center text-xs font-semibold text-cyan-200">{Math.round(zoom * 100)}%</span>
              <button type="button" onClick={() => setZoom((value) => clamp(value + 0.2, 0.75, 5))} className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-700 bg-slate-900 text-lg text-slate-200 hover:border-cyan-300" aria-label="Zoom in">+</button>
              <button type="button" onClick={resetView} className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-300 hover:border-cyan-300 hover:text-white">Reset</button>
            </div>
          </div>

          <canvas
            ref={canvasRef}
            className="block h-[680px] w-full touch-none select-none overscroll-contain cursor-grab active:cursor-grabbing"
            role="img"
            aria-label="ROS2 greenhouse map with robot route, current robot pose, tomato landmarks, and Kriging surface"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          />

          <TimelineControls
            buckets={timelineBuckets}
            bucketPosition={safeBucketIndex}
            setBucketPosition={setBucketPosition}
            layer={layer}
            setLayer={setLayer}
            timeScale={timeScale}
            setTimeScale={setTimeScale}
          />
        </div>

        <SpatialSummary summary={spatialSummary} rosMap={rosMap} />
      </div>

      <ClassLegend classes={classes.filter((item) => item.key !== "unknown")} />

      <p className="mt-4 rounded-2xl border border-amber-400/20 bg-amber-400/5 p-3 text-xs leading-5 text-amber-100/85">
        The ROS2 map background comes from the selected session’s copied <code>map.pgm</code> and <code>map.yaml</code>. Tomato anchors come from <code>detections_on_map.jsonl</code>; their exporter labels camera-bearing fixed-distance projections as approximate. Ordinary Kriging is therefore a session-analysis visualization rather than verified greenhouse-world localization.
      </p>

      <TomatoTooltip landmark={selected} prediction={prediction} position={tooltipPosition} onClose={() => { setTooltipPosition(null); onSelect?.(null); }} />
    </section>
  );
}
