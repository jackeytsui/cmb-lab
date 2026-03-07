"use client";

import { useRouter } from "next/navigation";
import { ExerciseForm } from "@/components/admin/exercises/ExerciseForm";
import type { PracticeExercise } from "@/db/schema";

// ============================================================
// Props
// ============================================================

interface ExerciseFormClientProps {
  practiceSetId: string;
  exercise?: PracticeExercise;
}

// ============================================================
// Component
// ============================================================

export function ExerciseFormClient({
  practiceSetId,
  exercise,
}: ExerciseFormClientProps) {
  const router = useRouter();

  function handleSave() {
    router.push("/admin/exercises");
    router.refresh();
  }

  function handleCancel() {
    router.back();
  }

  return (
    <ExerciseForm
      practiceSetId={practiceSetId}
      exercise={exercise}
      onSave={handleSave}
      onCancel={handleCancel}
    />
  );
}
