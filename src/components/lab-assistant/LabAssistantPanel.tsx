'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useUser } from '@clerk/nextjs';
import { Bug, CheckCircle2, Lightbulb, MessageSquarePlus, Send, Square, Star, X } from 'lucide-react';
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
  "Hi! I'm the CMB Lab Assistant. Ask me about your program, coaching, or referrals — and while CMB Lab is in beta, please use the buttons below whenever you spot a bug or have an idea.";

type FeedbackMode = 'bug' | 'feature_request' | 'general';

const FEEDBACK_ACTIONS = [
  { mode: 'bug' as const, label: 'Report a bug', icon: Bug },
  { mode: 'feature_request' as const, label: 'Suggest an idea', icon: Lightbulb },
  { mode: 'general' as const, label: 'Share feedback', icon: MessageSquarePlus },
];

const FEEDBACK_PROMPTS: Record<FeedbackMode, string> = {
  bug: 'What happened, and what did you expect instead?',
  feature_request: 'What would you like CMB Lab to do, and how would it help?',
  general: 'What would you like us to know about your experience?',
};

interface LabAssistantPanelProps {
  onClose: () => void;
}

export function LabAssistantPanel({ onClose }: LabAssistantPanelProps) {
  const { user } = useUser();
  const { messages, sendMessage, status, error, clearError, stop } =
    useLabAssistant();
  const [input, setInput] = useState('');
  const [feedbackMode, setFeedbackMode] = useState<FeedbackMode | null>(null);
  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackState, setFeedbackState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [feedbackReference, setFeedbackReference] = useState('');
  const [ratingPrompt, setRatingPrompt] = useState<{ title: string; href: string } | null>(null);
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

  useEffect(() => {
    const storageKey = 'cmb-session-rating-prompted-at';
    const lastPromptedAt = Number(window.localStorage.getItem(storageKey) || 0);
    const fourteenDays = 14 * 24 * 60 * 60 * 1000;
    if (Date.now() - lastPromptedAt < fourteenDays) return;
    fetch('/api/coaching/rating-prompt')
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!data?.prompt) return;
        setRatingPrompt(data.prompt);
        window.localStorage.setItem(storageKey, String(Date.now()));
      })
      .catch(() => {});
  }, []);

  const isStreaming = status === 'streaming';
  // 'error' stays sendable so the student can retry after a failed request.
  const canSend = status === 'ready' || status === 'error';

  function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || !canSend) return;
    clearError();
    sendMessage(
      { text: trimmed },
      { body: { pagePath: window.location.pathname + window.location.search } },
    );
  }

  async function submitFeedback(e: FormEvent) {
    e.preventDefault();
    if (!feedbackMode || feedbackText.trim().length < 5) return;
    setFeedbackState('sending');
    try {
      const response = await fetch('/api/beta-feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: feedbackMode,
          message: feedbackText.trim(),
          pagePath: window.location.pathname + window.location.search,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || 'Could not save feedback');
      setFeedbackReference(data.reference || data.id?.slice(0, 8) || 'saved');
      setFeedbackState('sent');
      setFeedbackText('');
    } catch {
      setFeedbackState('error');
    }
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

      {/* Beta notice — visible every time the panel opens */}
      <div className="px-3 py-1.5 border-b border-amber-500/30 bg-amber-500/10 text-[11px] text-amber-700 dark:text-amber-400">
        This assistant is in beta and may make mistakes. Urgent?{' '}
        <a href={`mailto:${SUPPORT_EMAIL}`} className="underline font-medium">
          {SUPPORT_EMAIL}
        </a>{' '}
        gets you the best support.
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

      <div className="border-b border-border bg-background px-3 py-2">
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Help shape the beta
        </p>
        <div className="grid grid-cols-3 gap-1.5">
          {FEEDBACK_ACTIONS.map(({ mode, label, icon: Icon }) => (
            <button
              key={mode}
              type="button"
              onClick={() => {
                setFeedbackMode(mode);
                setFeedbackState('idle');
                setFeedbackReference('');
              }}
              className="flex min-h-14 flex-col items-center justify-center gap-1 rounded-lg border border-border bg-muted/30 px-1.5 py-2 text-[11px] font-medium text-foreground transition-colors hover:border-[#3a49b8] hover:bg-[#3a49b8]/5"
            >
              <Icon className="size-4 text-[#3a49b8]" />
              {label}
            </button>
          ))}
        </div>
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

        {ratingPrompt && (
          <div className="rounded-xl border border-amber-400/40 bg-amber-50 p-3 text-sm text-amber-950 dark:bg-amber-950/25 dark:text-amber-100">
            <div className="flex items-start gap-2">
              <Star className="mt-0.5 size-4 shrink-0 fill-amber-400 text-amber-500" />
              <div>
                <p className="font-medium">How was {ratingPrompt.title}?</p>
                <p className="mt-0.5 text-xs opacity-80">A quick rating helps us improve coaching.</p>
                <a href={ratingPrompt.href} className="mt-2 inline-block text-xs font-semibold underline">
                  Rate this session
                </a>
              </div>
              <button type="button" onClick={() => setRatingPrompt(null)} className="ml-auto opacity-60 hover:opacity-100" aria-label="Dismiss rating prompt">
                <X className="size-3.5" />
              </button>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {feedbackMode && (
        <form onSubmit={submitFeedback} className="border-t border-border bg-muted/30 p-3">
          {feedbackState === 'sent' ? (
            <div className="flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2.5 text-xs text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
              <div className="flex-1">
                <p className="font-semibold">Thank you — it’s in the product queue.</p>
                <p>Reference: {feedbackReference}</p>
              </div>
              <button type="button" onClick={() => setFeedbackMode(null)} aria-label="Close feedback form"><X className="size-4" /></button>
            </div>
          ) : (
            <>
              <div className="mb-2 flex items-center justify-between gap-2">
                <label htmlFor="beta-feedback" className="text-xs font-semibold text-foreground">{FEEDBACK_PROMPTS[feedbackMode]}</label>
                <button type="button" onClick={() => setFeedbackMode(null)} aria-label="Cancel feedback"><X className="size-4 text-muted-foreground" /></button>
              </div>
              <textarea
                id="beta-feedback"
                value={feedbackText}
                onChange={(e) => setFeedbackText(e.target.value)}
                rows={3}
                maxLength={4000}
                autoFocus
                placeholder="Include as much detail as you can…"
                className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-[#3a49b8]"
              />
              {feedbackState === 'error' && <p className="mt-1 text-xs text-red-500">Couldn’t save that. Please try again.</p>}
              <button type="submit" disabled={feedbackState === 'sending' || feedbackText.trim().length < 5} className="mt-2 w-full rounded-lg bg-[#2e3a97] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">
                {feedbackState === 'sending' ? 'Sending…' : 'Send to the product team'}
              </button>
              <p className="mt-1 text-center text-[10px] text-muted-foreground">We automatically include the page you’re viewing.</p>
            </>
          )}
        </form>
      )}

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
          placeholder="Ask a question or share feedback..."
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
