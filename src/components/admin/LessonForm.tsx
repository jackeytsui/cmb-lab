"use client";

import { useState, useEffect, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ErrorAlert } from "@/components/ui/error-alert";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { Plus, Trash2, Link as LinkIcon, FileText, Upload, X } from "lucide-react";
import type { Lesson } from "@/db/schema/courses";
import type { LessonAttachment } from "@/db/schema/courses";
import type { AssignmentLessonType, ChallengeConfig, ListeningPracticeConfig, VocalHackConfig } from "@/lib/assignment-types";
import { ASSIGNMENT_TYPE_LABELS } from "@/lib/assignment-types";

const ALL_LESSON_TYPES: AssignmentLessonType[] = [
  "standard",
  "challenge",
  "listening_practice",
  "vocal_hack",
  "diary_challenge",
];

const lessonSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  content: z.string().optional(),
  lessonType: z.enum(["standard", "challenge", "listening_practice", "vocal_hack", "diary_challenge"]).default("standard"),
  confirmationMessage: z.string().optional(),
  embedUrl: z.string().optional(),
  muxPlaybackId: z.string().optional(),
  durationSeconds: z.coerce.number().int().min(0).optional().or(z.literal("")),
  sortOrder: z.coerce.number().int().min(0).default(0),
});

type LessonFormData = {
  title: string;
  description?: string;
  content?: string;
  lessonType: AssignmentLessonType;
  confirmationMessage?: string;
  embedUrl?: string;
  muxPlaybackId?: string;
  durationSeconds?: number | "";
  sortOrder: number;
};

interface LessonFormProps {
  moduleId: string;
  lesson?: Lesson & { content?: string | null };
  onSuccess: () => void;
  onCancel: () => void;
}

/**
 * Form for creating and editing lessons.
 * Handles both create (POST) and edit (PUT) modes based on lesson prop.
 */
export function LessonForm({
  moduleId,
  lesson,
  onSuccess,
  onCancel,
}: LessonFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Attachments state
  const [attachments, setAttachments] = useState<LessonAttachment[]>([]);
  const [loadingAttachments, setLoadingAttachments] = useState(false);
  const [newAttachmentTitle, setNewAttachmentTitle] = useState("");
  const [newAttachmentUrl, setNewAttachmentUrl] = useState("");
  const [isAddingAttachment, setIsAddingAttachment] = useState(false);
  const [attachmentType, setAttachmentType] = useState<'link' | 'file'>('link');
  const [fileToUpload, setFileToUpload] = useState<File | null>(null);

  // Assignment config state (parsed from lesson.assignmentConfig JSON)
  const [challengeConfig, setChallengeConfig] = useState<ChallengeConfig>({ sentenceCount: 1 });
  const [listeningConfig, setListeningConfig] = useState<ListeningPracticeConfig>({
    audioBlobUrl: "",
    sentences: [],
  });
  const [vocalConfig, setVocalConfig] = useState<VocalHackConfig>({ sentences: [] });
  const [listeningAudioUploading, setListeningAudioUploading] = useState(false);

  const isEditMode = !!lesson;

  const rawType = (lesson as { lessonType?: string })?.lessonType;
  const initialType: AssignmentLessonType = (ALL_LESSON_TYPES as string[]).includes(rawType ?? "")
    ? (rawType as AssignmentLessonType)
    : "standard";

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<LessonFormData>({
    resolver: zodResolver(lessonSchema) as never,
    defaultValues: {
      title: lesson?.title || "",
      description: lesson?.description || "",
      content: lesson?.content || "",
      lessonType: initialType,
      confirmationMessage: (lesson as {confirmationMessage?: string})?.confirmationMessage || "",
      embedUrl: (lesson as {embedUrl?: string})?.embedUrl || "",
      muxPlaybackId: lesson?.muxPlaybackId || "",
      durationSeconds: lesson?.durationSeconds || "",
      sortOrder: lesson?.sortOrder || 0,
    },
  });

  // Parse and seed per-type config from existing lesson
  useEffect(() => {
    const raw = (lesson as { assignmentConfig?: string | null })?.assignmentConfig;
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      if (initialType === "challenge") setChallengeConfig(parsed);
      if (initialType === "listening_practice") setListeningConfig(parsed);
      if (initialType === "vocal_hack") setVocalConfig(parsed);
    } catch { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch attachments on mount if editing
  const fetchAttachments = useCallback(async () => {
    if (!lesson?.id) return;
    setLoadingAttachments(true);
    try {
      const res = await fetch(`/api/admin/lessons/${lesson.id}/lesson-attachments`);
      if (res.ok) {
        const data = await res.json();
        setAttachments(data.attachments);
      }
    } catch (e) {
      console.error("Failed to load attachments", e);
    } finally {
      setLoadingAttachments(false);
    }
  }, [lesson?.id]);

  useEffect(() => {
    if (isEditMode) {
      fetchAttachments();
    }
  }, [isEditMode, fetchAttachments]);

  const handleAddAttachment = async () => {
    if (!lesson?.id || !newAttachmentTitle) return;
    
    setIsAddingAttachment(true);
    try {
      if (attachmentType === 'link') {
        if (!newAttachmentUrl) return;
        const res = await fetch(`/api/admin/lessons/${lesson.id}/lesson-attachments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: newAttachmentTitle,
            url: newAttachmentUrl,
            type: "link" 
          })
        });
        
        if (res.ok) {
          setNewAttachmentTitle("");
          setNewAttachmentUrl("");
          fetchAttachments();
        }
      } else {
        if (!fileToUpload) return;
        const formData = new FormData();
        formData.append("file", fileToUpload);
        formData.append("title", newAttachmentTitle);

        const res = await fetch(`/api/admin/lessons/${lesson.id}/lesson-attachments/upload`, {
          method: "POST",
          body: formData
        });

        if (res.ok) {
          setNewAttachmentTitle("");
          setFileToUpload(null);
          fetchAttachments();
        }
      }
    } catch (e) {
      console.error("Failed to add attachment", e);
    } finally {
      setIsAddingAttachment(false);
    }
  };

  const handleDeleteAttachment = async (id: string) => {
    if (!confirm("Delete this attachment?")) return;
    try {
      await fetch(`/api/admin/attachments/${id}`, { method: "DELETE" });
      setAttachments(prev => prev.filter(a => a.id !== id));
    } catch (e) {
      console.error("Failed to delete attachment", e);
    }
  };

  const [showVideoPicker, setShowVideoPicker] = useState(false);
  const currentPlaybackId = watch("muxPlaybackId");

  const buildAssignmentConfig = (lessonType: AssignmentLessonType): string | null => {
    if (lessonType === "challenge") return JSON.stringify(challengeConfig);
    if (lessonType === "listening_practice") return JSON.stringify(listeningConfig);
    if (lessonType === "vocal_hack") return JSON.stringify(vocalConfig);
    if (lessonType === "diary_challenge") return JSON.stringify({});
    return null;
  };

  const onSubmit = async (data: LessonFormData) => {
    setIsSubmitting(true);
    setError(null);

    try {
      const url = isEditMode
        ? `/api/admin/lessons/${lesson.id}`
        : "/api/admin/lessons";
      const method = isEditMode ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...data,
          moduleId: isEditMode ? undefined : moduleId,
          description: data.description || null,
          content: data.content || null,
          lessonType: data.lessonType || "standard",
          confirmationMessage: data.confirmationMessage || null,
          assignmentConfig: buildAssignmentConfig(data.lessonType),
          embedUrl: data.embedUrl || null,
          muxPlaybackId: data.muxPlaybackId || null,
          durationSeconds:
            data.durationSeconds !== "" && data.durationSeconds !== undefined
              ? Number(data.durationSeconds)
              : null,
        }),
      });

      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || "Failed to save lesson");
      }

      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save lesson");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="space-y-8 rounded-lg border border-zinc-700 bg-zinc-800 p-6"
    >
      <h3 className="text-xl font-semibold text-white">
        {isEditMode ? "Edit Lesson" : "Create New Lesson"}
      </h3>

      {error && <ErrorAlert message={error} />}

      <div className="space-y-4">
        <div className="space-y-2">
            <Label htmlFor="title" className="text-zinc-300">
            Title <span className="text-red-400">*</span>
            </Label>
            <Input
            id="title"
            {...register("title")}
            placeholder="Enter lesson title"
            className="border-zinc-600 bg-zinc-700 text-white placeholder:text-zinc-400"
            />
            {errors.title && (
            <p className="text-sm text-red-400">{errors.title.message}</p>
            )}
        </div>

        <div className="space-y-2">
            <Label htmlFor="description" className="text-zinc-300">
            Short Description
            </Label>
            <Textarea
            id="description"
            {...register("description")}
            placeholder="Enter a brief summary..."
            rows={2}
            className="resize-y border-zinc-600 bg-zinc-700 text-white placeholder:text-zinc-400"
            />
        </div>

        <div className="space-y-2">
            <Label className="text-zinc-300">Lesson Content</Label>
            <RichTextEditor
            value={watch("content") || ""}
            onChange={(val) => setValue("content", val)}
            placeholder="Write your lesson content here..."
            />
        </div>

        <div className="space-y-2">
          <Label className="text-zinc-300">Lesson Type</Label>
          <select
            {...register("lessonType")}
            className="w-full rounded-md border border-zinc-600 bg-zinc-700 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
          >
            {ALL_LESSON_TYPES.map((t) => (
              <option key={t} value={t}>{ASSIGNMENT_TYPE_LABELS[t]}</option>
            ))}
          </select>
        </div>

        {/* Per-type assignment config panels */}
        {watch("lessonType") === "challenge" && (
          <div className="space-y-4 rounded-lg border border-zinc-700 bg-zinc-900/50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Challenge Config</p>
            <div className="space-y-2">
              <Label className="text-zinc-300">Number of sentence submission boxes</Label>
              <Input
                type="number"
                min={1}
                max={9}
                value={challengeConfig.sentenceCount}
                onChange={(e) =>
                  setChallengeConfig({ sentenceCount: Math.min(9, Math.max(1, Number(e.target.value))) })
                }
                className="w-24 border-zinc-600 bg-zinc-700 text-white"
              />
              <p className="text-xs text-zinc-500">Students see this many text boxes (1–9).</p>
            </div>
          </div>
        )}

        {watch("lessonType") === "listening_practice" && (
          <div className="space-y-4 rounded-lg border border-zinc-700 bg-zinc-900/50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Listening Practice Config</p>
            {/* Audio upload */}
            <div className="space-y-2">
              <Label className="text-zinc-300">Audio file</Label>
              {listeningConfig.audioBlobUrl && (
                <p className="text-xs text-green-400 break-all">{listeningConfig.audioBlobUrl}</p>
              )}
              <div className="flex items-center gap-2">
                <label className="cursor-pointer flex items-center gap-2 rounded-lg border border-zinc-600 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-700 transition-colors">
                  <Upload className="w-4 h-4" />
                  {listeningAudioUploading ? "Uploading…" : listeningConfig.audioBlobUrl ? "Replace audio" : "Upload audio"}
                  <input
                    type="file"
                    accept="audio/*"
                    className="hidden"
                    disabled={listeningAudioUploading}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setListeningAudioUploading(true);
                      const form = new FormData();
                      form.append("file", file);
                      form.append("prefix", "listening-practice/");
                      try {
                        const res = await fetch("/api/assignments/upload-audio", { method: "POST", body: form });
                        if (!res.ok) throw new Error("Upload failed");
                        const { url } = await res.json();
                        setListeningConfig((prev) => ({ ...prev, audioBlobUrl: url }));
                      } catch {
                        alert("Audio upload failed");
                      } finally {
                        setListeningAudioUploading(false);
                      }
                    }}
                  />
                </label>
              </div>
            </div>
            {/* Sentences */}
            <div className="space-y-3">
              <Label className="text-zinc-300">Sentences</Label>
              {listeningConfig.sentences.map((s, i) => (
                <div key={i} className="flex items-start gap-2 rounded-lg border border-zinc-700 bg-zinc-800 p-3">
                  <div className="flex-1 space-y-2">
                    <Input
                      placeholder="Chinese characters e.g. 你吃饭了吗"
                      value={s.chinese}
                      onChange={(e) => {
                        const next = [...listeningConfig.sentences];
                        next[i] = { ...next[i], chinese: e.target.value };
                        setListeningConfig((prev) => ({ ...prev, sentences: next }));
                      }}
                      className="border-zinc-600 bg-zinc-700 text-white placeholder:text-zinc-500"
                    />
                    <Input
                      placeholder="Expected pinyin e.g. ni chi fan le ma"
                      value={s.expectedPinyin}
                      onChange={(e) => {
                        const next = [...listeningConfig.sentences];
                        next[i] = { ...next[i], expectedPinyin: e.target.value };
                        setListeningConfig((prev) => ({ ...prev, sentences: next }));
                      }}
                      className="border-zinc-600 bg-zinc-700 text-white placeholder:text-zinc-500"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setListeningConfig((prev) => ({
                        ...prev,
                        sentences: prev.sentences.filter((_, idx) => idx !== i),
                      }))
                    }
                    className="p-1 text-zinc-500 hover:text-red-400 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setListeningConfig((prev) => ({
                    ...prev,
                    sentences: [...prev.sentences, { chinese: "", expectedPinyin: "" }],
                  }))
                }
                className="border-zinc-600 text-zinc-300 hover:bg-zinc-700"
              >
                <Plus className="w-4 h-4 mr-1" /> Add Sentence
              </Button>
              <p className="text-xs text-zinc-500">Tone marks optional — validation ignores them.</p>
            </div>
          </div>
        )}

        {watch("lessonType") === "vocal_hack" && (
          <div className="space-y-4 rounded-lg border border-zinc-700 bg-zinc-900/50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Vocal Hack Config</p>
            <div className="space-y-3">
              {vocalConfig.sentences.map((s, i) => (
                <div key={i} className="rounded-lg border border-zinc-700 bg-zinc-800 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-zinc-500 font-medium">Sentence {i + 1}</p>
                    <button
                      type="button"
                      onClick={() =>
                        setVocalConfig((prev) => ({
                          sentences: prev.sentences.filter((_, idx) => idx !== i),
                        }))
                      }
                      className="text-zinc-500 hover:text-red-400 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      placeholder="Chinese e.g. 你好"
                      value={s.chinese}
                      onChange={(e) => {
                        const next = [...vocalConfig.sentences];
                        next[i] = { ...next[i], chinese: e.target.value };
                        setVocalConfig({ sentences: next });
                      }}
                      className="border-zinc-600 bg-zinc-700 text-white placeholder:text-zinc-500"
                    />
                    <Input
                      placeholder="Pinyin e.g. nǐ hǎo"
                      value={s.pinyin}
                      onChange={(e) => {
                        const next = [...vocalConfig.sentences];
                        next[i] = { ...next[i], pinyin: e.target.value };
                        setVocalConfig({ sentences: next });
                      }}
                      className="border-zinc-600 bg-zinc-700 text-white placeholder:text-zinc-500"
                    />
                    <Input
                      placeholder="English e.g. Hello"
                      value={s.english}
                      onChange={(e) => {
                        const next = [...vocalConfig.sentences];
                        next[i] = { ...next[i], english: e.target.value };
                        setVocalConfig({ sentences: next });
                      }}
                      className="border-zinc-600 bg-zinc-700 text-white placeholder:text-zinc-500"
                    />
                    <Input
                      placeholder="Mux Playback ID (optional)"
                      value={s.muxPlaybackId}
                      onChange={(e) => {
                        const next = [...vocalConfig.sentences];
                        next[i] = { ...next[i], muxPlaybackId: e.target.value };
                        setVocalConfig({ sentences: next });
                      }}
                      className="border-zinc-600 bg-zinc-700 text-white placeholder:text-zinc-500"
                    />
                  </div>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setVocalConfig((prev) => ({
                    sentences: [...prev.sentences, { muxPlaybackId: "", pinyin: "", chinese: "", english: "" }],
                  }))
                }
                className="border-zinc-600 text-zinc-300 hover:bg-zinc-700"
              >
                <Plus className="w-4 h-4 mr-1" /> Add Sentence
              </Button>
            </div>
          </div>
        )}

        {watch("lessonType") !== "standard" && (
          <div className="space-y-2">
            <Label className="text-zinc-300">Confirmation Message</Label>
            <p className="text-xs text-zinc-500">Shown to the student after they submit. Leave blank to use default.</p>
            <Textarea
              {...register("confirmationMessage")}
              placeholder="e.g. Great work! Your submission has been received. Your coach will review it and follow up shortly."
              rows={3}
              className="resize-y border-zinc-600 bg-zinc-700 text-white placeholder:text-zinc-400"
            />
          </div>
        )}

        <div className="space-y-2">
            <Label className="text-zinc-300">Embed URL (Optional)</Label>
            <p className="text-xs text-zinc-500">Paste a Google Form or other iframe embed URL. Students will see it rendered inline below the lesson content.</p>
            <Input
            {...register("embedUrl")}
            placeholder="https://docs.google.com/forms/d/e/.../viewform?embedded=true"
            className="border-zinc-600 bg-zinc-700 text-white placeholder:text-zinc-400"
            />
        </div>

        <div className="space-y-2">
            <Label className="text-zinc-300">Video (Optional)</Label>
            {currentPlaybackId ? (
            <div className="flex items-center gap-3 rounded-lg border border-zinc-600 bg-zinc-700 p-3">
                <div className="flex h-8 w-12 shrink-0 items-center justify-center rounded bg-green-900/30">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="text-green-400">
                    <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
                </div>
                <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-zinc-200">{currentPlaybackId}</p>
                {watch("durationSeconds") && (
                    <p className="text-xs text-zinc-400">
                    {Math.floor(Number(watch("durationSeconds")) / 60)}:{String(Number(watch("durationSeconds")) % 60).padStart(2, "0")}
                    </p>
                )}
                </div>
                <button
                type="button"
                onClick={() => {
                    setValue("muxPlaybackId", "");
                    setValue("durationSeconds", "");
                }}
                className="shrink-0 text-xs text-zinc-400 hover:text-red-400 transition-colors"
                >
                Remove
                </button>
            </div>
            ) : (
            <div className="rounded-lg border border-dashed border-zinc-600 bg-zinc-800/50 p-4 text-center">
                <p className="text-sm text-zinc-400 mb-2">No video selected</p>
                <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowVideoPicker(true)}
                className="border-zinc-600 text-zinc-300 hover:bg-zinc-700"
                >
                Browse Video Library
                </Button>
            </div>
            )}
            <input type="hidden" {...register("muxPlaybackId")} />
            <input type="hidden" {...register("durationSeconds")} />
        </div>

        {showVideoPicker && (
            <VideoPicker
            onSelect={(playbackId, duration) => {
                setValue("muxPlaybackId", playbackId);
                if (duration) setValue("durationSeconds", duration);
                setShowVideoPicker(false);
            }}
            onClose={() => setShowVideoPicker(false)}
            />
        )}

        {/* Attachments Section */}
        {isEditMode && (
            <div className="space-y-3 pt-4 border-t border-zinc-700">
                <Label className="text-zinc-300">Attachments & Resources</Label>
                
                {/* List */}
                <div className="space-y-2">
                    {attachments.map((att) => (
                        <div key={att.id} className="flex items-center gap-3 rounded-md border border-zinc-700 bg-zinc-900/50 p-3">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-zinc-800">
                                {att.type === 'file' ? <FileText className="w-4 h-4 text-zinc-400" /> : <LinkIcon className="w-4 h-4 text-blue-400" />}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-zinc-200 truncate">{att.title}</p>
                                <a href={att.url} target="_blank" rel="noopener noreferrer" className="text-xs text-zinc-500 hover:text-zinc-300 truncate block">
                                    {att.url}
                                </a>
                            </div>
                            <button
                                type="button"
                                onClick={() => handleDeleteAttachment(att.id)}
                                className="p-1 text-zinc-500 hover:text-red-400 transition-colors"
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </div>
                    ))}
                    {attachments.length === 0 && !loadingAttachments && (
                        <p className="text-sm text-zinc-500 italic">No attachments yet.</p>
                    )}
                </div>

                {/* Add Form */}
                <div className="bg-zinc-900/30 p-3 rounded-md border border-zinc-700/50 space-y-3">
                    <div className="flex gap-4 border-b border-zinc-700/50 pb-2 mb-2">
                        <button
                            type="button"
                            onClick={() => setAttachmentType('link')}
                            className={`text-xs font-medium pb-1 -mb-2.5 border-b-2 transition-colors ${attachmentType === 'link' ? 'text-white border-blue-500' : 'text-zinc-500 border-transparent hover:text-zinc-300'}`}
                        >
                            Add Link
                        </button>
                        <button
                            type="button"
                            onClick={() => setAttachmentType('file')}
                            className={`text-xs font-medium pb-1 -mb-2.5 border-b-2 transition-colors ${attachmentType === 'file' ? 'text-white border-blue-500' : 'text-zinc-500 border-transparent hover:text-zinc-300'}`}
                        >
                            Upload File
                        </button>
                    </div>

                    <div className="flex gap-2 items-end">
                        <div className="flex-1 space-y-1">
                            <Label htmlFor="att-title" className="text-xs text-zinc-400">Title</Label>
                            <Input 
                                id="att-title"
                                value={newAttachmentTitle} 
                                onChange={(e) => setNewAttachmentTitle(e.target.value)} 
                                placeholder="e.g. Slides, Doc" 
                                className="h-8 text-sm bg-zinc-800 border-zinc-600"
                            />
                        </div>
                        
                        {attachmentType === 'link' ? (
                            <div className="flex-[2] space-y-1">
                                <Label htmlFor="att-url" className="text-xs text-zinc-400">URL</Label>
                                <Input 
                                    id="att-url"
                                    value={newAttachmentUrl} 
                                    onChange={(e) => setNewAttachmentUrl(e.target.value)} 
                                    placeholder="https://..." 
                                    className="h-8 text-sm bg-zinc-800 border-zinc-600"
                                />
                            </div>
                        ) : (
                            <div className="flex-[2] space-y-1">
                                <Label htmlFor="att-file" className="text-xs text-zinc-400">File</Label>
                                <div className="relative">
                                    <input
                                        id="att-file"
                                        type="file"
                                        onChange={(e) => setFileToUpload(e.target.files?.[0] || null)}
                                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                    />
                                    <div className="h-8 px-3 rounded-md bg-zinc-800 border border-zinc-600 flex items-center text-sm text-zinc-400 truncate">
                                        {fileToUpload ? fileToUpload.name : "Choose file..."}
                                    </div>
                                </div>
                            </div>
                        )}

                        <Button 
                            type="button" 
                            size="sm" 
                            onClick={handleAddAttachment}
                            disabled={!newAttachmentTitle || (attachmentType === 'link' ? !newAttachmentUrl : !fileToUpload) || isAddingAttachment}
                            className="bg-zinc-700 hover:bg-zinc-600"
                        >
                            {attachmentType === 'link' ? <Plus className="w-4 h-4" /> : <Upload className="w-4 h-4" />}
                        </Button>
                    </div>
                </div>
            </div>
        )}

        <div className="space-y-2">
            <Label htmlFor="sortOrder" className="text-zinc-300">
            Sort Order
            </Label>
            <Input
            id="sortOrder"
            type="number"
            {...register("sortOrder")}
            min={0}
            className="w-32 border-zinc-600 bg-zinc-700 text-white"
            />
        </div>
      </div>

      <div className="flex justify-end gap-3 border-t border-zinc-700 pt-4">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isSubmitting}
          className="border-zinc-600 text-zinc-300 hover:bg-zinc-700"
        >
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting
            ? "Saving..."
            : isEditMode
              ? "Update Lesson"
              : "Create Lesson"}
        </Button>
      </div>
    </form>
  );
}

// ── Video Picker Modal ──────────────────────────────────────────────

interface VideoPickerVideo {
  id: string;
  muxPlaybackId: string | null;
  filename: string;
  status: string;
  durationSeconds: number | null;
  lessonId: string | null;
  createdAt: string;
}

function VideoPicker({
  onSelect,
  onClose,
}: {
  onSelect: (playbackId: string, duration?: number) => void;
  onClose: () => void;
}) {
  const [videos, setVideos] = useState<VideoPickerVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchVideos = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/uploads?status=ready");
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setVideos(data.uploads ?? []);
    } catch {
      setError("Failed to load videos");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchVideos();
  }, [fetchVideos]);

  const readyVideos = videos.filter((v) => v.muxPlaybackId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-lg border border-zinc-700 bg-zinc-800 shadow-xl">
        <div className="flex items-center justify-between border-b border-zinc-700 px-4 py-3">
          <h3 className="text-sm font-semibold text-white">Select a Video</h3>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-white transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="max-h-80 overflow-y-auto p-2">
          {loading && (
            <div className="space-y-2 p-2">
              {[1, 2, 3].map((n) => (
                <div key={n} className="h-14 animate-pulse rounded-lg bg-zinc-700/50" />
              ))}
            </div>
          )}

          {error && (
            <div className="p-4 text-center">
              <p className="text-sm text-red-400 mb-2">{error}</p>
              <Button variant="outline" size="sm" onClick={fetchVideos}>
                Retry
              </Button>
            </div>
          )}

          {!loading && !error && readyVideos.length === 0 && (
            <div className="p-8 text-center">
              <p className="text-sm text-zinc-400">
                No ready videos found. Upload videos from the Content Management page first.
              </p>
            </div>
          )}

          {!loading && !error && readyVideos.map((video) => (
            <button
              key={video.id}
              type="button"
              onClick={() => onSelect(video.muxPlaybackId!, video.durationSeconds ?? undefined)}
              className="flex w-full items-center gap-3 rounded-lg p-3 text-left transition-colors hover:bg-zinc-700"
            >
              <div className="flex h-9 w-13 shrink-0 items-center justify-center rounded bg-green-900/30">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="text-green-400">
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-zinc-200">{video.filename}</p>
                <div className="flex items-center gap-2 text-xs text-zinc-500">
                  {video.durationSeconds && (
                    <span>{Math.floor(video.durationSeconds / 60)}:{String(video.durationSeconds % 60).padStart(2, "0")}</span>
                  )}
                  <span>{new Date(video.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                  {video.lessonId && <span className="text-indigo-400">In use</span>}
                </div>
              </div>
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-zinc-500">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          ))}
        </div>

        <div className="border-t border-zinc-700 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-zinc-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
