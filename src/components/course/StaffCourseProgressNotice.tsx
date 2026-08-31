import { CheckCircle2 } from "lucide-react";

export function StaffCourseProgressNotice() {
  return (
    <div role="note" className="my-4 flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-foreground">
      <CheckCircle2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
      <div>
        <p className="font-semibold">Completed & unlocked — admin and coach access</p>
        <p className="mt-1 text-muted-foreground">
          All course lessons are shown as complete so you can open any chapter.
          This does not change student progress, award XP, or submit assignments.
        </p>
      </div>
    </div>
  );
}
