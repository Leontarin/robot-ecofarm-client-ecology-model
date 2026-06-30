import path from "node:path";
import { promises as fs } from "node:fs";

const DEFAULT_SESSION_ROOT = path.join(process.cwd(), "src", "session-data");
const SESSION_ID_PATTERN = /^session_[A-Za-z0-9_-]+$/;
const DEFAULT_ASSOCIATION_DISTANCE_M = 0.2;

const CLASS_LEGEND = [
  {
    key: "ripe_bunch",
    classIds: [0],
    label: "Ripe bunch",
    color: "#7f1d1d",
    maturityScore: 1,
  },
  {
    key: "ripe_tomato",
    classIds: [1],
    label: "Ripe tomato",
    color: "#dc2626",
    maturityScore: 0.9,
  },
  {
    key: "unripe_tomato",
    classIds: [2],
    label: "Unripe tomato",
    color: "#22c55e",
    maturityScore: 0.1,
  },
  {
    key: "unripe_bunch",
    classIds: [3],
    label: "Unripe bunch",
    color: "#15803d",
    maturityScore: 0,
  },
  {
    key: "unknown",
    classIds: [],
    label: "Unknown",
    color: "#94a3b8",
    maturityScore: 0.5,
  },
];

function finite(value, fallback = null) {
  if (value == null || value === "") return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function nonEmptyString(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function normalizeRelativePath(value) {
  return nonEmptyString(value)
    .replaceAll("\\", "/")
    .replaceAll("//", "/")
    .replace(/^\.\//, "")
    .replace(/^\/+/, "");
}

function resolveSessionRoot() {
  return process.env.ROBOT_DASHBOARD_SESSION_ROOT || DEFAULT_SESSION_ROOT;
}

function sanitizeSessionId(sessionId) {
  const clean = nonEmptyString(sessionId).trim();
  return SESSION_ID_PATTERN.test(clean) ? clean : "";
}

async function pathIsDirectory(targetPath) {
  try {
    return (await fs.stat(targetPath)).isDirectory();
  } catch {
    return false;
  }
}

async function fileExists(targetPath) {
  try {
    return (await fs.stat(targetPath)).isFile();
  } catch {
    return false;
  }
}

async function readJson(targetPath, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(targetPath, "utf8"));
  } catch {
    return fallback;
  }
}

async function readJsonLines(targetPath) {
  if (!(await fileExists(targetPath))) return [];

  const text = await fs.readFile(targetPath, "utf8");

  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith("version https://git-lfs.github.com/spec/"))
    .flatMap((line) => {
      try {
        return [JSON.parse(line)];
      } catch {
        return [];
      }
    });
}

function sessionAssetUrl(sessionId, relativePath) {
  const clean = normalizeRelativePath(relativePath);
  if (!sessionId || !clean) return null;

  return `/api/session-file?session=${encodeURIComponent(sessionId)}&path=${encodeURIComponent(clean)}`;
}

function tomatoClass(label, classId) {
  const raw = nonEmptyString(label, "unknown").toLowerCase().replaceAll("_", " ");
  const isBunch = raw.includes("bunch") || raw.includes("cluster") || classId === 0 || classId === 3;
  const isUnripe = raw.includes("unripe") || raw.includes("green") || classId === 2 || classId === 3;
  const isRipe = raw.includes("ripe") || raw.includes("turning") || classId === 0 || classId === 1;

  let key = "unknown";
  if (isBunch && isUnripe) key = "unripe_bunch";
  else if (isBunch && isRipe) key = "ripe_bunch";
  else if (isUnripe) key = "unripe_tomato";
  else if (isRipe) key = "ripe_tomato";

  return CLASS_LEGEND.find((item) => item.key === key) ?? CLASS_LEGEND.at(-1);
}

function normalizeBbox(bbox) {
  const x = finite(bbox?.x);
  const y = finite(bbox?.y);
  const w = finite(bbox?.w);
  const h = finite(bbox?.h);
  const valid = x != null && y != null && w != null && h != null && w > 0 && h > 0;

  return {
    valid,
    x: valid ? x : null,
    y: valid ? y : null,
    w: valid ? w : null,
    h: valid ? h : null,
  };
}

function classVoteKey(item) {
  return item.classKey || "unknown";
}

function weightedMean(items, valueSelector) {
  let numerator = 0;
  let denominator = 0;

  for (const item of items) {
    const value = valueSelector(item);
    const weight = Math.max(finite(item.confidence, 0.35), 0.1);

    if (Number.isFinite(value)) {
      numerator += value * weight;
      denominator += weight;
    }
  }

  return denominator > 0 ? numerator / denominator : null;
}

function average(items, valueSelector) {
  const values = items.map(valueSelector).filter((value) => Number.isFinite(value));
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function pickClassFromObservations(observations) {
  const votes = new Map();

  observations.forEach((observation) => {
    const key = classVoteKey(observation);
    const weight = Math.max(finite(observation.confidence, 0.35), 0.1);
    votes.set(key, (votes.get(key) ?? 0) + weight);
  });

  const winner = [...votes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "unknown";
  return CLASS_LEGEND.find((item) => item.key === winner) ?? CLASS_LEGEND.at(-1);
}

function pickRepresentative(observations) {
  return observations
    .slice()
    .sort((a, b) => {
      const confidenceDifference = (b.confidence ?? 0) - (a.confidence ?? 0);
      if (confidenceDifference !== 0) return confidenceDifference;
      return (b.timestampMs ?? 0) - (a.timestampMs ?? 0);
    })[0] ?? null;
}

function normalizeEnvironmentRows(rows) {
  const sorted = rows
    .map((row) => {
      const environment = row?.environment ?? row?.env ?? {};
      return {
        timestampMs: finite(row?.timestamp_ms ?? row?.timestampMs),
        timestampLocal: row?.timestamp_local ?? row?.timestampLocal ?? null,
        tempC: finite(environment?.temp_c ?? environment?.tempC ?? environment?.temperature),
        humidityPct: finite(environment?.humidity_pct ?? environment?.humidityPct ?? environment?.humidity),
        pressureHpa: finite(environment?.pressure_hpa ?? environment?.pressureHpa ?? environment?.pressure),
        gasKohm: finite(
          environment?.gas_kohm ??
            environment?.gasKohm ??
            environment?.gas_resistance_kohm ??
            environment?.gasResistanceKohm ??
            environment?.gas,
        ),
        valid: environment?.valid !== false,
      };
    })
    .filter(
      (row) =>
        row.timestampMs != null &&
        [row.tempC, row.humidityPct, row.pressureHpa, row.gasKohm].some(
          (value) => value != null,
        ),
    )
    .sort((a, b) => a.timestampMs - b.timestampMs);

  const firstTimestamp = sorted[0]?.timestampMs ?? null;

  return sorted.map((row, index) => ({
    ...row,
    index,
    tSec: firstTimestamp == null ? index : Math.max(0, (row.timestampMs - firstTimestamp) / 1000),
  }));
}

function environmentStats(rows) {
  const statsFor = (key) => {
    const values = rows.map((row) => row[key]).filter((value) => Number.isFinite(value));
    if (!values.length) return { min: null, max: null, avg: null };

    return {
      min: Math.min(...values),
      max: Math.max(...values),
      avg: values.reduce((sum, value) => sum + value, 0) / values.length,
    };
  };

  return {
    samples: rows.length,
    tempC: statsFor("tempC"),
    humidityPct: statsFor("humidityPct"),
    pressureHpa: statsFor("pressureHpa"),
    gasKohm: statsFor("gasKohm"),
  };
}

function normalizeRobotTrail(rows) {
  return rows
    .map((row) => {
      const pose = row?.map_pose ?? row?.mapPose ?? {};
      const x = finite(pose?.robot_x ?? pose?.x);
      const y = finite(pose?.robot_y ?? pose?.y);

      if (x == null || y == null) return null;

      return {
        timestampMs: finite(row?.timestamp_ms ?? row?.timestampMs),
        timestampLocal: row?.timestamp_local ?? row?.timestampLocal ?? null,
        x,
        y,
        yawDeg: finite(pose?.robot_yaw_deg ?? pose?.yawDeg),
        distanceM: finite(pose?.robot_distance_m ?? pose?.distanceM),
      };
    })
    .filter(Boolean)
    .sort((a, b) => (a.timestampMs ?? 0) - (b.timestampMs ?? 0));
}

function normalizeTomatoObservations(rows, sessionId) {
  const observations = [];

  rows.forEach((row, eventIndex) => {
    const timestampMs = finite(row?.timestamp_ms ?? row?.timestampMs);
    const detections = Array.isArray(row?.detections) ? row.detections : [];
    const mapPose = row?.map_pose ?? {};
    const annotatedImagePath = normalizeRelativePath(
      row?.annotated_image_path ?? row?.image_path,
    );
    const rawImagePath = normalizeRelativePath(row?.raw_image_path);

    detections.forEach((detection, detectionIndex) => {
      const projection = detection?.map_projection ?? {};
      const x = finite(projection?.x);
      const y = finite(projection?.y);
      const isAccepted =
        detection?.weak !== true &&
        detection?.valid !== false &&
        detection?.display_suppressed !== true;

      if (!isAccepted || projection?.valid !== true || x == null || y == null || timestampMs == null) {
        return;
      }

      const classId = finite(detection?.class_id, -1);
      const classInfo = tomatoClass(detection?.label, classId);
      const imagePath = annotatedImagePath || normalizeRelativePath(row?.image_path);

      observations.push({
        id: `${timestampMs}-${eventIndex}-${detectionIndex}`,
        timestampMs,
        timestampLocal: row?.timestamp_local ?? row?.timestampLocal ?? null,
        classId,
        classKey: classInfo.key,
        label: classInfo.label,
        sourceLabel: nonEmptyString(detection?.label, "unknown"),
        color: classInfo.color,
        maturityScore: classInfo.maturityScore,
        confidence: finite(detection?.confidence, 0),
        trackId: finite(detection?.track_id, -1),
        trackHits: finite(detection?.track_hits, 0),
        trackStableBest: detection?.track_stable_best === true,
        x,
        y,
        bbox: normalizeBbox(detection?.bbox),
        imagePath,
        imageUrl: sessionAssetUrl(sessionId, imagePath),
        rawImagePath,
        rawImageUrl: sessionAssetUrl(sessionId, rawImagePath),
        projection: {
          method: nonEmptyString(projection?.method, "unknown"),
          approximate: projection?.approximate !== false,
          distanceM: finite(projection?.projection_distance_m),
          cameraPanLeftDeg: finite(projection?.camera_pan_left_deg),
          bboxBearingDeg: finite(projection?.bbox_bearing_deg),
          mapBearingDeg: finite(projection?.map_bearing_deg),
        },
        scanPose: {
          x: finite(mapPose?.robot_x),
          y: finite(mapPose?.robot_y),
          yawDeg: finite(mapPose?.robot_yaw_deg),
          distanceM: finite(mapPose?.robot_distance_m),
        },
      });
    });
  });

  return observations.sort((a, b) => a.timestampMs - b.timestampMs);
}

function clusterObservations(observations, associationDistanceM = DEFAULT_ASSOCIATION_DISTANCE_M) {
  const clusters = [];

  for (const observation of observations) {
    let closest = null;

    for (const cluster of clusters) {
      const distanceM = Math.hypot(observation.x - cluster.x, observation.y - cluster.y);
      if (distanceM <= associationDistanceM && (!closest || distanceM < closest.distanceM)) {
        closest = { cluster, distanceM };
      }
    }

    if (closest) {
      closest.cluster.observations.push(observation);
      closest.cluster.x = weightedMean(closest.cluster.observations, (item) => item.x);
      closest.cluster.y = weightedMean(closest.cluster.observations, (item) => item.y);
      continue;
    }

    clusters.push({
      x: observation.x,
      y: observation.y,
      observations: [observation],
    });
  }

  const landmarkByObservationId = new Map();

  const landmarks = clusters.map((cluster, index) => {
    const observationsInCluster = cluster.observations.slice().sort((a, b) => a.timestampMs - b.timestampMs);
    const classInfo = pickClassFromObservations(observationsInCluster);
    const representative = pickRepresentative(observationsInCluster);
    const landmarkId = `landmark-${String(index + 1).padStart(2, "0")}`;

    observationsInCluster.forEach((observation) => landmarkByObservationId.set(observation.id, landmarkId));

    return {
      id: landmarkId,
      x: weightedMean(observationsInCluster, (item) => item.x),
      y: weightedMean(observationsInCluster, (item) => item.y),
      classId: representative?.classId ?? -1,
      classKey: classInfo.key,
      label: classInfo.label,
      color: classInfo.color,
      maturityScore: classInfo.maturityScore,
      confidence: average(observationsInCluster, (item) => item.confidence),
      bestConfidence: Math.max(...observationsInCluster.map((item) => item.confidence ?? 0), 0),
      observationCount: observationsInCluster.length,
      sourceTrackIds: [...new Set(observationsInCluster.map((item) => item.trackId).filter((id) => id >= 0))],
      firstTimestampMs: observationsInCluster[0]?.timestampMs ?? null,
      firstTimestampLocal: observationsInCluster[0]?.timestampLocal ?? null,
      latestTimestampMs: observationsInCluster.at(-1)?.timestampMs ?? null,
      latestTimestampLocal: observationsInCluster.at(-1)?.timestampLocal ?? null,
      representative,
      observations: observationsInCluster,
    };
  });

  return {
    landmarks,
    observations: observations.map((observation) => ({
      ...observation,
      landmarkId: landmarkByObservationId.get(observation.id) ?? null,
    })),
  };
}

function buildAnalysisExtent(landmarks, robotTrail) {
  const points = [
    ...landmarks.map((item) => ({ x: item.x, y: item.y })),
    ...robotTrail.map((item) => ({ x: item.x, y: item.y })),
  ].filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));

  if (!points.length) {
    return {
      minX: -1,
      maxX: 1,
      minY: -1,
      maxY: 1,
      widthM: 2,
      heightM: 2,
      paddingM: 0.4,
    };
  }

  let minX = Math.min(...points.map((point) => point.x));
  let maxX = Math.max(...points.map((point) => point.x));
  let minY = Math.min(...points.map((point) => point.y));
  let maxY = Math.max(...points.map((point) => point.y));

  const paddingM = Math.max(0.28, Math.max(maxX - minX, maxY - minY) * 0.18);
  minX -= paddingM;
  maxX += paddingM;
  minY -= paddingM;
  maxY += paddingM;

  const minimumSpanM = 1.35;
  if (maxX - minX < minimumSpanM) {
    const center = (minX + maxX) / 2;
    minX = center - minimumSpanM / 2;
    maxX = center + minimumSpanM / 2;
  }

  if (maxY - minY < minimumSpanM) {
    const center = (minY + maxY) / 2;
    minY = center - minimumSpanM / 2;
    maxY = center + minimumSpanM / 2;
  }

  return {
    minX,
    maxX,
    minY,
    maxY,
    widthM: maxX - minX,
    heightM: maxY - minY,
    paddingM,
  };
}

function countSourceDetections(detectionRows) {
  let accepted = 0;
  let weak = 0;
  let total = 0;

  detectionRows.forEach((row) => {
    const detections = Array.isArray(row?.detections) ? row.detections : [];
    total += detections.length;
    detections.forEach((detection) => {
      if (detection?.weak === true) weak += 1;
      else if (detection?.valid !== false && detection?.display_suppressed !== true) accepted += 1;
    });
  });

  return { total, accepted, weak };
}

async function buildSessionListItem(sessionRoot, id) {
  const directory = path.join(sessionRoot, id);
  const manifest = await readJson(path.join(directory, "session_manifest.json"), null);
  const summary = await readJson(path.join(directory, "map_overlay_summary.json"), null);
  const hasDetections = await fileExists(path.join(directory, "detections_on_map.jsonl"));
  const hasTimeline = await fileExists(path.join(directory, "robot_timeline.jsonl"));

  return {
    id,
    label: manifest?.started_at_local ?? summary?.session_id ?? id,
    startedAt: manifest?.started_at_local ?? null,
    stoppedAt: manifest?.stopped_at_local ?? null,
    hasDetections,
    hasM5Stick: hasTimeline,
    mapAvailable: summary?.map?.valid === true,
    counts: {
      detectionEvents: finite(manifest?.counts?.detections_on_map_events, 0),
      mapPoseRows: finite(manifest?.counts?.map_pose_rows, 0),
      timelineRows: finite(manifest?.counts?.timeline_rows, 0),
      acceptedImages: finite(manifest?.counts?.ok_images, 0),
    },
  };
}

export async function listDataAnalysisSessions() {
  const sessionRoot = resolveSessionRoot();
  if (!(await pathIsDirectory(sessionRoot))) return [];

  const entries = await fs.readdir(sessionRoot, { withFileTypes: true });
  const ids = entries
    .filter((entry) => entry.isDirectory() && SESSION_ID_PATTERN.test(entry.name))
    .map((entry) => entry.name);

  const sessions = await Promise.all(ids.map((id) => buildSessionListItem(sessionRoot, id)));
  return sessions.sort((a, b) => b.id.localeCompare(a.id));
}

export async function buildDataAnalysisSessionPayload(requestedSessionId = "") {
  const sessions = await listDataAnalysisSessions();
  const cleanRequestedId = sanitizeSessionId(requestedSessionId);
  const selectedSessionId =
    sessions.find((item) => item.id === cleanRequestedId)?.id ?? sessions[0]?.id ?? null;

  if (!selectedSessionId) {
    return {
      kind: "ecofarm_data_analysis_session",
      selectedSessionId: null,
      sessions: [],
      session: null,
      environment: { series: [], stats: { samples: 0 }, validity: { envPct: null, imuPct: null } },
      map: { landmarks: [], observations: [], robotTrail: [], layout: buildAnalysisExtent([], []) },
      classes: CLASS_LEGEND,
      quality: { message: "No session-data folders were found." },
    };
  }

  const sessionRoot = resolveSessionRoot();
  const sessionDir = path.join(sessionRoot, selectedSessionId);
  const [manifest, summary, robotTimelineRows, poseRows, detectionRows] = await Promise.all([
    readJson(path.join(sessionDir, "session_manifest.json"), null),
    readJson(path.join(sessionDir, "map_overlay_summary.json"), null),
    readJsonLines(path.join(sessionDir, "robot_timeline.jsonl")),
    readJsonLines(path.join(sessionDir, "map_pose_timeline.jsonl")),
    readJsonLines(path.join(sessionDir, "detections_on_map.jsonl")),
  ]);

  const environmentSeries = normalizeEnvironmentRows(robotTimelineRows);
  const robotTrail = normalizeRobotTrail(poseRows);
  const rawObservations = normalizeTomatoObservations(detectionRows, selectedSessionId);
  const clustered = clusterObservations(rawObservations);
  const layout = buildAnalysisExtent(clustered.landmarks, robotTrail);
  const sourceCounts = countSourceDetections(detectionRows);
  const latestTimestampMs = Math.max(
    ...robotTrail.map((item) => item.timestampMs ?? 0),
    ...clustered.observations.map((item) => item.timestampMs ?? 0),
    0,
  );

  return {
    kind: "ecofarm_data_analysis_session",
    selectedSessionId,
    sessions,
    session: {
      id: selectedSessionId,
      label: manifest?.started_at_local ?? selectedSessionId,
      startedAt: manifest?.started_at_local ?? null,
      stoppedAt: manifest?.stopped_at_local ?? null,
      stopReason: manifest?.stop_reason ?? summary?.stop_reason ?? null,
      latestTimestampMs,
    },
    classes: CLASS_LEGEND,
    environment: {
      series: environmentSeries,
      stats: environmentStats(environmentSeries),
      sampleCount: environmentSeries.length,
      totalEntries: robotTimelineRows.length,
      validity: {
        envPct:
          robotTimelineRows.length > 0
            ? environmentSeries.length / robotTimelineRows.length
            : null,
        imuPct: null,
      },
      gasAvailable: environmentSeries.some((item) => item.gasKohm != null),
    },
    map: {
      layout,
      robotTrail,
      observations: clustered.observations,
      landmarks: clustered.landmarks,
      associationDistanceM: DEFAULT_ASSOCIATION_DISTANCE_M,
      coordinateNote:
        "Tomato anchors use the saved detections_on_map.jsonl map projections. The exporter labels these camera-bearing fixed-distance projections as approximate.",
      sourceMap: {
        valid: summary?.map?.valid === true,
        resolutionM: finite(summary?.map?.resolution_m),
        originX: finite(summary?.map?.origin_x),
        originY: finite(summary?.map?.origin_y),
      },
    },
    quality: {
      sourceDetectionEvents: detectionRows.length,
      acceptedObservationCount: sourceCounts.accepted,
      weakObservationCount: sourceCounts.weak,
      totalSourceDetections: sourceCounts.total,
      groupedLandmarkCount: clustered.landmarks.length,
      hasM5Stick: environmentSeries.length > 0,
      gasAvailable: environmentSeries.some((item) => item.gasKohm != null),
      usesApproximateMapProjection: true,
    },
  };
}
