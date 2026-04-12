import type { AttachedFile } from "@/types";

export function resolveAttachedFileUrl(file: Pick<AttachedFile, "url" | "base64" | "mimeType">): string | null {
  if (typeof file.url === "string" && file.url.trim().length > 0) {
    return file.url;
  }

  if (typeof file.base64 === "string" && file.base64.trim().length > 0) {
    const mimeType = typeof file.mimeType === "string" && file.mimeType.trim().length > 0
      ? file.mimeType
      : "application/octet-stream";
    return `data:${mimeType};base64,${file.base64}`;
  }

  return null;
}

export function isPreviewableAttachedFile(file: Pick<AttachedFile, "url" | "base64" | "mimeType">): boolean {
  return resolveAttachedFileUrl(file) !== null;
}
