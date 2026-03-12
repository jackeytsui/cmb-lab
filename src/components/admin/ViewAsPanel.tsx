"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Eye, X } from "lucide-react";

export function ViewAsPanel() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeUser, setActiveUser] = useState<{
    email: string;
    name: string | null;
    role: string;
  } | null>(null);

  useEffect(() => {
    fetch("/api/admin/view-as")
      .then((res) => res.json())
      .then((data) => {
        if (data.active && data.user) {
          setActiveUser(data.user);
          setEmail(data.user.email);
        }
      })
      .catch(() => {});
  }, []);

  const handleViewAs = async () => {
    if (!email.trim()) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/view-as", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to impersonate user");
        return;
      }
      setActiveUser(data.user);
      router.refresh();
    } catch {
      setError("Request failed");
    } finally {
      setIsLoading(false);
    }
  };

  const handleExit = async () => {
    setIsLoading(true);
    await fetch("/api/admin/view-as", { method: "DELETE" });
    setActiveUser(null);
    setEmail("");
    setError(null);
    setIsLoading(false);
    router.refresh();
  };

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center gap-2 mb-3">
        <Eye className="size-4 text-primary" />
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          View As User
        </h2>
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        Type a user&apos;s email to see the app exactly as they see it. The sidebar, features, and permissions will reflect their access level.
      </p>
      {activeUser ? (
        <div className="flex items-center gap-3">
          <div className="flex-1 rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
            <span className="text-sm text-foreground">
              Viewing as <strong>{activeUser.name || activeUser.email}</strong>
              {activeUser.name ? ` (${activeUser.email})` : ""} — {activeUser.role}
            </span>
          </div>
          <button
            type="button"
            onClick={handleExit}
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 rounded-md bg-destructive px-3 py-2 text-xs font-semibold text-destructive-foreground hover:bg-destructive/90 transition-colors disabled:opacity-50"
          >
            <X className="size-3" />
            Exit
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleViewAs();
              }
            }}
            placeholder="user@email.com"
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 sm:max-w-sm"
          />
          <button
            type="button"
            onClick={handleViewAs}
            disabled={isLoading || !email.trim()}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Eye className="size-3.5" />
            {isLoading ? "Loading..." : "View As"}
          </button>
        </div>
      )}
      {error && (
        <p className="mt-2 text-xs text-red-500">{error}</p>
      )}
    </section>
  );
}
