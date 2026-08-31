"use client";

import type { DragEvent, FormEvent } from "react";
import { useEffect, useRef, useState } from "react";
import {
  FileJson,
  Film,
  Image as ImageIcon,
  Images,
  Plus,
  ScanSearch,
  Trash2,
  Upload,
} from "lucide-react";
import type { Job, MediaAsset, Project, Shot } from "@videoweave/contracts";

import { AppShell } from "@/components/app-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
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
import { cn } from "@/lib/utils";

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
  return metadataSourceAssetId(asset.metadata.analysis) ?? metadataSourceAssetId(asset.metadata.shot_representative);
}

function assetStatusVariant(status: MediaAsset["status"]): "success" | "warning" | "destructive" | "outline" {
  if (status === "READY") return "success";
  if (status === "UPLOADING" || status === "PROCESSING") return "warning";
  if (status === "FAILED" || status === "CANCELLED") return "destructive";
  return "outline";
}

function assetIcon(asset: MediaAsset) {
  if (asset.type === "VIDEO") return Film;
  if (asset.type === "ANALYSIS") return FileJson;
  return ImageIcon;
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
      if (preferredProjectId && nextProjects.some((project) => project.id === preferredProjectId)) return preferredProjectId;
      if (current && nextProjects.some((project) => project.id === current)) return current;
      return nextProjects[0]?.id ?? null;
    });
  }

  async function refreshAssets(projectId: string, preferredAssetId?: string) {
    const nextAssets = await listProjectAssets(projectId);
    setAssets(nextAssets);
    setSelectedAsset((current) => {
      if (preferredAssetId) return nextAssets.find((asset) => asset.id === preferredAssetId) ?? current;
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
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Could not create preview URL");
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
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Could not load shots");
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
              if (job.input_asset_id) setShots(await listAssetShots(job.input_asset_id));
            }
          }
        })
        .catch((cause: unknown) => {
          if (!cancelled) setError(cause instanceof Error ? cause.message : "Could not refresh job");
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
    if (!selectedAsset || selectedAsset.type !== "VIDEO" || selectedAsset.status !== "READY" || isActiveJob(activeJob)) return;
    setError(null);
    try {
      setActiveJob(await createKeyframeJob(selectedAsset.id, 8));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create keyframe job");
    }
  }

  async function handleAnalyzeVideo() {
    if (!selectedAsset || selectedAsset.type !== "VIDEO" || selectedAsset.status !== "READY" || isActiveJob(activeJob)) return;
    setError(null);
    try {
      setActiveJob(await createVideoAnalysisJob(selectedAsset.id, 10));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create video analysis job");
    }
  }

  async function handleClearAnalysisOutputs() {
    if (!cleanupSourceAssetId || !selectedProjectId || isActiveJob(activeJob) || isClearingAnalysis) return;
    if (!window.confirm("Clear generated shot frames and analysis outputs for this video? The source video and extracted keyframes are kept.")) return;

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

  const inspector = selectedAsset ? (
    <div className="space-y-5">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Asset inspector</p>
        <h2 className="mt-1 break-words text-lg font-semibold tracking-tight">{selectedAsset.filename}</h2>
      </div>

      <div className="grid aspect-video place-items-center overflow-hidden rounded-xl border bg-black/70">
        {previewUrl && selectedAsset.type === "VIDEO" ? (
          <video className="h-full w-full object-contain" controls key={previewUrl} preload="metadata" src={previewUrl} />
        ) : previewUrl && selectedAsset.type === "IMAGE" ? (
          <img alt={selectedAsset.filename} className="h-full w-full object-contain" src={previewUrl} />
        ) : previewUrl && selectedAsset.type === "ANALYSIS" ? (
          <Button asChild variant="secondary"><a href={previewUrl} rel="noreferrer" target="_blank"><FileJson /> Open analysis JSON</a></Button>
        ) : (
          <span className="text-sm text-muted-foreground">{selectedAsset.status === "READY" ? "Loading preview…" : selectedAsset.status}</span>
        )}
      </div>

      <div className="space-y-2 text-sm">
        {[
          ["Status", selectedAsset.status],
          ["Type", selectedAsset.type],
          ["Size", formatBytes(selectedAsset.size)],
          ["Resolution", selectedAsset.width && selectedAsset.height ? `${selectedAsset.width}×${selectedAsset.height}` : "—"],
          ["Duration", formatDuration(selectedAsset.duration)],
          ["FPS", selectedAsset.fps?.toFixed(3) ?? "—"],
          ["Video codec", selectedAsset.codec ?? "—"],
          ["Audio codec", selectedAsset.audio_codec ?? "—"],
          ["Frames", selectedAsset.frame_count ?? "—"],
        ].map(([label, value], index) => (
          <div key={String(label)}>
            {index > 0 ? <Separator className="mb-2" /> : null}
            <div className="flex items-start justify-between gap-4">
              <span className="text-muted-foreground">{label}</span>
              <span className="max-w-[60%] break-words text-right">{value}</span>
            </div>
          </div>
        ))}
      </div>

      {selectedAsset.type === "VIDEO" && selectedAsset.status === "READY" ? (
        <div className="grid gap-2">
          <Button className="w-full justify-start" disabled={isActiveJob(activeJob) || isClearingAnalysis} onClick={() => void handleAnalyzeVideo()}>
            <ScanSearch />
            {isActiveJob(activeJob) && activeJob?.type === "video-analysis" ? "Analyzing video…" : "Analyze video structure"}
          </Button>
          <Button className="w-full justify-start" disabled={isActiveJob(activeJob) || isClearingAnalysis} onClick={() => void handleExtractKeyframes()} variant="secondary">
            <Images />
            {isActiveJob(activeJob) && activeJob?.type === "keyframe-extraction" ? "Extracting keyframes…" : "Extract 8 keyframes"}
          </Button>
        </div>
      ) : null}

      {cleanupSourceAssetId ? (
        <div className="space-y-2">
          <Button className="w-full justify-start" disabled={isActiveJob(activeJob) || isClearingAnalysis} onClick={() => void handleClearAnalysisOutputs()} variant="destructive">
            <Trash2 /> {isClearingAnalysis ? "Clearing analysis outputs…" : "Clear analysis outputs"}
          </Button>
          <p className="text-xs leading-5 text-red-300/80">Deletes generated shot frames and analysis JSON. Source video and extracted keyframes stay.</p>
        </div>
      ) : null}

      {activeJob && activeJob.input_asset_id === selectedAsset.id ? (
        <Card>
          <CardContent className="space-y-3 p-4">
            <div className="flex items-start justify-between gap-3 text-sm">
              <div><div className="font-medium">{activeJob.state}</div><div className="text-xs text-muted-foreground">{activeJob.stage ?? activeJob.type}</div></div>
              <Badge variant="outline">{Math.round(activeJob.progress * 100)}%</Badge>
            </div>
            <Progress value={activeJob.progress * 100} />
            {activeJob.error ? <p className="text-xs leading-5 text-red-300">{activeJob.error}</p> : null}
          </CardContent>
        </Card>
      ) : null}

      {selectedAsset.type === "VIDEO" && shots.length > 0 ? (
        <section className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Latest shot analysis</p>
            <Badge variant="secondary">{shots.length} shots</Badge>
          </div>
          <div className="grid max-h-72 gap-1 overflow-y-auto pr-1">
            {shots.map((shot) => (
              <Button className="h-auto justify-start whitespace-normal px-3 py-2 text-left" key={shot.id} onClick={() => selectShotRepresentative(shot)} variant="ghost">
                <span><span className="block font-medium">Shot {shot.index}</span><span className="block text-xs text-muted-foreground">{shot.start_time.toFixed(2)}s → {shot.end_time.toFixed(2)}s · {formatDuration(shot.duration)}</span></span>
              </Button>
            ))}
          </div>
        </section>
      ) : null}

      {typeof selectedAsset.metadata.probe_error === "string" ? <p className="text-xs leading-5 text-red-300">ffprobe: {selectedAsset.metadata.probe_error}</p> : null}
    </div>
  ) : (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Asset inspector</p>
      <h2 className="mt-1 text-lg font-semibold">No asset selected</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">Upload or select an asset to inspect its preview and metadata.</p>
    </div>
  );

  return (
    <AppShell
      active="projects"
      eyebrow="P0 · REAL DATA"
      inspector={inspector}
      status={`${projects.length} projects · ${assets.length} assets`}
      title="Projects & Assets"
    >
      <div className="space-y-5">
        {error ? <Alert><AlertTitle>Request failed</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}

        <div className="grid gap-5 lg:grid-cols-[240px_minmax(0,1fr)]">
          <Card className="h-fit lg:sticky lg:top-6">
            <CardHeader>
              <CardTitle className="text-base">Projects</CardTitle>
              <CardDescription>Create a workspace or switch the active project.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <form className="flex gap-2" onSubmit={handleCreateProject}>
                <Input aria-label="Project name" onChange={(event) => setNewProjectName(event.target.value)} placeholder="New project" value={newProjectName} />
                <Button aria-label="Create project" disabled={isCreatingProject || !newProjectName.trim()} size="icon" type="submit"><Plus /></Button>
              </form>

              <div className="grid gap-1">
                {projects.map((project) => (
                  <Button
                    className="h-auto w-full justify-start whitespace-normal px-3 py-2 text-left"
                    key={project.id}
                    onClick={() => setSelectedProjectId(project.id)}
                    variant={project.id === selectedProjectId ? "secondary" : "ghost"}
                  >
                    <span className="min-w-0"><span className="block truncate font-medium">{project.name}</span><span className="block text-xs text-muted-foreground">{new Date(project.created_at).toLocaleDateString()}</span></span>
                  </Button>
                ))}
                {projects.length === 0 ? <p className="py-3 text-sm text-muted-foreground">Create the first project to upload media.</p> : null}
              </div>
            </CardContent>
          </Card>

          <div className="min-w-0 space-y-5">
            <Card
              className={cn("border-dashed transition-colors", isDragging && "border-ring bg-accent/25")}
              onDragEnter={(event) => { event.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={handleDrop}
            >
              <CardContent className="flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="mb-3 grid size-10 place-items-center rounded-lg bg-secondary"><Upload className="size-5" /></div>
                  <CardTitle className="text-lg">{selectedProject ? `Upload to ${selectedProject.name}` : "Select a project"}</CardTitle>
                  <CardDescription className="mt-2 max-w-2xl">Video parts go directly from the browser to S3/MinIO. The API only signs and finalizes the multipart upload.</CardDescription>
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
                <Button disabled={!selectedProjectId || isUploading} onClick={() => fileInputRef.current?.click()}>
                  <Upload /> {isUploading ? "Uploading…" : "Choose video"}
                </Button>
              </CardContent>
            </Card>

            {uploadProgress ? (
              <Card>
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-4 text-sm">
                    <div><div className="font-medium">{uploadProgress.percent}% uploaded</div><div className="text-xs text-muted-foreground">{formatBytes(uploadProgress.uploadedBytes)} / {formatBytes(uploadProgress.totalBytes)}</div></div>
                    <Badge variant="outline">{uploadProgress.resumed ? "Resumed · " : ""}part {Math.max(uploadProgress.partNumber, 1)}/{uploadProgress.totalParts}</Badge>
                  </div>
                  <Progress value={uploadProgress.percent} />
                </CardContent>
              </Card>
            ) : null}

            <section>
              <div className="mb-4 flex items-end justify-between gap-4">
                <div><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Assets</p><h2 className="mt-1 text-xl font-semibold tracking-tight">{selectedProject ? selectedProject.name : "No project selected"}</h2></div>
                <Badge variant="outline">{assets.length} media assets</Badge>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
                {assets.map((asset) => {
                  const Icon = assetIcon(asset);
                  const selected = selectedAsset?.id === asset.id;
                  return (
                    <button
                      className={cn("overflow-hidden rounded-xl border bg-card text-left shadow-sm transition-colors hover:border-ring/60 hover:bg-accent/20", selected && "border-ring bg-accent/25")}
                      key={asset.id}
                      onClick={() => setSelectedAsset(asset)}
                      type="button"
                    >
                      <div className="grid aspect-video place-items-center border-b bg-black/20 text-muted-foreground"><Icon className="size-7" /></div>
                      <div className="space-y-3 p-4">
                        <div><div className="truncate text-sm font-medium" title={asset.filename}>{asset.filename}</div><div className="mt-1 text-xs text-muted-foreground">{assetSummary(asset)}</div></div>
                        <div className="flex items-center justify-between gap-3"><span className="text-xs text-muted-foreground">{formatBytes(asset.size)}</span><Badge variant={assetStatusVariant(asset.status)}>{asset.status}</Badge></div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {selectedProject && assets.length === 0 ? (
                <Card className="border-dashed"><CardContent className="py-12 text-center"><ImageIcon className="mx-auto size-7 text-muted-foreground" /><h3 className="mt-3 font-medium">No assets yet</h3><p className="mt-1 text-sm text-muted-foreground">Drop a video above to start the real multipart upload flow.</p></CardContent></Card>
              ) : null}
            </section>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
