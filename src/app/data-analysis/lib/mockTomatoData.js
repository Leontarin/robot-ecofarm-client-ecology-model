export const TOMATO_CLASSES = {
  0: { label: "Fully ripe bunch", hebrew: "אשכול בשל לחלוטין", score: 1.0, color: "#7f1d1d" },
  1: { label: "Ripe tomato", hebrew: "עגבנייה בשלה", score: 0.9, color: "#dc2626" },
  2: { label: "Turning / mixed color", hebrew: "עגבנייה במעבר", score: 0.5, color: "#f59e0b" },
  3: { label: "Green tomato", hebrew: "עגבנייה ירוקה", score: 0.1, color: "#22c55e" },
  4: { label: "Mixed bunch", hebrew: "אשכול מעורב", score: 0.6, color: "#f97316" },
  5: { label: "Unripe bunch", hebrew: "אשכול ירוק", score: 0.0, color: "#15803d" },
};

export const TIME_SCALE_OPTIONS = {
  seconds: { label: "Seconds", unit: "s", stepMs: 1000 },
  minutes: { label: "Minutes", unit: "min", stepMs: 60_000 },
  hours: { label: "Hours", unit: "h", stepMs: 3_600_000 },
  days: { label: "Days", unit: "d", stepMs: 86_400_000 },
};

export const GREENHOUSE_LAYOUT = {
  widthM: 14,
  heightM: 24,
  rows: [
    { id: "R1", x: 2.0, y1: 1.2, y2: 22.8, width: 0.65 },
    { id: "R2", x: 4.4, y1: 1.2, y2: 22.8, width: 0.65 },
    { id: "R3", x: 6.8, y1: 1.2, y2: 22.8, width: 0.65 },
    { id: "R4", x: 9.2, y1: 1.2, y2: 22.8, width: 0.65 },
    { id: "R5", x: 11.6, y1: 1.2, y2: 22.8, width: 0.65 },
  ],
  aisles: [
    { id: "A1", x: 3.2, label: "Aisle 1", adjacentRows: ["R1", "R2"] },
    { id: "A2", x: 5.6, label: "Aisle 2", adjacentRows: ["R2", "R3"] },
    { id: "A3", x: 8.0, label: "Aisle 3", adjacentRows: ["R3", "R4"] },
    { id: "A4", x: 10.4, label: "Aisle 4", adjacentRows: ["R4", "R5"] },
  ],
};

function seededRandom(seed) {
  let value = seed % 2147483647;
  if (value <= 0) value += 2147483646;
  return () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function classFromScore(score) {
  if (score >= 0.95) return 0;
  if (score >= 0.8) return 1;
  if (score >= 0.58) return 4;
  if (score >= 0.32) return 2;
  if (score >= 0.12) return 3;
  return 5;
}

function createMockTimeline() {
  const random = seededRandom(4217);
  const frames = [];

  // Uneven scan schedule: many scans in the first hour, sparse scans later.
  // This is intentional so seconds/minutes/hours/days show aggregation, not animation.
  const timestamps = [];
  for (let i = 0; i < 30; i += 1) timestamps.push(Math.round(i * 115_000 + random() * 25_000)); // hour 0
  for (let i = 0; i < 22; i += 1) timestamps.push(3_600_000 + Math.round(i * 410_000 + random() * 90_000)); // hours 1-3
  for (let i = 0; i < 2; i += 1) timestamps.push(5 * 3_600_000 + Math.round(i * 12 * 60_000 + random() * 60_000)); // hour 5
  for (let i = 0; i < 18; i += 1) timestamps.push(8 * 3_600_000 + Math.round(i * 530_000 + random() * 100_000)); // hours 8-10
  for (let i = 0; i < 16; i += 1) timestamps.push(24 * 3_600_000 + Math.round(i * 780_000 + random() * 180_000)); // day 1
  for (let i = 0; i < 12; i += 1) timestamps.push(48 * 3_600_000 + Math.round(i * 1_200_000 + random() * 200_000)); // day 2

  timestamps.sort((a, b) => a - b);

  const rowById = Object.fromEntries(GREENHOUSE_LAYOUT.rows.map((row) => [row.id, row]));

  for (let i = 0; i < 100; i += 1) {
    const aisle = GREENHOUSE_LAYOUT.aisles[i % GREENHOUSE_LAYOUT.aisles.length];
    const sweepDirection = Math.floor(i / GREENHOUSE_LAYOUT.aisles.length) % 2 === 0 ? 1 : -1;
    const sweepProgress = ((Math.floor(i / GREENHOUSE_LAYOUT.aisles.length) % 24) + random() * 0.45) / 23;
    const y = sweepDirection === 1
      ? 1.8 + sweepProgress * 20.4
      : 22.2 - sweepProgress * 20.4;

    const robotPose = {
      x: aisle.x,
      y: clamp(y, 1.6, 22.4),
      yawDeg: i % 2 === 0 ? 0 : 180,
      aisle: aisle.id,
    };

    const detectionsPerFrame = 1 + Math.floor(random() * 3); // 1-3 clusters per scan.
    const detections = [];

    for (let j = 0; j < detectionsPerFrame; j += 1) {
      const rowId = aisle.adjacentRows[(i + j) % aisle.adjacentRows.length];
      const row = rowById[rowId];
      const tomatoY = clamp(robotPose.y + (random() - 0.5) * 2.2, row.y1 + 0.35, row.y2 - 0.35);
      const tomatoX = clamp(row.x + (random() - 0.5) * 0.35, row.x - 0.28, row.x + 0.28);

      // Spatial + temporal maturity expectancy. Later scans and warmer/right-side zones trend riper.
      const timeProgress = timestamps[i] / timestamps[timestamps.length - 1];
      const spatialProgress = 0.45 * (tomatoY / GREENHOUSE_LAYOUT.heightM) + 0.25 * (tomatoX / GREENHOUSE_LAYOUT.widthM);
      const noise = (random() - 0.5) * 0.22;
      const score = clamp(0.08 + spatialProgress + timeProgress * 0.34 + noise, 0, 1);
      const classId = classFromScore(score);
      const cls = TOMATO_CLASSES[classId];

      detections.push({
        id: `C-${String(i + 1).padStart(3, "0")}-${j + 1}`,
        classId,
        confidence: clamp(0.72 + random() * 0.24, 0.72, 0.96),
        count: classId === 0 || classId === 4 || classId === 5 ? 3 + Math.floor(random() * 7) : 1,
        x: Number(tomatoX.toFixed(2)),
        y: Number(tomatoY.toFixed(2)),
        row: rowId,
        label: cls.label,
        hebrewLabel: cls.hebrew,
        maturityScore: cls.score,
        continuousMaturityScore: Number(score.toFixed(3)),
        color: cls.color,
        source: "mock-yolo12m",
      });
    }

    frames.push({
      sampleId: i,
      timestampMs: timestamps[i],
      robotPose,
      detections,
    });
  }

  return frames;
}

// 100 deterministic mock scan events, shaped like expected YOLO12M + robot-pose output.
export const MOCK_YOLO_TIMELINE = createMockTimeline();

export function formatTimelineTime(timestampMs, scale = "minutes") {
  const option = TIME_SCALE_OPTIONS[scale] ?? TIME_SCALE_OPTIONS.minutes;
  const value = timestampMs / option.stepMs;
  if (scale === "seconds") return `${Math.round(value)}s`;
  if (scale === "minutes") return `${Math.round(value)}m`;
  if (scale === "hours") return `hour ${Math.floor(value)}`;
  return `day ${Math.floor(value)}`;
}

export function formatBucketLabel(bucket, scale = "minutes") {
  if (!bucket) return "—";
  if (scale === "seconds") return `${bucket.bucketKey}s`;
  if (scale === "minutes") return `min ${bucket.bucketKey}`;
  if (scale === "hours") return `hour ${bucket.bucketKey}`;
  return `day ${bucket.bucketKey}`;
}

export function enrichDetection(detection, frame) {
  const cls = TOMATO_CLASSES[detection.classId] ?? TOMATO_CLASSES[3];
  return {
    ...detection,
    sampleId: frame.sampleId,
    timestampMs: frame.timestampMs,
    scanPose: frame.robotPose,
    label: detection.label ?? cls.label,
    hebrewLabel: detection.hebrewLabel ?? cls.hebrew,
    maturityScore: detection.continuousMaturityScore ?? cls.score,
    displayScore: cls.score,
    color: cls.color,
    source: detection.source ?? "mock-yolo12m",
  };
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function getTimelineBuckets(scale = "minutes") {
  const option = TIME_SCALE_OPTIONS[scale] ?? TIME_SCALE_OPTIONS.minutes;
  const map = new Map();

  for (const frame of MOCK_YOLO_TIMELINE) {
    const bucketKey = Math.floor(frame.timestampMs / option.stepMs);
    if (!map.has(bucketKey)) {
      map.set(bucketKey, {
        bucketKey,
        startMs: bucketKey * option.stepMs,
        endMs: (bucketKey + 1) * option.stepMs,
        frames: [],
      });
    }
    map.get(bucketKey).frames.push(frame);
  }

  const buckets = Array.from(map.values()).sort((a, b) => a.bucketKey - b.bucketKey);

  return buckets.map((bucket, index) => {
    const detections = bucket.frames.flatMap((frame) => frame.detections.map((d) => enrichDetection(d, frame)));
    const avgMaturity = average(detections.map((d) => d.maturityScore));
    const previous = buckets[index - 1];
    const previousDetections = previous?.frames.flatMap((frame) => frame.detections.map((d) => enrichDetection(d, frame))) ?? [];
    const previousAverage = previousDetections.length ? average(previousDetections.map((d) => d.maturityScore)) : avgMaturity;
    const trend = avgMaturity - previousAverage;

    return {
      ...bucket,
      index,
      detections,
      sampleCount: bucket.frames.length,
      detectionCount: detections.length,
      avgMaturity,
      trend,
      expectedNextMaturity: clamp(avgMaturity + trend, 0, 1),
      latestFrame: bucket.frames[bucket.frames.length - 1],
    };
  });
}

export function getAccumulatedDetectionsUpToBucket(bucketPosition, scale = "minutes") {
  const buckets = getTimelineBuckets(scale);
  const active = buckets[clamp(bucketPosition, 0, buckets.length - 1)] ?? buckets[0];
  if (!active) return [];

  return MOCK_YOLO_TIMELINE
    .filter((frame) => frame.timestampMs < active.endMs)
    .flatMap((frame) => frame.detections.map((d) => enrichDetection(d, frame)));
}

export function getDetectionsInBucket(bucketPosition, scale = "minutes") {
  const buckets = getTimelineBuckets(scale);
  return buckets[clamp(bucketPosition, 0, buckets.length - 1)]?.detections ?? [];
}

export function getCurrentRobotPoseForBucket(bucketPosition, scale = "minutes") {
  const buckets = getTimelineBuckets(scale);
  return buckets[clamp(bucketPosition, 0, buckets.length - 1)]?.latestFrame?.robotPose ?? MOCK_YOLO_TIMELINE[0].robotPose;
}

// Legacy helpers kept so older imports do not break.
export function getTimelineUpTo(sampleId) {
  return MOCK_YOLO_TIMELINE.filter((frame) => frame.sampleId <= sampleId).flatMap((frame) =>
    frame.detections.map((d) => enrichDetection(d, frame)),
  );
}

export function getRobotPathUpTo(sampleId) {
  return MOCK_YOLO_TIMELINE.filter((frame) => frame.sampleId <= sampleId).map((frame) => ({
    sampleId: frame.sampleId,
    timestampMs: frame.timestampMs,
    ...frame.robotPose,
  }));
}

export function getFrameBySampleId(sampleId) {
  return MOCK_YOLO_TIMELINE.find((frame) => frame.sampleId === sampleId) ?? MOCK_YOLO_TIMELINE[0];
}
