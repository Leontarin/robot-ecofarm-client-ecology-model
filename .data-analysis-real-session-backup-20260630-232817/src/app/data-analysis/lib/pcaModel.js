function safeNumber(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function mean(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function std(values) {
  if (values.length < 2) return 1;
  const avg = mean(values);
  const variance = values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / (values.length - 1);
  const result = Math.sqrt(variance);
  return result > 0 ? result : 1;
}

function dot(a, b) {
  return a.reduce((sum, value, index) => sum + value * b[index], 0);
}

function norm(vector) {
  return Math.sqrt(dot(vector, vector)) || 1;
}

function multiplyMatrixVector(matrix, vector) {
  return matrix.map((row) => dot(row, vector));
}

function normalize(vector) {
  const length = norm(vector);
  return vector.map((value) => value / length);
}

function covarianceMatrix(scaledRows) {
  const n = scaledRows.length;
  const p = scaledRows[0]?.length ?? 0;
  const matrix = Array.from({ length: p }, () => Array.from({ length: p }, () => 0));

  for (let i = 0; i < p; i += 1) {
    for (let j = i; j < p; j += 1) {
      let value = 0;
      for (let r = 0; r < n; r += 1) value += scaledRows[r][i] * scaledRows[r][j];
      value /= Math.max(1, n - 1);
      matrix[i][j] = value;
      matrix[j][i] = value;
    }
  }

  return matrix;
}

function powerIteration(matrix, seedOffset = 0) {
  const size = matrix.length;
  let vector = normalize(Array.from({ length: size }, (_, index) => 1 + ((index + seedOffset) % 3) * 0.17));

  for (let iteration = 0; iteration < 120; iteration += 1) {
    const next = normalize(multiplyMatrixVector(matrix, vector));
    const delta = Math.sqrt(next.reduce((sum, value, index) => sum + (value - vector[index]) ** 2, 0));
    vector = next;
    if (delta < 1e-8) break;
  }

  const mv = multiplyMatrixVector(matrix, vector);
  const eigenvalue = Math.max(0, dot(vector, mv));
  return { eigenvalue, eigenvector: vector };
}

function deflate(matrix, eigenvalue, eigenvector) {
  return matrix.map((row, i) => row.map((value, j) => value - eigenvalue * eigenvector[i] * eigenvector[j]));
}

function getNearestEnv(sample, envSeries, tomatoMinMs, tomatoMaxMs) {
  if (!envSeries.length) return null;
  if (envSeries.length === 1) return envSeries[0];

  const envTimes = envSeries.map((item, index) => safeNumber(item.tSec, index));
  const envMin = Math.min(...envTimes);
  const envMax = Math.max(...envTimes);
  const span = Math.max(1, tomatoMaxMs - tomatoMinMs);
  const progress = (safeNumber(sample.timestampMs, tomatoMinMs) - tomatoMinMs) / span;
  const target = envMin + progress * Math.max(1, envMax - envMin);

  let best = envSeries[0];
  let bestDistance = Math.abs(safeNumber(best.tSec, 0) - target);

  envSeries.forEach((item, index) => {
    const distance = Math.abs(safeNumber(item.tSec, index) - target);
    if (distance < bestDistance) {
      best = item;
      bestDistance = distance;
    }
  });

  return best;
}

export const PCA_VARIABLES = [
  { key: "tempC", label: "Temperature", unit: "°C" },
  { key: "humidityPct", label: "Humidity", unit: "%" },
  { key: "pressureHpa", label: "Pressure", unit: "hPa" },
  { key: "gasKohm", label: "Gas resistance", unit: "kΩ" },
  { key: "x", label: "X location", unit: "m" },
  { key: "y", label: "Y location", unit: "m" },
  { key: "timeMin", label: "Time", unit: "min" },
  { key: "maturityScore", label: "Maturity score", unit: "0-1" },
  { key: "count", label: "Tomato count", unit: "count" },
];

const PCA_LABEL_GROUPS = [
  {
    label: "Microclimate gradient",
    keys: ["tempC", "humidityPct", "pressureHpa", "gasKohm"],
  },
  {
    label: "Spatial position gradient",
    keys: ["x", "y"],
  },
  {
    label: "Temporal gradient",
    keys: ["timeMin"],
  },
  {
    label: "Tomato maturity gradient",
    keys: ["maturityScore", "count"],
  },
];

function labelPrincipalComponent(loadings, componentKey) {
  const ranked = [...loadings]
    .map((loading) => ({
      ...loading,
      strength: Math.abs(loading[componentKey] ?? 0),
    }))
    .sort((a, b) => b.strength - a.strength);

  const strongest = ranked.slice(0, 4);

  const groupScores = PCA_LABEL_GROUPS.map((group) => ({
    label: group.label,
    score: strongest
      .filter((item) => group.keys.includes(item.key))
      .reduce((sum, item) => sum + item.strength, 0),
  })).sort((a, b) => b.score - a.score);

  const primary = groupScores[0];
  const secondary = groupScores[1];

  if (!primary || primary.score <= 0) {
    return {
      label: "Mixed PCA gradient",
      explanation: "No single variable group dominates this component.",
      strongest,
    };
  }

  if (secondary && secondary.score > primary.score * 0.65) {
    return {
      label: `${primary.label} + ${secondary.label}`,
      explanation: `This component is mainly influenced by ${primary.label.toLowerCase()} and ${secondary.label.toLowerCase()}.`,
      strongest,
    };
  }

  return {
    label: primary.label,
    explanation: `This component is mainly influenced by ${primary.label.toLowerCase()}.`,
    strongest,
  };
}

function interpretPrincipalComponents(loadings, componentCount) {
  return Array.from({ length: componentCount }, (_, index) => {
    const componentKey = `pc${index + 1}`;
    return {
      id: `PC${index + 1}`,
      componentKey,
      ...labelPrincipalComponent(loadings, componentKey),
    };
  });
}

export function buildPcaDataset(envSeries, tomatoSamples) {
  const samples = tomatoSamples.filter((sample) => Number.isFinite(sample.x) && Number.isFinite(sample.y));
  if (!samples.length) return [];

  const timestamps = samples.map((sample) => safeNumber(sample.timestampMs, 0));
  const tomatoMinMs = Math.min(...timestamps);
  const tomatoMaxMs = Math.max(...timestamps);

  return samples.map((sample, index) => {
    const env = getNearestEnv(sample, envSeries, tomatoMinMs, tomatoMaxMs) ?? {};

    return {
      id: sample.id ?? `Sample ${index + 1}`,
      tempC: safeNumber(env.tempC, 0),
      humidityPct: safeNumber(env.humidityPct, 0),
      pressureHpa: safeNumber(env.pressureHpa, 0),
      gasKohm: safeNumber(env.gasKohm, 0),
      x: safeNumber(sample.x, 0),
      y: safeNumber(sample.y, 0),
      timeMin: safeNumber(sample.timestampMs, tomatoMinMs) / 60000,
      maturityScore: safeNumber(sample.maturityScore ?? sample.continuousMaturityScore, 0),
      count: safeNumber(sample.count, 1),
      confidence: safeNumber(sample.confidence, 0),
      label: sample.label ?? "Tomato cluster",
    };
  });
}

export function calculatePca(envSeries, tomatoSamples, maxComponents = 3) {
  const rows = buildPcaDataset(envSeries, tomatoSamples);
  const variables = PCA_VARIABLES;

  if (rows.length < 3) {
    return {
      ready: false,
      reason: "Not enough samples for PCA",
      rows,
      variables,
      components: [],
      scores: [],
      loadings: [],
      explainedVariance: [],
      cumulativeVariance: [],
    };
  }

  const columns = variables.map((variable) => rows.map((row) => safeNumber(row[variable.key], 0)));
  const means = columns.map(mean);
  const stds = columns.map(std);

  const scaledRows = rows.map((row) => variables.map((variable, index) => (safeNumber(row[variable.key], 0) - means[index]) / stds[index]));
  let covariance = covarianceMatrix(scaledRows);
  const totalVariance = Math.max(1e-9, covariance.reduce((sum, row, index) => sum + row[index], 0));
  const componentCount = Math.min(maxComponents, variables.length, rows.length - 1);
  const components = [];

  for (let index = 0; index < componentCount; index += 1) {
    const result = powerIteration(covariance, index);
    components.push({
      id: `PC${index + 1}`,
      eigenvalue: result.eigenvalue,
      eigenvector: result.eigenvector,
      explainedRatio: result.eigenvalue / totalVariance,
    });
    covariance = deflate(covariance, result.eigenvalue, result.eigenvector);
  }

  const scores = scaledRows.map((row, rowIndex) => {
    const values = components.map((component) => dot(row, component.eigenvector));
    return {
      id: rows[rowIndex].id,
      label: rows[rowIndex].label,
      maturityScore: rows[rowIndex].maturityScore,
      x: rows[rowIndex].x,
      y: rows[rowIndex].y,
      pc1: values[0] ?? 0,
      pc2: values[1] ?? 0,
      pc3: values[2] ?? 0,
    };
  });

  const loadings = variables.map((variable, variableIndex) => {
    const item = { key: variable.key, label: variable.label, unit: variable.unit };
    components.forEach((component, componentIndex) => {
      item[`pc${componentIndex + 1}`] = component.eigenvector[variableIndex] * Math.sqrt(component.eigenvalue);
    });
    return item;
  });

 const explainedVariance = components.map((component) => component.explainedRatio);
  let running = 0;
  const cumulativeVariance = explainedVariance.map((value) => {
    running += value;
    return running;
  });

  const componentInterpretations = interpretPrincipalComponents(loadings, components.length);

  return {
    ready: true,
    reason: null,
    rows,
    variables,
    components,
    scores,
    loadings,
    componentInterpretations,
    explainedVariance,
    cumulativeVariance,
  };
}

export function strongestLoadings(loadings, componentKey = "pc1", limit = 3) {
  return [...loadings]
    .sort((a, b) => Math.abs(b[componentKey] ?? 0) - Math.abs(a[componentKey] ?? 0))
    .slice(0, limit);
}
