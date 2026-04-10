"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Check, Video, FileText, HelpCircle, Download } from "lucide-react";
import { cn } from "@/lib/utils";

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

export function LessonEditorClient({
  initialLesson,
}: {
  initialLesson: LessonData;
}) {
  const router = useRouter();
  const [lesson, setLesson] = useState<LessonData>(initialLesson);
  const [title, setTitle] = useState(lesson.title);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  const meta = TYPE_META[lesson.lessonType];
  const isDirty = title !== lesson.title;

  const handleSaveTitle = async () => {
    setSaving(true);
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
        setSavedAt(new Date());
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
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

        {isDirty && (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleSaveTitle}
              disabled={saving || !title.trim()}
              className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Check className="w-3 h-3" />
              )}
              Save title
            </button>
          </div>
        )}
        {savedAt && !isDirty && (
          <p className="text-[10px] text-emerald-500 text-right">
            Saved at {savedAt.toLocaleTimeString()}
          </p>
        )}
      </div>

      {/* Type-specific content editor — to be built out in step 4b */}
      <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center space-y-2">
        <meta.Icon className={cn("w-10 h-10 mx-auto", meta.color, "opacity-40")} />
        <p className="text-sm font-medium text-foreground">
          {meta.label} content editor
        </p>
        <p className="text-xs text-muted-foreground max-w-md mx-auto">
          {lesson.lessonType === "video" &&
            "Video upload + metadata + transcript + attachments editor coming next."}
          {lesson.lessonType === "text" &&
            "Markdown body editor + attachments coming next."}
          {lesson.lessonType === "quiz" &&
            "Quiz builder with question/option editor coming in step 5."}
          {lesson.lessonType === "download" &&
            "File upload + description editor coming next."}
        </p>
        <p className="text-[10px] text-muted-foreground/60 pt-2">
          Current content: {JSON.stringify(lesson.content).slice(0, 80)}
          {JSON.stringify(lesson.content).length > 80 ? "..." : ""}
        </p>
      </div>

      <button
        type="button"
        onClick={() => router.refresh()}
        className="hidden"
      />
    </div>
  );
}
