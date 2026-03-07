/**
 * Audio recording utilities for cross-browser MIME type detection and blob handling.
 */

/**
 * MIME types in priority order.
 * Chrome/Firefox prefer webm, Safari/iOS prefer mp4.
 */
const MIME_TYPE_PRIORITY = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/mp4",
  "audio/mp4;codecs=mp4a.40.2",
] as const;

/**
 * Valid audio MIME type prefixes for blob validation.
 */
const VALID_AUDIO_PREFIXES = ["audio/webm", "audio/mp4", "audio/ogg"] as const;

/**
 * Detect the best supported audio MIME type for the current browser.
 * Uses MediaRecorder.isTypeSupported() to check browser capabilities.
 *
 * @returns The best supported MIME type, or 'audio/webm' as fallback
 */
export function getSupportedMimeType(): string {
  if (typeof MediaRecorder === "undefined") {
    return "audio/webm";
  }

  for (const mimeType of MIME_TYPE_PRIORITY) {
    if (MediaRecorder.isTypeSupported(mimeType)) {
      return mimeType;
    }
  }

  // Fallback to audio/webm (most common)
  return "audio/webm";
}

/**
 * Validate an audio blob for basic integrity.
 *
 * @param blob - The blob to validate
 * @returns true if blob is valid, false otherwise
 */
export function validateAudioBlob(blob: Blob | null | undefined): boolean {
  if (!blob) {
    return false;
  }

  if (blob.size === 0) {
    return false;
  }

  // Check that blob type starts with a valid audio MIME type
  const blobType = blob.type.toLowerCase();
  return VALID_AUDIO_PREFIXES.some((prefix) => blobType.startsWith(prefix));
}

/**
 * Get the file extension for a given MIME type.
 *
 * @param mimeType - The MIME type string (e.g., "audio/webm;codecs=opus")
 * @returns The file extension without the dot (e.g., "webm")
 */
export function getFileExtensionForMimeType(mimeType: string): string {
  const normalizedType = mimeType.toLowerCase();

  if (normalizedType.startsWith("audio/webm")) {
    return "webm";
  }

  if (normalizedType.startsWith("audio/mp4")) {
    return "mp4";
  }

  if (normalizedType.startsWith("audio/ogg")) {
    return "ogg";
  }

  // Default to webm
  return "webm";
}

/**
 * Check if audio recording is supported in the current browser.
 *
 * @returns true if recording is supported
 */
export function isAudioRecordingSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices !== "undefined" &&
    typeof navigator.mediaDevices.getUserMedia === "function" &&
    typeof MediaRecorder !== "undefined"
  );
}
