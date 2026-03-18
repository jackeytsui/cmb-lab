"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";

interface AssignCoachDropdownProps {
  studentId: string;
  currentCoachId: string | null;
  currentCoachName: string | null;
  coaches: Array<{ id: string; name: string | null; email: string }>;
}

export function AssignCoachDropdown({
  studentId,
  currentCoachId,
  currentCoachName,
  coaches,
}: AssignCoachDropdownProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setMenuPos({ top: rect.bottom + 4, left: rect.left });
    }
  }, [isOpen]);

  async function handleAssign(coachId: string | null) {
    setIsOpen(false);
    try {
      const res = await fetch(`/api/admin/students/${studentId}/coach`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coachId }),
      });
      if (!res.ok) {
        console.error("Failed to assign coach");
        return;
      }
      startTransition(() => {
        router.refresh();
      });
    } catch (err) {
      console.error("Failed to assign coach:", err);
    }
  }

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        disabled={isPending}
        className="inline-flex items-center gap-1 rounded-md border border-input bg-background px-2 py-1 text-xs font-medium text-foreground hover:border-primary/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-w-[120px] text-left"
      >
        <span className="truncate">
          {isPending
            ? "Saving..."
            : currentCoachName || (currentCoachId ? "Unknown" : "Unassigned")}
        </span>
        <svg
          className="ml-auto h-3 w-3 shrink-0 opacity-50"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          <div
            className="fixed z-50 min-w-[200px] max-h-[240px] overflow-y-auto rounded-md border border-border bg-popover p-1 shadow-md"
            style={{ top: menuPos.top, left: menuPos.left }}
          >
            <button
              type="button"
              onClick={() => handleAssign(null)}
              className="w-full rounded-sm px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              Unassigned
            </button>
            {coaches.map((coach) => (
              <button
                key={coach.id}
                type="button"
                onClick={() => handleAssign(coach.id)}
                className={`w-full rounded-sm px-2 py-1.5 text-left text-xs hover:bg-accent hover:text-accent-foreground transition-colors ${
                  coach.id === currentCoachId
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-foreground"
                }`}
              >
                {coach.name || coach.email}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
