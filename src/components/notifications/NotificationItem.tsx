"use client";

import { formatDistanceToNow } from "date-fns";
import { useRouter } from "next/navigation";
import type { Notification } from "@/db/schema/notifications";

interface NotificationItemProps {
  notification: Notification;
  onMarkRead: () => void;
}

export function NotificationItem({
  notification,
  onMarkRead,
}: NotificationItemProps) {
  const router = useRouter();

  const handleClick = async () => {
    // Mark as read if unread
    if (!notification.read) {
      try {
        await fetch(`/api/notifications/${notification.id}`, {
          method: "PATCH",
        });
        onMarkRead();
      } catch (error) {
        console.error("Failed to mark notification as read:", error);
      }
    }

    // Navigate to link if provided
    if (notification.linkUrl) {
      router.push(notification.linkUrl);
    }
  };

  return (
    <div
      onClick={handleClick}
      className={`
        p-3 border-b border-zinc-800 cursor-pointer
        hover:bg-zinc-800/50 transition-colors
        ${!notification.read ? "bg-zinc-800/30" : ""}
      `}
    >
      <div className="flex items-start gap-2">
        {/* Unread indicator dot */}
        {!notification.read && (
          <div className="w-2 h-2 rounded-full bg-blue-500 mt-1.5 flex-shrink-0" />
        )}

        <div className="flex-1 min-w-0">
          {/* Title */}
          <div
            className={`text-sm ${!notification.read ? "font-semibold text-zinc-100" : "text-zinc-300"}`}
          >
            {notification.title}
          </div>

          {/* Body - truncated to 2 lines */}
          <div className="text-xs text-zinc-400 mt-1 line-clamp-2">
            {notification.body}
          </div>

          {/* Relative time */}
          <div className="text-xs text-zinc-500 mt-1">
            {formatDistanceToNow(new Date(notification.createdAt), {
              addSuffix: true,
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
