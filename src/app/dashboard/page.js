"use client";

import { useEffect, useState } from "react";
import { fetchMap, fetchTelemetry } from "@/lib/api";
import CameraStreamCard from "@/components/CameraStreamCard";
import DetectionsPanel from "@/components/DetectionsPanel";
import MapPanel from "@/components/MapPanel";
import TelemetryBar from "@/components/TelemetryBar";

function StatusPill({ label, tone = "neutral" }) {
  const tones = {
    neutral: "border-slate-700/70 bg-slate-900/70 text-slate-200",
    info: "border-cyan-500/30 bg-cyan-500/10 text-cyan-200",
    success: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
    warning: "border-amber-500/30 bg-amber-500/10 text-amber-200",
    danger: "border-rose-500/30 bg-rose-500/10 text-rose-200",
  };

  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] ${tones[tone]}`}
    >
      {label}
    </span>
  );
}

function OverviewCard({ eyebrow, title, value, hint, tone = "neutral" }) {
  const accents = {
    neutral: "from-slate-400/25 to-transparent",
    info: "from-cyan-400/25 to-transparent",
    success: "from-emerald-400/25 to-transparent",
    warning: "from-amber-400/25 to-transparent",
    danger: "from-rose-400/25 to-transparent",
  };

  return (
    <div className="relative overflow-hidden rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
      <div
        className={`pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b ${accents[tone]}`}
      />
      <div className="relative space-y-3">
        <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-500">
          {eyebrow}
        </div>
        <div className="text-sm text-slate-300">{title}</div>
        <div className="text-3xl font-semibold text-white">{value}</div>
        <div className="text-xs text-slate-500">{hint}</div>
      </div>
    </div>
  );
}

function MetricRow({ label, value, hint }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-2xl border border-slate-800/80 bg-slate-950/70 px-4 py-3">
      <div>
        <div className="text-xs uppercase tracking-[0.24em] text-slate-500">
          {label}
        </div>
        <div className="mt-1 text-sm text-slate-400">{hint}</div>
      </div>
      <div className="text-right text-lg font-semibold text-white">{value}</div>
    </div>
  );
}

function SystemPanel({ t }) {
  const systemTone = t.robot?.emergency_stop
    ? "danger"
    : t.robot?.warning_active
      ? "warning"
      : "success";

  return (
    <section className="rounded-[2rem] border border-slate-800 bg-slate-900/65 p-5 shadow-[0_24px_80px_rgba(15,23,42,0.42)]">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-emerald-300">
            Robot Debug Snapshot
          </div>
          <h2 className="mt-2 text-2xl font-semibold text-white">
            Live operational state from the running robot
          </h2>
        </div>
        <StatusPill label={t.robot?.mode ?? "Unknown"} tone={systemTone} />
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <OverviewCard
          eyebrow="Status Text"
          title="Unified robot status"
          value={t.robot?.status_text ?? "N/A"}
          hint={`uptime ${(t.uptimeMs / 1000).toFixed(1)} sec`}
          tone={systemTone}
        />
        <OverviewCard
          eyebrow="Pose Source"
          title="Navigation estimate"
          value={t.navigation?.pose_source ?? "None"}
          hint={`yaw ${t.navigation?.pose?.yaw_deg?.toFixed?.(1) ?? "0.0"}°`}
          tone={t.navigation?.valid ? "success" : "warning"}
        />
        <OverviewCard
          eyebrow="LiDAR Confidence"
          title="Search corridor estimation"
          value={`${t.derived?.lidarConfidencePct ?? 0}%`}
          hint={`${t.derived?.pointCloudCount ?? 0} cloud points in latest frame`}
          tone={t.lidar?.pose?.valid ? "success" : "warning"}
        />
        <OverviewCard
          eyebrow="ENV Gas"
          title="M5Stick ENV module"
          value={`${(t.env?.gasKohm ?? 0).toFixed(1)} kΩ`}
          hint={`${(t.env?.temperatureC ?? 0).toFixed(1)}°C | ${(t.env?.humidityPct ?? 0).toFixed(1)}% RH`}
          tone={t.env?.valid ? "info" : "danger"}
        />
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[1.2fr_1fr]">
        <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-500">
                Navigation Core
              </div>
              <div className="mt-2 text-lg font-semibold text-white">
                Goal and motion guidance
              </div>
            </div>
            <StatusPill
              label={t.navigation?.fresh ? "fresh" : t.navigation?.stale ? "stale" : "unknown"}
              tone={t.navigation?.fresh ? "success" : "warning"}
            />
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <MetricRow
              label="Pose"
              value={`${(t.navigation?.pose?.x_m ?? 0).toFixed(2)}, ${(t.navigation?.pose?.y_m ?? 0).toFixed(2)}`}
              hint={`yaw ${(t.navigation?.pose?.yaw_deg ?? 0).toFixed(1)}°`}
            />
            <MetricRow
              label="Goal Distance"
              value={`${(t.navigation?.goal?.distance_m ?? 0).toFixed(2)} m`}
              hint={`bearing ${(t.navigation?.goal?.bearing_deg ?? 0).toFixed(1)}°`}
            />
            <MetricRow
              label="Motion State"
              value={t.navigation?.motion_state ?? "Unknown"}
              hint={t.navigation?.turn_state ?? "Unknown"}
            />
          </div>
        </div>

        <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
          <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-500">
            Availability
          </div>
          <div className="mt-4 grid gap-3">
            <MetricRow
              label="Camera"
              value={t.health?.camera_available ? "Available" : "Offline"}
              hint={`detector ${t.health?.detector_running ? "running" : "stopped"}`}
            />
            <MetricRow
              label="LiDAR"
              value={t.health?.lidar_available ? "Available" : "Offline"}
              hint={`nearest ${
                t.derived?.nearestObstacleM != null
                  ? `${t.derived.nearestObstacleM.toFixed(2)} m`
                  : "n/a"
              }`}
            />
            <MetricRow
              label="M5Stick"
              value={t.health?.m5stick_available ? "Connected" : "Disconnected"}
              hint={`stale systems: ${t.derived?.staleSystems?.join(", ") || "none"}`}
            />
            <MetricRow
              label="Replay Frame"
              value={`${(t.stream?.index ?? 0) + 1}/${t.stream?.totalEntries ?? 0}`}
              hint={`loop step ${t.stream?.stepMs ?? 0} ms from jsonl`}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function SensorGrid({ t }) {
  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <div className="rounded-3xl border border-slate-800 bg-slate-900/65 p-5">
        <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-cyan-300">
          IMU PRO
        </div>
        <div className="mt-3 text-3xl font-semibold text-white">
          {(t.imu?.gyroMagnitude ?? 0).toFixed(2)}
        </div>
        <div className="mt-2 text-sm text-slate-400">
          gyro magnitude | accel {(t.imu?.accelMagnitude ?? 0).toFixed(3)}
        </div>
        <div className="mt-4 text-xs text-slate-500">
          Gyro z {(t.imu?.gyro?.z ?? 0).toFixed(3)} | accel y {(t.imu?.accel?.y ?? 0).toFixed(3)}
        </div>
      </div>

      <div className="rounded-3xl border border-slate-800 bg-slate-900/65 p-5">
        <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-amber-300">
          ENV Module
        </div>
        <div className="mt-3 text-3xl font-semibold text-white">
          {(t.env?.humidityPct ?? 0).toFixed(1)}%
        </div>
        <div className="mt-2 text-sm text-slate-400">
          {(t.env?.pressureHpa ?? 0).toFixed(2)} hPa | {(t.env?.temperatureC ?? 0).toFixed(1)}°C
        </div>
        <div className="mt-4 text-xs text-slate-500">
          Gas {(t.env?.gasKohm ?? 0).toFixed(1)} kΩ
        </div>
      </div>

      <div className="rounded-3xl border border-slate-800 bg-slate-900/65 p-5">
        <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-emerald-300">
          Vision Pipeline
        </div>
        <div className="mt-3 text-3xl font-semibold text-white">
          {t.perception?.detection_count ?? 0}
        </div>
        <div className="mt-2 text-sm text-slate-400">
          detections in latest frame
        </div>
        <div className="mt-4 text-xs text-slate-500">
          Best target {t.derived?.targetLabel ?? "none"}
        </div>
      </div>

      <div className="rounded-3xl border border-slate-800 bg-slate-900/65 p-5">
        <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-rose-300">
          Safety State
        </div>
        <div className="mt-3 text-3xl font-semibold text-white">
          {t.robot?.emergency_stop ? "E-STOP" : "Ready"}
        </div>
        <div className="mt-2 text-sm text-slate-400">
          warning {t.robot?.warning_active ? "active" : "clear"}
        </div>
        <div className="mt-4 text-xs text-slate-500">
          target lost {t.behavior?.target_lost ? "yes" : "no"}
        </div>
      </div>
    </section>
  );
}

function AlertStrip({ t }) {
  const items = [
    {
      label: "Warning State",
      value: t.robot?.warning_active
        ? t.robot?.status_text ?? "Warning active"
        : "No warning flag from robot",
      tone: t.robot?.warning_active ? "warning" : "success",
    },
    {
      label: "Target Tracking",
      value: t.behavior?.target_lost
        ? "Target lost in tracking pipeline"
        : "Tracking state nominal",
      tone: t.behavior?.target_lost ? "danger" : "success",
    },
    {
      label: "Nav Guard",
      value: t.navGuard?.safe_stop_requested
        ? "Safe stop requested"
        : "No safe-stop trigger",
      tone: t.navGuard?.safe_stop_requested ? "danger" : "info",
    },
  ];

  return (
    <section className="grid gap-3 xl:grid-cols-3">
      {items.map((item) => (
        <div
          key={item.label}
          className="rounded-2xl border border-slate-800 bg-slate-900/65 p-4"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-semibold text-white">{item.label}</div>
            <StatusPill label={item.tone} tone={item.tone} />
          </div>
          <div className="mt-3 text-sm text-slate-400">{item.value}</div>
        </div>
      ))}
    </section>
  );
}

export default function DashboardPage() {
  const [telemetry, setTelemetry] = useState(null);
  const [telemetryError, setTelemetryError] = useState(null);
  const [map, setMap] = useState(null);
  const [mapError, setMapError] = useState(null);

  useEffect(() => {
    let alive = true;

    async function tick() {
      try {
        const data = await fetchTelemetry();
        if (!alive) return;
        setTelemetry(data);
        setTelemetryError(null);
      } catch (error) {
        if (!alive) return;
        setTelemetryError(error?.message || "Telemetry error");
      }
    }

    tick();
    const id = setInterval(tick, 1000);

    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    let alive = true;

    async function tickMap() {
      try {
        const data = await fetchMap();
        if (!alive) return;
        setMap(data);
        setMapError(null);
      } catch (error) {
        if (!alive) return;
        setMapError(error?.message || "Map error");
      }
    }

    tickMap();
    const id = setInterval(tickMap, 1000);

    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const clockText = telemetry?.ts
    ? new Intl.DateTimeFormat("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }).format(new Date(telemetry.ts))
    : "--:--:--";

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[2rem] border border-slate-800 bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.18),_transparent_28%),radial-gradient(circle_at_top_right,_rgba(56,189,248,0.16),_transparent_24%),linear-gradient(180deg,rgba(2,6,23,0.96),rgba(15,23,42,0.88))] p-6 shadow-[0_28px_90px_rgba(2,6,23,0.55)]">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <div className="text-[11px] font-semibold uppercase tracking-[0.34em] text-emerald-300">
              Robot Eco Farm
            </div>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight text-white">
              Dashboard bound to the robot debug JSON and JSONL exports
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
              The dashboard now reflects the real runtime structure exported by
              your robot: robot mode, navigation, odometry, lidar sector hints,
              M5Stick IMU and ENV telemetry, and live detector output.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:min-w-[380px]">
            <div className="rounded-3xl border border-white/10 bg-white/5 p-4 backdrop-blur">
              <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">
                Snapshot Time
              </div>
              <div className="mt-2 text-lg font-semibold text-white">
                {clockText}
              </div>
              <div className="mt-1 text-sm text-slate-400">
                {telemetry?.ts
                  ? new Date(telemetry.ts).toLocaleDateString("en-GB")
                  : "Waiting for data"}
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/5 p-4 backdrop-blur">
              <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">
                Replay Status
              </div>
              <div className="mt-2 text-lg font-semibold text-white">
                {telemetry
                  ? `Frame ${(telemetry.stream?.index ?? 0) + 1} of ${telemetry.stream?.totalEntries ?? 0}`
                  : "--"}
              </div>
              <div className="mt-1 text-sm text-slate-400">
                replaying the jsonl log in a loop
              </div>
            </div>
          </div>
        </div>
      </section>

      {telemetryError && (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {telemetryError}
        </div>
      )}

      {!telemetry ? (
        <div className="rounded-3xl border border-slate-800 bg-slate-900/65 p-8 text-sm text-slate-300">
          Loading live robot telemetry from debug export...
        </div>
      ) : (
        <>
          <TelemetryBar
            t={telemetry}
            compact={false}
            className="shadow-[0_18px_60px_rgba(2,6,23,0.35)]"
          />
          <SystemPanel t={telemetry} />
          <SensorGrid t={telemetry} />
          <AlertStrip t={telemetry} />

          <div className="grid gap-4 xl:grid-cols-[1.6fr_0.95fr]">
            <div className="space-y-4">
              {mapError && (
                <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                  {mapError}
                </div>
              )}
              <MapPanel map={map} height={620} />
            </div>

            <div className="flex flex-col gap-4">
              <CameraStreamCard
                title="Perception and Tracker Feed"
                initialOn
                telemetry={telemetry}
                onToggle={(isOn) =>
                  console.log("Camera stream metadata:", isOn ? "ON" : "OFF")
                }
              />
              <DetectionsPanel />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
