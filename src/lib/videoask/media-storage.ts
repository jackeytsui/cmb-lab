const PRIVATE_BLOB_HOST_SUFFIX = ".private.blob.vercel-storage.com";

function safePathPart(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
}

export function isPrivateVercelBlobUrl(value: string | null | undefined) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname.endsWith(PRIVATE_BLOB_HOST_SUFFIX)
    );
  } catch {
    return false;
  }
}

export function mediaExtension(contentType: string | null | undefined) {
  const normalized = contentType?.split(";", 1)[0]?.trim().toLowerCase();
  switch (normalized) {
    case "audio/mpeg":
    case "audio/mp3":
      return "mp3";
    case "audio/wav":
    case "audio/x-wav":
      return "wav";
    case "audio/webm":
    case "video/webm":
      return "webm";
    case "video/quicktime":
      return "mov";
    default:
      return "mp4";
  }
}

export function videoAskBlobPath(input: {
  organizationId: string;
  sourceMediaId: string | null;
  sourceMediaKey: string;
  contentType: string | null;
}) {
  const organization = safePathPart(input.organizationId) || "organization";
  const media =
    safePathPart(input.sourceMediaId || input.sourceMediaKey) || "media";
  return `videoask/${organization}/${media}.${mediaExtension(input.contentType)}`;
}
