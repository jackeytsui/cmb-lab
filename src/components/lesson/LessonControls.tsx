"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { CheckCircle, ChevronRight, Loader2, ClipboardList } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface LessonControlsProps {
  lessonId: string;
  courseId: string;
}

export function LessonControls({ lessonId, courseId }: LessonControlsProps) {
  const router = useRouter();
  const [nextLessonId, setNextLessonId] = useState<string | null>(null);
  const [nextQuizId, setNextQuizId] = useState<string | null>(null);
  const [isComplete, setIsComplete] = useState(false);
  const [loading, setLoading] = useState(false);

  // Fetch next lesson/quiz and current completion status
  useEffect(() => {
    async function fetchData() {
      try {
        const [nextRes, progressRes] = await Promise.all([
          fetch(`/api/lessons/${lessonId}/next`),
          fetch(`/api/progress/${lessonId}`)
        ]);

        if (nextRes.ok) {
          const data = await nextRes.json();
          setNextLessonId(data.nextLesson?.id || null);
          setNextQuizId(data.nextQuiz?.id || null);
        }

        if (progressRes.ok) {
          const data = await progressRes.json();
          setIsComplete(!!data.progress?.completedAt);
        }
      } catch (error) {
        console.error("Failed to load lesson controls data", error);
      }
    }
    fetchData();
  }, [lessonId]);

  const handleMarkComplete = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/progress/${lessonId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ forceComplete: true }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        console.error("Failed to mark complete:", errorData.error);
        return;
      }

      if (res.ok) {
        setIsComplete(true);
        router.refresh(); // Refresh server components
      }
    } catch (error) {
      console.error("Failed to mark complete", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-between border-t border-zinc-800 pt-6 mt-8">
      <Button
        variant={isComplete ? "secondary" : "default"}
        onClick={handleMarkComplete}
        disabled={loading || isComplete}
        className="gap-2"
      >
        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : isComplete ? (
          <CheckCircle className="w-4 h-4 text-green-500" />
        ) : (
          <CheckCircle className="w-4 h-4" />
        )}
        {isComplete ? "Completed" : "Mark as Complete"}
      </Button>

      {nextQuizId ? (
        <Link href={`/practice/${nextQuizId}`}>
          <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white">
            Start Quiz
            <ClipboardList className="w-4 h-4" />
          </Button>
        </Link>
      ) : nextLessonId ? (
        <Link href={`/lessons/${nextLessonId}`}>
          <Button variant="outline" className="gap-2">
            Next Lesson
            <ChevronRight className="w-4 h-4" />
          </Button>
        </Link>
      ) : (
        <Link href={`/courses/${courseId}`}>
          <Button variant="ghost" className="gap-2 text-zinc-400 hover:text-white">
            Back to Course
          </Button>
        </Link>
      )}
    </div>
  );
}
