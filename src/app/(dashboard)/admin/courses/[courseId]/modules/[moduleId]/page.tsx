"use client";

import { useEffect, useState, useCallback, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ErrorAlert } from "@/components/ui/error-alert";
import { ModuleForm } from "@/components/admin/ModuleForm";
import { ContentList } from "@/components/admin/ContentList";
import type { Module, Lesson } from "@/db/schema/courses";
import { ClipboardList, Trash2, ExternalLink } from "lucide-react";

interface LessonWithExercises extends Lesson {
  exercises: { id: string; title: string; assignmentId: string }[];
}

interface ModuleWithLessons extends Module {
  lessons: LessonWithExercises[];
}

interface PageProps {
  params: Promise<{ courseId: string; moduleId: string }>;
}

/**
 * Admin Module Detail page - edit module and manage lessons.
 */
export default function AdminModuleDetailPage({ params }: PageProps) {
  const { courseId, moduleId } = use(params);
  const router = useRouter();
  const [module, setModule] = useState<ModuleWithLessons | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [isCreatingExercise, setIsCreatingExercise] = useState(false);
  const [deletingExerciseId, setDeletingExerciseId] = useState<string | null>(null);

  const fetchModule = useCallback(async () => {
    try {
      const response = await fetch(`/api/admin/modules/${moduleId}`);
      if (!response.ok) {
        if (response.status === 403) {
          router.push("/dashboard");
          return;
        }
        if (response.status === 404) {
          router.push(`/admin/courses/${courseId}`);
          return;
        }
        throw new Error("Failed to fetch module");
      }
      const data = await response.json();
      setModule(data.module);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load module");
    } finally {
      setLoading(false);
    }
  }, [courseId, moduleId, router]);

  useEffect(() => {
    fetchModule();
  }, [fetchModule]);

  const handleReorderLessons = async (
    items: { id: string; sortOrder: number }[]
  ) => {
    const response = await fetch("/api/admin/lessons/reorder", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    });
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || "Failed to reorder lessons");
    }
    fetchModule();
  };

  const handleDeleteLesson = async (lessonId: string) => {
    if (!confirm("Are you sure you want to delete this lesson?")) return;

    setDeleteError(null);
    try {
      const response = await fetch(`/api/admin/lessons/${lessonId}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Failed to delete lesson");
      fetchModule();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete lesson");
    }
  };

  const handleDeleteExercise = async (assignmentId: string) => {
    if (!confirm("Are you sure you want to remove this quiz from this lesson?")) return;

    setDeletingExerciseId(assignmentId);
    setDeleteError(null);
    try {
      const response = await fetch(`/api/admin/assignments/${assignmentId}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Failed to remove quiz");
      fetchModule();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Failed to remove quiz");
    } finally {
      setDeletingExerciseId(null);
    }
  };

  const handleAddExercise = async (lessonId: string, lessonTitle: string) => {
    setIsCreatingExercise(true);
    setDeleteError(null);
    try {
      // 1. Create Practice Set (Draft)
      const setRes = await fetch("/api/admin/practice-sets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: `${lessonTitle} Quiz` }),
      });
      
      if (!setRes.ok) {
        const err = await setRes.json();
        throw new Error(err.error || "Failed to create practice set");
      }
      
      const { practiceSet } = await setRes.json();

      // 2. Create Assignment linking Set to Lesson
      const assignRes = await fetch("/api/admin/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          practiceSetId: practiceSet.id,
          targetType: "lesson",
          targetId: lessonId,
        }),
      });

      if (!assignRes.ok) {
        const err = await assignRes.json();
        throw new Error(err.error || "Failed to assign practice set");
      }

      // 3. Redirect to Builder
      router.push(`/admin/practice-sets/${practiceSet.id}/builder`);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Failed to add quiz");
      setIsCreatingExercise(false);
    }
  };

  const renderLesson = (lesson: LessonWithExercises) => (
    <div className="flex flex-col gap-2 w-full">
      <div className="flex flex-1 items-center justify-between">
        <div className="min-w-0 flex-1">
          <Link
            href={`/admin/courses/${courseId}/modules/${moduleId}/lessons/${lesson.id}`}
            className="font-semibold text-white hover:text-blue-400"
          >
            {lesson.title}
          </Link>
          <div className="mt-1 flex items-center gap-3 text-sm text-zinc-400">
            {lesson.muxPlaybackId ? (
              <span className="inline-flex items-center rounded-full bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-400">
                Has Video
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full bg-zinc-500/10 px-2 py-0.5 text-xs font-medium text-zinc-400">
                No Video
              </span>
            )}
            {lesson.durationSeconds && (
              <span>
                {Math.floor(lesson.durationSeconds / 60)}:
                {String(lesson.durationSeconds % 60).padStart(2, "0")}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleAddExercise(lesson.id, lesson.title);
            }}
            disabled={isCreatingExercise}
            className="text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-300"
          >
            <ClipboardList className="w-4 h-4 mr-1" />
            Add Quiz
          </Button>
          <Link
            href={`/admin/courses/${courseId}/modules/${moduleId}/lessons/${lesson.id}`}
          >
            <Button
              variant="outline"
              size="sm"
              className="border-zinc-600 text-zinc-300 hover:bg-zinc-700"
            >
              Edit
            </Button>
          </Link>
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.preventDefault();
              handleDeleteLesson(lesson.id);
            }}
            className="text-red-400 hover:bg-red-500/10 hover:text-red-300"
          >
            Delete
          </Button>
        </div>
      </div>

      {/* Exercises list */}
      {lesson.exercises && lesson.exercises.length > 0 && (
        <div className="ml-8 space-y-1 border-l-2 border-zinc-700 pl-4 mt-2">
          {lesson.exercises.map((ex) => (
            <div
              key={ex.assignmentId}
              className="flex items-center justify-between text-sm text-zinc-400 py-1"
            >
              <span className="flex items-center gap-2">
                <ClipboardList className="w-3 h-3 text-zinc-500" />
                {ex.title}
              </span>
              <div className="flex items-center gap-2">
                <Link href={`/admin/practice-sets/${ex.id}/builder`}>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-auto p-1 text-cyan-400 hover:bg-cyan-500/10 hover:text-cyan-300"
                    title="Edit Quiz"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </Button>
                </Link>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDeleteExercise(ex.assignmentId)}
                  disabled={deletingExerciseId === ex.assignmentId}
                  className="h-auto p-1 text-red-500 hover:bg-red-500/10 hover:text-red-400"
                  title="Remove from lesson"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="animate-pulse">
          <div className="mb-4 h-4 w-32 rounded bg-zinc-700" />
          <div className="mb-8 h-10 w-64 rounded bg-zinc-700" />
          <div className="h-48 rounded-lg bg-zinc-800" />
        </div>
      </div>
    );
  }

  if (error || !module) {
    return (
      <div className="container mx-auto px-4 py-8">
        <ErrorAlert message={error || "Module not found"} onRetry={fetchModule} />
        <Link href={`/admin/courses/${courseId}`} className="mt-4 inline-block">
          <Button variant="outline">Back to Course</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
        {/* Breadcrumb */}
        <nav className="mb-4 text-sm text-zinc-400">
          <Link href="/admin" className="hover:text-white">
            Admin
          </Link>
          <span className="mx-2">/</span>
          <Link href="/admin/courses" className="hover:text-white">
            Courses
          </Link>
          <span className="mx-2">/</span>
          <Link href={`/admin/courses/${courseId}`} className="hover:text-white">
            Course
          </Link>
          <span className="mx-2">/</span>
          <span className="text-zinc-200">{module.title}</span>
        </nav>

        {/* Page header */}
        <header className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">{module.title}</h1>
            <p className="mt-2 text-zinc-400">
              {module.lessons?.length || 0} lessons
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link href={`/admin/courses/${courseId}`}>
              <Button
                variant="ghost"
                className="text-zinc-400 hover:text-white"
              >
                Back to Course
              </Button>
            </Link>
            <Button
              variant="outline"
              onClick={() => setShowForm(!showForm)}
              className="border-zinc-600 text-zinc-300 hover:bg-zinc-700"
            >
              {showForm ? "Hide Details" : "Edit Details"}
            </Button>
          </div>
        </header>

        {/* Delete error */}
        {deleteError && (
          <ErrorAlert
            message={deleteError}
            className="mb-4"
            onRetry={() => setDeleteError(null)}
          />
        )}

        {/* Module edit form (collapsible) */}
        {showForm && (
          <div className="mb-8">
            <ModuleForm
              courseId={courseId}
              module={module}
              onSuccess={() => {
                fetchModule();
                setShowForm(false);
              }}
              onCancel={() => setShowForm(false)}
            />
          </div>
        )}

        {/* Lessons section */}
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold">Lessons</h2>
            <Link
              href={`/admin/courses/${courseId}/modules/${moduleId}/lessons/new`}
            >
              <Button>Add Lesson</Button>
            </Link>
          </div>

          <ContentList
            items={module.lessons || []}
            renderItem={renderLesson}
            emptyMessage="No lessons yet. Click 'Add Lesson' to create your first lesson."
            onReorder={handleReorderLessons}
          />
        </section>
      </div>
  );
}
