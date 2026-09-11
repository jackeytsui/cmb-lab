const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * New podcast enclosure URLs carry a media extension for Apple Podcasts.
 * Keep accepting the original extensionless URLs so existing downloads and
 * cached feeds continue to work.
 */
export function parsePodcastLessonPath(value: string): string | null {
  const lessonId = value.replace(/\.[a-z0-9]{2,5}$/i, "");
  return UUID_PATTERN.test(lessonId) ? lessonId : null;
}

export function podcastAudioFileExtension(contentType: string): string {
  switch (contentType.split(";", 1)[0]?.trim().toLowerCase()) {
    case "audio/mp4":
    case "audio/m4a":
    case "audio/x-m4a":
      return "m4a";
    case "audio/aac":
      return "aac";
    default:
      return "mp3";
  }
}
