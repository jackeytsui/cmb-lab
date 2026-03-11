"use client";

import { useState, useEffect, useCallback } from "react";
import { X, Download, Share } from "lucide-react";
import { usePWAInstall } from "@/hooks/usePWAInstall";

const DISMISSED_KEY = "pwa-install-dismissed";

/**
 * Deferred PWA install prompt component.
 *
 * Behavior:
 * - Does NOT appear on page load
 * - Appears only after receiving a "pwa-first-lesson-complete" CustomEvent
 * - On Chromium: shows install button that triggers native browser dialog
 * - On iOS: shows manual "Add to Home Screen" instructions
 * - If already installed or previously dismissed: never renders
 */
export function InstallPrompt() {
  const { canPrompt, isInstalled, isIOS, triggerInstall } = usePWAInstall();
  const [showPrompt, setShowPrompt] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // Check if previously dismissed -- hydration from localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      const wasDismissed = localStorage.getItem(DISMISSED_KEY);
      if (wasDismissed) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setDismissed(true);
      }
    }
  }, []);

  // Listen for first lesson completion event
  useEffect(() => {
    function handleFirstLessonComplete() {
      setShowPrompt(true);
    }

    window.addEventListener("pwa-first-lesson-complete", handleFirstLessonComplete);
    return () => {
      window.removeEventListener("pwa-first-lesson-complete", handleFirstLessonComplete);
    };
  }, []);

  const handleDismiss = useCallback(() => {
    setDismissed(true);
    setShowPrompt(false);
    if (typeof window !== "undefined") {
      localStorage.setItem(DISMISSED_KEY, "true");
    }
  }, []);

  const handleInstall = useCallback(async () => {
    await triggerInstall();
    setShowPrompt(false);
  }, [triggerInstall]);

  // Don't render if: already installed, dismissed, not triggered, or unsupported browser
  if (isInstalled || dismissed || !showPrompt) return null;
  if (!canPrompt && !isIOS) return null;

  // iOS: show manual instructions
  if (isIOS) {
    return (
      <div className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-md animate-in slide-in-from-bottom-4 duration-300">
        <div className="bg-gray-900 border border-gray-800 rounded-lg shadow-xl p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 mt-0.5 rounded-lg bg-indigo-600/20 p-2">
                <Share className="h-5 w-5 text-indigo-400" />
              </div>
              <div>
                <h3 className="font-semibold text-white text-sm">
                  Install Canto to Mando
                </h3>
                <p className="text-gray-400 text-xs mt-1 leading-relaxed">
                  Tap the{" "}
                  <span className="inline-flex items-center">
                    <Share className="h-3 w-3 mx-0.5 text-indigo-400" />
                  </span>{" "}
                  Share button in Safari, then tap{" "}
                  <strong className="text-gray-300">&quot;Add to Home Screen&quot;</strong>
                </p>
              </div>
            </div>
            <button
              onClick={handleDismiss}
              className="flex-shrink-0 text-gray-500 hover:text-gray-300 transition-colors"
              aria-label="Dismiss install prompt"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Chromium: show install button
  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-md animate-in slide-in-from-bottom-4 duration-300">
      <div className="bg-gray-900 border border-gray-800 rounded-lg shadow-xl p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 mt-0.5 rounded-lg bg-indigo-600/20 p-2">
              <Download className="h-5 w-5 text-indigo-400" />
            </div>
            <div>
              <h3 className="font-semibold text-white text-sm">
                Install Canto to Mando
              </h3>
              <p className="text-gray-400 text-xs mt-1">
                Get quick access from your home screen
              </p>
            </div>
          </div>
          <button
            onClick={handleDismiss}
            className="flex-shrink-0 text-gray-500 hover:text-gray-300 transition-colors"
            aria-label="Dismiss install prompt"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex items-center justify-end gap-3 mt-3 pt-3 border-t border-gray-800">
          <button
            onClick={handleDismiss}
            className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
          >
            Not now
          </button>
          <button
            onClick={handleInstall}
            className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium px-4 py-1.5 rounded-md transition-colors"
          >
            Install
          </button>
        </div>
      </div>
    </div>
  );
}
