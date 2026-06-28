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
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.28em] text-cyan-300">
            Detection Filters
          </div>
          <h3 className="mt-1 text-base font-semibold text-white">Tomato markers</h3>
        </div>
        <div className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-xs text-slate-300">
          {visibleCount}/{totalCount}
        </div>
      </div>

      <div className="mt-3 grid gap-2">
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
    <Card className="p-4">
      <div className="text-[10px] font-semibold uppercase tracking-[0.28em] text-purple-300">
        Scan Playback
      </div>
      <h3 className="mt-1 text-base font-semibold text-white">Manual timeline</h3>
      <p className="mt-1 text-xs leading-5 text-slate-400">
        Move the bar to reveal the robot route and tomato detections over time.
      </p>

      <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[11px] text-slate-300">
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

      <div className="mt-4 flex items-center gap-2">
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

      <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
        <span>{map?.session?.startedAt?.slice(-8) ?? "start"}</span>
        <span>{progress}%</span>
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
      : "No gas data in this session";

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.28em] text-emerald-300">
            Environment
          </div>
          <h3 className="mt-1 text-base font-semibold text-white">Sensor snapshot</h3>
        </div>
        <div className="rounded-full border border-slate-700 bg-slate-900 px-2 py-1 text-[10px] text-slate-400">
          {sample?.timestampLocal?.slice(-8) ?? "—"}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <MiniMetric label="Temp" value={`${formatNumber(sample?.tempC, 1)}°C`} hint="Greenhouse air" tone="emerald" />
        <MiniMetric label="Humidity" value={`${formatNumber(sample?.humidityPct, 1)}%`} hint="Relative humidity" tone="cyan" />
        <MiniMetric label="Gas change" value={gasValue} hint={gasHint} tone="amber" />
        <MiniMetric label="Pressure" value={`${formatNumber(sample?.pressureHpa, 1)}`} hint="hPa" tone="purple" />
      </div>

      {stats?.samples ? (
        <div className="mt-3 text-[11px] text-slate-500">
          {stats.samples} environment samples are synced with the scan timeline.
        </div>
      ) : null}
    </Card>
  );
}

function DetectionDetails({ detection }) {
  if (!detection) {
    return (
      <Card className="p-4">
        <div className="text-[10px] font-semibold uppercase tracking-[0.28em] text-amber-300">
          Selected Detection
        </div>
        <div className="mt-3 rounded-3xl border border-dashed border-slate-700 bg-slate-950/50 p-5 text-sm text-slate-400">
          Click a tomato marker on the map to view the annotated frame, confidence and estimated location.
        </div>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-slate-800 px-4 py-3">
        <div className="text-[10px] font-semibold uppercase tracking-[0.28em] text-amber-300">
          Selected Detection
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-white">{detection.categoryLabel}</h3>
            <p className="text-sm text-slate-400">{detection.timestampLocal ?? "No timestamp"}</p>
          </div>
          <span className={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${detection.weak ? "border-amber-400/35 bg-amber-400/10 text-amber-200" : "border-emerald-400/35 bg-emerald-400/10 text-emerald-200"}`}>
            {detection.weak ? "Weak" : "Strong"}
          </span>
        </div>
      </div>

      {detection.image?.annotatedUrl ? (
        <div className="bg-slate-950/90 p-3">
          <img
            src={detection.image.annotatedUrl}
            alt="Annotated tomato detection frame"
            className="max-h-[240px] w-full rounded-2xl border border-slate-800 object-contain"
          />
        </div>
      ) : (
        <div className="bg-slate-950/90 p-5 text-sm text-slate-400">
          No annotated image was found for this detection.
        </div>
      )}

      <div className="grid gap-3 p-4 text-sm text-slate-300">
        <div className="grid grid-cols-2 gap-2">
          <Info label="Model label" value={detection.label} />
          <Info label="Confidence" value={`${detection.confidencePct ?? "—"}%`} />
          <Info label="Map X/Y" value={`${formatNumber(detection.projection?.x, 2)} / ${formatNumber(detection.projection?.y, 2)} m`} />
          <Info label="Projection" value={detection.projection?.methodLabel ?? "estimated"} />
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-3 text-xs leading-5 text-slate-400">
          Estimated position from robot pose and camera bearing. Useful for greenhouse review, not exact depth measurement.
        </div>
      </div>
    </Card>
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
  const videoUrl = map?.media?.browserVideoUrl ?? map?.media?.videoUrl;
  const videoMimeType = map?.media?.browserVideoUrl
    ? "video/mp4"
    : map?.media?.mimeType || "video/mp4";
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
      <div className="border-b border-slate-800 px-4 py-3">
        <div className="text-[10px] font-semibold uppercase tracking-[0.28em] text-emerald-300">
          Robot Video
        </div>
        <h3 className="mt-1 text-base font-semibold text-white">Scan recording</h3>
      </div>

      {videoUrl ? (
        <>
          <div className="bg-black p-2">
            <video
              ref={videoRef}
              className="max-h-[190px] w-full rounded-2xl border border-slate-800 bg-black"
              controls
              preload="metadata"
              onError={() => setVideoError(true)}
            >
              <source src={videoUrl} type={videoMimeType} />
            </video>
          </div>
          <div className="grid grid-cols-4 gap-2 px-3 py-3">
            <button className="rounded-xl border border-slate-700 bg-slate-900 px-2 py-2 text-xs text-slate-200 hover:bg-slate-800" onClick={() => videoRef.current?.play()} type="button">
              Play
            </button>
            <button className="rounded-xl border border-slate-700 bg-slate-900 px-2 py-2 text-xs text-slate-200 hover:bg-slate-800" onClick={() => videoRef.current?.pause()} type="button">
              Pause
            </button>
            <button className="rounded-xl border border-slate-700 bg-slate-900 px-2 py-2 text-xs text-slate-200 hover:bg-slate-800" onClick={() => jump(-5)} type="button">
              -5s
            </button>
            <button className="rounded-xl border border-slate-700 bg-slate-900 px-2 py-2 text-xs text-slate-200 hover:bg-slate-800" onClick={() => jump(5)} type="button">
              +5s
            </button>
          </div>

          {map?.media?.browserCompatible && (
            <div className="border-t border-cyan-400/15 bg-cyan-400/5 px-4 py-2 text-[11px] leading-5 text-cyan-100/80">
              Browser-compatible H.264 playback is generated by the server on request and reused from its video cache.
            </div>
          )}

          {videoError && (
            <div className="border-t border-amber-400/20 bg-amber-400/10 px-4 py-3 text-xs leading-5 text-amber-100">
              The browser-compatible video could not be played. Check the server terminal for the FFmpeg conversion error, then reload this dashboard page.
            </div>
          )}
        </>
      ) : (
        <div className="p-4 text-sm text-slate-400">No video file was found in this session.</div>
      )}
    </Card>
  );
}

function StatsSummary({ map }) {
  const [open, setOpen] = useState(false);
  const stats = map?.stats?.detections ?? {};
  const byCategory = stats.byCategory ?? {};

  return (
    <Card className="overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full flex-col gap-3 px-4 py-3 text-left transition hover:bg-white/[0.03] lg:flex-row lg:items-center lg:justify-between"
      >
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.3em] text-cyan-300">Scan overview</div>
          <div className="mt-1 text-sm text-slate-300">
            {open ? "Hide summary cards" : "Show compact greenhouse summary"}
          </div>
        </div>
        <div className="grid w-full grid-cols-2 gap-2 lg:w-auto lg:grid-cols-4">
          <MiniMetric label="Total" value={formatInt(stats.total)} hint="markers" tone="cyan" />
          <MiniMetric label="Strong / Weak" value={`${formatInt(stats.strong)} / ${formatInt(stats.weak)}`} hint="quality" tone="purple" />
          <MiniMetric label="Distance" value={`${formatNumber(stats.estimatedScannedDistanceM, 2)} m`} hint="scanned" tone="emerald" />
          <MiniMetric label="Route" value={formatInt(map?.stats?.trailPoints)} hint="points" tone="slate" />
        </div>
      </button>

      {open && (
        <div className="grid gap-2 border-t border-slate-800 p-3 sm:grid-cols-2 lg:grid-cols-5">
          <MiniMetric label="Ripe tomatoes" value={formatInt(byCategory.ripe_tomato)} hint="Single ripe tomatoes" tone="emerald" />
          <MiniMetric label="Unripe tomatoes" value={formatInt(byCategory.unripe_tomato)} hint="Single unripe/green" tone="amber" />
          <MiniMetric label="Ripe bunches" value={formatInt(byCategory.ripe_bunch)} hint="Estimated clusters" tone="emerald" />
          <MiniMetric label="Unripe bunches" value={formatInt(byCategory.unripe_bunch)} hint="Estimated clusters" tone="amber" />
          <MiniMetric label="First detection" value={formatDateTime(stats.firstDetectionTime)} hint="Start of findings" tone="slate" />
          <MiniMetric label="Last detection" value={formatDateTime(stats.lastDetectionTime)} hint="End of findings" tone="slate" />
          <MiniMetric label="Scanned distance" value={`${formatNumber(stats.estimatedScannedDistanceM, 2)} m`} hint="Estimated odometry" tone="cyan" />
          <MiniMetric label="Route points" value={formatInt(map?.stats?.trailPoints)} hint="Robot path samples" tone="slate" />
          <MiniMetric label="Environment" value={formatInt(map?.environment?.stats?.samples)} hint="sensor samples" tone="purple" />
          <MiniMetric label="Session" value={map?.session?.startedAt?.slice(0, 10) ?? "—"} hint={map?.session?.startedAt?.slice(-8) ?? "date"} tone="slate" />
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
    let alive = true;

    async function loadMap() {
      setLoadingMap(true);
      try {
        const data = await fetchMap(selectedSession);
        if (!alive) return;
        setMap(data);
        setMapError(null);
        setPlaybackIndex(0);
        setSelectedDetection(null);
      } catch (error) {
        if (!alive) return;
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
  const visibleDetections = useMemo(
    () => filterDetections(map?.detections, filters, currentTimeMs),
    [map, filters, currentTimeMs],
  );
  const currentEnvironment = useMemo(
    () => findClosestEnvironmentSample(map?.environment?.timeline, currentTimeMs),
    [map, currentTimeMs],
  );
  const selectedSessionItem = sessions.find((session) => session.id === selectedSession);

  const selectedDetectionIsVisible = selectedDetection
    ? visibleDetections.some((item) => item.id === selectedDetection.id)
    : false;

  useEffect(() => {
    if (selectedDetection && !selectedDetectionIsVisible) {
      setSelectedDetection(null);
    }
  }, [selectedDetection, selectedDetectionIsVisible]);

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-[1.75rem] border border-slate-800 bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.16),_transparent_28%),radial-gradient(circle_at_top_right,_rgba(56,189,248,0.14),_transparent_24%),linear-gradient(180deg,rgba(2,6,23,0.97),rgba(15,23,42,0.9))] p-5 shadow-[0_24px_80px_rgba(2,6,23,0.48)]">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <div className="text-[10px] font-semibold uppercase tracking-[0.34em] text-emerald-300">
              Robot Eco Farm
            </div>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">
              Greenhouse Scan Dashboard
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
              Review a saved robot scan, follow the route on the ROS2 SLAM map, filter tomato detections, and inspect annotated frames from the selected session.
            </p>
          </div>

          <div className="min-w-full rounded-3xl border border-white/10 bg-white/5 p-3 backdrop-blur xl:min-w-[420px]">
            <label className="text-[10px] font-semibold uppercase tracking-[0.28em] text-slate-400">
              Scan Session
            </label>
            <select
              value={selectedSession}
              onChange={(event) => setSelectedSession(event.target.value)}
              className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm font-semibold text-white outline-none focus:border-cyan-400"
            >
              {sessions.map((session) => (
                <option key={session.id} value={session.id}>
                  {formatSessionLabel(session)} — {session.id}
                </option>
              ))}
            </select>
            <div className="mt-2 text-xs text-slate-400">
              {selectedSessionItem
                ? `${selectedSessionItem.counts?.detectionEvents ?? 0} detection events · ${selectedSessionItem.counts?.poseRows ?? 0} route samples`
                : "Place session folders under src/session-data"}
            </div>
          </div>
        </div>
      </section>

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

      {map && <StatsSummary map={map} />}

      {map && (
        <div className="grid gap-4 xl:grid-cols-[340px_minmax(0,1fr)_390px]">
          <div className="space-y-4 xl:self-start">
            <TimelineControl
              map={map}
              playbackIndex={playbackIndex}
              setPlaybackIndex={setPlaybackIndex}
              visibleDetections={visibleDetections}
            />
            <EnvironmentSnapshot sample={currentEnvironment} stats={map?.environment?.stats} />
            <VideoPanel map={map} />
          </div>

          <div className="min-w-0">
            <MapPanel
              map={map}
              playbackTimeMs={currentTimeMs}
              filters={filters}
              selectedDetectionId={selectedDetection?.id ?? null}
              onSelectDetection={setSelectedDetection}
              height={620}
            />
          </div>

          <div className="space-y-4 xl:self-start">
            <FiltersPanel
              filters={filters}
              setFilters={setFilters}
              visibleCount={visibleDetections.length}
              totalCount={map?.detections?.length ?? 0}
            />
            <DetectionDetails detection={selectedDetection} />
          </div>
        </div>
      )}

      {!loadingMap && !map && !mapError && (
        <Card className="p-8 text-sm text-slate-300">
          No ROS2 scan session was found. Add folders like src/session-data/session_YYYYMMDD_HHMMSS.
        </Card>
      )}
    </div>
  );
}
