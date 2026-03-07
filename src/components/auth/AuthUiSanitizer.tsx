"use client";

import { useEffect } from "react";

export function AuthUiSanitizer() {
  useEffect(() => {
    const root = document.querySelector(".auth-lockdown");
    if (!root) return;

    const hideUnwanted = () => {
      const elements = root.querySelectorAll<HTMLElement>("a, button");
      for (const el of elements) {
        const text = (el.textContent || "").trim().toLowerCase();
        const href = (el as HTMLAnchorElement).getAttribute?.("href") || "";
        const aria = el.getAttribute("aria-label") || "";
        const provider = el.getAttribute("data-social-provider") || el.getAttribute("data-provider") || "";

        const shouldHide =
          text.includes("sign up") ||
          text.includes("don't have an account") ||
          href.includes("sign-up") ||
          aria.toLowerCase().includes("facebook") ||
          provider.toLowerCase().includes("facebook") ||
          text.includes("facebook");

        if (shouldHide) {
          el.style.setProperty("display", "none", "important");
        }
      }
    };

    hideUnwanted();
    const interval = window.setInterval(hideUnwanted, 400);
    const timeout = window.setTimeout(() => window.clearInterval(interval), 10000);

    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, []);

  return null;
}
