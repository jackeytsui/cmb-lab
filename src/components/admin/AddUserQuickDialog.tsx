"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type RoleType = "student" | "coach" | "admin";
type AccessStatus = "active" | "paused" | "expired";
type CoachOption = { id: string; name: string | null; email: string };

export function AddUserQuickDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [coaches, setCoaches] = useState<CoachOption[]>([]);
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    role: "student" as RoleType,
    courseEndDate: "",
    accessStatus: "active" as AccessStatus,
    assignedCoachId: "" as string,
  });

  // Fetch coaches when dialog opens
  useEffect(() => {
    if (!open) return;
    fetch("/api/admin/coaches")
      .then((res) => res.json())
      .then((data) => setCoaches(data.coaches ?? []))
      .catch(() => {});
  }, [open]);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!form.firstName.trim() || !form.lastName.trim() || !form.email.trim()) {
      toast.error("First name, last name, and email are required.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/students/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "upload_only",
          records: [
            {
              firstName: form.firstName.trim(),
              lastName: form.lastName.trim(),
              email: form.email.trim().toLowerCase(),
              role: form.role,
              courseEndDate: form.courseEndDate || undefined,
              portalAccessStatus: form.accessStatus,
            },
          ],
        }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const err =
          data?.error ||
          data?.results?.[0]?.error ||
          "Failed to add user. Please try again.";
        toast.error(err);
        return;
      }

      const firstResult = data?.results?.[0];
      if (firstResult && !firstResult.success) {
        toast.error(firstResult.error || "Failed to add user.");
        return;
      }

      // If coach was selected, assign after user creation
      if (form.assignedCoachId && firstResult?.userId) {
        try {
          await fetch(`/api/admin/students/${firstResult.userId}/coach`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ coachId: form.assignedCoachId }),
          });
        } catch {
          // Non-critical - coach assignment can be done later
        }
      }

      toast.success("User added successfully.");
      setOpen(false);
      setForm({
        firstName: "",
        lastName: "",
        email: "",
        role: "student",
        courseEndDate: "",
        accessStatus: "active",
        assignedCoachId: "",
      });
      router.refresh();
    } catch {
      toast.error("Network error -- please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Add Contact
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Contact</DialogTitle>
          <DialogDescription>
            Create a user directly without sending an invitation email.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={onSubmit}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="quick-first-name">First Name *</Label>
              <Input
                id="quick-first-name"
                value={form.firstName}
                onChange={(e) => setForm((prev) => ({ ...prev, firstName: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="quick-last-name">Last Name *</Label>
              <Input
                id="quick-last-name"
                value={form.lastName}
                onChange={(e) => setForm((prev) => ({ ...prev, lastName: e.target.value }))}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="quick-email">Email Address *</Label>
            <Input
              id="quick-email"
              type="email"
              value={form.email}
              onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
              required
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="quick-role">Role *</Label>
              <select
                id="quick-role"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={form.role}
                onChange={(e) => setForm((prev) => ({ ...prev, role: e.target.value as RoleType }))}
              >
                <option value="student">Student</option>
                <option value="coach">Coach</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="quick-status">Access Status</Label>
              <select
                id="quick-status"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={form.accessStatus}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, accessStatus: e.target.value as AccessStatus }))
                }
              >
                <option value="active">Active</option>
                <option value="paused">Paused</option>
                <option value="expired">Expired</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="quick-course-end-date">Course End Date (Optional)</Label>
              <Input
                id="quick-course-end-date"
                type="date"
                value={form.courseEndDate}
                onChange={(e) => setForm((prev) => ({ ...prev, courseEndDate: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="quick-coach">Assigned Coach (Optional)</Label>
              <select
                id="quick-coach"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={form.assignedCoachId}
                onChange={(e) => setForm((prev) => ({ ...prev, assignedCoachId: e.target.value }))}
              >
                <option value="">No coach assigned</option>
                {coaches.map((coach) => (
                  <option key={coach.id} value={coach.id}>
                    {coach.name || coach.email}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Adding..." : "Add Contact"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
