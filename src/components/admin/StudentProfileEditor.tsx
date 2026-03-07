"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

type UserRole = "student" | "coach" | "admin";

export function StudentProfileEditor({
  studentId,
  initialName,
  initialEmail,
  initialRole,
}: {
  studentId: string;
  initialName: string | null;
  initialEmail: string;
  initialRole: UserRole;
}) {
  const [firstName, setFirstName] = useState((initialName || "").split(" ")[0] || "");
  const [lastName, setLastName] = useState(
    (initialName || "").split(" ").slice(1).join(" ") || ""
  );
  const [email, setEmail] = useState(initialEmail);
  const [role, setRole] = useState<UserRole>(initialRole);
  const [saving, setSaving] = useState(false);

  const onSave = async () => {
    setSaving(true);
    try {
      const response = await fetch(`/api/admin/students/${studentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim().toLowerCase(),
          role,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || "Failed to update student profile");
      }
      toast.success("Student profile updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update student profile");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs text-zinc-400">First Name</label>
          <input
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
            disabled={saving}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-400">Last Name</label>
          <input
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
            disabled={saving}
          />
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs text-zinc-400">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
            disabled={saving}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-400">Role</label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as UserRole)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
            disabled={saving}
          >
            <option value="student">Student</option>
            <option value="coach">Coach</option>
            <option value="admin">Admin</option>
          </select>
        </div>
      </div>

      <button
        type="button"
        onClick={onSave}
        disabled={saving}
        className="inline-flex items-center gap-2 rounded-lg border border-border bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Save Profile
      </button>
    </div>
  );
}
