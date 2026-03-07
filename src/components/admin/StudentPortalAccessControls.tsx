"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

type AccessStatus = "active" | "paused" | "expired";

export function StudentPortalAccessControls({
  studentId,
  initialStatus,
  initialCourseEndDate,
}: {
  studentId: string;
  initialStatus: AccessStatus;
  initialCourseEndDate: string | null;
}) {
  const [status, setStatus] = useState<AccessStatus>(initialStatus);
  const [courseEndDate, setCourseEndDate] = useState(initialCourseEndDate ?? "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/students/${studentId}/portal-access`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          courseEndDate: courseEndDate.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Failed to update portal access");
      }
      setStatus(data.status as AccessStatus);
      setCourseEndDate(data.courseEndDate ?? "");
      toast.success("Portal access updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update portal access");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs text-zinc-400">Portal Access Status</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as AccessStatus)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
            disabled={saving}
          >
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="expired">Expired</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-400">Course End Date</label>
          <input
            type="date"
            value={courseEndDate}
            onChange={(e) => setCourseEndDate(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
            disabled={saving}
          />
        </div>
      </div>
      <p className="text-xs text-zinc-500">
        Only <span className="text-zinc-300">Active</span> users can log in. Paused and Expired users keep their data but cannot access the portal.
      </p>
      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="inline-flex items-center gap-2 rounded-lg border border-border bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Save Access Settings
      </button>
    </div>
  );
}
