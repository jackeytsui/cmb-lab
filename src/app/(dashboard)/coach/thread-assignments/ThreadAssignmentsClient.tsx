"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import Link from "next/link";
import { Plus, Trash2, Loader2, GitBranch, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ThreadAssignmentDialog } from "@/components/coach/ThreadAssignmentDialog";

// ============================================================
// Types
// ============================================================

interface CoachThreadAssignment {
  id: string;
  threadId: string;
  threadTitle: string;
  targetType: string;
  targetId: string;
  notes: string | null;
  dueDate: Date | null;
  createdAt: Date;
}

interface ThreadAssignmentsClientProps {
  initialAssignments: CoachThreadAssignment[];
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

export function ThreadAssignmentsClient({
  initialAssignments,
}: ThreadAssignmentsClientProps) {
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
      const res = await fetch(`/api/admin/thread-assignments/${id}`, {
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
          <h1 className="text-2xl font-bold text-foreground">Thread Assignments</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Assign video threads to students as homework
          </p>
        </div>
        <Button
          onClick={() => setDialogOpen(true)}
          className="bg-indigo-600 text-white hover:bg-indigo-700"
        >
          <Plus className="mr-2 h-4 w-4" />
          Assign Thread
        </Button>
      </div>

      {/* Assignment list */}
      {initialAssignments.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <GitBranch className="mb-4 h-12 w-12 text-muted-foreground" />
          <h3 className="text-lg font-medium text-foreground">
            No thread assignments yet
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Click &quot;Assign Thread&quot; to assign a video thread to your students.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {initialAssignments.map((assignment) => (
            <Card
              key={assignment.id}
              className="border-border bg-card hover:border-indigo-500/50 transition-colors"
            >
              <CardContent className="flex items-center gap-4 p-4">
                {/* Thread icon placeholder */}
                <Link
                  href={`/coach/thread-assignments/${assignment.id}`}
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-muted hover:bg-muted transition-colors"
                >
                  <GitBranch className="h-6 w-6 text-muted-foreground" />
                </Link>

                {/* Assignment details -- clickable to progress page */}
                <Link
                  href={`/coach/thread-assignments/${assignment.id}`}
                  className="min-w-0 flex-1"
                >
                  <div className="flex items-center gap-2">
                    <h3 className="truncate text-sm font-medium text-foreground">
                      {assignment.threadTitle || "Untitled Thread"}
                    </h3>
                  </div>
                  <div className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="rounded bg-muted px-1.5 py-0.5">
                      {TARGET_TYPE_LABELS[assignment.targetType] ?? assignment.targetType}
                    </span>
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
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {assignment.notes}
                    </p>
                  )}
                </Link>

                {/* Action buttons */}
                <div className="flex items-center gap-1 shrink-0">
                  <Link
                    href={`/coach/thread-assignments/${assignment.id}`}
                    className="p-1.5 text-muted-foreground hover:text-indigo-400 transition-colors"
                  >
                    <BarChart3 className="h-4 w-4" />
                  </Link>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(assignment.id)}
                    disabled={deletingId === assignment.id}
                    className="shrink-0 text-muted-foreground hover:text-red-400"
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
      <ThreadAssignmentDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreated={handleCreated}
      />
    </>
  );
}
