'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useUser } from '@clerk/nextjs';
import { Send, Square, X } from 'lucide-react';
import { useLabAssistant } from '@/hooks/useLabAssistant';

const SUPPORT_EMAIL = 'contact@thecmblueprint.com';

// CMB brand blue — matches the launcher and the course library header.
const BRAND_BLUE = '#2e3a97';

// FAQ chips pinned at the top — one per launch-scope intent.
const FAQ_CHIPS = [
  'When does my program start?',
  'When does my program end?',
  "Who's my coach?",
  'How do referrals work?',
  'Book a testimonial with Sheldon',
];

const WELCOME_MESSAGE =
  "Hi! I'm the CMB Lab Assistant. I can help with your start and end dates, your coach, referrals, or booking a testimonial with Sheldon. Anything else, I'll pass straight to the team.";

interface LabAssistantPanelProps {
  onClose: () => void;
}

export function LabAssistantPanel({ onClose }: LabAssistantPanelProps) {
  const { user } = useUser();
  const { messages, sendMessage, status, error, clearError, stop } =
    useLabAssistant();
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const email =
    user?.primaryEmailAddress?.emailAddress ??
    user?.emailAddresses?.[0]?.emailAddress ??
    '';

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const isStreaming = status === 'streaming';
  // 'error' stays sendable so the student can retry after a failed request.
  const canSend = status === 'ready' || status === 'error';

  function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || !canSend) return;
    clearError();
    sendMessage({ text: trimmed });
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    send(input);
    setInput('');
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header: title + BETA badge + signed-in email (brand blue) */}
      <div
        className="px-4 py-3 border-b border-border"
        style={{ backgroundColor: BRAND_BLUE }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-white text-sm">
              CMB Lab Assistant
            </h3>
            <span className="text-[10px] font-bold uppercase tracking-wide bg-amber-400/20 text-amber-300 border border-amber-300/40 rounded px-1.5 py-0.5">
              Beta
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-white/70 hover:text-white transition-colors rounded"
            aria-label="Close assistant"
          >
            <X size={16} />
          </button>
        </div>
        {email && (
          <p className="text-xs text-white/70 mt-0.5 truncate">
            Signed in as {email}
          </p>
        )}
      </div>

      {/* FAQ chips pinned at top */}
      <div className="px-3 py-2 border-b border-border bg-muted/40 flex flex-wrap gap-1.5">
        {FAQ_CHIPS.map((chip) => (
          <button
            key={chip}
            onClick={() => send(chip)}
            disabled={!canSend}
            className="text-xs rounded-full px-2.5 py-1 border border-border bg-background text-foreground/80 hover:text-foreground hover:border-[#3a49b8] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {chip}
          </button>
        ))}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-2 bg-background">
        {messages.length === 0 && (
          <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-muted text-foreground text-sm px-3 py-2">
            {WELCOME_MESSAGE}
          </div>
        )}

        {messages.map((message) => {
          const text = message.parts
            .filter((part) => part.type === 'text')
            .map((part) => ('text' in part ? part.text : ''))
            .join('');
          if (!text) return null;
          return message.role === 'user' ? (
            <div key={message.id} className="flex justify-end">
              <div
                className="max-w-[85%] rounded-2xl rounded-br-sm text-white text-sm px-3 py-2 whitespace-pre-wrap"
                style={{ backgroundColor: BRAND_BLUE }}
              >
                {text}
              </div>
            </div>
          ) : (
            <div key={message.id} className="flex justify-start">
              <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-muted text-foreground text-sm px-3 py-2 whitespace-pre-wrap">
                {text}
              </div>
            </div>
          );
        })}

        {status === 'submitted' && (
          <p className="text-muted-foreground text-sm animate-pulse">
            Thinking...
          </p>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Errors */}
      {error && (
        <div className="text-red-500 dark:text-red-400 text-xs px-4 py-1 bg-background">
          {error.message?.toLowerCase().includes('too many') ||
          error.message?.includes('429') ? (
            <p>You&apos;re sending messages too quickly — give it a moment.</p>
          ) : (
            <p>
              Something went wrong. If it keeps happening, email{' '}
              <a className="underline" href={`mailto:${SUPPORT_EMAIL}`}>
                {SUPPORT_EMAIL}
              </a>
              .
            </p>
          )}
        </div>
      )}

      {/* Input */}
      <form
        onSubmit={handleSubmit}
        className="p-3 border-t border-border bg-background flex gap-2"
      >
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about your program..."
          className="flex-1 bg-background border border-input rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-[#3a49b8]"
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
            disabled={!canSend || !input.trim()}
            style={{ backgroundColor: BRAND_BLUE }}
            className="p-2 rounded-lg text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
            aria-label="Send message"
          >
            <Send size={16} />
          </button>
        )}
      </form>

      {/* Footer */}
      <div className="px-3 pb-2 text-center bg-background">
        <a
          href={`mailto:${SUPPORT_EMAIL}`}
          className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
        >
          Urgent? {SUPPORT_EMAIL}
        </a>
      </div>
    </div>
  );
}
