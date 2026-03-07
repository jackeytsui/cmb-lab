'use client';

import { motion } from 'framer-motion';

interface ChatBubbleProps {
  role: 'user' | 'assistant';
  timestamp?: Date;
  children: React.ReactNode;
  className?: string;
}

/**
 * Formats a date as a relative time string.
 * - "just now" if < 1 minute ago
 * - "Xm ago" if < 60 minutes ago
 * - "Xh ago" if < 24 hours ago
 * - "HH:MM" (24h format) if today
 * - "Mon HH:MM" if this week
 * - Full date otherwise
 */
export function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);

  if (diffMinutes < 1) return 'just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;

  // Check if today
  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();

  if (isToday) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  }

  // Check if this week (within 7 days)
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays < 7) {
    const dayName = date.toLocaleDateString([], { weekday: 'short' });
    const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    return `${dayName} ${time}`;
  }

  return date.toLocaleDateString();
}

export function ChatBubble({ role, timestamp, children, className }: ChatBubbleProps) {
  const isUser = role === 'user';

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={`flex ${isUser ? 'justify-end' : 'justify-start'} ${className ?? ''}`}
    >
      <div className="flex flex-col max-w-[80%]">
        <div
          className={
            isUser
              ? 'bg-blue-600 text-white rounded-2xl rounded-br-sm px-4 py-2.5 break-words'
              : 'bg-zinc-800 text-zinc-100 rounded-2xl rounded-bl-sm px-4 py-2.5 break-words'
          }
        >
          {children}
        </div>
        {timestamp && (
          <p
            className={`text-[10px] text-zinc-500 mt-1 mb-2 ${isUser ? 'text-right' : 'text-left'}`}
          >
            {formatRelativeTime(timestamp)}
          </p>
        )}
      </div>
    </motion.div>
  );
}
