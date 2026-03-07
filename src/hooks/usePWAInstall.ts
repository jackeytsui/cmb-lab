"use client";

import { useState, useEffect, useCallback } from "react";

/**
 * BeforeInstallPromptEvent is fired by Chromium browsers when the PWA
 * install criteria are met. Not available in Safari/Firefox.
 */
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
  prompt(): Promise<void>;
}

interface UsePWAInstallReturn {
  /** Whether the native install prompt can be triggered (Chromium only) */
  canPrompt: boolean;
  /** Whether the app is already installed (standalone mode) */
  isInstalled: boolean;
  /** Whether the device is running iOS (needs manual install instructions) */
  isIOS: boolean;
  /** Trigger the native browser install dialog (Chromium only) */
  triggerInstall: () => Promise<void>;
}

/**
 * Hook for managing PWA installation flow.
 *
 * - Captures the `beforeinstallprompt` event (Chromium browsers)
 * - Detects iOS for manual "Add to Home Screen" instructions
 * - Detects if app is already installed via display-mode: standalone
 * - Provides triggerInstall to show the native install dialog
 */
export function usePWAInstall(): UsePWAInstallReturn {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    // Check if app is already installed (standalone mode)
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      // Safari on iOS sets navigator.standalone when launched from home screen
      ("standalone" in navigator && (navigator as Record<string, unknown>).standalone === true);

    if (isStandalone) {
      // Synchronous detection of standalone mode -- intentional setState in effect
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsInstalled(true);
      return; // No need to listen for install prompt if already installed
    }

    // Detect iOS devices
    const iosDetected =
      /iPad|iPhone|iPod/.test(navigator.userAgent) &&
      !("MSStream" in window);
    setIsIOS(iosDetected);

    // Listen for the beforeinstallprompt event (Chromium browsers only)
    function handleBeforeInstallPrompt(e: Event) {
      e.preventDefault(); // Prevent the mini-infobar from appearing
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    // Listen for successful installation
    function handleAppInstalled() {
      setIsInstalled(true);
      setDeferredPrompt(null);
    }

    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const triggerInstall = useCallback(async () => {
    if (!deferredPrompt) return;

    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === "accepted") {
      setIsInstalled(true);
    }

    // Prompt can only be used once
    setDeferredPrompt(null);
  }, [deferredPrompt]);

  return {
    canPrompt: deferredPrompt !== null,
    isInstalled,
    isIOS,
    triggerInstall,
  };
}
