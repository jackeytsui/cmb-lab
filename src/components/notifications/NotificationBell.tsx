"use client";

import { Bell } from "lucide-react";
import * as Popover from "@radix-ui/react-popover";
import { useNotifications } from "@/hooks/useNotifications";
import { NotificationPanel } from "./NotificationPanel";

export function NotificationBell() {
  const { unreadCount, refresh } = useNotifications();

  const displayCount = unreadCount > 99 ? "99+" : unreadCount.toString();

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          className="relative p-2 hover:bg-zinc-800 rounded-lg transition-colors"
          aria-label={`${unreadCount} unread notifications`}
        >
          <Bell className="w-5 h-5 text-zinc-400" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-blue-500 text-white text-xs font-semibold rounded-full min-w-5 h-5 flex items-center justify-center px-1">
              {displayCount}
            </span>
          )}
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          className="w-80 bg-zinc-900 border border-zinc-800 rounded-lg shadow-xl overflow-hidden z-50"
        >
          <NotificationPanel onAction={refresh} />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
