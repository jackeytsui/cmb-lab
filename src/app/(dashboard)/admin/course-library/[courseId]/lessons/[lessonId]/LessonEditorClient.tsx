"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";
import {
  Loader2,
  Check,
  Video,
  FileText,
  HelpCircle,
  Download,
  Upload,
  XCircle,
  File as FileIcon,
  ImagePlus,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { QuizBuilder } from "./QuizBuilder";

type LessonType = "video" | "text" | "quiz" | "download";

interface LessonData {
  id: string;
  title: string;
  lessonType: LessonType;
  content: Record<string, unknown>;
}

const TYPE_META: Record<LessonType, { label: string; Icon: typeof Video; color: string }> = {
  video: { label: "Video Lesson", Icon: Video, color: "text-red-500" },
  text: { label: "Text Lesson", Icon: FileText, color: "text-blue-500" },
  quiz: { label: "Quiz Lesson", Icon: HelpCircle, color: "text-amber-500" },
  download: { label: "Download Lesson", Icon: Download, color: "text-emerald-500" },
};

// Vercel functions cap request bodies at ~4.5MB, so anything larger has
// to go direct to Vercel Blob via @vercel/blob/client.upload() which
// handles multipart internally. Small files still take the simple
// server-POST path for simpler progress reporting.
const DIRECT_UPLOAD_THRESHOLD = 4 * 1024 * 1024;

function uploadSimple(
  kind: "video" | "file" | "image",
  file: File,
  abortSignal: AbortSignal,
  onProgress: (pct: number) => void,
): Promise<{ url: string; filename: string; sizeBytes: number }> {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append("file", file);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/admin/course-library/upload?kind=${kind}`);
    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    });
    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText);
          resolve({
            url: data.url,
            filename: data.filename,
            sizeBytes: data.sizeBytes,
          });
        } catch {
          reject(new Error("Invalid response"));
        }
      } else {
        try {
          const data = JSON.parse(xhr.responseText);
          reject(new Error(data.error || `Upload failed (${xhr.status})`));
        } catch {
          reject(new Error(`Upload failed (${xhr.status})`));
        }
      }
    });
    xhr.addEventListener("error", () => reject(new Error("Network error")));
    xhr.addEventListener("abort", () => reject(new Error("Upload aborted")));
    abortSignal.addEventListener("abort", () => xhr.abort());
    xhr.send(formData);
  });
}

async function uploadDirect(
  kind: "video" | "file" | "image",
  file: File,
  abortSignal: AbortSignal,
  onProgress: (pct: number) => void,
): Promise<{ url: string; filename: string; sizeBytes: number }> {
  const pathname = `course-library/${kind}/${file.name}`;
  const blob = await upload(pathname, file, {
    access: "private",
    contentType: file.type || "application/octet-stream",
    handleUploadUrl: "/api/admin/course-library/upload-token",
    multipart: true,
    abortSignal,
    onUploadProgress: ({ percentage }) => onProgress(Math.round(percentage)),
  });
  return { url: blob.url, filename: file.name, sizeBytes: file.size };
}

function uploadWithProgress(
  kind: "video" | "file" | "image",
  file: File,
  abortSignal: AbortSignal,
  onProgress: (pct: number) => void,
): Promise<{ url: string; filename: string; sizeBytes: number }> {
  if (file.size > DIRECT_UPLOAD_THRESHOLD) {
    return uploadDirect(kind, file, abortSignal, onProgress);
  }
  return uploadSimple(kind, file, abortSignal, onProgress);
}

async function saveLessonContent(
  lessonId: string,
  content: Record<string, unknown>,
): Promise<boolean> {
  const res = await fetch(`/api/admin/course-library/lessons/${lessonId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
  return res.ok;
}

export function LessonEditorClient({
  initialLesson,
}: {
  initialLesson: LessonData;
}) {
  const router = useRouter();
  const [lesson, setLesson] = useState<LessonData>(initialLesson);
  const [title, setTitle] = useState(lesson.title);
  const [savingTitle, setSavingTitle] = useState(false);

  const meta = TYPE_META[lesson.lessonType];
  const titleDirty = title !== lesson.title;

  const handleSaveTitle = async () => {
    setSavingTitle(true);
    try {
      const res = await fetch(
        `/api/admin/course-library/lessons/${lesson.id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title }),
        },
      );
      if (res.ok) {
        const data = await res.json();
        setLesson((prev) => ({ ...prev, title: data.lesson.title }));
      }
    } finally {
      setSavingTitle(false);
    }
  };

  const updateContent = useCallback(
    (next: Record<string, unknown>) => {
      setLesson((prev) => ({ ...prev, content: next }));
    },
    [],
  );

  return (
    <div className="space-y-6">
      {/* Header card */}
      <div className="rounded-lg border border-border bg-card p-5 space-y-3">
        <div className="flex items-center gap-2">
          <meta.Icon className={cn("w-5 h-5", meta.color)} />
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {meta.label}
          </span>
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Title
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-lg font-semibold"
          />
        </div>
        {titleDirty && (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleSaveTitle}
              disabled={savingTitle || !title.trim()}
              className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {savingTitle ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Check className="w-3 h-3" />
              )}
              Save title
            </button>
          </div>
        )}
      </div>

      {/* Type-specific content editor */}
      {lesson.lessonType === "video" && (
        <VideoLessonForm
          lessonId={lesson.id}
          content={lesson.content}
          onUpdate={updateContent}
        />
      )}
      {lesson.lessonType === "text" && (
        <TextLessonForm
          lessonId={lesson.id}
          content={lesson.content}
          onUpdate={updateContent}
        />
      )}
      {lesson.lessonType === "download" && (
        <DownloadLessonForm
          lessonId={lesson.id}
          content={lesson.content}
          onUpdate={updateContent}
        />
      )}
      {lesson.lessonType === "quiz" && (
        <QuizBuilder
          lessonId={lesson.id}
          content={lesson.content}
          onUpdate={updateContent}
        />
      )}

      <button type="button" onClick={() => router.refresh()} className="hidden" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Thumbnail Uploader — reused by video & text lesson forms
// ---------------------------------------------------------------------------

function ThumbnailUploader({
  lessonId,
  thumbnailUrl,
  content,
  onUpdate,
}: {
  lessonId: string;
  thumbnailUrl: string;
  content: Record<string, unknown>;
  onUpdate: (next: Record<string, unknown>) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadPct(0);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const result = await uploadWithProgress(
        "image",
        file,
        controller.signal,
        setUploadPct,
      );
      const nextContent = { ...content, thumbnailUrl: result.url };
      await saveLessonContent(lessonId, nextContent);
      onUpdate(nextContent);
    } catch {
      // ignore
    } finally {
      setUploading(false);
      setUploadPct(0);
      abortRef.current = null;
      e.target.value = "";
    }
  };

  const handleRemove = async () => {
    const nextContent = { ...content };
    delete nextContent.thumbnailUrl;
    await saveLessonContent(lessonId, nextContent);
    onUpdate(nextContent);
  };

  return (
    <div className="rounded-lg border border-border bg-card p-5 space-y-3">
      <h3 className="text-sm font-semibold text-foreground">Thumbnail</h3>
      {thumbnailUrl ? (
        <div className="flex items-start gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/course-library/image/${lessonId}`}
            alt="Thumbnail"
            className="w-32 h-20 object-cover rounded-md border border-border"
          />
          <div className="flex flex-col gap-1">
            <label className="cursor-pointer">
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                onChange={handleUpload}
                disabled={uploading}
              />
              <span className="text-xs text-primary hover:underline">Replace</span>
            </label>
            <button
              type="button"
              onClick={handleRemove}
              className="text-xs text-red-500 hover:text-red-400 text-left inline-flex items-center gap-1"
            >
              <Trash2 className="w-3 h-3" />
              Remove
            </button>
          </div>
        </div>
      ) : (
        <label className="cursor-pointer block">
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="hidden"
            onChange={handleUpload}
            disabled={uploading}
          />
          <div className="rounded-md border border-dashed border-border bg-muted/30 p-4 text-center hover:bg-muted/50 transition-colors">
            <ImagePlus className="w-6 h-6 text-muted-foreground/40 mx-auto mb-1" />
            <p className="text-xs text-muted-foreground">
              Upload thumbnail (JPEG, PNG, WebP)
            </p>
          </div>
        </label>
      )}
      {uploading && (
        <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${uploadPct}%` }}
          />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Attachments Manager — upload/remove file attachments on a lesson
// ---------------------------------------------------------------------------

function AttachmentsManager({
  lessonId,
  content,
  onUpdate,
}: {
  lessonId: string;
  content: Record<string, unknown>;
  onUpdate: (next: Record<string, unknown>) => void;
}) {
  const attachments = (content.attachments as Array<{ url: string; filename: string; sizeBytes: number }>) ?? [];
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadPct(0);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const result = await uploadWithProgress(
        "file",
        file,
        controller.signal,
        setUploadPct,
      );
      const nextAttachments = [
        ...attachments,
        { url: result.url, filename: result.filename, sizeBytes: result.sizeBytes },
      ];
      const nextContent = { ...content, attachments: nextAttachments };
      await saveLessonContent(lessonId, nextContent);
      onUpdate(nextContent);
    } catch {
      // ignore
    } finally {
      setUploading(false);
      setUploadPct(0);
      abortRef.current = null;
      e.target.value = "";
    }
  };

  const handleRemove = async (idx: number) => {
    const nextAttachments = attachments.filter((_, i) => i !== idx);
    const nextContent = { ...content, attachments: nextAttachments };
    await saveLessonContent(lessonId, nextContent);
    onUpdate(nextContent);
  };

  return (
    <div className="rounded-lg border border-border bg-card p-5 space-y-3">
      <h3 className="text-sm font-semibold text-foreground">Attachments</h3>
      {attachments.length > 0 && (
        <div className="space-y-2">
          {attachments.map((att, idx) => (
            <div
              key={att.url}
              className="rounded-md border border-border bg-background p-2 flex items-center gap-2"
            >
              <FileIcon className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs text-foreground flex-1 truncate">
                {att.filename}
              </span>
              <span className="text-[10px] text-muted-foreground">
                {(att.sizeBytes / 1024 / 1024).toFixed(1)}MB
              </span>
              <button
                type="button"
                onClick={() => handleRemove(idx)}
                className="text-red-500 hover:text-red-400"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}
      <label className="cursor-pointer block">
        <input
          type="file"
          className="hidden"
          onChange={handleUpload}
          disabled={uploading}
        />
        <div className="rounded-md border border-dashed border-border bg-muted/30 p-3 text-center hover:bg-muted/50 transition-colors">
          <p className="text-xs text-muted-foreground">
            + Add file (PDF, ZIP, DOCX up to 100MB)
          </p>
        </div>
      </label>
      {uploading && (
        <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${uploadPct}%` }}
          />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Video Lesson Form
// ---------------------------------------------------------------------------

function VideoLessonForm({
  lessonId,
  content,
  onUpdate,
}: {
  lessonId: string;
  content: Record<string, unknown>;
  onUpdate: (next: Record<string, unknown>) => void;
}) {
  const videoUrl = (content.videoUrl as string) ?? "";
  const description = (content.description as string) ?? "";
  const transcript = (content.transcript as string) ?? "";
  const durationSeconds = (content.durationSeconds as number | undefined) ?? undefined;

  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [desc, setDesc] = useState(description);
  const [trans, setTrans] = useState(transcript);
  const [duration, setDuration] = useState(durationSeconds?.toString() ?? "");
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const dirty =
    desc !== description ||
    trans !== transcript ||
    duration !== (durationSeconds?.toString() ?? "");

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    setUploadPct(0);
    setUploading(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const result = await uploadWithProgress(
        "video",
        file,
        controller.signal,
        setUploadPct,
      );
      const nextContent = {
        ...content,
        videoUrl: result.url,
      };
      await saveLessonContent(lessonId, nextContent);
      onUpdate(nextContent);
    } catch (err) {
      if (!(err instanceof Error && /abort/i.test(err.message))) {
        setUploadError(err instanceof Error ? err.message : "Upload failed");
      }
    } finally {
      setUploading(false);
      setUploadPct(0);
      abortRef.current = null;
      e.target.value = "";
    }
  };

  const handleCancelUpload = () => {
    abortRef.current?.abort();
    setUploading(false);
  };

  const handleSaveMeta = async () => {
    setSaving(true);
    try {
      const durNum = duration ? parseInt(duration, 10) : undefined;
      const nextContent: Record<string, unknown> = {
        ...content,
        description: desc,
        transcript: trans,
      };
      if (durNum && !isNaN(durNum)) {
        nextContent.durationSeconds = durNum;
      } else {
        delete nextContent.durationSeconds;
      }
      const ok = await saveLessonContent(lessonId, nextContent);
      if (ok) {
        onUpdate(nextContent);
        setSavedAt(new Date());
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Video upload area */}
      <div className="rounded-lg border border-border bg-card p-5 space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Video file</h3>
        {videoUrl ? (
          <div className="rounded-md border border-border bg-background p-3 flex items-center gap-3">
            <Video className="w-5 h-5 text-red-500" />
            <span className="text-xs text-muted-foreground flex-1 truncate">
              {videoUrl.split("/").pop()}
            </span>
            <label className="cursor-pointer">
              <input
                type="file"
                accept="video/mp4,video/quicktime,video/webm"
                className="hidden"
                onChange={handleUpload}
                disabled={uploading}
              />
              <span className="text-xs text-primary hover:underline">Replace</span>
            </label>
          </div>
        ) : (
          <label className="cursor-pointer block">
            <input
              type="file"
              accept="video/mp4,video/quicktime,video/webm"
              className="hidden"
              onChange={handleUpload}
              disabled={uploading}
            />
            <div className="rounded-md border border-dashed border-border bg-muted/30 p-6 text-center hover:bg-muted/50 transition-colors">
              <Upload className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                Click to upload MP4 (up to 500MB)
              </p>
            </div>
          </label>
        )}

        {uploading && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Uploading… {uploadPct}%</span>
              <button
                type="button"
                onClick={handleCancelUpload}
                className="text-red-500 hover:text-red-600 inline-flex items-center gap-1"
              >
                <XCircle className="w-3 h-3" />
                Cancel
              </button>
            </div>
            <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${uploadPct}%` }}
              />
            </div>
          </div>
        )}

        {uploadError && (
          <p className="text-xs text-red-500">{uploadError}</p>
        )}
      </div>

      {/* Thumbnail */}
      <ThumbnailUploader
        lessonId={lessonId}
        thumbnailUrl={(content.thumbnailUrl as string) ?? ""}
        content={content}
        onUpdate={onUpdate}
      />

      {/* Attachments */}
      <AttachmentsManager
        lessonId={lessonId}
        content={content}
        onUpdate={onUpdate}
      />

      {/* Metadata */}
      <div className="rounded-lg border border-border bg-card p-5 space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Metadata</h3>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Description
          </label>
          <RichTextEditor
            value={desc}
            onChange={setDesc}
            placeholder="What students will learn in this video"
            compact
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Transcript (optional)
          </label>
          <textarea
            value={trans}
            onChange={(e) => setTrans(e.target.value)}
            rows={4}
            placeholder="Full video transcript"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Duration (seconds, optional)
          </label>
          <input
            type="number"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            className="w-32 rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
        </div>
        {dirty && (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleSaveMeta}
              disabled={saving}
              className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Check className="w-3 h-3" />
              )}
              Save metadata
            </button>
          </div>
        )}
        {savedAt && !dirty && (
          <p className="text-[10px] text-emerald-500 text-right">
            Saved at {savedAt.toLocaleTimeString()}
          </p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Text Lesson Form
// ---------------------------------------------------------------------------

function TextLessonForm({
  lessonId,
  content,
  onUpdate,
}: {
  lessonId: string;
  content: Record<string, unknown>;
  onUpdate: (next: Record<string, unknown>) => void;
}) {
  const body = (content.body as string) ?? "";
  const [draft, setDraft] = useState(body);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  const dirty = draft !== body;

  const handleSave = async () => {
    setSaving(true);
    try {
      const nextContent = { ...content, body: draft };
      const ok = await saveLessonContent(lessonId, nextContent);
      if (ok) {
        onUpdate(nextContent);
        setSavedAt(new Date());
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-5 space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Body</h3>
        <RichTextEditor
          value={draft}
          onChange={setDraft}
          placeholder="Write your lesson content here..."
        />
        <div className="flex items-center justify-end">
          {dirty ? (
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Check className="w-3 h-3" />
              )}
              Save
            </button>
          ) : savedAt ? (
            <span className="text-[10px] text-emerald-500">
              Saved at {savedAt.toLocaleTimeString()}
            </span>
          ) : null}
        </div>
      </div>

      {/* Thumbnail */}
      <ThumbnailUploader
        lessonId={lessonId}
        thumbnailUrl={(content.thumbnailUrl as string) ?? ""}
        content={content}
        onUpdate={onUpdate}
      />

      {/* Attachments */}
      <AttachmentsManager
        lessonId={lessonId}
        content={content}
        onUpdate={onUpdate}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Download Lesson Form
// ---------------------------------------------------------------------------

function DownloadLessonForm({
  lessonId,
  content,
  onUpdate,
}: {
  lessonId: string;
  content: Record<string, unknown>;
  onUpdate: (next: Record<string, unknown>) => void;
}) {
  const fileUrl = (content.fileUrl as string) ?? "";
  const fileName = (content.fileName as string) ?? "";
  const sizeBytes = (content.sizeBytes as number) ?? 0;
  const description = (content.description as string) ?? "";

  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [desc, setDesc] = useState(description);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const dirty = desc !== description;

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    setUploadPct(0);
    setUploading(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const result = await uploadWithProgress(
        "file",
        file,
        controller.signal,
        setUploadPct,
      );
      const nextContent = {
        ...content,
        fileUrl: result.url,
        fileName: result.filename,
        sizeBytes: result.sizeBytes,
      };
      await saveLessonContent(lessonId, nextContent);
      onUpdate(nextContent);
    } catch (err) {
      if (!(err instanceof Error && /abort/i.test(err.message))) {
        setUploadError(err instanceof Error ? err.message : "Upload failed");
      }
    } finally {
      setUploading(false);
      setUploadPct(0);
      abortRef.current = null;
      e.target.value = "";
    }
  };

  const handleSaveDesc = async () => {
    setSaving(true);
    try {
      const nextContent = { ...content, description: desc };
      const ok = await saveLessonContent(lessonId, nextContent);
      if (ok) {
        onUpdate(nextContent);
        setSavedAt(new Date());
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-5 space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Downloadable file</h3>
        {fileUrl ? (
          <div className="rounded-md border border-border bg-background p-3 flex items-center gap-3">
            <FileIcon className="w-5 h-5 text-emerald-500" />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-foreground truncate">{fileName}</p>
              <p className="text-[10px] text-muted-foreground">
                {(sizeBytes / 1024 / 1024).toFixed(2)} MB
              </p>
            </div>
            <label className="cursor-pointer">
              <input
                type="file"
                className="hidden"
                onChange={handleUpload}
                disabled={uploading}
              />
              <span className="text-xs text-primary hover:underline">Replace</span>
            </label>
          </div>
        ) : (
          <label className="cursor-pointer block">
            <input
              type="file"
              className="hidden"
              onChange={handleUpload}
              disabled={uploading}
            />
            <div className="rounded-md border border-dashed border-border bg-muted/30 p-6 text-center hover:bg-muted/50 transition-colors">
              <Upload className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                Click to upload a file (PDF, ZIP, DOCX, XLSX up to 100MB)
              </p>
            </div>
          </label>
        )}
        {uploading && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Uploading… {uploadPct}%</span>
              <button
                type="button"
                onClick={() => abortRef.current?.abort()}
                className="text-red-500 hover:text-red-600 inline-flex items-center gap-1"
              >
                <XCircle className="w-3 h-3" />
                Cancel
              </button>
            </div>
            <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${uploadPct}%` }}
              />
            </div>
          </div>
        )}
        {uploadError && <p className="text-xs text-red-500">{uploadError}</p>}
      </div>

      <div className="rounded-lg border border-border bg-card p-5 space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Description</h3>
        <RichTextEditor
          value={desc}
          onChange={setDesc}
          placeholder="What is this download, and how should students use it?"
          compact
        />
        {dirty && (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleSaveDesc}
              disabled={saving}
              className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Check className="w-3 h-3" />
              )}
              Save
            </button>
          </div>
        )}
        {savedAt && !dirty && (
          <p className="text-[10px] text-emerald-500 text-right">
            Saved at {savedAt.toLocaleTimeString()}
          </p>
        )}
      </div>
    </div>
  );
}
