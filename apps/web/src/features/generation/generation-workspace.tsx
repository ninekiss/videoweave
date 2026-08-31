"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Image as ImageIcon,
  Sparkles,
  SquarePlay,
  WandSparkles,
} from "lucide-react";
import type {
  GenerationCapability,
  Job,
  MediaAsset,
  Project,
} from "@videoweave/contracts";

import { AppShell } from "@/components/app-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  createGeneration,
  getAsset,
  getAssetAccess,
  getJob,
  listProjectAssets,
  listProjects,
} from "@/lib/api";

function isActive(job: Job | null): boolean {
  return job?.state === "QUEUED" || job?.state === "RUNNING";
}

function outputAssetId(job: Job): string | null {
  const value = job.result.output_asset_id;
  return typeof value === "string" ? value : null;
}

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

export function GenerationWorkspace() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [capability, setCapability] = useState<GenerationCapability>("text-to-video");
  const [inputAssetId, setInputAssetId] = useState("");
  const [inputPreviewUrl, setInputPreviewUrl] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [negativePrompt, setNegativePrompt] = useState("");
  const [seed, setSeed] = useState("");
  const [job, setJob] = useState<Job | null>(null);
  const [outputAsset, setOutputAsset] = useState<MediaAsset | null>(null);
  const [outputUrl, setOutputUrl] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const readyImages = useMemo(
    () => assets.filter((asset) => asset.type === "IMAGE" && asset.status === "READY"),
    [assets],
  );
  const selectedInput = readyImages.find((asset) => asset.id === inputAssetId) ?? null;
  const selectedProject = projects.find((project) => project.id === projectId) ?? null;
  const generationActive = isSubmitting || isActive(job);

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
      setInputAssetId("");
      return;
    }

    setError(null);
    void listProjectAssets(projectId)
      .then((items) => {
        setAssets(items);
        const firstReadyImage = items.find((asset) => asset.type === "IMAGE" && asset.status === "READY");
        setInputAssetId((current) => {
          if (current && items.some((asset) => asset.id === current && asset.type === "IMAGE" && asset.status === "READY")) {
            return current;
          }
          return firstReadyImage?.id ?? "";
        });
      })
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not load project assets"));
  }, [projectId]);

  useEffect(() => {
    if (capability === "text-to-video") {
      setInputPreviewUrl(null);
      return;
    }
    if (!inputAssetId) {
      setInputPreviewUrl(null);
      return;
    }

    let cancelled = false;
    setInputPreviewUrl(null);
    void getAssetAccess(inputAssetId)
      .then((access) => {
        if (!cancelled) setInputPreviewUrl(access.url);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Could not load reference image");
      });

    return () => {
      cancelled = true;
    };
  }, [capability, inputAssetId]);

  useEffect(() => {
    if (!job || !isActive(job)) return;

    let cancelled = false;
    const timer = window.setInterval(() => {
      void getJob(job.id)
        .then(async (nextJob) => {
          if (cancelled) return;
          setJob(nextJob);
          if (nextJob.state !== "SUCCEEDED") return;

          const assetId = outputAssetId(nextJob);
          if (!assetId) {
            setError("Generation succeeded but returned no output asset.");
            return;
          }

          const [asset, access] = await Promise.all([getAsset(assetId), getAssetAccess(assetId)]);
          if (cancelled) return;
          setOutputAsset(asset);
          setOutputUrl(access.url);
        })
        .catch((cause: unknown) => {
          if (!cancelled) setError(cause instanceof Error ? cause.message : "Could not refresh generation job");
        });
    }, 1000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [job?.id, job?.state]);

  async function handleGenerate() {
    if (!projectId || generationActive) return;
    const cleanPrompt = prompt.trim();
    if (!cleanPrompt) {
      setError("Prompt is required.");
      return;
    }
    if (capability === "image-to-video" && !inputAssetId) {
      setError("Choose a READY image for image-to-video.");
      return;
    }

    let seedValue: number | undefined;
    const cleanSeed = seed.trim();
    if (cleanSeed) {
      const parsed = Number(cleanSeed);
      if (!Number.isSafeInteger(parsed) || parsed < 0) {
        setError("Seed must be a non-negative safe integer.");
        return;
      }
      seedValue = parsed;
    }

    setIsSubmitting(true);
    setError(null);
    setOutputAsset(null);
    setOutputUrl(null);
    try {
      const created = await createGeneration(projectId, {
        capability,
        prompt: cleanPrompt,
        input_asset_id: capability === "image-to-video" ? inputAssetId : null,
        negative_prompt: negativePrompt.trim() || null,
        seed: seedValue,
        parameters: {},
      });
      setJob(created);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create generation job");
    } finally {
      setIsSubmitting(false);
    }
  }

  const inspector = (
    <div className="space-y-5">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Generation inspector</p>
        <h2 className="mt-1 text-lg font-semibold tracking-tight">Capability-first execution</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          VideoWeave resolves the registered workflow and model automatically. ComfyUI details stay behind the execution adapter.
        </p>
      </div>

      <Card>
        <CardContent className="space-y-3 p-4 text-sm">
          <div className="flex items-center justify-between gap-4"><span className="text-muted-foreground">Project</span><span className="truncate text-right">{selectedProject?.name ?? "—"}</span></div>
          <Separator />
          <div className="flex items-center justify-between gap-4"><span className="text-muted-foreground">Capability</span><Badge variant="secondary">{capability}</Badge></div>
          <Separator />
          <div className="flex items-center justify-between gap-4"><span className="text-muted-foreground">Reference</span><span className="truncate text-right">{capability === "image-to-video" ? selectedInput?.filename ?? "—" : "Not required"}</span></div>
        </CardContent>
      </Card>

      {job ? (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-3">
              <div><CardTitle className="text-base">Generation job</CardTitle><CardDescription className="mt-1">{job.stage ?? job.type}</CardDescription></div>
              <Badge variant={job.state === "SUCCEEDED" ? "success" : job.state === "FAILED" ? "destructive" : "outline"}>{job.state}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <Progress value={job.progress * 100} />
            <div className="flex items-center justify-between text-xs text-muted-foreground"><span>{Math.round(job.progress * 100)}%</span><span>{job.worker_id ?? "Waiting for worker"}</span></div>
            {typeof job.spec.seed === "number" ? <div className="text-xs text-muted-foreground">Seed {String(job.spec.seed)}</div> : null}
            {job.error ? <Alert><AlertTitle>Generation failed</AlertTitle><AlertDescription>{job.error}</AlertDescription></Alert> : null}
          </CardContent>
        </Card>
      ) : null}

      {outputAsset ? (
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Output asset</CardTitle><CardDescription>{outputAsset.filename}</CardDescription></CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <div>{outputAsset.width && outputAsset.height ? `${outputAsset.width}×${outputAsset.height}` : "Unknown resolution"}</div>
            <div>{outputAsset.duration != null ? `${outputAsset.duration.toFixed(2)}s` : "Unknown duration"} · {formatBytes(outputAsset.size)}</div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );

  return (
    <AppShell active="generate" eyebrow="GENERATION · P0" inspector={inspector} status="T2V · I2V" title="Generate">
      <div className="space-y-5">
        {error ? <Alert><AlertTitle>Generation unavailable</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}

        <Card>
          <CardContent className="grid gap-4 p-5 md:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="generation-project">Project</Label>
              <Select disabled={projects.length === 0 || generationActive} onValueChange={setProjectId} value={projectId || undefined}>
                <SelectTrigger className="w-full" id="generation-project"><SelectValue placeholder="Select project" /></SelectTrigger>
                <SelectContent>
                  {projects.map((project) => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="generation-capability">Capability</Label>
              <Select disabled={generationActive} onValueChange={(value) => setCapability(value as GenerationCapability)} value={capability}>
                <SelectTrigger className="w-full" id="generation-capability"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="text-to-video">Text to video</SelectItem>
                  <SelectItem value="image-to-video">Image to video</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {capability === "image-to-video" ? (
          <Card>
            <CardHeader><CardTitle className="text-lg">Reference image</CardTitle><CardDescription>Select a READY IMAGE asset from the active project.</CardDescription></CardHeader>
            <CardContent className="grid gap-5 md:grid-cols-[minmax(220px,360px)_minmax(0,1fr)]">
              <div className="grid gap-2 self-start">
                <Label htmlFor="generation-input-image">Input image</Label>
                <Select disabled={readyImages.length === 0 || generationActive} onValueChange={setInputAssetId} value={inputAssetId || undefined}>
                  <SelectTrigger className="w-full" id="generation-input-image"><SelectValue placeholder="Select image" /></SelectTrigger>
                  <SelectContent>
                    {readyImages.map((asset) => <SelectItem key={asset.id} value={asset.id}>{asset.filename}</SelectItem>)}
                  </SelectContent>
                </Select>
                {readyImages.length === 0 ? <p className="text-xs leading-5 text-muted-foreground">This project has no READY image asset yet. Extract a keyframe or shot representative in Projects first.</p> : null}
              </div>
              <div className="grid aspect-video place-items-center overflow-hidden rounded-xl border bg-black/70">
                {inputPreviewUrl ? <img alt={selectedInput?.filename ?? "Reference image"} className="h-full w-full object-contain" src={inputPreviewUrl} /> : <div className="grid place-items-center gap-2 text-sm text-muted-foreground"><ImageIcon className="size-7" /><span>Select a reference image</span></div>}
              </div>
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader><CardTitle className="text-lg">Prompt</CardTitle><CardDescription>Describe the video intent. Workflow/model selection stays automatic.</CardDescription></CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-2">
              <Label htmlFor="generation-prompt">Prompt</Label>
              <Textarea disabled={generationActive} id="generation-prompt" onChange={(event) => setPrompt(event.target.value)} placeholder="A slow cinematic push toward a misty mountain lake at sunrise…" rows={6} value={prompt} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="generation-negative-prompt">Negative prompt <span className="font-normal text-muted-foreground">optional</span></Label>
              <Textarea disabled={generationActive} id="generation-negative-prompt" onChange={(event) => setNegativePrompt(event.target.value)} placeholder="Artifacts, unstable motion…" rows={3} value={negativePrompt} />
            </div>
            <div className="grid gap-2 sm:max-w-xs">
              <Label htmlFor="generation-seed">Seed <span className="font-normal text-muted-foreground">optional</span></Label>
              <Input disabled={generationActive} id="generation-seed" inputMode="numeric" onChange={(event) => setSeed(event.target.value)} placeholder="Auto" value={seed} />
              <p className="text-xs text-muted-foreground">Leave blank to generate and freeze a seed in the Job snapshot.</p>
            </div>
            <Button className="w-full sm:w-auto" disabled={!projectId || !prompt.trim() || (capability === "image-to-video" && !inputAssetId) || generationActive} onClick={() => void handleGenerate()} size="lg">
              <WandSparkles /> {generationActive ? "Generating…" : "Generate video"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between gap-4">
            <div><CardTitle className="text-lg">Result</CardTitle><CardDescription>Generated video is registered as a normal VideoWeave Asset.</CardDescription></div>
            {outputAsset ? <Badge variant="success">READY</Badge> : null}
          </CardHeader>
          <CardContent>
            <div className="grid aspect-video place-items-center overflow-hidden rounded-xl border bg-black/70">
              {outputUrl ? (
                <video className="h-full w-full object-contain" controls key={outputUrl} preload="metadata" src={outputUrl} />
              ) : (
                <div className="grid max-w-sm place-items-center gap-3 px-6 text-center text-sm text-muted-foreground">
                  {isActive(job) ? <Sparkles className="size-7 animate-pulse" /> : <SquarePlay className="size-7" />}
                  <span>{isActive(job) ? "ComfyUI is generating the video. Job progress is visible in the inspector." : "Run a generation to preview the output here."}</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
