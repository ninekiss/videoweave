"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Eraser,
  Play,
  ScanSearch,
  SlidersHorizontal,
  X,
} from "lucide-react";
import type { Job, MediaAsset, Project, SceneCandidate, Shot } from "@videoweave/contracts";

import { AppShell } from "@/components/app-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  createSceneCandidateJob,
  createVideoAnalysisJob,
  getAssetAccess,
  getJob,
  listAssetShots,
  listProjectAssets,
  listProjects,
} from "@/lib/api";
import { cn } from "@/lib/utils";

const MIN_SHOT_DURATION = 0.25;
const CUT_PREVIEW_RADIUS = 0.6;

type CandidateReview = "real" | "false";

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

function candidateKey(candidate: SceneCandidate): string {
  return `${candidate.timestamp}:${candidate.score}`;
}

function acceptedCandidates(candidates: SceneCandidate[], duration: number, threshold: number): SceneCandidate[] {
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

function reviewLabel(review: CandidateReview | undefined): string {
  if (review === "real") return "Real cut";
  if (review === "false") return "False positive";
  return "Unreviewed";
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
  const [reviews, setReviews] = useState<Record<string, CandidateReview>>({});
  const [error, setError] = useState<string | null>(null);

  const selectedAsset = assets.find((asset) => asset.id === assetId) ?? null;
  const candidates = useMemo(() => readCandidates(candidateJob), [candidateJob]);
  const selectedCandidate = selectedCandidateIndex == null ? null : candidates[selectedCandidateIndex] ?? null;
  const selectedCandidateReview = selectedCandidate ? reviews[candidateKey(selectedCandidate)] : undefined;
  const floorThreshold = typeof candidateJob?.result.floor_threshold === "number" ? candidateJob.result.floor_threshold : 1;

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
  const acceptedKeys = useMemo(() => new Set(accepted.map(candidateKey)), [accepted]);
  const estimatedShots = selectedAsset && candidateJob?.state === "SUCCEEDED" ? accepted.length + 1 : 0;
  const selectedCandidateAccepted = selectedCandidate ? acceptedKeys.has(candidateKey(selectedCandidate)) : false;

  const reviewStats = useMemo(() => {
    let reviewed = 0;
    let reviewedReal = 0;
    let reviewedFalse = 0;
    let acceptedReviewed = 0;
    let acceptedReal = 0;
    let acceptedFalse = 0;
    let missedReviewedReal = 0;

    for (const candidate of candidates) {
      const key = candidateKey(candidate);
      const review = reviews[key];
      if (!review) continue;
      reviewed += 1;
      if (review === "real") reviewedReal += 1;
      if (review === "false") reviewedFalse += 1;
      if (acceptedKeys.has(key)) {
        acceptedReviewed += 1;
        if (review === "real") acceptedReal += 1;
        if (review === "false") acceptedFalse += 1;
      } else if (review === "real") {
        missedReviewedReal += 1;
      }
    }

    return {
      reviewed,
      reviewedReal,
      reviewedFalse,
      acceptedReviewed,
      acceptedReal,
      acceptedFalse,
      missedReviewedReal,
      precision: acceptedReviewed > 0 ? acceptedReal / acceptedReviewed : null,
    };
  }, [acceptedKeys, candidates, reviews]);

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
    setReviews({});
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
            if (nextCandidates.length > 0) setThreshold(roundThreshold(quantile(nextCandidates.map((candidate) => candidate.score), 0.5)));
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
          if (job.state === "SUCCEEDED" && assetId) setShots(await listAssetShots(assetId));
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
    setReviews({});
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
    const knownDuration = Number.isFinite(video.duration) ? video.duration : selectedAsset?.duration ?? candidate.timestamp + CUT_PREVIEW_RADIUS;
    const start = Math.max(0, candidate.timestamp - CUT_PREVIEW_RADIUS);
    const end = Math.min(knownDuration, candidate.timestamp + CUT_PREVIEW_RADIUS);
    previewEndRef.current = end;
    video.pause();
    video.currentTime = start;
    void video.play().catch(() => undefined);
  }

  function moveCandidate(delta: number) {
    if (candidates.length === 0) return;
    const current = selectedCandidateIndex ?? (delta > 0 ? -1 : candidates.length);
    const next = Math.min(Math.max(current + delta, 0), candidates.length - 1);
    previewCandidate(next);
  }

  function reviewCandidate(review: CandidateReview | null) {
    if (!selectedCandidate) return;
    const key = candidateKey(selectedCandidate);
    setReviews((current) => {
      const next = { ...current };
      if (review) next[key] = review;
      else delete next[key];
      return next;
    });
  }

  function handlePreviewTimeUpdate() {
    const video = videoRef.current;
    const previewEnd = previewEndRef.current;
    if (!video || previewEnd == null || video.currentTime < previewEnd) return;
    video.pause();
    previewEndRef.current = null;
  }

  const inspector = (
    <div className="space-y-5">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3">
            <div><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Adaptive threshold</p><CardTitle className="mt-1 text-2xl">{threshold.toFixed(2)}</CardTitle></div>
            <SlidersHorizontal className="size-5 text-muted-foreground" />
          </div>
          <CardDescription>Developer diagnostics only. Production analysis remains automatic.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <input
            className="w-full accent-white"
            disabled={candidateJob?.state !== "SUCCEEDED" || candidates.length === 0}
            max={sliderMax}
            min={sliderMin}
            onChange={(event) => setThreshold(Number(event.target.value))}
            step={sliderStep}
            type="range"
            value={Math.min(Math.max(threshold, sliderMin), sliderMax)}
          />
          {scoreStats ? <div className="flex justify-between text-xs text-muted-foreground"><span>{sliderMin.toFixed(2)}</span><span>{sliderMax.toFixed(2)}</span></div> : null}

          <div className="grid gap-2">
            {dynamicPresets.map((preset) => {
              const shotCount = selectedAsset ? acceptedCandidates(candidates, selectedAsset.duration ?? 0, preset.value).length + 1 : 0;
              return (
                <Button className="justify-between" key={preset.label} onClick={() => setThreshold(preset.value)} variant={Math.abs(threshold - preset.value) < 0.001 ? "secondary" : "ghost"}>
                  <span>{preset.label}</span><span className="text-xs text-muted-foreground">{preset.value.toFixed(2)} · {shotCount} shots</span>
                </Button>
              );
            })}
          </div>

          <Separator />
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-secondary/60 p-3"><div className="text-2xl font-semibold">{accepted.length}</div><div className="text-xs text-muted-foreground">accepted cuts</div></div>
            <div className="rounded-lg bg-secondary/60 p-3"><div className="text-2xl font-semibold">{estimatedShots}</div><div className="text-xs text-muted-foreground">estimated shots</div></div>
          </div>

          <Button className="w-full" disabled={candidateJob?.state !== "SUCCEEDED" || isActive(analysisJob)} onClick={() => void runAnalysis()}>
            {isActive(analysisJob) ? "Generating shot assets…" : `Analyze at ${threshold.toFixed(2)}`}
          </Button>
        </CardContent>
      </Card>

      {candidateJob?.state === "SUCCEEDED" ? (
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Manual evaluation</CardTitle><CardDescription>Optional detector debugging; never required by the Job pipeline.</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><div className="font-semibold">{reviewStats.reviewed}</div><div className="text-xs text-muted-foreground">reviewed</div></div>
              <div><div className="font-semibold">{reviewStats.missedReviewedReal}</div><div className="text-xs text-muted-foreground">missed real</div></div>
              <div><div className="font-semibold">{reviewStats.acceptedReal}</div><div className="text-xs text-muted-foreground">accepted real</div></div>
              <div><div className="font-semibold">{reviewStats.precision == null ? "—" : `${Math.round(reviewStats.precision * 100)}%`}</div><div className="text-xs text-muted-foreground">reviewed precision</div></div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {analysisJob ? (
        <Card>
          <CardContent className="space-y-3 p-4">
            <div className="flex items-start justify-between gap-3"><div><div className="font-medium">{analysisJob.state}</div><div className="text-xs text-muted-foreground">{analysisJob.stage ?? analysisJob.type}</div></div><Badge variant="outline">{Math.round(analysisJob.progress * 100)}%</Badge></div>
            <Progress value={analysisJob.progress * 100} />
            {analysisJob.error ? <p className="text-xs text-red-300">{analysisJob.error}</p> : null}
          </CardContent>
        </Card>
      ) : null}

      {shots.length > 0 ? (
        <Card>
          <CardHeader className="pb-2"><div className="flex items-center justify-between"><CardTitle className="text-base">Confirmed shots</CardTitle><Badge variant="secondary">{shots.length}</Badge></div></CardHeader>
          <CardContent className="max-h-72 space-y-2 overflow-y-auto">
            {shots.map((shot, index) => <div key={shot.id}>{index > 0 ? <Separator className="mb-2" /> : null}<div className="text-sm font-medium">Shot {shot.index}</div><div className="text-xs text-muted-foreground">{formatTime(shot.start_time)} → {formatTime(shot.end_time)} · {formatTime(shot.duration)}</div></div>)}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );

  return (
    <AppShell active="analysis" eyebrow="VIDEO ANALYSIS · DIAGNOSTICS" inspector={inspector} status="FFmpeg scdet · debug only" title="Shot Detection Calibration">
      <div className="space-y-5">
        {error ? <Alert><AlertTitle>Request failed</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}

        <Card>
          <CardContent className="grid gap-4 p-5 md:grid-cols-[minmax(160px,1fr)_minmax(220px,2fr)_auto] md:items-end">
            <label className="grid gap-2 [&>[data-slot=native-select-wrapper]]:w-full">
              <span className="text-xs font-medium text-muted-foreground">Project</span>
              <NativeSelect className="w-full" disabled={projects.length === 0} onChange={(event) => setProjectId(event.target.value)} value={projectId}>
                {projects.map((project) => <NativeSelectOption key={project.id} value={project.id}>{project.name}</NativeSelectOption>)}
              </NativeSelect>
            </label>
            <label className="grid gap-2 [&>[data-slot=native-select-wrapper]]:w-full">
              <span className="text-xs font-medium text-muted-foreground">READY video</span>
              <NativeSelect className="w-full" disabled={assets.length === 0} onChange={(event) => setAssetId(event.target.value)} value={assetId}>
                {assets.map((asset) => <NativeSelectOption key={asset.id} value={asset.id}>{asset.filename}</NativeSelectOption>)}
              </NativeSelect>
            </label>
            <Button disabled={!assetId || isActive(candidateJob) || isActive(analysisJob)} onClick={() => void detectCandidates()}><ScanSearch /> {isActive(candidateJob) ? "Detecting…" : "Detect candidates"}</Button>
          </CardContent>
        </Card>

        {selectedAsset ? <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><Badge variant="outline">{selectedAsset.duration?.toFixed(3) ?? "?"}s</Badge><Badge variant="outline">{selectedAsset.width ?? "?"}×{selectedAsset.height ?? "?"}</Badge><span className="truncate">{selectedAsset.filename}</span></div> : null}

        <Card>
          <CardHeader className="flex-row items-center justify-between gap-4 pb-3">
            <div><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Source video</p><CardTitle className="mt-1 text-lg">Cut preview</CardTitle></div>
            {selectedCandidate ? <Badge variant={selectedCandidateAccepted ? "success" : "outline"}>Candidate #{(selectedCandidateIndex ?? 0) + 1} · {formatTime(selectedCandidate.timestamp)}</Badge> : null}
          </CardHeader>
          <CardContent>
            <div className="grid aspect-video place-items-center overflow-hidden rounded-xl border bg-black/70">
              {previewUrl ? <video className="h-full w-full object-contain" controls onEnded={() => { previewEndRef.current = null; }} onTimeUpdate={handlePreviewTimeUpdate} preload="metadata" ref={videoRef} src={previewUrl} /> : <span className="text-sm text-muted-foreground">Select a video</span>}
            </div>

            {selectedCandidate ? (
              <div className="mt-4 space-y-3 rounded-xl border bg-secondary/25 p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div><div className="font-medium">Candidate #{(selectedCandidateIndex ?? 0) + 1}</div><div className="mt-1 text-xs text-muted-foreground">{formatTime(selectedCandidate.timestamp)} · score {selectedCandidate.score.toFixed(3)} · {selectedCandidateAccepted ? "accepted at current threshold" : "below current threshold"}</div></div><Badge variant="outline">Preview ±{CUT_PREVIEW_RADIUS.toFixed(1)}s</Badge></div>
                <div className="grid grid-cols-3 gap-2"><Button disabled={selectedCandidateIndex === 0} onClick={() => moveCandidate(-1)} variant="outline"><ChevronLeft /> Previous</Button><Button onClick={() => previewCandidate(selectedCandidateIndex ?? 0)}><Play /> Replay</Button><Button disabled={selectedCandidateIndex === candidates.length - 1} onClick={() => moveCandidate(1)} variant="outline">Next <ChevronRight /></Button></div>
                <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]"><Button onClick={() => reviewCandidate("real")} variant={selectedCandidateReview === "real" ? "secondary" : "outline"}><Check /> Real cut</Button><Button onClick={() => reviewCandidate("false")} variant={selectedCandidateReview === "false" ? "secondary" : "outline"}><X /> False positive</Button><Button disabled={!selectedCandidateReview} onClick={() => reviewCandidate(null)} variant="ghost"><Eraser /> Clear</Button></div>
              </div>
            ) : candidateJob?.state === "SUCCEEDED" && candidates.length > 0 ? <p className="mt-3 text-sm text-muted-foreground">Select a candidate below to preview the local cut window.</p> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-end justify-between gap-4">
            <div><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Candidate cuts</p><CardTitle className="mt-1 text-lg">{candidateJob?.state === "SUCCEEDED" ? `${candidates.length} candidates` : "Run detection first"}</CardTitle>{scoreStats ? <CardDescription className="mt-2">score {scoreStats.min.toFixed(3)}–{scoreStats.max.toFixed(3)} · median {scoreStats.median.toFixed(3)} · floor {floorThreshold.toFixed(2)}</CardDescription> : null}</div>
            {candidateJob ? <Badge variant="outline">{candidateJob.state} · {Math.round(candidateJob.progress * 100)}%</Badge> : null}
          </CardHeader>
          <CardContent className="max-h-[480px] overflow-y-auto p-0">
            {candidates.map((candidate, index) => {
              const key = candidateKey(candidate);
              const acceptedNow = acceptedKeys.has(key);
              const selectedNow = selectedCandidateIndex === index;
              const review = reviews[key];
              return (
                <button className={cn("grid w-full grid-cols-[3rem_1fr_auto] items-center gap-3 border-t px-5 py-3 text-left text-sm transition-colors hover:bg-accent/30 sm:grid-cols-[3rem_1fr_6rem_7rem]", selectedNow && "bg-accent/40")} key={`${candidate.timestamp}-${index}`} onClick={() => previewCandidate(index)} type="button">
                  <span className="font-medium">#{index + 1}</span><span>{formatTime(candidate.timestamp)}</span><Badge variant={acceptedNow ? "success" : "outline"}>score {candidate.score.toFixed(3)}</Badge><span className={cn("hidden text-xs sm:block", review === "real" ? "text-emerald-300" : review === "false" ? "text-red-300" : "text-muted-foreground")}>{reviewLabel(review)}</span>
                </button>
              );
            })}
            {candidateJob?.state === "SUCCEEDED" && candidates.length === 0 ? <p className="p-5 text-sm text-muted-foreground">No candidates scored at least {floorThreshold.toFixed(2)}.</p> : null}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
