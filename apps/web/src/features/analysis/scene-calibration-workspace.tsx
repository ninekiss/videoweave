"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Job, MediaAsset, Project, SceneCandidate, Shot } from "@videoweave/contracts";

import {
  createSceneCandidateJob,
  createVideoAnalysisJob,
  getAssetAccess,
  getJob,
  listAssetShots,
  listProjectAssets,
  listProjects,
} from "@/lib/api";

const MIN_SHOT_DURATION = 0.25;
const CUT_PREVIEW_RADIUS = 0.6;

function isActive(job: Job | null): boolean {
  return job?.state === "QUEUED" || job?.state === "RUNNING";
}

function readCandidates(job: Job | null): SceneCandidate[] {
  const raw = job?.result.candidates;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const timestamp = Reflect.get(item, "timestamp");
    const score = Reflect.get(item, "score");
    if (typeof timestamp !== "number" || typeof score !== "number") return [];
    return [{ timestamp, score }];
  });
}

function acceptedCandidates(
  candidates: SceneCandidate[],
  duration: number,
  threshold: number,
): SceneCandidate[] {
  const accepted: SceneCandidate[] = [];
  let previous = 0;
  for (const candidate of [...candidates].sort((a, b) => a.timestamp - b.timestamp)) {
    if (candidate.score < threshold) continue;
    const timestamp = Math.min(Math.max(candidate.timestamp, 0), duration);
    if (timestamp <= 0 || timestamp >= duration) continue;
    if (timestamp - previous < MIN_SHOT_DURATION) continue;
    if (duration - timestamp < MIN_SHOT_DURATION) continue;
    accepted.push(candidate);
    previous = timestamp;
  }
  return accepted;
}

function quantile(values: number[], q: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * q;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  const weight = position - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function roundThreshold(value: number): number {
  return Math.round(value * 100) / 100;
}

function formatTime(value: number): string {
  return `${value.toFixed(3)}s`;
}

export function SceneCalibrationWorkspace() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const previewEndRef = useRef<number | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [assetId, setAssetId] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [candidateJob, setCandidateJob] = useState<Job | null>(null);
  const [analysisJob, setAnalysisJob] = useState<Job | null>(null);
  const [shots, setShots] = useState<Shot[]>([]);
  const [threshold, setThreshold] = useState(1);
  const [selectedCandidateIndex, setSelectedCandidateIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedAsset = assets.find((asset) => asset.id === assetId) ?? null;
  const candidates = useMemo(() => readCandidates(candidateJob), [candidateJob]);
  const selectedCandidate = selectedCandidateIndex == null ? null : candidates[selectedCandidateIndex] ?? null;
  const floorThreshold = typeof candidateJob?.result.floor_threshold === "number"
    ? candidateJob.result.floor_threshold
    : 1;
  const scoreStats = useMemo(() => {
    if (candidates.length === 0) return null;
    const scores = candidates.map((candidate) => candidate.score);
    return {
      min: Math.min(...scores),
      max: Math.max(...scores),
      q25: quantile(scores, 0.25),
      median: quantile(scores, 0.5),
      q75: quantile(scores, 0.75),
    };
  }, [candidates]);
  const sliderMin = floorThreshold;
  const sliderMax = scoreStats ? Math.max(scoreStats.max, floorThreshold + 0.05) : 20;
  const sliderStep = scoreStats && sliderMax - sliderMin <= 2 ? 0.05 : 0.1;
  const dynamicPresets = useMemo(() => {
    if (!scoreStats) return [];
    const raw = [
      { label: "Conservative", value: roundThreshold(scoreStats.q75) },
      { label: "Balanced", value: roundThreshold(scoreStats.median) },
      { label: "Sensitive", value: roundThreshold(scoreStats.q25) },
    ];
    return raw.filter((preset, index) => raw.findIndex((item) => item.value === preset.value) === index);
  }, [scoreStats]);
  const accepted = useMemo(
    () => acceptedCandidates(candidates, selectedAsset?.duration ?? 0, threshold),
    [candidates, selectedAsset?.duration, threshold],
  );
  const acceptedKeys = useMemo(
    () => new Set(accepted.map((candidate) => `${candidate.timestamp}:${candidate.score}`)),
    [accepted],
  );
  const estimatedShots = selectedAsset && candidateJob?.state === "SUCCEEDED" ? accepted.length + 1 : 0;
  const selectedCandidateAccepted = selectedCandidate
    ? acceptedKeys.has(`${selectedCandidate.timestamp}:${selectedCandidate.score}`)
    : false;

  useEffect(() => {
    void listProjects()
      .then((items) => {
        setProjects(items);
        setProjectId(items[0]?.id ?? "");
      })
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not load projects"));
  }, []);

  useEffect(() => {
    if (!projectId) {
      setAssets([]);
      setAssetId("");
      return;
    }
    void listProjectAssets(projectId)
      .then((items) => {
        const videos = items.filter((asset) => asset.type === "VIDEO" && asset.status === "READY");
        setAssets(videos);
        setAssetId(videos[0]?.id ?? "");
      })
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not load videos"));
  }, [projectId]);

  useEffect(() => {
    setCandidateJob(null);
    setAnalysisJob(null);
    setShots([]);
    setPreviewUrl(null);
    setThreshold(1);
    setSelectedCandidateIndex(null);
    previewEndRef.current = null;
    if (!assetId) return;
    void getAssetAccess(assetId)
      .then((access) => setPreviewUrl(access.url))
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not load preview"));
  }, [assetId]);

  useEffect(() => {
    if (!candidateJob || !isActive(candidateJob)) return;
    const timer = window.setInterval(() => {
      void getJob(candidateJob.id)
        .then((job) => {
          setCandidateJob(job);
          if (job.state === "SUCCEEDED") {
            const nextCandidates = readCandidates(job);
            if (nextCandidates.length > 0) {
              setThreshold(roundThreshold(quantile(nextCandidates.map((candidate) => candidate.score), 0.5)));
            }
          }
        })
        .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not refresh candidate job"));
    }, 800);
    return () => window.clearInterval(timer);
  }, [candidateJob?.id, candidateJob?.state]);

  useEffect(() => {
    if (!analysisJob || !isActive(analysisJob)) return;
    const timer = window.setInterval(() => {
      void getJob(analysisJob.id)
        .then(async (job) => {
          setAnalysisJob(job);
          if (job.state === "SUCCEEDED" && assetId) {
            setShots(await listAssetShots(assetId));
          }
        })
        .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not refresh analysis job"));
    }, 800);
    return () => window.clearInterval(timer);
  }, [analysisJob?.id, analysisJob?.state, assetId]);

  async function detectCandidates() {
    if (!assetId || isActive(candidateJob) || isActive(analysisJob)) return;
    setError(null);
    setShots([]);
    setAnalysisJob(null);
    setSelectedCandidateIndex(null);
    previewEndRef.current = null;
    try {
      setCandidateJob(await createSceneCandidateJob(assetId, 1));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not start candidate detection");
    }
  }

  async function runAnalysis() {
    if (!assetId || candidateJob?.state !== "SUCCEEDED" || isActive(analysisJob)) return;
    setError(null);
    try {
      setAnalysisJob(await createVideoAnalysisJob(assetId, threshold, candidateJob.id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not start calibrated analysis");
    }
  }

  function previewCandidate(index: number) {
    const candidate = candidates[index];
    const video = videoRef.current;
    if (!candidate || !video) return;

    setSelectedCandidateIndex(index);
    const knownDuration = Number.isFinite(video.duration)
      ? video.duration
      : selectedAsset?.duration ?? candidate.timestamp + CUT_PREVIEW_RADIUS;
    const start = Math.max(0, candidate.timestamp - CUT_PREVIEW_RADIUS);
    const end = Math.min(knownDuration, candidate.timestamp + CUT_PREVIEW_RADIUS);

    previewEndRef.current = end;
    video.pause();
    video.currentTime = start;
    void video.play().catch(() => {
      // The browser may block playback in unusual embedding contexts; seeking still succeeds.
    });
  }

  function moveCandidate(delta: number) {
    if (candidates.length === 0) return;
    const current = selectedCandidateIndex ?? (delta > 0 ? -1 : candidates.length);
    const next = Math.min(Math.max(current + delta, 0), candidates.length - 1);
    previewCandidate(next);
  }

  function handlePreviewTimeUpdate() {
    const video = videoRef.current;
    const previewEnd = previewEndRef.current;
    if (!video || previewEnd == null || video.currentTime < previewEnd) return;
    video.pause();
    previewEndRef.current = null;
  }

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand">VideoWeave</div>
        <nav>
          <Link className="navItem" href="/">Workspace</Link>
          <Link className="navItem" href="/projects">Projects</Link>
          <Link className="navItem active" href="/analysis">Shot Calibration</Link>
        </nav>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">VIDEO ANALYSIS · CALIBRATION</p>
            <h1>Shot Detection Calibration</h1>
          </div>
          <span className="status">FFmpeg scdet · adaptive threshold</span>
        </header>

        {error ? <div className="errorBanner">{error}</div> : null}

        <section className="panel" style={{ display: "grid", gap: 16, marginBottom: 18, padding: 18 }}>
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr 2fr auto" }}>
            <label>
              <span className="muted small">Project</span>
              <select value={projectId} onChange={(event) => setProjectId(event.target.value)} style={{ width: "100%" }}>
                {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
              </select>
            </label>
            <label>
              <span className="muted small">READY video</span>
              <select value={assetId} onChange={(event) => setAssetId(event.target.value)} style={{ width: "100%" }}>
                {assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.filename}</option>)}
              </select>
            </label>
            <button className="primary" disabled={!assetId || isActive(candidateJob) || isActive(analysisJob)} onClick={() => void detectCandidates()} type="button">
              {isActive(candidateJob) ? "Detecting…" : "Detect candidates"}
            </button>
          </div>

          {selectedAsset ? (
            <div className="muted small">
              {selectedAsset.filename} · {selectedAsset.duration?.toFixed(3) ?? "?"}s · {selectedAsset.width ?? "?"}×{selectedAsset.height ?? "?"}
            </div>
          ) : null}
        </section>

        <section style={{ display: "grid", gap: 18, gridTemplateColumns: "minmax(0, 1.15fr) minmax(360px, .85fr)" }}>
          <div style={{ display: "grid", gap: 18 }}>
            <section className="panel" style={{ padding: 16 }}>
              <div className="sectionTitle compact">
                <div>
                  <p className="eyebrow">SOURCE VIDEO</p>
                  <h2>Cut preview</h2>
                </div>
                {selectedCandidate ? (
                  <span className={selectedCandidateAccepted ? "assetStatus ready" : "status"}>
                    Candidate #{(selectedCandidateIndex ?? 0) + 1} · {formatTime(selectedCandidate.timestamp)}
                  </span>
                ) : null}
              </div>
              <div className="videoPreview">
                {previewUrl ? (
                  <video
                    controls
                    onEnded={() => { previewEndRef.current = null; }}
                    onTimeUpdate={handlePreviewTimeUpdate}
                    preload="metadata"
                    ref={videoRef}
                    src={previewUrl}
                  />
                ) : (
                  <div className="previewLoading">Select a video</div>
                )}
              </div>

              {selectedCandidate ? (
                <div className="panel" style={{ display: "grid", gap: 12, marginTop: 12, padding: 12 }}>
                  <div style={{ alignItems: "center", display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <div>
                      <strong>Candidate #{(selectedCandidateIndex ?? 0) + 1}</strong>
                      <div className="muted small">
                        {formatTime(selectedCandidate.timestamp)} · score {selectedCandidate.score.toFixed(3)} · {selectedCandidateAccepted ? "accepted at current threshold" : "below current threshold"}
                      </div>
                    </div>
                    <span className="muted small">Preview ±{CUT_PREVIEW_RADIUS.toFixed(1)}s</span>
                  </div>
                  <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1.4fr 1fr" }}>
                    <button className="navItem" disabled={selectedCandidateIndex === 0} onClick={() => moveCandidate(-1)} type="button">Previous cut</button>
                    <button className="primary" onClick={() => previewCandidate(selectedCandidateIndex ?? 0)} type="button">Replay cut</button>
                    <button className="navItem" disabled={selectedCandidateIndex === candidates.length - 1} onClick={() => moveCandidate(1)} type="button">Next cut</button>
                  </div>
                </div>
              ) : candidateJob?.state === "SUCCEEDED" && candidates.length > 0 ? (
                <p className="muted small" style={{ marginTop: 10 }}>Click any candidate below to play the 0.6 seconds before and after that cut.</p>
              ) : null}
            </section>

            <section className="panel" style={{ padding: 18 }}>
              <div className="sectionTitle compact">
                <div>
                  <p className="eyebrow">CANDIDATE CUTS</p>
                  <h2>{candidateJob?.state === "SUCCEEDED" ? `${candidates.length} candidates` : "Run detection first"}</h2>
                </div>
                {candidateJob ? <span className="status">{candidateJob.state} · {Math.round(candidateJob.progress * 100)}%</span> : null}
              </div>

              {scoreStats ? (
                <div className="muted small" style={{ marginBottom: 12 }}>
                  score range {scoreStats.min.toFixed(3)}–{scoreStats.max.toFixed(3)} · median {scoreStats.median.toFixed(3)} · candidate floor {floorThreshold.toFixed(2)}
                </div>
              ) : null}

              <div style={{ maxHeight: 420, overflow: "auto" }}>
                {candidates.map((candidate, index) => {
                  const acceptedNow = acceptedKeys.has(`${candidate.timestamp}:${candidate.score}`);
                  const selectedNow = selectedCandidateIndex === index;
                  return (
                    <button
                      aria-pressed={selectedNow}
                      key={`${candidate.timestamp}-${index}`}
                      onClick={() => previewCandidate(index)}
                      style={{
                        alignItems: "center",
                        background: "transparent",
                        border: "none",
                        borderBottom: "1px solid var(--border)",
                        borderLeft: selectedNow ? "3px solid currentColor" : "3px solid transparent",
                        color: "inherit",
                        cursor: "pointer",
                        display: "grid",
                        gap: 12,
                        gridTemplateColumns: "70px 1fr 90px",
                        padding: "9px 6px",
                        textAlign: "left",
                        width: "100%",
                      }}
                      type="button"
                    >
                      <strong>#{index + 1}</strong>
                      <span>{formatTime(candidate.timestamp)}</span>
                      <span className={acceptedNow ? "assetStatus ready" : "muted"}>score {candidate.score.toFixed(3)}</span>
                    </button>
                  );
                })}
                {candidateJob?.state === "SUCCEEDED" && candidates.length === 0 ? <p className="muted">No candidates scored at least {floorThreshold.toFixed(2)}.</p> : null}
              </div>
            </section>
          </div>

          <aside style={{ display: "grid", alignContent: "start", gap: 18 }}>
            <section className="panel" style={{ padding: 18 }}>
              <p className="eyebrow">ADAPTIVE THRESHOLD</p>
              <h2>{threshold.toFixed(2)}</h2>
              <input
                disabled={candidateJob?.state !== "SUCCEEDED" || candidates.length === 0}
                max={sliderMax}
                min={sliderMin}
                onChange={(event) => setThreshold(Number(event.target.value))}
                step={sliderStep}
                type="range"
                value={Math.min(Math.max(threshold, sliderMin), sliderMax)}
                style={{ width: "100%" }}
              />
              {scoreStats ? (
                <div className="muted small" style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>{sliderMin.toFixed(2)}</span>
                  <span>{sliderMax.toFixed(2)}</span>
                </div>
              ) : null}

              <div style={{ display: "grid", gap: 8, marginTop: 14 }}>
                {dynamicPresets.map((preset) => {
                  const shotCount = selectedAsset
                    ? acceptedCandidates(candidates, selectedAsset.duration ?? 0, preset.value).length + 1
                    : 0;
                  return (
                    <button
                      className={Math.abs(threshold - preset.value) < 0.001 ? "primary" : "navItem"}
                      key={preset.label}
                      onClick={() => setThreshold(preset.value)}
                      style={{ display: "flex", justifyContent: "space-between" }}
                      type="button"
                    >
                      <span>{preset.label}</span>
                      <span>{preset.value.toFixed(2)} · {shotCount} shots</span>
                    </button>
                  );
                })}
              </div>

              <div style={{ marginTop: 20 }}>
                <p className="eyebrow">ESTIMATED STRUCTURE</p>
                <div style={{ display: "flex", gap: 28 }}>
                  <div><strong style={{ fontSize: 30 }}>{accepted.length}</strong><div className="muted small">accepted cuts</div></div>
                  <div><strong style={{ fontSize: 30 }}>{estimatedShots}</strong><div className="muted small">estimated shots</div></div>
                </div>
              </div>

              <button className="primary" disabled={candidateJob?.state !== "SUCCEEDED" || isActive(analysisJob)} onClick={() => void runAnalysis()} style={{ marginTop: 20, width: "100%" }} type="button">
                {isActive(analysisJob) ? "Generating shot assets…" : `Confirm ${threshold.toFixed(2)} and analyze`}
              </button>
              <p className="muted small" style={{ marginTop: 10 }}>
                The range and presets come from this video's candidate-score distribution. Shot count is an estimate, not a target. Confirm only after previewing the highlighted cuts in the source video.
              </p>
            </section>

            {analysisJob ? (
              <section className="panel" style={{ padding: 18 }}>
                <p className="eyebrow">ANALYSIS JOB</p>
                <h3>{analysisJob.state}</h3>
                <p className="muted small">{analysisJob.stage ?? analysisJob.type} · {Math.round(analysisJob.progress * 100)}%</p>
                {analysisJob.error ? <p className="errorText small">{analysisJob.error}</p> : null}
              </section>
            ) : null}

            {shots.length > 0 ? (
              <section className="panel" style={{ padding: 18 }}>
                <p className="eyebrow">CONFIRMED SHOTS</p>
                <h2>{shots.length} shots</h2>
                <div style={{ maxHeight: 360, overflow: "auto" }}>
                  {shots.map((shot) => (
                    <div key={shot.id} style={{ borderBottom: "1px solid var(--border)", padding: "9px 0" }}>
                      <strong>Shot {shot.index}</strong>
                      <div className="muted small">{formatTime(shot.start_time)} → {formatTime(shot.end_time)} · {formatTime(shot.duration)}</div>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
          </aside>
        </section>
      </section>
    </main>
  );
}
