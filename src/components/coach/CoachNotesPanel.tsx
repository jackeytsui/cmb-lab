"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Trash2, Lock, Eye } from "lucide-react";
import { ErrorAlert } from "@/components/ui/error-alert";

interface Note {
  id: string;
  content: string;
  visibility: "internal" | "shared";
  createdAt: string;
  coach: {
    id: string;
    name: string | null;
  };
}

interface CoachNotesPanelProps {
  submissionId: string;
  studentId: string;
  currentUserId?: string;
}

/**
 * Panel for coaches to view, add, and delete notes on student submissions.
 * Notes can be internal (coach-only) or shared (student-visible).
 */
export function CoachNotesPanel({
  submissionId,
  studentId: _studentId,
  currentUserId,
}: CoachNotesPanelProps) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // New note form state
  const [newNoteContent, setNewNoteContent] = useState("");
  const [newNoteVisibility, setNewNoteVisibility] = useState<
    "internal" | "shared"
  >("internal");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Filter state
  const [visibilityFilter, setVisibilityFilter] = useState<
    "all" | "internal" | "shared"
  >("all");

  // Fetch notes on mount
  useEffect(() => {
    fetchNotes();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchNotes is stable, only re-fetch when submissionId changes
  }, [submissionId]);

  const fetchNotes = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/submissions/${submissionId}/notes`
      );

      if (!response.ok) {
        throw new Error("Failed to fetch notes");
      }

      const data = await response.json();
      setNotes(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load notes");
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newNoteContent.trim()) {
      setError("Note content cannot be empty");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/submissions/${submissionId}/notes`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: newNoteContent.trim(),
            visibility: newNoteVisibility,
          }),
        }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to add note");
      }

      const newNote = await response.json();

      // Optimistic update - add new note to the top
      setNotes((prev) => [newNote, ...prev]);
      setNewNoteContent("");
      setSuccessMessage("Note added");
      setTimeout(() => setSuccessMessage(null), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add note");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    // Optimistic update - remove note immediately
    const noteToDelete = notes.find((n) => n.id === noteId);
    setNotes((prev) => prev.filter((n) => n.id !== noteId));

    try {
      const response = await fetch(
        `/api/submissions/${submissionId}/notes?noteId=${noteId}`,
        {
          method: "DELETE",
        }
      );

      if (!response.ok) {
        // Rollback on failure
        if (noteToDelete) {
          setNotes((prev) => [noteToDelete, ...prev]);
        }
        const data = await response.json();
        throw new Error(data.error || "Failed to delete note");
      }

      setSuccessMessage("Note deleted");
      setTimeout(() => setSuccessMessage(null), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete note");
    }
  };

  // Filter notes based on visibility filter
  const filteredNotes =
    visibilityFilter === "all"
      ? notes
      : notes.filter((note) => note.visibility === visibilityFilter);

  // Format timestamp
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-foreground">Coach Notes</h3>
        <Select
          value={visibilityFilter}
          onValueChange={(v) =>
            setVisibilityFilter(v as "all" | "internal" | "shared")
          }
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Notes</SelectItem>
            <SelectItem value="internal">Internal Only</SelectItem>
            <SelectItem value="shared">Shared Only</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {error && (
        <ErrorAlert message={error} onRetry={fetchNotes} />
      )}

      {/* Add Note Form */}
      <form onSubmit={handleAddNote} className="space-y-3 pb-4 border-b border-border">
        <div className="space-y-2">
          <Label htmlFor="note-content">Add Note</Label>
          <Textarea
            id="note-content"
            data-testid="note-input"
            placeholder="Write a note about this submission..."
            value={newNoteContent}
            onChange={(e) => setNewNoteContent(e.target.value)}
            disabled={isSubmitting}
            rows={3}
            className="w-full resize-y"
          />
        </div>

        <div className="flex items-center justify-between gap-3">
          <Select
            value={newNoteVisibility}
            onValueChange={(v) =>
              setNewNoteVisibility(v as "internal" | "shared")
            }
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="internal">
                <div className="flex items-center gap-2">
                  <Lock className="size-3" />
                  Internal (coach only)
                </div>
              </SelectItem>
              <SelectItem value="shared">
                <div className="flex items-center gap-2">
                  <Eye className="size-3" />
                  Shared with student
                </div>
              </SelectItem>
            </SelectContent>
          </Select>

          <Button
            type="submit"
            disabled={isSubmitting || !newNoteContent.trim()}
            size="sm"
            data-testid="add-note-button"
          >
            {isSubmitting ? "Adding..." : "Add Note"}
          </Button>
        </div>
      </form>

      {/* Success confirmation */}
      {successMessage && (
        <div className="rounded-md bg-green-500/10 border border-green-500/30 p-2 text-sm text-green-400 text-center">
          {successMessage}
        </div>
      )}

      {/* Notes List */}
      <div className="space-y-3">
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div
                key={i}
                className="animate-pulse rounded-lg bg-muted/50 h-20"
              />
            ))}
          </div>
        ) : filteredNotes.length === 0 ? (
          <p className="text-center text-muted-foreground py-6">
            {visibilityFilter === "all"
              ? "No notes yet"
              : `No ${visibilityFilter} notes`}
          </p>
        ) : (
          filteredNotes.map((note) => (
            <div
              key={note.id}
              data-testid="note-item"
              className="rounded-lg border border-border bg-muted/30 p-3 space-y-2"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                      note.visibility === "internal"
                        ? "bg-gray-500/10 text-gray-400"
                        : "bg-blue-500/10 text-blue-400"
                    }`}
                  >
                    {note.visibility === "internal" ? (
                      <>
                        <Lock className="size-3" />
                        Internal
                      </>
                    ) : (
                      <>
                        <Eye className="size-3" />
                        Shared
                      </>
                    )}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {note.coach.name || "Coach"} - {formatDate(note.createdAt)}
                  </span>
                </div>

                {/* Only show delete button for own notes */}
                {currentUserId === note.coach.id && (
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => handleDeleteNote(note.id)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="size-3.5" />
                    <span className="sr-only">Delete note</span>
                  </Button>
                )}
              </div>

              <p className="text-sm text-foreground whitespace-pre-wrap">
                {note.content}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
