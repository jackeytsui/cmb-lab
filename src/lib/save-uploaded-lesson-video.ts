const SAVE_NOT_CONFIRMED =
  "Video uploaded, but saving this lesson could not be confirmed. Reload the page to check before trying again.";

type SaveResult = { ok: true } | { ok: false; error: string };

/** Confirm the stored video before showing a replacement as saved in the editor. */
export async function saveUploadedLessonVideo(
  lessonId: string,
  content: Record<string, unknown>,
): Promise<SaveResult> {
  const unconfirmed: SaveResult = { ok: false, error: SAVE_NOT_CONFIRMED };
  if (typeof content.videoUrl !== "string" || !content.videoUrl.trim()) {
    return unconfirmed;
  }

  try {
    const response = await fetch(`/api/admin/course-library/lessons/${lessonId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    if (!response.ok) return unconfirmed;

    const saved = await response.json();
    if (
      saved?.lesson?.id !== lessonId ||
      saved?.lesson?.content?.videoUrl !== content.videoUrl
    ) {
      return unconfirmed;
    }
    return { ok: true };
  } catch {
    // The server may have saved before the connection failed. Do not retry the
    // write or claim it failed definitively; ask staff to reload and check.
    return unconfirmed;
  }
}
