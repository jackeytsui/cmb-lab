'use client';

import { useCallback, useEffect, useState } from 'react';
import { useUser } from '@clerk/nextjs';
import { MessageCircle, X } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { LabAssistantPanel } from './LabAssistantPanel';

// CMB brand blues (same palette as the course map / library header gradient).
const BRAND_BLUE = '#2e3a97';
const BRAND_BLUE_HOVER = '#3a49b8';

export function LabAssistantWidget() {
  const { isSignedIn } = useUser();
  const [isOpen, setIsOpen] = useState(false);
  const [hovered, setHovered] = useState(false);

  const close = useCallback(() => setIsOpen(false), []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && isOpen) close();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, close]);

  // Access is gated server-side in the dashboard layout (staff always,
  // students via whitelist tag); this only guards against signed-out states.
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
            className="absolute bottom-16 right-0 w-[calc(100vw-3rem)] sm:w-[380px] h-[70vh] sm:h-[560px] bg-card text-card-foreground border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col"
          >
            <LabAssistantPanel onClose={close} />
          </motion.div>
        )}
      </AnimatePresence>

      <button
        onClick={() => setIsOpen((prev) => !prev)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{ backgroundColor: hovered ? BRAND_BLUE_HOVER : BRAND_BLUE }}
        className="w-14 h-14 rounded-full text-white shadow-lg flex items-center justify-center transition-colors"
        aria-label={isOpen ? 'Close CMB Lab Assistant' : 'Open CMB Lab Assistant'}
      >
        {isOpen ? <X size={24} /> : <MessageCircle size={24} />}
      </button>
    </div>
  );
}
