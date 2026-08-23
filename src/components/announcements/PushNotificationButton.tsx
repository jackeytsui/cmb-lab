"use client";

import { useEffect, useState } from "react";
import { BellRing, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type PushState = "checking" | "available" | "enabling" | "enabled" | "hidden";

function toApplicationServerKey(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

export function PushNotificationButton({ className }: { className?: string }) {
  const [state, setState] = useState<PushState>("checking");

  useEffect(() => {
    let cancelled = false;

    async function checkSupport() {
      if (
        !("serviceWorker" in navigator) ||
        !("PushManager" in window) ||
        !("Notification" in window) ||
        Notification.permission === "denied"
      ) {
        if (!cancelled) setState("hidden");
        return;
      }

      try {
        const registration = await navigator.serviceWorker.ready;
        const existing = await registration.pushManager.getSubscription();
        if (!cancelled) setState(existing ? "enabled" : "available");
      } catch {
        if (!cancelled) setState("hidden");
      }
    }

    void checkSupport();
    return () => {
      cancelled = true;
    };
  }, []);

  async function enablePush() {
    setState("enabling");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "hidden" : "available");
        return;
      }

      const configResponse = await fetch("/api/notifications/push-subscription");
      const config = (await configResponse.json()) as {
        configured?: boolean;
        publicKey?: string | null;
      };
      if (!configResponse.ok || !config.configured || !config.publicKey) {
        throw new Error("Browser alerts are not configured yet");
      }

      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      const subscription =
        existing ||
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: toApplicationServerKey(config.publicKey),
        }));

      const response = await fetch("/api/notifications/push-subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription.toJSON()),
      });
      if (!response.ok) throw new Error("Could not save browser alerts");

      setState("enabled");
      toast.success("Browser announcements enabled");
    } catch (error) {
      setState("available");
      toast.error(
        error instanceof Error ? error.message : "Could not enable browser alerts",
      );
    }
  }

  if (state === "hidden" || state === "checking") return null;

  if (state === "enabled") {
    return (
      <span
        className={cn(
          "inline-flex h-9 items-center gap-1.5 rounded-full bg-white/18 px-3 text-xs font-semibold text-white",
          className,
        )}
      >
        <Check className="size-3.5" aria-hidden="true" />
        Browser alerts on
      </span>
    );
  }

  return (
    <Button
      type="button"
      size="sm"
      onClick={enablePush}
      disabled={state === "enabling"}
      className={cn(
        "rounded-full bg-white text-indigo-700 shadow-sm hover:bg-white/90",
        className,
      )}
    >
      {state === "enabling" ? (
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      ) : (
        <BellRing className="size-4" aria-hidden="true" />
      )}
      {state === "enabling" ? "Enabling…" : "Enable alerts"}
    </Button>
  );
}
