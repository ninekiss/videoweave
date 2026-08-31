import type {
  AssetAccess,
  GenerationCreate,
  Job,
  MediaAsset,
  Project,
  Shot,
  UploadPartAccess,
  UploadSession,
  UploadStatusResponse,
  UploadedPart,
} from "@videoweave/contracts";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    let message = body;
    try {
      const parsed = JSON.parse(body) as { detail?: unknown };
      if (typeof parsed.detail === "string") message = parsed.detail;
    } catch {
      // Keep the raw response body when it is not JSON.
    }
    throw new Error(message || `${response.status} ${response.statusText}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export function listProjects(): Promise<Project[]> {
  return request<Project[]>("/v1/projects");
}

export function createProject(name: string): Promise<Project> {
  return request<Project>("/v1/projects", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export function listProjectAssets(projectId: string): Promise<MediaAsset[]> {
  return request<MediaAsset[]>(`/v1/projects/${projectId}/assets`);
}

export function getAsset(assetId: string): Promise<MediaAsset> {
  return request<MediaAsset>(`/v1/assets/${assetId}`);
}

export function getAssetAccess(assetId: string): Promise<AssetAccess> {
  return request<AssetAccess>(`/v1/assets/${assetId}/access`);
}

export function clearVideoAnalysisOutputs(assetId: string): Promise<{
  analysis_jobs: number;
  deleted_assets: number;
  deleted_shots: number;
}> {
  return request(`/v1/assets/${assetId}/analysis-outputs`, { method: "DELETE" });
}

export function initializeUpload(projectId: string, file: File): Promise<UploadSession> {
  return request<UploadSession>(`/v1/projects/${projectId}/uploads`, {
    method: "POST",
    body: JSON.stringify({
      filename: file.name,
      mime_type: file.type || null,
      size: file.size,
      asset_type: "VIDEO",
    }),
  });
}

export function getUploadStatus(uploadSessionId: string): Promise<UploadStatusResponse> {
  return request<UploadStatusResponse>(`/v1/uploads/${uploadSessionId}`);
}

export function createUploadPartAccess(
  uploadSessionId: string,
  partNumber: number,
): Promise<UploadPartAccess> {
  return request<UploadPartAccess>(`/v1/uploads/${uploadSessionId}/parts/${partNumber}`, {
    method: "POST",
  });
}

export function completeUpload(
  uploadSessionId: string,
  parts: UploadedPart[],
): Promise<MediaAsset> {
  return request<MediaAsset>(`/v1/uploads/${uploadSessionId}/complete`, {
    method: "POST",
    body: JSON.stringify({
      parts: parts.map((part) => ({
        part_number: part.part_number,
        etag: part.etag,
      })),
    }),
  });
}

export function abortUpload(uploadSessionId: string): Promise<void> {
  return request<void>(`/v1/uploads/${uploadSessionId}`, { method: "DELETE" });
}

export function createKeyframeJob(assetId: string, count = 8): Promise<Job> {
  return request<Job>(`/v1/assets/${assetId}/keyframes`, {
    method: "POST",
    body: JSON.stringify({ count }),
  });
}

export function createSceneCandidateJob(assetId: string, floorThreshold = 1): Promise<Job> {
  return request<Job>(`/v1/assets/${assetId}/scene-candidates`, {
    method: "POST",
    body: JSON.stringify({ floor_threshold: floorThreshold }),
  });
}

export function createVideoAnalysisJob(
  assetId: string,
  sceneThreshold?: number,
  candidateJobId?: string,
): Promise<Job> {
  const manual = candidateJobId != null;
  return request<Job>(`/v1/assets/${assetId}/analysis`, {
    method: "POST",
    body: JSON.stringify(
      manual
        ? {
            mode: "manual",
            scene_threshold: sceneThreshold ?? 10,
            candidate_job_id: candidateJobId,
          }
        : { mode: "auto" },
    ),
  });
}

export function createGeneration(projectId: string, payload: GenerationCreate): Promise<Job> {
  return request<Job>(`/v1/projects/${projectId}/generations`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function listAssetShots(assetId: string): Promise<Shot[]> {
  return request<Shot[]>(`/v1/assets/${assetId}/shots`);
}

export function getJob(jobId: string): Promise<Job> {
  return request<Job>(`/v1/jobs/${jobId}`);
}

export function listJobs(projectId?: string): Promise<Job[]> {
  const query = projectId ? `?project_id=${encodeURIComponent(projectId)}` : "";
  return request<Job[]>(`/v1/jobs${query}`);
}
