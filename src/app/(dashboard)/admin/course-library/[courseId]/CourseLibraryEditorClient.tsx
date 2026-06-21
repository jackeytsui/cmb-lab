"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Plus,
  Loader2,
  Trash2,
  Check,
  Video,
  FileText,
  HelpCircle,
  Download,
  Pencil,
  X,
  Music,
  ExternalLink,
  GripVertical,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { DragDropProvider } from "@dnd-kit/react";
import { useSortable } from "@dnd-kit/react/sortable";

type LessonType = "video" | "audio" | "text" | "quiz" | "download" | "form";

interface LessonRow {
  id: string;
  title: string;
  lessonType: LessonType;
  sortOrder: number;
}

interface ModuleRow {
  id: string;
  title: string;
  sortOrder: number;
  lessons: LessonRow[];
}

interface CourseData {
  id: string;
  title: string;
  summary: string;
  coverImageUrl: string | null;
  isPublished: boolean;
  modules: ModuleRow[];
}

const LESSON_TYPE_META: Record<
  LessonType,
  { label: string; Icon: typeof Video; color: string }
> = {
  video: { label: "Video", Icon: Video, color: "text-red-500" },
  audio: { label: "Audio", Icon: Music, color: "text-purple-500" },
  text: { label: "Text", Icon: FileText, color: "text-blue-500" },
  quiz: { label: "Quiz", Icon: HelpCircle, color: "text-amber-500" },
  download: { label: "Download", Icon: Download, color: "text-emerald-500" },
  form: { label: "Form", Icon: ExternalLink, color: "text-pink-500" },
};

// ---------------------------------------------------------------------------
// Sortable lesson row (drag-and-drop handle)
// ---------------------------------------------------------------------------

function SortableLesson({
  lesson,
  index,
  courseId,
  moduleId,
  onDelete,
}: {
  lesson: LessonRow;
  index: number;
  courseId: string;
  moduleId: string;
  onDelete: (lessonId: string, title: string, moduleId: string) => void;
}) {
  const { ref, isDragging } = useSortable({ id: lesson.id, index });
  const meta = LESSON_TYPE_META[lesson.lessonType];

  return (
    <div
      ref={ref}
      data-dragging={isDragging}
      className={cn(
        "flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 group transition-all",
        isDragging && "opacity-50 scale-[0.98] ring-1 ring-primary/40",
      )}
    >
      <div className="cursor-grab text-muted-foreground/40 hover:text-muted-foreground active:cursor-grabbing shrink-0">
        <GripVertical className="w-3.5 h-3.5" />
      </div>
      <meta.Icon className={cn("w-4 h-4 shrink-0", meta.color)} />
      <span className="text-xs text-muted-foreground uppercase font-medium w-16 shrink-0">
        {meta.label}
      </span>
      <Link
        href={`/admin/course-library/${courseId}/lessons/${lesson.id}`}
        className="flex-1 text-sm text-foreground hover:text-primary"
      >
        {lesson.title}
      </Link>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <Link
          href={`/admin/course-library/${courseId}/lessons/${lesson.id}`}
          className="p-1 text-muted-foreground/50 hover:text-foreground"
          title="Edit"
        >
          <Pencil className="w-3.5 h-3.5" />
        </Link>
        <button
          type="button"
          onClick={() => onDelete(lesson.id, lesson.title, moduleId)}
          className="p-1 text-muted-foreground/50 hover:text-red-500"
          title="Delete"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sortable lesson list per module
// ---------------------------------------------------------------------------

function SortableLessonList({
  moduleId,
  lessons,
  courseId,
  onDelete,
  onReorder,
}: {
  moduleId: string;
  lessons: LessonRow[];
  courseId: string;
  onDelete: (lessonId: string, title: string, moduleId: string) => void;
  onReorder: (moduleId: string, updates: { id: string; sortOrder: number }[]) => Promise<void>;
}) {
  const [localLessons, setLocalLessons] = useState<LessonRow[]>(lessons);
  const itemsRef = useRef(localLessons);

  useEffect(() => {
    itemsRef.current = localLessons;
  }, [localLessons]);

  useEffect(() => {
    setLocalLessons([...lessons].sort((a, b) => a.sortOrder - b.sortOrder));
  }, [lessons]);

  const handleDragOver = (event: any) => {
    const { source, target } = event.operation ?? {};
    if (!source || !target || source.id === target.id) return;

    const current = itemsRef.current;
    const srcIdx = current.findIndex((l) => l.id === source.id);
    const tgtIdx = current.findIndex((l) => l.id === target.id);
    if (srcIdx === -1 || tgtIdx === -1) return;

    const next = [...current];
    const [moved] = next.splice(srcIdx, 1);
    next.splice(tgtIdx, 0, moved);
    itemsRef.current = next;
    setLocalLessons(next);
  };

  const handleDragEnd = async (event: any) => {
    if (event.canceled) return;
    const final = itemsRef.current;
    const updates = final.map((l, i) => ({ id: l.id, sortOrder: i }));
    itemsRef.current = final;
    setLocalLessons(final.map((l, i) => ({ ...l, sortOrder: i })));
    try {
      await onReorder(moduleId, updates);
    } catch (error) {
      console.error("Failed to reorder course-library lessons:", error);
      itemsRef.current = [...lessons].sort((a, b) => a.sortOrder - b.sortOrder);
      setLocalLessons([...lessons].sort((a, b) => a.sortOrder - b.sortOrder));
    }
  };

  if (localLessons.length === 0) return null;

  return (
    <DragDropProvider onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
      <div className="space-y-2">
        {localLessons.map((lesson, index) => (
          <SortableLesson
            key={lesson.id}
            lesson={lesson}
            index={index}
            courseId={courseId}
            moduleId={moduleId}
            onDelete={onDelete}
          />
        ))}
      </div>
    </DragDropProvider>
  );
}

// ---------------------------------------------------------------------------
// Main editor
// ---------------------------------------------------------------------------

export function CourseLibraryEditorClient({
  initialCourse,
}: {
  initialCourse: CourseData;
}) {
  const router = useRouter();
  const [course, setCourse] = useState<CourseData>(initialCourse);
  const [title, setTitle] = useState(course.title);
  const [summary, setSummary] = useState(course.summary);
  const [savingHeader, setSavingHeader] = useState(false);
  const [addingModule, setAddingModule] = useState(false);
  const [newModuleTitle, setNewModuleTitle] = useState("");
  const [addingLessonTo, setAddingLessonTo] = useState<string | null>(null);
  const [newLessonTitle, setNewLessonTitle] = useState("");
  const [newLessonType, setNewLessonType] = useState<LessonType>("video");
  const [submitting, setSubmitting] = useState(false);

  const isDirty = title !== course.title || summary !== course.summary;

  const handleSaveHeader = async () => {
    setSavingHeader(true);
    try {
      const res = await fetch(
        `/api/admin/course-library/courses/${course.id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, summary }),
        },
      );
      if (res.ok) {
        const data = await res.json();
        setCourse((prev) => ({ ...prev, title: data.course.title, summary: data.course.summary }));
      }
    } finally {
      setSavingHeader(false);
    }
  };

  const handleTogglePublish = async () => {
    setSavingHeader(true);
    try {
      const res = await fetch(
        `/api/admin/course-library/courses/${course.id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isPublished: !course.isPublished }),
        },
      );
      if (res.ok) {
        const data = await res.json();
        setCourse((prev) => ({ ...prev, isPublished: data.course.isPublished }));
      }
    } finally {
      setSavingHeader(false);
    }
  };

  const handleAddModule = async () => {
    if (!newModuleTitle.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch(
        `/api/admin/course-library/courses/${course.id}/modules`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: newModuleTitle.trim() }),
        },
      );
      if (res.ok) {
        const data = await res.json();
        setCourse((prev) => ({
          ...prev,
          modules: [
            ...prev.modules,
            {
              id: data.module.id,
              title: data.module.title,
              sortOrder: data.module.sortOrder,
              lessons: [],
            },
          ],
        }));
        setNewModuleTitle("");
        setAddingModule(false);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteModule = async (moduleId: string, moduleTitle: string) => {
    if (!confirm(`Delete module "${moduleTitle}" and all its lessons?`)) return;
    try {
      const res = await fetch(
        `/api/admin/course-library/modules/${moduleId}`,
        { method: "DELETE" },
      );
      if (res.ok) {
        setCourse((prev) => ({
          ...prev,
          modules: prev.modules.filter((m) => m.id !== moduleId),
        }));
      }
    } catch {
      // ignore
    }
  };

  const handleAddLesson = async (moduleId: string) => {
    if (!newLessonTitle.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch(
        `/api/admin/course-library/modules/${moduleId}/lessons`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: newLessonTitle.trim(),
            lessonType: newLessonType,
          }),
        },
      );
      if (res.ok) {
        const data = await res.json();
        setCourse((prev) => ({
          ...prev,
          modules: prev.modules.map((m) =>
            m.id === moduleId
              ? {
                  ...m,
                  lessons: [
                    ...m.lessons,
                    {
                      id: data.lesson.id,
                      title: data.lesson.title,
                      lessonType: data.lesson.lessonType,
                      sortOrder: data.lesson.sortOrder,
                    },
                  ],
                }
              : m,
          ),
        }));
        setNewLessonTitle("");
        setAddingLessonTo(null);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteLesson = async (
    lessonId: string,
    lessonTitle: string,
    moduleId: string,
  ) => {
    if (!confirm(`Delete lesson "${lessonTitle}"?`)) return;
    try {
      const res = await fetch(
        `/api/admin/course-library/lessons/${lessonId}`,
        { method: "DELETE" },
      );
      if (res.ok) {
        setCourse((prev) => ({
          ...prev,
          modules: prev.modules.map((m) =>
            m.id === moduleId
              ? { ...m, lessons: m.lessons.filter((l) => l.id !== lessonId) }
              : m,
          ),
        }));
      }
    } catch {
      // ignore
    }
  };

  const handleReorderLessons = async (
    moduleId: string,
    updates: { id: string; sortOrder: number }[],
  ) => {
    const response = await fetch(
      `/api/admin/course-library/modules/${moduleId}/lessons/reorder`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lessons: updates }),
      },
    );
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      throw new Error(data?.error || "Failed to reorder lessons");
    }
    setCourse((prev) => ({
      ...prev,
      modules: prev.modules.map((m) =>
        m.id === moduleId
          ? {
              ...m,
              lessons: m.lessons.map((l) => {
                const upd = updates.find((u) => u.id === l.id);
                return upd ? { ...l, sortOrder: upd.sortOrder } : l;
              }),
            }
          : m,
      ),
    }));
  };

  return (
    <div className="space-y-6">
      {/* Course header */}
      <div className="rounded-lg border border-border bg-card p-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
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
          <button
            type="button"
            onClick={handleTogglePublish}
            disabled={savingHeader}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-xs font-medium transition-colors disabled:opacity-50",
              course.isPublished
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                : "border-zinc-500/30 bg-zinc-500/10 text-zinc-600 dark:text-zinc-400",
            )}
          >
            {course.isPublished ? "Published" : "Draft"}
            <span className="text-[10px] underline">click to toggle</span>
          </button>
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Summary
          </label>
          <textarea
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            rows={2}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
        </div>
        {isDirty && (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleSaveHeader}
              disabled={savingHeader}
              className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {savingHeader ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Check className="w-3 h-3" />
              )}
              Save changes
            </button>
          </div>
        )}
      </div>

      {/* Modules */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">
            Modules ({course.modules.length})
          </h2>
          <button
            type="button"
            onClick={() => setAddingModule(!addingModule)}
            className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent"
          >
            {addingModule ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
            {addingModule ? "Cancel" : "Add Module"}
          </button>
        </div>

        {addingModule && (
          <div className="rounded-md border border-dashed border-border bg-card p-3 flex gap-2">
            <input
              type="text"
              value={newModuleTitle}
              onChange={(e) => setNewModuleTitle(e.target.value)}
              placeholder="Module title"
              className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddModule();
              }}
              autoFocus
            />
            <button
              type="button"
              onClick={handleAddModule}
              disabled={submitting || !newModuleTitle.trim()}
              className="rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"
            >
              {submitting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                "Add"
              )}
            </button>
          </div>
        )}

        {course.modules.map((mod) => (
          <div
            key={mod.id}
            className="rounded-lg border border-border bg-card overflow-hidden"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/20">
              <h3 className="text-sm font-semibold text-foreground">
                {mod.title}
              </h3>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground">
                  {mod.lessons.length} lesson
                  {mod.lessons.length === 1 ? "" : "s"}
                </span>
                <button
                  type="button"
                  onClick={() => handleDeleteModule(mod.id, mod.title)}
                  className="p-1 text-muted-foreground/50 hover:text-red-500"
                  title="Delete module"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <div className="p-3 space-y-2">
              {mod.lessons.length === 0 && addingLessonTo !== mod.id && (
                <p className="text-xs text-muted-foreground italic py-2 text-center">
                  No lessons yet
                </p>
              )}

              <SortableLessonList
                moduleId={mod.id}
                lessons={mod.lessons}
                courseId={course.id}
                onDelete={handleDeleteLesson}
                onReorder={handleReorderLessons}
              />

              {addingLessonTo === mod.id ? (
                <div className="rounded-md border border-dashed border-border bg-muted/30 p-3 space-y-2">
                  <div className="flex gap-2">
                    <select
                      value={newLessonType}
                      onChange={(e) =>
                        setNewLessonType(e.target.value as LessonType)
                      }
                      className="rounded-md border border-border bg-background px-2 py-2 text-xs"
                    >
                      <option value="video">Video</option>
                      <option value="audio">Audio</option>
                      <option value="text">Text</option>
                      <option value="quiz">Quiz</option>
                      <option value="download">Download</option>
                      <option value="form">Form Embed</option>
                    </select>
                    <input
                      type="text"
                      value={newLessonTitle}
                      onChange={(e) => setNewLessonTitle(e.target.value)}
                      placeholder="Lesson title"
                      className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleAddLesson(mod.id);
                      }}
                      autoFocus
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setAddingLessonTo(null);
                        setNewLessonTitle("");
                      }}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAddLesson(mod.id)}
                      disabled={submitting || !newLessonTitle.trim()}
                      className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground disabled:opacity-50"
                    >
                      {submitting && (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      )}
                      Add
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setAddingLessonTo(mod.id);
                    setNewLessonTitle("");
                  }}
                  className="w-full text-xs text-muted-foreground hover:text-foreground border border-dashed border-border rounded-md py-2 hover:bg-muted/30 transition-colors inline-flex items-center justify-center gap-1"
                >
                  <Plus className="w-3 h-3" />
                  Add lesson
                </button>
              )}
            </div>
          </div>
        ))}

        {course.modules.length === 0 && !addingModule && (
          <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center">
            <p className="text-sm text-muted-foreground">
              No modules yet. Click &ldquo;Add Module&rdquo; to get started.
            </p>
          </div>
        )}
      </div>

      {/* Router refresh on navigation */}
      <button
        type="button"
        onClick={() => router.refresh()}
        className="hidden"
      />
    </div>
  );
}
