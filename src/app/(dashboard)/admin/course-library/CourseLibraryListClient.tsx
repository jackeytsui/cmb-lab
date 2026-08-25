"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Loader2, BookOpen, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { courseCoverImagePath } from "@/lib/course-cover-image";

type CourseStatus = "draft" | "preview" | "published";

interface CourseRow {
  id: string;
  title: string;
  summary: string;
  coverImageUrl: string | null;
  isPublished: boolean;
  status: CourseStatus;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

const STATUS_BADGE: Record<CourseStatus, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-zinc-700/80 text-white" },
  preview: { label: "Preview", className: "bg-amber-500/90 text-white" },
  published: { label: "Published", className: "bg-emerald-500/90 text-white" },
};

const COURSE_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "numeric",
  day: "numeric",
  timeZone: "UTC",
});

export function CourseLibraryListClient({
  initialCourses,
}: {
  initialCourses: CourseRow[];
}) {
  const router = useRouter();
  const [courses, setCourses] = useState<CourseRow[]>(initialCourses);
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!title.trim()) {
      setError("Title is required");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/course-library/courses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), summary: summary.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to create course");
        return;
      }
      // Redirect to the new course editor
      router.push(`/admin/course-library/${data.course.id}`);
    } catch {
      setError("Network error");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string, courseTitle: string) => {
    if (
      !confirm(
        `Delete "${courseTitle}"? This soft-deletes it and hides it from students.`,
      )
    ) {
      return;
    }
    setDeletingId(id);
    try {
      const res = await fetch(`/api/admin/course-library/courses/${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setCourses((prev) => prev.filter((c) => c.id !== id));
      }
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm font-medium text-muted-foreground">
          {courses.length} course{courses.length === 1 ? "" : "s"}
        </p>
        <button
          type="button"
          onClick={() => {
            setShowCreate(!showCreate);
            setError(null);
          }}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 sm:w-auto"
        >
          {showCreate ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {showCreate ? "Cancel" : "New Course"}
        </button>
      </div>

      {showCreate && (
        <div className="space-y-4 rounded-2xl border border-dashed border-primary/30 bg-card p-5 shadow-sm">
          <div>
            <label
              htmlFor="new-course-title"
              className="block text-xs font-medium text-muted-foreground mb-1"
            >
              Title
            </label>
            <input
              id="new-course-title"
              name="title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Cantonese Fundamentals"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              disabled={creating}
              autoFocus
            />
          </div>
          <div>
            <label
              htmlFor="new-course-summary"
              className="block text-xs font-medium text-muted-foreground mb-1"
            >
              Summary (optional)
            </label>
            <textarea
              id="new-course-summary"
              name="summary"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Short description of the course"
              rows={2}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              disabled={creating}
            />
          </div>
          {error && (
            <p role="alert" className="text-xs text-red-500">{error}</p>
          )}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleCreate}
              disabled={creating || !title.trim()}
              className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {creating && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Create Course
            </button>
          </div>
        </div>
      )}

      {courses.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center">
          <BookOpen className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">
            No courses yet. Click &ldquo;New Course&rdquo; to create your first one.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {courses.map((course) => (
            <div
              key={course.id}
              className="group overflow-hidden rounded-2xl border border-border/80 bg-card shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-md"
            >
              <Link
                href={`/admin/course-library/${course.id}`}
                className="block"
              >
                <div className="aspect-video bg-muted relative">
                  {course.coverImageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={courseCoverImagePath(course.id, course.updatedAt)}
                      alt={course.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground/30">
                      <BookOpen className="w-12 h-12" />
                    </div>
                  )}
                  <span
                    className={cn(
                      "absolute top-2 right-2 rounded-full px-2 py-0.5 text-[10px] font-medium",
                      STATUS_BADGE[course.status].className,
                    )}
                  >
                    {STATUS_BADGE[course.status].label}
                  </span>
                </div>
                <div className="p-4">
                  <h3 className="line-clamp-1 text-base font-semibold text-foreground">
                    {course.title}
                  </h3>
                  {course.summary && (
                    <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-muted-foreground">
                      {course.summary}
                    </p>
                  )}
                </div>
              </Link>
              <div className="flex items-center justify-between border-t border-border/70 px-4 py-2.5">
                <span className="text-[10px] text-muted-foreground">
                  {COURSE_DATE_FORMATTER.format(new Date(course.createdAt))}
                </span>
                <button
                  type="button"
                  onClick={() => handleDelete(course.id, course.title)}
                  disabled={deletingId === course.id}
                  className="p-1 text-muted-foreground/50 hover:text-red-500 transition-colors disabled:opacity-50"
                  title="Delete course"
                >
                  {deletingId === course.id ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
