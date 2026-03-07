'use client';

import { useState, useRef, useEffect, type FormEvent } from 'react';
import { Send, Square, Trash2, X, History, Plus } from 'lucide-react';
import { ChatMessage } from './ChatMessage';
import { ChatConversationList } from './ChatConversationList';
import { useChatbot } from '@/hooks/useChatbot';

interface ChatPanelProps {
  onClose: () => void;
  chatId?: string | null;
  lessonId?: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  initialMessages?: any[];
  onNewConversation?: () => void;
  onSelectConversation?: (id: string) => void;
}

export function ChatPanel({
  onClose,
  chatId,
  lessonId,
  initialMessages,
  onNewConversation,
  onSelectConversation,
}: ChatPanelProps) {
  const { messages, sendMessage, status, setMessages, error, clearError, stop } = useChatbot({
    chatId: chatId ?? undefined,
    lessonId: lessonId,
    initialMessages,
  });
  const [input, setInput] = useState('');
  const [showConversations, setShowConversations] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-focus input when panel opens
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const isStreaming = status === 'streaming';
  const isBusy = status !== 'ready' && !isStreaming;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!input.trim() || (status !== 'ready' && status !== 'streaming')) return;

    sendMessage({ text: input.trim() });
    setInput('');
  }

  function handleClear() {
    setMessages([]);
    setInput('');
  }

  function handleRetry() {
    clearError();
    // Re-send the last user message if available
    const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user');
    if (lastUserMessage) {
      const textPart = lastUserMessage.parts.find((p) => p.type === 'text');
      if (textPart && 'text' in textPart) {
        sendMessage({ text: textPart.text });
      }
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-zinc-900/80 backdrop-blur-sm border-b border-zinc-700/50">
        <h3 className="font-semibold text-white text-sm">Learning Assistant</h3>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onNewConversation?.()}
            className="p-1.5 text-gray-400 hover:text-white transition-colors rounded"
            aria-label="New conversation"
            title="New conversation"
          >
            <Plus size={16} />
          </button>
          <button
            onClick={() => setShowConversations((prev) => !prev)}
            className={`p-1.5 transition-colors rounded ${
              showConversations ? 'text-cyan-400' : 'text-gray-400 hover:text-white'
            }`}
            aria-label="Conversation history"
            title="Conversation history"
          >
            <History size={16} />
          </button>
          <button
            onClick={handleClear}
            className="p-1.5 text-gray-400 hover:text-white transition-colors rounded"
            aria-label="Clear conversation"
          >
            <Trash2 size={16} />
          </button>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-white transition-colors rounded"
            aria-label="Close chat"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Messages area with conversation list overlay */}
      <div className="flex-1 overflow-y-auto relative">
        {showConversations && onSelectConversation ? (
          <ChatConversationList
            onSelect={(id) => {
              onSelectConversation(id);
              setShowConversations(false);
            }}
            onClose={() => setShowConversations(false)}
            currentChatId={chatId}
          />
        ) : (
          <div className="px-3 py-4 space-y-1">
            {messages.length > 0 ? (
              messages.map((message) => (
                <ChatMessage key={message.id} message={message} />
              ))
            ) : (
              <div className="flex-1 flex items-center justify-center h-full min-h-[200px]">
                <p className="text-zinc-400 text-sm text-center max-w-[240px]">
                  Hi! I&apos;m your learning assistant. Ask me anything about your courses, Chinese language, or the platform.
                </p>
              </div>
            )}

            {/* Streaming indicator */}
            {status === 'submitted' && (
              <p className="text-zinc-400 text-sm animate-pulse">Thinking...</p>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Error display with retry */}
      {error && (
        <div className="text-red-400 text-xs px-4 py-1">
          {error.message?.toLowerCase().includes('too many') || error.message?.includes('429') ? (
            <p>You&apos;re sending messages too quickly. Please wait a moment before trying again.</p>
          ) : typeof navigator !== 'undefined' && !navigator.onLine ? (
            <p>You appear to be offline. Check your internet connection.</p>
          ) : (
            <p>Something went wrong.</p>
          )}
          <button className="underline hover:text-red-300 mt-0.5" onClick={handleRetry}>
            Try again
          </button>
        </div>
      )}

      {/* Input form */}
      <form onSubmit={handleSubmit} className="p-3 border-t border-zinc-800 flex gap-2">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask a question..."
          disabled={isBusy}
          className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-cyan-500 disabled:opacity-50"
        />
        {isStreaming ? (
          <button
            type="button"
            onClick={() => stop()}
            className="p-2 rounded-lg bg-red-600 hover:bg-red-500 text-white transition-colors"
            aria-label="Stop generating"
          >
            <Square size={16} />
          </button>
        ) : (
          <button
            type="submit"
            disabled={isBusy || !input.trim()}
            className="p-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            aria-label="Send message"
          >
            <Send size={16} />
          </button>
        )}
      </form>
    </div>
  );
}
