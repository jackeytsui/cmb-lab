"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, BookOpen, User } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { StudentAccessManager } from "@/components/coach/StudentAccessManager";

interface Student {
  id: string;
  name: string | null;
  email: string;
  accessCount: number;
}

interface StudentListProps {
  students: Student[];
}

/**
 * StudentList component - displays students in an expandable list format.
 * Clicking "Manage Access" expands the row to show StudentAccessManager.
 */
export function StudentList({ students }: StudentListProps) {
  const [expandedStudentId, setExpandedStudentId] = useState<string | null>(
    null
  );

  const toggleExpand = (studentId: string) => {
    setExpandedStudentId((prev) => (prev === studentId ? null : studentId));
  };

  return (
    <div className="space-y-2">
      {students.map((student) => {
        const isExpanded = expandedStudentId === student.id;
        const displayName = student.name || student.email.split("@")[0];

        return (
          <div
            key={student.id}
            className="bg-zinc-900/50 border border-zinc-800 rounded-lg overflow-hidden"
          >
            {/* Student row header */}
            <button
              onClick={() => toggleExpand(student.id)}
              className="w-full flex items-center justify-between p-4 hover:bg-zinc-800/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                {/* Avatar placeholder */}
                <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center">
                  <User className="w-5 h-5 text-zinc-400" />
                </div>

                {/* Student info */}
                <div className="text-left">
                  <div className="font-medium text-white">{displayName}</div>
                  <div className="text-sm text-zinc-400">{student.email}</div>
                </div>
              </div>

              <div className="flex items-center gap-4">
                {/* Access count badge */}
                <div className="flex items-center gap-2 text-sm text-zinc-400">
                  <BookOpen className="w-4 h-4" />
                  <span>
                    {student.accessCount} course
                    {student.accessCount !== 1 ? "s" : ""}
                  </span>
                </div>

                {/* Expand/collapse indicator */}
                <div className="text-zinc-500">
                  {isExpanded ? (
                    <ChevronDown className="w-5 h-5" />
                  ) : (
                    <ChevronRight className="w-5 h-5" />
                  )}
                </div>
              </div>
            </button>

            {/* Expanded content */}
            <AnimatePresence>
              {isExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <div className="px-4 pb-4 border-t border-zinc-800">
                    <div className="pt-4">
                      <StudentAccessManager
                        studentId={student.id}
                        studentName={displayName}
                        studentEmail={student.email}
                      />
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}
