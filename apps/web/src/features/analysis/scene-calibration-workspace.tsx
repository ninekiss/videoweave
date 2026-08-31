"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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

const presets = [15, 10, 7, 5, 3, 1] as const;
const MIN_SHOT_DURATION = 0.25;

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

function formatTime(value: number): string {
  return `${value.toFixed(3)}s`;
}

export function SceneCalibrationWorkspace() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [assetId, setAssetId] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [candidateJob, setCandidateJob] = useState<Job | null>(null);
  const [analysisJob, setAnalysisJob] = useState<Job | null>(null);
  const [shots, setShots] = useState<Shot[]>([]);
  const [threshold, setThreshold] = useState(10);
  const [error, setError] = useState<string | null>(null);

  const selectedAsset = assets.find((asset) => asset.id === assetId) ?? null;
  const candidates = useMemo(() => readCandidates(candidateJob), [candidateJob]);
  const accepted = useMemo(
    () => acceptedCandidates(candidates, selectedAsset?.duration ?? 0, threshold),
    [candidates, selectedAsset?.duration, threshold],
  );
  const acceptedKeys = useMemo(
    () => new Set(accepted.map((candidate) => `${candidate.timestamp}:${candidate.score}`)),
    [accepted],
  );
  const estimatedShots = selectedAsset && candidateJob?.state === "SUCCEEDED" ? accepted.length + 1 : 0;

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
    if (!assetId) return;
    void getAssetAccess(assetId)
      .then((access) => setPreviewUrl(access.url))
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not load preview"));
  }, [assetId]);

  useEffect(() => {
    if (!candidateJob || !isActive(candidateJob)) return;
    const timer = window.setInterval(() => {
      void getJob(candidateJob.id)
        .then(setCandidateJob)
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
          <span className="status">FFmpeg scdet · candidate floor 1</span>
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
              <p className="eyebrow">SOURCE VIDEO</p>
              <div className="videoPreview">
                {previewUrl ? <video controls preload="metadata" src={previewUrl} /> : <div className="previewLoading">Select a video</div>}
              </div>
            </section>

            <section className="panel" style={{ padding: 18 }}>
              <div className="sectionTitle compact">
                <div>
                  <p className="eyebrow">CANDIDATE CUTS</p>
                  <h2>{candidateJob?.state === "SUCCEEDED" ? `${candidates.length} candidates` : "Run detection first"}</h2>
                </div>
                {candidateJob ? <span className="status">{candidateJob.state} · {Math.round(candidateJob.progress * 100)}%</span> : null}
              </div>

              <div style={{ maxHeight: 420, overflow: "auto" }}>
                {candidates.map((candidate, index) => {
                  const acceptedNow = acceptedKeys.has(`${candidate.timestamp}:${candidate.score}`);
                  return (
                    <div key={`${candidate.timestamp}-${index}`} style={{ alignItems: "center", borderBottom: "1px solid var(--border)", display: "grid", gap: 12, gridTemplateColumns: "70px 1fr 90px", padding: "9px 2px" }}>
                      <strong>#{index + 1}</strong>
                      <span>{formatTime(candidate.timestamp)}</span>
                      <span className={acceptedNow ? "assetStatus ready" : "muted"}>score {candidate.score.toFixed(3)}</span>
                    </div>
                  );
                })}
                {candidateJob?.state === "SUCCEEDED" && candidates.length === 0 ? <p className="muted">No candidates scored at least 1.</p> : null}
              </div>
            </section>
          </div>

          <aside style={{ display: "grid", alignContent: "start", gap: 18 }}>
            <section className="panel" style={{ padding: 18 }}>
              <p className="eyebrow">THRESHOLD</p>
              <h2>{threshold.toFixed(1)}</h2>
              <input
                disabled={candidateJob?.state !== "SUCCEEDED"}
                max="20"
                min="1"
                onChange={(event) => setThreshold(Number(event.target.value))}
                step="0.5"
                type="range"
                value={threshold}
                style={{ width: "100%" }}
              />
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
                {presets.map((value) => (
                  <button className={threshold === value ? "primary" : "navItem"} key={value} onClick={() => setThreshold(value)} type="button">
                    {value}
                  </button>
                ))}
              </div>

              <div style={{ marginTop: 20 }}>
                <p className="eyebrow">ESTIMATED STRUCTURE</p>
                <div style={{ display: "flex", gap: 28 }}>
                  <div><strong style={{ fontSize: 30 }}>{accepted.length}</strong><div className="muted small">accepted cuts</div></div>
                  <div><strong style={{ fontSize: 30 }}>{estimatedShots}</strong><div className="muted small">estimated shots</div></div>
                </div>
              </div>

              <button className="primary" disabled={candidateJob?.state !== "SUCCEEDED" || isActive(analysisJob)} onClick={() => void runAnalysis()} style={{ marginTop: 20, width: "100%" }} type="button">
                {isActive(analysisJob) ? "Generating shot assets…" : `Confirm ${threshold.toFixed(1)} and analyze`}
              </button>
              <p className="muted small" style={{ marginTop: 10 }}>
                Changing threshold is instant. Representative JPEGs are generated only after confirmation.
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
