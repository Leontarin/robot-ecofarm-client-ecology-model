const DEFAULT_CALIBRATION = {
  /*
   * Display calibration only.
   * These values are not verified physical robot measurements.
   * They will later become user-adjustable controls in Robot Debug.
   */
  motionMetersPerCommandSecond: 0.01,
  turnDegreesPerCommandSecond: 0.05,
  maxIntegrationSeconds: 1,
  observationRayDistanceM: 1,
  lidarTimeWindowMs: 1000,
  lidarAngleWindowDeg: 10,
};

function toFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function degreesToRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

function radiansToDegrees(radians) {
  return (radians * 180) / Math.PI;
}

function normalizeRadians(radians) {
  let value = radians;

  while (value > Math.PI) value -= Math.PI * 2;
  while (value <= -Math.PI) value += Math.PI * 2;

  return value;
}

function circularAngleDifferenceDeg(a, b) {
  let difference = a - b;

  while (difference > 180) difference -= 360;
  while (difference <= -180) difference += 360;

  return Math.abs(difference);
}

function mergeCalibration(overrides = {}) {
  return {
    ...DEFAULT_CALIBRATION,
    ...overrides,
  };
}

function validTimelineRows(timeline) {
  if (!Array.isArray(timeline)) {
    return [];
  }

  return timeline
    .filter((row) => toFiniteNumber(row?.timestampMs) != null)
    .slice()
    .sort((a, b) => a.timestampMs - b.timestampMs);
}

/*
 * Coordinate convention:
 * - x increases forward from the robot start.
 * - y increases to the robot's left.
 * - yaw = 0 means facing positive x.
 *
 * This derives a session-local estimate from exported drive commands.
 * It is not a verified odometry or greenhouse-global pose.
 */
export function estimateSessionPoses(timeline, calibrationOverrides = {}) {
  const calibration = mergeCalibration(calibrationOverrides);
  const rows = validTimelineRows(timeline);

  if (rows.length === 0) {
    return [];
  }

  const poses = [];

  let xM = 0;
  let yM = 0;
  let yawRad = 0;

  poses.push({
    timestampMs: rows[0].timestampMs,
    timestampLocal: rows[0].timestampLocal ?? null,
    xM,
    yM,
    yawRad,
    yawDeg: radiansToDegrees(yawRad),
    forwardSpeedCommand: toFiniteNumber(rows[0].forwardSpeed) ?? 0,
    steeringSpeedCommand: toFiniteNumber(rows[0].steeringSpeed) ?? 0,
    integrationSeconds: 0,
  });

  for (let index = 1; index < rows.length; index += 1) {
    const previousRow = rows[index - 1];
    const currentRow = rows[index];

    const rawDeltaSeconds =
      (currentRow.timestampMs - previousRow.timestampMs) / 1000;

    const deltaSeconds = Math.max(
      0,
      Math.min(rawDeltaSeconds, calibration.maxIntegrationSeconds),
    );

    const forwardSpeedCommand =
      toFiniteNumber(previousRow.forwardSpeed) ?? 0;

    const steeringSpeedCommand =
      toFiniteNumber(previousRow.steeringSpeed) ?? 0;

    const linearDistanceM =
      forwardSpeedCommand *
      calibration.motionMetersPerCommandSecond *
      deltaSeconds;

    const turnDegrees =
      steeringSpeedCommand *
      calibration.turnDegreesPerCommandSecond *
      deltaSeconds;

    yawRad = normalizeRadians(yawRad + degreesToRadians(turnDegrees));

    xM += linearDistanceM * Math.cos(yawRad);
    yM += linearDistanceM * Math.sin(yawRad);

    poses.push({
      timestampMs: currentRow.timestampMs,
      timestampLocal: currentRow.timestampLocal ?? null,
      xM,
      yM,
      yawRad,
      yawDeg: radiansToDegrees(yawRad),
      forwardSpeedCommand,
      steeringSpeedCommand,
      integrationSeconds: deltaSeconds,
    });
  }

  return poses;
}

export function findNearestEstimatedPose(poses, timestampMs) {
  if (!Array.isArray(poses) || poses.length === 0) {
    return null;
  }

  if (!Number.isFinite(timestampMs)) {
    return poses[poses.length - 1];
  }

  let closestPose = poses[0];
  let smallestDifference = Math.abs(poses[0].timestampMs - timestampMs);

  for (let index = 1; index < poses.length; index += 1) {
    const candidate = poses[index];
    const difference = Math.abs(candidate.timestampMs - timestampMs);

    if (difference < smallestDifference) {
      closestPose = candidate;
      smallestDifference = difference;
    }
  }

  return closestPose;
}

export function transformLidarPreviewPoints(
  lidarPreview,
  poses,
) {
  const sourcePoints = Array.isArray(lidarPreview?.points)
    ? lidarPreview.points
    : [];

  return sourcePoints
    .map((point, index) => {
      const pose = findNearestEstimatedPose(poses, point.timestampMs);

      if (
        !pose ||
        !Number.isFinite(point?.xM) ||
        !Number.isFinite(point?.yM)
      ) {
        return null;
      }

      const cosYaw = Math.cos(pose.yawRad);
      const sinYaw = Math.sin(pose.yawRad);

      return {
        id: `lidar-${point.timestampMs ?? "unknown"}-${index}`,
        timestampMs: point.timestampMs,
        localXM: point.xM,
        localYM: point.yM,
        distanceM: point.distanceM ?? null,
        angleDeg: point.angleDeg ?? null,

        estimatedXM: pose.xM + point.xM * cosYaw - point.yM * sinYaw,
        estimatedYM: pose.yM + point.xM * sinYaw + point.yM * cosYaw,

        poseTimestampMs: pose.timestampMs,
        poseXM: pose.xM,
        poseYM: pose.yM,
        poseYawDeg: pose.yawDeg,
      };
    })
    .filter(Boolean);
}

function getCameraBearingRad(camera) {
  const xForward = toFiniteNumber(camera?.directionRobot?.xForward);
  const yLeft = toFiniteNumber(camera?.directionRobot?.yLeft);

  if (xForward != null && yLeft != null) {
    return Math.atan2(yLeft, xForward);
  }

  const panRelativeDeg = toFiniteNumber(camera?.panRelativeDeg);

  if (panRelativeDeg != null) {
    return degreesToRadians(panRelativeDeg);
  }

  return null;
}

function findLidarRangeForCameraRay(
  event,
  cameraBearingRad,
  lidarPreview,
  calibration,
) {
  if (!Number.isFinite(cameraBearingRad)) {
    return null;
  }

  const sourcePoints = Array.isArray(lidarPreview?.points)
    ? lidarPreview.points
    : [];

  const targetAngleDeg = radiansToDegrees(cameraBearingRad);

  const candidates = sourcePoints
    .filter((point) => {
      if (
        !Number.isFinite(point?.timestampMs) ||
        !Number.isFinite(point?.angleDeg) ||
        !Number.isFinite(point?.distanceM)
      ) {
        return false;
      }

      const timeDifference = Math.abs(point.timestampMs - event.timestampMs);
      const angleDifference = circularAngleDifferenceDeg(
        point.angleDeg,
        targetAngleDeg,
      );

      return (
        timeDifference <= calibration.lidarTimeWindowMs &&
        angleDifference <= calibration.lidarAngleWindowDeg
      );
    })
    .map((point) => ({
      ...point,
      timeDifferenceMs: Math.abs(point.timestampMs - event.timestampMs),
      angleDifferenceDeg: circularAngleDifferenceDeg(
        point.angleDeg,
        targetAngleDeg,
      ),
    }))
    .sort((a, b) => {
      const aScore =
        a.timeDifferenceMs + a.angleDifferenceDeg * calibration.lidarTimeWindowMs;
      const bScore =
        b.timeDifferenceMs + b.angleDifferenceDeg * calibration.lidarTimeWindowMs;

      return aScore - bScore;
    });

  if (candidates.length === 0) {
    return null;
  }

  const bestCandidate = candidates[0];

  return {
    distanceM: bestCandidate.distanceM,
    source: "nearby-lidar-preview",
    pointTimestampMs: bestCandidate.timestampMs,
    timeDifferenceMs: bestCandidate.timeDifferenceMs,
    angleDifferenceDeg: bestCandidate.angleDifferenceDeg,
  };
}

/*
 * One projected observation per saved detection event.
 *
 * The event may contain multiple accepted detections. The map marker represents
 * the observation frame, while acceptedDetections holds the actual detections
 * available for the image inspector.
 */
export function buildAcceptedDetectionObservations(
  detectionEvents,
  poses,
  lidarPreview,
  calibrationOverrides = {},
) {
  const calibration = mergeCalibration(calibrationOverrides);

  if (!Array.isArray(detectionEvents)) {
    return [];
  }

  return detectionEvents
    .filter(
      (event) =>
        Array.isArray(event.acceptedDetections) &&
        event.acceptedDetections.length > 0 &&
        Number.isFinite(event.timestampMs),
    )
    .map((event) => {
      const pose = findNearestEstimatedPose(poses, event.timestampMs);
      const cameraBearingRad = getCameraBearingRad(event.camera);

      if (!pose || !Number.isFinite(cameraBearingRad)) {
        return null;
      }

      const lidarRange = findLidarRangeForCameraRay(
        event,
        cameraBearingRad,
        lidarPreview,
        calibration,
      );

      const projectionDistanceM =
        lidarRange?.distanceM ?? calibration.observationRayDistanceM;

      const globalBearingRad = normalizeRadians(
        pose.yawRad + cameraBearingRad,
      );

      return {
        id: `observation-${event.id}`,
        eventId: event.id,
        timestampMs: event.timestampMs,
        timestampLocal: event.timestampLocal ?? null,

        imagePath: event.imagePath ?? null,
        annotatedImagePath: event.annotatedImagePath ?? null,
        rawImagePath: event.rawImagePath ?? null,

        acceptedCount: event.acceptedCount ?? event.acceptedDetections.length,
        weakCount: event.weakCount ?? 0,
        acceptedDetections: event.acceptedDetections,

        robotXM: pose.xM,
        robotYM: pose.yM,
        robotYawDeg: pose.yawDeg,

        cameraBearingDeg: radiansToDegrees(cameraBearingRad),
        globalBearingDeg: radiansToDegrees(globalBearingRad),

        projectionDistanceM,
        projectedXM:
          pose.xM + projectionDistanceM * Math.cos(globalBearingRad),
        projectedYM:
          pose.yM + projectionDistanceM * Math.sin(globalBearingRad),

        projectionSource:
          lidarRange?.source ?? "display-calibration-distance",

        lidarRange,
      };
    })
    .filter(Boolean);
}

export function calculateEstimatedMapBounds({
  poses = [],
  lidarPoints = [],
  observations = [],
} = {}) {
  const points = [
    ...poses.map((pose) => ({ xM: pose.xM, yM: pose.yM })),
    ...lidarPoints.map((point) => ({
      xM: point.estimatedXM,
      yM: point.estimatedYM,
    })),
    ...observations.map((observation) => ({
      xM: observation.projectedXM,
      yM: observation.projectedYM,
    })),
  ].filter(
    (point) => Number.isFinite(point.xM) && Number.isFinite(point.yM),
  );

  if (points.length === 0) {
    return {
      minXM: -1,
      maxXM: 1,
      minYM: -1,
      maxYM: 1,
      widthM: 2,
      heightM: 2,
    };
  }

  let minXM = points[0].xM;
  let maxXM = points[0].xM;
  let minYM = points[0].yM;
  let maxYM = points[0].yM;

  for (const point of points) {
    minXM = Math.min(minXM, point.xM);
    maxXM = Math.max(maxXM, point.xM);
    minYM = Math.min(minYM, point.yM);
    maxYM = Math.max(maxYM, point.yM);
  }

  const paddingM = 0.5;

  minXM -= paddingM;
  maxXM += paddingM;
  minYM -= paddingM;
  maxYM += paddingM;

  return {
    minXM,
    maxXM,
    minYM,
    maxYM,
    widthM: Math.max(maxXM - minXM, 0.01),
    heightM: Math.max(maxYM - minYM, 0.01),
  };
}

export function buildEstimatedSessionMap(
  {
    timeline = [],
    lidarPreview = null,
    detectionEvents = [],
  } = {},
  calibrationOverrides = {},
) {
  const calibration = mergeCalibration(calibrationOverrides);

  const poses = estimateSessionPoses(timeline, calibration);

  const lidarPoints = transformLidarPreviewPoints(
    lidarPreview,
    poses,
  );

  const observations = buildAcceptedDetectionObservations(
    detectionEvents,
    poses,
    lidarPreview,
    calibration,
  );

  return {
    calibration,
    poses,
    lidarPoints,
    observations,
    bounds: calculateEstimatedMapBounds({
      poses,
      lidarPoints,
      observations,
    }),
  };
}
