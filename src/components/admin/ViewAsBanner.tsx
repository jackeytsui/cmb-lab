"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, X } from "lucide-react";

export function ViewAsBanner({
  userName,
  userEmail,
  userRole,
}: {
  userName: string | null;
  userEmail: string;
  userRole: string;
}) {
  const router = useRouter();
  const [isExiting, setIsExiting] = useState(false);

  const handleExit = async () => {
    setIsExiting(true);
    await fetch("/api/admin/view-as", { method: "DELETE" });
    router.refresh();
  };

  return (
    <div className="sticky top-0 z-50 flex items-center justify-center gap-3 bg-amber-500 px-4 py-2 text-sm font-medium text-black">
      <Eye className="size-4" />
      <span>
        Viewing as{" "}
        <strong>{userName || userEmail}</strong>
        {userName ? ` (${userEmail})` : ""} — {userRole}
      </span>
      <button
        type="button"
        onClick={handleExit}
        disabled={isExiting}
        className="ml-2 inline-flex items-center gap-1 rounded-md bg-black/20 px-2.5 py-1 text-xs font-semibold text-black hover:bg-black/30 transition-colors disabled:opacity-50"
      >
        <X className="size-3" />
        {isExiting ? "Exiting..." : "Exit View As"}
      </button>
    </div>
  );
}
