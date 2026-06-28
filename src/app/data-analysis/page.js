"use client";

import { useEffect, useMemo, useState } from "react";
import GreenhouseMap from "./components/GreenhouseMap";
import MicroclimatePanel from "./components/MicroclimatePanel";
import RobotDebugPanel from "./components/RobotDebugPanel";
import ResearchRagPanel from "./components/ResearchRagPanel";
import PcaPanel from "./components/PcaPanel";
import TimelineControls from "./components/TimelineControls";
import { buildFallbackEnvSeries, normalizeEnvSeries } from "./lib/dataParsers";
import {
  GREENHOUSE_LAYOUT,
  getAccumulatedDetectionsUpToBucket,
  getCurrentRobotPoseForBucket,
  getDetectionsInBucket,
  getTimelineBuckets,
} from "./lib/mockTomatoData";
import { summarizeSpatialModel } from "./lib/spatialModel";
import ScenarioControls from "./components/ScenarioControls";
import { applyScenarioToSamples } from "./lib/scenarios";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "map", label: "Greenhouse Map" },
  { id: "microclimate", label: "Microclimate / M5Stick" },
  { id: "robot-debug", label: "Robot Debug" },
  { id: "pca", label: "PCA" },
  { id: "quality", label: "Data Quality" },
  { id: "rag", label: "Research RAG" },
];

function StatCard({ label, value, detail, tone = "slate" }) {
  const toneClass = {
    emerald: "border-emerald-400/20 bg-emerald-400/10 text-emerald-100",
    cyan: "border-cyan-400/20 bg-cyan-400/10 text-cyan-100",
    fuchsia: "border-fuchsia-400/20 bg-fuchsia-400/10 text-fuchsia-100",
    amber: "border-amber-400/20 bg-amber-400/10 text-amber-100",
    slate: "border-slate-700 bg-slate-900/70 text-slate-100",
  }[tone];

  return (
    <div className={`rounded-3xl border p-4 ${toneClass}`}>
      <div className="text-[10px] font-semibold uppercase tracking-[0.24em] opacity-70">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-white">{value}</div>
      <div className="mt-1 text-sm text-slate-400">{detail}</div>
    </div>
  );
}

function TabButton({ tab, activeTab, setActiveTab }) {
  const active = tab.id === activeTab;
  return (
    <button
      onClick={() => setActiveTab(tab.id)}
      className={`rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] transition ${
        active
          ? "border-emerald-400/60 bg-emerald-400/15 text-emerald-100"
          : "border-slate-700 bg-slate-950/70 text-slate-400 hover:border-slate-500 hover:text-white"
      }`}
    >
      {tab.label}
    </button>
  );
}

function OverviewPanel({ envSeries, tomatoSamples, spatialSummary, setActiveTab }) {
  const latestEnv = envSeries.at(-1) ?? null;
  const averageMaturity = tomatoSamples.length
    ? tomatoSamples.reduce((sum, sample) => sum + sample.maturityScore, 0) / tomatoSamples.length
    : 0;

  return (
    <section className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Real current layer"
          value={`${envSeries.length} samples`}
          detail="M5Stick microclimate telemetry from the robot log."
          tone="emerald"
        />
        <StatCard
          label="Mock tomato layer"
          value={`${tomatoSamples.length} clusters`}
          detail="YOLO12M-shaped data until real detections are available."
          tone="cyan"
        />
        <StatCard
          label="Avg maturity"
          value={`${Math.round(averageMaturity * 100)}%`}
          detail="Numeric maturity index used for the spatial map."
          tone="amber"
        />
        <StatCard
          label="Moran's I"
          value={spatialSummary.moran.value.toFixed(2)}
          detail={spatialSummary.moran.label}
          tone="fuchsia"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-[2rem] border border-slate-800 bg-slate-900/65 p-5">
          <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-emerald-300">Dashboard structure</div>
          <h2 className="mt-2 text-2xl font-semibold text-white">Two connected analysis layers</h2>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            <button onClick={() => setActiveTab("microclimate")} className="rounded-3xl border border-slate-800 bg-slate-950/70 p-4 text-left transition hover:border-emerald-400/50">
              <div className="text-sm font-semibold text-white">Microclimate / M5Stick</div>
              <p className="mt-2 text-sm leading-6 text-slate-400">Detailed graphs, hover values, threshold zones, prediction overlay, time-scale aggregation, Y-axis toggle, and correlation matrix.</p>
            </button>
            <button onClick={() => setActiveTab("map")} className="rounded-3xl border border-slate-800 bg-slate-950/70 p-4 text-left transition hover:border-cyan-400/50">
              <div className="text-sm font-semibold text-white">Greenhouse spatial map</div>
              <p className="mt-2 text-sm leading-6 text-slate-400">One vertical tomato row, current robot pose, accumulated tomato maturity clusters, Kriging-style prediction layer, and uncertainty view.</p>
            </button>
          </div>
        </div>

        <div className="rounded-[2rem] border border-slate-800 bg-slate-900/65 p-5">
          <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-cyan-300">Latest environment snapshot</div>
          <h2 className="mt-2 text-2xl font-semibold text-white">Current M5Stick state</h2>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <StatCard label="Temp" value={latestEnv?.tempC != null ? `${latestEnv.tempC.toFixed(1)}°C` : "—"} detail="Temperature" />
            <StatCard label="Humidity" value={latestEnv?.humidityPct != null ? `${latestEnv.humidityPct.toFixed(1)}%` : "—"} detail="Relative humidity" />
            <StatCard label="Pressure" value={latestEnv?.pressureHpa != null ? `${latestEnv.pressureHpa.toFixed(1)} hPa` : "—"} detail="Air pressure" />
            <StatCard label="Gas" value={latestEnv?.gasKohm != null ? `${latestEnv.gasKohm.toFixed(1)} kΩ` : "—"} detail="Gas resistance" />
          </div>
        </div>
      </div>
    </section>
  );
}

function DataQualityPanel({ envSeries, tomatoSamples }) {
  return (
    <section className="rounded-[2rem] border border-slate-800 bg-slate-900/65 p-5">
      <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-amber-300">Prototype status</div>
      <h2 className="mt-2 text-2xl font-semibold text-white">Data quality and integration assumptions</h2>

      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="M5Stick" value="Real / API" detail={`${envSeries.length} parsed environmental samples`} tone="emerald" />
        <StatCard label="YOLO12M" value="Mock" detail={`${tomatoSamples.length} prototype detections loaded`} tone="cyan" />
        <StatCard label="Greenhouse layout" value="One mock row" detail="Aligned top-to-bottom tomato positions" tone="amber" />
        <StatCard label="Kriging" value="Prototype" detail="Ready to connect to real spatial samples" tone="fuchsia" />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-4">
          <div className="text-sm font-semibold text-white">Currently supported</div>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-400">
            <li>• M5Stick temperature, humidity, pressure, and gas resistance.</li>
            <li>• Microclimate graphs with thresholds, trends, prediction overlay, and correlation matrix.</li>
            <li>• Aligned one-row mock tomato maturity classes structured like expected YOLO12M output.</li>
            <li>• Spatial map, autocorrelation indicators, variogram summary, and uncertainty layer.</li>
          </ul>
        </div>

        <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-4">
          <div className="text-sm font-semibold text-white">Still missing from the robot project</div>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-400">
            <li>• Verified greenhouse-world pose and tomato coordinates. Robot Debug currently uses a session-local estimate.</li>
            <li>• Camera/LiDAR calibration and depth required for a verified tomato map.</li>
            <li>• Confirmed greenhouse dimensions and row geometry.</li>
            <li>• Repeated scans over time for maturity trend validation.</li>
          </ul>
        </div>
      </div>
    </section>
  );
}

export default function DataAnalysisPage() {
  const [envSeries, setEnvSeries] = useState([]);
  const [timeScale, setTimeScale] = useState("minutes");
  const [bucketPosition, setBucketPosition] = useState(() => Math.max(0, getTimelineBuckets("minutes").length - 1));
  const [layer, setLayer] = useState("kriging");
  const [selected, setSelected] = useState(null);
  const [activeTab, setActiveTab] = useState("overview");
  const [scenarioId, setScenarioId] = useState("baseline");

  useEffect(() => {
    let alive = true;

    async function loadEnvironment() {
      try {
        const res = await fetch("/api/env-analysis", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const payload = await res.json();
        const normalized = normalizeEnvSeries(payload);
        if (alive) setEnvSeries(normalized.length ? normalized : buildFallbackEnvSeries());
      } catch {
        if (alive) setEnvSeries(buildFallbackEnvSeries());
      }
    }

    loadEnvironment();
    const interval = setInterval(loadEnvironment, 5000);
    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, []);

  const timelineBuckets = useMemo(() => getTimelineBuckets(timeScale), [timeScale]);
  const safeBucketPosition = Math.min(bucketPosition, Math.max(0, timelineBuckets.length - 1));
  const tomatoSamples = useMemo(() => getAccumulatedDetectionsUpToBucket(safeBucketPosition, timeScale), [safeBucketPosition, timeScale]);
  const scenarioTomatoSamples = useMemo(() => applyScenarioToSamples(tomatoSamples, scenarioId), [tomatoSamples, scenarioId],);
  const currentDetections = useMemo(() => getDetectionsInBucket(safeBucketPosition, timeScale), [safeBucketPosition, timeScale]);
  const scenarioCurrentDetections = useMemo(() => applyScenarioToSamples(currentDetections, scenarioId), [currentDetections, scenarioId],);
  const currentRobotPose = useMemo(() => getCurrentRobotPoseForBucket(safeBucketPosition, timeScale), [safeBucketPosition, timeScale]);
  const spatialSummary = useMemo(
    () => summarizeSpatialModel(scenarioTomatoSamples, GREENHOUSE_LAYOUT),
    [scenarioTomatoSamples],
  );

  useEffect(() => {
    if (selected && !scenarioTomatoSamples.some((sample) => sample.id === selected.id)) {
      setSelected(null);
    }
  }, [selected, scenarioTomatoSamples]);

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-6 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1600px] space-y-6">
        <section className="overflow-hidden rounded-[2rem] border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-950 to-emerald-950/40 p-6 shadow-2xl shadow-black/40">
          <div className="grid gap-6 xl:grid-cols-[1.5fr_0.9fr] xl:items-end">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.35em] text-emerald-300">Robot EcoFarm · Data Analysis</div>
              <h1 className="mt-4 max-w-5xl text-4xl font-semibold tracking-tight text-white md:text-5xl">Ecological monitoring dashboard for greenhouse tomato maturity</h1>
              <p className="mt-4 max-w-4xl text-base leading-7 text-slate-300">
                This page presents the greenhouse as an ecological system that can be measured and analyzed: environmental conditions on one side, and tomato maturity across the greenhouse on the other. The goal is to understand trends, relationships, and areas that may need attention or prediction.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-3xl border border-emerald-400/20 bg-emerald-400/10 p-4">
                <div className="text-[10px] uppercase tracking-[0.25em] text-emerald-200">Current</div>
                <div className="mt-2 font-semibold text-white">M5Stick microclimate</div>
                <div className="mt-1 text-slate-400">full graph tab preserved</div>
              </div>
              <div className="rounded-3xl border border-cyan-400/20 bg-cyan-400/10 p-4">
                <div className="text-[10px] uppercase tracking-[0.25em] text-cyan-200">Model</div>
                <div className="mt-2 font-semibold text-white">Spatial prediction</div>
                <div className="mt-1 text-slate-400">map · autocorrelation · Kriging</div>
              </div>
            </div>
          </div>
        </section>

        <nav className="flex flex-wrap gap-2 rounded-[2rem] border border-slate-800 bg-slate-900/65 p-3">
          {TABS.map((tab) => (
            <TabButton key={tab.id} tab={tab} activeTab={activeTab} setActiveTab={setActiveTab} />
          ))}
        </nav>

        {activeTab !== "robot-debug" && (
          <ScenarioControls scenarioId={scenarioId} setScenarioId={setScenarioId} />
        )}

        {activeTab === "overview" && (
          <OverviewPanel
            envSeries={envSeries}
            tomatoSamples={scenarioTomatoSamples}
            spatialSummary={spatialSummary}
            setActiveTab={setActiveTab}
          />
        )}

        {activeTab === "map" && (
          <section className="space-y-6">
            <TimelineControls
              bucketPosition={safeBucketPosition}
              setBucketPosition={setBucketPosition}
              layer={layer}
              setLayer={setLayer}
              timeScale={timeScale}
              setTimeScale={setTimeScale}
            />

            <GreenhouseMap
              layout={GREENHOUSE_LAYOUT}
              samples={scenarioTomatoSamples}
              currentDetections={scenarioCurrentDetections}
              currentRobotPose={currentRobotPose}
              spatialSummary={spatialSummary}
              layer={layer}
              selectedId={selected?.id}
              onSelect={setSelected}
              timeScale={timeScale}
            />
          </section>
        )}

        {activeTab === "microclimate" && <MicroclimatePanel />}

        {activeTab === "robot-debug" && <RobotDebugPanel />}

        {activeTab === "pca" && <PcaPanel envSeries={envSeries} tomatoSamples={scenarioTomatoSamples} />}

        {activeTab === "quality" && <DataQualityPanel envSeries={envSeries} tomatoSamples={scenarioTomatoSamples} />}

        {activeTab === "rag" && <ResearchRagPanel />}
      </div>
    </main>
  );
}
