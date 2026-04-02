"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

export function DeleteUserButton({ userId, userName }: { userId: string; userName: string }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!confirm(`Remove "${userName}" from the system? This will revoke their access.`)) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/students/${userId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        alert(data?.error || "Failed to remove user.");
        return;
      }
      router.refresh();
    } catch {
      alert("Network error.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={deleting}
      className="inline-flex items-center justify-center rounded p-1 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors disabled:opacity-50"
      title="Remove user"
    >
      <Trash2 className="w-3.5 h-3.5" />
    </button>
  );
}
