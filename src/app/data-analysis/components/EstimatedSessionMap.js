"use client";

import { useMemo, useState } from "react";
import { buildEstimatedSessionMap } from "../lib/estimatedSessionMap";

const SVG_WIDTH = 980;
const SVG_HEIGHT = 600;
const SVG_PADDING = 52;

function formatNumber(value, digits = 2) {
  return Number.isFinite(value) ? value.toFixed(digits) : "—";
}

function getPrimaryDetection(observation) {
  return observation?.acceptedDetections?.[0] ?? null;
}

function projectionSourceLabel(source) {
  if (source === "nearby-lidar-preview") {
    return "Nearby LiDAR range proxy";
  }

  return "Display calibration distance";
}

export default function EstimatedSessionMap({
  timeline = [],
  lidarPreview = null,
  detectionEvents = [],
}) {
  const [motionScale, setMotionScale] = useState(0.01);
  const [turnGain, setTurnGain] = useState(0.05);
  const [observationDistance, setObservationDistance] = useState(1);
  const [selectedObservationId, setSelectedObservationId] = useState(null);

  const calibration = useMemo(
    () => ({
      motionMetersPerCommandSecond: motionScale,
      turnDegreesPerCommandSecond: turnGain,
      observationRayDistanceM: observationDistance,
    }),
    [motionScale, turnGain, observationDistance],
  );

  const estimatedMap = useMemo(
    () =>
      buildEstimatedSessionMap(
        {
          timeline,
          lidarPreview,
          detectionEvents,
        },
        calibration,
      ),
    [timeline, lidarPreview, detectionEvents, calibration],
  );

  const {
    poses,
    lidarPoints,
    observations,
    bounds,
  } = estimatedMap;

  const selectedObservation =
    observations.find(
      (observation) => observation.id === selectedObservationId,
    ) ??
    observations[0] ??
    null;

  const activeObservationId = selectedObservation?.id ?? null;
  const selectedDetection = getPrimaryDetection(selectedObservation);

  function toSvgPoint(xM, yM) {
    const availableWidth = SVG_WIDTH - SVG_PADDING * 2;
    const availableHeight = SVG_HEIGHT - SVG_PADDING * 2;

    /*
     * Top-down convention:
     * - Session-local forward (+x) points upward on screen.
     * - Robot-left (+y) points left on screen.
     */
    const x =
      SVG_PADDING +
      ((bounds.maxYM - yM) / bounds.heightM) * availableWidth;

    const y =
      SVG_HEIGHT -
      SVG_PADDING -
      ((xM - bounds.minXM) / bounds.widthM) * availableHeight;

    return { x, y };
  }

  const posePath = poses
    .map((pose) => {
      const point = toSvgPoint(pose.xM, pose.yM);
      return `${point.x},${point.y}`;
    })
    .join(" ");

  const startPose = poses[0] ?? null;
  const latestPose = poses[poses.length - 1] ?? null;

  return (
    <section className="rounded-[2rem] border border-slate-800 bg-slate-900/65 p-5">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-emerald-300">
            Real session telemetry · estimated map
          </div>

          <h3 className="mt-2 text-2xl font-semibold text-white">
            Estimated Session Map
          </h3>

          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
            The robot trail is estimated from saved timeline timestamps and
            drive commands. LiDAR points and accepted detection observations
            are then aligned to that estimated session-local path. This is not
            SLAM and not a verified greenhouse coordinate map.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          <div className="rounded-2xl border border-slate-800 bg-slate-950/70 px-3 py-2">
            <div className="text-[10px] uppercase tracking-[0.15em] text-slate-500">
              Poses
            </div>
            <div className="mt-1 font-semibold text-white">{poses.length}</div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-950/70 px-3 py-2">
            <div className="text-[10px] uppercase tracking-[0.15em] text-slate-500">
              LiDAR points
            </div>
            <div className="mt-1 font-semibold text-white">
              {lidarPoints.length}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-950/70 px-3 py-2">
            <div className="text-[10px] uppercase tracking-[0.15em] text-slate-500">
              Observations
            </div>
            <div className="mt-1 font-semibold text-white">
              {observations.length}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-950/70 px-3 py-2">
            <div className="text-[10px] uppercase tracking-[0.15em] text-slate-500">
              Frame
            </div>
            <div className="mt-1 font-semibold text-white">Session-local</div>
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-3 rounded-3xl border border-slate-800 bg-slate-950/60 p-4 lg:grid-cols-3">
        <label className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold uppercase tracking-[0.14em] text-slate-400">
              Motion scale
            </span>
            <span className="text-cyan-200">
              {formatNumber(motionScale, 3)} m / command·s
            </span>
          </div>

          <input
            type="range"
            min="0.001"
            max="0.05"
            step="0.001"
            value={motionScale}
            onChange={(event) => setMotionScale(Number(event.target.value))}
          />

          <span className="text-xs text-slate-500">
            Display calibration for forward-drive commands.
          </span>
        </label>

        <label className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold uppercase tracking-[0.14em] text-slate-400">
              Turn gain
            </span>
            <span className="text-cyan-200">
              {formatNumber(turnGain, 3)}° / command·s
            </span>
          </div>

          <input
            type="range"
            min="0.001"
            max="0.2"
            step="0.001"
            value={turnGain}
            onChange={(event) => setTurnGain(Number(event.target.value))}
          />

          <span className="text-xs text-slate-500">
            Display calibration for steering commands.
          </span>
        </label>

        <label className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold uppercase tracking-[0.14em] text-slate-400">
              Fallback ray distance
            </span>
            <span className="text-cyan-200">
              {formatNumber(observationDistance, 2)} m
            </span>
          </div>

          <input
            type="range"
            min="0.25"
            max="3"
            step="0.05"
            value={observationDistance}
            onChange={(event) =>
              setObservationDistance(Number(event.target.value))
            }
          />

          <span className="text-xs text-slate-500">
            Used only when no nearby LiDAR range matches a camera ray.
          </span>
        </label>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-950/75">
          <div className="border-b border-slate-800 px-4 py-3 text-xs text-slate-400">
            <span className="font-semibold text-emerald-200">Green path:</span>{" "}
            estimated robot trail ·{" "}
            <span className="font-semibold text-slate-200">gray points:</span>{" "}
            transformed LiDAR preview ·{" "}
            <span className="font-semibold text-amber-200">orange rays:</span>{" "}
            accepted detection observations
          </div>

          <div className="aspect-[49/30] min-h-[320px] w-full">
            <svg
              viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
              className="h-full w-full"
              role="img"
              aria-label="Estimated session-local robot path, LiDAR point cloud, and accepted detection observations"
            >
              <rect
                x="0"
                y="0"
                width={SVG_WIDTH}
                height={SVG_HEIGHT}
                fill="#020617"
              />

              {Array.from({ length: 6 }, (_, index) => {
                const x = SVG_PADDING +
                  ((SVG_WIDTH - SVG_PADDING * 2) * index) / 5;

                return (
                  <line
                    key={`vertical-grid-${index}`}
                    x1={x}
                    x2={x}
                    y1={SVG_PADDING}
                    y2={SVG_HEIGHT - SVG_PADDING}
                    stroke="#1e293b"
                    strokeWidth="1"
                    strokeDasharray="4 7"
                  />
                );
              })}

              {Array.from({ length: 6 }, (_, index) => {
                const y = SVG_PADDING +
                  ((SVG_HEIGHT - SVG_PADDING * 2) * index) / 5;

                return (
                  <line
                    key={`horizontal-grid-${index}`}
                    x1={SVG_PADDING}
                    x2={SVG_WIDTH - SVG_PADDING}
                    y1={y}
                    y2={y}
                    stroke="#1e293b"
                    strokeWidth="1"
                    strokeDasharray="4 7"
                  />
                );
              })}

              {lidarPoints.map((point) => {
                const svgPoint = toSvgPoint(
                  point.estimatedXM,
                  point.estimatedYM,
                );

                return (
                  <circle
                    key={point.id}
                    cx={svgPoint.x}
                    cy={svgPoint.y}
                    r="1.2"
                    fill="#94a3b8"
                    fillOpacity="0.55"
                  />
                );
              })}

              {posePath && (
                <polyline
                  points={posePath}
                  fill="none"
                  stroke="#34d399"
                  strokeWidth="3"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              )}

              {observations.map((observation) => {
                const robotPoint = toSvgPoint(
                  observation.robotXM,
                  observation.robotYM,
                );

                const projectedPoint = toSvgPoint(
                  observation.projectedXM,
                  observation.projectedYM,
                );

                const isSelected = observation.id === activeObservationId;

                return (
                  <g key={observation.id}>
                    <line
                      x1={robotPoint.x}
                      y1={robotPoint.y}
                      x2={projectedPoint.x}
                      y2={projectedPoint.y}
                      stroke={isSelected ? "#fbbf24" : "#f59e0b"}
                      strokeWidth={isSelected ? "2.8" : "1.5"}
                      strokeDasharray="7 5"
                      strokeOpacity={isSelected ? "1" : "0.55"}
                    />

                    <circle
                      cx={projectedPoint.x}
                      cy={projectedPoint.y}
                      r={isSelected ? "8" : "5.5"}
                      fill={isSelected ? "#fbbf24" : "#f59e0b"}
                      stroke="#ffffff"
                      strokeWidth={isSelected ? "2" : "1"}
                      className="cursor-pointer"
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedObservationId(observation.id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          setSelectedObservationId(observation.id);
                        }
                      }}
                    >
                      <title>
                        {observation.timestampLocal ?? "Unknown time"}
                      </title>
                    </circle>
                  </g>
                );
              })}

              {startPose && (() => {
                const point = toSvgPoint(startPose.xM, startPose.yM);

                return (
                  <g>
                    <circle
                      cx={point.x}
                      cy={point.y}
                      r="7"
                      fill="#22c55e"
                      stroke="#ffffff"
                      strokeWidth="2"
                    />
                    <text
                      x={point.x + 10}
                      y={point.y - 10}
                      fill="#bbf7d0"
                      fontSize="15"
                      fontWeight="700"
                    >
                      Start
                    </text>
                  </g>
                );
              })()}

              {latestPose && (() => {
                const point = toSvgPoint(latestPose.xM, latestPose.yM);
                const headingDistanceM = Math.max(
                    Math.min(bounds.widthM, bounds.heightM) * 0.08,
                    0.2,
                );

                const headingPoint = toSvgPoint(
                    latestPose.xM + Math.cos(latestPose.yawRad) * headingDistanceM,
                    latestPose.yM + Math.sin(latestPose.yawRad) * headingDistanceM,
                );

                return (
                  <g>
                    <circle
                      cx={point.x}
                      cy={point.y}
                      r="8"
                      fill="#06b6d4"
                      stroke="#ffffff"
                      strokeWidth="2"
                    />
                    <line
                      x1={point.x}
                      y1={point.y}
                      x2={headingPoint.x}
                      y2={headingPoint.y}
                      stroke="#ffffff"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                    />
                    <text
                      x={point.x + 11}
                      y={point.y + 20}
                      fill="#a5f3fc"
                      fontSize="15"
                      fontWeight="700"
                    >
                      Latest
                    </text>
                  </g>
                );
              })()}

              <text
                x={SVG_PADDING}
                y={SVG_HEIGHT - 16}
                fill="#64748b"
                fontSize="13"
              >
                Top-down estimated session map · forward ↑ · robot-left ←
              </text>
            </svg>
          </div>
        </div>

        <aside className="rounded-3xl border border-slate-800 bg-slate-950/70 p-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-300">
            Selected observation
          </div>

          {selectedObservation ? (
            <>
              <div className="mt-3 text-lg font-semibold text-white">
                {selectedObservation.timestampLocal ?? "Unknown timestamp"}
              </div>

              <div className="mt-1 text-sm text-slate-400">
                {selectedObservation.acceptedCount} accepted ·{" "}
                {selectedObservation.weakCount} weak/noise in this event
              </div>

              <div className="mt-5 space-y-3 text-sm">
                <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-3">
                  <div className="text-xs uppercase tracking-[0.15em] text-slate-500">
                    First accepted detection
                  </div>
                  <div className="mt-1 font-semibold text-white">
                    {selectedDetection?.label ?? "Label unavailable"}
                  </div>
                  <div className="mt-1 text-slate-400">
                    Confidence: {formatNumber(selectedDetection?.confidence, 3)}
                  </div>
                  <div className="mt-1 text-slate-400">
                    Maturity score:{" "}
                    {formatNumber(selectedDetection?.maturityScore, 3)}
                  </div>
                  <div className="mt-1 text-slate-400">
                    Track ID: {selectedDetection?.trackId ?? "—"}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-3">
                  <div className="text-xs uppercase tracking-[0.15em] text-slate-500">
                    Estimated observation position
                  </div>
                  <div className="mt-1 text-slate-300">
                    x {formatNumber(selectedObservation.projectedXM)} · y{" "}
                    {formatNumber(selectedObservation.projectedYM)}
                  </div>
                  <div className="mt-1 text-slate-400">
                    Range:{" "}
                    {formatNumber(selectedObservation.projectionDistanceM)} m
                  </div>
                  <div className="mt-1 text-slate-400">
                    Source:{" "}
                    {projectionSourceLabel(selectedObservation.projectionSource)}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-3">
                  <div className="text-xs uppercase tracking-[0.15em] text-slate-500">
                    Robot estimate at observation
                  </div>
                  <div className="mt-1 text-slate-300">
                    x {formatNumber(selectedObservation.robotXM)} · y{" "}
                    {formatNumber(selectedObservation.robotYM)}
                  </div>
                  <div className="mt-1 text-slate-400">
                    Estimated yaw:{" "}
                    {formatNumber(selectedObservation.robotYawDeg, 1)}°
                  </div>
                  <div className="mt-1 text-slate-400">
                    Camera bearing:{" "}
                    {formatNumber(selectedObservation.cameraBearingDeg, 1)}°
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-sm text-slate-400">
              No accepted detection observations were found in this session.
            </div>
          )}
        </aside>
      </div>

      <p className="mt-4 text-xs leading-5 text-slate-500">
        Orange markers are estimated observation projections derived from real
        detection events, camera direction, and when available, nearby LiDAR
        range. They are not verified tomato world coordinates.
      </p>
    </section>
  );
}
