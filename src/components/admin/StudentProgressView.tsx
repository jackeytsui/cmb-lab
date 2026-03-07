"use client";

import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  BookOpen,
  Layers,
  CheckCircle,
  Circle,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface LessonProgress {
  id: string;
  title: string;
  videoWatchedPercent: number;
  interactionsCompleted: number;
  interactionsTotal: number;
  completedAt: string | null;
}

interface ModuleProgress {
  id: string;
  title: string;
  lessons: LessonProgress[];
}

interface CourseProgress {
  id: string;
  title: string;
  progress: {
    lessonsTotal: number;
    lessonsCompleted: number;
    percentComplete: number;
  };
  modules: ModuleProgress[];
}

interface StudentProgressViewProps {
  courses: CourseProgress[];
  studentId: string;
}

/**
 * StudentProgressView - accordion/collapsible view of course > module > lesson progress.
 * Color coded: green=complete, yellow=in progress, gray=not started.
 */
export function StudentProgressView({ courses, studentId }: StudentProgressViewProps) {
  const [expandedCourses, setExpandedCourses] = useState<Set<string>>(
    new Set()
  );
  const [expandedModules, setExpandedModules] = useState<Set<string>>(
    new Set()
  );

  const toggleCourse = (courseId: string) => {
    setExpandedCourses((prev) => {
      const next = new Set(prev);
      if (next.has(courseId)) {
        next.delete(courseId);
      } else {
        next.add(courseId);
      }
      return next;
    });
  };

  const toggleModule = (moduleId: string) => {
    setExpandedModules((prev) => {
      const next = new Set(prev);
      if (next.has(moduleId)) {
        next.delete(moduleId);
      } else {
        next.add(moduleId);
      }
      return next;
    });
  };

  if (courses.length === 0) {
    return (
      <div className="text-center py-12 bg-zinc-900/50 border border-zinc-800 rounded-lg">
        <BookOpen className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
        <p className="text-zinc-400">No course progress yet</p>
        <p className="text-zinc-500 text-sm mt-1">
          Student has not started any enrolled courses
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {courses.map((course) => {
        const isCourseExpanded = expandedCourses.has(course.id);

        return (
          <div
            key={course.id}
            className="bg-zinc-900/50 border border-zinc-800 rounded-lg overflow-hidden"
          >
            {/* Course header */}
            <button
              onClick={() => toggleCourse(course.id)}
              className="w-full flex items-center justify-between p-4 hover:bg-zinc-800/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-cyan-600/20 flex items-center justify-center shrink-0">
                  <BookOpen className="w-5 h-5 text-cyan-400" />
                </div>
                <div className="text-left">
                  <div className="font-semibold text-white">{course.title}</div>
                  <div className="text-sm text-zinc-400">
                    {course.progress.lessonsCompleted} of{" "}
                    {course.progress.lessonsTotal} lessons completed
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-4">
                {/* Progress bar */}
                <div className="hidden sm:flex items-center gap-2">
                  <div className="w-32 h-2 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        course.progress.percentComplete === 100
                          ? "bg-green-500"
                          : course.progress.percentComplete > 0
                          ? "bg-yellow-500"
                          : "bg-zinc-700"
                      }`}
                      style={{ width: `${course.progress.percentComplete}%` }}
                    />
                  </div>
                  <span className="text-sm text-zinc-400 w-12 text-right">
                    {course.progress.percentComplete}%
                  </span>
                </div>

                {/* Expand icon */}
                {isCourseExpanded ? (
                  <ChevronDown className="w-5 h-5 text-zinc-400" />
                ) : (
                  <ChevronRight className="w-5 h-5 text-zinc-400" />
                )}
              </div>
            </button>

            {/* Course content (modules) */}
            <AnimatePresence>
              {isCourseExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <div className="border-t border-zinc-800">
                    {course.modules.map((module) => {
                      const isModuleExpanded = expandedModules.has(module.id);
                      const completedLessons = module.lessons.filter(
                        (l) => l.completedAt
                      ).length;

                      return (
                        <div
                          key={module.id}
                          className="border-b border-zinc-800 last:border-b-0"
                        >
                          {/* Module header */}
                          <button
                            onClick={() => toggleModule(module.id)}
                            className="w-full flex items-center justify-between px-4 py-3 pl-8 hover:bg-zinc-800/30 transition-colors"
                          >
                            <div className="flex items-center gap-3">
                              <Layers className="w-4 h-4 text-zinc-400" />
                              <div className="text-left">
                                <div className="font-medium text-zinc-200">
                                  {module.title}
                                </div>
                                <div className="text-xs text-zinc-500">
                                  {completedLessons} of {module.lessons.length}{" "}
                                  lessons
                                </div>
                              </div>
                            </div>

                            {isModuleExpanded ? (
                              <ChevronDown className="w-4 h-4 text-zinc-500" />
                            ) : (
                              <ChevronRight className="w-4 h-4 text-zinc-500" />
                            )}
                          </button>

                          {/* Module content (lessons) */}
                          <AnimatePresence>
                            {isModuleExpanded && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.15 }}
                              >
                                <div className="bg-zinc-950/50">
                                  {module.lessons.map((lesson) => (
                                    <LessonRow
                                      key={lesson.id}
                                      lesson={lesson}
                                      studentId={studentId}
                                    />
                                  ))}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      );
                    })}
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

function LessonRow({ lesson, studentId }: { lesson: LessonProgress; studentId: string }) {
  const [isComplete, setIsComplete] = useState(!!lesson.completedAt);
  const [isLoading, setIsLoading] = useState(false);

  const isInProgress =
    !isComplete &&
    (lesson.videoWatchedPercent > 0 || lesson.interactionsCompleted > 0);

  const handleToggle = async () => {
    setIsLoading(true);
    const newState = !isComplete;
    
    // Optimistic update
    setIsComplete(newState);

    try {
      const res = await fetch(`/api/admin/students/${studentId}/progress/toggle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lessonId: lesson.id, isComplete: newState }),
      });
      
      if (!res.ok) {
        throw new Error("Failed");
      }
    } catch (error) {
      console.error("Failed to toggle lesson progress", error);
      setIsComplete(!newState); // Revert
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-between px-4 py-3 pl-12 border-t border-zinc-800/50 hover:bg-zinc-900 transition-colors">
      <div className="flex items-center gap-3">
        {/* Interactive Checkbox */}
        <button
          onClick={handleToggle}
          disabled={isLoading}
          className={`shrink-0 transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-500 rounded-full ${isLoading ? "opacity-50 cursor-wait" : "hover:opacity-80 cursor-pointer"}`}
          title={isComplete ? "Mark as incomplete" : "Mark as complete"}
        >
          {isComplete ? (
            <CheckCircle className="w-5 h-5 text-green-500" />
          ) : (
            <Circle className={`w-5 h-5 ${isInProgress ? "text-yellow-500" : "text-zinc-600"}`} />
          )}
        </button>

        <span
          className={`text-sm font-medium ${
            isComplete
              ? "text-green-400"
              : isInProgress
              ? "text-yellow-400"
              : "text-zinc-400"
          }`}
        >
          {lesson.title}
        </span>
      </div>

      {/* Progress details */}
      <div className="flex items-center gap-4 text-xs opacity-70">
        {/* Video progress */}
        <div className="flex items-center gap-2">
          <span className="text-zinc-600">Video:</span>
          <div className="w-16 h-1 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${
                lesson.videoWatchedPercent >= 95
                  ? "bg-green-500"
                  : lesson.videoWatchedPercent > 0
                  ? "bg-yellow-500"
                  : "bg-zinc-700"
              }`}
              style={{ width: `${lesson.videoWatchedPercent}%` }}
            />
          </div>
          <span className="text-zinc-500 w-8 text-right">
            {lesson.videoWatchedPercent}%
          </span>
        </div>

        {/* Interactions progress */}
        {lesson.interactionsTotal > 0 && (
          <div className="flex items-center gap-1 text-zinc-500">
            <span className="text-zinc-600">Quiz:</span>
            <span
              className={
                lesson.interactionsCompleted === lesson.interactionsTotal
                  ? "text-green-500"
                  : lesson.interactionsCompleted > 0
                  ? "text-yellow-500"
                  : "text-zinc-500"
              }
            >
              {lesson.interactionsCompleted}/{lesson.interactionsTotal}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}