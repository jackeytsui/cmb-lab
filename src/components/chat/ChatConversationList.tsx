'use client';

import { useState, useEffect } from 'react';
import { X, MessageSquare, Loader2 } from 'lucide-react';
import { formatRelativeTime } from './ChatBubble';

interface Conversation {
  id: string;
  title: string | null;
  lessonId: string | null;
  updatedAt: string;
  messageCount: number;
}

interface ChatConversationListProps {
  onSelect: (conversationId: string) => void;
  onClose: () => void;
  currentChatId?: string | null;
}

export function ChatConversationList({
  onSelect,
  onClose,
  currentChatId,
}: ChatConversationListProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchConversations() {
      try {
        const res = await fetch('/api/chat/conversations');
        if (res.ok) {
          const data = await res.json();
          setConversations(data);
        }
      } catch {
        // Silently fail — show empty list
      }
      setLoading(false);
    }

    fetchConversations();
  }, []);

  return (
    <div className="absolute inset-0 bg-zinc-900 flex flex-col z-10">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-700/50">
        <h4 className="text-sm font-medium text-zinc-300">Conversations</h4>
        <button
          onClick={onClose}
          className="p-1 text-gray-400 hover:text-white transition-colors rounded"
          aria-label="Close conversation list"
        >
          <X size={14} />
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={20} className="animate-spin text-zinc-400" />
          </div>
        ) : conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-zinc-500">
            <MessageSquare size={24} className="mb-2 opacity-50" />
            <p className="text-sm">No conversations yet</p>
          </div>
        ) : (
          <div className="py-1">
            {conversations.map((conv) => {
              const isActive = conv.id === currentChatId;
              return (
                <button
                  key={conv.id}
                  onClick={() => onSelect(conv.id)}
                  className={`w-full text-left px-4 py-3 transition-colors border-b border-zinc-800/50 ${
                    isActive
                      ? 'bg-cyan-900/20 border-l-2 border-l-cyan-500'
                      : 'hover:bg-zinc-800/50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className={`text-sm truncate ${isActive ? 'text-white font-medium' : 'text-zinc-300'}`}>
                      {conv.title || 'Untitled'}
                    </p>
                    <span className="text-[10px] text-zinc-500 shrink-0 mt-0.5">
                      {formatRelativeTime(new Date(conv.updatedAt))}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] text-zinc-500">
                      {conv.messageCount} {conv.messageCount === 1 ? 'message' : 'messages'}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
