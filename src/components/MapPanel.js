"use client";

import { useEffect, useMemo, useRef } from "react";

function deg2rad(deg) {
  return (deg * Math.PI) / 180;
}

export default function MapPanel({
  map,
  height = 520,
  padding = 20,
  className = "",
}) {
  const canvasRef = useRef(null);

  const bounds = useMemo(() => {
    if (!map?.bounds) return null;
    return map.bounds;
  }, [map]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !map || !bounds) return;

    const parent = canvas.parentElement;
    const cssW = parent?.clientWidth ?? 600;
    const cssH = height;
    const dpr = window.devicePixelRatio || 1;

    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;

    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    ctx.fillStyle = "rgba(2, 6, 23, 0.95)";
    ctx.fillRect(0, 0, cssW, cssH);

    const worldW = bounds.maxX - bounds.minX;
    const worldH = bounds.maxY - bounds.minY;
    const innerW = cssW - padding * 2;
    const innerH = cssH - padding * 2;
    const scale = Math.min(innerW / worldW, innerH / worldH);
    const offsetX = padding + (innerW - worldW * scale) / 2;
    const offsetY = padding + (innerH - worldH * scale) / 2;

    function toScreen(x, y) {
      return {
        sx: offsetX + (x - bounds.minX) * scale,
        sy: offsetY + (bounds.maxY - y) * scale,
      };
    }

    const { sx: left, sy: top } = toScreen(bounds.minX, bounds.maxY);
    const { sx: right, sy: bottom } = toScreen(bounds.maxX, bounds.minY);
    const drawW = right - left;
    const drawH = bottom - top;

    ctx.strokeStyle = "rgba(51, 65, 85, 0.55)";
    ctx.lineWidth = 1;

    const gridLines = 10;
    for (let i = 0; i <= gridLines; i += 1) {
      const x = left + (drawW / gridLines) * i;
      const y = top + (drawH / gridLines) * i;

      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x, bottom);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(right, y);
      ctx.stroke();
    }

    ctx.strokeStyle = "rgba(56, 189, 248, 0.18)";
    ctx.strokeRect(left, top, drawW, drawH);

    const robotPose = map.robot?.pose;
    if (!robotPose) return;
    const robot = toScreen(robotPose.x, robotPose.y);

    for (const point of map.scan?.historyClouds ?? []) {
      const screen = toScreen(point.x, point.y);
      const alpha = Math.max(0.08, 0.28 - point.age * 0.012);
      ctx.fillStyle = `rgba(56, 189, 248, ${alpha})`;
      ctx.fillRect(screen.sx, screen.sy, 2, 2);
    }

    for (const point of map.scan?.currentCloud ?? []) {
      const screen = toScreen(point.x, point.y);
      const close = point.distanceM < 0.22;
      ctx.fillStyle = close
        ? "rgba(251, 146, 60, 0.98)"
        : "rgba(34, 197, 94, 0.98)";
      ctx.beginPath();
      ctx.arc(screen.sx, screen.sy, close ? 2.8 : 2.2, 0, Math.PI * 2);
      ctx.fill();
    }

    if ((map.scan?.trail ?? []).length >= 2) {
      ctx.strokeStyle = "rgba(167, 139, 250, 0.8)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      map.scan.trail.forEach((point, index) => {
        const screen = toScreen(point.x, point.y);
        if (index === 0) ctx.moveTo(screen.sx, screen.sy);
        else ctx.lineTo(screen.sx, screen.sy);
      });
      ctx.stroke();
    }

    ctx.strokeStyle = "rgba(56, 189, 248, 0.24)";
    ctx.lineWidth = 1.25;
    for (const ray of map.scan?.rays ?? []) {
      const point = toScreen(ray.x, ray.y);
      ctx.beginPath();
      ctx.moveTo(robot.sx, robot.sy);
      ctx.lineTo(point.sx, point.sy);
      ctx.stroke();
    }

    if (map.goal) {
      const goal = toScreen(map.goal.x, map.goal.y);
      ctx.strokeStyle = "rgba(250, 204, 21, 0.9)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(robot.sx, robot.sy);
      ctx.lineTo(goal.sx, goal.sy);
      ctx.stroke();

      ctx.fillStyle = "rgba(250, 204, 21, 0.95)";
      ctx.beginPath();
      ctx.arc(goal.sx, goal.sy, 7, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "rgba(250, 204, 21, 0.95)";
      ctx.font = "12px Arial";
      ctx.fillText("GOAL", goal.sx + 10, goal.sy - 8);
    }

    if (map.odom?.pose) {
      const odom = toScreen(map.odom.pose.x, map.odom.pose.y);
      ctx.fillStyle = "rgba(167, 139, 250, 0.9)";
      ctx.beginPath();
      ctx.arc(odom.sx, odom.sy, 4.5, 0, Math.PI * 2);
      ctx.fill();
    }

    const yaw = deg2rad(robotPose.yaw_deg ?? 0);
    const size = 16;
    const tip = {
      x: robot.sx + Math.cos(yaw) * size,
      y: robot.sy - Math.sin(yaw) * size,
    };
    const leftWing = {
      x: robot.sx + Math.cos(yaw + deg2rad(140)) * (size * 0.85),
      y: robot.sy - Math.sin(yaw + deg2rad(140)) * (size * 0.85),
    };
    const rightWing = {
      x: robot.sx + Math.cos(yaw - deg2rad(140)) * (size * 0.85),
      y: robot.sy - Math.sin(yaw - deg2rad(140)) * (size * 0.85),
    };

    ctx.fillStyle = "rgba(226, 232, 240, 0.95)";
    ctx.beginPath();
    ctx.moveTo(tip.x, tip.y);
    ctx.lineTo(leftWing.x, leftWing.y);
    ctx.lineTo(rightWing.x, rightWing.y);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "rgba(226, 232, 240, 0.9)";
    ctx.font = "12px Arial";
    ctx.fillText("ROBOT", robot.sx + 12, robot.sy + 4);
  }, [bounds, height, map, padding]);

  if (!map) {
    return (
      <div
        className={`rounded-xl border border-slate-700/40 bg-slate-900/40 p-4 ${className}`}
      >
        <div className="mb-2 text-sm font-semibold text-slate-200">Map</div>
        <div className="flex h-[520px] items-center justify-center rounded-lg border border-slate-700/30 bg-slate-950/20 text-sm text-slate-400">
          Loading lidar map...
        </div>
      </div>
    );
  }

  return (
    <div
      className={`rounded-xl border border-slate-700/40 bg-slate-900/40 p-4 ${className}`}
    >
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm font-semibold text-slate-200">
          Lidar Point Cloud Map
        </div>
        <div className="text-xs font-mono text-slate-400">
          {map.meta?.map_id ?? "--"}
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-700/30 bg-slate-950/20">
        <canvas ref={canvasRef} />
      </div>

      <div className="mt-2 text-xs text-slate-400">
        Green points are the current scan, cyan points are recent scan history,
        violet line is the robot trail, and the goal vector comes from navigation.
      </div>
    </div>
  );
}
