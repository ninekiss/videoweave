import type { MediaAsset, UploadSession, UploadedPart } from "@videoweave/contracts";

import {
  completeUpload,
  createUploadPartAccess,
  getUploadStatus,
  initializeUpload,
} from "@/lib/api";

export interface UploadProgress {
  percent: number;
  uploadedBytes: number;
  totalBytes: number;
  partNumber: number;
  totalParts: number;
  resumed: boolean;
}

interface StoredUpload extends UploadSession {
  file_size: number;
  file_last_modified: number;
}

function storageKey(projectId: string, file: File): string {
  return `videoweave-upload:${projectId}:${file.name}:${file.size}:${file.lastModified}`;
}

function readStoredUpload(projectId: string, file: File): StoredUpload | null {
  const raw = window.localStorage.getItem(storageKey(projectId, file));
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as StoredUpload;
    if (parsed.file_size !== file.size || parsed.file_last_modified !== file.lastModified) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function storeUpload(projectId: string, file: File, upload: UploadSession): void {
  const value: StoredUpload = {
    ...upload,
    file_size: file.size,
    file_last_modified: file.lastModified,
  };
  window.localStorage.setItem(storageKey(projectId, file), JSON.stringify(value));
}

function clearStoredUpload(projectId: string, file: File): void {
  window.localStorage.removeItem(storageKey(projectId, file));
}

function putPart(
  url: string,
  blob: Blob,
  onProgress: (loaded: number) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded);
    };

    xhr.onerror = () => reject(new Error("Network error while uploading part"));
    xhr.onabort = () => reject(new Error("Upload aborted"));
    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error(`Part upload failed with HTTP ${xhr.status}`));
        return;
      }

      const etag = xhr.getResponseHeader("ETag");
      if (!etag) {
        reject(new Error("Upload succeeded but S3 did not expose the ETag header. Check bucket CORS."));
        return;
      }
      resolve(etag);
    };

    xhr.send(blob);
  });
}

async function resolveSession(projectId: string, file: File): Promise<{
  session: UploadSession;
  existingParts: UploadedPart[];
  resumed: boolean;
}> {
  const stored = readStoredUpload(projectId, file);
  if (stored) {
    try {
      const status = await getUploadStatus(stored.upload_session_id);
      if (status.status === "ACTIVE") {
        return { session: stored, existingParts: status.parts, resumed: status.parts.length > 0 };
      }
      clearStoredUpload(projectId, file);
    } catch {
      clearStoredUpload(projectId, file);
    }
  }

  const session = await initializeUpload(projectId, file);
  storeUpload(projectId, file, session);
  return { session, existingParts: [], resumed: false };
}

export async function uploadVideo(
  projectId: string,
  file: File,
  onProgress: (progress: UploadProgress) => void,
): Promise<MediaAsset> {
  const { session, existingParts, resumed } = await resolveSession(projectId, file);
  const totalParts = Math.ceil(file.size / session.part_size);
  const completed = new Map(existingParts.map((part) => [part.part_number, part]));
  const preloadedBytes = existingParts.reduce((sum, part) => sum + part.size, 0);
  let newlyCompletedBytes = 0;

  onProgress({
    percent: file.size === 0 ? 100 : Math.round((preloadedBytes / file.size) * 100),
    uploadedBytes: preloadedBytes,
    totalBytes: file.size,
    partNumber: 0,
    totalParts,
    resumed,
  });

  for (let partNumber = 1; partNumber <= totalParts; partNumber += 1) {
    if (completed.has(partNumber)) continue;

    const start = (partNumber - 1) * session.part_size;
    const end = Math.min(start + session.part_size, file.size);
    const blob = file.slice(start, end);
    const access = await createUploadPartAccess(session.upload_session_id, partNumber);

    const etag = await putPart(access.url, blob, (currentPartBytes) => {
      const uploadedBytes = Math.min(
        file.size,
        preloadedBytes + newlyCompletedBytes + currentPartBytes,
      );
      onProgress({
        percent: file.size === 0 ? 100 : Math.round((uploadedBytes / file.size) * 100),
        uploadedBytes,
        totalBytes: file.size,
        partNumber,
        totalParts,
        resumed,
      });
    });

    const uploadedPart: UploadedPart = {
      part_number: partNumber,
      etag,
      size: blob.size,
    };
    completed.set(partNumber, uploadedPart);
    newlyCompletedBytes += blob.size;
  }

  const parts = [...completed.values()].sort((a, b) => a.part_number - b.part_number);
  const asset = await completeUpload(session.upload_session_id, parts);
  clearStoredUpload(projectId, file);

  onProgress({
    percent: 100,
    uploadedBytes: file.size,
    totalBytes: file.size,
    partNumber: totalParts,
    totalParts,
    resumed,
  });

  return asset;
}
