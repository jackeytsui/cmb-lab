"use client";

import { useState, useEffect } from "react";
import { Settings } from "lucide-react";
import { NotificationItem } from "./NotificationItem";
import { NotificationPreferences } from "./NotificationPreferences";
import type { Notification } from "@/db/schema/notifications";

interface NotificationPanelProps {
  onAction: () => void;
}

export function NotificationPanel({ onAction }: NotificationPanelProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [panelOpenedAt] = useState(() => new Date().toISOString());
  const [showPreferences, setShowPreferences] = useState(false);

  useEffect(() => {
    fetchNotifications();
  }, []);

  const fetchNotifications = async () => {
    try {
      setLoading(true);
      setError(false);
      const res = await fetch("/api/notifications");
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setNotifications(data.notifications || []);
    } catch (err) {
      console.error("Failed to fetch notifications:", err);
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await fetch("/api/notifications/read-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ before: panelOpenedAt }),
      });

      // Refresh the list and trigger parent refresh
      await fetchNotifications();
      onAction();
    } catch (error) {
      console.error("Failed to mark all as read:", error);
    }
  };

  const handleItemMarkRead = async () => {
    // Refresh the list and trigger parent refresh
    await fetchNotifications();
    onAction();
  };

  // Show preferences view
  if (showPreferences) {
    return (
      <div className="w-full">
        {/* Header with back button */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
          <button
            onClick={() => setShowPreferences(false)}
            className="text-sm text-zinc-400 hover:text-zinc-100 transition-colors"
          >
            ← Back
          </button>
        </div>
        <NotificationPreferences />
      </div>
    );
  }

  // Show loading state
  if (loading) {
    return (
      <div className="p-4 text-center text-zinc-400 text-sm">
        Loading notifications...
      </div>
    );
  }

  // Show error state
  if (error) {
    return (
      <div className="w-full">
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
          <h3 className="font-semibold text-zinc-100">Notifications</h3>
        </div>
        <div className="p-8 text-center">
          <p className="text-sm text-red-400">Failed to load notifications</p>
          <button
            onClick={fetchNotifications}
            className="mt-2 text-xs text-blue-400 hover:text-blue-300 transition-colors"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  // Show empty state
  if (notifications.length === 0) {
    return (
      <div className="w-full">
        {/* Header with settings button */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
          <h3 className="font-semibold text-zinc-100">Notifications</h3>
          <button
            onClick={() => setShowPreferences(true)}
            className="p-1.5 hover:bg-zinc-800 rounded transition-colors"
            aria-label="Settings"
          >
            <Settings className="w-4 h-4 text-zinc-400" />
          </button>
        </div>
        <div className="p-8 text-center text-zinc-500 text-sm">
          No notifications yet
        </div>
      </div>
    );
  }

  // Show notification list
  return (
    <div className="w-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <h3 className="font-semibold text-zinc-100">Notifications</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={handleMarkAllRead}
            className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
          >
            Mark all read
          </button>
          <button
            onClick={() => setShowPreferences(true)}
            className="p-1.5 hover:bg-zinc-800 rounded transition-colors"
            aria-label="Settings"
          >
            <Settings className="w-4 h-4 text-zinc-400" />
          </button>
        </div>
      </div>

      {/* Notification list */}
      <div className="max-h-96 overflow-y-auto">
        {notifications.map((notification) => (
          <NotificationItem
            key={notification.id}
            notification={notification}
            onMarkRead={handleItemMarkRead}
          />
        ))}
      </div>
    </div>
  );
}
