import path from "node:path";
import { promises as fs } from "node:fs";

const SESSION_DATA_DIR = path.join(process.cwd(), "src", "session-data");
const SESSION_FOLDER_PATTERN = /^session[-_]\d{8}[-_]\d{6}$/;

function assertValidSessionId(sessionId) {
  if (typeof sessionId !== "string" || !SESSION_FOLDER_PATTERN.test(sessionId)) {
    throw new Error(`Invalid robot session id: ${sessionId}`);
  }
}

function getSessionDirectory(sessionId) {
  assertValidSessionId(sessionId);
  return path.join(SESSION_DATA_DIR, sessionId);
}

function toFiniteNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function toBooleanOrNull(value) {
  return typeof value === "boolean" ? value : null;
}

function toStringOrNull(value) {
  return typeof value === "string" ? value : null;
}

async function readJsonFile(filePath, label) {
  try {
    const content = await fs.readFile(filePath, "utf8");
    return JSON.parse(content);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    throw new Error(`Could not read ${label}: ${message}`);
  }
}

async function readJsonlFile(filePath, label) {
  let content;

  try {
    content = await fs.readFile(filePath, "utf8");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    throw new Error(`Could not read ${label}: ${message}`);
  }

  const lines = content.split(/\r?\n/).filter((line) => line.trim() !== "");

  return lines.map((line, index) => {
    try {
      return JSON.parse(line);
    } catch {
      throw new Error(`Invalid JSONL row ${index + 1} in ${label}.`);
    }
  });
}

function buildSessionSummary(folderName, manifest) {
  return {
    id: folderName,
    sourceSessionId: manifest?.session_id ?? null,
    startedAtLocal: manifest?.started_at_local ?? null,
    stoppedAtLocal: manifest?.stopped_at_local ?? null,
    stopReason: manifest?.stop_reason ?? null,
    schemaVersion: manifest?.schema_version ?? null,
    counts: manifest?.counts ?? {},
    paths: manifest?.paths ?? {},
  };
}

function normalizeCameraView(cameraView) {
  const direction = cameraView?.direction_robot ?? {};

  return {
    valid: toBooleanOrNull(cameraView?.valid),
    panRelativeDeg: toFiniteNumber(cameraView?.pan_relative_deg),
    tiltRelativeDeg: toFiniteNumber(cameraView?.tilt_relative_deg),
    digitalZoom: toFiniteNumber(cameraView?.digital_zoom),
    timestampMs: toFiniteNumber(cameraView?.timestamp_ms),
    directionRobot: {
      xForward: toFiniteNumber(direction?.x_forward),
      yLeft: toFiniteNumber(direction?.y_left),
      zUp: toFiniteNumber(direction?.z_up),
    },
  };
}

function normalizeDetection(detection, eventId, index) {
  const bbox = detection?.bbox ?? {};

  return {
    id: `${eventId}-detection-${index}`,
    label: toStringOrNull(detection?.label),
    classId: toFiniteNumber(detection?.class_id),
    confidence: toFiniteNumber(detection?.confidence),
    currentConfidence: toFiniteNumber(detection?.current_confidence),
    bestConfidence: toFiniteNumber(detection?.best_confidence),

    valid: toBooleanOrNull(detection?.valid),
    weak: toBooleanOrNull(detection?.weak),
    displaySuppressed: toBooleanOrNull(detection?.display_suppressed),
    rejectReason: toStringOrNull(detection?.reject_reason),

    maturityScore: toFiniteNumber(detection?.maturity_score),
    maturityScoreRipe: toFiniteNumber(detection?.maturity_score_ripe),
    maturityScoreUnripe: toFiniteNumber(detection?.maturity_score_unripe),

    trackId: toFiniteNumber(detection?.track_id),
    trackHits: toFiniteNumber(detection?.track_hits),
    trackStableBest: toBooleanOrNull(detection?.track_stable_best),

    bbox: {
      x: toFiniteNumber(bbox?.x),
      y: toFiniteNumber(bbox?.y),
      w: toFiniteNumber(bbox?.w),
      h: toFiniteNumber(bbox?.h),
    },

    metrics: {
      boxArea: toFiniteNumber(detection?.metrics?.box_area),
      maskArea: toFiniteNumber(detection?.metrics?.mask_area),
      maskDensity: toFiniteNumber(detection?.metrics?.mask_density),
      redRatio: toFiniteNumber(detection?.metrics?.red_ratio),
      orangeRatio: toFiniteNumber(detection?.metrics?.orange_ratio),
      warmRatio: toFiniteNumber(detection?.metrics?.warm_ratio),
      greenYellowRatio: toFiniteNumber(
        detection?.metrics?.green_yellow_ratio,
      ),
    },
  };
}

function normalizeDetectionEvent(event, index) {
  const eventId = [
    toFiniteNumber(event?.timestamp_ms) ?? "unknown-time",
    event?.event_type ?? "unknown-event",
    index,
  ].join("-");

  const detections = Array.isArray(event?.detections)
    ? event.detections.map((detection, detectionIndex) =>
        normalizeDetection(detection, eventId, detectionIndex),
      )
    : [];

  const acceptedDetections = detections.filter(
    (detection) =>
      detection.valid === true &&
      detection.weak === false &&
      detection.displaySuppressed !== true,
  );

  return {
    id: eventId,
    eventType: toStringOrNull(event?.event_type),
    timestampMs: toFiniteNumber(event?.timestamp_ms),
    timestampLocal: toStringOrNull(event?.timestamp_local),

    imagePath: toStringOrNull(event?.image_path),
    annotatedImagePath: toStringOrNull(event?.annotated_image_path),
    rawImagePath: toStringOrNull(event?.raw_image_path),

    frame: {
      width: toFiniteNumber(event?.frame?.width),
      height: toFiniteNumber(event?.frame?.height),
      channels: toFiniteNumber(event?.frame?.channels),
      timestampMs: toFiniteNumber(event?.frame?.timestamp_ms),
    },

    camera: normalizeCameraView(event?.camera_view),

    acceptedCount: toFiniteNumber(event?.accepted_count),
    weakCount: toFiniteNumber(event?.weak_count),
    rejectedCount: toFiniteNumber(event?.rejected_count),

    detections,
    acceptedDetections,
  };
}

function normalizeLidarPreview(payload) {
  const rawPoints = Array.isArray(payload?.points) ? payload.points : [];

  const points = rawPoints
    .map((point) => ({
      xM: toFiniteNumber(point?.x_m),
      yM: toFiniteNumber(point?.y_m),
      distanceM: toFiniteNumber(point?.distance_m),
      angleDeg: toFiniteNumber(point?.angle_deg),
      timestampMs: toFiniteNumber(point?.timestamp_ms),
    }))
    .filter(
      (point) =>
        point.xM != null &&
        point.yM != null &&
        point.distanceM != null &&
        point.timestampMs != null,
    );

  return {
    schemaVersion: toFiniteNumber(payload?.schema_version),
    kind: toStringOrNull(payload?.kind),
    coordinateFrame: toStringOrNull(payload?.coordinate_frame),
    units: payload?.units ?? {},
    gridResolutionM: toFiniteNumber(payload?.grid_resolution_m),
    scansAcceptedForPreview: toFiniteNumber(
      payload?.scans_accepted_for_preview,
    ),
    scansSkippedNoMotion: toFiniteNumber(
      payload?.scans_skipped_no_motion,
    ),
    reportedPointCount: toFiniteNumber(payload?.point_count),
    pointCount: points.length,
    points,
  };
}

function normalizeTimelineRow(row) {
  return {
    timestampMs: toFiniteNumber(row?.timestamp_ms),
    timestampLocal: row?.timestamp_local ?? null,

    temperatureC: toFiniteNumber(row?.environment?.temp_c),
    humidityPct: toFiniteNumber(row?.environment?.humidity_pct),
    pressureHpa: toFiniteNumber(row?.environment?.pressure_hpa),
    environmentValid: toBooleanOrNull(row?.environment?.valid),
    environmentFresh: toBooleanOrNull(row?.environment?.fresh),

    acceptedCount: toFiniteNumber(row?.perception?.accepted_count),
    weakCount: toFiniteNumber(row?.perception?.weak_count),
    rejectedCount: toFiniteNumber(row?.perception?.rejected_count),

    frontDistanceM: toFiniteNumber(row?.lidar?.front_m),
    leftDistanceM: toFiniteNumber(row?.lidar?.left_m),
    rightDistanceM: toFiniteNumber(row?.lidar?.right_m),
    rearDistanceM: toFiniteNumber(row?.lidar?.rear_m),
    obstacleClose: toBooleanOrNull(row?.lidar?.any_close),
    lidarValid: toBooleanOrNull(row?.lidar?.valid),
    lidarFresh: toBooleanOrNull(row?.lidar?.fresh),
    headingHintDeg: toFiniteNumber(row?.lidar?.heading_hint_deg),
    centerErrorM: toFiniteNumber(row?.lidar?.center_error_m),

    panRelativeDeg: toFiniteNumber(row?.camera_view?.pan_relative_deg),
    tiltRelativeDeg: toFiniteNumber(row?.camera_view?.tilt_relative_deg),
    digitalZoom: toFiniteNumber(row?.camera_view?.digital_zoom),
    cameraValid: toBooleanOrNull(row?.camera_view?.valid),

    forwardSpeed: toFiniteNumber(row?.drive?.forward_speed),
    steeringSpeed: toFiniteNumber(row?.drive?.steering_speed),

    warningActive: toBooleanOrNull(row?.robot?.warning_active),
    emergencyStop: toBooleanOrNull(row?.robot?.emergency_stop),
    robotStatus: row?.robot?.status_text ?? null,
  };
}

export async function listRobotSessions() {
  let entries = [];

  try {
    entries = await fs.readdir(SESSION_DATA_DIR, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") {
      return [];
    }

    throw error;
  }

  const sessions = await Promise.all(
    entries
      .filter(
        (entry) =>
          entry.isDirectory() && SESSION_FOLDER_PATTERN.test(entry.name),
      )
      .map(async (entry) => {
        const manifestPath = path.join(
          SESSION_DATA_DIR,
          entry.name,
          "session_manifest.json",
        );

        try {
          const manifest = await readJsonFile(
            manifestPath,
            `${entry.name}/session_manifest.json`,
          );

          return buildSessionSummary(entry.name, manifest);
        } catch {
          return null;
        }
      }),
  );

  return sessions
    .filter(Boolean)
    .sort((a, b) =>
      String(b.startedAtLocal ?? b.id).localeCompare(
        String(a.startedAtLocal ?? a.id),
      ),
    );
}

export async function readRobotSession(sessionId) {
  const sessionDir = getSessionDirectory(sessionId);

  const [
    manifest,
    latest,
    timelineRows,
    detectionEventRows,
    lidarPreviewDocument,
  ] = await Promise.all([
    readJsonFile(
      path.join(sessionDir, "session_manifest.json"),
      `${sessionId}/session_manifest.json`,
    ),
    readJsonFile(
      path.join(sessionDir, "latest.json"),
      `${sessionId}/latest.json`,
    ),
    readJsonlFile(
      path.join(sessionDir, "robot_timeline.jsonl"),
      `${sessionId}/robot_timeline.jsonl`,
    ),
    readJsonlFile(
      path.join(sessionDir, "detection_events.jsonl"),
      `${sessionId}/detection_events.jsonl`,
    ),
    readJsonFile(
      path.join(sessionDir, "lidar", "lidar_map_preview.json"),
      `${sessionId}/lidar/lidar_map_preview.json`,
    ),
  ]);

  return {
    session: buildSessionSummary(sessionId, manifest),
    manifest,
    latest,
    timeline: timelineRows.map(normalizeTimelineRow),
    detectionEvents: detectionEventRows.map(normalizeDetectionEvent),
    lidarPreview: normalizeLidarPreview(lidarPreviewDocument),
  };
}