'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useUser } from '@clerk/nextjs';
import { MessageCircle, X } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { LabAssistantPanel } from './LabAssistantPanel';
import type { Roles } from '@/types/globals';

export function LabAssistantWidget({ role }: { role: Roles }) {
  const { isSignedIn } = useUser();
  const [isOpen, setIsOpen] = useState(false);
  const launcherRef = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => {
    setIsOpen(false);
    requestAnimationFrame(() => launcherRef.current?.focus());
  }, []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && isOpen) close();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, close]);

  // The dashboard renders support for every active user. Keep this client-side
  // guard for the brief signed-out/hydration state only.
  if (!isSignedIn) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-50">
      <AnimatePresence>
        {isOpen && (
          <motion.div
            id="lab-assistant-dialog"
            role="dialog"
            aria-modal="false"
            aria-labelledby="lab-assistant-title"
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ duration: 0.18 }}
            className="pointer-events-auto fixed bottom-2 right-2 flex h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] flex-col overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-2xl sm:bottom-6 sm:right-6 sm:h-[min(680px,calc(100dvh-3rem))] sm:w-[420px]"
          >
            <LabAssistantPanel onClose={close} role={role} />
          </motion.div>
        )}
      </AnimatePresence>

      <button
        ref={launcherRef}
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={`pointer-events-auto fixed bottom-4 right-4 flex size-14 items-center justify-center rounded-full bg-[#2e3a97] text-white shadow-lg transition-all hover:bg-[#3a49b8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3a49b8]/50 focus-visible:ring-offset-2 sm:bottom-6 sm:right-6 ${
          isOpen ? 'pointer-events-none scale-75 opacity-0' : 'scale-100 opacity-100'
        }`}
        aria-label={isOpen ? 'Close CMB Lab Assistant' : 'Open CMB Lab Assistant'}
        aria-expanded={isOpen}
        aria-controls="lab-assistant-dialog"
        aria-haspopup="dialog"
      >
        {isOpen ? <X size={24} /> : <MessageCircle size={24} />}
      </button>
    </div>
  );
}
