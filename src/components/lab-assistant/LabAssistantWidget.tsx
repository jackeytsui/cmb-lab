'use client';

import { useCallback, useEffect, useState } from 'react';
import { useUser } from '@clerk/nextjs';
import { LifeBuoy, X } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { LabAssistantPanel } from './LabAssistantPanel';

interface LabAssistantWidgetProps {
  /** Shift the launcher up when the learning-assistant widget also renders bottom-right. */
  raised?: boolean;
}

export function LabAssistantWidget({ raised = false }: LabAssistantWidgetProps) {
  const { isSignedIn } = useUser();
  const [isOpen, setIsOpen] = useState(false);

  const close = useCallback(() => setIsOpen(false), []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && isOpen) close();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, close]);

  // Student is always logged in when using CMB Lab; hide otherwise.
  if (!isSignedIn) return null;

  return (
    <div
      className={`fixed right-6 z-50 ${raised ? 'bottom-24' : 'bottom-6'}`}
    >
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="absolute bottom-16 right-0 w-[calc(100vw-3rem)] sm:w-[380px] h-[70vh] sm:h-[560px] bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
          >
            <LabAssistantPanel onClose={close} />
          </motion.div>
        )}
      </AnimatePresence>

      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className="w-14 h-14 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg flex items-center justify-center transition-colors"
        aria-label={isOpen ? 'Close CMB Lab Assistant' : 'Open CMB Lab Assistant'}
      >
        {isOpen ? <X size={24} /> : <LifeBuoy size={24} />}
      </button>
    </div>
  );
}
