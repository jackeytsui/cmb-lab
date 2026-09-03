"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface AssignCoachDropdownProps {
  studentId: string;
  currentCoachId: string | null;
  currentCoachName: string | null;
  additionalCoachIds?: string[];
  coaches: Array<{ id: string; name: string | null; email: string }>;
}

export function AssignCoachDropdown({
  studentId,
  currentCoachId,
  currentCoachName,
  additionalCoachIds = [],
  coaches,
}: AssignCoachDropdownProps) {
  const router = useRouter();
  const [primaryId, setPrimaryId] = useState(currentCoachId);
  const [primaryDraft, setPrimaryDraft] = useState(currentCoachId ?? "");
  const [sharedIds, setSharedIds] = useState(additionalCoachIds);
  const [addId, setAddId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const coachLabel = (id: string) => {
    const coach = coaches.find((item) => item.id === id);
    return coach?.name || coach?.email || (id === currentCoachId && currentCoachName) || "Unavailable coach";
  };
  const availableCoaches = coaches.filter((coach) => coach.id !== primaryId && !sharedIds.includes(coach.id));

  async function save(change: { coachId: string | null } | { addCoachId: string } | { removeCoachId: string }) {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const response = await fetch(`/api/admin/students/${studentId}/coach`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(change),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not save coaches. Please try again.");
      setPrimaryId(result.assignedCoachId);
      setPrimaryDraft(result.assignedCoachId ?? "");
      setSharedIds(result.additionalCoachIds);
      setAddId("");
      setSaved(true);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save coaches. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const selectClass = "min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground disabled:opacity-50";
  const buttonClass = "rounded-md border border-input px-3 py-2 text-sm text-foreground hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed";

  return (
    <div className="max-w-xl space-y-5" aria-busy={saving}>
      <div className="space-y-2">
        <label htmlFor={`primary-coach-${studentId}`} className="block text-sm font-medium text-foreground">Primary coach</label>
        <div className="flex flex-wrap gap-2">
          <select id={`primary-coach-${studentId}`} value={primaryDraft} onChange={(event) => setPrimaryDraft(event.target.value)} disabled={saving} className={selectClass}>
            <option value="">Unassigned</option>
            {primaryId && !coaches.some((coach) => coach.id === primaryId) && <option value={primaryId}>{coachLabel(primaryId)}</option>}
            {coaches.map((coach) => <option key={coach.id} value={coach.id}>{coach.name || coach.email}</option>)}
          </select>
          <button type="button" disabled={saving || primaryDraft === (primaryId ?? "")} onClick={() => save({ coachId: primaryDraft || null })} className={buttonClass}>Save primary coach</button>
        </div>
        <p className="text-xs text-muted-foreground">The primary coach remains the main contact. Changing it does not remove other shared coaches.</p>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-medium text-foreground">Additional coaches</h3>
        <p className="text-xs text-muted-foreground">Each additional coach can access this student in their coach workspace, alongside the primary coach.</p>
        {sharedIds.filter((id) => id !== primaryId).length === 0 ? (
          <p className="text-sm text-muted-foreground">No additional coaches assigned.</p>
        ) : (
          <ul className="space-y-2">
            {sharedIds.filter((id) => id !== primaryId).map((id) => (
              <li key={id} className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
                <span className="text-sm text-foreground">{coachLabel(id)}</span>
                <button type="button" disabled={saving} onClick={() => save({ removeCoachId: id })} aria-label={`Remove ${coachLabel(id)}`} className={buttonClass}>Remove</button>
              </li>
            ))}
          </ul>
        )}
        <label htmlFor={`additional-coach-${studentId}`} className="sr-only">Add an additional coach</label>
        <div className="flex flex-wrap gap-2">
          <select id={`additional-coach-${studentId}`} value={addId} onChange={(event) => setAddId(event.target.value)} disabled={saving || availableCoaches.length === 0} className={selectClass}>
            <option value="">{availableCoaches.length ? "Choose another coach…" : "All available coaches are assigned"}</option>
            {availableCoaches.map((coach) => <option key={coach.id} value={coach.id}>{coach.name || coach.email}</option>)}
          </select>
          <button type="button" disabled={saving || !addId} onClick={() => save({ addCoachId: addId })} className={buttonClass}>Add coach</button>
        </div>
      </div>
      {saving && <p role="status" className="text-sm text-muted-foreground">Saving coaches…</p>}
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {saved && !saving && <p role="status" className="text-sm text-emerald-600">Coaches saved.</p>}
    </div>
  );
}
