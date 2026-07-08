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
  Music,
  ExternalLink,
  ClipboardList,
  Headphones,
  Mic,
  NotebookPen,
  Plus,
  ArrowUp,
  ArrowDown,
  Sparkles,
  BarChart3,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { extractEmbedUrl, looksLikeIframeSnippet } from "@/lib/embed";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { QuizBuilder } from "./QuizBuilder";
import {
  generateModelPinyin,
  countHanCharacters,
} from "@/lib/generate-model-pinyin";
import { fetchProperTranslations } from "@/lib/mandarin-generation";

type LessonType =
  | "video"
  | "audio"
  | "text"
  | "quiz"
  | "download"
  | "form"
  | "text_assignment"
  | "listening_practice"
  | "vocal_hack"
  | "diary";

interface LessonData {
  id: string;
  title: string;
  lessonType: LessonType;
  content: Record<string, unknown>;
}

const TYPE_META: Record<LessonType, { label: string; Icon: typeof Video; color: string }> = {
  video: { label: "Video Lesson", Icon: Video, color: "text-red-500" },
  audio: { label: "Audio Lesson", Icon: Music, color: "text-purple-500" },
  text: { label: "Text Lesson", Icon: FileText, color: "text-blue-500" },
  quiz: { label: "Quiz Lesson", Icon: HelpCircle, color: "text-amber-500" },
  download: { label: "Download Lesson", Icon: Download, color: "text-emerald-500" },
  form: { label: "Form Embed", Icon: ExternalLink, color: "text-pink-500" },
  text_assignment: {
    label: "Text Assignment",
    Icon: ClipboardList,
    color: "text-teal-500",
  },
  listening_practice: {
    label: "Listening Practice",
    Icon: Headphones,
    color: "text-indigo-500",
  },
  vocal_hack: {
    label: "Vocal Hack",
    Icon: Mic,
    color: "text-rose-500",
  },
  diary: {
    label: "Diary",
    Icon: NotebookPen,
    color: "text-sky-500",
  },
};

// Vercel functions cap request bodies at ~4.5MB, so anything larger has
// to go direct to Vercel Blob via @vercel/blob/client.upload() which
// handles multipart internally. Small files still take the simple
// server-POST path for simpler progress reporting.
const DIRECT_UPLOAD_THRESHOLD = 4 * 1024 * 1024;

function uploadSimple(
  kind: "video" | "audio" | "file" | "image",
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
  kind: "video" | "audio" | "file" | "image",
  file: File,
  abortSignal: AbortSignal,
  onProgress: (pct: number) => void,
): Promise<{ url: string; filename: string; sizeBytes: number }> {
  const pathname = `course-library/${kind}/${file.name}`;
  try {
    const blob = await upload(pathname, file, {
      access: "private",
      contentType: file.type || "application/octet-stream",
      handleUploadUrl: "/api/admin/course-library/upload-token",
      multipart: true,
      abortSignal,
      onUploadProgress: ({ percentage }) => onProgress(Math.round(percentage)),
    });
    return { url: blob.url, filename: file.name, sizeBytes: file.size };
  } catch (err) {
    if (err instanceof Error && err.message.includes("client token")) {
      throw new Error(
        "Upload permission denied — make sure your account has admin access, " +
        "or ask an admin to verify the BLOB_READ_WRITE_TOKEN environment variable is set."
      );
    }
    throw err;
  }
}

function uploadWithProgress(
  kind: "video" | "audio" | "file" | "image",
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
      {lesson.lessonType === "audio" && (
        <AudioLessonForm
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
      {lesson.lessonType === "form" && (
        <FormLessonForm
          lessonId={lesson.id}
          content={lesson.content}
          onUpdate={updateContent}
        />
      )}
      {lesson.lessonType === "text_assignment" && (
        <TextAssignmentLessonForm
          lessonId={lesson.id}
          content={lesson.content}
          onUpdate={updateContent}
        />
      )}
      {lesson.lessonType === "listening_practice" && (
        <ListeningPracticeLessonForm
          lessonId={lesson.id}
          content={lesson.content}
          onUpdate={updateContent}
        />
      )}
      {lesson.lessonType === "vocal_hack" && (
        <VocalHackLessonForm
          lessonId={lesson.id}
          content={lesson.content}
          onUpdate={updateContent}
        />
      )}
      {lesson.lessonType === "diary" && (
        <DiaryLessonForm
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
// Audio Lesson Form
// ---------------------------------------------------------------------------

function AudioLessonForm({
  lessonId,
  content,
  onUpdate,
}: {
  lessonId: string;
  content: Record<string, unknown>;
  onUpdate: (next: Record<string, unknown>) => void;
}) {
  const audioUrl = (content.audioUrl as string) ?? "";
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
        "audio",
        file,
        controller.signal,
        setUploadPct,
      );
      const nextContent = { ...content, audioUrl: result.url };
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
      {/* Audio upload area */}
      <div className="rounded-lg border border-border bg-card p-5 space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Audio file</h3>
        {audioUrl ? (
          <div className="rounded-md border border-border bg-background p-3 flex items-center gap-3">
            <Music className="w-5 h-5 text-purple-500" />
            <span className="text-xs text-muted-foreground flex-1 truncate">
              {audioUrl.split("/").pop()}
            </span>
            <label className="cursor-pointer">
              <input
                type="file"
                accept="audio/mpeg,audio/mp4,audio/m4a,audio/x-m4a,audio/wav,audio/ogg,audio/aac"
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
              accept="audio/mpeg,audio/mp4,audio/m4a,audio/x-m4a,audio/wav,audio/ogg,audio/aac"
              className="hidden"
              onChange={handleUpload}
              disabled={uploading}
            />
            <div className="rounded-md border border-dashed border-border bg-muted/30 p-6 text-center hover:bg-muted/50 transition-colors">
              <Upload className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                Click to upload MP3, M4A, WAV, or AAC (up to 500MB)
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
            placeholder="What students will learn in this audio"
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
            placeholder="Full audio transcript"
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
          <div className="space-y-2">
            <div className="overflow-hidden rounded-md bg-black">
              <video
                key={videoUrl}
                src={`/api/admin/course-library/blob-preview?url=${encodeURIComponent(videoUrl)}`}
                controls
                preload="metadata"
                className="mx-auto max-h-72 w-full"
              />
            </div>
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
                Click to upload MP4 (up to 10GB)
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

// ---------------------------------------------------------------------------
// Form Embed Lesson Form
// ---------------------------------------------------------------------------

function FormLessonForm({
  lessonId,
  content,
  onUpdate,
}: {
  lessonId: string;
  content: Record<string, unknown>;
  onUpdate: (next: Record<string, unknown>) => void;
}) {
  const embedUrl = (content.embedUrl as string) ?? "";
  const embedHeight = (content.embedHeight as number) ?? 600;
  const description = (content.description as string) ?? "";
  const embedSource = (content.embedSource as string) ?? embedUrl;

  const [source, setSource] = useState(embedSource);
  const [height, setHeight] = useState(String(embedHeight));
  const [desc, setDesc] = useState(description);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  const dirty =
    source !== embedSource ||
    height !== String(embedHeight) ||
    desc !== description;

  const resolvedEmbedUrl = extractEmbedUrl(source);
  const isEmbedHtml = looksLikeIframeSnippet(source);
  const isGoogleForms = resolvedEmbedUrl
    ? (() => {
        try {
          const url = new URL(resolvedEmbedUrl);
          return (
            url.hostname === "docs.google.com" &&
            url.pathname.startsWith("/forms/d/e/") &&
            url.pathname.endsWith("/viewform")
          );
        } catch {
          return false;
        }
      })()
    : false;

  const handleSave = async () => {
    if (!resolvedEmbedUrl) {
      setError("Paste a valid iframe embed snippet or direct embed URL.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const heightNum = parseInt(height, 10);
      const nextContent: Record<string, unknown> = {
        ...content,
        embedUrl: resolvedEmbedUrl,
        embedSource: source.trim(),
        embedHeight: isNaN(heightNum) || heightNum < 100 ? 600 : heightNum,
        description: desc,
      };
      const ok = await saveLessonContent(lessonId, nextContent);
      if (ok) {
        onUpdate(nextContent);
        setSavedAt(new Date());
      } else {
        setError("Failed to save form embed settings.");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-5 space-y-4">
        <h3 className="text-sm font-semibold text-foreground">HTML embed settings</h3>
        <div className="rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-muted-foreground space-y-1">
          <p className="font-medium text-foreground">How embeds work</p>
          <p>
            Embed lessons are external iframe content stored as a URL in the lesson
            content. Paste a direct embed URL or the full iframe HTML from Google
            Forms, Typeform, Jotform, or another iframe-compatible provider.
          </p>
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Embed URL or iframe HTML
          </label>
          <textarea
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder={`https://form.typeform.com/to/…\n\n<iframe src="https://docs.google.com/forms/d/e/.../viewform?embedded=true" ...></iframe>`}
            rows={5}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono"
          />
          <p className="mt-1 text-[10px] text-muted-foreground">
            Paste the iframe code from the provider, or paste the embed URL directly.
          </p>
          {resolvedEmbedUrl && (
            <p className="mt-1 text-[10px] text-emerald-500 break-all">
              Detected source: {isEmbedHtml ? "iframe HTML" : "URL"} · {resolvedEmbedUrl}
            </p>
          )}
          {isGoogleForms && (
            <p className="mt-1 text-[10px] text-muted-foreground">
              Google Forms URLs are normalized to the embedded `viewform?embedded=true`
              version so preview and student view use the same iframe source.
            </p>
          )}
          <p className="mt-1 text-[10px] text-muted-foreground">
            We save the normalized `src` URL so the lesson can render the embed directly.
          </p>
          {error && (
            <p className="mt-1 text-[10px] text-red-500">{error}</p>
          )}
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Embed height (px)
          </label>
          <input
            type="number"
            min={200}
            max={2000}
            value={height}
            onChange={(e) => setHeight(e.target.value)}
            className="w-28 rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Instructions (optional)
          </label>
          <RichTextEditor
            value={desc}
            onChange={setDesc}
            placeholder="Tell students what this form is for and how to fill it in"
            compact
          />
        </div>
        {dirty && (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !source.trim()}
              className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
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

      {resolvedEmbedUrl && (
        <div className="rounded-lg border border-border bg-card p-5 space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Preview</h3>
          <iframe
            src={resolvedEmbedUrl}
            style={{ height: `${parseInt(height, 10) || 600}px` }}
            className="w-full rounded-md border border-border"
            title="Form preview"
            allow="camera; microphone; geolocation"
          />
          <p className="text-[10px] text-muted-foreground">
            Preview shows the stored iframe source, not the raw HTML wrapper.
          </p>
        </div>
      )}
    </div>
  );
}

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

// ---------------------------------------------------------------------------
// Text Assignment Lesson Form
// ---------------------------------------------------------------------------

interface SentencePromptDraft {
  id: string;
  label: string;
  description: string;
  order: number;
}

function normalizeSentencePrompts(raw: unknown): SentencePromptDraft[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((p, idx) => {
      const prompt = (p ?? {}) as Record<string, unknown>;
      return {
        id: typeof prompt.id === "string" && prompt.id ? prompt.id : crypto.randomUUID(),
        label: typeof prompt.label === "string" ? prompt.label : `Sentence ${idx + 1}`,
        description: typeof prompt.description === "string" ? prompt.description : "",
        order: typeof prompt.order === "number" ? prompt.order : idx,
      };
    })
    .sort((a, b) => a.order - b.order);
}

function TextAssignmentLessonForm({
  lessonId,
  content,
  onUpdate,
}: {
  lessonId: string;
  content: Record<string, unknown>;
  onUpdate: (next: Record<string, unknown>) => void;
}) {
  const savedDescription = (content.description as string) ?? "";
  const savedPrompts = normalizeSentencePrompts(content.sentencePrompts);

  const [description, setDescription] = useState(savedDescription);
  const [prompts, setPrompts] = useState<SentencePromptDraft[]>(
    savedPrompts.length > 0
      ? savedPrompts
      : [{ id: crypto.randomUUID(), label: "Sentence 1", description: "", order: 0 }],
  );
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  const dirty =
    description !== savedDescription ||
    JSON.stringify(prompts) !== JSON.stringify(savedPrompts);

  const updatePrompt = (id: string, patch: Partial<SentencePromptDraft>) => {
    setPrompts((prev) =>
      prev.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    );
  };

  const addPrompt = () => {
    setPrompts((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        label: `Sentence ${prev.length + 1}`,
        description: "",
        order: prev.length,
      },
    ]);
  };

  const removePrompt = (id: string) => {
    setPrompts((prev) =>
      prev
        .filter((p) => p.id !== id)
        .map((p, idx) => ({ ...p, order: idx })),
    );
  };

  const movePrompt = (id: string, direction: -1 | 1) => {
    setPrompts((prev) => {
      const idx = prev.findIndex((p) => p.id === id);
      const target = idx + direction;
      if (idx < 0 || target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[target]] = [next[target], next[idx]];
      return next.map((p, i) => ({ ...p, order: i }));
    });
  };

  const handleSave = async () => {
    if (prompts.length === 0) {
      setError("A text assignment needs at least one sentence box.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const nextContent = {
        ...content,
        description,
        sentencePrompts: prompts.map((p, idx) => ({ ...p, order: idx })),
      };
      const ok = await saveLessonContent(lessonId, nextContent);
      if (ok) {
        onUpdate(nextContent);
        setSavedAt(new Date());
      } else {
        setError("Failed to save assignment settings.");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-5 space-y-3">
        <h3 className="text-sm font-semibold text-foreground">
          Assignment Description
        </h3>
        <p className="text-xs text-muted-foreground">
          Instructions students see above the sentence boxes. Supports bold,
          bullet points, links, and images.
        </p>
        <RichTextEditor
          value={description}
          onChange={setDescription}
          placeholder="Write the assignment instructions here..."
        />
      </div>

      <div className="rounded-lg border border-border bg-card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              Sentence Boxes ({prompts.length})
            </h3>
            <p className="text-xs text-muted-foreground">
              One Mandarin submission box per prompt. Students type a sentence
              and press Enter to generate pinyin + English.
            </p>
          </div>
          <button
            type="button"
            onClick={addPrompt}
            className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent"
          >
            <Plus className="w-3.5 h-3.5" />
            Add sentence box
          </button>
        </div>

        <div className="space-y-3">
          {prompts.map((prompt, idx) => (
            <div
              key={prompt.id}
              className="rounded-md border border-border bg-background p-3 space-y-2"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Box {idx + 1}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => movePrompt(prompt.id, -1)}
                    disabled={idx === 0}
                    className="p-1 text-muted-foreground/60 hover:text-foreground disabled:opacity-30"
                    title="Move up"
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => movePrompt(prompt.id, 1)}
                    disabled={idx === prompts.length - 1}
                    className="p-1 text-muted-foreground/60 hover:text-foreground disabled:opacity-30"
                    title="Move down"
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => removePrompt(prompt.id)}
                    disabled={prompts.length <= 1}
                    className="p-1 text-muted-foreground/60 hover:text-red-500 disabled:opacity-30"
                    title="Remove sentence box"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">
                  Label
                </label>
                <input
                  type="text"
                  value={prompt.label}
                  onChange={(e) => updatePrompt(prompt.id, { label: e.target.value })}
                  placeholder={`Sentence ${idx + 1}`}
                  className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">
                  Description
                </label>
                <input
                  type="text"
                  value={prompt.description}
                  onChange={(e) =>
                    updatePrompt(prompt.id, { description: e.target.value })
                  }
                  placeholder="e.g. Describe where you went."
                  className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-500">
          {error}
        </div>
      )}

      <div className="flex items-center justify-end gap-3">
        {savedAt && !dirty && (
          <span className="text-[10px] text-emerald-500">
            Saved at {savedAt.toLocaleTimeString()}
          </span>
        )}
        {dirty && (
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
            Save assignment
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Listening Practice Lesson Form
// ---------------------------------------------------------------------------

interface ListeningSentenceDraft {
  id: string;
  chinese: string;
  pinyin: string;
  english: string;
  audioUrl: string | null;
}

function normalizeListeningSentences(raw: unknown): ListeningSentenceDraft[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((s, idx) => {
      const sentence = (s ?? {}) as Record<string, unknown>;
      return {
        id:
          typeof sentence.id === "string" && sentence.id
            ? sentence.id
            : crypto.randomUUID(),
        order: typeof sentence.order === "number" ? sentence.order : idx,
        chinese: typeof sentence.chinese === "string" ? sentence.chinese : "",
        pinyin: typeof sentence.pinyin === "string" ? sentence.pinyin : "",
        english: typeof sentence.english === "string" ? sentence.english : "",
        audioUrl:
          typeof sentence.audioUrl === "string" ? sentence.audioUrl : null,
      };
    })
    .sort((a, b) => a.order - b.order)
    .map(({ id, chinese, pinyin, english, audioUrl }) => ({
      id,
      chinese,
      pinyin,
      english,
      audioUrl,
    }));
}

interface ListeningResultRow {
  userId: string;
  name: string | null;
  email: string;
  score: number;
  correct: number;
  resolved: number;
  total: number;
  completedAt: string | null;
}

function ListeningPracticeLessonForm({
  lessonId,
  content,
  onUpdate,
}: {
  lessonId: string;
  content: Record<string, unknown>;
  onUpdate: (next: Record<string, unknown>) => void;
}) {
  const savedDescription = (content.description as string) ?? "";
  const savedSentences = normalizeListeningSentences(content.sentences);

  const [description, setDescription] = useState(savedDescription);
  const [sentences, setSentences] = useState<ListeningSentenceDraft[]>(
    savedSentences.length > 0
      ? savedSentences
      : [
          {
            id: crypto.randomUUID(),
            chinese: "",
            pinyin: "",
            english: "",
            audioUrl: null,
          },
        ],
  );
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [translatingId, setTranslatingId] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [uploadPct, setUploadPct] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  // Student results panel.
  const [showResults, setShowResults] = useState(false);
  const [results, setResults] = useState<ListeningResultRow[] | null>(null);
  const [loadingResults, setLoadingResults] = useState(false);

  const dirty =
    description !== savedDescription ||
    JSON.stringify(sentences) !== JSON.stringify(savedSentences);

  const updateSentence = (id: string, patch: Partial<ListeningSentenceDraft>) => {
    setSentences((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    );
  };

  const addSentence = () => {
    setSentences((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        chinese: "",
        pinyin: "",
        english: "",
        audioUrl: null,
      },
    ]);
  };

  const removeSentence = (id: string) => {
    setSentences((prev) => prev.filter((s) => s.id !== id));
  };

  const moveSentence = (id: string, direction: -1 | 1) => {
    setSentences((prev) => {
      const idx = prev.findIndex((s) => s.id === id);
      const target = idx + direction;
      if (idx < 0 || target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  };

  const generatePinyin = async (id: string, chinese: string) => {
    if (!chinese.trim()) return;
    setGeneratingId(id);
    try {
      const pinyin = await generateModelPinyin(chinese);
      updateSentence(id, { pinyin });
    } finally {
      setGeneratingId(null);
    }
  };

  const generateEnglish = async (id: string, chinese: string) => {
    if (!chinese.trim()) return;
    setTranslatingId(id);
    try {
      const translations = await fetchProperTranslations([chinese], "zh-CN");
      const english = translations?.join(" ").trim();
      if (english) updateSentence(id, { english });
    } finally {
      setTranslatingId(null);
    }
  };

  // On Chinese blur, auto-fill any empty pinyin / English so admins usually
  // just type the sentence and correct the rest.
  const handleChineseBlur = (sentence: ListeningSentenceDraft) => {
    if (!sentence.chinese.trim()) return;
    if (!sentence.pinyin.trim()) generatePinyin(sentence.id, sentence.chinese);
    if (!sentence.english.trim()) generateEnglish(sentence.id, sentence.chinese);
  };

  const handleUploadOverride = async (
    id: string,
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingId(id);
    setUploadPct(0);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const result = await uploadWithProgress(
        "audio",
        file,
        controller.signal,
        setUploadPct,
      );
      updateSentence(id, { audioUrl: result.url });
    } catch {
      // ignore — admin can retry
    } finally {
      setUploadingId(null);
      setUploadPct(0);
      abortRef.current = null;
      e.target.value = "";
    }
  };

  const handleSave = async () => {
    const cleaned = sentences.filter((s) => s.chinese.trim());
    if (cleaned.length === 0) {
      setError("Add at least one sentence with Chinese text.");
      return;
    }
    const missingPinyin = cleaned.find((s) => !s.pinyin.trim());
    if (missingPinyin) {
      setError(
        "Every sentence needs a pinyin model answer. Type the Chinese and it auto-generates.",
      );
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const nextContent = {
        ...content,
        description,
        sentences: cleaned.map((s, idx) => ({
          id: s.id,
          order: idx,
          chinese: s.chinese.trim(),
          pinyin: s.pinyin.trim(),
          english: s.english.trim(),
          audioUrl: s.audioUrl || null,
        })),
      };
      const ok = await saveLessonContent(lessonId, nextContent);
      if (ok) {
        onUpdate(nextContent);
        setSavedAt(new Date());
      } else {
        setError("Failed to save listening practice.");
      }
    } finally {
      setSaving(false);
    }
  };

  const loadResults = async () => {
    setShowResults(true);
    setLoadingResults(true);
    try {
      const res = await fetch(
        `/api/admin/course-library/lessons/${lessonId}/listening-results`,
      );
      const data = await res.json();
      if (res.ok) setResults(data.results ?? []);
      else setResults([]);
    } catch {
      setResults([]);
    } finally {
      setLoadingResults(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-5 space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Instructions</h3>
        <p className="text-xs text-muted-foreground">
          Shown above the sentences. Tell students to listen and type the pinyin.
        </p>
        <RichTextEditor
          value={description}
          onChange={setDescription}
          placeholder="e.g. Listen to each clip and type the pinyin. Tones and spaces don't matter."
        />
      </div>

      <div className="rounded-lg border border-border bg-card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              Sentences ({sentences.length})
            </h3>
            <p className="text-xs text-muted-foreground">
              Type the Chinese — audio is auto-generated and the pinyin model
              answer is filled in for you (editable). Optionally upload your own
              recording to replace the generated audio.
            </p>
          </div>
          <button
            type="button"
            onClick={addSentence}
            className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent"
          >
            <Plus className="w-3.5 h-3.5" />
            Add sentence
          </button>
        </div>

        <div className="space-y-3">
          {sentences.map((sentence, idx) => {
            const hanCount = countHanCharacters(sentence.chinese);
            const syllableCount = sentence.pinyin.trim()
              ? sentence.pinyin.trim().split(/\s+/).length
              : 0;
            const mismatch =
              sentence.chinese.trim() &&
              sentence.pinyin.trim() &&
              hanCount !== syllableCount;

            return (
              <div
                key={sentence.id}
                className="rounded-md border border-border bg-background p-3 space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Sentence {idx + 1}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => moveSentence(sentence.id, -1)}
                      disabled={idx === 0}
                      className="p-1 text-muted-foreground/60 hover:text-foreground disabled:opacity-30"
                      title="Move up"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveSentence(sentence.id, 1)}
                      disabled={idx === sentences.length - 1}
                      className="p-1 text-muted-foreground/60 hover:text-foreground disabled:opacity-30"
                      title="Move down"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeSentence(sentence.id)}
                      disabled={sentences.length <= 1}
                      className="p-1 text-muted-foreground/60 hover:text-red-500 disabled:opacity-30"
                      title="Remove sentence"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    Chinese sentence
                  </label>
                  <input
                    type="text"
                    value={sentence.chinese}
                    onChange={(e) =>
                      updateSentence(sentence.id, { chinese: e.target.value })
                    }
                    onBlur={() => handleChineseBlur(sentence)}
                    placeholder="例如：你吃饭了吗"
                    className="w-full rounded-md border border-border bg-card px-3 py-2 text-base"
                  />
                </div>

                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <label className="block text-xs font-medium text-muted-foreground">
                      Pinyin model answer
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        generatePinyin(sentence.id, sentence.chinese)
                      }
                      disabled={
                        !sentence.chinese.trim() || generatingId === sentence.id
                      }
                      className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline disabled:opacity-40"
                    >
                      {generatingId === sentence.id ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Sparkles className="w-3 h-3" />
                      )}
                      Regenerate
                    </button>
                  </div>
                  <input
                    type="text"
                    value={sentence.pinyin}
                    onChange={(e) =>
                      updateSentence(sentence.id, { pinyin: e.target.value })
                    }
                    placeholder="nǐ chī fàn le ma"
                    className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
                  />
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    Checking ignores tones and spaces — this is only used to
                    grade and to reveal the pinyin after a correct answer.
                  </p>
                  {mismatch ? (
                    <p className="mt-1 text-[10px] text-amber-500">
                      {syllableCount} syllables for {hanCount} characters — the
                      reveal aligns one syllable per character, so double-check
                      the spacing.
                    </p>
                  ) : null}
                </div>

                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <label className="block text-xs font-medium text-muted-foreground">
                      English translation
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        generateEnglish(sentence.id, sentence.chinese)
                      }
                      disabled={
                        !sentence.chinese.trim() ||
                        translatingId === sentence.id
                      }
                      className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline disabled:opacity-40"
                    >
                      {translatingId === sentence.id ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Sparkles className="w-3 h-3" />
                      )}
                      Regenerate
                    </button>
                  </div>
                  <input
                    type="text"
                    value={sentence.english}
                    onChange={(e) =>
                      updateSentence(sentence.id, { english: e.target.value })
                    }
                    placeholder="Have you eaten yet?"
                    className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
                  />
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    Shown beneath the Chinese for students, before and after they
                    answer.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    Audio
                  </label>
                  {sentence.audioUrl ? (
                    <div className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2">
                      <Music className="w-4 h-4 text-purple-500" />
                      <span className="flex-1 truncate text-xs text-muted-foreground">
                        Custom recording uploaded
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          updateSentence(sentence.id, { audioUrl: null })
                        }
                        className="text-xs text-red-500 hover:text-red-400"
                      >
                        Remove
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <span className="inline-flex items-center gap-1 rounded-md bg-indigo-500/10 px-2 py-1 text-[11px] text-indigo-500">
                        <Sparkles className="w-3 h-3" />
                        Auto-generated (TTS)
                      </span>
                      <label className="cursor-pointer text-[11px] text-primary hover:underline">
                        <input
                          type="file"
                          accept="audio/mpeg,audio/mp4,audio/m4a,audio/x-m4a,audio/wav,audio/ogg,audio/aac"
                          className="hidden"
                          onChange={(e) => handleUploadOverride(sentence.id, e)}
                          disabled={uploadingId === sentence.id}
                        />
                        {uploadingId === sentence.id
                          ? `Uploading… ${uploadPct}%`
                          : "Upload your own recording"}
                      </label>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-500">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={loadResults}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent"
        >
          <BarChart3 className="w-3.5 h-3.5" />
          View student results
        </button>
        <div className="flex items-center gap-3">
          {savedAt && !dirty && (
            <span className="text-[10px] text-emerald-500">
              Saved at {savedAt.toLocaleTimeString()}
            </span>
          )}
          {dirty && (
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
              Save listening practice
            </button>
          )}
        </div>
      </div>

      {showResults && (
        <div className="rounded-lg border border-border bg-card p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">
              Student results
            </h3>
            <button
              type="button"
              onClick={() => setShowResults(false)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Hide
            </button>
          </div>
          {loadingResults ? (
            <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading…
            </div>
          ) : !results || results.length === 0 ? (
            <p className="py-2 text-sm text-muted-foreground">
              No students have attempted this yet. Save your changes first if you
              just edited the sentences.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Student</th>
                    <th className="py-2 pr-3 font-medium">Score</th>
                    <th className="py-2 pr-3 font-medium">Correct</th>
                    <th className="py-2 pr-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r) => (
                    <tr key={r.userId} className="border-b border-border/50">
                      <td className="py-2 pr-3">
                        <div className="font-medium text-foreground">
                          {r.name || "Unnamed"}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {r.email}
                        </div>
                      </td>
                      <td className="py-2 pr-3 font-semibold text-foreground">
                        {r.score}%
                      </td>
                      <td className="py-2 pr-3 text-muted-foreground">
                        {r.correct}/{r.total}
                      </td>
                      <td className="py-2 pr-3">
                        {r.completedAt ? (
                          <span className="text-emerald-500">Completed</span>
                        ) : (
                          <span className="text-muted-foreground">
                            In progress ({r.resolved}/{r.total})
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Vocal Hack Lesson Form
// ---------------------------------------------------------------------------

interface VocalHackSentenceDraft {
  id: string;
  videoUrl: string | null;
  chinese: string;
  pinyin: string;
  english: string;
}

function normalizeVocalHackSentences(raw: unknown): VocalHackSentenceDraft[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((s, idx) => {
      const sentence = (s ?? {}) as Record<string, unknown>;
      return {
        id:
          typeof sentence.id === "string" && sentence.id
            ? sentence.id
            : crypto.randomUUID(),
        order: typeof sentence.order === "number" ? sentence.order : idx,
        videoUrl:
          typeof sentence.videoUrl === "string" ? sentence.videoUrl : null,
        chinese: typeof sentence.chinese === "string" ? sentence.chinese : "",
        pinyin: typeof sentence.pinyin === "string" ? sentence.pinyin : "",
        english: typeof sentence.english === "string" ? sentence.english : "",
      };
    })
    .sort((a, b) => a.order - b.order)
    .map(({ id, videoUrl, chinese, pinyin, english }) => ({
      id,
      videoUrl,
      chinese,
      pinyin,
      english,
    }));
}

function VocalHackLessonForm({
  lessonId,
  content,
  onUpdate,
}: {
  lessonId: string;
  content: Record<string, unknown>;
  onUpdate: (next: Record<string, unknown>) => void;
}) {
  const savedDescription = (content.description as string) ?? "";
  const savedSentences = normalizeVocalHackSentences(content.sentences);

  const [description, setDescription] = useState(savedDescription);
  const [sentences, setSentences] = useState<VocalHackSentenceDraft[]>(
    savedSentences.length > 0
      ? savedSentences
      : [
          {
            id: crypto.randomUUID(),
            videoUrl: null,
            chinese: "",
            pinyin: "",
            english: "",
          },
        ],
  );
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [translatingId, setTranslatingId] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [uploadPct, setUploadPct] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  const dirty =
    description !== savedDescription ||
    JSON.stringify(sentences) !== JSON.stringify(savedSentences);

  const updateSentence = (
    id: string,
    patch: Partial<VocalHackSentenceDraft>,
  ) => {
    setSentences((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    );
  };

  const addSentence = () => {
    setSentences((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        videoUrl: null,
        chinese: "",
        pinyin: "",
        english: "",
      },
    ]);
  };

  const removeSentence = (id: string) => {
    setSentences((prev) => prev.filter((s) => s.id !== id));
  };

  const moveSentence = (id: string, direction: -1 | 1) => {
    setSentences((prev) => {
      const idx = prev.findIndex((s) => s.id === id);
      const target = idx + direction;
      if (idx < 0 || target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  };

  const generatePinyin = async (id: string, chinese: string) => {
    if (!chinese.trim()) return;
    setGeneratingId(id);
    try {
      const pinyin = await generateModelPinyin(chinese);
      updateSentence(id, { pinyin });
    } finally {
      setGeneratingId(null);
    }
  };

  const generateEnglish = async (id: string, chinese: string) => {
    if (!chinese.trim()) return;
    setTranslatingId(id);
    try {
      const translations = await fetchProperTranslations([chinese], "zh-CN");
      const english = translations?.join(" ").trim();
      if (english) updateSentence(id, { english });
    } finally {
      setTranslatingId(null);
    }
  };

  const handleChineseBlur = (sentence: VocalHackSentenceDraft) => {
    if (!sentence.chinese.trim()) return;
    if (!sentence.pinyin.trim()) generatePinyin(sentence.id, sentence.chinese);
    if (!sentence.english.trim())
      generateEnglish(sentence.id, sentence.chinese);
  };

  const handleUploadVideo = async (
    id: string,
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingId(id);
    setUploadPct(0);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const result = await uploadWithProgress(
        "video",
        file,
        controller.signal,
        setUploadPct,
      );
      updateSentence(id, { videoUrl: result.url });
    } catch {
      // ignore — admin can retry
    } finally {
      setUploadingId(null);
      setUploadPct(0);
      abortRef.current = null;
      e.target.value = "";
    }
  };

  const handleSave = async () => {
    const cleaned = sentences.filter((s) => s.chinese.trim());
    if (cleaned.length === 0) {
      setError("Add at least one sentence with Chinese text.");
      return;
    }
    const missingVideo = cleaned.find((s) => !s.videoUrl);
    if (missingVideo) {
      setError("Every sentence needs a coach video.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const nextContent = {
        ...content,
        description,
        sentences: cleaned.map((s, idx) => ({
          id: s.id,
          order: idx,
          videoUrl: s.videoUrl,
          chinese: s.chinese.trim(),
          pinyin: s.pinyin.trim(),
          english: s.english.trim(),
        })),
      };
      const ok = await saveLessonContent(lessonId, nextContent);
      if (ok) {
        onUpdate(nextContent);
        setSavedAt(new Date());
      } else {
        setError("Failed to save Vocal Hack.");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-5 space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Instructions</h3>
        <p className="text-xs text-muted-foreground">
          Shown above the sentences. Tell students to watch each video, then
          record themselves reading the sentence.
        </p>
        <RichTextEditor
          value={description}
          onChange={setDescription}
          placeholder="e.g. Watch the coach read each sentence, then record yourself imitating it as closely as you can."
        />
      </div>

      <div className="rounded-lg border border-border bg-card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              Sentences ({sentences.length})
            </h3>
            <p className="text-xs text-muted-foreground">
              Upload the coach video and type the Chinese — pinyin and English
              auto-generate (editable). Students record themselves reading each
              sentence and submit for review.
            </p>
          </div>
          <button
            type="button"
            onClick={addSentence}
            className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent"
          >
            <Plus className="w-3.5 h-3.5" />
            Add sentence
          </button>
        </div>

        <div className="space-y-3">
          {sentences.map((sentence, idx) => {
            const hanCount = countHanCharacters(sentence.chinese);
            const syllableCount = sentence.pinyin.trim()
              ? sentence.pinyin.trim().split(/\s+/).length
              : 0;
            const mismatch =
              sentence.chinese.trim() &&
              sentence.pinyin.trim() &&
              hanCount !== syllableCount;

            return (
              <div
                key={sentence.id}
                className="rounded-md border border-border bg-background p-3 space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Sentence {idx + 1}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => moveSentence(sentence.id, -1)}
                      disabled={idx === 0}
                      className="p-1 text-muted-foreground/60 hover:text-foreground disabled:opacity-30"
                      title="Move up"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveSentence(sentence.id, 1)}
                      disabled={idx === sentences.length - 1}
                      className="p-1 text-muted-foreground/60 hover:text-foreground disabled:opacity-30"
                      title="Move down"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeSentence(sentence.id)}
                      disabled={sentences.length <= 1}
                      className="p-1 text-muted-foreground/60 hover:text-red-500 disabled:opacity-30"
                      title="Remove sentence"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                <div className="sm:shrink-0">
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    Coach video
                  </label>
                  {sentence.videoUrl ? (
                    <div className="space-y-2">
                      <video
                        key={sentence.videoUrl}
                        src={`/api/admin/course-library/blob-preview?url=${encodeURIComponent(sentence.videoUrl)}`}
                        controls
                        preload="metadata"
                        className="h-auto max-h-72 w-auto max-w-[240px] rounded-md bg-black"
                      />
                      <div className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2">
                        <Video className="w-4 h-4 text-red-500" />
                        <span className="flex-1 truncate text-xs text-muted-foreground">
                          Video uploaded — preview above
                        </span>
                        <label className="cursor-pointer text-xs text-primary hover:underline">
                          <input
                            type="file"
                            accept="video/mp4,video/quicktime,video/webm"
                            className="hidden"
                            onChange={(e) => handleUploadVideo(sentence.id, e)}
                            disabled={uploadingId === sentence.id}
                          />
                          {uploadingId === sentence.id
                            ? `Uploading… ${uploadPct}%`
                            : "Replace"}
                        </label>
                      </div>
                    </div>
                  ) : (
                    <label className="block cursor-pointer">
                      <input
                        type="file"
                        accept="video/mp4,video/quicktime,video/webm"
                        className="hidden"
                        onChange={(e) => handleUploadVideo(sentence.id, e)}
                        disabled={uploadingId === sentence.id}
                      />
                      <div className="rounded-md border border-dashed border-border bg-muted/30 p-4 text-center hover:bg-muted/50 transition-colors">
                        <Upload className="mx-auto mb-1 h-5 w-5 text-muted-foreground/40" />
                        <p className="text-xs text-muted-foreground">
                          {uploadingId === sentence.id
                            ? `Uploading… ${uploadPct}%`
                            : "Upload coach video (MP4, MOV, WebM)"}
                        </p>
                      </div>
                    </label>
                  )}
                </div>

                <div className="min-w-0 flex-1 space-y-2">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    Chinese sentence
                  </label>
                  <input
                    type="text"
                    value={sentence.chinese}
                    onChange={(e) =>
                      updateSentence(sentence.id, { chinese: e.target.value })
                    }
                    onBlur={() => handleChineseBlur(sentence)}
                    placeholder="例如：这是例句"
                    className="w-full rounded-md border border-border bg-card px-3 py-2 text-base"
                  />
                </div>

                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <label className="block text-xs font-medium text-muted-foreground">
                      Pinyin
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        generatePinyin(sentence.id, sentence.chinese)
                      }
                      disabled={
                        !sentence.chinese.trim() || generatingId === sentence.id
                      }
                      className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline disabled:opacity-40"
                    >
                      {generatingId === sentence.id ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Sparkles className="w-3 h-3" />
                      )}
                      Regenerate
                    </button>
                  </div>
                  <input
                    type="text"
                    value={sentence.pinyin}
                    onChange={(e) =>
                      updateSentence(sentence.id, { pinyin: e.target.value })
                    }
                    placeholder="zhè shì lì jù"
                    className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
                  />
                  {mismatch ? (
                    <p className="mt-1 text-[10px] text-amber-500">
                      {syllableCount} syllables for {hanCount} characters — the
                      display aligns one syllable per character, so double-check
                      the spacing.
                    </p>
                  ) : null}
                </div>

                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <label className="block text-xs font-medium text-muted-foreground">
                      English translation
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        generateEnglish(sentence.id, sentence.chinese)
                      }
                      disabled={
                        !sentence.chinese.trim() ||
                        translatingId === sentence.id
                      }
                      className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline disabled:opacity-40"
                    >
                      {translatingId === sentence.id ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Sparkles className="w-3 h-3" />
                      )}
                      Regenerate
                    </button>
                  </div>
                  <input
                    type="text"
                    value={sentence.english}
                    onChange={(e) =>
                      updateSentence(sentence.id, { english: e.target.value })
                    }
                    placeholder="This is an example sentence"
                    className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
                  />
                </div>
                </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-500">
          {error}
        </div>
      )}

      <div className="flex items-center justify-end gap-3">
        {savedAt && !dirty && (
          <span className="text-[10px] text-emerald-500">
            Saved at {savedAt.toLocaleTimeString()}
          </span>
        )}
        {dirty && (
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
            Save Vocal Hack
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Diary Lesson Form — instructions only. Students write a paragraph and record
// themselves reading it; there's no per-sentence config to author.
// ---------------------------------------------------------------------------

function DiaryLessonForm({
  lessonId,
  content,
  onUpdate,
}: {
  lessonId: string;
  content: Record<string, unknown>;
  onUpdate: (next: Record<string, unknown>) => void;
}) {
  const savedDescription = (content.description as string) ?? "";
  const [description, setDescription] = useState(savedDescription);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  const dirty = description !== savedDescription;

  const handleSave = async () => {
    setSaving(true);
    try {
      const nextContent = { ...content, description };
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
        <h3 className="text-sm font-semibold text-foreground">Instructions</h3>
        <p className="text-xs text-muted-foreground">
          Shown above the diary box. Tell students what to write about, then that
          they should record themselves reading their entry aloud.
        </p>
        <RichTextEditor
          value={description}
          onChange={setDescription}
          placeholder="e.g. Write a short diary entry (3–5 sentences) about your day, then record yourself reading it aloud."
        />
        <div className="flex items-center justify-end gap-3">
          {savedAt && !dirty && (
            <span className="text-[10px] text-emerald-500">
              Saved at {savedAt.toLocaleTimeString()}
            </span>
          )}
          {dirty && (
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
              Save Diary
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
