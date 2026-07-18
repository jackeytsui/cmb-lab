"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MessageCircle, CheckCircle2, AlertTriangle } from "lucide-react";

interface ConnectionInfo {
  username: string | null;
  guildStatus: string;
  joinedAt: string | null;
  syncError: string | null;
}

export function CommunityClient({
  configured,
  connection,
}: {
  configured: boolean;
  connection: ConnectionInfo | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [disconnecting, setDisconnecting] = useState(false);
  const [banner, setBanner] = useState<{
    kind: "success" | "error";
    message: string;
  } | null>(null);

  useEffect(() => {
    const result = searchParams.get("discord");
    if (!result) return;
    if (result === "connected") {
      setBanner({
        kind: "success",
        message:
          "Discord connected! You've been added to the community server with your student roles.",
      });
    } else if (result === "linked_only") {
      setBanner({
        kind: "success",
        message:
          "Discord account linked. You'll be added to the server automatically as soon as your access is active.",
      });
    } else if (result === "already_linked") {
      setBanner({
        kind: "error",
        message:
          "That Discord account is already linked to a different CMB Lab account. Contact support if this looks wrong.",
      });
    } else if (result === "declined") {
      setBanner({
        kind: "error",
        message: "Discord authorization was cancelled. Try again when you're ready.",
      });
    } else {
      setBanner({
        kind: "error",
        message: "Something went wrong connecting Discord. Please try again.",
      });
    }
  }, [searchParams]);

  async function disconnect() {
    setDisconnecting(true);
    try {
      await fetch("/api/discord/disconnect", { method: "POST" });
      router.refresh();
    } finally {
      setDisconnecting(false);
    }
  }

  const joined = connection?.guildStatus === "joined";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Discord Community</h1>
        <p className="mt-2 text-muted-foreground">
          Connect your Discord account once and we handle the rest: you&apos;re
          added to the CMB student server automatically, with access to the
          channels for your course.
        </p>
      </div>

      {banner && (
        <div
          className={`flex items-start gap-2 rounded-md px-4 py-3 text-sm ${
            banner.kind === "success"
              ? "bg-green-500/10 text-green-500"
              : "bg-red-500/10 text-red-500"
          }`}
        >
          {banner.kind === "success" ? (
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
          ) : (
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          )}
          <span>{banner.message}</span>
        </div>
      )}

      {!configured ? (
        <div className="rounded-lg border p-6 text-sm text-muted-foreground">
          The Discord community integration isn&apos;t set up yet. Check back
          soon!
        </div>
      ) : !connection ? (
        <div className="rounded-lg border p-6">
          <div className="flex items-center gap-3">
            <MessageCircle className="size-8 text-indigo-500" />
            <div>
              <h2 className="font-semibold">Join the student community</h2>
              <p className="text-sm text-muted-foreground">
                Practice with other students, get help from coaches, and never
                miss an announcement.
              </p>
            </div>
          </div>
          <a
            href="/api/discord/oauth/start"
            className="mt-4 inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
          >
            <MessageCircle className="size-4" />
            Connect Discord
          </a>
        </div>
      ) : (
        <div className="rounded-lg border p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="font-semibold">
                Connected as{" "}
                <span className="text-indigo-500">
                  {connection.username ?? "your Discord account"}
                </span>
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {joined
                  ? "You're in the community server. Your channels and roles update automatically with your course access."
                  : connection.guildStatus === "removed"
                    ? "Your community access has ended. It will be restored automatically if you re-enroll."
                    : "You're linked but not in the server yet — you'll be added automatically once your access is active."}
              </p>
              {connection.syncError && (
                <p className="mt-2 text-xs text-amber-500">
                  Last sync issue: {connection.syncError}
                </p>
              )}
            </div>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
                joined
                  ? "bg-green-500/10 text-green-500"
                  : "bg-zinc-500/10 text-zinc-400"
              }`}
            >
              <span
                className={`size-2 rounded-full ${joined ? "bg-green-500" : "bg-zinc-400"}`}
              />
              {joined ? "In server" : connection.guildStatus}
            </span>
          </div>
          <div className="mt-4 flex gap-3">
            {!joined && (
              <a
                href="/api/discord/oauth/start"
                className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
              >
                Reconnect Discord
              </a>
            )}
            <button
              onClick={disconnect}
              disabled={disconnecting}
              className="rounded-md border px-4 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
            >
              {disconnecting ? "Disconnecting..." : "Disconnect"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
