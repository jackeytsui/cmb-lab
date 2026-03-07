"use client";

import { useRouter } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ExerciseForm } from "@/components/admin/exercises/ExerciseForm";
import ExercisePreview from "@/components/admin/exercises/ExercisePreview";
import type { PracticeExercise } from "@/db/schema";
import type { ExerciseDefinition } from "@/types/exercises";

// ============================================================
// Props
// ============================================================

interface EditExerciseClientProps {
  exercise: PracticeExercise;
}

// ============================================================
// Component
// ============================================================

export function EditExerciseClient({ exercise }: EditExerciseClientProps) {
  const router = useRouter();

  function handleSave() {
    router.push("/admin/exercises");
    router.refresh();
  }

  function handleCancel() {
    router.back();
  }

  const definition = exercise.definition as ExerciseDefinition;

  return (
    <Tabs defaultValue="edit">
      <TabsList className="mb-4 bg-zinc-800 border border-zinc-700">
        <TabsTrigger
          value="edit"
          className="data-[state=active]:bg-zinc-700 data-[state=active]:text-white text-zinc-400"
        >
          Edit
        </TabsTrigger>
        <TabsTrigger
          value="preview"
          className="data-[state=active]:bg-zinc-700 data-[state=active]:text-white text-zinc-400"
        >
          Preview
        </TabsTrigger>
      </TabsList>

      <TabsContent value="edit">
        <ExerciseForm
          practiceSetId={exercise.practiceSetId}
          exercise={exercise}
          onSave={handleSave}
          onCancel={handleCancel}
        />
      </TabsContent>

      <TabsContent value="preview">
        <ExercisePreview
          definition={definition}
          language={exercise.language as "cantonese" | "mandarin" | "both"}
        />
      </TabsContent>
    </Tabs>
  );
}
