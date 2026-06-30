function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function mean(values) {
  const usable = values.filter((value) => Number.isFinite(value));
  if (!usable.length) return 0;
  return usable.reduce((sum, value) => sum + value, 0) / usable.length;
}

function median(values) {
  const usable = values
    .filter((value) => Number.isFinite(value))
    .slice()
    .sort((a, b) => a - b);

  if (!usable.length) return null;
  const middle = Math.floor(usable.length / 2);
  return usable.length % 2
    ? usable[middle]
    : (usable[middle - 1] + usable[middle]) / 2;
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function usableSamples(samples = []) {
  return samples.filter(
    (sample) =>
      Number.isFinite(sample?.x) &&
      Number.isFinite(sample?.y) &&
      Number.isFinite(sample?.maturityScore),
  );
}

/*
 * The dashboard intentionally keeps every accepted strong YOLO track visible
 * as a separate map marker. A Kriging solver, however, must not receive many
 * near-coincident points as independent spatial observations: tracker IDs can
 * be distinct while their saved camera-bearing map projections differ by only
 * millimetres. Those near-duplicates make the covariance system ill-conditioned
 * and create visually noisy local stripes.
 *
 * This is therefore modelling-only aggregation. It does not alter marker
 * visibility, click targets, timeline evidence, or the raw session data.
 */
export function buildKrigingSupportAnchors(samples = [], layout = {}) {
  const points = usableSamples(samples);
  const minimumSpan = Math.max(
    0.1,
    Math.min(Number(layout?.widthM) || 1, Number(layout?.heightM) || 1),
  );
  const cellSizeM = clamp(minimumSpan / 45, 0.08, 0.12);
  const groups = new Map();

  points.forEach((point) => {
    const key = `${Math.round(point.x / cellSizeM)}:${Math.round(point.y / cellSizeM)}`;
    const group = groups.get(key) ?? [];
    group.push(point);
    groups.set(key, group);
  });

  const anchors = Array.from(groups.entries()).map(([key, group], index) => {
    let weightSum = 0;
    let xSum = 0;
    let ySum = 0;
    let maturitySum = 0;
    let confidenceSum = 0;

    group.forEach((point) => {
      const confidence = clamp(Number(point.confidence ?? 0.7), 0.1, 1);
      weightSum += confidence;
      xSum += point.x * confidence;
      ySum += point.y * confidence;
      maturitySum += point.maturityScore * confidence;
      confidenceSum += confidence;
    });

    const safeWeight = Math.max(weightSum, 1e-8);
    return {
      id: `kriging-support-${String(index + 1).padStart(3, "0")}`,
      sourceCellKey: key,
      x: xSum / safeWeight,
      y: ySum / safeWeight,
      maturityScore: maturitySum / safeWeight,
      confidence: confidenceSum / Math.max(group.length, 1),
      sourceAnchorCount: group.length,
    };
  });

  return {
    anchors,
    cellSizeM,
    displayAnchorCount: points.length,
  };
}

function deterministicShuffle(values, seed) {
  const output = values.slice();
  let state = seed >>> 0;

  function random() {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  }

  for (let index = output.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [output[index], output[swapIndex]] = [output[swapIndex], output[index]];
  }

  return output;
}

export function calculateMoranI(samples, thresholdM = 0.45) {
  const points = usableSamples(samples);
  const n = points.length;
  if (n < 3) return { value: 0, label: "Not enough spatial anchors", pValue: null };

  const average = mean(points.map((point) => point.maturityScore));
  const denominator = points.reduce(
    (sum, point) => sum + (point.maturityScore - average) ** 2,
    0,
  );

  let numerator = 0;
  let weightSum = 0;

  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) {
      if (i === j) continue;
      const d = distance(points[i], points[j]);
      if (d > thresholdM) continue;
      const weight = 1 / Math.max(0.05, d);
      numerator += weight * (points[i].maturityScore - average) * (points[j].maturityScore - average);
      weightSum += weight;
    }
  }

  if (!weightSum || !denominator) {
    return { value: 0, label: "No measurable maturity variation", pValue: null };
  }

  const value = (n / weightSum) * (numerator / denominator);
  const label =
    value > 0.3
      ? "Positive spatial autocorrelation"
      : value < -0.15
        ? "Negative spatial autocorrelation"
        : "Weak spatial structure";

  return { value, label, pValue: null };
}

export function calculateMoranPermutationTest(samples, thresholdM = 0.45, permutations = 199) {
  const points = usableSamples(samples);
  if (points.length < 3) return { observed: 0, pValue: null };

  const observed = calculateMoranI(points, thresholdM).value;
  const scores = points.map((point) => point.maturityScore);
  let extremeCount = 0;

  for (let iteration = 0; iteration < permutations; iteration += 1) {
    const shuffled = deterministicShuffle(scores, 9127 + iteration * 97);
    const simulated = calculateMoranI(
      points.map((point, index) => ({ ...point, maturityScore: shuffled[index] })),
      thresholdM,
    ).value;

    if (Math.abs(simulated) >= Math.abs(observed)) extremeCount += 1;
  }

  return {
    observed,
    pValue: (extremeCount + 1) / (permutations + 1),
  };
}

export function calculateGearyC(samples, thresholdM = 0.45) {
  const points = usableSamples(samples);
  const n = points.length;
  if (n < 3) return { value: 1, label: "Not enough spatial anchors" };

  const average = mean(points.map((point) => point.maturityScore));
  const denominator = points.reduce(
    (sum, point) => sum + (point.maturityScore - average) ** 2,
    0,
  );

  let numerator = 0;
  let weightSum = 0;

  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      const d = distance(points[i], points[j]);
      if (d > thresholdM) continue;
      const weight = 1 / Math.max(0.05, d);
      numerator += weight * (points[i].maturityScore - points[j].maturityScore) ** 2;
      weightSum += weight;
    }
  }

  if (!weightSum || !denominator) return { value: 1, label: "No measurable maturity variation" };

  const value = ((n - 1) * numerator) / (2 * weightSum * denominator);
  return {
    value,
    label: value < 1 ? "Nearby anchors are similar" : "Nearby anchors are dissimilar",
  };
}

export function estimateVariogram(samples) {
  const points = usableSamples(samples);
  if (points.length < 2) {
    return {
      model: "Spherical",
      nugget: 0.02,
      sill: 0.08,
      rangeMeters: 0.4,
      pairs: [],
    };
  }

  const pairs = [];
  for (let i = 0; i < points.length; i += 1) {
    for (let j = i + 1; j < points.length; j += 1) {
      const d = distance(points[i], points[j]);
      if (d <= 0) continue;
      pairs.push({
        distance: d,
        semivariance: 0.5 * (points[i].maturityScore - points[j].maturityScore) ** 2,
      });
    }
  }

  const distances = pairs.map((pair) => pair.distance);
  const semivariances = pairs.map((pair) => pair.semivariance);
  const sampleVariance = mean(
    points.map((point) => (point.maturityScore - mean(points.map((item) => item.maturityScore))) ** 2),
  );
  const rangeMeters = clamp(median(distances) ?? 0.4, 0.15, 1.5);
  const sill = clamp(Math.max(sampleVariance, mean(semivariances) * 1.5, 0.05), 0.05, 1);
  // A non-trivial nugget reflects class-derived maturity labels and approximate
  // camera-bearing map projections. It regularises the model rather than
  // allowing near-coincident track anchors to create artificial sharp swings.
  const nugget = clamp(Math.min(median(semivariances) ?? 0.04, sill * 0.55), 0.03, 0.22);

  return {
    model: "Spherical",
    nugget,
    sill,
    rangeMeters,
    pairs: pairs.sort((a, b) => a.distance - b.distance),
  };
}

function sphericalVariogram(distanceM, variogram) {
  const distance = Math.max(0, distanceM);
  const range = Math.max(variogram.rangeMeters, 0.001);
  const nugget = variogram.nugget;
  const sill = variogram.sill;

  if (distance === 0) return 0;
  if (distance >= range) return nugget + sill;

  const ratio = distance / range;
  return nugget + sill * (1.5 * ratio - 0.5 * ratio ** 3);
}

function solveLinearSystem(matrix, vector) {
  const size = matrix.length;
  const augmented = matrix.map((row, index) => [...row, vector[index]]);

  for (let column = 0; column < size; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) pivot = row;
    }

    if (Math.abs(augmented[pivot][column]) < 1e-10) return null;

    [augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]];
    const divisor = augmented[column][column];

    for (let col = column; col <= size; col += 1) augmented[column][col] /= divisor;

    for (let row = 0; row < size; row += 1) {
      if (row === column) continue;
      const factor = augmented[row][column];
      if (factor === 0) continue;
      for (let col = column; col <= size; col += 1) {
        augmented[row][col] -= factor * augmented[column][col];
      }
    }
  }

  return augmented.map((row) => row[size]);
}

function inverseDistancePrediction(samples, target) {
  let weightedValue = 0;
  let weightSum = 0;
  let nearest = Infinity;

  samples.forEach((sample) => {
    const d = Math.max(0.04, distance(sample, target));
    const confidence = clamp(Number(sample.confidence ?? 0.7), 0.1, 1);
    const weight = confidence / d ** 2;
    weightedValue += weight * sample.maturityScore;
    weightSum += weight;
    nearest = Math.min(nearest, d);
  });

  return {
    value: clamp(weightSum ? weightedValue / weightSum : 0.5, 0, 1),
    uncertainty: clamp(nearest / 0.75, 0.1, 0.95),
    method: "inverse-distance fallback",
  };
}

function nearestSamples(samples, target, limit = 24) {
  return samples
    .slice()
    .sort((a, b) => distance(a, target) - distance(b, target))
    .slice(0, limit);
}

export function ordinaryKrigingPrediction(samples, target, variogram) {
  const points = nearestSamples(usableSamples(samples), target);
  if (points.length < 3) return inverseDistancePrediction(points, target);

  const size = points.length;
  const matrix = Array.from({ length: size + 1 }, () => Array(size + 1).fill(0));
  const rightSide = Array(size + 1).fill(0);

  for (let row = 0; row < size; row += 1) {
    const confidence = clamp(Number(points[row].confidence ?? 0.7), 0.1, 1);
    const measurementNoise =
      variogram.nugget * (0.35 + (1 - confidence) * 0.65) + 1e-8;

    for (let column = 0; column < size; column += 1) {
      const gamma = sphericalVariogram(distance(points[row], points[column]), variogram);
      matrix[row][column] = row === column ? gamma + measurementNoise : gamma;
    }

    matrix[row][size] = 1;
    matrix[size][row] = 1;
    rightSide[row] = sphericalVariogram(distance(points[row], target), variogram);
  }

  rightSide[size] = 1;
  const solution = solveLinearSystem(matrix, rightSide);
  if (!solution) return inverseDistancePrediction(points, target);

  const weights = solution.slice(0, size);
  const lagrange = solution[size];
  const value = weights.reduce((sum, weight, index) => sum + weight * points[index].maturityScore, 0);
  const rawVariance = weights.reduce(
    (sum, weight, index) => sum + weight * rightSide[index],
    0,
  ) + lagrange;

  return {
    value: clamp(value, 0, 1),
    uncertainty: clamp(rawVariance / Math.max(variogram.sill + variogram.nugget, 0.001), 0.05, 0.98),
    method: "ordinary-kriging",
  };
}

function nearestAnchorDistanceM(points, target) {
  if (!points.length) return Number.POSITIVE_INFINITY;

  return points.reduce(
    (closest, point) => Math.min(closest, distance(point, target)),
    Number.POSITIVE_INFINITY,
  );
}

/*
 * The map overlay is rendered as a smoothed prediction raster, rather than as
 * individual outlined tiles. The calculation remains ordinary Kriging; this
 * denser grid merely supplies enough samples for gradual canvas interpolation.
 *
 * `visualSupport` is deliberately separate from the predicted maturity value:
 * it combines Kriging uncertainty with distance to the nearest local support
 * anchor. This prevents distant areas from looking as confident as a region
 * immediately surrounding a real accepted detection.
 */
export function buildPredictionGrid(samples, layout, variogram) {
  const points = usableSamples(samples);
  const minimumSpan = Math.max(0.1, Math.min(layout?.widthM ?? 1, layout?.heightM ?? 1));
  // Around 5–10 display pixels per prediction sample on the supplied ROS2 map
  // sizes, while remaining practical during timeline playback.
  const cellSizeM = clamp(minimumSpan / 52, 0.06, 0.1);
  const minX = Number(layout?.minX ?? 0);
  const maxX = Number(layout?.maxX ?? 1);
  const minY = Number(layout?.minY ?? 0);
  const maxY = Number(layout?.maxY ?? 1);
  const influenceRadiusM = clamp(
    Math.max((variogram?.rangeMeters ?? 0.4) * 0.45, cellSizeM * 1.65),
    cellSizeM * 1.65,
    0.75,
  );
  const grid = [];

  for (let y = minY + cellSizeM / 2; y <= maxY; y += cellSizeM) {
    for (let x = minX + cellSizeM / 2; x <= maxX; x += cellSizeM) {
      if (!points.length) {
        grid.push({
          x,
          y,
          value: 0.5,
          uncertainty: 1,
          visualSupport: 0,
          nearestAnchorDistanceM: null,
          method: "no-anchor-data",
          cellSizeM,
        });
        continue;
      }

      const target = { x, y };
      const prediction = ordinaryKrigingPrediction(points, target, variogram);
      const nearestDistanceM = nearestAnchorDistanceM(points, target);
      const proximity = Math.exp(-((nearestDistanceM / influenceRadiusM) ** 2));
      const certainty = 1 - clamp(prediction.uncertainty ?? 1, 0, 1);
      const visualSupport = clamp(
        proximity * (0.35 + certainty * 0.65),
        0,
        1,
      );

      grid.push({
        x,
        y,
        cellSizeM,
        nearestAnchorDistanceM: nearestDistanceM,
        visualSupport,
        ...prediction,
      });
    }
  }

  return grid;
}

export function getPredictionAt(grid = [], point) {
  if (!point || !Array.isArray(grid) || !grid.length) return null;

  return grid.reduce((closest, cell) => {
    if (!closest) return cell;
    return distance(cell, point) < distance(closest, point) ? cell : closest;
  }, null);
}

export function summarizeSpatialModel(samples, layout) {
  const support = buildKrigingSupportAnchors(samples, layout);
  const points = support.anchors;
  const variogram = estimateVariogram(points);
  const thresholdM = clamp(variogram.rangeMeters * 1.25, 0.2, 1.2);
  const moran = calculateMoranI(points, thresholdM);
  const moranTest = calculateMoranPermutationTest(points, thresholdM);
  const geary = calculateGearyC(points, thresholdM);
  const grid = buildPredictionGrid(points, layout, variogram);
  const areaM2 = Math.max((layout?.widthM ?? 1) * (layout?.heightM ?? 1), 0.01);
  const supportRadius = Math.max(variogram.rangeMeters * 0.45, support.cellSizeM);
  const coverage = clamp((points.length * Math.PI * supportRadius ** 2 * 100) / areaM2, 0, 100);

  return {
    method: points.length >= 3 ? "ordinary-kriging" : "inverse-distance fallback",
    // `anchorCount` remains the number actually supplied to the model.
    anchorCount: points.length,
    displayAnchorCount: support.displayAnchorCount,
    modelAnchorCount: points.length,
    modelAggregationCellM: support.cellSizeM,
    modelAnchors: points,
    moran,
    moranTest,
    geary,
    variogram,
    grid,
    heatmapCellSizeM: grid[0]?.cellSizeM ?? null,
    coverage,
    maturityAverage: mean(points.map((point) => point.maturityScore)),
    uncertaintyAverage: mean(grid.map((cell) => cell.uncertainty)),
  };
}
