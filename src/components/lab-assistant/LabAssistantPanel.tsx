'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useUser } from '@clerk/nextjs';
import { Send, Square, X } from 'lucide-react';
import { useLabAssistant } from '@/hooks/useLabAssistant';

const SUPPORT_EMAIL = 'contact@thecmblueprint.com';

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
      {/* Header: title + BETA badge + signed-in email */}
      <div className="px-4 py-3 bg-zinc-900/80 backdrop-blur-sm border-b border-zinc-700/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-white text-sm">
              CMB Lab Assistant
            </h3>
            <span className="text-[10px] font-bold uppercase tracking-wide bg-amber-500/20 text-amber-400 border border-amber-500/40 rounded px-1.5 py-0.5">
              Beta
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-white transition-colors rounded"
            aria-label="Close assistant"
          >
            <X size={16} />
          </button>
        </div>
        {email && (
          <p className="text-xs text-zinc-400 mt-0.5 truncate">
            Signed in as {email}
          </p>
        )}
      </div>

      {/* FAQ chips pinned at top */}
      <div className="px-3 py-2 border-b border-zinc-800 flex flex-wrap gap-1.5">
        {FAQ_CHIPS.map((chip) => (
          <button
            key={chip}
            onClick={() => send(chip)}
            disabled={!canSend}
            className="text-xs text-cyan-300 bg-cyan-950/60 hover:bg-cyan-900/60 border border-cyan-800/60 rounded-full px-2.5 py-1 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {chip}
          </button>
        ))}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-2">
        {messages.length === 0 && (
          <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-zinc-800 text-zinc-100 text-sm px-3 py-2">
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
              <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-cyan-600 text-white text-sm px-3 py-2 whitespace-pre-wrap">
                {text}
              </div>
            </div>
          ) : (
            <div key={message.id} className="flex justify-start">
              <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-zinc-800 text-zinc-100 text-sm px-3 py-2 whitespace-pre-wrap">
                {text}
              </div>
            </div>
          );
        })}

        {status === 'submitted' && (
          <p className="text-zinc-400 text-sm animate-pulse">Thinking...</p>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Errors */}
      {error && (
        <div className="text-red-400 text-xs px-4 py-1">
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
        className="p-3 border-t border-zinc-800 flex gap-2"
      >
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about your program..."
          className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
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
            className="p-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            aria-label="Send message"
          >
            <Send size={16} />
          </button>
        )}
      </form>

      {/* Footer */}
      <div className="px-3 pb-2 text-center">
        <a
          href={`mailto:${SUPPORT_EMAIL}`}
          className="text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          Urgent? {SUPPORT_EMAIL}
        </a>
      </div>
    </div>
  );
}
