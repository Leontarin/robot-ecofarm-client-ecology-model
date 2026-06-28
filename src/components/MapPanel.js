"use client";

import { useEffect, useMemo, useRef, useState } from "react";

function deg2rad(deg) {
  return (deg * Math.PI) / 180;
}

function decodeBase64Bytes(base64) {
  if (!base64 || typeof window === "undefined") return null;

  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function formatNumber(value, digits = 2) {
  const num = Number(value);
  return Number.isFinite(num) ? num.toFixed(digits) : "—";
}

function detectionColor(category, weak) {
  if (weak) return "rgba(245, 158, 11, 0.92)";
  switch (category) {
    case "ripe_tomato":
      return "rgba(34, 197, 94, 0.96)";
    case "unripe_tomato":
      return "rgba(132, 204, 22, 0.96)";
    case "ripe_bunch":
      return "rgba(20, 184, 166, 0.96)";
    case "unripe_bunch":
      return "rgba(251, 146, 60, 0.96)";
    default:
      return "rgba(148, 163, 184, 0.96)";
  }
}

function createPreparedDetections(detections, filters) {
  return (detections ?? []).filter((detection) => {
    if (!filters.categories[detection.category]) return false;
    if (detection.weak && !filters.quality.weak) return false;
    if (!detection.weak && !filters.quality.strong) return false;
    return true;
  });
}

export default function MapPanel({
  map,
  playbackTimeMs = null,
  filters,
  selectedDetectionId,
  onSelectDetection,
  height = 650,
}) {
  const canvasRef = useRef(null);
  const wrapperRef = useRef(null);
  const [canvasSize, setCanvasSize] = useState({ width: 900, height });
  const [screenDetections, setScreenDetections] = useState([]);

  const isRosMap = map?.kind === "rbv2_ros2_slam_dashboard";
  const resolution = Number(map?.map?.resolutionM) || 0.05;
  const mapWidthPx = Number(map?.map?.width) || 1;
  const mapHeightPx = Number(map?.map?.height) || 1;
  const mapWidthM = mapWidthPx * resolution;
  const mapHeightM = mapHeightPx * resolution;

  const currentTimeMs = useMemo(() => {
    if (!isRosMap) return null;
    if (Number.isFinite(playbackTimeMs)) return playbackTimeMs;
    return map?.timeline?.endTimestampMs ?? null;
  }, [isRosMap, map, playbackTimeMs]);

  const trailUntilNow = useMemo(() => {
    if (!isRosMap) return [];
    if (!Number.isFinite(currentTimeMs)) return map?.trail ?? [];
    return (map?.trail ?? []).filter((point) => point.timestampMs <= currentTimeMs);
  }, [isRosMap, map, currentTimeMs]);

  const finalPose = trailUntilNow.at(-1) ?? null;

  const visibleDetections = useMemo(() => {
    if (!isRosMap) return [];
    const filtered = createPreparedDetections(map?.detections, filters);
    if (!Number.isFinite(currentTimeMs)) return filtered;
    return filtered.filter((detection) => detection.timestampMs <= currentTimeMs);
  }, [isRosMap, map, filters, currentTimeMs]);

  useEffect(() => {
    if (!wrapperRef.current) return;

    const observer = new ResizeObserver(([entry]) => {
      const width = Math.max(320, Math.floor(entry.contentRect.width));
      setCanvasSize({ width, height });
    });

    observer.observe(wrapperRef.current);
    return () => observer.disconnect();
  }, [height]);

  useEffect(() => {
    if (!isRosMap) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const cssWidth = canvasSize.width;
    const cssHeight = canvasSize.height;
    canvas.width = Math.floor(cssWidth * dpr);
    canvas.height = Math.floor(cssHeight * dpr);
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssWidth, cssHeight);

    ctx.fillStyle = "rgba(2, 6, 23, 0.92)";
    ctx.fillRect(0, 0, cssWidth, cssHeight);

    const padding = 26;
    const scale = Math.min(
      (cssWidth - padding * 2) / mapWidthPx,
      (cssHeight - padding * 2) / mapHeightPx,
    );
    const drawWidth = mapWidthPx * scale;
    const drawHeight = mapHeightPx * scale;
    const offsetX = (cssWidth - drawWidth) / 2;
    const offsetY = (cssHeight - drawHeight) / 2;

    const toScreenMeters = (x, y) => ({
      sx: offsetX + (x / resolution) * scale,
      sy: offsetY + (y / resolution) * scale,
    });

    const bytes = decodeBase64Bytes(map?.map?.image?.data);
    if (bytes?.length === mapWidthPx * mapHeightPx) {
      const imageData = ctx.createImageData(mapWidthPx, mapHeightPx);
      for (let i = 0; i < bytes.length; i += 1) {
        const value = bytes[i];
        const out = i * 4;
        imageData.data[out] = value;
        imageData.data[out + 1] = value;
        imageData.data[out + 2] = value;
        imageData.data[out + 3] = 255;
      }
      const offscreen = document.createElement("canvas");
      offscreen.width = mapWidthPx;
      offscreen.height = mapHeightPx;
      offscreen.getContext("2d").putImageData(imageData, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(offscreen, offsetX, offsetY, drawWidth, drawHeight);
      ctx.imageSmoothingEnabled = true;
    } else {
      ctx.fillStyle = "rgba(203, 213, 225, 0.16)";
      ctx.fillRect(offsetX, offsetY, drawWidth, drawHeight);
    }

    ctx.strokeStyle = "rgba(15, 23, 42, 0.28)";
    ctx.lineWidth = 1;
    const gridStepMeters = 0.5;
    for (let x = 0; x <= mapWidthM; x += gridStepMeters) {
      const screen = toScreenMeters(x, 0);
      ctx.beginPath();
      ctx.moveTo(screen.sx, offsetY);
      ctx.lineTo(screen.sx, offsetY + drawHeight);
      ctx.stroke();
    }
    for (let y = 0; y <= mapHeightM; y += gridStepMeters) {
      const screen = toScreenMeters(0, y);
      ctx.beginPath();
      ctx.moveTo(offsetX, screen.sy);
      ctx.lineTo(offsetX + drawWidth, screen.sy);
      ctx.stroke();
    }

    const manualStart = map.summary?.manualStart;
    if (manualStart?.set) {
      const start = toScreenMeters(manualStart.x, manualStart.y);
      ctx.strokeStyle = "rgba(14, 165, 233, 0.95)";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(start.sx, start.sy, 8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "rgba(14, 165, 233, 0.96)";
      ctx.font = "600 13px Arial";
      ctx.fillText("START", start.sx + 10, start.sy - 9);
    }

    if (trailUntilNow.length >= 2) {
      ctx.strokeStyle = "rgba(168, 85, 247, 0.92)";
      ctx.lineWidth = 3;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.beginPath();
      trailUntilNow.forEach((point, index) => {
        const screen = toScreenMeters(point.x, point.y);
        if (index === 0) ctx.moveTo(screen.sx, screen.sy);
        else ctx.lineTo(screen.sx, screen.sy);
      });
      ctx.stroke();
    }

    const preparedScreenDetections = [];
    for (const detection of visibleDetections) {
      const screen = toScreenMeters(detection.projection.x, detection.projection.y);
      const isSelected = detection.id === selectedDetectionId;
      const radius = isSelected ? 8.5 : detection.weak ? 4.8 : 6.2;
      const color = detectionColor(detection.category, detection.weak);

      ctx.fillStyle = color;
      ctx.strokeStyle = isSelected ? "rgba(255, 255, 255, 0.96)" : "rgba(15, 23, 42, 0.75)";
      ctx.lineWidth = isSelected ? 3 : 1.5;
      ctx.beginPath();
      ctx.arc(screen.sx, screen.sy, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      if (isSelected) {
        ctx.strokeStyle = "rgba(250, 204, 21, 0.85)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(screen.sx, screen.sy, radius + 5, 0, Math.PI * 2);
        ctx.stroke();
      }

      preparedScreenDetections.push({ ...detection, sx: screen.sx, sy: screen.sy, radius: radius + 7 });
    }
    setScreenDetections(preparedScreenDetections);

    if (finalPose) {
      const robot = toScreenMeters(finalPose.x, finalPose.y);
      const yawRad = deg2rad(finalPose.yawDeg ?? 0);
      const size = 20;
      const tip = {
        x: robot.sx + Math.sin(yawRad) * size,
        y: robot.sy - Math.cos(yawRad) * size,
      };
      const leftWing = {
        x: robot.sx + Math.sin(yawRad + deg2rad(140)) * (size * 0.78),
        y: robot.sy - Math.cos(yawRad + deg2rad(140)) * (size * 0.78),
      };
      const rightWing = {
        x: robot.sx + Math.sin(yawRad - deg2rad(140)) * (size * 0.78),
        y: robot.sy - Math.cos(yawRad - deg2rad(140)) * (size * 0.78),
      };

      ctx.fillStyle = "rgba(14, 165, 233, 0.16)";
      ctx.strokeStyle = "rgba(56, 189, 248, 0.92)";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(robot.sx, robot.sy, 22, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "rgba(226, 232, 240, 0.98)";
      ctx.strokeStyle = "rgba(2, 6, 23, 0.92)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(tip.x, tip.y);
      ctx.lineTo(leftWing.x, leftWing.y);
      ctx.lineTo(rightWing.x, rightWing.y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "rgba(226, 232, 240, 0.92)";
      ctx.font = "600 12px Arial";
      ctx.fillText("ROBOT", robot.sx + 18, robot.sy + 3);
    }

    ctx.strokeStyle = "rgba(148, 163, 184, 0.25)";
    ctx.lineWidth = 1;
    ctx.strokeRect(offsetX, offsetY, drawWidth, drawHeight);
  }, [
    isRosMap,
    map,
    canvasSize,
    height,
    mapWidthPx,
    mapHeightPx,
    mapWidthM,
    mapHeightM,
    resolution,
    trailUntilNow,
    visibleDetections,
    selectedDetectionId,
    finalPose,
  ]);

  function handleCanvasClick(event) {
    if (!onSelectDetection || !screenDetections.length) return;
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    let best = null;
    let bestDist = Infinity;
    for (const detection of screenDetections) {
      const dist = Math.hypot(detection.sx - x, detection.sy - y);
      if (dist <= detection.radius && dist < bestDist) {
        best = detection;
        bestDist = dist;
      }
    }

    if (best) onSelectDetection(best);
  }

  function handleMouseMove(event) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const onPoint = screenDetections.some(
      (detection) => Math.hypot(detection.sx - x, detection.sy - y) <= detection.radius,
    );
    canvas.style.cursor = onPoint ? "pointer" : "default";
  }

  if (!map) {
    return (
      <section className="rounded-[2rem] border border-slate-800 bg-slate-950/70 p-6 text-sm text-slate-300">
        Loading ROS2 SLAM map and tomato detections...
      </section>
    );
  }

  if (!isRosMap) {
    return (
      <section className="rounded-[2rem] border border-slate-800 bg-slate-950/70 p-6 text-sm text-amber-200">
        This dashboard view expects a ROS2 SLAM session map payload.
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-[2rem] border border-slate-800 bg-slate-950/70 shadow-[0_24px_80px_rgba(2,6,23,0.35)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/90 px-5 py-4">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-cyan-300">
            Scan Map
          </div>
          <h2 className="mt-1 text-xl font-semibold text-white">ROS2 SLAM map overlay</h2>
        </div>
        <div className="flex flex-wrap gap-2 text-xs text-slate-300">
          <span className="rounded-full border border-slate-700 bg-slate-900/80 px-3 py-1">
            Trail {trailUntilNow.length}/{map.trail?.length ?? 0}
          </span>
          <span className="rounded-full border border-slate-700 bg-slate-900/80 px-3 py-1">
            Visible detections {visibleDetections.length}
          </span>
          <span className="rounded-full border border-slate-700 bg-slate-900/80 px-3 py-1">
            Distance {formatNumber(finalPose?.distanceM ?? 0)} m
          </span>
        </div>
      </div>

      <div ref={wrapperRef} className="p-4">
        <canvas
          ref={canvasRef}
          onClick={handleCanvasClick}
          onMouseMove={handleMouseMove}
          className="block w-full rounded-3xl border border-slate-800 bg-slate-950"
          aria-label="Robot scan map with route and tomato detections"
        />
      </div>

      <div className="grid gap-3 border-t border-slate-800/90 px-5 py-4 text-xs text-slate-400 md:grid-cols-4">
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-purple-400" /> Robot route
        </div>
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-emerald-400" /> Strong tomato detection
        </div>
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-amber-400" /> Weak detection
        </div>
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-cyan-400" /> Current robot position
        </div>
      </div>
    </section>
  );
}
