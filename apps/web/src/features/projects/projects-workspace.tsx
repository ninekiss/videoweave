"use client";

import type { DragEvent, FormEvent } from "react";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Images, ScanSearch, Trash2 } from "lucide-react";
import type { Job, MediaAsset, Project, Shot } from "@videoweave/contracts";

import { Button } from "@/components/ui/button";
import { uploadVideo, type UploadProgress } from "@/features/assets/multipart-upload";
import {
  clearVideoAnalysisOutputs,
  createKeyframeJob,
  createProject,
  createVideoAnalysisJob,
  getAssetAccess,
  getJob,
  listAssetShots,
  listProjectAssets,
  listProjects,
} from "@/lib/api";

const navigation = [
  ["Workspace", "/"],
  ["Projects", "/projects"],
] as const;

function formatBytes(value: number | null): string {
  if (value == null) return "—";
  if (value < 1024) return `${value} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let size = value / 1024;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(size >= 10 ? 1 : 2)} ${units[unitIndex]}`;
}

function formatDuration(value: number | null): string {
  if (value == null) return "—";
  if (value < 60) return `${value.toFixed(2)}s`;
  const minutes = Math.floor(value / 60);
  const seconds = Math.round(value % 60);
  return `${minutes}m ${seconds}s`;
}

function assetSummary(asset: MediaAsset): string {
  const resolution = asset.width && asset.height ? `${asset.width}×${asset.height}` : "Unknown size";
  if (asset.type === "IMAGE") return resolution;
  if (asset.type === "ANALYSIS") return "Video structure analysis";
  const fps = asset.fps ? `${asset.fps.toFixed(2)} FPS` : "Unknown FPS";
  return `${resolution} · ${fps}`;
}

function isActiveJob(job: Job | null): boolean {
  return job?.state === "QUEUED" || job?.state === "RUNNING";
}

function metadataSourceAssetId(value: unknown): string | null {
  if (typeof value !== "object" || value === null) return null;
  const sourceAssetId = (value as Record<string, unknown>).source_asset_id;
  return typeof sourceAssetId === "string" ? sourceAssetId : null;
}

function analysisSourceAssetId(asset: MediaAsset | null): string | null {
  if (!asset) return null;
  if (asset.type === "VIDEO") return asset.id;
  return (
    metadataSourceAssetId(asset.metadata.analysis) ??
    metadataSourceAssetId(asset.metadata.shot_representative)
  );
}

export function ProjectsWorkspace() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [selectedAsset, setSelectedAsset] = useState<MediaAsset | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [shots, setShots] = useState<Shot[]>([]);
  const [newProjectName, setNewProjectName] = useState("");
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isClearingAnalysis, setIsClearingAnalysis] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const [activeJob, setActiveJob] = useState<Job | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedProject = projects.find((project) => project.id === selectedProjectId) ?? null;
  const cleanupSourceAssetId = analysisSourceAssetId(selectedAsset);

  async function refreshProjects(preferredProjectId?: string) {
    const nextProjects = await listProjects();
    setProjects(nextProjects);
    setSelectedProjectId((current) => {
      if (preferredProjectId && nextProjects.some((project) => project.id === preferredProjectId)) {
        return preferredProjectId;
      }
      if (current && nextProjects.some((project) => project.id === current)) return current;
      return nextProjects[0]?.id ?? null;
    });
  }

  async function refreshAssets(projectId: string, preferredAssetId?: string) {
    const nextAssets = await listProjectAssets(projectId);
    setAssets(nextAssets);
    setSelectedAsset((current) => {
      if (preferredAssetId) {
        return nextAssets.find((asset) => asset.id === preferredAssetId) ?? current;
      }
      if (current) return nextAssets.find((asset) => asset.id === current.id) ?? null;
      return nextAssets[0] ?? null;
    });
  }

  useEffect(() => {
    void refreshProjects().catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : "Could not load projects");
    });
  }, []);

  useEffect(() => {
    if (!selectedProjectId) {
      setAssets([]);
      setSelectedAsset(null);
      return;
    }

    setError(null);
    void refreshAssets(selectedProjectId).catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : "Could not load project assets");
    });
  }, [selectedProjectId]);

  useEffect(() => {
    let cancelled = false;
    setPreviewUrl(null);

    if (!selectedAsset || selectedAsset.status !== "READY") return;

    void getAssetAccess(selectedAsset.id)
      .then((access) => {
        if (!cancelled) setPreviewUrl(access.url);
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : "Could not create preview URL");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedAsset]);

  useEffect(() => {
    let cancelled = false;
    setShots([]);
    if (!selectedAsset || selectedAsset.type !== "VIDEO" || selectedAsset.status !== "READY") return;

    void listAssetShots(selectedAsset.id)
      .then((nextShots) => {
        if (!cancelled) setShots(nextShots);
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : "Could not load shots");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedAsset?.id, selectedAsset?.type, selectedAsset?.status]);

  useEffect(() => {
    if (!activeJob || !isActiveJob(activeJob)) return;

    let cancelled = false;
    const timer = window.setInterval(() => {
      void getJob(activeJob.id)
        .then(async (job) => {
          if (cancelled) return;
          setActiveJob(job);
          if (job.state === "SUCCEEDED" && selectedProjectId) {
            if (job.type === "keyframe-extraction") {
              const assetIds = Array.isArray(job.result.asset_ids)
                ? job.result.asset_ids.filter((value): value is string => typeof value === "string")
                : [];
              await refreshAssets(selectedProjectId, assetIds[0]);
            } else {
              await refreshAssets(selectedProjectId);
              if (job.input_asset_id) {
                setShots(await listAssetShots(job.input_asset_id));
              }
            }
          }
        })
        .catch((cause: unknown) => {
          if (!cancelled) {
            setError(cause instanceof Error ? cause.message : "Could not refresh job");
          }
        });
    }, 1000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [activeJob?.id, activeJob?.state, selectedProjectId]);

  async function handleCreateProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = newProjectName.trim();
    if (!name || isCreatingProject) return;

    setIsCreatingProject(true);
    setError(null);
    try {
      const project = await createProject(name);
      setNewProjectName("");
      await refreshProjects(project.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create project");
    } finally {
      setIsCreatingProject(false);
    }
  }

  async function handleFile(file: File) {
    if (!selectedProjectId || isUploading) return;
    if (!file.type.startsWith("video/") && !file.name.toLowerCase().match(/\.(mp4|mov|mkv|webm|avi|m4v)$/)) {
      setError("Choose a video file for this P0 upload flow.");
      return;
    }

    setIsUploading(true);
    setUploadProgress(null);
    setError(null);

    try {
      const asset = await uploadVideo(selectedProjectId, file, setUploadProgress);
      await refreshAssets(selectedProjectId, asset.id);
      setSelectedAsset(asset);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Upload failed");
    } finally {
      setIsUploading(false);
    }
  }

  async function handleExtractKeyframes() {
    if (!selectedAsset || selectedAsset.type !== "VIDEO" || selectedAsset.status !== "READY") return;
    if (isActiveJob(activeJob)) return;

    setError(null);
    try {
      setActiveJob(await createKeyframeJob(selectedAsset.id, 8));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create keyframe job");
    }
  }

  async function handleAnalyzeVideo() {
    if (!selectedAsset || selectedAsset.type !== "VIDEO" || selectedAsset.status !== "READY") return;
    if (isActiveJob(activeJob)) return;

    setError(null);
    try {
      setActiveJob(await createVideoAnalysisJob(selectedAsset.id, 10));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create video analysis job");
    }
  }

  async function handleClearAnalysisOutputs() {
    if (!cleanupSourceAssetId || !selectedProjectId) return;
    if (isActiveJob(activeJob) || isClearingAnalysis) return;
    if (!window.confirm("Clear generated shot frames and analysis outputs for this video? The source video and extracted keyframes are kept.")) {
      return;
    }

    const sourceAssetId = cleanupSourceAssetId;
    setIsClearingAnalysis(true);
    setError(null);
    try {
      await clearVideoAnalysisOutputs(sourceAssetId);
      setShots([]);
      setActiveJob(null);
      await refreshAssets(selectedProjectId, sourceAssetId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not clear analysis outputs");
    } finally {
      setIsClearingAnalysis(false);
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) void handleFile(file);
  }

  function selectShotRepresentative(shot: Shot) {
    if (!shot.representative_asset_id) return;
    const representative = assets.find((asset) => asset.id === shot.representative_asset_id);
    if (representative) setSelectedAsset(representative);
  }

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand">VideoWeave</div>
        <nav>
          {navigation.map(([label, href]) => (
            <Link className={label === "Projects" ? "navItem active" : "navItem"} href={href} key={label}>
              {label}
            </Link>
          ))}
          {["Assets", "Generate", "Replication", "Storyboard", "Jobs", "Results", "Models", "Workflows", "Settings"].map(
            (item) => (
              <span className="navItem navItemDisabled" key={item}>{item}</span>
            ),
          )}
        </nav>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">P0 · REAL DATA</p>
            <h1>Projects & Assets</h1>
          </div>
          <div className="status">{projects.length} projects · {assets.length} assets</div>
        </header>

        {error ? <div className="errorBanner">{error}</div> : null}

        <section className="projectLayout">
          <aside className="projectRail panel">
            <div className="sectionTitle compact">
              <div>
                <p className="eyebrow">PROJECTS</p>
                <h2>Your workspaces</h2>
              </div>
            </div>

            <form className="newProjectForm" onSubmit={handleCreateProject}>
              <input
                aria-label="Project name"
                onChange={(event) => setNewProjectName(event.target.value)}
                placeholder="New project name"
                value={newProjectName}
              />
              <button className="primary" disabled={isCreatingProject || !newProjectName.trim()} type="submit">
                {isCreatingProject ? "Creating…" : "Create"}
              </button>
            </form>

            <div className="projectList">
              {projects.map((project) => (
                <button
                  className={project.id === selectedProjectId ? "projectItem active" : "projectItem"}
                  key={project.id}
                  onClick={() => setSelectedProjectId(project.id)}
                  type="button"
                >
                  <strong>{project.name}</strong>
                  <span>{new Date(project.created_at).toLocaleDateString()}</span>
                </button>
              ))}
              {projects.length === 0 ? <p className="muted small">Create the first project to upload media.</p> : null}
            </div>
          </aside>

          <div className="assetArea">
            <section
              className={isDragging ? "uploadZone panel dragging" : "uploadZone panel"}
              onDragEnter={(event) => { event.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={handleDrop}
            >
              <div>
                <p className="eyebrow">DIRECT TO S3</p>
                <h2>{selectedProject ? `Upload to ${selectedProject.name}` : "Select a project"}</h2>
                <p className="muted">
                  Video parts go directly from the browser to S3/MinIO. The API only signs and finalizes the upload.
                </p>
              </div>
              <input
                accept="video/*,.mkv,.m4v"
                hidden
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void handleFile(file);
                  event.target.value = "";
                }}
                ref={fileInputRef}
                type="file"
              />
              <button
                className="primary"
                disabled={!selectedProjectId || isUploading}
                onClick={() => fileInputRef.current?.click()}
                type="button"
              >
                {isUploading ? "Uploading…" : "Choose video"}
              </button>
            </section>

            {uploadProgress ? (
              <section className="uploadProgress panel">
                <div className="progressHeader">
                  <div>
                    <strong>{uploadProgress.percent}% uploaded</strong>
                    <span className="muted small">
                      {formatBytes(uploadProgress.uploadedBytes)} / {formatBytes(uploadProgress.totalBytes)}
                    </span>
                  </div>
                  <span className="status">
                    {uploadProgress.resumed ? "Resumed · " : ""}
                    part {Math.max(uploadProgress.partNumber, 1)}/{uploadProgress.totalParts}
                  </span>
                </div>
                <div className="progressTrack"><div style={{ width: `${uploadProgress.percent}%` }} /></div>
              </section>
            ) : null}

            <section>
              <div className="sectionTitle">
                <div>
                  <p className="eyebrow">ASSETS</p>
                  <h2>{selectedProject ? selectedProject.name : "No project selected"}</h2>
                </div>
                <span className="muted">{assets.length} media assets</span>
              </div>

              <div className="assetGrid">
                {assets.map((asset) => (
                  <button
                    className={selectedAsset?.id === asset.id ? "assetCard active" : "assetCard"}
                    key={asset.id}
                    onClick={() => setSelectedAsset(asset)}
                    type="button"
                  >
                    <div className="assetPreviewPlaceholder">
                      <span>{asset.type}</span>
                    </div>
                    <div className="assetCardBody">
                      <strong title={asset.filename}>{asset.filename}</strong>
                      <span>{assetSummary(asset)}</span>
                      <div className="assetCardFooter">
                        <span>{formatBytes(asset.size)}</span>
                        <span className={`assetStatus ${asset.status.toLowerCase()}`}>{asset.status}</span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              {selectedProject && assets.length === 0 ? (
                <div className="emptyState panel">
                  <h3>No assets yet</h3>
                  <p className="muted">Drop a video above. This is now connected to the real multipart upload API.</p>
                </div>
              ) : null}
            </section>
          </div>
        </section>
      </section>

      <aside className="inspector assetInspector">
        <p className="eyebrow">ASSET INSPECTOR</p>
        {selectedAsset ? (
          <>
            <h2>{selectedAsset.filename}</h2>
            <div className="videoPreview">
              {previewUrl && selectedAsset.type === "VIDEO" ? (
                <video controls key={previewUrl} preload="metadata" src={previewUrl} />
              ) : previewUrl && selectedAsset.type === "IMAGE" ? (
                <img
                  alt={selectedAsset.filename}
                  src={previewUrl}
                  style={{ display: "block", maxHeight: 360, objectFit: "contain", width: "100%" }}
                />
              ) : previewUrl && selectedAsset.type === "ANALYSIS" ? (
                <a className="primary" href={previewUrl} rel="noreferrer" target="_blank">Open analysis JSON</a>
              ) : (
                <div className="previewLoading">{selectedAsset.status === "READY" ? "Loading preview…" : selectedAsset.status}</div>
              )}
            </div>
            <dl>
              <div><dt>Status</dt><dd>{selectedAsset.status}</dd></div>
              <div><dt>Type</dt><dd>{selectedAsset.type}</dd></div>
              <div><dt>Size</dt><dd>{formatBytes(selectedAsset.size)}</dd></div>
              <div><dt>Resolution</dt><dd>{selectedAsset.width && selectedAsset.height ? `${selectedAsset.width}×${selectedAsset.height}` : "—"}</dd></div>
              <div><dt>Duration</dt><dd>{formatDuration(selectedAsset.duration)}</dd></div>
              <div><dt>FPS</dt><dd>{selectedAsset.fps?.toFixed(3) ?? "—"}</dd></div>
              <div><dt>Video codec</dt><dd>{selectedAsset.codec ?? "—"}</dd></div>
              <div><dt>Audio codec</dt><dd>{selectedAsset.audio_codec ?? "—"}</dd></div>
              <div><dt>Frames</dt><dd>{selectedAsset.frame_count ?? "—"}</dd></div>
            </dl>

            {selectedAsset.type === "VIDEO" && selectedAsset.status === "READY" ? (
              <div className="grid gap-2">
                <Button
                  className="w-full justify-start"
                  disabled={isActiveJob(activeJob) || isClearingAnalysis}
                  onClick={() => void handleAnalyzeVideo()}
                  type="button"
                >
                  <ScanSearch />
                  {isActiveJob(activeJob) && activeJob?.type === "video-analysis" ? "Analyzing video…" : "Analyze video structure"}
                </Button>
                <Button
                  className="w-full justify-start"
                  disabled={isActiveJob(activeJob) || isClearingAnalysis}
                  onClick={() => void handleExtractKeyframes()}
                  type="button"
                  variant="secondary"
                >
                  <Images />
                  {isActiveJob(activeJob) && activeJob?.type === "keyframe-extraction" ? "Extracting keyframes…" : "Extract 8 keyframes"}
                </Button>
              </div>
            ) : null}

            {cleanupSourceAssetId ? (
              <div className="mt-2 grid gap-1">
                <Button
                  className="w-full justify-start"
                  disabled={isActiveJob(activeJob) || isClearingAnalysis}
                  onClick={() => void handleClearAnalysisOutputs()}
                  type="button"
                  variant="destructive"
                >
                  <Trash2 />
                  {isClearingAnalysis ? "Clearing analysis outputs…" : "Clear analysis outputs"}
                </Button>
                <p className="mb-0 px-1 text-xs text-red-300/80">
                  Deletes generated shot frames and analysis JSON. Source video and extracted keyframes stay.
                </p>
              </div>
            ) : null}

            {activeJob && activeJob.input_asset_id === selectedAsset.id ? (
              <div className="uploadProgress panel" style={{ marginTop: 14 }}>
                <div className="progressHeader">
                  <div>
                    <strong>{activeJob.state}</strong>
                    <span className="muted small">{activeJob.stage ?? activeJob.type}</span>
                  </div>
                  <span className="status">{Math.round(activeJob.progress * 100)}%</span>
                </div>
                <div className="progressTrack">
                  <div style={{ width: `${Math.round(activeJob.progress * 100)}%` }} />
                </div>
                {activeJob.error ? <p className="errorText small">{activeJob.error}</p> : null}
              </div>
            ) : null}

            {selectedAsset.type === "VIDEO" && shots.length > 0 ? (
              <section style={{ marginTop: 18 }}>
                <p className="eyebrow">LATEST SHOT ANALYSIS · {shots.length} SHOTS</p>
                <div style={{ display: "grid", gap: 6 }}>
                  {shots.map((shot) => (
                    <button
                      className="projectItem"
                      key={shot.id}
                      onClick={() => selectShotRepresentative(shot)}
                      type="button"
                    >
                      <strong>Shot {shot.index}</strong>
                      <span>{shot.start_time.toFixed(2)}s → {shot.end_time.toFixed(2)}s · {formatDuration(shot.duration)}</span>
                    </button>
                  ))}
                </div>
              </section>
            ) : null}

            {typeof selectedAsset.metadata.probe_error === "string" ? (
              <p className="errorText small">ffprobe: {selectedAsset.metadata.probe_error}</p>
            ) : null}
          </>
        ) : (
          <>
            <h2>No asset selected</h2>
            <p className="muted small">Upload or select an asset to inspect its video preview and metadata.</p>
          </>
        )}
      </aside>
    </main>
  );
}
