"use client";

import { useEffect, useState } from "react";
import EstimatedSessionMap from "./EstimatedSessionMap";

function formatNumber(value, digits = 1) {
  return Number.isFinite(value) ? value.toFixed(digits) : "—";
}

function formatBoolean(value) {
  if (value === true) return "Yes";
  if (value === false) return "No";
  return "—";
}

function MetricCard({ label, value, detail, tone = "slate" }) {
  const toneClass = {
    emerald: "border-emerald-400/20 bg-emerald-400/10",
    cyan: "border-cyan-400/20 bg-cyan-400/10",
    amber: "border-amber-400/20 bg-amber-400/10",
    rose: "border-rose-400/20 bg-rose-400/10",
    fuchsia: "border-fuchsia-400/20 bg-fuchsia-400/10",
    slate: "border-slate-800 bg-slate-950/70",
  }[tone];

  return (
    <div className={`rounded-3xl border p-4 ${toneClass}`}>
      <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold text-white">{value}</div>
      <div className="mt-1 min-h-[1.25rem] text-sm text-slate-400">{detail}</div>
    </div>
  );
}

export default function RobotDebugPanel() {
  const [payload, setPayload] = useState(null);
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadSession(sessionId = "") {
    setLoading(true);
    setError("");

    try {
      const query = sessionId
        ? `?session=${encodeURIComponent(sessionId)}`
        : "";
      const response = await fetch(`/api/robot-debug/session${query}`, {
        cache: "no-store",
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error ?? `HTTP ${response.status}`);
      }

      setPayload(data);
      setSelectedSessionId(data.selectedSessionId ?? "");
    } catch (loadError) {
      setPayload(null);
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Failed to load robot session data.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSession();
  }, []);

  const latest = payload?.latest ?? null;
  const session = payload?.session ?? null;
  const timeline = Array.isArray(payload?.timeline) ? payload.timeline : [];
  const detectionEvents = Array.isArray(payload?.detectionEvents)
    ? payload.detectionEvents
    : [];
  const lidarPreview = payload?.lidarPreview ?? null;

  const environment = latest?.environment ?? null;
  const perception = latest?.perception ?? null;
  const lidar = latest?.lidar ?? null;
  const camera = latest?.camera_view ?? null;
  const robot = latest?.robot ?? null;
  const latestTimelineRow = timeline.at(-1) ?? null;
  const timelineRowsForDisplay = timeline.slice(-20).reverse();
  const acceptedEventCount = detectionEvents.filter(
    (event) => event.acceptedDetections?.length > 0,
  ).length;

  if (loading && !payload) {
    return (
      <section className="rounded-[2rem] border border-slate-800 bg-slate-900/65 p-6">
        <div className="text-sm text-slate-400">Loading robot session data…</div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="rounded-[2rem] border border-rose-400/30 bg-rose-400/10 p-6">
        <div className="text-sm font-semibold text-rose-200">
          Robot Debug data could not be loaded
        </div>
        <div className="mt-2 text-sm text-rose-100/80">{error}</div>
      </section>
    );
  }

  if (!payload?.sessions?.length) {
    return (
      <section className="rounded-[2rem] border border-slate-800 bg-slate-900/65 p-6">
        <div className="text-sm font-semibold text-white">No robot sessions found</div>
        <p className="mt-2 text-sm text-slate-400">
          Add a folder matching <code>session_YYYYMMDD_HHMMSS</code> or{" "}
          <code>session-YYYYMMDD-HHMMSS</code> under{" "}
          <code>src/session-data</code>.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <div className="rounded-[2rem] border border-slate-800 bg-slate-900/65 p-5">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-cyan-300">
              Robot session inspection
            </div>
            <h2 className="mt-2 text-2xl font-semibold text-white">Robot Debug</h2>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-400">
              Inspect saved robot runs and reconstruct an estimated session-local
              top-down map from real robot telemetry. This is separate from the
              mock ecological spatial layer and does not feed Greenhouse Map,
              PCA, scenarios, or Kriging-style prediction.
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
              Active session
              <select
                value={selectedSessionId}
                onChange={(event) => loadSession(event.target.value)}
                className="min-w-[270px] rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-medium normal-case tracking-normal text-white outline-none transition focus:border-cyan-400"
              >
                {payload.sessions.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.id}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="button"
              onClick={() => loadSession(selectedSessionId)}
              disabled={loading}
              className="rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-sm font-semibold text-cyan-100 transition hover:border-cyan-300 hover:bg-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "Refreshing…" : "Refresh"}
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Session window"
          value={session?.startedAtLocal ?? "—"}
          detail={`Stopped ${session?.stoppedAtLocal ?? "—"}`}
          tone="cyan"
        />
        <MetricCard
          label="Robot timeline"
          value={timeline.length}
          detail={`${session?.counts?.timeline_rows ?? timeline.length} stored rows`}
          tone="slate"
        />
        <MetricCard
          label="Accepted image events"
          value={acceptedEventCount}
          detail={`${session?.counts?.ok_images ?? 0} retained accepted images`}
          tone="emerald"
        />
        <MetricCard
          label="LiDAR preview"
          value={lidarPreview?.pointCount ?? 0}
          detail={`${lidarPreview?.scansAcceptedForPreview ?? 0} scan previews retained`}
          tone="amber"
        />
      </div>

      <EstimatedSessionMap
        sessionId={selectedSessionId}
        timeline={timeline}
        lidarPreview={lidarPreview}
        detectionEvents={detectionEvents}
      />

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-[2rem] border border-slate-800 bg-slate-900/65 p-5">
          <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-emerald-300">
            Environment snapshot
          </div>
          <h3 className="mt-2 text-xl font-semibold text-white">
            Latest recorded microclimate
          </h3>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <MetricCard
              label="Temperature"
              value={
                environment?.temp_c != null
                  ? `${formatNumber(environment.temp_c)}°C`
                  : "—"
              }
              detail={environment?.fresh ? "Fresh in latest record" : "Not fresh"}
              tone="emerald"
            />
            <MetricCard
              label="Humidity"
              value={
                environment?.humidity_pct != null
                  ? `${formatNumber(environment.humidity_pct)}%`
                  : "—"
              }
              detail="Relative humidity"
              tone="cyan"
            />
            <MetricCard
              label="Pressure"
              value={
                environment?.pressure_hpa != null
                  ? `${formatNumber(environment.pressure_hpa)} hPa`
                  : "—"
              }
              detail="Atmospheric pressure"
              tone="slate"
            />
          </div>
          <p className="mt-4 text-sm leading-6 text-slate-400">
            Gas resistance is not displayed because it is not present in the
            loaded latest-session environment object.
          </p>
        </div>

        <div className="rounded-[2rem] border border-slate-800 bg-slate-900/65 p-5">
          <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-amber-300">
            Safety and LiDAR
          </div>
          <h3 className="mt-2 text-xl font-semibold text-white">
            Latest proximity state
          </h3>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <MetricCard
              label="Warning active"
              value={formatBoolean(robot?.warning_active)}
              detail={robot?.status_text ?? "Robot status unavailable"}
              tone={robot?.warning_active ? "amber" : "emerald"}
            />
            <MetricCard
              label="Emergency stop"
              value={formatBoolean(robot?.emergency_stop)}
              detail="Robot emergency-stop state"
              tone={robot?.emergency_stop ? "rose" : "emerald"}
            />
            <MetricCard
              label="Obstacle close"
              value={formatBoolean(lidar?.any_close)}
              detail="Derived from latest LiDAR proximity values"
              tone={lidar?.any_close ? "amber" : "emerald"}
            />
            <MetricCard
              label="Front distance"
              value={
                lidar?.front_m != null ? `${formatNumber(lidar.front_m, 2)} m` : "—"
              }
              detail={`Left ${formatNumber(lidar?.left_m, 2)} m · Right ${formatNumber(
                lidar?.right_m,
                2,
              )} m`}
              tone="slate"
            />
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-[2rem] border border-slate-800 bg-slate-900/65 p-5">
          <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-fuchsia-300">
            Perception snapshot
          </div>
          <h3 className="mt-2 text-xl font-semibold text-white">Latest detection state</h3>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <MetricCard
              label="Accepted"
              value={perception?.accepted_count ?? "—"}
              detail="Current accepted detections"
              tone="emerald"
            />
            <MetricCard
              label="Weak"
              value={perception?.weak_count ?? "—"}
              detail="Visible weak/noise detections"
              tone="amber"
            />
            <MetricCard
              label="Rejected"
              value={perception?.rejected_count ?? "—"}
              detail="Current rejected detections"
              tone="rose"
            />
          </div>
          <div className="mt-4 rounded-3xl border border-slate-800 bg-slate-950/70 p-4 text-sm">
            <div className="font-semibold text-white">Best current detection</div>
            <div className="mt-2 leading-6 text-slate-400">
              {perception?.best_detection
                ? `${perception.best_detection.label} · confidence ${formatNumber(
                    perception.best_detection.confidence,
                    3,
                  )} · track ${perception.best_detection.track_id ?? "—"}`
                : "No best detection is available in the latest record."}
            </div>
          </div>
        </div>

        <div className="rounded-[2rem] border border-slate-800 bg-slate-900/65 p-5">
          <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-cyan-300">
            Camera snapshot
          </div>
          <h3 className="mt-2 text-xl font-semibold text-white">
            Camera orientation at latest record
          </h3>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <MetricCard
              label="Pan"
              value={
                camera?.pan_relative_deg != null
                  ? `${formatNumber(camera.pan_relative_deg, 0)}°`
                  : "—"
              }
              detail="Relative to camera center"
              tone="cyan"
            />
            <MetricCard
              label="Tilt"
              value={
                camera?.tilt_relative_deg != null
                  ? `${formatNumber(camera.tilt_relative_deg, 0)}°`
                  : "—"
              }
              detail="Relative to camera center"
              tone="cyan"
            />
            <MetricCard
              label="Digital zoom"
              value={camera?.digital_zoom ?? "—"}
              detail={camera?.valid ? "Camera view valid" : "Camera view unavailable"}
              tone="slate"
            />
          </div>
          <p className="mt-4 text-sm leading-6 text-slate-400">
            Camera direction is robot-relative. The estimated map combines it
            with a session-local robot path; it does not create verified
            greenhouse-world coordinates.
          </p>
        </div>
      </div>

      <div className="rounded-[2rem] border border-slate-800 bg-slate-900/65 p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-cyan-300">
              Saved robot timeline
            </div>
            <h3 className="mt-2 text-xl font-semibold text-white">
              Latest 20 recorded samples
            </h3>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              Read-only saved timeline from the selected session. Use this to
              inspect the source telemetry behind the estimated map.
            </p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3 text-sm">
            <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
              Timeline samples
            </div>
            <div className="mt-1 font-semibold text-white">{timeline.length}</div>
            <div className="mt-1 text-xs text-slate-400">
              Latest: {latestTimelineRow?.timestampLocal ?? "—"}
            </div>
          </div>
        </div>

        {timelineRowsForDisplay.length === 0 ? (
          <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-950/60 p-4 text-sm text-slate-400">
            No timeline rows were returned for this session.
          </div>
        ) : (
          <div className="mt-5 overflow-x-auto rounded-2xl border border-slate-800">
            <table className="min-w-[980px] w-full text-left text-sm">
              <thead className="bg-slate-950 text-[10px] uppercase tracking-[0.16em] text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">Time</th>
                  <th className="px-4 py-3 font-semibold">Temperature</th>
                  <th className="px-4 py-3 font-semibold">Humidity</th>
                  <th className="px-4 py-3 font-semibold">Pressure</th>
                  <th className="px-4 py-3 font-semibold">Drive command</th>
                  <th className="px-4 py-3 font-semibold">LiDAR front</th>
                  <th className="px-4 py-3 font-semibold">Obstacle close</th>
                  <th className="px-4 py-3 font-semibold">Robot status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {timelineRowsForDisplay.map((row, index) => (
                  <tr
                    key={`${row.timestampMs ?? "row"}-${index}`}
                    className="bg-slate-900/30 text-slate-300"
                  >
                    <td className="whitespace-nowrap px-4 py-3 text-slate-400">
                      {row.timestampLocal ?? "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {row.temperatureC != null ? `${formatNumber(row.temperatureC)}°C` : "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {row.humidityPct != null ? `${formatNumber(row.humidityPct)}%` : "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {row.pressureHpa != null ? `${formatNumber(row.pressureHpa)} hPa` : "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {formatNumber(row.forwardSpeed, 0)} / {formatNumber(row.steeringSpeed, 0)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {row.frontDistanceM != null ? `${formatNumber(row.frontDistanceM, 2)} m` : "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {formatBoolean(row.obstacleClose)}
                    </td>
                    <td
                      className="max-w-[300px] truncate px-4 py-3 text-slate-400"
                      title={row.robotStatus ?? ""}
                    >
                      {row.robotStatus ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
