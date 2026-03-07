"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import Link from "next/link";
import { Plus, Trash2, Loader2, Video, ExternalLink, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { VideoAssignmentDialog } from "@/components/coach/VideoAssignmentDialog";

import type { VideoAssignment } from "@/db/schema/video";

// ============================================================
// Types
// ============================================================

interface VideoAssignmentsClientProps {
  initialAssignments: VideoAssignment[];
}

// ============================================================
// Target type labels
// ============================================================

const TARGET_TYPE_LABELS: Record<string, string> = {
  course: "Course",
  module: "Module",
  lesson: "Lesson",
  student: "Student",
  tag: "Tag",
};

// ============================================================
// Component
// ============================================================

export function VideoAssignmentsClient({
  initialAssignments,
}: VideoAssignmentsClientProps) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Handle assignment created -- refresh server data
  function handleCreated() {
    router.refresh();
  }

  // Handle delete
  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/admin/video-assignments/${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        router.refresh();
      }
    } catch {
      // Silent failure
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <>
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Video Assignments</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Assign YouTube videos to students as homework
          </p>
        </div>
        <Button
          onClick={() => setDialogOpen(true)}
          className="bg-blue-600 text-white hover:bg-blue-700"
        >
          <Plus className="mr-2 h-4 w-4" />
          New Assignment
        </Button>
      </div>

      {/* Assignment list */}
      {initialAssignments.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Video className="mb-4 h-12 w-12 text-zinc-600" />
          <h3 className="text-lg font-medium text-zinc-300">
            No video assignments yet
          </h3>
          <p className="mt-1 text-sm text-zinc-500">
            Click &quot;New Assignment&quot; to assign a YouTube video to your students.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {initialAssignments.map((assignment) => (
            <Card
              key={assignment.id}
              className="border-zinc-800 bg-zinc-900/50 hover:border-blue-500/50 transition-colors"
            >
              <CardContent className="flex items-center gap-4 p-4">
                {/* Video thumbnail placeholder */}
                <Link
                  href={`/coach/video-assignments/${assignment.id}`}
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-zinc-800 hover:bg-zinc-700 transition-colors"
                >
                  <Video className="h-6 w-6 text-zinc-500" />
                </Link>

                {/* Assignment details — clickable to progress page */}
                <Link
                  href={`/coach/video-assignments/${assignment.id}`}
                  className="min-w-0 flex-1"
                >
                  <div className="flex items-center gap-2">
                    <h3 className="truncate text-sm font-medium text-white">
                      {assignment.title || "Untitled"}
                    </h3>
                  </div>
                  <div className="mt-0.5 flex items-center gap-3 text-xs text-zinc-500">
                    <span className="rounded bg-zinc-800 px-1.5 py-0.5">
                      {TARGET_TYPE_LABELS[assignment.targetType] ?? assignment.targetType}
                    </span>
                    <span>{assignment.youtubeVideoId}</span>
                    {assignment.dueDate && (
                      <span>
                        Due: {format(new Date(assignment.dueDate), "MMM d, yyyy")}
                      </span>
                    )}
                    <span>
                      Created: {format(new Date(assignment.createdAt), "MMM d, yyyy")}
                    </span>
                  </div>
                  {assignment.notes && (
                    <p className="mt-1 truncate text-xs text-zinc-400">
                      {assignment.notes}
                    </p>
                  )}
                </Link>

                {/* Action buttons */}
                <div className="flex items-center gap-1 shrink-0">
                  <a
                    href={assignment.youtubeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 text-zinc-500 hover:text-cyan-400 transition-colors"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                  <Link
                    href={`/coach/video-assignments/${assignment.id}`}
                    className="p-1.5 text-zinc-500 hover:text-blue-400 transition-colors"
                  >
                    <BarChart3 className="h-4 w-4" />
                  </Link>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(assignment.id)}
                    disabled={deletingId === assignment.id}
                    className="shrink-0 text-zinc-500 hover:text-red-400"
                  >
                    {deletingId === assignment.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create dialog */}
      <VideoAssignmentDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreated={handleCreated}
      />
    </>
  );
}
