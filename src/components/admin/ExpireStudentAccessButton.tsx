"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";

export function ExpireStudentAccessButton({ userId, userName }: { userId: string; userName: string }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  const handleExpire = async () => {
    if (!confirm(`Expire access for "${userName}"? They cannot log in, but all records remain available to staff.`)) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/students/${userId}/portal-access`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "expired" }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        alert(data?.error || "Failed to expire access.");
        return;
      }
      router.refresh();
    } catch {
      alert("Network error.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleExpire}
      disabled={saving}
      className="inline-flex items-center justify-center rounded p-1 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors disabled:opacity-50"
      title="Expire access (keep records)"
      aria-label={`Expire access for ${userName}`}
    >
      <ShieldCheck className="w-3.5 h-3.5" />
    </button>
  );
}
