"use client";

import Link from "next/link";
import { Lock, MessageCircle, ArrowRight } from "lucide-react";

/** Event the Lab Assistant widget listens for (see LabAssistantWidget). */
export const OPEN_LAB_ASSISTANT_EVENT = "cmb:open-lab-assistant";

interface LevelLockedScreenProps {
  levelLabel: string;
  requiredLevelLabel: string | null;
  requiredCourse: { id: string; title: string } | null;
}

/**
 * Hard-lock screen shown in place of a course roadmap when the previous level
 * isn't finished. Pushes the student to either continue the previous level or
 * talk to the Lab Assistant, which can grant a one-time early unlock (and
 * escalates to the team beyond that).
 */
export function LevelLockedScreen({
  levelLabel,
  requiredLevelLabel,
  requiredCourse,
}: LevelLockedScreenProps) {
  return (
    <div className="mx-auto mt-6 max-w-lg rounded-2xl border border-border bg-card p-8 text-center">
      <span
        className="mx-auto flex h-16 w-16 items-center justify-center rounded-full"
        style={{ background: "rgba(46, 58, 151, 0.12)" }}
      >
        <Lock className="h-7 w-7" style={{ color: "#2e3a97" }} />
      </span>
      <h2 className="mt-4 text-xl font-extrabold text-foreground">
        The {levelLabel} level is locked
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        {requiredLevelLabel
          ? `Complete every stop in the ${requiredLevelLabel} level to unlock this course content.`
          : "Complete the previous level to unlock this course content."}
      </p>

      <div className="mt-6 flex flex-col items-center gap-3">
        {requiredCourse && (
          <Link
            href={`/dashboard/course-library/${requiredCourse.id}`}
            className="inline-flex w-full max-w-xs items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-bold text-white transition-transform hover:-translate-y-0.5"
            style={{
              background: "linear-gradient(135deg, #2e3a97 0%, #3d4bb8 100%)",
              boxShadow: "0 4px 0 #1f2870",
            }}
          >
            Continue {requiredLevelLabel ?? "the previous level"}
            <ArrowRight className="h-4 w-4" />
          </Link>
        )}
        <button
          type="button"
          onClick={() =>
            window.dispatchEvent(new CustomEvent(OPEN_LAB_ASSISTANT_EVENT))
          }
          className="inline-flex w-full max-w-xs items-center justify-center gap-2 rounded-xl border-2 border-border bg-background px-5 py-3 text-sm font-bold text-foreground transition-colors hover:bg-muted/60"
        >
          <MessageCircle className="h-4 w-4" style={{ color: "#2e3a97" }} />
          Think you&apos;re ready? Ask the Lab Assistant
        </button>
      </div>

      <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
        The Lab Assistant can unlock the next level early for you one time. Any
        further unlocks go through the CMB team.
      </p>
    </div>
  );
}
