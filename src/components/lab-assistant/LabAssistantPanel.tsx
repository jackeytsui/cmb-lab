'use client';

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import { Bug, CheckCircle2, Lightbulb, MessageSquarePlus, Send, Square, Star, X } from 'lucide-react';
import { useLabAssistant } from '@/hooks/useLabAssistant';

const SUPPORT_EMAIL = 'contact@thecmblueprint.com';

// CMB brand blue — matches the launcher and the course library header.
const BRAND_BLUE = '#2e3a97';

// One starter per launch-scope intent. They live in the scrollable conversation
// so the actual conversation always gets the available height.
const FAQ_CHIPS = [
  'When does my program start?',
  'When does my program end?',
  "Who's my coach?",
  'How do referrals work?',
  'Book a testimonial with Sheldon',
];

const WELCOME_MESSAGE =
  "Hi! I can help with your program dates, coaching, referrals, and finding your way around CMB Lab. Choose a common question or write your own.";

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
  const { messages, sendMessage, status, error, clearError, stop } =
    useLabAssistant();
  const [input, setInput] = useState('');
  const [feedbackMode, setFeedbackMode] = useState<FeedbackMode | null>(null);
  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackState, setFeedbackState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [feedbackReference, setFeedbackReference] = useState('');
  const [ratingPrompt, setRatingPrompt] = useState<{ title: string; href: string } | null>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const container = messagesRef.current;
    if (!container) return;

    const frame = requestAnimationFrame(() => {
      container.scrollTo({
        top: container.scrollHeight,
        behavior: messages.length > 1 ? 'smooth' : 'auto',
      });
    });

    return () => cancelAnimationFrame(frame);
  }, [messages, status]);

  useEffect(() => {
    // Move keyboard focus into the newly opened dialog without summoning the
    // on-screen keyboard on phones.
    closeButtonRef.current?.focus();
  }, []);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 112)}px`;
  }, [input]);

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
    if (!trimmed || !canSend) return false;
    clearError();
    sendMessage(
      { text: trimmed },
      { body: { pagePath: window.location.pathname + window.location.search } },
    );
    return true;
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
    if (send(input)) setInput('');
  }

  function handleInputKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (
      e.key === 'Enter' &&
      !e.shiftKey &&
      !e.nativeEvent.isComposing
    ) {
      e.preventDefault();
      if (send(input)) setInput('');
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {/* Compact header keeps the conversation primary. */}
      <div
        className="shrink-0 border-b border-white/10 px-4 py-3"
        style={{ backgroundColor: BRAND_BLUE }}
      >
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 id="lab-assistant-title" className="truncate text-base font-semibold text-white">
                CMB Lab Assistant
              </h3>
              <span className="rounded-md border border-amber-300/40 bg-amber-400/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-200">
                Beta
              </span>
            </div>
            <p className="mt-0.5 truncate text-xs text-white/70">
              Answers, guidance, and a direct line to our team
            </p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="ml-3 inline-flex size-10 shrink-0 items-center justify-center rounded-full text-white/75 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
            aria-label="Close assistant"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      <div className="shrink-0 border-b border-amber-500/25 bg-amber-50 px-4 py-2 text-xs leading-5 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
        AI can make mistakes. For urgent or personal help,{' '}
        <a href={`mailto:${SUPPORT_EMAIL}`} className="font-semibold underline underline-offset-2">
          email our team
        </a>
        .
      </div>

      {/* Messages */}
      <div
        ref={messagesRef}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-background px-4 py-4"
      >
        {messages.length === 0 && (
          <div className="space-y-5">
            <div className="max-w-[92%] rounded-2xl rounded-bl-md bg-muted px-3.5 py-3 text-sm leading-6 text-foreground">
              {WELCOME_MESSAGE}
            </div>

            <section aria-labelledby="popular-questions-heading">
              <p id="popular-questions-heading" className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Popular questions
              </p>
              <div className="flex flex-wrap gap-2">
                {FAQ_CHIPS.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => send(chip)}
                    disabled={!canSend}
                    className="min-h-10 rounded-full border border-border bg-background px-3 py-2 text-left text-xs font-medium text-foreground/85 transition-colors hover:border-[#3a49b8] hover:bg-[#3a49b8]/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3a49b8]/50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {chip}
                  </button>
                ))}
              </div>
            </section>

            <section aria-labelledby="feedback-actions-heading" className="rounded-xl border border-border bg-muted/20 p-3">
              <div className="mb-2.5">
                <p id="feedback-actions-heading" className="text-sm font-semibold text-foreground">
                  Need to reach our team?
                </p>
                <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                  Send feedback directly. We’ll include the page you’re viewing.
                </p>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {FEEDBACK_ACTIONS.map(({ mode, label, icon: Icon }) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => {
                      setFeedbackMode(mode);
                      setFeedbackState('idle');
                      setFeedbackReference('');
                    }}
                    className="flex min-h-16 flex-col items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-1.5 py-2 text-center text-[11px] font-semibold leading-4 text-foreground transition-colors hover:border-[#3a49b8] hover:bg-[#3a49b8]/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3a49b8]/50"
                  >
                    <Icon aria-hidden="true" className="size-4 text-[#3a49b8]" />
                    {label}
                  </button>
                ))}
              </div>
            </section>
          </div>
        )}

        <div
          role="log"
          aria-live="polite"
          aria-relevant="additions text"
          aria-label="Conversation"
          className={messages.length === 0 ? '' : 'space-y-3'}
        >
          {messages.map((message) => {
            const text = message.parts
              .filter((part) => part.type === 'text')
              .map((part) => ('text' in part ? part.text : ''))
              .join('');
            if (!text) return null;
            return message.role === 'user' ? (
              <div key={message.id} className="flex justify-end">
                <div
                  className="max-w-[88%] whitespace-pre-wrap rounded-2xl rounded-br-md px-3.5 py-2.5 text-sm leading-6 text-white"
                  style={{ backgroundColor: BRAND_BLUE }}
                >
                  {text}
                </div>
              </div>
            ) : (
              <div key={message.id} className="flex justify-start">
                <div className="max-w-[92%] whitespace-pre-wrap rounded-2xl rounded-bl-md bg-muted px-3.5 py-2.5 text-sm leading-6 text-foreground">
                  {text}
                </div>
              </div>
            );
          })}

          {status === 'submitted' && (
            <p className="animate-pulse text-sm text-muted-foreground">
              Thinking...
            </p>
          )}
        </div>

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

      </div>

      {feedbackMode && (
        <form onSubmit={submitFeedback} className="max-h-[58%] shrink-0 overflow-y-auto border-t border-border bg-muted/30 p-4">
          {feedbackState === 'sent' ? (
            <div role="status" className="flex items-start gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
              <div className="flex-1">
                <p className="font-semibold">Thank you — it’s in the product queue.</p>
                <p className="mt-0.5 text-xs">Reference: {feedbackReference}</p>
              </div>
              <button type="button" onClick={() => setFeedbackMode(null)} className="inline-flex size-8 items-center justify-center rounded-full hover:bg-emerald-500/10" aria-label="Close feedback form"><X className="size-4" /></button>
            </div>
          ) : (
            <>
              <div className="mb-2 flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-foreground">Send feedback to our team</p>
                  <label htmlFor="beta-feedback" className="mt-0.5 block text-xs leading-5 text-muted-foreground">{FEEDBACK_PROMPTS[feedbackMode]}</label>
                </div>
                <button type="button" onClick={() => setFeedbackMode(null)} className="inline-flex size-9 shrink-0 items-center justify-center rounded-full hover:bg-muted" aria-label="Cancel feedback"><X className="size-4 text-muted-foreground" /></button>
              </div>
              <textarea
                id="beta-feedback"
                value={feedbackText}
                onChange={(e) => setFeedbackText(e.target.value)}
                rows={4}
                maxLength={4000}
                autoFocus
                placeholder="Include as much detail as you can…"
                className="w-full resize-none rounded-xl border border-input bg-background px-3 py-2.5 text-sm leading-6 text-foreground focus:outline-none focus:ring-2 focus:ring-[#3a49b8]/50"
              />
              {feedbackState === 'error' && <p role="alert" className="mt-1 text-xs text-red-500">Couldn’t save that. Please try again.</p>}
              <button type="submit" disabled={feedbackState === 'sending' || feedbackText.trim().length < 5} className="mt-2 min-h-11 w-full rounded-xl bg-[#2e3a97] px-3 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50">
                {feedbackState === 'sending' ? 'Sending…' : 'Send to the product team'}
              </button>
              <p className="mt-1.5 text-center text-[11px] text-muted-foreground">We automatically include the page you’re viewing.</p>
            </>
          )}
        </form>
      )}

      {/* Errors */}
      {error && (
        <div role="alert" className="shrink-0 border-t border-red-500/20 bg-red-50 px-4 py-2 text-xs text-red-700 dark:bg-red-950/20 dark:text-red-300">
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
      {!feedbackMode && (
        <div className="shrink-0 border-t border-border bg-background px-3 pb-3 pt-3">
          <form onSubmit={handleSubmit} className="flex items-end gap-2">
            <label htmlFor="lab-assistant-input" className="sr-only">Ask CMB Lab Assistant</label>
            <textarea
              ref={inputRef}
              id="lab-assistant-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleInputKeyDown}
              rows={1}
              maxLength={4000}
              placeholder="Ask anything about CMB Lab…"
              className="max-h-28 min-h-12 flex-1 resize-none overflow-y-auto rounded-xl border border-input bg-background px-3.5 py-3 text-sm leading-6 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#3a49b8]/50"
            />
            {isStreaming ? (
              <button
                type="button"
                onClick={() => stop()}
                className="inline-flex size-12 shrink-0 items-center justify-center rounded-xl bg-red-600 text-white transition-colors hover:bg-red-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/50"
                aria-label="Stop generating"
              >
                <Square size={17} />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!canSend || !input.trim()}
                style={{ backgroundColor: BRAND_BLUE }}
                className="inline-flex size-12 shrink-0 items-center justify-center rounded-xl text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3a49b8]/50 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Send message"
              >
                <Send size={18} />
              </button>
            )}
          </form>
          <div className="mt-2 flex items-center justify-between gap-3 px-0.5 text-[11px] text-muted-foreground">
            <span className="hidden sm:inline">Enter to send · Shift + Enter for a new line</span>
            <button
              type="button"
              onClick={() => {
                setFeedbackMode('general');
                setFeedbackState('idle');
                setFeedbackReference('');
              }}
              className="ml-auto font-medium underline-offset-2 hover:text-foreground hover:underline"
            >
              Share feedback
            </button>
            <span aria-hidden="true">·</span>
            <a href={`mailto:${SUPPORT_EMAIL}`} className="font-medium underline-offset-2 hover:text-foreground hover:underline">
              Contact a person
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
