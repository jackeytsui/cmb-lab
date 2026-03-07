"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

interface Student {
  id: string;
  name: string;
  email: string;
}

interface AssignListDialogProps {
  listId: string | null;
  onClose: () => void;
  onSuccess: () => void;
}

export function AssignListDialog({ listId, onClose, onSuccess }: AssignListDialogProps) {
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (listId) {
      setIsLoading(true);
      fetch("/api/coach/students")
        .then((res) => res.json())
        .then((data) => {
          if (data.students) setStudents(data.students);
        })
        .finally(() => setIsLoading(false));
    } else {
        setStudents([]);
        setSelectedStudentIds(new Set());
    }
  }, [listId]);

  const toggleStudent = (id: string) => {
    const next = new Set(selectedStudentIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedStudentIds(next);
  };

  const handleAssign = async () => {
    if (!listId || selectedStudentIds.size === 0) return;
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/coach/vocabulary/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listId,
          studentIds: Array.from(selectedStudentIds),
        }),
      });
      if (res.ok) {
        onSuccess();
        onClose();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={!!listId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[500px] bg-zinc-900 border-zinc-800 text-zinc-100">
        <DialogHeader>
          <DialogTitle>Assign List to Students</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center p-8">
            <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
          </div>
        ) : (
          <div className="space-y-4 mt-4">
            <div className="max-h-[300px] overflow-y-auto space-y-2 pr-2 custom-scrollbar">
              {students.length === 0 ? (
                <p className="text-zinc-500 text-sm text-center py-4">No students found.</p>
              ) : (
                students.map((student) => {
                    const isSelected = selectedStudentIds.has(student.id);
                    return (
                    <div
                        key={student.id}
                        onClick={() => toggleStudent(student.id)}
                        className={`flex items-center p-3 rounded-lg border cursor-pointer transition-colors ${
                        isSelected
                            ? "bg-cyan-500/10 border-cyan-500/50"
                            : "bg-zinc-950 border-zinc-800 hover:border-zinc-700"
                        }`}
                    >
                        <div className={`w-4 h-4 rounded border mr-3 flex items-center justify-center ${
                        isSelected ? "bg-cyan-500 border-cyan-500" : "border-zinc-600"
                        }`}>
                        {isSelected && <div className="w-2 h-2 bg-white rounded-sm" />}
                        </div>
                        <div>
                        <p className="text-sm font-medium text-zinc-200">{student.name}</p>
                        <p className="text-xs text-zinc-500">{student.email}</p>
                        </div>
                    </div>
                    );
                })
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={onClose}>Cancel</Button>
              <Button
                onClick={handleAssign}
                disabled={isSubmitting || selectedStudentIds.size === 0}
              >
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Assign ({selectedStudentIds.size})
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
