'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useUser } from '@clerk/nextjs';
import { usePathname } from 'next/navigation';
import { MessageCircle, X } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChatPanel } from './ChatPanel';

export function ChatWidget() {
  const { isSignedIn } = useUser();
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  // Detect current lesson from pathname (e.g., /lessons/uuid-here/...)
  const lessonMatch = pathname?.match(/^\/lessons\/([a-f0-9-]+)/);
  const currentLessonId = lessonMatch?.[1] ?? null;

  // Conversation persistence state
  const [chatId, setChatId] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [initialMessages, setInitialMessages] = useState<any[] | undefined>(undefined);
  const [conversationsLoaded, setConversationsLoaded] = useState(false);

  // Track previous lesson to detect navigation between lessons
  const previousLessonIdRef = useRef<string | null>(null);

  const close = useCallback(() => setIsOpen(false), []);

  // Start a new conversation
  const handleNewConversation = useCallback(() => {
    setChatId(crypto.randomUUID());
    setInitialMessages(undefined);
    setConversationsLoaded(false);
  }, []);

  // Switch to an existing conversation
  const handleSelectConversation = useCallback(async (conversationId: string) => {
    setChatId(conversationId);
    try {
      const res = await fetch(`/api/chat/${conversationId}`);
      if (res.ok) {
        const data = await res.json();
        setInitialMessages(data.messages);
      } else {
        setInitialMessages(undefined);
      }
    } catch {
      setInitialMessages(undefined);
    }
  }, []);

  // When panel opens, fetch the most recent conversation (filtered by lesson if on a lesson page)
  useEffect(() => {
    if (!isOpen || conversationsLoaded) return;

    async function loadRecentConversation() {
      try {
        const url = currentLessonId
          ? `/api/chat/conversations?lessonId=${currentLessonId}`
          : '/api/chat/conversations';
        const res = await fetch(url);
        if (!res.ok) {
          setChatId(crypto.randomUUID());
          setConversationsLoaded(true);
          return;
        }
        const convs = await res.json();
        if (convs.length > 0) {
          const recent = convs[0];
          setChatId(recent.id);
          // Load messages for this conversation
          const msgRes = await fetch(`/api/chat/${recent.id}`);
          if (msgRes.ok) {
            const data = await msgRes.json();
            setInitialMessages(data.messages);
          }
        } else {
          // No existing conversations -- generate new chat ID
          setChatId(crypto.randomUUID());
        }
      } catch {
        setChatId(crypto.randomUUID());
      }
      setConversationsLoaded(true);
    }

    loadRecentConversation();
  }, [isOpen, conversationsLoaded, currentLessonId]);

  // Detect lesson navigation -- auto-start new conversation when lesson changes
  useEffect(() => {
    if (currentLessonId && currentLessonId !== previousLessonIdRef.current) {
      // Lesson changed -- if chatbot is open, start a new conversation for this lesson
      if (isOpen && previousLessonIdRef.current !== null) {
        // Intentional: respond to lesson navigation by starting fresh conversation
        // eslint-disable-next-line react-hooks/set-state-in-effect
        handleNewConversation();
      }
      previousLessonIdRef.current = currentLessonId;
    } else if (!currentLessonId) {
      previousLessonIdRef.current = null;
    }
  }, [currentLessonId, isOpen, handleNewConversation]);

  // Reset conversation loading when lesson changes so re-opening loads fresh
  useEffect(() => {
    // Intentional: clear cache when lesson context changes
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setConversationsLoaded(false);
  }, [currentLessonId]);

  // Close panel on Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && isOpen) {
        close();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, close]);

  if (!isSignedIn) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50">
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="absolute bottom-16 right-0 w-[calc(100vw-3rem)] sm:w-[380px] h-[70vh] sm:h-[520px] bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
          >
            <ChatPanel
              key={chatId ?? 'loading'}
              onClose={close}
              chatId={chatId}
              lessonId={currentLessonId}
              initialMessages={initialMessages}
              onNewConversation={handleNewConversation}
              onSelectConversation={handleSelectConversation}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className="w-14 h-14 rounded-full bg-cyan-600 hover:bg-cyan-500 text-white shadow-lg flex items-center justify-center transition-colors"
        aria-label={isOpen ? 'Close chat assistant' : 'Open chat assistant'}
      >
        {isOpen ? <X size={24} /> : <MessageCircle size={24} />}
      </button>
    </div>
  );
}
