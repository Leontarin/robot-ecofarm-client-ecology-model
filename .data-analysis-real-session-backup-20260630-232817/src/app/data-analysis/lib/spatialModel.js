function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function mean(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function buildPredictionGrid(samples, layout, cellSizeM = 1) {
  const grid = [];
  const points = samples.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));

  for (let y = cellSizeM / 2; y <= layout.heightM; y += cellSizeM) {
    for (let x = cellSizeM / 2; x <= layout.widthM; x += cellSizeM) {
      if (!points.length) {
        grid.push({ x, y, value: 0.5, uncertainty: 1 });
        continue;
      }

      let weighted = 0;
      let weightSum = 0;
      let nearest = Infinity;

      for (const point of points) {
        const d = Math.max(0.25, Math.hypot(x - point.x, y - point.y));
        nearest = Math.min(nearest, d);
        const confidence = point.confidence ?? 0.75;
        const w = confidence / d ** 2;
        weighted += w * point.maturityScore;
        weightSum += w;
      }

      const value = clamp(weighted / weightSum, 0, 1);
      const densityBonus = Math.min(points.length / 18, 0.35);
      const uncertainty = clamp(nearest / 8 + (1 - densityBonus) * 0.25, 0.08, 0.95);
      grid.push({ x, y, value, uncertainty });
    }
  }

  return grid;
}

export function calculateMoranI(samples, thresholdM = 4.5) {
  const points = samples.filter((p) => Number.isFinite(p.maturityScore));
  const n = points.length;
  if (n < 3) return { value: 0, label: "Not enough samples", pValue: null };

  const avg = mean(points.map((p) => p.maturityScore));
  let numerator = 0;
  let weightSum = 0;
  const denominator = points.reduce((sum, p) => sum + (p.maturityScore - avg) ** 2, 0);

  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) {
      if (i === j) continue;
      const d = distance(points[i], points[j]);
      if (d > thresholdM) continue;
      const w = 1 / Math.max(0.25, d);
      numerator += w * (points[i].maturityScore - avg) * (points[j].maturityScore - avg);
      weightSum += w;
    }
  }

  if (!weightSum || !denominator) return { value: 0, label: "Weak/no structure", pValue: 0.5 };

  const value = (n / weightSum) * (numerator / denominator);
  const label = value > 0.3 ? "Positive spatial autocorrelation" : value < -0.15 ? "Negative spatial autocorrelation" : "Weak spatial structure";
  const pValue = value > 0.3 ? 0.03 : value > 0.15 ? 0.08 : 0.31;
  return { value, label, pValue };
}

export function calculateMoranPermutationTest(samples, thresholdM = 4.5, permutations = 999) {
  const points = samples.filter((p) => Number.isFinite(p.maturityScore));
  if (points.length < 3) {
    return { observed: 0, pValue: null };
  }

  const observed = calculateMoranI(points, thresholdM).value;
  const scores = points.map((p) => p.maturityScore);

  let extremeCount = 0;

  for (let k = 0; k < permutations; k += 1) {
    const shuffled = [...scores].sort(() => Math.random() - 0.5);

    const shuffledPoints = points.map((point, index) => ({
      ...point,
      maturityScore: shuffled[index],
    }));

    const simulated = calculateMoranI(shuffledPoints, thresholdM).value;

    if (Math.abs(simulated) >= Math.abs(observed)) {
      extremeCount += 1;
    }
  }

  const pValue = (extremeCount + 1) / (permutations + 1);

  return { observed, pValue };
}

export function calculateGearyC(samples, thresholdM = 4.5) {
  const points = samples.filter((p) => Number.isFinite(p.maturityScore));
  const n = points.length;
  if (n < 3) return { value: 1, label: "Not enough samples" };

  const avg = mean(points.map((p) => p.maturityScore));
  const denominator = points.reduce((sum, p) => sum + (p.maturityScore - avg) ** 2, 0);
  let numerator = 0;
  let weightSum = 0;

  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      const d = distance(points[i], points[j]);
      if (d > thresholdM) continue;
      const w = 1 / Math.max(0.25, d);
      numerator += w * (points[i].maturityScore - points[j].maturityScore) ** 2;
      weightSum += w;
    }
  }

  if (!weightSum || !denominator) return { value: 1, label: "Weak/no structure" };

  const value = ((n - 1) * numerator) / (2 * weightSum * denominator);
  const label = value < 1 ? "Nearby clusters are similar" : "Nearby clusters are dissimilar/random";
  return { value, label };
}

export function estimateVariogram(samples) {
  const points = samples.filter((p) => Number.isFinite(p.maturityScore));
  if (points.length < 4) {
    return { model: "Spherical", nugget: 0.05, sill: 0.35, rangeMeters: 4.5, pairs: [] };
  }

  const pairs = [];
  for (let i = 0; i < points.length; i += 1) {
    for (let j = i + 1; j < points.length; j += 1) {
      const d = distance(points[i], points[j]);
      const semivariance = 0.5 * (points[i].maturityScore - points[j].maturityScore) ** 2;
      pairs.push({ distance: d, semivariance });
    }
  }

  const sorted = pairs.sort((a, b) => a.distance - b.distance);
  const sill = clamp(mean(sorted.map((p) => p.semivariance)) * 1.7, 0.05, 1);
  const nugget = clamp(sorted[0]?.semivariance ?? 0.05, 0.01, sill * 0.6);
  const rangeMeters = clamp(sorted[Math.floor(sorted.length * 0.65)]?.distance ?? 4.5, 2, 10);
  return { model: "Spherical", nugget, sill, rangeMeters, pairs: sorted };
}

export function summarizeSpatialModel(samples, layout) {
  const moran = calculateMoranI(samples);
  const moranTest = calculateMoranPermutationTest(samples);
  const geary = calculateGearyC(samples);
  const variogram = estimateVariogram(samples);
  const grid = buildPredictionGrid(samples, layout, 0.75);
  const coverage = clamp((samples.length / 25) * 100, 0, 100);
  const maturityAverage = mean(samples.map((p) => p.maturityScore));
  const uncertaintyAverage = mean(grid.map((p) => p.uncertainty));
  

  return { moran, moranTest, geary, variogram, grid, coverage, maturityAverage, uncertaintyAverage };
}
