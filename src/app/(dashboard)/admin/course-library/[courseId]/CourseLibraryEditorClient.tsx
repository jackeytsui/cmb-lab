"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import type { ComponentProps } from "react";
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
  ClipboardList,
  ArrowUp,
  ArrowDown,
  Headphones,
  Mic,
  NotebookPen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { DragDropProvider, useDroppable } from "@dnd-kit/react";
import { useSortable } from "@dnd-kit/react/sortable";
import { move } from "@dnd-kit/helpers";
import { CollisionPriority } from "@dnd-kit/abstract";

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
  | "diary"
  | "text_assignment_canto"
  | "listening_practice_canto"
  | "vocal_hack_canto"
  | "diary_canto";

interface LessonRow {
  id: string;
  title: string;
  lessonType: LessonType;
  sortOrder: number;
}

type ModuleMapStyle = "lesson" | "cm_school" | "custom_goal";

interface ModuleRow {
  id: string;
  title: string;
  shortTitle: string | null;
  mapStyle: ModuleMapStyle;
  weekLabel: string | null;
  sortOrder: number;
  lessons: LessonRow[];
}

type CourseStatus = "draft" | "preview" | "published";

interface AccessTag {
  id: string;
  name: string;
  color: string;
}

interface CourseData {
  id: string;
  title: string;
  summary: string;
  coverImageUrl: string | null;
  isPublished: boolean;
  status: CourseStatus;
  modules: ModuleRow[];
}

interface StudentOption {
  id: string;
  name: string;
  email: string;
}

// Mirrors the stop colors on the student course map.
const MAP_STYLE_META: Record<ModuleMapStyle, { label: string; dot: string }> = {
  lesson: { label: "Lesson (dark blue)", dot: "#2e3a97" },
  cm_school: { label: "CM School (light blue)", dot: "#4a9fe3" },
  custom_goal: { label: "Custom Goal (yellow)", dot: "#f2b705" },
};

const STATUS_HINT: Record<CourseStatus, string> = {
  draft: "Not visible to anyone yet.",
  preview: "Visible to admins & coaches only, for review.",
  published: "Visible to all students with access.",
};

const LESSON_TYPE_META: Record<
  LessonType,
  { label: string; Icon: typeof Video; color: string }
> = {
  video: { label: "Video", Icon: Video, color: "text-red-500" },
  audio: { label: "Audio", Icon: Music, color: "text-purple-500" },
  text: { label: "Text", Icon: FileText, color: "text-blue-500" },
  quiz: { label: "Quiz", Icon: HelpCircle, color: "text-amber-500" },
  download: { label: "Download", Icon: Download, color: "text-emerald-500" },
  form: { label: "HTML Embed", Icon: ExternalLink, color: "text-pink-500" },
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
  text_assignment_canto: {
    label: "Text Assignment (Canto)",
    Icon: ClipboardList,
    color: "text-teal-500",
  },
  listening_practice_canto: {
    label: "Listening Practice (Canto)",
    Icon: Headphones,
    color: "text-indigo-500",
  },
  vocal_hack_canto: {
    label: "Vocal Hack (Canto)",
    Icon: Mic,
    color: "text-rose-500",
  },
  diary_canto: {
    label: "Diary (Canto)",
    Icon: NotebookPen,
    color: "text-sky-500",
  },
};

// ---------------------------------------------------------------------------
// Inline week-label editor shown on every module row, so the team can
// distribute the map's week bands across a course at a glance (a module keeps
// the week above it when left blank). Saves on blur / Enter.
// ---------------------------------------------------------------------------

function WeekLabelInput({
  initial,
  onSave,
}: {
  initial: string;
  onSave: (value: string) => Promise<void>;
}) {
  const [value, setValue] = useState(initial);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setValue(initial);
  }, [initial]);

  const commit = async () => {
    if (value.trim() === initial.trim()) return;
    setSaving(true);
    try {
      await onSave(value.trim());
    } finally {
      setSaving(false);
    }
  };

  return (
    <input
      type="text"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
      disabled={saving}
      placeholder="Week"
      title="Week label — groups modules into a week band on the student map (e.g. &quot;Week 1&quot;). Leave blank to stay in the week above."
      className="w-[84px] shrink-0 rounded-full border border-border bg-background px-2 py-0.5 text-[10px] font-medium text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/40 disabled:opacity-50"
    />
  );
}

// ---------------------------------------------------------------------------
// Draggable lesson row — sortable within its module and movable across modules
// ---------------------------------------------------------------------------

function MoveableLesson({
  lesson,
  index,
  group,
  courseId,
  onDelete,
}: {
  lesson: LessonRow;
  index: number;
  group: string;
  courseId: string;
  onDelete: (lessonId: string, title: string, moduleId: string) => void;
}) {
  const { ref, isDragging } = useSortable({
    id: lesson.id,
    index,
    group,
    type: "lesson",
    accept: "lesson",
  });
  const moduleId = group;
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
      <span className="text-xs text-muted-foreground uppercase font-medium w-32 shrink-0 whitespace-nowrap">
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
// Droppable lesson list for a single module (drop target for cross-module drags)
// ---------------------------------------------------------------------------

function ModuleLessonList({
  moduleId,
  lessonIds,
  lessonById,
  courseId,
  onDelete,
}: {
  moduleId: string;
  lessonIds: string[];
  lessonById: Map<string, LessonRow>;
  courseId: string;
  onDelete: (lessonId: string, title: string, moduleId: string) => void;
}) {
  // The whole list is a drop target so a lesson can be dragged into a module
  // even when it is currently empty. Lower priority than the lesson rows so
  // hovering a specific row still positions precisely.
  const { ref, isDropTarget } = useDroppable({
    id: moduleId,
    type: "column",
    accept: "lesson",
    collisionPriority: CollisionPriority.Low,
  });

  return (
    <div
      ref={ref}
      className={cn(
        "space-y-2 rounded-md transition-colors",
        isDropTarget && "bg-primary/5 ring-1 ring-primary/30",
      )}
    >
      {lessonIds.length === 0 ? (
        <p
          className={cn(
            "rounded-md border border-dashed border-border py-3 text-center text-xs italic text-muted-foreground",
            isDropTarget && "border-primary/40 text-primary",
          )}
        >
          Drop a lesson here
        </p>
      ) : (
        lessonIds.map((id, index) => {
          const lesson = lessonById.get(id);
          if (!lesson) return null;
          return (
            <MoveableLesson
              key={id}
              lesson={lesson}
              index={index}
              group={moduleId}
              courseId={courseId}
              onDelete={onDelete}
            />
          );
        })
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main editor
// ---------------------------------------------------------------------------

export function CourseLibraryEditorClient({
  initialCourse,
  allTags,
  initialAllowedTagIds,
  initialAllowedUserIds,
}: {
  initialCourse: CourseData;
  allTags: AccessTag[];
  initialAllowedTagIds: string[];
  initialAllowedUserIds: string[];
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
  const [actionError, setActionError] = useState<string | null>(null);
  const [editingModuleId, setEditingModuleId] = useState<string | null>(null);
  const [moduleDraft, setModuleDraft] = useState({
    title: "",
    shortTitle: "",
    mapStyle: "lesson" as ModuleMapStyle,
    weekLabel: "",
  });
  const [savingModule, setSavingModule] = useState(false);
  const [allowedTagIds, setAllowedTagIds] = useState<string[]>(
    initialAllowedTagIds,
  );
  const [savingAccess, setSavingAccess] = useState(false);

  // Per-student manual grants (primary path for customized courses, which
  // are hidden from all students by default).
  const isCustomized = /customized/i.test(course.title);
  const [allowedUserIds, setAllowedUserIds] = useState<string[]>(
    initialAllowedUserIds,
  );
  const [allStudents, setAllStudents] = useState<StudentOption[]>([]);
  const [studentSearch, setStudentSearch] = useState("");
  const [savingStudents, setSavingStudents] = useState(false);

  useEffect(() => {
    fetch("/api/admin/students?limit=500")
      .then((r) => r.json())
      .then((d) => {
        const students = (d.students ?? []).map(
          (s: { id: string; name?: string; email?: string }) => ({
            id: s.id,
            name: s.name || s.email || "Unknown",
            email: s.email || "",
          }),
        );
        setAllStudents(students);
      })
      .catch(() => {});
  }, []);

  const saveAllowedUsers = async (next: string[]) => {
    const prev = allowedUserIds;
    setAllowedUserIds(next);
    setSavingStudents(true);
    try {
      const res = await fetch(
        `/api/admin/course-library/courses/${course.id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ allowedUserIds: next }),
        },
      );
      if (!res.ok) setAllowedUserIds(prev);
    } catch {
      setAllowedUserIds(prev);
    } finally {
      setSavingStudents(false);
    }
  };

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

  const toggleAccessTag = async (tagId: string) => {
    const next = allowedTagIds.includes(tagId)
      ? allowedTagIds.filter((id) => id !== tagId)
      : [...allowedTagIds, tagId];
    const prev = allowedTagIds;
    setAllowedTagIds(next);
    setSavingAccess(true);
    try {
      const res = await fetch(
        `/api/admin/course-library/courses/${course.id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ allowedTagIds: next }),
        },
      );
      if (!res.ok) setAllowedTagIds(prev);
    } catch {
      setAllowedTagIds(prev);
    } finally {
      setSavingAccess(false);
    }
  };

  const handleStatusChange = async (status: CourseStatus) => {
    setSavingHeader(true);
    try {
      const res = await fetch(
        `/api/admin/course-library/courses/${course.id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        },
      );
      if (res.ok) {
        const data = await res.json();
        setCourse((prev) => ({
          ...prev,
          status: data.course.status,
          isPublished: data.course.isPublished,
        }));
      }
    } finally {
      setSavingHeader(false);
    }
  };

  const handleAddModule = async () => {
    if (!newModuleTitle.trim()) return;
    setSubmitting(true);
    setActionError(null);
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
              shortTitle: data.module.shortTitle ?? null,
              mapStyle: data.module.mapStyle ?? "lesson",
              weekLabel: data.module.weekLabel ?? null,
              sortOrder: data.module.sortOrder,
              lessons: [],
            },
          ],
        }));
        setNewModuleTitle("");
        setAddingModule(false);
      } else {
        const data = await res.json().catch(() => null);
        setActionError(data?.error || "Failed to create module");
      }
    } catch {
      setActionError("Failed to create module");
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

  const startEditModule = (mod: ModuleRow) => {
    setEditingModuleId(mod.id);
    setModuleDraft({
      title: mod.title,
      shortTitle: mod.shortTitle ?? "",
      mapStyle: mod.mapStyle,
      weekLabel: mod.weekLabel ?? "",
    });
    setActionError(null);
  };

  const handleSaveModule = async (moduleId: string) => {
    if (!moduleDraft.title.trim()) return;
    setSavingModule(true);
    setActionError(null);
    try {
      const res = await fetch(
        `/api/admin/course-library/modules/${moduleId}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: moduleDraft.title.trim(),
            shortTitle: moduleDraft.shortTitle.trim() || null,
            mapStyle: moduleDraft.mapStyle,
            weekLabel: moduleDraft.weekLabel.trim() || null,
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
                  title: data.module.title,
                  shortTitle: data.module.shortTitle,
                  mapStyle: data.module.mapStyle,
                  weekLabel: data.module.weekLabel,
                }
              : m,
          ),
        }));
        setEditingModuleId(null);
      } else {
        const data = await res.json().catch(() => null);
        setActionError(data?.error || "Failed to update module");
      }
    } catch {
      setActionError("Failed to update module");
    } finally {
      setSavingModule(false);
    }
  };

  const handleSaveWeekLabel = async (moduleId: string, weekLabel: string) => {
    setActionError(null);
    try {
      const res = await fetch(
        `/api/admin/course-library/modules/${moduleId}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ weekLabel: weekLabel || null }),
        },
      );
      if (res.ok) {
        const data = await res.json();
        setCourse((prev) => ({
          ...prev,
          modules: prev.modules.map((m) =>
            m.id === moduleId ? { ...m, weekLabel: data.module.weekLabel } : m,
          ),
        }));
      } else {
        const data = await res.json().catch(() => null);
        setActionError(data?.error || "Failed to update week label");
      }
    } catch {
      setActionError("Failed to update week label");
    }
  };

  const handleMoveModule = async (moduleId: string, direction: -1 | 1) => {
    const ordered = [...course.modules].sort((a, b) => a.sortOrder - b.sortOrder);
    const idx = ordered.findIndex((m) => m.id === moduleId);
    const swapIdx = idx + direction;
    if (idx === -1 || swapIdx < 0 || swapIdx >= ordered.length) return;

    const a = ordered[idx];
    const b = ordered[swapIdx];
    setActionError(null);
    try {
      const [resA, resB] = await Promise.all([
        fetch(`/api/admin/course-library/modules/${a.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sortOrder: b.sortOrder }),
        }),
        fetch(`/api/admin/course-library/modules/${b.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sortOrder: a.sortOrder }),
        }),
      ]);
      if (!resA.ok || !resB.ok) {
        setActionError("Failed to reorder modules");
        return;
      }
      setCourse((prev) => ({
        ...prev,
        modules: prev.modules.map((m) =>
          m.id === a.id
            ? { ...m, sortOrder: b.sortOrder }
            : m.id === b.id
              ? { ...m, sortOrder: a.sortOrder }
              : m,
        ),
      }));
    } catch {
      setActionError("Failed to reorder modules");
    }
  };

  const handleAddLesson = async (moduleId: string) => {
    if (!newLessonTitle.trim()) return;
    setSubmitting(true);
    setActionError(null);
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
      } else {
        const raw = await res.text().catch(() => "");
        let data: { error?: string } | null = null;
        try {
          data = raw ? JSON.parse(raw) : null;
        } catch {
          data = null;
        }
        setActionError(
          data?.error ||
            (res.status === 409 && newLessonType === "form"
              ? "Form Embed lesson type is not available yet. Deploy the course-library migration first."
              : newLessonType === "form"
                ? "Failed to create Form Embed lesson. If this is a new lesson type, the database migration may not be deployed yet."
                : "Failed to create lesson"),
        );
      }
    } catch {
      setActionError(
        newLessonType === "form"
          ? "Failed to create Form Embed lesson. If this is a new lesson type, the database migration may not be deployed yet."
          : "Failed to create lesson",
      );
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

  // -------------------------------------------------------------------------
  // Cross-module lesson drag-and-drop
  //
  // One provider spans every module. `dndItems` mirrors the committed layout
  // (moduleId -> ordered lesson ids) and is updated optimistically as the user
  // drags. When the server-confirmed layout changes (add/delete/reorder module,
  // successful move) we re-seed during render — no effect, so no state-in-effect.
  // -------------------------------------------------------------------------
  type DragDropProviderProps = ComponentProps<typeof DragDropProvider>;

  const lessonById = useMemo(() => {
    const map = new Map<string, LessonRow>();
    course.modules.forEach((m) => m.lessons.forEach((l) => map.set(l.id, l)));
    return map;
  }, [course.modules]);

  const serverLayout = useMemo(() => {
    const rec: Record<string, string[]> = {};
    [...course.modules]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .forEach((m) => {
        rec[m.id] = [...m.lessons]
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((l) => l.id);
      });
    return rec;
  }, [course.modules]);
  const serverSig = JSON.stringify(serverLayout);

  const [dndItems, setDndItems] = useState<Record<string, string[]>>(serverLayout);
  const [syncedSig, setSyncedSig] = useState(serverSig);
  const dndRef = useRef(serverLayout);
  if (serverSig !== syncedSig) {
    setDndItems(serverLayout);
    setSyncedSig(serverSig);
    dndRef.current = serverLayout;
  }

  const revertDnd = () => {
    dndRef.current = serverLayout;
    setDndItems(serverLayout);
  };

  const persistLessonMove = async (
    event: Parameters<NonNullable<DragDropProviderProps["onDragEnd"]>>[0],
  ) => {
    const sourceId = event.operation.source?.id;
    if (sourceId == null) return;
    const lessonId = String(sourceId);
    const next = dndRef.current;

    const targetModuleId = Object.keys(next).find((mid) =>
      next[mid].includes(lessonId),
    );
    const sourceModuleId = Object.keys(serverLayout).find((mid) =>
      serverLayout[mid].includes(lessonId),
    );
    if (!targetModuleId || !sourceModuleId) return;
    if (JSON.stringify(next) === serverSig) return; // nothing changed

    setActionError(null);
    try {
      if (sourceModuleId === targetModuleId) {
        const updates = next[targetModuleId].map((id, i) => ({ id, sortOrder: i }));
        await handleReorderLessons(targetModuleId, updates);
      } else {
        const groups = {
          [sourceModuleId]: next[sourceModuleId],
          [targetModuleId]: next[targetModuleId],
        };
        const res = await fetch(
          `/api/admin/course-library/lessons/${lessonId}/move`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ groups }),
          },
        );
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          throw new Error(data?.error || "Failed to move lesson");
        }
        // Reflect the new membership + ordering in the source of truth.
        setCourse((prev) => {
          const lookup = new Map<string, LessonRow>();
          prev.modules.forEach((m) => m.lessons.forEach((l) => lookup.set(l.id, l)));
          const affected = [sourceModuleId, targetModuleId];
          return {
            ...prev,
            modules: prev.modules.map((m) => {
              if (!affected.includes(m.id)) return m;
              const ids = next[m.id] ?? [];
              return {
                ...m,
                lessons: ids
                  .map((id, i) => {
                    const l = lookup.get(id);
                    return l ? { ...l, sortOrder: i } : null;
                  })
                  .filter((l): l is LessonRow => l !== null),
              };
            }),
          };
        });
      }
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Failed to move lesson",
      );
      revertDnd();
    }
  };

  const handleLessonDragOver: NonNullable<
    DragDropProviderProps["onDragOver"]
  > = (event) => {
    const nextItems = move(dndRef.current, event);
    dndRef.current = nextItems;
    setDndItems(nextItems);
  };

  const handleLessonDragEnd: NonNullable<
    DragDropProviderProps["onDragEnd"]
  > = (event) => {
    if (event.canceled) {
      revertDnd();
      return;
    }
    const nextItems = move(dndRef.current, event);
    dndRef.current = nextItems;
    setDndItems(nextItems);
    void persistLessonMove(event);
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
          <div className="flex flex-col items-end gap-1">
            <label className="block text-xs font-medium text-muted-foreground">
              Visibility
            </label>
            <select
              value={course.status}
              onChange={(e) =>
                handleStatusChange(e.target.value as CourseStatus)
              }
              disabled={savingHeader}
              className={cn(
                "rounded-md border px-3 py-2 text-xs font-medium transition-colors disabled:opacity-50",
                course.status === "published"
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                  : course.status === "preview"
                    ? "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                    : "border-zinc-500/30 bg-zinc-500/10 text-zinc-600 dark:text-zinc-400",
              )}
            >
              <option value="draft">Draft</option>
              <option value="preview">Preview (staff only)</option>
              <option value="published">Published</option>
            </select>
            <span className="text-[10px] text-muted-foreground text-right max-w-[180px]">
              {STATUS_HINT[course.status]}
            </span>
          </div>
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
        {allTags.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-1">
              <label className="block text-xs font-medium text-muted-foreground">
                Student Access (tags)
              </label>
              {savingAccess && (
                <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
              )}
            </div>
            <p className="text-[10px] text-muted-foreground mb-2">
              {isCustomized
                ? "Customized course — hidden from all students by default; a tag selected here also grants access."
                : allowedTagIds.length === 0
                  ? "No tags selected — visible to all students with Course Library access."
                  : "Only students with one of the selected tags can see this course."}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {allTags.map((tag) => {
                const selected = allowedTagIds.includes(tag.id);
                return (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => toggleAccessTag(tag.id)}
                    disabled={savingAccess}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-60",
                      selected
                        ? "border-blue-500/50 bg-blue-500/10 text-blue-600 dark:text-blue-400"
                        : "border-border bg-background text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <span
                      className="h-2 w-2 rounded-full shrink-0"
                      style={{ backgroundColor: tag.color }}
                    />
                    {tag.name}
                    {selected && <Check className="w-3 h-3" />}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <label className="block text-xs font-medium text-muted-foreground">
              Student Access (individual students)
            </label>
            {savingStudents && (
              <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
            )}
          </div>
          <p className="text-[10px] text-muted-foreground mb-2">
            {isCustomized
              ? "Customized course — hidden from ALL students by default. Only the students added here (or granted via a tag above) can see it."
              : allowedUserIds.length === 0
                ? "No individual students added. Add students to grant them access regardless of tags."
                : "These students can see this course regardless of tags."}
          </p>
          {allowedUserIds.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {allowedUserIds.map((uid) => {
                const student = allStudents.find((s) => s.id === uid);
                return (
                  <span
                    key={uid}
                    className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-400"
                  >
                    {student ? student.name : uid.slice(0, 8)}
                    <button
                      type="button"
                      onClick={() =>
                        saveAllowedUsers(
                          allowedUserIds.filter((id) => id !== uid),
                        )
                      }
                      disabled={savingStudents}
                      className="hover:text-red-500 transition-colors"
                      aria-label="Remove student"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                );
              })}
            </div>
          )}
          <input
            type="text"
            value={studentSearch}
            onChange={(e) => setStudentSearch(e.target.value)}
            placeholder="Search students by name or email…"
            className="w-full max-w-sm rounded-md border border-border bg-background px-3 py-1.5 text-xs"
          />
          {studentSearch.trim() && (
            <div className="mt-1 max-w-sm rounded-md border border-border bg-card divide-y divide-border/60 overflow-hidden">
              {allStudents
                .filter(
                  (s) =>
                    !allowedUserIds.includes(s.id) &&
                    (s.name
                      .toLowerCase()
                      .includes(studentSearch.toLowerCase()) ||
                      s.email
                        .toLowerCase()
                        .includes(studentSearch.toLowerCase())),
                )
                .slice(0, 8)
                .map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      saveAllowedUsers([...allowedUserIds, s.id]);
                      setStudentSearch("");
                    }}
                    disabled={savingStudents}
                    className="flex w-full items-center justify-between px-3 py-1.5 text-xs hover:bg-muted/50 transition-colors text-left"
                  >
                    <span className="text-foreground">{s.name}</span>
                    <span className="text-muted-foreground truncate ml-2">
                      {s.email}
                    </span>
                  </button>
                ))}
            </div>
          )}
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
        {actionError && (
          <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-500">
            {actionError}
          </div>
        )}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              Modules ({course.modules.length})
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Set the <span className="font-medium text-foreground">Week</span> field on the
              first module of each week to group the map into week bands (e.g.
              &ldquo;Day 1-3&rdquo;, &ldquo;Week 1&rdquo;). Blank modules stay in the week above.
            </p>
          </div>
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

        <DragDropProvider
          onDragOver={handleLessonDragOver}
          onDragEnd={handleLessonDragEnd}
        >
        {[...course.modules]
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((mod, modIndex, orderedModules) => (
          <div
            key={mod.id}
            className="rounded-lg border border-border bg-card overflow-hidden"
          >
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border bg-muted/20">
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: MAP_STYLE_META[mod.mapStyle].dot }}
                  title={MAP_STYLE_META[mod.mapStyle].label}
                />
                <WeekLabelInput
                  key={`${mod.id}-week`}
                  initial={mod.weekLabel ?? ""}
                  onSave={(value) => handleSaveWeekLabel(mod.id, value)}
                />
                <h3 className="truncate text-sm font-semibold text-foreground">
                  {mod.title}
                </h3>
                {mod.shortTitle && (
                  <span className="hidden truncate text-xs text-muted-foreground sm:inline">
                    (map: {mod.shortTitle})
                  </span>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <span className="mr-1 text-[10px] text-muted-foreground">
                  {mod.lessons.length} lesson
                  {mod.lessons.length === 1 ? "" : "s"}
                </span>
                <button
                  type="button"
                  onClick={() => handleMoveModule(mod.id, -1)}
                  disabled={modIndex === 0}
                  className="p-1 text-muted-foreground/50 hover:text-foreground disabled:opacity-20"
                  title="Move up"
                >
                  <ArrowUp className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => handleMoveModule(mod.id, 1)}
                  disabled={modIndex === orderedModules.length - 1}
                  className="p-1 text-muted-foreground/50 hover:text-foreground disabled:opacity-20"
                  title="Move down"
                >
                  <ArrowDown className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    editingModuleId === mod.id
                      ? setEditingModuleId(null)
                      : startEditModule(mod)
                  }
                  className="p-1 text-muted-foreground/50 hover:text-foreground"
                  title="Edit module & map settings"
                >
                  {editingModuleId === mod.id ? (
                    <X className="w-3.5 h-3.5" />
                  ) : (
                    <Pencil className="w-3.5 h-3.5" />
                  )}
                </button>
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
            {editingModuleId === mod.id && (
              <div className="border-b border-border bg-muted/10 p-3 space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">
                      Module title
                    </label>
                    <input
                      type="text"
                      value={moduleDraft.title}
                      onChange={(e) =>
                        setModuleDraft((d) => ({ ...d, title: e.target.value }))
                      }
                      className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">
                      Short title{" "}
                      <span className="font-normal">
                        (shown on the student map — e.g. &ldquo;Pronouns&rdquo;)
                      </span>
                    </label>
                    <input
                      type="text"
                      value={moduleDraft.shortTitle}
                      onChange={(e) =>
                        setModuleDraft((d) => ({
                          ...d,
                          shortTitle: e.target.value,
                        }))
                      }
                      placeholder="Falls back to module title"
                      className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">
                      Map stop style
                    </label>
                    <select
                      value={moduleDraft.mapStyle}
                      onChange={(e) =>
                        setModuleDraft((d) => ({
                          ...d,
                          mapStyle: e.target.value as ModuleMapStyle,
                        }))
                      }
                      className="w-full rounded-md border border-border bg-background px-2 py-2 text-sm"
                    >
                      {(
                        Object.keys(MAP_STYLE_META) as ModuleMapStyle[]
                      ).map((style) => (
                        <option key={style} value={style}>
                          {MAP_STYLE_META[style].label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">
                      Week label{" "}
                      <span className="font-normal">
                        (e.g. &ldquo;Week 1&rdquo; — starts a new band on the map)
                      </span>
                    </label>
                    <input
                      type="text"
                      value={moduleDraft.weekLabel}
                      onChange={(e) =>
                        setModuleDraft((d) => ({
                          ...d,
                          weekLabel: e.target.value,
                        }))
                      }
                      placeholder="Leave blank to continue previous band"
                      className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingModuleId(null)}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSaveModule(mod.id)}
                    disabled={savingModule || !moduleDraft.title.trim()}
                    className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
                  >
                    {savingModule ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Check className="w-3 h-3" />
                    )}
                    Save module
                  </button>
                </div>
              </div>
            )}
            <div className="p-3 space-y-2">
              <ModuleLessonList
                moduleId={mod.id}
                lessonIds={dndItems[mod.id] ?? []}
                lessonById={lessonById}
                courseId={course.id}
                onDelete={handleDeleteLesson}
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
                        <option value="form">HTML Embed</option>
                        <option value="text_assignment">Text Assignment</option>
                        <option value="listening_practice">Listening Practice</option>
                        <option value="vocal_hack">Vocal Hack</option>
                        <option value="diary">Diary</option>
                        <option value="text_assignment_canto">Text Assignment (Canto)</option>
                        <option value="listening_practice_canto">Listening Practice (Canto)</option>
                        <option value="vocal_hack_canto">Vocal Hack (Canto)</option>
                        <option value="diary_canto">Diary (Canto)</option>
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
                  {newLessonType === "form" && (
                    <div className="rounded-md border border-pink-500/20 bg-pink-500/5 px-3 py-2 text-xs text-muted-foreground space-y-1">
                      <p className="font-medium text-foreground">HTML Embed lesson</p>
                      <p>
                        Create the lesson now, then paste Google Forms, Typeform, Jotform,
                        or another approved iframe embed in the lesson editor.
                      </p>
                    </div>
                  )}
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setAddingLessonTo(null);
                        setNewLessonTitle("");
                        setActionError(null);
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
                    setActionError(null);
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
        </DragDropProvider>

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
